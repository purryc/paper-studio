# Paper Studio Quickstart

## Goal

Run the Phase 1 UI-triggered workflow locally: capture a paper sketch from Desk View, clean image, record/transcribe speech, click `Generate`, and produce LibTV media or Gemini/Codex Slidev deck output.

## Expected Setup

- Node.js 24+
- npm 11+
- Python 3
- Python package `opencv-python` and `numpy`
- `ffmpeg`
- `whisper`
- `gemini` CLI for the default deck planner
- `codex` CLI for the alternate `codex-slidev` planner
- `LIBTV_ACCESS_KEY` for real LibTV sketch-to-image execution

Provider entries remain visible but disabled until their required local tool and credential setup is available.

## Run

```bash
npm install
npm run dev
```

Open the local app URL printed by Vite.

For macOS camera permission, prefer:

```bash
open "Start Paper Studio Camera.command"
```

This starts the same dev services while letting macOS grant camera access to the launcher app.

## Phase 1 Smoke Flow

1. Grant camera permission.
2. Select Desk View or available fallback camera.
3. Click `capture`.
4. Confirm a raw and cleaned sketch are shown.
5. Record audio or enter manual prompt text.
6. Choose `Sketch to Media` or `Sketch to Deck`.
7. For deck work, choose sketch type and output type. Source folder is optional.
8. Click `Generate`.
9. If the selected provider is unavailable, expect an actionable setup state and no silent fallback.

## Workflows

- `Sketch to Media`: capture/upload sketch -> OpenCV cleanup -> choose image/video, style, and aspect ratio -> `Generate` -> LibTV result under `data/results/`.
- `Sketch to Deck`: capture/upload sketch -> transcript/manual prompt -> choose sketch type/output/source folder if needed -> choose `gemini-cli` or `codex-slidev` -> `Generate` -> `slides.md`, preview, and PPTX under `data/decks/`.
- `Flowchart page`: choose `Sketch type: Flowchart` and `Deck output: Flowchart page` to render a full-page orthogonal flowchart preview and create an editable PPTX from native shapes.

## Saving Outputs

Deck artifacts can be saved directly to `~/Downloads` from the UI:

- `Save slides.md`
- `Save editable PPTX`
- `Save Slidev PPTX` when available

The direct-save path avoids browser download-history filename issues and keeps generated files easy to find in Finder.

## Verification Commands

```bash
npm run lint
npm run build
npm run test:smoke
```

If a command is not yet implemented, tasks must add it before claiming Phase 1 complete.
