# 001 Mac Paper Studio Spec Plan

## Summary

Build a Mac-local web studio for capturing paper sketches through Apple Desk View or Continuity Camera, cleaning the paper image, transcribing spoken intent, and routing confirmed jobs to either LibTV sketch-to-media generation or a switchable Gemini CLI / Codex Slidev deck planner.

Paper Studio is a Desky software validation prototype. Phase 1 proves the UI-triggered Desk View capture, speech, draft/confirm safety semantics, LibTV media generation, and Slidev/PPTX deck workflow first; later phases add ambient hand and mouth activity triggers without making sensing accuracy a blocker for the first usable prototype.

This spec is accepted and now guides the local validation prototype implementation.

## Clarifications

### Session 2026-05-07

- Q: Should Phase 1 depend on ambient hand/mouth sensing? -> A: No. Phase 1 uses UI-triggered capture and recording first.
- Q: Are UI controls temporary once ambient triggers exist? -> A: No. UI controls remain the permanent fallback path.
- Q: Can ambient triggers start paid/quota-consuming generation? -> A: No. They may create capture, transcript, or draft records only.
- Q: What is the first implementation goal? -> A: UI-triggered Desk View capture, LibTV sketch-to-media, and sketch-to-deck generation with a hard confirmation gate.

## Product Positioning

Mac Paper Studio is a physical-to-digital director's desk:

- Paper sketch is the source of visual intent.
- Spoken explanation is the source of semantic prompt intent.
- The system cleans and structures inputs before generation.
- The user confirms every generation action before cost or quota is consumed.
- Desk View is the default capture surface because it matches the physical paper workflow.
- LibTV is the default engine for sketch-to-image generation in this prototype.
- Gemini CLI is the default planner for hand-drawn sketch-to-deck generation.
- Codex CLI + Slidev skill is a switchable deck planner for routes already proven inside Codex.
- Gemini/Veo Lite remains the default video path when video generation is enabled, but video is not the first prototype's blocking workflow.
- Ambient Context Computing remains the long-term interaction direction, but V1 is staged: first prove the generation workflow with explicit UI controls, then prove zero-instruction sensing triggers.

## V1 Workflow: Draw Then Explain

1. User opens the local web app on the Mac.
2. User selects Desk View or Continuity Camera.
3. Phase 1: user clicks `capture` to capture a still image of a paper sketch.
4. System creates a raw image and a cleaned paper-sketch image.
5. Phase 1: user clicks `record` or `transcribe` to capture spoken intent.
6. System transcribes speech into editable prompt text.
7. User chooses `Sketch to Media` or `Sketch to Deck`.
8. For media, user chooses `Image` or `Video`, style, and aspect ratio; for deck, user chooses sketch type, deck output, and optionally a source folder.
9. User clicks `Generate`, which creates a draft and immediately confirms it as the user's explicit generation action.
10. System routes confirmed work to the selected provider/model, defaulting to LibTV for image/video and Gemini CLI for deck.

Phase 1 trigger rule:

- UI buttons are the primary trigger mechanism for capture, recording, and generation.
- MediaPipe hand/mouth sensing is not required for Phase 1 acceptance.
- Manual UI buttons remain a permanent fallback after ambient triggers are added.

## Supported Modes

### Image

- Input: cleaned sketch image + confirmed prompt.
- Default route: LibTV via the local `libtv-skill`.
- Default model policy: image generation / edit image defaults to `Seedream 5.0 Lite`, one output, conservative quality, no premium/VIP upgrade unless explicitly confirmed.
- Google image models remain a future optional route when the Gemini CLI MCP/Genmedia backend or explicit Google route is configured.
- Output: local image result path, final prompt, source sketch record.
- Cost label: LibTV image generation, confirmation required.
- Prompt style controls: short-video ad, illustration, watercolor, or cinematic realism.
- Default media aspect ratio: `4:3`, with `16:9`, `9:16`, and `1:1` available.

### Video

