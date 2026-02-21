# Kanario

Blog thumbnail agent. Reads a WordPress draft, generates image prompts via Claude, then produces cover images via Qwen Image Edit on RunPod.

Given a post ID, the CLI:

1. Fetches the draft from WordPress REST API
2. Sends the content to Claude, which generates 2-3 scene descriptions
3. Sends each prompt to Qwen Image Edit (RunPod Hub public endpoint) with a mascot reference image (2 images per prompt → 4-6 options total)
4. Saves everything to `output/<post-id>/`

## Setup

```bash
npm install
cp .env.example .env  # fill in credentials
```

### Environment variables

| Variable | Description |
|---|---|
| `WP_URL` | WordPress site URL (default: `https://blog.codeminer42.com`) |
| `WP_USERNAME` | WordPress username |
| `WP_APP_PASSWORD` | WordPress application password ([how to get one](#wordpress-application-password)) |
| `ANTHROPIC_API_KEY` | Anthropic API key |
| `RUNPOD_API_KEY` | RunPod API key (from [runpod.io](https://www.runpod.io/) account settings) |

### WordPress Application Password

The CLI authenticates with the WordPress REST API using [Application Passwords](https://make.wordpress.org/core/2020/11/05/application-passwords-integration-guide/) (built into WordPress, no plugins needed).

To create one:

1. Log into WordPress admin (`/wp-admin/`)
2. Go to **Users → Profile**
3. Scroll to the **Application Passwords** section
4. Enter a name (e.g. "Kanario") and click **Add New Application Password**
5. Copy the generated password — it's only shown once

Your user must have **Editor** or **Administrator** role to access draft posts via the REST API.

## Usage

```bash
node --env-file=.env --experimental-strip-types src/index.ts <post-id> [--wp-url <url>]
```

Output goes to `output/<post-id>/`:

```
output/12345/
├── prompt-1a.png
├── prompt-1b.png
├── prompt-2a.png
├── prompt-2b.png
└── prompts.json
```

## RunPod Hub API (qwen-image-edit)

Image generation uses RunPod Hub's **public serverless endpoint** — no custom deployment needed. ~$0.02/request.

### How it works

The workflow is async (submit → poll → download):

1. **Submit a job** — `POST /run` returns a job ID
2. **Poll for status** — `GET /status/{id}` until `COMPLETED`
3. **Download the image** — result is a CloudFront URL in `output.result`

### API reference

Base URL: `https://api.runpod.ai/v2/qwen-image-edit`

All requests require: `Authorization: Bearer {RUNPOD_API_KEY}`

#### Submit job

```
POST /run
Content-Type: application/json

{
  "input": {
    "prompt": "description of the scene",
    "image": "data:image/png;base64,{base64data}",
    "seed": 12345,
    "output_format": "png"
  }
}
```

The `image` field accepts:
- A **public URL** (must be publicly accessible — private GitHub raw URLs won't work)
- **Inline base64** with data URI prefix: `data:image/png;base64,{base64data}`

We use base64 because the kanario repo is private and raw GitHub URLs return 404.

Response:
```json
{ "id": "job-id", "status": "IN_QUEUE" }
```

#### Poll status

```
GET /status/{job-id}
```

Status values: `IN_QUEUE` → `IN_PROGRESS` → `COMPLETED` or `FAILED`.

Poll interval of 3 seconds works well. Jobs typically complete in 10-30 seconds.

#### Completed response

```json
{
  "id": "job-id",
  "status": "COMPLETED",
  "output": {
    "cost": 0.02,
    "result": "https://d2p7pge43lyniu.cloudfront.net/output/{uuid}.png"
  }
}
```

The result is a **CloudFront CDN URL** — fetch it to download the PNG.

#### Failed response

```json
{
  "id": "job-id",
  "status": "FAILED",
  "error": "Error during processing: ...",
  "output": { "status": "failed" }
}
```

### Gotchas

- **Output is a URL, not base64.** RunPod docs may suggest `output.output_image_base64`, but the actual response uses `output.result` containing a CloudFront URL.
- **Private repo URLs don't work.** RunPod's worker fetches the image server-side, so any URL must be publicly accessible. Use inline base64 for private assets.
- **Single image reference.** The `image` field takes one reference image, not multiple.
- **No width/height params.** Output dimensions are determined by the model.

## Legacy: Custom RunPod Server

The `server/` directory contains a FastAPI server that runs Qwen Image Edit on a custom GPU pod. This was replaced by the RunPod Hub public endpoint above, but the code is kept for reference.

### Deploy

Requires `RUNPOD_API_KEY` and `RUNPOD_DOCKER_IMAGE` env vars.

```bash
./server/deploy-runpod.sh push      # build + push Docker image
./server/deploy-runpod.sh deploy    # create A100 80GB pod
./server/deploy-runpod.sh status    # check pod status + server URL
./server/deploy-runpod.sh stop      # pause (no GPU charge, volume preserved)
./server/deploy-runpod.sh start     # resume
./server/deploy-runpod.sh destroy   # delete pod + volume
```

## Tests

```bash
npm test
```

## Stack

- Node.js >= 22 (native fetch, `--experimental-strip-types`, `node:test`)
- Single external dependency: `@anthropic-ai/sdk`
- RunPod Hub serverless endpoint for Qwen Image Edit (no custom infra)
