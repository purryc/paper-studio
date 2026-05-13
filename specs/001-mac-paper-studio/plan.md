# Paper Studio Implementation Plan

## Summary

Build Phase 1 as a local React + Vite studio backed by Fastify. The prototype must let the user capture a paper sketch from Desk View, clean it with OpenCV, record or enter speech intent, create a draft job, review provider controls, and confirm generation. Sketch-to-image defaults to LibTV; mind-map-to-deck defaults to Gemini CLI and can switch to Codex CLI + Slidev. Every external call is gated by preflight and confirmation.

## Technical Context

- Frontend: React + Vite, browser camera/audio APIs, code-native UI controls.
- Backend: Node.js + Fastify, local filesystem persistence under `data/`.
- Paper cleanup: Python 3 + OpenCV script invoked by the backend.
- Speech: local Whisper CLI by default, manual text fallback.
- Generation: LibTV-first for image; Gemini CLI or Codex CLI for deck planning; confirmed jobs call a worker only when the selected provider setup is available.
- Privacy: keep capture, cleanup, and transcription local by default; do not commit runtime data.

## Constitution Check

- Rules before work: satisfied by `AGENTS.md` and this feature spec.
- UX first: the first screen is the studio workflow, with explicit status and next actions.
- Source files win: Markdown specs and source code are authoritative; generated data lives under `data/`.
- Privacy-sensitive by default: camera, microphone, and cleanup stay local unless the user explicitly confirms generation.
- Verification before completion: implementation must run app checks and endpoint smoke tests before handoff.

## Architecture

The app has three runtime layers:

- Studio UI: camera preview/capture, cleaned sketch review, prompt/transcription editor, model controls, draft/confirm controls, and job status.
- Local API: capture upload, paper cleanup orchestration, transcription upload, provider catalog, job persistence, and confirmation gate.
- Workers: OpenCV cleanup, Whisper transcription, LibTV image generation, and Gemini/Codex deck planning. Provider workers are never called from capture, transcription, or draft creation.

## Data And Storage

- Store runtime files under `data/uploads/`, `data/captures/`, `data/transcripts/`, `data/jobs/`, `data/results/`, and `data/decks/`.
- Use JSON files for Phase 1 job/capture/transcript records.
- Job records include provider/model fields, prompt fields, selected parameters, billing policy, status, output paths, and errors.

## Public Interfaces

- `GET /api/health`
- `GET /api/models`
- `POST /api/captures`
- `POST /api/captures/:id/rectify`
- `POST /api/transcriptions`
- `POST /api/jobs`
- `POST /api/jobs/:id/confirm`
- `GET /api/jobs/:id`

See `contracts/openapi.yaml` for request and response shapes.

## Implementation Order

1. Create the project skeleton and scripts.
2. Implement filesystem storage and ID helpers.
3. Implement model catalog and preflight.
4. Implement capture upload and OpenCV cleanup script.
5. Implement audio upload and Whisper transcription wrapper.
6. Implement draft job persistence and confirmation gate.
7. Implement LibTV image worker and deck planner workers with setup-blocker behavior.
8. Implement the React studio UI.
9. Verify endpoint smoke tests and browser workflow.

## Risks And Mitigations

- Selected provider unavailable: show disabled provider state and actionable setup message; do not fallback silently.
- OpenCV missing: return capture failure with manual-correction path reserved.
- Whisper failure: allow manual text entry and preserve audio file.
- Camera permission denied: show browser permission guidance.
- Accidental generation: draft and confirm remain separate actions.
