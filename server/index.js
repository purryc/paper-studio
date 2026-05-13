import Fastify from 'fastify';
import multipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import { createReadStream, createWriteStream } from 'node:fs';
import { copyFile, mkdir, readFile, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { checkTools, listAvfoundationCameras, resolveCommand, resolvePythonWithCv2 } from './preflight.js';
import { modelCatalog } from './models.js';
import {
  capturePath,
  createStorage,
  dataUrl,
  ensureStorage,
  newId,
  transcriptPath,
  writeJson,
} from './storage.js';
import { transcribeAudio } from './transcribe.js';
import { confirmJob, createDraftJob, readJob } from './jobs.js';
import { buildUploadedSourceManifest, SUPPORTED_SOURCE_EXTENSIONS } from './sources.js';

const execFileAsync = promisify(execFile);
const __filename = fileURLToPath(import.meta.url);
const projectRoot = path.resolve(path.dirname(__filename), '..');
const activeCameraStreams = new Map();
const activeFrameCaptures = new Map();
const SERVER_CAMERA_RELEASE_DELAY_MS = 500;

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function stopActiveCameraStream(label) {
  const active = activeCameraStreams.get(label);
  if (!active) return;
  activeCameraStreams.delete(label);
  if (!active.killed) active.kill('SIGKILL');
}

function stopAllActiveCameraStreams() {
  for (const label of activeCameraStreams.keys()) {
    stopActiveCameraStream(label);
  }
}

function safeKind(value) {
  if (value === 'desk-view' || value === 'camera' || value === 'upload') return value;
  return 'upload';
}

function safeRelativePath(value) {
  const normalized = path
    .normalize(String(value || 'untitled').replaceAll('\\', '/'))
    .replace(/^(\.\.(\/|\\|$))+/, '')
    .replace(/^\/+/, '');
  const clean = normalized
    .split(path.sep)
    .filter((part) => part && part !== '.' && part !== '..')
    .join(path.sep);
  return clean || 'untitled';
}

function attachmentHeader(filename) {
  const asciiName = filename.replace(/[^\x20-\x7e]/g, '_').replaceAll('"', '');
  return `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

function safeDataFile(storage, filePath) {
  if (!filePath) throw new Error('Download file is not available yet.');
  const resolved = path.resolve(filePath);
  const dataRoot = path.resolve(storage.dataDir);
  if (resolved !== dataRoot && !resolved.startsWith(`${dataRoot}${path.sep}`)) {
    throw new Error('Download path is outside the Paper Studio data folder.');
  }
  return resolved;
}

async function uniqueDownloadPath(filename) {
  const downloadsDir = path.join(os.homedir(), 'Downloads');
  await mkdir(downloadsDir, { recursive: true });
  const parsed = path.parse(filename);
  let targetPath = path.join(downloadsDir, filename);
  let index = 1;
  while (true) {
    try {
      await stat(targetPath);
      targetPath = path.join(downloadsDir, `${parsed.name} (${index})${parsed.ext}`);
      index += 1;
    } catch (error) {
      if (error.code === 'ENOENT') return targetPath;
      throw error;
    }
  }
}

function deckDownloadAsset(job, asset) {
  if (!job.deck) throw new Error('This job has no deck output.');
  if (asset === 'slides' || asset === 'slides.md') {
    return {
      filePath: job.deck.slidesPath,
      filename: 'slides.md',
      type: 'text/markdown; charset=utf-8',
    };
  }
  if (asset === 'pptx' || asset === 'editable-flowchart.pptx' || asset === 'deck.pptx') {
    return {
      filePath: job.deck.pptxPath,
      filename:
        job.deck.output === 'flowchart-page'
          ? 'editable-flowchart.pptx'
          : 'deck.pptx',
      type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    };
  }
  if (asset === 'slidev-pptx' || asset === 'slidev-export.pptx') {
    return {
      filePath: job.deck.slidevPptxPath,
      filename: 'slidev-export.pptx',
      type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    };
  }
  if (asset === 'mermaid' || asset === 'diagram.mmd') {
    return {
      filePath: job.deck.mermaidPath,
      filename: 'diagram.mmd',
      type: 'text/plain; charset=utf-8',
    };
  }
  throw new Error('Unknown deck download asset.');
}

function selectAvfoundationCamera(cameras, { deviceIndex, deviceLabel } = {}) {
  const requestedIndex = Number(deviceIndex);
  const requestedLabel = String(deviceLabel || '').trim();
  return (
    cameras.find((camera) => requestedLabel && camera.label === requestedLabel) ||
    cameras.find((camera) => Number.isFinite(requestedIndex) && camera.index === requestedIndex) ||
    cameras.find((camera) => /desk view/i.test(camera.label)) ||
    cameras.find((camera) => /iphone/i.test(camera.label)) ||
    cameras[0]
  );
}

async function collectMultipart(request, { storage, prefix }) {
  const id = newId(prefix);
  const fields = {};
  let savedFile = null;

  for await (const part of request.parts()) {
    if (part.type === 'file') {
      const ext = path.extname(part.filename || '') || '.bin';
      const filePath = path.join(storage.uploadsDir, `${id}${ext}`);
      await mkdir(path.dirname(filePath), { recursive: true });
      await pipeline(part.file, createWriteStream(filePath));
      savedFile = {
        fieldname: part.fieldname,
        filename: part.filename,
        mimetype: part.mimetype,
        path: filePath,
      };
    } else {
      fields[part.fieldname] = part.value;
    }
  }

  return { id, fields, savedFile };
}

async function drainFileStream(stream) {
  for await (const _chunk of stream) {
    // Intentionally drain unsupported upload parts so multipart parsing can finish.
  }
}

async function cleanCapture({ rawPath, cleanPath }) {
  const script = path.join(projectRoot, 'scripts', 'clean_paper.py');
  const cropPath = cleanPath.replace(/-clean\.png$/, '-crop.png');
  try {
    const python = await resolvePythonWithCv2();
    if (!python.available) throw new Error(`OpenCV Python is not available. Checked python3 but cv2 could not be imported.`);
    const { stdout } = await execFileAsync(python.command, [script, rawPath, cleanPath, cropPath], {
      timeout: 30000,
      maxBuffer: 1024 * 1024 * 2,
    });
    return { ...JSON.parse(stdout), cropPath };
  } catch (error) {
    return {
      status: 'failed',
      error: error.stderr || error.message || 'OpenCV cleanup failed.',
    };
  }
}

function runWithHardTimeout(command, args, { timeout = 12000 } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    let settled = false;
    let timer;
    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      callback(value);
    };
    timer = setTimeout(() => {
      child.kill('SIGKILL');
      finish(reject, new Error(`Command timed out after ${timeout}ms. ${stderr}`));
    }, timeout);

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('error', (error) => {
      finish(reject, error);
    });
    child.on('close', (code, signal) => {
      if (code === 0) finish(resolve, { stdout, stderr });
      else finish(reject, new Error(stderr || `Command failed with code ${code || signal}`));
    });
  });
}

async function createCaptureRecord({ storage, id, rawPath, sourceDeviceLabel, sourceKind }) {
  const cleanPath = path.join(storage.capturesDir, `${id}-clean.png`);
  const cleanup = await cleanCapture({ rawPath, cleanPath });
  const cleanupStatus = cleanup.status === 'completed' ? 'completed' : 'failed';
  const cropPath = cleanupStatus === 'completed' ? cleanup.cropPath : null;
  const capture = {
    id,
    sourceDeviceLabel,
    sourceKind: safeKind(sourceKind),
    rawImagePath: rawPath,
    rawImageUrl: dataUrl(storage, rawPath),
    cleanImagePath: cleanupStatus === 'completed' ? cleanPath : null,
    cleanImageUrl: cleanupStatus === 'completed' ? dataUrl(storage, cleanPath) : null,
    paperCropPath: cropPath,
    paperCropUrl: cropPath ? dataUrl(storage, cropPath) : null,
    cleanupStatus,
    cleanupWarning: cleanup.warning || null,
    cleanupError: cleanup.error || null,
    cleanupUsedContour: Boolean(cleanup.usedContour),
    paperFocusUsed: Boolean(cleanup.paperFocusUsed),
    paperFocusMethod: cleanup.paperFocusMethod || 'none',
    paperBoundingBox: cleanup.paperBoundingBox || null,
    width: cleanup.width || null,
    height: cleanup.height || null,
    createdAt: new Date().toISOString(),
  };

  await writeJson(capturePath(storage, id), capture);
  return capture;
}

async function captureAvfoundationFrame({ storage, deviceIndex, sourceDeviceLabel }) {
  const id = newId('cap');
  const rawPath = path.join(storage.capturesDir, `${id}-raw.png`);
  const ffmpegPath = await resolveCommand('ffmpeg', ['/opt/homebrew/bin/ffmpeg']);
  if (!ffmpegPath) throw new Error('ffmpeg is required for server camera snapshot.');
  await mkdir(path.dirname(rawPath), { recursive: true });
  try {
    await runWithHardTimeout(
      ffmpegPath,
      [
        '-hide_banner',
        '-y',
        '-f',
        'avfoundation',
        '-framerate',
        '30',
        '-pixel_format',
        'nv12',
        '-i',
        `${deviceIndex}:none`,
        '-vf',
        'select=gte(n\\,30)',
        '-vsync',
        'vfr',
        '-frames:v',
        '1',
        rawPath,
      ],
      { timeout: 12000, maxBuffer: 1024 * 1024 * 2 },
    );
  } catch (error) {
    const detail = error.stderr || error.message || String(error);
    throw new Error(
      `Server camera snapshot failed. macOS is blocking camera frames for the app running this server. If it was started from Codex, run "Start Paper Studio Camera.command" from Terminal and allow Terminal camera access. Close other camera apps, then retry. ${detail}`,
    );
  }

  return createCaptureRecord({
    storage,
    id,
    rawPath,
    sourceDeviceLabel,
    sourceKind: /desk view/i.test(sourceDeviceLabel) ? 'desk-view' : 'camera',
  });
}

function previewFramePath(storage, selected) {
  const safeLabel = String(selected.label || selected.index).replace(/[^a-z0-9_-]+/gi, '-').toLowerCase();
  return path.join(storage.uploadsDir, 'preview-frames', `${selected.index}-${safeLabel}.jpg`);
}

async function capturePreviewFrame({ storage, selected }) {
  const ffmpegPath = await resolveCommand('ffmpeg', ['/opt/homebrew/bin/ffmpeg']);
  if (!ffmpegPath) throw new Error('ffmpeg is required for camera preview.');
  const framePath = previewFramePath(storage, selected);
  await mkdir(path.dirname(framePath), { recursive: true });
  await runWithHardTimeout(
    ffmpegPath,
    [
      '-hide_banner',
      '-y',
      '-f',
      'avfoundation',
      '-framerate',
      '30',
      '-pixel_format',
      'nv12',
      '-i',
      `${selected.index}:none`,
      '-vf',
      'select=gte(n\\,8),scale=960:-1',
      '-vsync',
      'vfr',
      '-frames:v',
      '1',
      '-q:v',
      '5',
      framePath,
    ],
    { timeout: 6000, maxBuffer: 1024 * 1024 * 2 },
  );
  return framePath;
}

export async function createApp(options = {}) {
  const storage = createStorage(options.dataDir || path.join(projectRoot, 'data'));
  await ensureStorage(storage);

  const app = Fastify({ logger: options.logger || false });
  await app.register(multipart, { limits: { fileSize: 200 * 1024 * 1024 } });
  await app.register(fastifyStatic, {
    root: storage.dataDir,
    prefix: '/data/',
    decorateReply: false,
  });

  app.addHook('onRequest', async (request, reply) => {
    reply.header('Access-Control-Allow-Origin', '*');
    reply.header('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    reply.header('Access-Control-Allow-Headers', 'Content-Type');
    if (request.method === 'OPTIONS') return reply.send();
    return undefined;
  });

  app.setErrorHandler((error, request, reply) => {
    reply.status(error.statusCode || 500).send({ error: error.message || String(error) });
  });

  app.get('/api/health', async () => {
    const tools = await checkTools({ projectRoot });
    return {
      ok: true,
      project: 'paper-studio',
      tools,
      catalog: modelCatalog(tools),
    };
  });

  app.get('/api/models', async () => {
    const tools = await checkTools({ projectRoot });
    return modelCatalog(tools);
  });

  app.get('/api/cameras', async () => ({ cameras: await listAvfoundationCameras() }));

  app.post('/api/sources/folder-upload', async (request) => {
    const sourceSetId = newId('src');
    const sourceSetDir = path.join(storage.sourceUploadsDir, sourceSetId);
    const filesRoot = path.join(sourceSetDir, 'files');
    const fields = {};
    const savedFiles = [];
    await mkdir(filesRoot, { recursive: true });

    for await (const part of request.parts()) {
      if (part.type !== 'file') {
        fields[part.fieldname] = part.value;
        continue;
      }
      const originalName = safeRelativePath(part.filename || 'untitled');
      const extension = path.extname(originalName).toLowerCase();
      if (!SUPPORTED_SOURCE_EXTENSIONS.has(extension)) {
        await drainFileStream(part.file);
        continue;
      }
      const relativePath = originalName;
      const filePath = path.join(filesRoot, relativePath);
      const resolvedPath = path.resolve(filePath);
      if (!resolvedPath.startsWith(path.resolve(filesRoot))) {
        await drainFileStream(part.file);
        continue;
      }
      await mkdir(path.dirname(filePath), { recursive: true });
      await pipeline(part.file, createWriteStream(filePath));
      savedFiles.push({
        filename: part.filename,
        relativePath,
        mimetype: part.mimetype,
        path: filePath,
      });
    }

    if (!savedFiles.length) throw new Error('Choose a folder with at least one supported source file.');
    const folderName =
      fields.folderName ||
      savedFiles[0].relativePath.split(path.sep)[0] ||
      sourceSetId;
    const manifest = await buildUploadedSourceManifest({
      storage,
      sourceSetId,
      folderName,
      relativePaths: savedFiles.map((file) => file.relativePath),
    });
    const record = {
      sourceSetId,
      folderName,
      fileCount: manifest.fileCount,
      textFileCount: manifest.textFileCount,
      manifest,
      createdAt: new Date().toISOString(),
    };
    await writeJson(path.join(sourceSetDir, 'manifest.json'), manifest);
    await writeJson(path.join(sourceSetDir, 'record.json'), record);
    return record;
  });

  app.get('/api/cameras/frame', async (request, reply) => {
    const cameras = await listAvfoundationCameras();
    const selected = selectAvfoundationCamera(cameras, {
      deviceIndex: request.query?.deviceIndex,
      deviceLabel: request.query?.deviceLabel,
    });
    if (!selected) throw new Error('No AVFoundation camera was found for preview.');

    stopAllActiveCameraStreams();
    await wait(SERVER_CAMERA_RELEASE_DELAY_MS);
    const key = selected.label;
    let capturePromise = activeFrameCaptures.get(key);
    if (!capturePromise) {
      capturePromise = capturePreviewFrame({ storage, selected }).finally(() => activeFrameCaptures.delete(key));
      activeFrameCaptures.set(key, capturePromise);
    }
    const framePath = await capturePromise;
    const image = await readFile(framePath);
    reply
      .header('Cache-Control', 'no-store, no-cache, must-revalidate, private')
      .type('image/jpeg')
      .send(image);
  });

  app.get('/api/cameras/stream', async (request, reply) => {
    const cameras = await listAvfoundationCameras();
    const selected = selectAvfoundationCamera(cameras, {
      deviceIndex: request.query?.deviceIndex,
      deviceLabel: request.query?.deviceLabel,
    });
    if (!selected) throw new Error('No AVFoundation camera was found for server stream.');

    const ffmpegPath = await resolveCommand('ffmpeg', ['/opt/homebrew/bin/ffmpeg']);
    if (!ffmpegPath) throw new Error('ffmpeg is required for server camera stream.');

    stopAllActiveCameraStreams();

    reply.hijack();
    reply.raw.writeHead(200, {
      'Content-Type': 'multipart/x-mixed-replace; boundary=paperstudio',
      'Cache-Control': 'no-store, no-cache, must-revalidate, private',
      Pragma: 'no-cache',
      Connection: 'close',
      'X-Accel-Buffering': 'no',
    });

    const child = spawn(
      ffmpegPath,
      [
        '-hide_banner',
        '-loglevel',
        'error',
        '-f',
        'avfoundation',
        '-framerate',
        '30',
        '-pixel_format',
        'nv12',
        '-i',
        `${selected.index}:none`,
        '-vf',
        'fps=8,scale=960:-1',
        '-q:v',
        '5',
        '-f',
        'mpjpeg',
        '-boundary_tag',
        'paperstudio',
        'pipe:1',
      ],
      { stdio: ['ignore', 'pipe', 'pipe'] },
    );
    activeCameraStreams.set(selected.label, child);

    let stopped = false;
    const stop = () => {
      if (stopped) return;
      stopped = true;
      if (activeCameraStreams.get(selected.label) === child) {
        activeCameraStreams.delete(selected.label);
      }
      if (!child.killed) child.kill('SIGKILL');
    };
    request.raw.on('close', stop);
    reply.raw.on('close', stop);
    reply.raw.on('error', stop);
    child.stdout.on('data', (chunk) => {
      if (reply.raw.destroyed || reply.raw.writableEnded) return;
      reply.raw.write(chunk);
    });
    child.stdout.on('error', stop);
    child.stderr.on('data', () => undefined);
    child.on('error', stop);
    child.on('close', () => {
      if (activeCameraStreams.get(selected.label) === child) {
        activeCameraStreams.delete(selected.label);
      }
      if (!reply.raw.destroyed && !reply.raw.writableEnded) reply.raw.end();
    });
  });

  app.post('/api/captures', async (request) => {
    const { id, fields, savedFile } = await collectMultipart(request, { storage, prefix: 'cap' });
    if (!savedFile) throw new Error('image file is required.');

    const rawPath = path.join(storage.capturesDir, `${id}-raw${path.extname(savedFile.path) || '.png'}`);
    await copyFile(savedFile.path, rawPath);

    return createCaptureRecord({
      storage,
      id,
      sourceDeviceLabel: fields.sourceDeviceLabel || savedFile.filename || 'Uploaded image',
      sourceKind: safeKind(fields.sourceKind),
      rawPath,
    });
  });

  app.post('/api/captures/server-snapshot', async (request) => {
    const cameras = await listAvfoundationCameras();
    const selected = selectAvfoundationCamera(cameras, request.body || {});
    if (!selected) throw new Error('No AVFoundation camera was found for server snapshot.');
    stopAllActiveCameraStreams();
    await wait(SERVER_CAMERA_RELEASE_DELAY_MS);
    return captureAvfoundationFrame({
      storage,
      deviceIndex: selected.index,
      sourceDeviceLabel: selected.label,
    });
  });

  app.post('/api/transcriptions', async (request) => {
    const { id, fields, savedFile } = await collectMultipart(request, { storage, prefix: 'trn' });
    const engine = fields.engine || (savedFile ? 'whisper' : 'manual');
    let result = { status: 'completed', text: fields.text || '', error: null };
    let audioPath = null;

    if (savedFile) {
      audioPath = path.join(storage.transcriptsDir, `${id}${path.extname(savedFile.path) || '.webm'}`);
      await copyFile(savedFile.path, audioPath);
      result = await transcribeAudio({
        audioPath,
        outputDir: path.join(storage.transcriptsDir, id),
      });
    }

    const transcript = {
      id,
      engine,
      status: result.status,
      text: result.text || fields.text || '',
      audioPath,
      textPath: result.textPath || null,
      error: result.error || null,
      createdAt: new Date().toISOString(),
    };
    await writeJson(transcriptPath(storage, id), transcript);
    return transcript;
  });

  app.post('/api/jobs', async (request) => createDraftJob({ storage, body: request.body || {} }));

  app.post('/api/jobs/:id/confirm', async (request) =>
    confirmJob({
      storage,
      id: request.params.id,
      mockProviders: options.mockProviders || process.env.PAPER_STUDIO_MOCK_PROVIDERS === '1',
      inlineWorkers: options.inlineWorkers || false,
    }),
  );

  app.get('/api/jobs/:id', async (request) => readJob(storage, request.params.id));

  app.get('/api/jobs/:id/download/:asset', async (request, reply) => {
    const job = await readJob(storage, request.params.id);
    const asset = deckDownloadAsset(job, request.params.asset);
    const filePath = safeDataFile(storage, asset.filePath);
    const fileBuffer = await readFile(filePath);
    return reply
      .header('Content-Disposition', attachmentHeader(asset.filename))
      .header('Content-Length', String(fileBuffer.byteLength))
      .header('Cache-Control', 'no-store')
      .type(asset.type)
      .send(fileBuffer);
  });

  app.post('/api/jobs/:id/save/:asset', async (request) => {
    const job = await readJob(storage, request.params.id);
    const asset = deckDownloadAsset(job, request.params.asset);
    const filePath = safeDataFile(storage, asset.filePath);
    const targetPath = await uniqueDownloadPath(asset.filename);
    await copyFile(filePath, targetPath);
    return {
      filename: path.basename(targetPath),
      path: targetPath,
    };
  });

  app.get('/', async () => ({
    app: 'Paper Studio',
    devClient: 'http://127.0.0.1:5173',
    api: '/api/health',
  }));

  return app;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const app = await createApp({ logger: true });
  const port = Number(process.env.PORT || 8787);
  await app.listen({ host: '127.0.0.1', port });
}
