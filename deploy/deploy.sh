#!/usr/bin/env bash
# Build and deploy the Discord bot to Cloud Run.
# Usage: ./deploy/deploy.sh
#
# Required env vars:
#   GCP_PROJECT_ID  — your GCP project ID
#
# Optional env vars:
#   GCP_REGION      — Cloud Run region (default: southamerica-east1)

set -euo pipefail

# Config
PROJECT_ID="${GCP_PROJECT_ID:?Set GCP_PROJECT_ID}"
REGION="${GCP_REGION:-southamerica-east1}"
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
  --min-instances 0 \
  --max-instances 3 \
  --add-volume name=creds-vol,type=cloud-storage,bucket=kanario-credentials \
  --add-volume-mount volume=creds-vol,mount-path=/app/data

SERVICE_URL=$(gcloud run services describe "$SERVICE_NAME" \
  --region "$REGION" \
  --project "$PROJECT_ID" \
  --format 'value(status.url)')

echo ""
echo "Service URL: $SERVICE_URL"

# Create or update keep-alive scheduler job (prevents cold starts exceeding Discord's 3s deadline)
echo "Setting up keep-alive scheduler ..."
gcloud scheduler jobs update http kanario-keep-alive \
  --location "$REGION" \
  --project "$PROJECT_ID" \
  --schedule "*/5 * * * *" \
  --uri "${SERVICE_URL}/health" \
  --http-method GET \
  --attempt-deadline 15s \
  --quiet 2>/dev/null \
|| gcloud scheduler jobs create http kanario-keep-alive \
  --location "$REGION" \
  --project "$PROJECT_ID" \
  --schedule "*/5 * * * *" \
  --uri "${SERVICE_URL}/health" \
  --http-method GET \
  --attempt-deadline 15s \
  --quiet
