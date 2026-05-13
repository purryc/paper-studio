# Paper Studio Dependencies

This project is a local Mac prototype. Most functionality works without paid cloud APIs, but external generation providers require local setup.

For Linux and OpenClaw migration details, see [`LINUX_OPENCLAW.md`](LINUX_OPENCLAW.md).

## Required For Development

| Dependency | Purpose | Install |
| --- | --- | --- |
| Node.js 24+ | Vite frontend, Fastify backend, scripts | `brew install node` or use your Node manager |
| npm 11+ | Package install and scripts | Bundled with recent Node |
| Python 3 | OpenCV cleanup script and LibTV skill wrappers | `brew install python` |
| OpenCV for Python (`cv2`) | Paper crop, perspective/bounding-box focus, line cleanup | `python3 -m pip install opencv-python numpy` |
| ffmpeg | AVFoundation camera listing, still capture, MJPEG preview stream | `brew install ffmpeg` |

## Required For Deck Workflows

| Dependency | Purpose | Notes |
| --- | --- | --- |
| `@slidev/cli` | Local web deck build and optional PPTX export | Installed by `npm install` |
| `pptxgenjs` | Editable flowchart PPTX using native PowerPoint shapes | Installed by `npm install` |
| Gemini CLI | Default `Sketch to Deck` planner | Install/configure separately; detected as `gemini` |
| Codex CLI | Alternate `codex-slidev` planner | Detected as `codex` or `/Applications/Codex.app/Contents/Resources/codex` |

Flowchart preview does not rely on Mermaid auto-layout for the final visual. The backend parses Mermaid-like graph semantics and renders an orthogonal SVG/HTML preview plus editable PPTX.

## Optional Speech Dependency

| Dependency | Purpose | Notes |
| --- | --- | --- |
| Whisper CLI | Local audio transcription | If unavailable, manual prompt text still works |

## Optional Media Provider

| Dependency | Purpose | Notes |
| --- | --- | --- |
| `LIBTV_ACCESS_KEY` | Real LibTV image/video generation | Required only for confirmed LibTV provider calls |
| Local `libtv-skill` | LibTV session creation, query, upload helpers | Expected at `/Users/hmi/.agents/skills/libtv-skill/scripts` on the developer machine |

## Environment Variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `LIBTV_ACCESS_KEY` | Optional | Enables confirmed LibTV media generation |
| `PAPER_STUDIO_PYTHON` | Optional | Overrides the Python executable used for OpenCV |
| `PAPER_STUDIO_MOCK_PROVIDERS=1` | Test only | Makes smoke tests use local mock generation |
| `PAPER_STUDIO_ALLOW_LIVE=1` | Live tests only | Explicit opt-in for live provider checks |
| `PAPER_STUDIO_LIVE_PROVIDERS` | Live tests only | Selects live provider check scope |

Planned Linux/OpenClaw variables are documented in [`LINUX_OPENCLAW.md`](LINUX_OPENCLAW.md). They are not all implemented in the current Mac-first prototype yet.

## Install Check

Run:

```bash
npm install
npm run lint
npm run build
npm run test:smoke
```

Then start the app:

```bash
npm run dev
```

Open `http://127.0.0.1:5173/` and inspect the top-level setup status. The backend exposes the same tool preflight through:

```bash
curl http://127.0.0.1:8787/api/health
```

## What Not To Commit

Do not commit:

- `.env`
- `data/`
- `dist/`
- `node_modules/`
- generated captures, transcripts, LibTV outputs, local deck runs, or camera logs