- Input: cleaned sketch image + confirmed prompt.
- Current prototype default route: LibTV reference image-to-video using the cleaned paper crop.
- Default model policy: video generation uses `Kling O3`, one output, conservative quality, no premium/VIP/4K upgrade unless explicitly confirmed.
- Future Google route: Gemini/Veo Lite remains optional when the Gemini CLI MCP/Genmedia backend or explicit Google route is configured.
- Output: local MP4 path, final prompt, source sketch record, provider job/session id if available.
- Cost label: LibTV video generation, confirmation required through `Generate`.

### Image To Video

- Step 1: Gemini generates or accepts a still/key visual from the sketch and prompt.
- Step 2: User reviews the still.
- Step 3: User explicitly confirms a video job, defaulting to `veo-3.1-lite-generate-001`.
- Step 4: User may manually upgrade to Fast, Quality, or LibTV fallback.
- Default behavior: never auto-upgrade still generation into video generation.

### Deck / PPT

- V1 status: primary prototype workflow.
- Input: cleaned sketch image + Whisper/manual transcript + optional selected local source folder.
- Sketch types: `Structure`, `Layout`, `Mixed`, and `Flowchart`.
- Deck outputs: `Full deck` or one-page `Flowchart page`.
- Default route: `gemini-cli` generates Slidev markdown, then local Slidev exports web preview and PPTX.
- Alternate route: `codex-slidev` runs `codex exec --image <cleaned.png>` with a prompt that calls the Slidev skill and produces the same Slidev/PPTX output contract.
- Default style: Apple keynote, dark stage, image-first rhythm.
- Flowchart output: generate a legal Mermaid `flowchart` inside a single Slidev page.
- Output: `slides.md`, Slidev preview URL, PPTX path, provider/session metadata.

## Model And Parameter Controls

The provider/model selector is a first-class part of the job-control panel. In the prototype UI, `Generate` is the single explicit confirmation action: the frontend creates a draft and immediately confirms it.

### Prototype Provider Controls

| Workflow | Default | Alternatives | Confirm Behavior |
| --- | --- | --- | --- |
| Sketch to Media / Image | LibTV | Future Gemini image route when explicitly configured | `Generate` creates draft and confirms LibTV |
| Sketch to Media / Video | LibTV `Kling O3` reference flow | Future Gemini/Veo Lite route when explicitly configured | `Generate` creates draft and confirms LibTV |
| Sketch to Deck | `gemini-cli` | `codex-slidev` | `Generate` creates draft and confirms selected CLI planner |

### Video Model Presets

| Preset | Model ID | Default | Use |
| --- | --- | --- | --- |
| Lite | `veo-3.1-lite-generate-001` | Yes | Cheapest short preview and routine drafts |
| Fast | `veo-3.1-fast-generate-001` | No | Better latency/quality balance when user upgrades |
| Quality | `veo-3.1-generate-001` | No | Highest-quality paid/quota-sensitive generation |
| LibTV fallback | LibTV configured model | No | Manual fallback for unsupported video workflows |

### Video Defaults

- `providerId`: `gemini`
- `modelId`: `veo-3.1-lite-generate-001`
- `durationSeconds`: `4`
- `aspectRatio`: `4:3` in the current LibTV-first prototype UI; future Google/Veo route may use `16:9` when selected.
- `resolution`: `720p`
- `sampleCount`: `1`
- `fps`: `24`
- `audioEnabled`: `false`
- `promptRewriteEnabled`: `true`
- `billingPolicy`: `no-payg-default`

### Video Parameter Options

- Duration: 4, 6, or 8 seconds.
- Aspect ratio: 4:3, 16:9, 9:16, or 1:1 in the prototype media UI. Future Google/Veo API route may support only a narrower backend-specific subset.
- Resolution: 720p or 1080p.
- Output count: 1 to 4.
- Audio: off by default; only enabled when the selected model/backend supports it.
- Prompt rewrite: on by default; the confirmation screen shows the final executable English prompt.
- Image-to-video input image limit: 20 MB.

### Image Model Presets

