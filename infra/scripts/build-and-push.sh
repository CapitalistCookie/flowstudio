#!/bin/bash
set -euo pipefail

# Usage: ./build-and-push.sh <service-name> <version>
# Example: ./build-and-push.sh audio-extract v1

SERVICE=$1
VERSION=${2:-latest}
PROJECT_ID=${GCP_PROJECT_ID:-lyrical-epigram-484715-v6}
REGION=${GCP_REGION:-us-east4}
REGISTRY="${REGION}-docker.pkg.dev/${PROJECT_ID}/flowstudio"

FFMPEG_WORKERS="audio-extract video-sample render"

NEEDS_FFMPEG="false"
if echo "$FFMPEG_WORKERS" | grep -qw "$SERVICE"; then
  NEEDS_FFMPEG="true"
fi

if [ "$SERVICE" = "client" ]; then
  echo "Building client ${VERSION}..."
  DOCKER_BUILDKIT=1 docker build \
    -f infra/docker/Dockerfile.client \
    -t "${REGISTRY}/client:${VERSION}" \
    --build-arg NEXT_PUBLIC_STDB_HOST="${NEXT_PUBLIC_STDB_HOST:-wss://stdb.flowstudio.ai}" \
    --build-arg NEXT_PUBLIC_STDB_MODULE="${NEXT_PUBLIC_STDB_MODULE:-flowstudio}" \
    .
else
  echo "Building worker ${SERVICE} ${VERSION}..."
  DOCKER_BUILDKIT=1 docker build \
    -f infra/docker/Dockerfile.worker \
    -t "${REGISTRY}/${SERVICE}:${VERSION}" \
    --build-arg WORKER_NAME="${SERVICE}" \
    --build-arg NEEDS_FFMPEG="${NEEDS_FFMPEG}" \
    .
fi

echo "Pushing ${REGISTRY}/${SERVICE}:${VERSION}..."
docker push "${REGISTRY}/${SERVICE}:${VERSION}"

echo "Done: ${REGISTRY}/${SERVICE}:${VERSION}"
