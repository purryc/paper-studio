# Agent Instructions

This is a local Mac app for Desk View paper-sketch capture and cost-aware
generation.
`AGENTS.md` is the source of truth for project rules. Do not create `.claude/`
or `CLAUDE.md` unless the user explicitly asks for Claude Code support.

## Product Goal

Mac Paper Studio turns a Desk View paper sketch plus spoken intent into
AI-generated visuals and decks while keeping cost under user control.

## Source Of Truth

- Product rules live in this file.
- Spec notes live under `specs/`.
- Runtime data lives under `data/` and must not be committed.
- Generated media must be written under `data/results/` or `data/decks/`.

## UX Principles

- The user must see and confirm the cleaned paper sketch and prompt before any paid or quota-consuming generation starts.
- Camera capture defaults to Desk View when available, then Continuity Camera, then the built-in camera, then upload fallback.
- Sketch-to-image generation routes to LibTV first, using the local LibTV skill policy and conservative image defaults.
- Sketch-to-deck generation defaults to `gemini-cli`, with `codex-slidev` as a visible switchable planner.
- Sketch-to-media video generation in the current prototype routes to LibTV first,
  using the cleaned paper crop as the reference image and conservative low-cost
  controls. Gemini/Veo Lite remains the future Google video route when the
  Gemini MCP/Genmedia backend is explicitly enabled.
- Provider and parameter controls must be visible before confirmation, not hidden in advanced-only settings.
- Google Cloud, Vertex AI, Gemini API key, and other pay-as-you-go paths are disabled by default unless the user explicitly enables them.
- Never silently upgrade to a high-cost model or provider.
- If capture cleanup fails, offer manual four-corner correction instead of sending a messy frame.

## Engineering Rules

- Frontend: React + Vite.
- Backend: Node + Fastify.
- Paper cleanup: Python + OpenCV.
- Speech: Whisper CLI by default; browser speech is allowed as a fast local alternative.
- Keep core capture and confirmation interactions local and responsive.
- Long-running AI work must be asynchronous jobs with visible status.
- Gemini CLI and Codex CLI are planner/orchestration surfaces for decks; Slidev source and PPTX export must be saved locally.
- Gemini CLI may orchestrate video generation, but media generation must be implemented through a configured MCP/Genmedia backend or explicit Google API/Vertex route. Do not describe Gemini CLI as a native video-generation command.

## Generation Defaults

- Sketch-to-image default generation is LibTV first.
- Sketch-to-deck default generation is Gemini CLI first, with `codex-slidev` as a user-selectable alternative.
- Current sketch-to-media video defaults to LibTV reference image-to-video.
  Future Google video defaults to the Veo Lite cheapest preset unless the user
  explicitly upgrades model or parameters.
- Do not call Gemini, Codex, Google APIs, Vertex, or LibTV before the user confirms a job.
- Do not enable Google Cloud, Vertex AI, Gemini API key, or other pay-as-you-go routes by default.
- Keep pay-as-you-go paths disabled until the user explicitly enables them.

## Required Local Tools

- `gemini`
- `codex`
- `whisper`
- `ffmpeg`
- `python3` with `cv2`
- local `slidev` dependency after `npm install`

## Optional Generation Backends

- `LIBTV_ACCESS_KEY` for confirmed LibTV sketch-to-image generation
- Gemini CLI for deck planning
- Codex CLI with the Slidev skill for alternate deck planning
- Gemini CLI MCP/Genmedia backend for Google video generation
- Google API/Vertex credentials only when pay-as-you-go is explicitly enabled

## File Placement

- Generated runtime assets belong in `data/`.
- Source code belongs in `src/`, `server/`, or `scripts/`.