| Preset | Model ID | Default | Use |
| --- | --- | --- | --- |
| LibTV image | Seedream 5.0 Lite through LibTV skill policy | Yes | Current prototype default |
| Fast image | `gemini-3.1-flash-image-preview` | No | Future Gemini image route |
| Pro image | `gemini-3-pro-image-preview` | No | Future higher-quality route |
| Stable image | `gemini-2.5-flash-image` | No | Future stable fallback |

## Cost Defaults

- Image and visual exploration: LibTV image generation by default for this prototype.
- Deck generation: Gemini CLI by default, with Codex Slidev as a visible switchable route.
- Video, image-to-video, video edits, and video continuation: Gemini/Veo Lite by default when that workflow is enabled.
- `veo-3.1-lite-generate-001` is the default video model to maximize AI Pro/subscription value and reduce cost.
- For video, Fast, Quality, API/Vertex, and LibTV are explicit upgrades or fallbacks.
- Google Cloud, Vertex AI, Gemini API key, and other pay-as-you-go routes are disabled by default.
- Every generation starts as a draft job.
- The frontend exposes one `Generate` button; the backend still preserves draft then confirm semantics.
- Batch work defaults to one output and the shortest useful duration before expansion.
- The Generate panel must show the selected provider, output type, style/aspect or deck settings, and final prompt/optimized prompt when available.

## Input Capture Requirements

### Camera

- Primary camera options:
  1. `MacBook Pro Desk View Camera`
  2. `che iphone Desk View Camera`
  3. `che iphone Camera`
  4. `MacBook Pro Camera`
- Screen capture sources such as `Capture screen 0` and `Capture screen 1` are exposed when AVFoundation reports them.
  5. uploaded image fallback
- Server AVFoundation preview should prefer Desk View devices when available.
- Camera labels may be unavailable until the user grants permission.

### Paper Cleanup

The system must send a cleaned sketch, not a raw desk camera frame, to Gemini, Google APIs, Codex, or LibTV.

Required cleanup pipeline:

1. Save raw captured frame.
2. Detect paper contour.
3. Perspective-correct the paper.
4. Crop to paper bounds.
5. Normalize white background.
6. Reduce shadows.
7. Increase sketch-line contrast.
8. Save cleaned image as the canonical generation input.

Manual fallback:

- If contour detection fails or the crop is visibly wrong, user can set four paper corners.
- Manual correction regenerates the cleaned sketch.

### Speech

- Default engine: local Whisper CLI.
- Optional fast mode: browser/Apple speech where available.
- Transcript is always editable before generation.
- User wording is preserved in the editable transcript.
- For Veo, the system may create a separate executable English prompt because current prompt-language support is English-focused.
- Confirmation shows both the user's original prompt and the final prompt that will be sent.

## Future Ambient Trigger Layer

Ambient triggers validate Desky's long-term `Observe -> Understand -> Bounded Act` experience after the UI-triggered workflow is stable.

### Trigger Goals

- Hand activity over the paper triggers drawing capture.
- Mouth activity plus local audio voice activity detection triggers speech recording.
- Ambient triggers may create captures, transcripts, and draft jobs.
- Ambient triggers must never start paid or quota-consuming generation.
- The confirmation gate remains mandatory for Gemini, Google API/Vertex, Codex, or LibTV work.

### Drawing Trigger

The drawing trigger should combine multiple local signals rather than treating any detected hand as drawing:

- A hand is detected inside the paper region of interest.
- Fingertip or pen-grip motion stays near the paper plane.
- Hand motion has a continuous drawing-like trajectory for a short dwell window.
- The cleaned paper image shows local stroke or content change.
- If the trigger is uncertain, the system stays quiet and leaves the UI `capture` button available.

### Speech Trigger

The speech trigger should combine visual and audio signals:

- Face/mouth landmarks indicate mouth or jaw activity.
- Local audio VAD detects speech-like energy.
- Both signals overlap within a short time window.
- The system records with a small pre-roll buffer so the first word is not clipped.
- If the trigger is uncertain, the user can still use `record` or manual text entry.

