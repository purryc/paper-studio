import { useEffect, useMemo, useRef, useState } from 'react';
import {
  cameraStreamUrl,
  captureServerSnapshot,
  confirmJob,
  createJob,
  createTranscript,
  getHealth,
  getJob,
  getServerCameras,
  uploadCapture,
  uploadSourceFolder,
} from './api.js';
import { recordAudioUntilStopped } from './audio.js';
import { sortServerCameras, sourceKindForLabel, sourceStatusLabel } from './camera.js';

const POLL_STATUSES = new Set(['queued', 'running']);
const CAMERA_RELEASE_DELAY_MS = 700;
const SOURCE_KEYWORDS = ['参考', '资料', '文件夹', '文档', 'source', 'folder', 'docs', 'based on'];
const MEDIA_STYLES = [
  { id: 'short-video-ad', label: 'Short ad' },
  { id: 'illustration', label: 'Illustration' },
  { id: 'watercolor', label: 'Watercolor' },
  { id: 'cinematic-realism', label: 'Cinematic' },
];
const ASPECT_RATIOS = ['4:3', '16:9', '9:16', '1:1'];

function wait(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function shortCameraLabel(label) {
  return String(label || '')
    .replace(/\s+Camera$/i, '')
    .replace(/^MacBook Pro\s+/i, 'Mac ')
    .replace(/^che iphone\s+/i, 'iPhone ');
}

function shouldUseSourceContext(text) {
  const value = String(text || '').toLowerCase();
  return SOURCE_KEYWORDS.some((keyword) => value.includes(keyword.toLowerCase()));
}

export default function App() {
  const stopRecordingRef = useRef(null);
  const [health, setHealth] = useState(null);
  const [serverCameras, setServerCameras] = useState([]);
  const [selectedServerCameraLabel, setSelectedServerCameraLabel] = useState('');
  const [cameraError, setCameraError] = useState('');
  const [serverPreviewEnabled, setServerPreviewEnabled] = useState(true);
  const [serverPreviewNonce, setServerPreviewNonce] = useState(Date.now());
  const [serverStreamError, setServerStreamError] = useState('');
  const [capture, setCapture] = useState(null);
  const [mode, setMode] = useState('image');
  const [creativeStyle, setCreativeStyle] = useState('short-video-ad');
  const [aspectRatio, setAspectRatio] = useState('4:3');
  const [prompt, setPrompt] = useState('');
  const [transcript, setTranscript] = useState(null);
  const [recording, setRecording] = useState(false);
  const [deckEngine, setDeckEngine] = useState('gemini-cli');
  const [slideCountTarget, setSlideCountTarget] = useState(8);
  const [sketchType, setSketchType] = useState('structure');
  const [deckOutput, setDeckOutput] = useState('full-deck');
  const [sourceSet, setSourceSet] = useState(null);
  const [job, setJob] = useState(null);
  const [statusMessage, setStatusMessage] = useState('Ready.');

  const rankedServerCameras = useMemo(() => sortServerCameras(serverCameras), [serverCameras]);
  const visibleCameraChips = rankedServerCameras;
  const selectedServerCamera = useMemo(
    () =>
      rankedServerCameras.find((camera) => camera.label === selectedServerCameraLabel) ||
      rankedServerCameras[0],
    [rankedServerCameras, selectedServerCameraLabel],
  );
  const serverSourceKind = sourceKindForLabel(selectedServerCamera?.label || '');
  const sourceChipLabel = selectedServerCamera
    ? serverPreviewEnabled
      ? sourceStatusLabel(serverSourceKind)
      : `${sourceStatusLabel(serverSourceKind)} paused`
    : 'No camera';
  const sourceChipKind = selectedServerCamera ? serverSourceKind : 'upload';
  const serverSourceLabel = selectedServerCamera?.label || 'No server camera';
  const activePreviewLabel = serverPreviewEnabled ? serverSourceLabel : 'Off';
  const serverPreviewUrl = selectedServerCamera
    ? cameraStreamUrl(selectedServerCamera.label, serverPreviewNonce)
    : '';

  useEffect(() => {
    if (!rankedServerCameras.length) {
      setSelectedServerCameraLabel('');
      return;
    }
    setSelectedServerCameraLabel((currentLabel) => {
      if (rankedServerCameras.some((camera) => camera.label === currentLabel)) return currentLabel;
      return rankedServerCameras[0].label;
    });
  }, [rankedServerCameras]);

  async function refreshServerCameras() {
    const payload = await getServerCameras();
    setServerCameras(payload.cameras || []);
    setServerPreviewEnabled(true);
    setServerPreviewNonce(Date.now());
    setStatusMessage('Camera sources refreshed.');
  }

  function restartServerPreview() {
    setServerStreamError('');
    setServerPreviewEnabled(true);
    setServerPreviewNonce(Date.now());
    setStatusMessage(`Live view restarted for ${serverSourceLabel}.`);
  }
  const deckEngineReady =
    deckEngine === 'gemini-cli'
      ? Boolean(health?.tools?.gemini?.available && health?.tools?.slidev?.available)
      : Boolean(health?.tools?.codex?.available && health?.tools?.slidev?.available);
  const selectedProviderReady =
    mode === 'deck' ? deckEngineReady : Boolean(health?.tools?.libtv?.available);
  const generationBusy = job ? POLL_STATUSES.has(job.status) : false;
  const useSourceContext = mode === 'deck' && Boolean(sourceSet?.sourceSetId) && shouldUseSourceContext(prompt);
  const sourceSummary =
    mode !== 'deck'
      ? ''
      : useSourceContext
        ? `${sourceSet.folderName} (used)`
        : sourceSet?.sourceSetId
          ? `${sourceSet.folderName} (selected, ignored)`
          : 'None';
  const generateReady = Boolean(capture && prompt.trim() && selectedProviderReady && !generationBusy);

  useEffect(() => {
    getHealth().then(setHealth).catch((error) => setStatusMessage(error.message));
    getServerCameras()
      .then((payload) => setServerCameras(payload.cameras || []))
      .catch(() => setServerCameras([]));
  }, []);

  useEffect(() => {
    if (!job?.id || !POLL_STATUSES.has(job.status)) return undefined;
    const timer = setInterval(async () => {
      const nextJob = await getJob(job.id);
      setJob(nextJob);
      if (!POLL_STATUSES.has(nextJob.status)) clearInterval(timer);
    }, 2500);
    return () => clearInterval(timer);
  }, [job]);

  useEffect(() => {
    if (!selectedServerCamera?.label) return;
    setServerStreamError('');
    setServerPreviewEnabled(true);
    setServerPreviewNonce(Date.now());
    setStatusMessage(`Live view switched to ${selectedServerCamera.label}.`);
  }, [selectedServerCamera?.label]);

  async function captureFromServerCamera() {
    if (!selectedServerCamera) return;
    setCameraError('');
    const shouldRestoreServerPreview = serverPreviewEnabled;
    if (serverPreviewEnabled) {
      setServerPreviewEnabled(false);
      setStatusMessage(`Pausing live view before capturing ${selectedServerCamera.label}...`);
      await wait(CAMERA_RELEASE_DELAY_MS);
    }
    setStatusMessage(`Capturing still frame from ${selectedServerCamera.label}...`);
    try {
      const nextCapture = await captureServerSnapshot(selectedServerCamera.index, selectedServerCamera.label);
      setCapture(nextCapture);
      setJob(null);
      setStatusMessage(`Server camera snapshot saved from ${selectedServerCamera.label}.`);
    } catch (error) {
      setCameraError(error.message);
      setStatusMessage('Server camera snapshot failed.');
    } finally {
      if (shouldRestoreServerPreview) {
        setServerPreviewEnabled(true);
        setServerPreviewNonce(Date.now());
      }
    }
  }

  async function uploadImage(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    setStatusMessage('Uploading image...');
    const nextCapture = await uploadCapture(file, {
      sourceDeviceLabel: 'Uploaded image',
      sourceKind: 'upload',
    });
    setCapture(nextCapture);
    setJob(null);
    setStatusMessage('Upload saved and cleaned.');
  }

  async function uploadFolder(event) {
    const files = event.target.files;
    if (!files?.length) return;
    setStatusMessage('Uploading source folder...');
    try {
      const nextSourceSet = await uploadSourceFolder(files);
      setSourceSet(nextSourceSet);
      setStatusMessage(
        `Source folder ready: ${nextSourceSet.folderName} (${nextSourceSet.fileCount} files, ${nextSourceSet.textFileCount} text).`,
      );
    } catch (error) {
      setStatusMessage(error.message || String(error));
    } finally {
      event.target.value = '';
    }
  }

  async function startRecording() {
    setRecording(true);
    stopRecordingRef.current = await recordAudioUntilStopped(async (file) => {
      setStatusMessage('Transcribing audio...');
      const nextTranscript = await createTranscript({ audioFile: file, engine: 'whisper' });
      setTranscript(nextTranscript);
      setPrompt(nextTranscript.text || prompt);
      setRecording(false);
      setStatusMessage(nextTranscript.status === 'completed' ? 'Transcript ready.' : 'Whisper failed; edit prompt manually.');
    });
  }

  function stopRecording() {
    stopRecordingRef.current?.();
    stopRecordingRef.current = null;
  }

  async function saveManualTranscript() {
    const nextTranscript = await createTranscript({ text: prompt, engine: 'manual' });
    setTranscript(nextTranscript);
    setStatusMessage('Manual transcript saved.');
  }

  async function generate() {
    try {
      if (!capture?.id) throw new Error('Capture or upload a sketch first.');
      if (!prompt.trim()) throw new Error('Add a prompt or transcript first.');
      if (!selectedProviderReady) throw new Error('Selected provider is not ready.');
      const payload = {
        mode,
        captureId: capture.id,
        transcriptId: transcript?.id,
        prompt,
        creativeStyle: mode === 'deck' ? undefined : creativeStyle,
        aspectRatio: mode === 'deck' ? undefined : aspectRatio,
        providerId: mode === 'deck' ? deckEngine : 'libtv',
        deckEngine: mode === 'deck' ? deckEngine : undefined,
        deckStyle: mode === 'deck' ? 'apple-keynote' : undefined,
        sketchType: mode === 'deck' ? sketchType : undefined,
        deckOutput: mode === 'deck' ? deckOutput : undefined,
        sourceSetId: mode === 'deck' ? sourceSet?.sourceSetId : undefined,
        sourcePolicy: mode === 'deck' ? 'auto' : undefined,
        slideCountTarget: mode === 'deck' ? slideCountTarget : undefined,
        exportFormats: mode === 'deck' ? ['web', 'pptx'] : undefined,
      };
      setStatusMessage('Creating draft and starting generation...');
      const nextDraft = await createJob(payload);
      setJob(nextDraft);
      const nextJob = await confirmJob(nextDraft.id);
      setJob(nextJob);
      setStatusMessage('Generation started. Results will appear here.');
    } catch (error) {
      setStatusMessage(error.message || String(error));
    }
  }

  async function saveDeckAsset(assetName, filename) {
    try {
      if (!job?.id) throw new Error('Generate a deck before downloading.');
      setStatusMessage(`Saving ${filename} to Downloads...`);
      const response = await fetch(`/api/jobs/${job.id}/save/${assetName}`, {
        method: 'POST',
        cache: 'no-store',
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || `Save failed: ${response.status}`);
      }
      const payload = await response.json();
      setStatusMessage(`Saved to Downloads: ${payload.filename || filename}.`);
    } catch (error) {
      setStatusMessage(error.message || String(error));
    }
  }

  const cleanImageUrl = capture?.cleanImageUrl;
  const resultFiles = job?.resultFiles || [];
  const imageResults = resultFiles.filter((file) => file.mediaType === 'image' || /\.(png|jpe?g|webp)(\?|$)/i.test(file.url || ''));
  const videoResults = resultFiles.filter((file) => file.mediaType === 'video' || /\.(mp4|mov|webm)(\?|$)/i.test(file.url || ''));
  const deckPreviewUrl = job?.deck?.previewUrl
    ? `${job.deck.previewUrl}${job.deck.previewUrl.includes('?') ? '&' : '?'}v=${job.id}-${job.status}`
    : '';

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Paper Studio Prototype</p>
          <h1>Desk View Studio</h1>
        </div>
        <div className="status-pill">{health?.tools?.libtv?.available ? 'LibTV ready' : 'Setup check'}</div>
      </header>

      <section className="workflow-tabs" aria-label="Workflow mode">
        <button className={mode === 'image' || mode === 'video' ? 'active' : ''} onClick={() => setMode(mode === 'deck' ? 'image' : mode)}>Sketch to Media</button>
        <button className={mode === 'deck' ? 'active' : ''} onClick={() => setMode('deck')}>Sketch to Deck</button>
      </section>

      <section className="grid">
        <section className="panel capture-panel">
          <div className="panel-header">
            <h2>1. Capture</h2>
            <span className={`source-chip ${sourceChipKind}`}>{sourceChipLabel}</span>
          </div>

          <div className="camera-frame">
            {selectedServerCamera && serverPreviewEnabled && (
              <img
                key={`${selectedServerCamera.label}-${serverPreviewNonce}`}
                className="server-preview"
                src={serverPreviewUrl}
                alt={`${selectedServerCamera.label} live preview`}
                onLoad={() => setServerStreamError('')}
                onError={() => {
                  setServerPreviewEnabled(false);
                  setServerStreamError('Live stream failed. Restart live view, try another camera, or capture still.');
                }}
              />
            )}
            {(!selectedServerCamera || !serverPreviewEnabled) && (
              <div className="still-capture-state">
                <strong>{serverSourceKind === 'desk-view' ? 'Desk View still capture' : 'Server still capture'}</strong>
                <span>{serverSourceLabel}</span>
                <small>Live view is paused while still capture uses the camera.</small>
              </div>
            )}
          </div>

          {visibleCameraChips.length > 0 && (
            <div className="camera-chip-row" aria-label="Camera source">
              {visibleCameraChips.map((camera) => {
                const active = camera.label === selectedServerCamera?.label;
                const kind = sourceKindForLabel(camera.label);
                return (
                  <button
                    key={camera.label}
                    className={`camera-chip ${kind} ${active ? 'active' : ''}`}
                    onClick={() => {
                      setSelectedServerCameraLabel(camera.label);
                      setServerPreviewEnabled(true);
                      setServerPreviewNonce(Date.now());
                    }}
                    title={camera.label}
                  >
                    {shortCameraLabel(camera.label)}
                  </button>
                );
              })}
            </div>
          )}

          <div className="control-row">
            <button onClick={captureFromServerCamera} disabled={!selectedServerCamera}>Capture</button>
            <button onClick={restartServerPreview} disabled={!selectedServerCamera}>Restart live view</button>
            <label className="file-button">
              Upload image
              <input type="file" accept="image/*" onChange={uploadImage} />
            </label>
            <button onClick={refreshServerCameras}>Refresh sources</button>
          </div>

          {cameraError && <p className="error compact-message">{cameraError}</p>}
          {serverStreamError && <p className="error compact-message">{serverStreamError}</p>}
          <div className="source-summary compact-meta">
            <p><strong>Live preview:</strong> {activePreviewLabel}</p>
            <p><strong>Capture source:</strong> {serverSourceLabel}</p>
          </div>
        </section>

        <section className="panel review-panel">
          <div className="panel-header">
            <h2>2. Review sketch</h2>
            <span>{capture?.cleanupStatus || 'Waiting'}</span>
          </div>
          {capture?.rawImageUrl ? (
            <div className="preview-grid">
              <figure>
                <figcaption>Paper crop</figcaption>
                <img className="sketch-preview" src={capture.paperCropUrl || capture.rawImageUrl} alt="Paper crop" />
              </figure>
              {cleanImageUrl && (
                <figure>
                  <figcaption>Cleaned sketch</figcaption>
                  <img className="sketch-preview" src={cleanImageUrl} alt="Cleaned sketch" />
                </figure>
              )}
            </div>
          ) : (
            <div className="empty-state">Capture from Desk View or upload a sketch.</div>
          )}
          <div className="source-summary compact-meta">
            <p><strong>Focus:</strong> {capture?.paperFocusMethod || 'none'}</p>
            <p><strong>Source:</strong> {capture?.sourceDeviceLabel || 'No capture yet'}</p>
          </div>
          {capture?.cleanupWarning && <p className="hint compact-message">{capture.cleanupWarning}</p>}
          {capture?.cleanupError && <p className="error compact-message">{capture.cleanupError}</p>}
        </section>

        <section className="panel prompt-panel">
          <div className="panel-header">
            <h2>3. Intent</h2>
            <span>{transcript?.engine || 'Manual or voice'}</span>
          </div>
          <textarea
            className={mode === 'deck' ? 'compact-textarea' : ''}
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            placeholder={mode === 'deck' ? 'Explain the mind map and the presentation goal...' : 'Describe what you want generated from the sketch...'}
          />
          <div className="control-row">
            {!recording ? <button onClick={startRecording}>Record</button> : <button onClick={stopRecording}>Stop</button>}
            <button onClick={saveManualTranscript} disabled={!prompt.trim()}>Save text</button>
          </div>

          {mode !== 'deck' && (
            <div className="deck-controls">
              <label className="field">
                Output
                <select value={mode} onChange={(event) => setMode(event.target.value)}>
                  <option value="image">Image</option>
                  <option value="video">Video</option>
                </select>
              </label>
              <div className="field style-field">
                Style
                <div className="option-chip-row">
                  {MEDIA_STYLES.map((style) => (
                    <button
                      type="button"
                      key={style.id}
                      className={`option-chip ${creativeStyle === style.id ? 'active' : ''}`}
                      onClick={() => setCreativeStyle(style.id)}
                    >
                      {style.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="field aspect-field">
                Aspect
                <div className="option-chip-row">
                  {ASPECT_RATIOS.map((ratio) => (
                    <button
                      type="button"
                      key={ratio}
                      className={`option-chip ${aspectRatio === ratio ? 'active' : ''}`}
                      onClick={() => setAspectRatio(ratio)}
                    >
                      {ratio}
                    </button>
                  ))}
                </div>
              </div>
              <p className="hint">
                Prompt is expanded with style and aspect before LibTV runs. Default is short-video ad style in 4:3.
              </p>
            </div>
          )}

          {mode === 'deck' && (
            <div className="deck-controls deck-controls-rich">
              <label className="field">
                Sketch type
                <select
                  value={sketchType}
                  onChange={(event) => {
                    const nextType = event.target.value;
                    setSketchType(nextType);
                    if (nextType === 'flowchart') setDeckOutput('flowchart-page');
                  }}
                >
                  <option value="structure">Structure</option>
                  <option value="layout">Layout</option>
                  <option value="mixed">Mixed</option>
                  <option value="flowchart">Flowchart</option>
                </select>
              </label>
              <label className="field">
                Deck output
                <select value={deckOutput} onChange={(event) => setDeckOutput(event.target.value)}>
                  <option value="full-deck">Full deck</option>
                  <option value="flowchart-page">Flowchart page</option>
                </select>
              </label>
              <label className="field">
                Deck planner
                <select value={deckEngine} onChange={(event) => setDeckEngine(event.target.value)}>
                  <option value="gemini-cli" disabled={!health?.tools?.gemini?.available || !health?.tools?.slidev?.available}>
                    Gemini CLI
                  </option>
                  <option value="codex-slidev" disabled={!health?.tools?.codex?.available || !health?.tools?.slidev?.available}>
                    Codex CLI + slidev skill
                  </option>
                </select>
              </label>
              {deckOutput === 'flowchart-page' ? (
                <div className="field readonly-field">
                  Output size
                  <span>1 editable flowchart page</span>
                </div>
              ) : (
                <label className="field">
                  Slides
                  <select value={slideCountTarget} onChange={(event) => setSlideCountTarget(Number(event.target.value))}>
                    <option value={6}>6</option>
                    <option value={8}>8</option>
                    <option value={10}>10</option>
                  </select>
                </label>
              )}
              <label className="field source-folder">
                Optional source folder
                <span className="folder-picker-row">
                  <span className="folder-name">
                    {sourceSet
                      ? `${sourceSet.folderName} · ${sourceSet.fileCount} files · ${sourceSet.textFileCount} text`
                      : 'No uploaded folder'}
                  </span>
                  <span className="file-button mini-file-button">
                    Choose folder
                    <input type="file" multiple webkitdirectory="" directory="" onChange={uploadFolder} />
                  </span>
                  {sourceSet && (
                    <button type="button" className="ghost-button" onClick={() => setSourceSet(null)}>
                      Clear
                    </button>
                  )}
                </span>
              </label>
              <p className="hint">
                {deckOutput === 'flowchart-page'
                  ? 'One orthogonal flowchart page with Mermaid source plus an editable PPTX made from native shapes.'
                  : 'Apple keynote deck. A folder is used only when the prompt asks for references.'}
              </p>
            </div>
          )}
        </section>

        <section className="panel job-panel">
          <div className="panel-header">
            <h2>4. Generate</h2>
            <span>{job?.status || 'No job'}</span>
          </div>
          <div className="generate-dock">
            <div className="job-summary">
              <p><strong>Output</strong><span>{mode}</span></p>
              <p><strong>Provider</strong><span>{mode === 'deck' ? deckEngine : 'LibTV'}</span></p>
              {mode !== 'deck' && <p><strong>Style</strong><span>{MEDIA_STYLES.find((style) => style.id === creativeStyle)?.label} / {aspectRatio}</span></p>}
              {mode === 'deck' && <p><strong>Sketch</strong><span>{sketchType} / {deckOutput}</span></p>}
              {mode === 'deck' && <p><strong>Source</strong><span>{sourceSummary}</span></p>}
            </div>
            <button className="primary generate-button" onClick={generate} disabled={!generateReady}>Generate</button>
          </div>
          {!selectedProviderReady && (
            <p className="hint">This provider is not configured yet. The draft can be prepared, but confirmation stays locked.</p>
          )}
          <p className="hint status-line">{statusMessage}</p>
          {job?.warnings?.length > 0 && (
            <div className="warning-list">
              {job.warnings.map((warning) => (
                <p className="hint compact-message" key={warning}>{warning}</p>
              ))}
            </div>
          )}
          {mode !== 'deck' && job?.optimizedPrompt && (
            <details className="prompt-preview">
              <summary>Optimized prompt</summary>
              <textarea readOnly value={job.optimizedPrompt} />
            </details>
          )}

          <div className="result-stage">
            {!resultFiles.length && !job?.deck?.previewUrl && (
              <div className="empty-state result-empty">AI output appears here.</div>
            )}
            {resultFiles.length > 0 && (
              <div className="results">
                <h3>Generated result</h3>
                {imageResults.map((file) => (
                  <figure className="result-card" key={file.url}>
                    <img className="result-media" src={file.url} alt={file.label} />
                    <figcaption><a href={file.url} target="_blank" rel="noreferrer">{file.label}</a></figcaption>
                  </figure>
                ))}
                {videoResults.map((file) => (
                  <figure className="result-card" key={file.url}>
                    <video className="result-media" src={file.url} controls playsInline />
                    <figcaption><a href={file.url} target="_blank" rel="noreferrer">{file.label}</a></figcaption>
                  </figure>
                ))}
              </div>
            )}
            {deckPreviewUrl && (
              <div className="results deck-results">
                <div className="deck-preview-frame">
                  <iframe
                    title={job.deck.output === 'flowchart-page' ? 'Flowchart preview' : 'Slidev deck preview'}
                    src={deckPreviewUrl}
                  />
                </div>
                <div className="deck-download-row">
                  {job.deck.slidesUrl && (
                    <button type="button" onClick={() => saveDeckAsset('slides.md', 'slides.md')}>
                      Save slides.md
                    </button>
                  )}
                  <a href={job.deck.previewUrl} target="_blank" rel="noreferrer">Open full preview</a>
                  {job.deck.pptxUrl && (
                    <button
                      type="button"
                      onClick={() =>
                        saveDeckAsset(
                          job.deck.output === 'flowchart-page' ? 'editable-flowchart.pptx' : 'deck.pptx',
                          job.deck.output === 'flowchart-page' ? 'editable-flowchart.pptx' : 'deck.pptx',
                        )
                      }
                    >
                      {job.deck.output === 'flowchart-page' ? 'Save editable PPTX' : 'Save PPTX'}
                    </button>
                  )}
                  {job.deck.slidevPptxUrl && (
                    <button type="button" onClick={() => saveDeckAsset('slidev-export.pptx', 'slidev-export.pptx')}>
                      Save Slidev PPTX
                    </button>
                  )}
                </div>
                {job.deck.output === 'flowchart-page' && job.deck.mermaidSource && (
                  <details className="source-details">
                    <summary>Mermaid source</summary>
                    <textarea
                      className="mermaid-source"
                      readOnly
                      value={job.deck.mermaidSource}
                    />
                  </details>
                )}
              </div>
            )}
          </div>
          {job?.error && <p className="error">{job.error}</p>}
        </section>
      </section>
    </main>
  );
}
