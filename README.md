# Kanario

Blog thumbnail agent. Reads a WordPress draft, generates image prompts via Claude, then produces cover images via Qwen Image Edit on RunPod.

Given a post ID, the CLI:

1. Fetches the draft from WordPress REST API
2. Sends the content to Claude, which generates 2-3 scene descriptions
3. Sends each prompt to Qwen Image Edit with two mascot reference images (2 images per prompt → 4-6 options total)
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
| `RUNPOD_QWEN_URL` | RunPod Qwen server URL (e.g. `https://<pod-id>-8000.proxy.runpod.net`) |

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

## RunPod Server

The `server/` directory contains a FastAPI server that runs Qwen Image Edit on a GPU. It accepts two mascot reference images and a text prompt, and returns a generated PNG.

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

First boot downloads the model (~65 GB) and takes ~15-20 minutes.

### API

```
POST /generate (multipart/form-data)

Fields:
  prompt              str   (required)
  reference_image_1   file  (required)
  reference_image_2   file  (required)
  seed                int   (default: -1, random)
  num_inference_steps int   (default: 40)
  true_cfg_scale      float (default: 4.0)
  width               int   (default: 1280)
  height              int   (default: 720)

Response: image/png
```

```
GET /health → {"status": "ok"}
```

## Tests

```bash
npm test
```

## Stack

- Node.js >= 22 (native fetch, `--experimental-strip-types`, `node:test`)
- Single external dependency: `@anthropic-ai/sdk`
- Python FastAPI server for Qwen Image Edit on RunPod (NVIDIA A100 80GB)
