# Paper Studio Skill Map

Paper Studio integrates with local agent skills and CLI agents, but this repository does not vendor private installed skill folders. Instead, it commits the portable contract: what each skill is used for, what the app expects, and what must be installed locally to run the same pipeline.

## Runtime Skill Dependencies

| Skill or tool | Used by | Runtime role | Required for |
| --- | --- | --- | --- |
| `libtv-skill` | `server/libtv.js` | Creates LibTV sessions, uploads reference images, polls and downloads media results | `Sketch to Media` image/video generation |
| `gemini-cli` | `server/deck.js` | Optional deck planner that returns Mermaid or Slidev markdown on stdout | `Sketch to Deck` when planner is `gemini-cli` |
| `codex` CLI + `slidev` skill | `server/deck.js` | Optional deck planner route. The backend provides `input.png`; the CLI returns Mermaid or Slidev markdown. | `Sketch to Deck` when planner is `codex-slidev` |
| Slidev CLI | `server/deck.js` | Builds local deck previews from generated `slides.md` when available | Deck preview |
| `pptxgenjs` | `server/deck.js` | Generates native editable PowerPoint shapes and connectors | Editable flowchart PPTX |

## Planning And Design Skills

| Skill | How it influenced this repo | Runtime dependency |
| --- | --- | --- |
| `frontend-design` | Liquid-glass single-screen studio UI, compact controls, inline result panel | No |
| `open-spec` | Durable SDD documents under `specs/001-mac-paper-studio/` | No |
| `deliverable-director` | Orthogonal flowchart and editable PPTX rules adapted from the PRB deliverable workflow | No |

## Invocation Rules

- The frontend exposes one user action: `Generate`.
- The backend still preserves `draft -> confirm` semantics internally.
- Capture, cleanup, source upload, and draft creation never call external providers.
- External provider calls happen only after the explicit `Generate` action.
- Missing skills or CLI setup block that provider path. The app must not silently switch to a different paid provider.
- Google Cloud / Vertex / pay-as-you-go routes are intentionally not enabled by default.

## Portable Contracts

Sanitized contracts are committed under [`docs/skills/`](skills/):

- [`libtv-skill-contract.md`](skills/libtv-skill-contract.md)
- [`deck-planner-contract.md`](skills/deck-planner-contract.md)
- [`design-and-spec-skill-contract.md`](skills/design-and-spec-skill-contract.md)

These files are the repo-safe handoff layer. They are sufficient for another agent or machine to install equivalent local skills without copying private local configuration.
