import { access } from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

async function canAccess(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function which(command) {
  try {
    const { stdout } = await execFileAsync('/usr/bin/which', [command], { timeout: 3000 });
    return stdout.trim() || null;
  } catch {
    return null;
  }
}

export async function resolveCommand(command, fallbacks = []) {
  const found = await which(command);
  if (found) return found;
  for (const fallback of fallbacks) {
    if (await canAccess(fallback)) return fallback;
  }
  return null;
}

export async function listAvfoundationCameras() {
  const ffmpegPath = await resolveCommand('ffmpeg', ['/opt/homebrew/bin/ffmpeg']);
  if (!ffmpegPath) return [];

  try {
    await execFileAsync(ffmpegPath, ['-hide_banner', '-f', 'avfoundation', '-list_devices', 'true', '-i', ''], {
      timeout: 6000,
      maxBuffer: 1024 * 1024,
    });
  } catch (error) {
    const text = `${error.stderr || ''}\n${error.stdout || ''}`;
    const cameras = [];
    let inVideo = false;
    for (const line of text.split('\n')) {
      if (line.includes('AVFoundation video devices')) {
        inVideo = true;
        continue;
      }
      if (line.includes('AVFoundation audio devices')) inVideo = false;
      if (!inVideo) continue;
      const match = line.match(/\[(\d+)\]\s+(.+)$/);
      if (match) cameras.push({ index: Number(match[1]), label: match[2].trim() });
    }
    return cameras;
  }

  return [];
}

const OPENCV_PYTHON_CANDIDATES = [
  process.env.PAPER_STUDIO_PYTHON,
  '/usr/bin/python3',
  '/Applications/Xcode.app/Contents/Developer/usr/bin/python3',
  '/usr/local/bin/python3',
  '/opt/homebrew/bin/python3',
  'python3',
].filter(Boolean);

export async function resolvePythonWithCv2() {
  for (const candidate of OPENCV_PYTHON_CANDIDATES) {
    const pythonPath = candidate.includes('/') ? candidate : await resolveCommand(candidate);
    if (!pythonPath || !(await canAccess(pythonPath))) continue;
    try {
      const { stdout } = await execFileAsync(pythonPath, ['-c', 'import cv2; print(cv2.__version__)'], {
        timeout: 5000,
      });
      return { available: true, command: pythonPath, version: stdout.trim() };
    } catch {
      // Try the next Python until one can import cv2.
    }
  }
  const fallback = await resolveCommand('python3');
  return { available: false, command: fallback, version: null };
}

async function checkPythonCv2() {
  const resolved = await resolvePythonWithCv2();
  if (!resolved.available) return resolved;
  try {
    const { stdout } = await execFileAsync(resolved.command, ['-c', 'import cv2; print(cv2.__version__)'], { timeout: 5000 });
    return { available: true, command: resolved.command, version: stdout.trim() };
  } catch {
    return { available: false, command: resolved.command, version: null };
  }
}

export async function checkTools({ projectRoot = process.cwd() } = {}) {
  const [ffmpeg, gemini, whisper, codex, cv2] = await Promise.all([
    resolveCommand('ffmpeg', ['/opt/homebrew/bin/ffmpeg']),
    resolveCommand('gemini', ['/Users/hmi/.local/bin/gemini']),
    resolveCommand('whisper', ['/Users/hmi/.local/bin/whisper']),
    resolveCommand('codex', ['/Applications/Codex.app/Contents/Resources/codex']),
    checkPythonCv2(),
  ]);

  const slidevLocal = path.join(projectRoot, 'node_modules', '.bin', 'slidev');
  const slidev = (await canAccess(slidevLocal)) ? slidevLocal : await resolveCommand('slidev');
  const libtvSkill = '/Users/hmi/.agents/skills/libtv-skill/scripts/create_session.py';

  return {
    ffmpeg: { available: Boolean(ffmpeg), command: ffmpeg },
    gemini: { available: Boolean(gemini), command: gemini },
    whisper: { available: Boolean(whisper), command: whisper },
    codex: { available: Boolean(codex), command: codex },
    slidev: { available: Boolean(slidev), command: slidev },
    opencv: cv2,
    libtv: {
      available: Boolean(process.env.LIBTV_ACCESS_KEY) && (await canAccess(libtvSkill)),
      configured: Boolean(process.env.LIBTV_ACCESS_KEY),
      skillScript: (await canAccess(libtvSkill)) ? libtvSkill : null,
    },
  };
}
