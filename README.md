# Paper Studio

Paper Studio is a Mac-local prototype for turning Desk View paper sketches into AI media and editable deck artifacts.

The current prototype focuses on a reliable explicit workflow:

1. Capture a sketch from Apple Desk View, Continuity Camera, screen capture, or image upload.
2. Clean and focus the paper area with OpenCV.
3. Add intent through text or local speech transcription.
4. Generate either media through LibTV or deck output through Gemini CLI / Codex CLI.
5. For flowcharts, render a full-page preview and save an editable PowerPoint made from native shapes.

The app keeps runtime captures, generated media, transcripts, and job records local under `data/`. That folder is ignored by git.

## Current Workflows

### Sketch To Media

- Input: cleaned paper sketch plus user intent.
- Output: image or video result.
- Default provider: LibTV.
- Default style: short-video ad style.
- Default aspect ratio: `4:3`.
- Optional styles: illustration, watercolor, cinematic realism.

### Sketch To Deck

- Input: cleaned paper sketch plus user intent.
- Planner options: `gemini-cli` or `codex-slidev`.
- Output options: full deck or one-page flowchart.
- Source folder: optional. It is used only when the prompt explicitly asks for references, documents, folder context, or source material.
- Flowchart output:
  - `diagram.mmd`
  - `slides.md`
  - full-page HTML preview
  - `editable-flowchart.pptx` saved to `~/Downloads`

## Safety Defaults

- Capture and draft creation do not call any external provider.
- `Generate` is the single explicit confirmation action.
- Runtime `data/` is not committed.
- Google API / Vertex / other pay-as-you-go routes are not enabled by default.
- The app does not silently upgrade to premium or high-cost models.

## Quick Start

```bash
npm install
npm run dev
```

Open:

```text
http://127.0.0.1:5173/
```

For camera access on macOS, prefer launching through:

```bash
open "Start Paper Studio Camera.command"
```

This starts the Vite frontend and Fastify backend from an app path that macOS can grant camera permission to.

## Verification

```bash
npm run lint
npm run build
npm run test:smoke
```

Live provider checks are intentionally gated:

```bash
PAPER_STUDIO_ALLOW_LIVE=1 npm run test:live:libtv
PAPER_STUDIO_ALLOW_LIVE=1 npm run test:live:deck:gemini
PAPER_STUDIO_ALLOW_LIVE=1 npm run test:live:deck:codex
```

## Documentation

- Product spec: [`specs/001-mac-paper-studio/spec.md`](specs/001-mac-paper-studio/spec.md)
- Implementation plan: [`specs/001-mac-paper-studio/plan.md`](specs/001-mac-paper-studio/plan.md)
- Data model: [`specs/001-mac-paper-studio/data-model.md`](specs/001-mac-paper-studio/data-model.md)
- API contract: [`specs/001-mac-paper-studio/contracts/openapi.yaml`](specs/001-mac-paper-studio/contracts/openapi.yaml)
- Dependencies: [`docs/DEPENDENCIES.md`](docs/DEPENDENCIES.md)
- Architecture: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)

## Repository Hygiene

Committed source:

- `src/` frontend
- `server/` local API and workers
- `scripts/` cleanup/dev/test helpers
- `specs/` durable SDD artifacts
- `docs/` operational documentation

Ignored local runtime state:

- `node_modules/`
- `dist/`
- `data/`
- `.env`
- `.DS_Store`