### Long-Term UI Fallback

These controls remain visible and usable even after ambient sensing ships:

- `capture`
- `record / transcribe`
- `create draft`
- `confirm generation`

## Public Interfaces

### Capture

- `GET /api/cameras`
  - Returns available camera candidates from browser and/or local device listing.
- `POST /api/captures`
  - Accepts captured image or uploaded fallback image.
  - Fields: `sourceDeviceLabel`, `sourceKind: desk-view | camera | upload`.
  - Produces raw image and cleaned image.
  - Returns capture id and image URLs.
- `POST /api/captures/server-snapshot`
  - Captures a still image from a selected AVFoundation camera by `deviceLabel` or `deviceIndex`.
  - Produces the same raw image, paper crop, and cleaned image record as upload capture.

### Speech

- `POST /api/transcriptions`
  - Accepts recorded audio and transcription engine.
  - Returns editable transcript.

### Sources

- `POST /api/sources/folder-upload`
  - Accepts a browser-selected folder via `webkitdirectory`.
  - Optional: deck and flowchart generation must work without any selected source folder.
  - Stores files under `data/source-uploads/{sourceSetId}/`.
  - Reads `.md`, `.markdown`, and `.txt` into source excerpts.
  - Keeps `.pdf`, `.pptx`, `.docx`, `.png`, `.jpg`, and `.webp` as reference manifest entries.
  - Returns `sourceSetId`, folder name, file counts, and manifest.
  - The UI exposes this as the only source-folder control; preset source dropdowns and manual source path inputs are not part of the V1 creation flow.

### Jobs

- `POST /api/jobs`
  - Creates a draft job only.
  - Does not call LibTV, Gemini, Codex, Google API, or Vertex.
  - For `mode: image`, defaults to `providerId: libtv`.
  - For `mode: deck`, accepts `deckEngine: gemini-cli | codex-slidev`, `deckStyle: apple-keynote`, `sketchType`, `deckOutput`, optional `sourceSetId`, optional legacy `sourceRoot`, `sourcePolicy: auto | on | off`, and `exportFormats: ["web", "pptx"]`.
  - For `deckOutput: flowchart-page`, slide count is ignored and output is fixed to one Slidev page.
- `POST /api/jobs/:id/confirm`
  - The only external execution entry.
  - Refuses to run if cleanup failed.
  - Copies the cleaned capture into `data/decks/{jobId}/input.png` before calling Gemini/Codex.
  - With `sourcePolicy: auto`, scans and injects source excerpts only when the prompt explicitly asks for references, documents, folders, or sources.
  - For `flowchart-page`, asks the CLI for Mermaid only; the backend generates Slidev-compatible markdown, orthogonal preview, and editable PPTX.
- `GET /api/jobs/:id`
  - Returns image result files, Slidev preview URL, Mermaid source, editable PPTX path, provider/session metadata, and errors.
- `GET /api/jobs/:id/download/:asset`
  - Returns deck artifacts with `Content-Disposition` for browser download.
- `POST /api/jobs/:id/save/:asset`
  - Copies deck artifacts such as `editable-flowchart.pptx` directly into `~/Downloads` and returns the saved path.

### Future Sensing

- `POST /api/sensing/events`
  - Future route for local sensing events such as `hand_activity`, `drawing_started`, `drawing_stopped`, `mouth_activity`, `speech_started`, and `speech_stopped`.
  - Does not call a generation provider.
  - Does not move a job out of `draft`.

### Models

- `GET /api/models`
  - Returns model catalog entries for capture cleanup, image, deck, video, and fallback providers.
  - Includes availability, setup status, default flag, supported parameters, preview/GA label, and billing label.
  - Does not call a generation provider.

### Jobs

