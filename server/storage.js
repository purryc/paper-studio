import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

export function createStorage(rootDir) {
  const dataDir = rootDir;
  return {
    dataDir,
    capturesDir: path.join(dataDir, 'captures'),
    transcriptsDir: path.join(dataDir, 'transcripts'),
    jobsDir: path.join(dataDir, 'jobs'),
    resultsDir: path.join(dataDir, 'results'),
    decksDir: path.join(dataDir, 'decks'),
    uploadsDir: path.join(dataDir, 'uploads'),
    sourceUploadsDir: path.join(dataDir, 'source-uploads'),
  };
}

export async function ensureStorage(storage) {
  await Promise.all(
    Object.values(storage).map((dir) => {
      if (typeof dir !== 'string') return undefined;
      return mkdir(dir, { recursive: true });
    }),
  );
}

export function newId(prefix) {
  return `${prefix}_${randomUUID().slice(0, 8)}`;
}

export async function writeJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  return value;
}

export async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, 'utf8'));
}

export function dataUrl(storage, filePath) {
  const relative = path.relative(storage.dataDir, filePath).split(path.sep).join('/');
  return `/data/${relative}`;
}

export function jobPath(storage, id) {
  return path.join(storage.jobsDir, `${id}.json`);
}

export function capturePath(storage, id) {
  return path.join(storage.capturesDir, `${id}.json`);
}

export function transcriptPath(storage, id) {
  return path.join(storage.transcriptsDir, `${id}.json`);
}
