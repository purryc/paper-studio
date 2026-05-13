# Paper Studio Tasks

## Summary

Tasks are ordered for Phase 1 first: UI-triggered Desk View capture, LibTV sketch-to-media, Gemini/Codex Sketch-to-Deck planning, Mermaid flowchart page output, and a hard confirmation gate. MediaPipe ambient triggers are intentionally deferred.

## Phase 1: Setup

- [x] T001 Create `package.json` with scripts `dev`, `dev:server`, `dev:client`, `lint`, `build`, and `test:smoke` in `/Users/hmi/Documents/Desky/paper-studio/package.json`
- [x] T002 Create Vite/React entry files in `/Users/hmi/Documents/Desky/paper-studio/src/main.jsx` and `/Users/hmi/Documents/Desky/paper-studio/src/App.jsx`
- [x] T003 Create shared app styles and design tokens in `/Users/hmi/Documents/Desky/paper-studio/src/styles.css`
- [x] T004 Create Fastify server entry in `/Users/hmi/Documents/Desky/paper-studio/server/index.js`
- [x] T005 Create data directory bootstrap helper in `/Users/hmi/Documents/Desky/paper-studio/server/storage.js`
- [x] T006 Create Python cleanup script placeholder in `/Users/hmi/Documents/Desky/paper-studio/scripts/clean_paper.py`

## Phase 2: Foundational

- [x] T007 Implement stable id, JSON read/write, and runtime path helpers in `/Users/hmi/Documents/Desky/paper-studio/server/storage.js`
- [x] T008 Implement local tool preflight for `gemini`, `whisper`, `ffmpeg`, `python3`, OpenCV, `codex`, `slidev`, and LibTV setup in `/Users/hmi/Documents/Desky/paper-studio/server/preflight.js`
- [x] T009 Implement model catalog defaults in `/Users/hmi/Documents/Desky/paper-studio/server/models.js`
- [x] T010 Implement `GET /api/health` and `GET /api/models` in `/Users/hmi/Documents/Desky/paper-studio/server/index.js`
- [x] T011 Implement frontend API helper in `/Users/hmi/Documents/Desky/paper-studio/src/api.js`
- [x] T012 Implement smoke test harness for camera ranking, upload fallback, draft safety, mock LibTV image, and mock deck generation in `/Users/hmi/Documents/Desky/paper-studio/scripts/smoke-test.mjs`

## Phase 3: User Story 1 - Capture And Clean A Paper Sketch

Independent test: user can preview a camera, click `capture`, and receive raw/clean capture records without starting generation.

- [x] T013 [US1] Implement camera preview and camera selection in `/Users/hmi/Documents/Desky/paper-studio/src/App.jsx`
- [x] T014 [US1] Implement client-side still capture from video canvas in `/Users/hmi/Documents/Desky/paper-studio/src/capture.js`
- [x] T015 [US1] Implement `POST /api/captures` multipart upload in `/Users/hmi/Documents/Desky/paper-studio/server/index.js`
- [x] T016 [US1] Implement OpenCV contour cleanup and safe fallback output in `/Users/hmi/Documents/Desky/paper-studio/scripts/clean_paper.py`
- [x] T017 [US1] Persist capture records and image files under `/Users/hmi/Documents/Desky/paper-studio/data/captures/`
- [x] T018 [US1] Render raw and cleaned sketch review in `/Users/hmi/Documents/Desky/paper-studio/src/App.jsx`

## Phase 4: User Story 2 - Record Or Enter Prompt Intent

Independent test: user can record audio or enter manual text and receive an editable transcript record.

- [x] T019 [US2] Implement browser audio recording controls in `/Users/hmi/Documents/Desky/paper-studio/src/audio.js`
- [x] T020 [US2] Implement manual prompt editor fallback in `/Users/hmi/Documents/Desky/paper-studio/src/App.jsx`
- [x] T021 [US2] Implement `POST /api/transcriptions` in `/Users/hmi/Documents/Desky/paper-studio/server/index.js`
- [x] T022 [US2] Implement Whisper CLI wrapper with failure-to-manual fallback in `/Users/hmi/Documents/Desky/paper-studio/server/transcribe.js`
- [x] T023 [US2] Persist audio and transcript records under `/Users/hmi/Documents/Desky/paper-studio/data/transcripts/`

## Phase 5: User Story 3 - Create Draft And Confirm Generation

Independent test: creating a draft does not call any provider; confirming is the only route that attempts generation or returns setup-blocked status.

