# Paper Studio Requirements Quality Checklist

Purpose: Validate whether the Phase 1 requirements are complete, clear, consistent, and ready for implementation. This checklist tests the written requirements, not the code.

Created: 2026-05-07

## Requirement Completeness

- [ ] CHK001 Are Phase 1 trigger requirements explicitly limited to UI controls before MediaPipe work begins? [Completeness, Spec §V1 Workflow]
- [ ] CHK002 Are the required UI controls named for capture, recording/transcription, draft creation, and confirmation? [Completeness, Spec §UX Requirements]
- [ ] CHK003 Are local data directories specified for captures, audio, transcripts, jobs, and provider results? [Completeness, Spec §Local Data Model]
- [ ] CHK004 Are external provider setup requirements documented for Gemini, Google API/Vertex, Codex, and LibTV? [Completeness, Spec §Worker Policy]

## Requirement Clarity

- [ ] CHK005 Is the default video job configuration fully quantified with model id, duration, aspect ratio, resolution, sample count, FPS, audio, and billing policy? [Clarity, Spec §Video Defaults]
- [ ] CHK006 Is the confirmation gate described as the only transition out of `draft`? [Clarity, Spec §Job State Model]
- [ ] CHK007 Is the difference between Gemini CLI orchestration and MCP/Genmedia media execution clearly stated? [Clarity, Spec §Product Positioning]
- [ ] CHK008 Is `no-payg-default` defined clearly enough to prevent accidental API/Vertex billing? [Clarity, Spec §Cost Defaults]

## Requirement Consistency

- [ ] CHK009 Do the acceptance criteria align with the implementation phases, especially Phase 1 UI-triggered end-to-end workflow? [Consistency, Spec §Acceptance and §Implementation Phases]
- [ ] CHK010 Are fallback providers consistently described as manual selections rather than automatic fallbacks? [Consistency, Spec §Supported Modes and §Worker Policy]
- [ ] CHK011 Are ambient trigger requirements consistently deferred beyond Phase 1? [Consistency, Spec §Future Ambient Trigger Layer]

## Scenario Coverage

- [ ] CHK012 Are the primary user journey steps complete from camera selection through confirmed generation? [Coverage, Spec §V1 Workflow]
- [ ] CHK013 Are error states specified for missing camera permission, bad crop, Whisper failure, Gemini setup failure, and provider timeout? [Coverage, Spec §Error Handling]
- [ ] CHK014 Are future ambient false-trigger and unavailable-trigger scenarios defined without affecting Phase 1? [Coverage, Spec §Error Handling]

## Acceptance Criteria Quality

- [ ] CHK015 Can Phase 1 completion be objectively evaluated without requiring MediaPipe? [Acceptance Criteria, Spec §Acceptance]
- [ ] CHK016 Can generation safety be objectively evaluated by checking draft/confirm separation? [Acceptance Criteria, Spec §Acceptance]
- [ ] CHK017 Can default LibTV image and Gemini CLI deck selection be objectively checked in job records? [Acceptance Criteria, Spec §Acceptance]

## Dependencies & Assumptions

- [ ] CHK018 Are local tool assumptions documented for Node, Python, ffmpeg, whisper, gemini, codex, slidev, and LibTV credentials? [Dependency, Plan §Technical Context]
- [ ] CHK019 Are setup blockers specified as user-visible states rather than implementation exceptions only? [Assumption, Spec §Error Handling]
- [ ] CHK020 Are privacy-sensitive defaults documented for camera, microphone, cleanup, transcription, and generation? [Security/Privacy, Spec §Cost Defaults and Plan §Constitution Check]
