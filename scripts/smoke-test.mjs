import assert from 'node:assert/strict';
import { access, mkdtemp, readFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { createApp } from '../server/index.js';
import { filterLibtvResultUrls } from '../server/libtv.js';
import { sortServerCameras, sortVideoDevices } from '../src/camera.js';

const execFileAsync = promisify(execFile);

function makeSketchPpm() {
  const width = 360;
  const height = 260;
  const header = Buffer.from(`P6\n${width} ${height}\n255\n`, 'ascii');
  const pixels = Buffer.alloc(width * height * 3, 92);

  function setPixel(x, y, value = 20) {
    if (x < 0 || x >= width || y < 0 || y >= height) return;
    const index = (y * width + x) * 3;
    pixels[index] = value;
    pixels[index + 1] = value;
    pixels[index + 2] = value;
  }

  for (let y = 28; y < 228; y += 1) {
    for (let x = 42; x < 326; x += 1) {
      setPixel(x, y, 245);
    }
  }

  function line(x1, y1, x2, y2) {
    const steps = Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1));
    for (let i = 0; i <= steps; i += 1) {
      const t = i / steps;
      const x = Math.round(x1 + (x2 - x1) * t);
      const y = Math.round(y1 + (y2 - y1) * t);
      setPixel(x, y);
      setPixel(x + 1, y);
      setPixel(x, y + 1);
    }
  }

  line(38, 30, 322, 32);
  line(322, 32, 326, 226);
  line(326, 226, 34, 230);
  line(34, 230, 38, 30);
  line(90, 84, 260, 84);
  line(90, 84, 90, 168);
  line(260, 84, 260, 168);
  line(90, 168, 260, 168);
  line(175, 168, 175, 210);
  line(128, 210, 222, 210);

  return Buffer.concat([header, pixels]);
}

async function postForm(baseUrl, endpoint, fields) {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    if (value?.blob) form.set(key, value.blob, value.filename);
    else form.set(key, value);
  }
  const response = await fetch(`${baseUrl}${endpoint}`, { method: 'POST', body: form });
  const payload = await response.json();
  assert.equal(response.ok, true, payload.error || endpoint);
  return payload;
}

