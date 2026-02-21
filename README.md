# Kanario

Blog thumbnail agent. Reads a WordPress draft, generates image prompts via an LLM (Gemini or Claude), then produces cover images via Qwen Image Edit on RunPod.

Works as a **CLI** (`./kanario`) or a **Discord bot** (`/generate`, `/pick`). Both interfaces use the same underlying workflows.

Given a post ID (or URL), the CLI:

1. Fetches the draft from WordPress REST API
2. Sends the content to an LLM (Gemini by default, or Claude), which generates 3 scene descriptions
3. Submits all 6 image jobs in parallel (3 prompts x 2 seeds) to Qwen Image Edit on RunPod Hub (~50s total)
4. Saves everything to `output/<post-id>/`

Once you've picked a favorite, the `pick` subcommand uploads it to WordPress and sets it as the post's featured image.

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
| `GEMINI_API_KEY` | Google Vertex AI API key (default model — [get one from Vertex AI Studio](https://console.cloud.google.com/vertex-ai)) |
| `ANTHROPIC_API_KEY` | Anthropic API key (only needed with `--model claude`) |
| `RUNPOD_API_KEY` | RunPod API key (from [runpod.io](https://www.runpod.io/) account settings) |
| `DISCORD_TOKEN` | Discord bot token (only needed for Discord bot) |
| `DISCORD_PUBLIC_KEY` | Discord application public key (only needed for Discord bot) |
| `DISCORD_APPLICATION_ID` | Discord application ID (only needed for Discord bot) |

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

### Generate thumbnails

```bash
./kanario <post-id-or-url> [--model gemini|claude] [--no-wide] [--hint <text>]
```

Options:

| Flag | Description |
|---|---|
| `--model` | LLM for prompt generation: `gemini` (default) or `claude` |
| `--no-wide` | Disable 16:9 padding, output matches mascot aspect ratio (square) |
| `--hint` | Guide the visual metaphor (e.g. `"two models competing side by side"`) |
| `-h, --help` | Show help |

Examples:

```bash
./kanario 12487
./kanario 12487 --no-wide
./kanario 12487 --model claude
./kanario 12487 --hint "versus scene, two robots facing off"
./kanario "https://blog.codeminer42.com/wp-admin/post.php?post=12487&action=edit"
./kanario "https://blog.codeminer42.com/some-post-slug/"
```

### Pick & upload featured image

```bash
./kanario pick <post-id-or-url> <image>
```

`<image>` accepts a shorthand like `2a` (resolves to `output/<post-id>/prompt-2a.png`) or a full file path.

Shows the post title and image path, then asks for confirmation before uploading.

Examples:

```bash
./kanario pick 12487 2a
./kanario pick 12487 /path/to/custom.png
```

Output goes to `output/<post-id>/`:

```
output/12345/
├── prompt-1a.png
├── prompt-1b.png
├── prompt-2a.png
├── prompt-2b.png
├── prompt-3a.png
├── prompt-3b.png
└── prompts.json
```

## Discord Bot

The same generate and pick workflows are available as Discord slash commands, so the team can trigger thumbnail generation and pick images directly from a channel.

### Setup

1. Create a Discord application at [discord.com/developers](https://discord.com/developers/applications)
2. Create a bot under the application and copy the **Bot Token** → `DISCORD_TOKEN`
3. Copy the **Application ID** → `DISCORD_APPLICATION_ID`
4. Copy the **Public Key** → `DISCORD_PUBLIC_KEY`
5. Add the bot to your server with the `applications.commands` scope
6. Register slash commands:

```bash
npm run discord:register
```

7. Start the server:

```bash
npm run server
```

8. Set the **Interactions Endpoint URL** in the Discord developer portal to your server's public URL + `/interactions` (e.g. `https://your-server.com/interactions`)

### Commands

| Command | Description |
|---|---|
| `/generate post_id [model] [hint]` | Generate 6 thumbnail images for a WordPress post (accepts ID, wp-admin URL, or published URL) |
| `/pick post_id image` | Upload an image and set it as the post's featured image (accepts ID, wp-admin URL, or published URL) |

Both commands respond with a deferred message, then edit it with the result once the workflow completes.

### Health check

```
GET /health → { "status": "ok" }
```

## RunPod Hub API (qwen-image-edit)

Image generation uses RunPod Hub's **public serverless endpoint** — no custom deployment needed. ~$0.02/request.

### How it works

There are two modes:

- **Async** (`/run`) — submit a job, poll `/status/{id}`, download result. This is what we use.
- **Sync** (`/runsync`) — blocks until the job completes and returns the result in the response. Simpler but has a 90-second timeout, so it can fail on cold starts or slow generations.

Our workflow (async):

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

#### Sync mode (not used)

`POST /runsync` takes the same request body as `/run` but blocks until the job finishes:

```json
{
  "id": "job-id",
  "status": "COMPLETED",
  "output": { "cost": 0.02, "result": "https://...cloudfront.net/output/{uuid}.png" }
}
```

Simpler (no polling loop), but has a **90-second timeout**. If the worker cold-starts or the generation is slow, the request will time out. We use `/run` + polling to avoid this.

### Gotchas

- **Output is a URL, not base64.** RunPod docs may suggest `output.output_image_base64`, but the actual response uses `output.result` containing a CloudFront URL.
- **Private repo URLs don't work.** RunPod's worker fetches the image server-side, so any URL must be publicly accessible. Use inline base64 for private assets.
- **Single image reference.** The `image` field takes one reference image, not multiple.
- **No width/height params.** Output dimensions match the input image. We pad the mascot onto a 1280×720 white canvas before sending so the output is widescreen.

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
- Two LLM SDKs: `@google/genai` (Gemini via Vertex AI), `@anthropic-ai/sdk` (Claude)
- `sharp` for image processing (padding mascot to widescreen canvas)
- `fastify` for the Discord bot HTTP server (Ed25519 signature verification via Node built-in `crypto.subtle`)
- RunPod Hub serverless endpoint for Qwen Image Edit (no custom infra)