- [x] T024 [US3] Implement job creation defaults and validation in `/Users/hmi/Documents/Desky/paper-studio/server/jobs.js`
- [x] T025 [US3] Implement `POST /api/jobs` draft creation in `/Users/hmi/Documents/Desky/paper-studio/server/index.js`
- [x] T026 [US3] Implement `GET /api/jobs/:id` in `/Users/hmi/Documents/Desky/paper-studio/server/index.js`
- [x] T027 [US3] Implement `POST /api/jobs/:id/confirm` with draft-only transition in `/Users/hmi/Documents/Desky/paper-studio/server/index.js`
- [x] T028 [US3] Implement LibTV image worker and Gemini/Codex deck worker setup-blocker behavior in `/Users/hmi/Documents/Desky/paper-studio/server/libtv.js` and `/Users/hmi/Documents/Desky/paper-studio/server/deck.js`
- [x] T029 [US3] Render provider controls, draft summary, confirmation panel, and job status in `/Users/hmi/Documents/Desky/paper-studio/src/App.jsx`
- [x] T030 [US3] Persist job records under `/Users/hmi/Documents/Desky/paper-studio/data/jobs/`

## Phase 6: User Story 4 - Verify Safe Local Workflow

Independent test: commands prove the app builds and the core local API rules are enforced.

- [x] T031 [US4] Add lint configuration for frontend and server files in `/Users/hmi/Documents/Desky/paper-studio/package.json`
- [x] T032 [US4] Add Vite production build configuration in `/Users/hmi/Documents/Desky/paper-studio/vite.config.js`
- [x] T033 [US4] Implement smoke tests for health, model defaults, draft no-provider-call, mock LibTV image result, and mock deck result in `/Users/hmi/Documents/Desky/paper-studio/scripts/smoke-test.mjs`
- [x] T034 [US4] Run `npm run lint` from `/Users/hmi/Documents/Desky/paper-studio`
- [x] T035 [US4] Run `npm run build` from `/Users/hmi/Documents/Desky/paper-studio`
- [x] T036 [US4] Run `npm run test:smoke` from `/Users/hmi/Documents/Desky/paper-studio`
- [x] T037 [US4] Start the local dev server from `/Users/hmi/Documents/Desky/paper-studio` and verify the UI-triggered workflow in a browser

## Phase 6.5: UX Convergence - Sketch To Deck And Flowchart Page

- [x] T037A Update UI to a compact four-panel desktop studio in `/Users/hmi/Documents/Desky/paper-studio/src/App.jsx` and `/Users/hmi/Documents/Desky/paper-studio/src/styles.css`
- [x] T037B Rename `Mind Map to Deck` to `Sketch to Deck` and add sketch type, deck output, and source folder controls
- [x] T037C Add deck job fields for `sketchType`, `deckOutput`, `sourceRoot`, and `sourceManifest`
- [x] T037D Add local source folder scanner for markdown/text excerpts and reference-file manifests
- [x] T037E Add Mermaid flowchart page generation through Slidev and cover it in smoke tests
- [x] T037F Add browser folder picker source upload and `sourceSetId` deck grounding
- [x] T037G Copy cleaned capture into the deck job workspace before Gemini/Codex execution
- [x] T037H Generate editable flowchart PPTX from native PowerPoint shapes with `pptxgenjs`
- [x] T037I Make source folders optional with `sourcePolicy: auto` and remove default Survey grounding from the UI
- [x] T037J Render flowchart preview and editable PPTX with orthogonal Manhattan connectors and no diagonal segments

## Phase 7: Deferred Ambient Trigger Tasks

- [ ] T038 [P] Add MediaPipe dependency and sensing worker in `/Users/hmi/Documents/Desky/paper-studio/src/sensingWorker.js`
- [ ] T039 [P] Add local audio VAD helper in `/Users/hmi/Documents/Desky/paper-studio/src/vad.js`
- [ ] T040 Add `POST /api/sensing/events` in `/Users/hmi/Documents/Desky/paper-studio/server/index.js`
- [ ] T041 Add ambient trigger state machine in `/Users/hmi/Documents/Desky/paper-studio/src/ambientState.js`
- [ ] T042 Add review/discard flow for ambient-created captures and transcripts in `/Users/hmi/Documents/Desky/paper-studio/src/App.jsx`

## Dependencies

- T001-T006 must finish before all implementation tasks.
- T007-T012 must finish before user stories.
- US1 capture can be implemented before US2.
- US3 depends on at least one capture path and a prompt path.
- US4 depends on US1-US3.
- Ambient trigger tasks are deferred until the UI-triggered workflow is verified.

## MVP Scope

MVP is T001-T037. T038-T042 are explicitly out of Phase 1 implementation.
