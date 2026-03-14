#!/bin/bash
set -euo pipefail

# Usage: ./deploy-worker.sh <worker-name> <version>
SERVICE=$1
VERSION=${2:-latest}
PROJECT_ID=${GCP_PROJECT_ID:-lyrical-epigram-484715-v6}
REGION=${GCP_REGION:-us-east4}
REGISTRY="${REGION}-docker.pkg.dev/${PROJECT_ID}/flowstudio"

echo "Deploying ${SERVICE} ${VERSION}..."
gcloud run deploy "flowstudio-${SERVICE}" \
  --image="${REGISTRY}/${SERVICE}:${VERSION}" \
  --region="${REGION}" \
  --platform=managed \
  --quiet

echo "Deployed: flowstudio-${SERVICE}"