- `POST /api/jobs`
  - Creates a draft job.
  - Does not call Gemini, Google APIs, Vertex, Codex, or LibTV.
  - Image fields: `mode`, `captureId`, `prompt`, `providerId`.
  - Deck fields: `mode`, `captureId`, `prompt`, `deckEngine`, `deckStyle`, `sketchType`, `deckOutput`, optional `sourceSetId`, optional legacy `sourceRoot`, `sourcePolicy`, `exportFormats`, `slideCountTarget`.
  - Flowchart page fields: `deckOutput: flowchart-page` fixes output to one page and returns `deck.mermaidSource`, `deck.mermaidUrl`, `deck.previewUrl`, `deck.pptxUrl`, optional `deck.slidevPptxUrl`, and `deck.inputImagePath`.
  - Flowchart preview uses the backend graph spec and orthogonal SVG/HTML overlay so Mermaid auto-layout diagonals do not become the final visual output.
  - Editable flowchart PPTX uses native shapes and Manhattan line segments; any diagonal connector segment is a validation failure.
  - Future video fields: `modelId`, `durationSeconds`, `aspectRatio`, `resolution`, `sampleCount`, `fps`, `audioEnabled`, `promptRewriteEnabled`, `billingPolicy`.
- `POST /api/jobs/:id/confirm`
  - Revalidates provider availability, selected model, parameters, input size, and billing policy.
  - Starts generation only after successful validation.
- `GET /api/jobs/:id`
  - Returns job state, route, provider, model, parameters, progress, result URLs, local paths, errors.
- `POST /api/jobs/:id/upgrade-to-video`
  - Creates a new Gemini/Veo video draft from a selected still image.
  - Defaults to `veo-3.1-lite-generate-001`.
  - Requires separate confirmation.

## Job State Model

States:

- `draft`: created, no cost or quota consumed.
- `queued`: confirmed and waiting to run.
- `running`: worker started.
- `needs-review`: intermediate output is ready, awaiting user decision.
- `completed`: result saved.
- `failed`: terminal error.

Important rule:

- Only `confirm` can move a job out of `draft`.

## Local Data Model

Runtime data should live under `data/`:

- `data/uploads/`
- `data/captures/`
- `data/transcripts/`
- `data/jobs/`
- `data/results/`
- `data/decks/`

Each job record should include:

- id
- mode
- provider id
- model id or deck engine
- model label or deck style
- route
- capture id
- original prompt
- final prompt
- billing policy
- billing source
- quota or cost label
- duration seconds
- aspect ratio
- resolution
- sample count
- fps
- audio enabled
- prompt rewrite enabled
- trigger source
- sensing events
- status
- timestamps
- source files
- output files
- Slidev preview URL and PPTX path for deck jobs
- remote URLs or provider job ids
- setup requirement if disabled
- error message if failed

## Worker Policy

### LibTV Image Worker

Responsibilities:

- default sketch-to-image generation
- upload cleaned sketch as reference
- apply local LibTV skill policy for conservative image model selection
- local result persistence

Constraints:

- Must run asynchronously.
- Requires `LIBTV_ACCESS_KEY` before confirmation can run.
- Must write image outputs to `data/results/`.
- Prompt includes visible cost constraint and no premium/VIP upgrade.
- Polls session progress and downloads final results locally.
- Times out with actionable status rather than hiding the project state.
- Must not be required for camera preview, capture, cleanup, recording, transcription, draft creation, or confirmation UI.
- Provider failure must not silently fall back to Gemini, Codex, Vertex, or Google pay-as-you-go.

### Deck Planner Worker

Responsibilities:

- plan a deck from cleaned mind-map image and transcript
- generate `slides.md`
- export local Slidev web preview and PPTX
- support `gemini-cli` and `codex-slidev`

Constraints:

- Must run asynchronously.
- Must write deck outputs to `data/decks/`.
- Must not be required for capture, cleanup, recording, transcription, or draft creation.
- If the selected CLI or Slidev is unavailable, the provider remains visible but disabled with setup guidance.
- Provider failure must not silently switch from Gemini CLI to Codex CLI or the reverse.

### Gemini Video Worker

Responsibilities:

- future video generation through Veo
- future image-to-video through Veo
- prompt rewrite into executable English when needed
- local MP4 persistence

Constraints:

