import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';

export const SOURCE_PRESETS = [
  '/Users/hmi/Documents/Desky/Survey',
  '/Users/hmi/Documents/Desky/paper-studio/specs',
  '/Users/hmi/Documents/Desky/docs',
];

export const TEXT_EXTENSIONS = new Set(['.md', '.markdown', '.txt']);
export const REFERENCE_EXTENSIONS = new Set(['.pdf', '.pptx', '.docx', '.png', '.jpg', '.jpeg', '.webp']);
export const SUPPORTED_SOURCE_EXTENSIONS = new Set([...TEXT_EXTENSIONS, ...REFERENCE_EXTENSIONS]);
const MAX_FILES = 48;
const MAX_TEXT_FILES = 16;
const MAX_CHARS_PER_FILE = 5000;
const MAX_TOTAL_CHARS = 24000;

async function walkFiles(root, dir = root, files = []) {
  if (files.length >= MAX_FILES) return files;
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    const absolutePath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await walkFiles(root, absolutePath, files);
    } else {
      const extension = path.extname(entry.name).toLowerCase();
      if (TEXT_EXTENSIONS.has(extension) || REFERENCE_EXTENSIONS.has(extension)) {
        files.push(absolutePath);
      }
    }
    if (files.length >= MAX_FILES) break;
  }
  return files;
}

function normalizeManifest(manifest) {
  if (!manifest) return null;
  return {
    ...manifest,
    files: manifest.files || [],
    textBundle: manifest.textBundle || '',
  };
}

async function buildManifestFromPaths({ root, paths, sourceLabel, sourceSetId = null, folderName = null }) {
  const files = [];
  const textSections = [];
  let textFileCount = 0;
  let totalChars = 0;

  for (const filePath of paths.slice(0, MAX_FILES)) {
    const extension = path.extname(filePath).toLowerCase();
    const relativePath = path.relative(root, filePath);
    if (TEXT_EXTENSIONS.has(extension) && textFileCount < MAX_TEXT_FILES && totalChars < MAX_TOTAL_CHARS) {
      const text = await readFile(filePath, 'utf8').catch(() => '');
      const remaining = MAX_TOTAL_CHARS - totalChars;
      const excerpt = text.slice(0, Math.min(MAX_CHARS_PER_FILE, remaining));
      totalChars += excerpt.length;
      textFileCount += 1;
      files.push({ path: filePath, relativePath, extension, kind: 'text', chars: text.length });
      textSections.push(`## ${relativePath}\n${excerpt}`);
    } else {
      files.push({ path: filePath, relativePath, extension, kind: 'reference' });
    }
  }

  return {
    sourceRoot: root,
    sourceLabel: sourceLabel || root,
    sourceSetId,
    folderName,
    scannedAt: new Date().toISOString(),
    fileCount: files.length,
    textFileCount,
    files,
    textBundle: textSections.join('\n\n---\n\n'),
  };
}

export async function buildSourceManifest(sourceRoot) {
  const rawRoot = String(sourceRoot || '').trim();
  if (!rawRoot) return null;
  const root = path.resolve(rawRoot);
  const rootStat = await stat(root).catch(() => {
    throw new Error(`Deck source folder is not readable: ${root}`);
  });
  if (!rootStat.isDirectory()) throw new Error(`Deck source must be a readable folder: ${root}`);

  const paths = await walkFiles(root);
  return buildManifestFromPaths({ root, paths, sourceLabel: root });
}

export async function buildUploadedSourceManifest({ storage, sourceSetId, folderName, relativePaths }) {
  const root = path.join(storage.sourceUploadsDir, sourceSetId, 'files');
  const paths = relativePaths
    .map((relativePath) => path.join(root, relativePath))
    .filter((filePath) => SUPPORTED_SOURCE_EXTENSIONS.has(path.extname(filePath).toLowerCase()));
  return buildManifestFromPaths({
    root,
    paths,
    sourceLabel: `uploaded:${folderName || sourceSetId}`,
    sourceSetId,
    folderName: folderName || sourceSetId,
  });
}

export async function readSourceSetManifest(storage, sourceSetId) {
  const rawId = String(sourceSetId || '').trim();
  if (!rawId) return null;
  const safeId = rawId.replace(/[^a-zA-Z0-9_-]/g, '');
  if (!safeId || safeId !== rawId) throw new Error('Invalid sourceSetId.');
  const manifestPath = path.join(storage.sourceUploadsDir, safeId, 'manifest.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8').catch(() => {
    throw new Error(`Uploaded source set was not found: ${safeId}`);
  }));
  return normalizeManifest(manifest);
}

export function mergeSourceManifests(...manifests) {
  const normalized = manifests.map(normalizeManifest).filter(Boolean);
  if (!normalized.length) return null;
  const files = normalized.flatMap((manifest) =>
    (manifest.files || []).map((file) => ({
      ...file,
      sourceLabel: manifest.sourceLabel || manifest.sourceRoot || manifest.sourceSetId || 'source',
    })),
  );
  return {
    sourceRoot: normalized.map((manifest) => manifest.sourceLabel || manifest.sourceRoot).filter(Boolean).join(' + '),
    scannedAt: new Date().toISOString(),
    fileCount: files.length,
    textFileCount: files.filter((file) => file.kind === 'text').length,
    files,
    textBundle: normalized
      .map((manifest) => manifest.textBundle)
      .filter(Boolean)
      .join('\n\n---\n\n'),
    sourceSets: normalized.map((manifest) => ({
      sourceRoot: manifest.sourceRoot || null,
      sourceLabel: manifest.sourceLabel || null,
      sourceSetId: manifest.sourceSetId || null,
      folderName: manifest.folderName || null,
      fileCount: manifest.fileCount ?? manifest.files?.length ?? 0,
      textFileCount: manifest.textFileCount ?? manifest.files?.filter((file) => file.kind === 'text').length ?? 0,
    })),
  };
}
