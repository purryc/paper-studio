# Deck Planner Skill Contract

## Purpose

Paper Studio supports two local planner routes for `Sketch to Deck`:

- `gemini-cli`
- `codex-slidev`

Both routes are planner routes only. The backend owns artifact writing, preview generation, and editable PPTX export.

## Workspace Contract

For every deck job, the backend creates:

```text
data/decks/{jobId}/
  input.png
  diagram.mmd
  slides.md
  preview.html
  editable-flowchart.pptx
```

The CLI prompt must reference `input.png` inside the job workspace, not an external `/data/captures/...` path.

## Flowchart Page Contract

When `deckOutput = flowchart-page`:

- Ask the CLI for Mermaid only, not a full deck file.
- Accept only `flowchart TD` or `flowchart LR` semantics.
- Extract Mermaid from stdout.
- If stdout is invalid or the CLI fails, generate a best-effort fallback Mermaid from the cleaned sketch and user intent.
- The backend then parses Mermaid into `graphSpec`, renders orthogonal preview HTML, and writes editable PPTX with `pptxgenjs`.

## Full Deck Contract

When `deckOutput = full-deck`:

- The planner may return Slidev markdown.
- The backend writes `slides.md`.
- Slidev is used for preview when available.
- Editable PPTX quality is only guaranteed for the flowchart page route in the current prototype.

## Source Folder Contract

Source folders are optional.

Default policy: `sourcePolicy = auto`.

Only inject source context when the user prompt explicitly asks for references, documents, a folder, source material, or grounding context. If the prompt does not ask for sources, selected folders must be ignored.

## Prompt Safety

Planner prompts must say:

- return content on stdout
- do not call file-writing tools
- do not call paid external APIs from inside the planner
- use only the provided `input.png` and backend-injected source excerpts