- Must run asynchronously.
- Must write video outputs to `data/results/`.
- Must not be required for the Phase 1 sketch-to-image or deck workflow.
- Gemini CLI may orchestrate generation, but the media operation must be performed by a configured MCP/Genmedia backend or an explicitly enabled Google route.
- If Gemini CLI or the media backend is unavailable, Gemini models remain visible but disabled with setup guidance.
- Provider failure must not silently fall back to Codex, Vertex, Google pay-as-you-go, or LibTV.

### Google API / Vertex Worker

Responsibilities:

- Optional direct Google image/video route when explicitly enabled.
- Exact model and parameter execution when the user chooses a Google route that requires API/Vertex credentials.

Constraints:

- Disabled by default under `no-payg-default`.
- Requires explicit setup and user enablement before it appears as executable.
- Must show a cost/quota warning before confirmation.
- Must not be used as an automatic fallback from Gemini CLI/MCP failure.

### Codex Worker

Responsibilities:

- alternate `codex-slidev` deck planner
- sketch interpretation for deck structure
- Slidev markdown generation when selected

Constraints:

- Must run asynchronously.
- Must write outputs to `data/decks/`.
- Must not be required for camera preview, capture, cleanup, recording, transcription, draft creation, or confirmation UI.
- Must never run unless the user selects `codex-slidev` and confirms the job.

### LibTV Worker

Responsibilities:

- manual fallback video generation
- manual fallback image-to-video
- video edit / extension when explicitly selected

Constraints:

- Requires `LIBTV_ACCESS_KEY`.
- Uses cleaned sketch or selected Gemini/Codex image as reference.
- Prompt includes visible cost constraint.
- Polls session progress.
- Downloads final results locally.
- Times out with actionable status rather than hiding the project state.
- Must never be selected automatically because a Gemini video route failed.

## UX Requirements

- First screen is the working studio, not a landing page.
- Three primary regions:
  - camera/capture
  - cleaned sketch review
  - prompt/job control
- Model and parameter controls are part of the job-control region.
- Phase 1 uses explicit UI controls as the main trigger path.
- Ambient triggers are a later enhancement, not a Phase 1 dependency.
- User should always know:
  - which input image will be sent
  - which original prompt they wrote
  - which final prompt will be sent
  - which provider will run
  - which model will run
  - which parameters will run
  - whether cost/credits/quota will be consumed
  - current job status
- Buttons must separate:
  - capture
  - record / transcribe
  - create draft
  - confirm generation
- No paid/quota-consuming action should happen from a single accidental capture or recording action.
- Upgrading from Lite to Fast, Quality, API/Vertex, or LibTV requires a visible higher-cost warning.
- If ambient sensing is unavailable or wrong, UI buttons must still complete the same workflow.

## Error Handling

- No camera permission: show next action to enable browser camera permission.
- No Desk View device: fall back to available camera and label quality risk.
- Bad paper crop: offer manual corner correction.
- Whisper unavailable: allow browser speech or manual text entry.
- Gemini CLI unavailable: keep Gemini models visible but disabled and explain setup.
- Gemini media backend unavailable: explain MCP/Genmedia setup; do not auto-fallback.
- Google API/Vertex disabled: explain `no-payg-default` and how to explicitly enable it.
- LibTV key missing: disable LibTV fallback and explain `LIBTV_ACCESS_KEY`.
- Image-to-video input over 20 MB: reject before confirmation and offer compression or another image.
- Upload over provider limit: reject before provider upload.
- Generation timeout: preserve job record and remote project URL/provider job id if available.
- Ambient trigger unavailable: keep UI-triggered capture and recording fully usable.
- False ambient trigger: allow discard before draft creation and never start generation.

## Acceptance

