# LibTV Skill Contract

## Purpose

`libtv-skill` is the default media generation backend for Paper Studio.

Paper Studio uses it for:

- sketch-to-image
- sketch-to-video
- reference-image media generation using the cleaned paper crop
- polling and filtering current-job results

## Required Local Setup

```bash
export LIBTV_ACCESS_KEY="your-access-key"
```

Optional:

```bash
export OPENAPI_IM_BASE="https://im.liblib.tv"
```

Expected local scripts:

- `create_session.py`
- `upload_file.py`
- `query_session.py`
- `download_results.py`

Paper Studio expects these under a local `libtv-skill/scripts/` directory. The default development path is `/Users/hmi/.agents/skills/libtv-skill/scripts`.

## Paper Studio Defaults

- Image model: `Seedream 5.0 Lite`
- Video reference flow: `Kling O3`
- Output count: `1`
- Aspect ratio default: `4:3`
- Default creative style: short-video ad style
- Do not auto-upgrade to VIP, 4K, high-quality, or premium models.
- If LibTV requires confirmation or only higher-cost models are available, block and surface the setup/cost issue.

## Message Contract

Paper Studio builds a prompt that contains:

- user intent
- optimized English/Chinese media prompt
- reference image URL or uploaded local image
- style chip selection
- aspect ratio
- low-cost model constraints
- unique job marker: `paper-studio-job:{jobId}`

Only result URLs after the job marker should be treated as current-job output.

## Failure Behavior

- Query or download failures should not corrupt the job record.
- If the LibTV API returns incomplete JSON or network truncation, retry once and then show a recoverable error.
- Old media from the same session must not be displayed as the current job result.

