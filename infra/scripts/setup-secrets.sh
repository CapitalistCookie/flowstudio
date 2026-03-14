#!/bin/bash
set -euo pipefail

# Usage: ./setup-secrets.sh
# Prompts for API keys and stores them in Secret Manager

PROJECT_ID=${GCP_PROJECT_ID:-lyrical-epigram-484715-v6}
PREFIX=flowstudio

echo "Setting up secrets for ${PROJECT_ID}..."

read -sp "Deepgram API Key: " DEEPGRAM_KEY; echo
echo -n "$DEEPGRAM_KEY" | gcloud secrets versions add "${PREFIX}-deepgram-api-key" --data-file=-

read -sp "Google AI API Key: " GOOGLE_KEY; echo
echo -n "$GOOGLE_KEY" | gcloud secrets versions add "${PREFIX}-google-ai-api-key" --data-file=-

read -sp "Anthropic API Key: " ANTHROPIC_KEY; echo
echo -n "$ANTHROPIC_KEY" | gcloud secrets versions add "${PREFIX}-anthropic-api-key" --data-file=-

echo "All secrets stored."