- Capture, cleanup, transcription, job creation, confirmation, and status polling work locally.
- Phase 1 can complete capture, recording/transcription, draft creation, confirmation, LibTV sketch-to-media generation, and Slidev/PPTX deck generation through UI triggers.
- Phase 1 does not require MediaPipe, hand tracking, mouth tracking, or ambient auto-triggering.
- No generation starts before the explicit `Generate` action.
- Cleaned paper image is the submitted reference asset.
- Results are saved locally under provider-specific `data/results/` folders.
- Image-only work defaults to LibTV image generation.
- Deck work defaults to `gemini-cli` and can be switched to `codex-slidev`.
- Sketch-to-deck supports structure, layout, mixed, and flowchart sketches.
- Flowchart page output saves Mermaid source, renders a full-page orthogonal HTML preview, and exports editable PPTX from native PowerPoint shapes.
- Current sketch-to-media video work defaults to LibTV reference image-to-video with low-cost controls.
- Current media UI defaults to 4:3. Future Google video job record defaults to `veo-3.1-lite-generate-001`, 4 seconds, 720p, one output, 24 FPS, audio off, with backend-supported aspect ratio selected explicitly.
- Fast, Quality, Google API/Vertex, Gemini image, Codex, and Google video routes are explicit selections, not silent fallbacks.
- Image-to-video requires user review between still generation and video generation.
- Chinese prompt workflows show both original user text and final executable English prompt before confirmation.
- Input images larger than 20 MB cannot be confirmed for image-to-video.
- Ambient triggers, when added later, never bypass the confirmation gate.

## Implementation Phases

### Phase 1: UI-Triggered End-To-End Workflow

- Build local web shell.
- Desk View-first camera preview and still capture.
- UI `capture` button.
- OpenCV paper cleanup.
- Upload image fallback.
- Audio recording.
- UI `record / transcribe` control.
- Whisper transcription.
- Draft job creation.
- LibTV sketch-to-image default selection.
- Gemini CLI / Codex Slidev deck planner switch.
- Sketch type, deck output, and deck source folder controls.
- Mermaid flowchart page output.
- Slidev web preview and PPTX export.
- Confirmation gate.
- Confirmed LibTV image path.
- Confirmed deck planner path.
- Job status UI.

### Phase 2: Gemini Model Catalog And Video Generation Hardening

- Static model catalog for Gemini image, Veo Lite/Fast/Quality, Codex fallback, and LibTV video fallback.
- `GET /api/models` endpoint.
- Gemini CLI availability check.
- Gemini MCP/Genmedia backend availability check.
- No PAYG default enforcement.
- Future Gemini image worker.
- Gemini/Veo Lite video worker.
- Default Lite video job parameters.
- Parameter validation.
- Image-to-video 20 MB guard.
- Local image and MP4 persistence.
- Failure handling without Codex, Google API/Vertex, or LibTV fallback.
- Cost/quota warning for upgraded parameters.

### Phase 3: MediaPipe Hand And Mouth Sensing

- MediaPipe hand landmark or gesture sensing for paper-region activity.
- MediaPipe face/mouth sensing for mouth activity.
- Local audio VAD for speech activity.
- Sensing status UI.
- No generation calls from sensing events.

### Phase 4: Ambient Auto-Trigger State Machine

- Drawing capture trigger from sustained hand activity over the paper.
- Speech recording trigger from mouth activity plus local VAD.
- Pre-roll buffers for drawing and speech.
- Review/discard flow before draft creation.
- UI controls remain available as fallback.

### Phase 5: Manual Fallbacks And Deck Extension

- Optional Codex image fallback.
- Optional LibTV video fallback.
- Optional Google API/Vertex route only when explicitly enabled.
- Add richer storyboard/deck planning route.
- Later generate native PowerPoint via Codex + Presentations plugin if Slidev export is not enough.

## References

- Gemini CLI MCP: https://google-gemini.github.io/gemini-cli/docs/tools/mcp-server.html
- Gemini CLI features and install: https://google-gemini.github.io/gemini-cli/
- Veo 3.1 model specs: https://docs.cloud.google.com/vertex-ai/generative-ai/docs/models/veo/3-1-generate
- Gemini image generation models: https://docs.cloud.google.com/vertex-ai/generative-ai/docs/multimodal/image-generation
