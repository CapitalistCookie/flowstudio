#!/bin/bash
set -euo pipefail

# Usage: ./deploy-all.sh <version>
VERSION=${1:-latest}

WORKERS=(
  audio-extract video-sample cursor-processor typing-detector
  speech-transcription video-understanding ui-change-detector interaction-pattern
  intent-graph narrative-planner edit-planner timeline-builder render
)

# Build and push all workers
for worker in "${WORKERS[@]}"; do
  echo "=== Building ${worker} ==="
  ./infra/scripts/build-and-push.sh "$worker" "$VERSION"
done

# Build and push client
echo "=== Building client ==="
./infra/scripts/build-and-push.sh client "$VERSION"

# Deploy all
for worker in "${WORKERS[@]}"; do
  echo "=== Deploying ${worker} ==="
  ./infra/scripts/deploy-worker.sh "$worker" "$VERSION"
done

echo "=== Deploying client ==="
./infra/scripts/deploy-worker.sh client "$VERSION"

echo "=== All services deployed ==="
