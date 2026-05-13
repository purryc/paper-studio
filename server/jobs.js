import { readJson, writeJson, jobPath, capturePath, newId } from './storage.js';
import { runLibtvMediaJob } from './libtv.js';
import { runDeckJob } from './deck.js';

const VALID_MODES = new Set(['image', 'video', 'deck']);
const VALID_DECK_ENGINES = new Set(['gemini-cli', 'codex-slidev']);
const VALID_SKETCH_TYPES = new Set(['structure', 'layout', 'mixed', 'flowchart']);
const VALID_DECK_OUTPUTS = new Set(['full-deck', 'flowchart-page']);
const VALID_SOURCE_POLICIES = new Set(['auto', 'on', 'off']);
const VALID_CREATIVE_STYLES = new Set(['short-video-ad', 'illustration', 'watercolor', 'cinematic-realism']);
const VALID_ASPECT_RATIOS = new Set(['4:3', '16:9', '9:16', '1:1']);

export async function createDraftJob({ storage, body }) {
  if (!VALID_MODES.has(body.mode)) throw new Error('mode must be image, video, or deck.');
  if (!body.captureId) throw new Error('captureId is required.');
  if (!String(body.prompt || '').trim()) throw new Error('prompt is required.');

  const capture = await readJson(capturePath(storage, body.captureId));
  const mode = body.mode;
  const deckEngine = body.deckEngine || 'gemini-cli';
  if (mode === 'deck' && !VALID_DECK_ENGINES.has(deckEngine)) throw new Error('Unsupported deckEngine.');
  const sketchType = body.sketchType || 'structure';
  const deckOutput = body.deckOutput || 'full-deck';
  const sourcePolicy = body.sourcePolicy || 'auto';
  const creativeStyle = body.creativeStyle || 'short-video-ad';
  const aspectRatio = body.aspectRatio || '4:3';
  if (mode === 'deck' && !VALID_SKETCH_TYPES.has(sketchType)) throw new Error('Unsupported sketchType.');
  if (mode === 'deck' && !VALID_DECK_OUTPUTS.has(deckOutput)) throw new Error('Unsupported deckOutput.');
  if (mode === 'deck' && !VALID_SOURCE_POLICIES.has(sourcePolicy)) throw new Error('Unsupported sourcePolicy.');
  if (mode !== 'deck' && !VALID_CREATIVE_STYLES.has(creativeStyle)) throw new Error('Unsupported creativeStyle.');
  if (mode !== 'deck' && !VALID_ASPECT_RATIOS.has(aspectRatio)) throw new Error('Unsupported aspectRatio.');

  const job = {
    id: newId('job'),
    status: 'draft',
    mode,
    captureId: capture.id,
    transcriptId: body.transcriptId || null,
    prompt: String(body.prompt).trim(),
    outputType: mode,
    providerId: mode === 'deck' ? deckEngine : 'libtv',
    deckEngine: mode === 'deck' ? deckEngine : null,
    deckStyle: mode === 'deck' ? body.deckStyle || 'apple-keynote' : null,
    sketchType: mode === 'deck' ? sketchType : null,
    deckOutput: mode === 'deck' ? deckOutput : null,
    creativeStyle: mode === 'deck' ? null : creativeStyle,
    aspectRatio: mode === 'deck' ? null : aspectRatio,
    optimizedPrompt: null,
    sourceRoot: mode === 'deck' ? String(body.sourceRoot || '').trim() || null : null,
    sourceSetId: mode === 'deck' ? String(body.sourceSetId || '').trim() || null : null,
    sourcePolicy: mode === 'deck' ? sourcePolicy : null,
    sourceContextUsed: false,
    sourceContextReason: mode === 'deck' ? 'not-confirmed' : null,
    sourceManifest: null,
    exportFormats: mode === 'deck' ? body.exportFormats || ['web', 'pptx'] : [],
    slideCountTarget: mode === 'deck' ? Number(body.slideCountTarget || 8) : null,
    billingPolicy: 'no-payg-default',
    sourceFiles: {
      rawImagePath: capture.rawImagePath,
      cleanImagePath: capture.cleanImagePath || capture.rawImagePath,
      paperCropPath: capture.paperCropPath || null,
    },
    externalCallsStarted: false,
    resultFiles: [],
    deck: null,
    providerSession: null,
    warnings: [],
    error: null,
    createdAt: new Date().toISOString(),
    confirmedAt: null,
    startedAt: null,
    completedAt: null,
  };

  return writeJson(jobPath(storage, job.id), job);
}

export async function readJob(storage, id) {
  return readJson(jobPath(storage, id));
}

export async function saveJob(storage, job) {
  return writeJson(jobPath(storage, job.id), job);
}

export async function confirmJob({ storage, id, mockProviders = false, inlineWorkers = false }) {
  const job = await readJob(storage, id);
  if (job.status !== 'draft') throw new Error('Only draft jobs can be confirmed.');

  const capture = await readJson(capturePath(storage, job.captureId));
  if (capture.cleanupStatus === 'failed') {
    throw new Error('OpenCV cleanup failed. Fix the capture or upload another image before confirming.');
  }

  job.status = 'queued';
  job.confirmedAt = new Date().toISOString();
  await saveJob(storage, job);

  const run = () => processJob({ storage, jobId: job.id, mockProviders });
  if (inlineWorkers) return run();
  run().catch(() => undefined);
  return job;
}

export async function processJob({ storage, jobId, mockProviders = false }) {
  let job = await readJob(storage, jobId);
  const capture = await readJson(capturePath(storage, job.captureId));

  job.status = 'running';
  job.externalCallsStarted = true;
  job.startedAt = new Date().toISOString();
  await saveJob(storage, job);

  try {
    const result =
      job.mode === 'deck'
        ? await runDeckJob({ job, capture, storage, mockProviders })
        : await runLibtvMediaJob({ job, capture, storage, mockProviders });

    job = {
      ...job,
      status: 'completed',
      providerSession: result.providerSession || null,
      resultFiles: result.resultFiles || [],
      deck: result.deck || null,
      sourceManifest: result.sourceManifest || job.sourceManifest || null,
      sourceContextUsed: result.sourceContextUsed ?? job.sourceContextUsed ?? false,
      sourceContextReason: result.sourceContextReason || job.sourceContextReason || null,
      warnings: [...(job.warnings || []), ...(result.warnings || [])],
      optimizedPrompt: result.optimizedPrompt || job.optimizedPrompt || null,
      completedAt: new Date().toISOString(),
    };
  } catch (error) {
    job = {
      ...job,
      status: 'failed',
      error: error.message || String(error),
      completedAt: new Date().toISOString(),
    };
  }

  return saveJob(storage, job);
}