async function postJson(baseUrl, endpoint, body) {
  const response = await fetch(`${baseUrl}${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const payload = await response.json();
  assert.equal(response.ok, true, payload.error || endpoint);
  return payload;
}

async function postSourceFolder(baseUrl) {
  const form = new FormData();
  form.set('folderName', 'demo-sources');
  form.append(
    'files',
    new Blob(['# Workflow\n\nDesk View capture becomes a Mermaid flowchart.\n'], { type: 'text/markdown' }),
    'demo-sources/workflow.md',
  );
  form.append(
    'files',
    new Blob(['Use a concise flow from sketch to Slidev output.\n'], { type: 'text/plain' }),
    'demo-sources/reference.txt',
  );
  form.append('files', new Blob(['mock pptx reference'], { type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' }), 'demo-sources/reference.pptx');
  const response = await fetch(`${baseUrl}/api/sources/folder-upload`, { method: 'POST', body: form });
  const payload = await response.json();
  assert.equal(response.ok, true, payload.error || '/api/sources/folder-upload');
  return payload;
}

async function assertEditablePptx(pptxPath) {
  const script = `
import sys
import xml.etree.ElementTree as ET
from pptx import Presentation
prs = Presentation(sys.argv[1])
slide = prs.slides[0]
shapes = list(slide.shapes)
text_frames = [s for s in shapes if getattr(s, 'has_text_frame', False)]
xml = ''.join(getattr(s.element, 'xml', '') for s in shapes)
assert len(shapes) >= 7, f'expected multiple editable shapes, got {len(shapes)}'
assert len(text_frames) >= 4, f'expected editable text frames, got {len(text_frames)}'
assert 'tailEnd' in xml or 'triangle' in xml, 'expected editable arrow lines'
ns = {'a': 'http://schemas.openxmlformats.org/drawingml/2006/main', 'p': 'http://schemas.openxmlformats.org/presentationml/2006/main'}
for shape in shapes:
    element = ET.fromstring(shape.element.xml)
    geom = element.find('.//a:prstGeom', ns)
    if geom is None or geom.attrib.get('prst') != 'line':
        continue
    ext = element.find('.//a:xfrm/a:ext', ns)
    if ext is None:
        continue
    cx = abs(int(ext.attrib.get('cx', '0')))
    cy = abs(int(ext.attrib.get('cy', '0')))
    assert cx == 0 or cy == 0, 'expected orthogonal line segment, found diagonal segment'
`;
  await execFileAsync('python3', ['-c', script, pptxPath], { timeout: 30000 });
}

const ranked = sortVideoDevices([
  { kind: 'videoinput', deviceId: '4', label: 'MacBook Pro Camera' },
  { kind: 'videoinput', deviceId: '2', label: 'che iphone Desk View Camera' },
  { kind: 'videoinput', deviceId: '1', label: 'MacBook Pro Desk View Camera' },
]);
assert.equal(ranked[0].label, 'MacBook Pro Desk View Camera');

const rankedServer = sortServerCameras([
  { index: 3, label: 'che iphone Camera' },
  { index: 1, label: 'MacBook Pro Desk View Camera' },
  { index: 0, label: 'MacBook Pro Camera' },
]);
assert.equal(rankedServer[0].label, 'MacBook Pro Desk View Camera');

const mixedLibtvMessages = [
  { role: 'tool', content: JSON.stringify({ task_result: { images: [{ previewPath: 'https://libtv-res.liblib.art/old/old.png' }] } }) },
  { role: 'user', content: '任务标记：paper-studio-job:job_current' },
  {
    role: 'tool',
    content: JSON.stringify({
      task_result: {
        images: [{ previewPath: 'https://libtv-res.liblib.art/current/current.png' }],
        videos: [{ previewPath: 'https://libtv-res.liblib.art/current/current.mp4' }],
      },
    }),
  },
];
assert.deepEqual(filterLibtvResultUrls(mixedLibtvMessages, 'paper-studio-job:job_current', 'image'), [
  'https://libtv-res.liblib.art/current/current.png',
]);
assert.deepEqual(filterLibtvResultUrls(mixedLibtvMessages, 'paper-studio-job:job_current', 'video'), [
  'https://libtv-res.liblib.art/current/current.mp4',
]);

const dataDir = await mkdtemp(path.join(os.tmpdir(), 'paper-studio-smoke-'));
const app = await createApp({ dataDir, mockProviders: true, inlineWorkers: true });
await app.listen({ host: '127.0.0.1', port: 0 });

try {
  const address = app.server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;

  const capture = await postForm(baseUrl, '/api/captures', {
    image: { blob: new Blob([makeSketchPpm()], { type: 'image/x-portable-pixmap' }), filename: 'sketch.ppm' },
    sourceDeviceLabel: 'Uploaded image',
    sourceKind: 'upload',
  });
  assert.equal(capture.sourceKind, 'upload');
  assert.equal(capture.cleanupStatus, 'completed');
  assert.equal(capture.paperFocusUsed, true);
  assert.ok(['perspective', 'bounding-box'].includes(capture.paperFocusMethod));
  assert.ok(capture.paperBoundingBox);
  assert.ok(capture.paperCropUrl);

  const transcript = await postForm(baseUrl, '/api/transcriptions', {
    engine: 'manual',
    text: '把这个手绘工作流整理成一套苹果发布会风格的产品介绍。',
  });
  assert.equal(transcript.status, 'completed');

  const sourceSet = await postSourceFolder(baseUrl);
  assert.ok(sourceSet.sourceSetId);
  assert.equal(sourceSet.folderName, 'demo-sources');
  assert.equal(sourceSet.fileCount, 3);
  assert.equal(sourceSet.textFileCount, 2);
  assert.match(sourceSet.manifest.textBundle, /Desk View capture/);

  const imageDraft = await postJson(baseUrl, '/api/jobs', {
    mode: 'image',
    captureId: capture.id,
    transcriptId: transcript.id,
    prompt: '根据草图生成一张清晰的概念图。',
  });
  assert.equal(imageDraft.status, 'draft');
  assert.equal(imageDraft.providerId, 'libtv');
  assert.equal(imageDraft.creativeStyle, 'short-video-ad');
  assert.equal(imageDraft.aspectRatio, '4:3');
  assert.equal(imageDraft.externalCallsStarted, false);
  assert.equal(imageDraft.resultFiles.length, 0);

  const imageJob = await postJson(baseUrl, `/api/jobs/${imageDraft.id}/confirm`, {});
  assert.equal(imageJob.status, 'completed');
  assert.match(imageJob.optimizedPrompt, /短视频广告风/);
  assert.match(imageJob.optimizedPrompt, /画幅：4:3/);
  assert.equal(imageJob.resultFiles.length, 1);
  assert.equal(imageJob.resultFiles[0].mediaType, 'image');

  const videoDraft = await postJson(baseUrl, '/api/jobs', {
    mode: 'video',
    captureId: capture.id,
    transcriptId: transcript.id,
    prompt: '根据草图生成一个短视频。',
    creativeStyle: 'cinematic-realism',
    aspectRatio: '9:16',
  });
  assert.equal(videoDraft.status, 'draft');
  assert.equal(videoDraft.providerId, 'libtv');
  assert.equal(videoDraft.outputType, 'video');
  assert.equal(videoDraft.creativeStyle, 'cinematic-realism');
  assert.equal(videoDraft.aspectRatio, '9:16');
  assert.equal(videoDraft.externalCallsStarted, false);

  const videoJob = await postJson(baseUrl, `/api/jobs/${videoDraft.id}/confirm`, {});
  assert.equal(videoJob.status, 'completed');
  assert.match(videoJob.optimizedPrompt, /写实电影风/);
  assert.match(videoJob.optimizedPrompt, /画幅：9:16/);
  assert.equal(videoJob.resultFiles.length, 1);
  assert.equal(videoJob.resultFiles[0].mediaType, 'video');

  const deckDraft = await postJson(baseUrl, '/api/jobs', {
    mode: 'deck',
    captureId: capture.id,
    transcriptId: transcript.id,
    prompt: '生成一个流程图。',
    providerId: 'codex-slidev',
    deckEngine: 'codex-slidev',
    deckStyle: 'apple-keynote',
    sketchType: 'flowchart',
    deckOutput: 'flowchart-page',
    sourceSetId: sourceSet.sourceSetId,
    sourcePolicy: 'auto',
    exportFormats: ['web', 'pptx'],
    slideCountTarget: 8,
  });
  assert.equal(deckDraft.status, 'draft');
  assert.equal(deckDraft.providerId, 'codex-slidev');
  assert.equal(deckDraft.sketchType, 'flowchart');
  assert.equal(deckDraft.deckOutput, 'flowchart-page');
  assert.equal(deckDraft.sourceSetId, sourceSet.sourceSetId);
  assert.equal(deckDraft.sourcePolicy, 'auto');
  assert.equal(deckDraft.sourceManifest, null);
  assert.equal(deckDraft.externalCallsStarted, false);

  const deckJob = await postJson(baseUrl, `/api/jobs/${deckDraft.id}/confirm`, {});
  assert.equal(deckJob.status, 'completed');
  assert.ok(deckJob.deck.previewUrl);
  assert.ok(deckJob.deck.pptxUrl);
  assert.equal(deckJob.deck.slidevPptxUrl, null);
  assert.ok(deckJob.deck.mermaidSource);
  assert.equal(deckJob.deck.output, 'flowchart-page');
  assert.equal(deckJob.deck.pptxPath.endsWith('editable-flowchart.pptx'), true);
  assert.equal(deckJob.deck.inputImagePath.endsWith(`${deckDraft.id}/input.png`), true);
  assert.equal(deckJob.sourceContextUsed, false);
  assert.equal(deckJob.sourceContextReason, 'selected-but-prompt-did-not-request-source');
  assert.equal(deckJob.sourceManifest, null);
  await access(deckJob.deck.slidesPath);
  await access(deckJob.deck.pptxPath);
  await access(deckJob.deck.mermaidPath);
  await access(deckJob.deck.inputImagePath);
  const slides = await readFile(deckJob.deck.slidesPath, 'utf8');
  assert.match(slides, /```mermaid/);
  assert.match(slides, /flowchart TD/);
  const mermaid = await readFile(deckJob.deck.mermaidPath, 'utf8');
  assert.match(mermaid, /^flowchart TD/m);
  await assertEditablePptx(deckJob.deck.pptxPath);

  const referencedDeckDraft = await postJson(baseUrl, '/api/jobs', {
    mode: 'deck',
    captureId: capture.id,
    prompt: '参考资料，把这个手绘整理成一个流程图。',
    providerId: 'codex-slidev',
    deckEngine: 'codex-slidev',
    deckStyle: 'apple-keynote',
    sketchType: 'flowchart',
    deckOutput: 'flowchart-page',
    sourceSetId: sourceSet.sourceSetId,
    sourcePolicy: 'auto',
    exportFormats: ['web', 'pptx'],
  });
  const referencedDeckJob = await postJson(baseUrl, `/api/jobs/${referencedDeckDraft.id}/confirm`, {});
  assert.equal(referencedDeckJob.status, 'completed');
  assert.equal(referencedDeckJob.sourceContextUsed, true);
  assert.ok(referencedDeckJob.sourceManifest.files.length >= 3);
  assert.equal(referencedDeckJob.sourceManifest.textFileCount, 2);

  console.log('Smoke tests passed.');
} finally {
  await app.close();
}
