# Deployment (Cloud Run)

The Discord bot runs on Google Cloud Run so it's always available at a public HTTPS URL for Discord interaction webhooks.

## Prerequisites

- [Google Cloud CLI](https://cloud.google.com/sdk/docs/install) (`gcloud`) installed and authenticated
- A GCP project with Cloud Run, Artifact Registry, and Cloud Scheduler APIs enabled
- An Artifact Registry Docker repository named `kanario` in your region:

```bash
gcloud artifacts repositories create kanario \
  --repository-format=docker \
  --location=southamerica-east1 \
  --project=your-gcp-project
```

## Build and deploy

```bash
GCP_PROJECT_ID=your-gcp-project ./deploy/deploy.sh
```

The script builds the Docker image, pushes it to Artifact Registry, and deploys to Cloud Run. It prints the service URL when done.

Optional env vars:
- `GCP_REGION` — Cloud Run region (default: `southamerica-east1`)

## Credential storage (GCS FUSE)

Per-user WordPress credentials are stored in a SQLite database. On Cloud Run, the DB file lives on a GCS bucket mounted via Cloud Storage FUSE.

One-time setup:

```bash
gcloud storage buckets create gs://your-kanario-credentials-bucket --location=southamerica-east1
```

The `deploy.sh` script automatically mounts the bucket at `/app/data/` using `--add-volume` and `--add-volume-mount` flags.

## Set secrets

After the first deploy, set the required environment variables on the Cloud Run service:

```bash
gcloud run services update kanario-discord \
  --region southamerica-east1 \
  --set-env-vars "GEMINI_API_KEY=...,RUNPOD_API_KEY=...,DISCORD_TOKEN=...,DISCORD_PUBLIC_KEY=...,DISCORD_APPLICATION_ID=...,CREDENTIAL_ENCRYPTION_KEY=..."
```

Note: `WP_USERNAME` and `WP_APP_PASSWORD` are not needed on the Discord bot — each user registers their own credentials via `/register`.

For production, consider using [GCP Secret Manager](https://cloud.google.com/run/docs/configuring/secrets) with the `--set-secrets` flag instead.

## Configure Discord

Set the **Interactions Endpoint URL** in the [Discord developer portal](https://discord.com/developers/applications) to:

```
https://<your-service-url>/interactions
```

Discord will send a PING to verify the endpoint responds with PONG before saving.

## Service settings

| Setting | Value |
|---|---|
| Memory | 512 Mi |
| CPU | 1 |
| CPU throttling | Off (background work runs after the deferred response) |
| Timeout | 300s |
| Min instances | 1 (always-on — prevents cold starts that exceed Discord's 3s deadline) |
| Max instances | 3 |
| Port | 8080 |

## CI/CD

GitHub Actions runs on every push and PR to `main`. The pipeline has 5 jobs:

| Job | Trigger | What it does |
|---|---|---|
| **Unit Tests** | all pushes & PRs | `npm test` — fast, no secrets needed |
| **Type Check** | all pushes & PRs | `npx tsc --noEmit` |
| **Integration Tests** | all pushes & PRs | Hits real WordPress API (needs WP secrets) |
| **Smoke Tests** | push to `main` only | Generates real images, uploads output as artifact for visual inspection |
| **Deploy to Cloud Run** | push to `main` only | Builds Docker image, pushes to Artifact Registry, deploys to Cloud Run (runs after all other jobs pass) |

### GCP authentication

The deploy job uses **Workload Identity Federation** (WIF) for keyless authentication — no service account keys to manage or rotate. GitHub Actions exchanges a short-lived OIDC token for temporary GCP credentials.

The WIF setup:
- **Workload Identity Pool**: `github` (global)
- **OIDC Provider**: `kanario` (scoped to your repo via attribute condition)
- **Service Account**: `kanario-deployer@your-gcp-project.iam.gserviceaccount.com`

### Required GitHub Secrets

| Secret | Used by |
|---|---|
| `WP_URL` | Integration Tests, Smoke Tests |
| `WP_USERNAME` | Integration Tests, Smoke Tests |
| `WP_APP_PASSWORD` | Integration Tests, Smoke Tests |
| `WP_PUBLISHED_POST_ID` | Integration Tests — a published post ID |
| `WP_DRAFT_POST_ID` | Integration Tests — a draft post ID (must stay unpublished) |
| `GEMINI_API_KEY` | Smoke Tests |
| `RUNPOD_API_KEY` | Smoke Tests |
| `GCP_PROJECT_ID` | Deploy |
| `GCP_WORKLOAD_IDENTITY_PROVIDER` | Deploy (WIF provider path) |
| `GCP_SERVICE_ACCOUNT` | Deploy (deployer service account email) |

Set these in **Settings → Secrets and variables → Actions** in the GitHub repository.

## RunPod Hub API (qwen-image-edit)

Image generation uses RunPod Hub's **public serverless endpoint** — no custom deployment needed. ~$0.02/request.

### How it works

There are two modes:

- **Async** (`/run`) — submit a job, poll `/status/{id}`, download result. This is what we use.
- **Sync** (`/runsync`) — blocks until the job completes and returns the result in the response. Simpler but has a 90-second timeout, so it can fail on cold starts or slow generations.

Our workflow (async):

1. **Submit a job** — `POST /run` returns a job ID
2. **Poll for status** — `GET /status/{id}` until `COMPLETED` (max 100 attempts / ~5 min; times out with `runpod_polling_timeout` error)
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
- A **public URL** (must be publicly accessible)
- **Inline base64** with data URI prefix: `data:image/png;base64,{base64data}`

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

`POST /runsync` takes the same request body as `/run` but blocks until the job finishes. Simpler (no polling loop), but has a **90-second timeout**. We use `/run` + polling to avoid this.

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
