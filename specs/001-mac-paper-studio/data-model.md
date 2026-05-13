# Paper Studio Data Model

## Capture

- `id`: unique local capture id.
- `createdAt`: ISO timestamp.
- `rawImagePath`: path under `data/captures/`.
- `rawImageUrl`: browser-visible `/data/captures/...` URL.
- `cleanImagePath`: optional path under `data/captures/`.
- `cleanImageUrl`: optional browser-visible `/data/captures/...` URL.
- `paperCropPath`: optional focused paper crop path under `data/captures/`.
- `paperCropUrl`: optional browser-visible `/data/captures/...` URL.
- `sourceDeviceLabel`: camera or upload source label.
- `sourceKind`: `desk-view | camera | upload`.
- `cleanupStatus`: `pending | completed | failed`.
- `cleanupError`: optional string.
- `paperFocusUsed`: boolean.
- `paperFocusMethod`: `perspective | bounding-box | none`.
- `paperBoundingBox`: optional `{ x, y, width, height }`.
- `paperCorners`: optional four-point array for future manual rectification.

## Transcript

- `id`: unique local transcript id.
- `createdAt`: ISO timestamp.
- `audioPath`: optional path under `data/transcripts/`.
- `engine`: `whisper | browser | manual`.
- `text`: editable transcript text.
- `status`: `pending | completed | failed`.
- `error`: optional string.

## Model Catalog Entry

- `providerId`: `libtv | gemini-cli | codex-slidev | gemini | google-api | vertex`.
- `modelId`: optional provider model id.
- `label`: human-readable model name.
- `mode`: `image | deck | video | image-to-video`.
- `isDefault`: boolean.
- `availability`: `available | disabled | setup-required`.
- `billingPolicy`: `no-payg-default | subscription | payg-explicit | manual-fallback`.
- `supportedParameters`: duration, aspect ratio, resolution, sample count, audio, prompt rewrite.
- `setupMessage`: optional user-facing setup text.

## Job

- `id`: unique local job id.
- `createdAt`: ISO timestamp.
- `updatedAt`: ISO timestamp.
- `mode`: `image | video | image-to-video | deck`.
- `outputType`: `image | video | deck`.
- `status`: `draft | queued | running | needs-review | completed | failed`.
- `captureId`: linked capture id.
- `transcriptId`: optional linked transcript id.
- `originalPrompt`: user-written or transcribed prompt.
- `finalPrompt`: executable prompt shown at confirmation.
- `providerId`: selected provider id.
- `modelId`: selected model id for media jobs.
- `deckEngine`: `gemini-cli | codex-slidev` for deck jobs.
- `deckStyle`: default `apple-keynote`.
- `sketchType`: `structure | layout | mixed | flowchart` for deck jobs.
- `deckOutput`: `full-deck | flowchart-page` for deck jobs.
- `sourceSetId`: optional uploaded folder source set from `/api/sources/folder-upload`.
- `sourceRoot`: optional legacy local folder path, not exposed in the V1 UI.
- `sourcePolicy`: `auto | on | off`, default `auto`; `auto` uses sources only when the prompt asks for references/documents/folders.
- `sourceContextUsed`: boolean recording whether source context was actually injected.
- `sourceContextReason`: `prompt-requested-source | selected-but-prompt-did-not-request-source | no-source-selected | forced-on | forced-off`.
- `sourceManifest`: scanned source folder/upload manifest, populated only after confirmation starts and only when `sourceContextUsed` is true.
- `exportFormats`: default `["web", "pptx"]` for deck jobs.
- `slideCountTarget`: default `8` for deck jobs.
- `durationSeconds`: video duration, default `4`.
- `aspectRatio`: default `16:9`.
- `resolution`: default `720p`.
- `sampleCount`: default `1`.
- `fps`: default `24`.
- `audioEnabled`: default `false`.
- `promptRewriteEnabled`: default `true`.
- `billingPolicy`: default `no-payg-default`.
- `triggerSource`: `ui | hand_activity | speech_activity | combined_activity`.
- `sourceFiles`: raw image, clean image, paper crop, audio, transcript paths.
- `outputFiles`: provider result paths.
- `resultFiles`: local image/video result records for the current job only.
- `deck`: `inputImagePath`, `slidesPath`, `slidesUrl`, `previewUrl`, `mermaidSource`, `mermaidUrl`, `pptxPath`, `pptxUrl`, optional `slidevPptxUrl`, and output metadata for deck jobs.
- `remoteUrls`: optional provider URLs or job ids.
- `warnings`: non-terminal generation warnings such as provider fallback or Mermaid repair.
- `error`: optional terminal error message.

## Source Set

- `sourceSetId`: local uploaded-folder id.
- `folderName`: browser-selected folder name.
- `fileCount`: supported files saved.
- `textFileCount`: markdown/text files read into excerpts.
- `manifest.files`: supported file list with relative paths and `kind: text | reference`.
- `manifest.textBundle`: bounded excerpts from `.md`, `.markdown`, and `.txt`.
- Reference-only files include `.pdf`, `.pptx`, `.docx`, `.png`, `.jpg`, `.jpeg`, and `.webp`.

## Flowchart Deck Output

- `diagram.mmd`: extracted Mermaid `flowchart TD | LR` source.
- `slides.md`: one Slidev-compatible page with the Mermaid code block and `MERMAID_SOURCE` notes.
- `dist/index.html`: inline web preview rendered from the backend graph spec as an orthogonal SVG/HTML overlay, avoiding Mermaid auto-layout diagonals and Slidev CLI/native-binding failures.
- `editable-flowchart.pptx`: editable PowerPoint made with native shapes, text boxes, and 90-degree Manhattan line segments.
- `slidev-deck.pptx`: optional Slidev export, kept separate from the editable PPTX to avoid mislabeling screenshots as editable output.
- Flowchart connectors must attach to node-edge center ports; arrowheads appear only on the final segment; text labels use readable white-backed labels; no visible text may be below 9pt/px.

## State Transitions

- Capture: `pending -> completed | failed`.
- Transcript: `pending -> completed | failed`.
- Job: `draft -> queued -> running -> completed | failed`.
- Job with review: `draft -> queued -> running -> needs-review -> draft/video-upgrade -> queued`.
- Only `POST /api/jobs/:id/confirm` may move a job out of `draft`.
