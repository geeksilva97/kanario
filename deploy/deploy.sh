#!/usr/bin/env bash
# Build and deploy the Discord bot to Cloud Run.
# Usage: ./deploy/deploy.sh
#
# Required env vars:
#   GCP_PROJECT_ID  — your GCP project ID
#
# Optional env vars:
#   GCP_REGION               — Cloud Run region (default: us-central1)
#   GCS_CREDENTIALS_BUCKET   — GCS bucket name for credential storage

set -euo pipefail

# Load .env from project root if present
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
[ -f "$SCRIPT_DIR/../.env" ] && set -a && source "$SCRIPT_DIR/../.env" && set +a

# Config
PROJECT_ID="${GCP_PROJECT_ID:?Set GCP_PROJECT_ID}"
REGION="${GCP_REGION:-us-central1}"
GCS_CREDENTIALS_BUCKET="${GCS_CREDENTIALS_BUCKET:?Set GCS_CREDENTIALS_BUCKET}"
SERVICE_NAME="kanario-discord"
REPO_NAME="kanario"
IMAGE="$REGION-docker.pkg.dev/$PROJECT_ID/$REPO_NAME/$SERVICE_NAME"

# Build and push
echo "Building and pushing $IMAGE ..."
gcloud builds submit --tag "$IMAGE" --project "$PROJECT_ID"

# Deploy
echo "Deploying to Cloud Run ..."
gcloud run deploy "$SERVICE_NAME" \
  --image "$IMAGE" \
  --region "$REGION" \
  --project "$PROJECT_ID" \
  --platform managed \
  --allow-unauthenticated \
  --port 8080 \
  --memory 512Mi \
  --cpu 1 \
  --timeout 300 \
  --no-cpu-throttling \
  --min-instances 1 \
  --max-instances 3 \
  --add-volume name=creds-vol,type=cloud-storage,bucket="$GCS_CREDENTIALS_BUCKET" \
  --add-volume-mount volume=creds-vol,mount-path=/app/data

SERVICE_URL=$(gcloud run services describe "$SERVICE_NAME" \
  --region "$REGION" \
  --project "$PROJECT_ID" \
  --format 'value(status.url)')

echo ""
echo "Service URL: $SERVICE_URL"
