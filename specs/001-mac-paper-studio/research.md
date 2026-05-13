# Paper Studio Research Decisions

## Decision: Phase 1 Is UI-Triggered End-To-End

**Rationale:** The fastest useful validation is proving the Desk View capture, cleanup, speech, draft, confirmation, LibTV sketch-to-image workflow, and Gemini/Codex Slidev deck workflow. MediaPipe sensing is central to the Desky blueprint, but it should not block the first working prototype.

**Alternatives considered:** Starting with MediaPipe hand/mouth triggers first. Rejected because false positives and calibration would delay proving the core physical-to-digital generation loop.

## Decision: React + Vite Frontend

**Rationale:** The project rules already specify React + Vite. The first screen is a working studio, not a landing page, so React state and browser media APIs fit the capture/record/review workflow.

**Alternatives considered:** Static HTML and Next.js. Static HTML is too thin for the capture state machine; Next.js adds unnecessary server complexity for a local prototype.

## Decision: Node + Fastify Backend

**Rationale:** The project rules specify Node + Fastify. Fastify is enough for local APIs, file uploads, job records, and worker orchestration without introducing a heavier app framework.

**Alternatives considered:** Python-only backend. Rejected because browser/UI orchestration and local API endpoints are simpler to keep in one Node service while delegating OpenCV cleanup to a script.

## Decision: Python + OpenCV Paper Cleanup

**Rationale:** The spec requires perspective correction, crop, shadow reduction, white normalization, and contrast enhancement. Python OpenCV is the most direct implementation path and keeps cleanup isolated from the web server.

**Alternatives considered:** Browser-only canvas cleanup. Rejected for Phase 1 because contour detection and perspective correction are more reliable and maintainable in OpenCV.

## Decision: Whisper CLI First For Speech

**Rationale:** The local `whisper` CLI exists on this machine and aligns with the privacy-sensitive default. Browser speech remains an optional fast mode.

**Alternatives considered:** Cloud transcription. Rejected for default path because desktop/camera/microphone capture should prefer local processing.

## Decision: External Generation Starts Behind Confirm

**Rationale:** The spec requires draft creation to consume no cost/quota. Generation workers must only run after `/api/jobs/:id/confirm`.

**Alternatives considered:** Generate immediately after capture or prompt entry. Rejected because it violates cost control and Desky's bounded-action principle.

## Decision: Provider Setup Missing Is A Setup Blocker, Not A Silent Fallback

**Rationale:** The UI should show LibTV, Gemini CLI, Codex CLI, and Slidev provider routes as unavailable with setup guidance when their local requirements are missing; it must not silently route to another provider, Google API/Vertex, or any paid fallback.

**Alternatives considered:** Stub successful generation or fall back to another provider. Rejected because this would create false validation and cost ambiguity.
