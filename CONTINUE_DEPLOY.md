# FlowStudio Deployment — Continue From Here

**Date:** 2026-03-14
**Status:** Terraform partially applied, all 14 Docker images built + pushed to Artifact Registry.

## What's Done
1. All GCP APIs enabled on `lyrical-epigram-484715-v6`
2. SA `vertex-express` has Owner role
3. gcloud config `flowstudio` created with SA auth
4. Terraform state bucket created + imported
5. Terraform partial apply: VPC, subnet, firewalls, GCE VM, GCS bucket, AR repo, secrets, IAM — all created
6. All 14 Docker images (client + 13 workers) built and pushed to `us-east4-docker.pkg.dev/lyrical-epigram-484715-v6/flowstudio/`
7. Secrets stored in Secret Manager (Deepgram + Google AI keys)
8. Code changes completed:
   - `@anthropic-ai/sdk` → `@anthropic-ai/vertex-sdk` in 3 workers
   - Shared config: `anthropicApiKey` → `vertexRegion` + `vertexProjectId`
   - Terraform: anthropic secret removed, Vertex AI IAM added, env var switched
   - Dockerfiles: `corepack` → `npm install -g pnpm@9`
   - Shared utils: `node:crypto` → global `crypto.randomUUID()`
   - Client imports: removed `.js` extensions
   - VPC connector: added `min_throughput`/`max_throughput`
   - Cloud Run: added `deletion_protection = false`

## What's Left — Execute These Commands

### Step 1: Apply remaining Terraform (VPC connector + 14 Cloud Run services)

```bash
cd /home/user/FlowStudio/infra/terraform
GOOGLE_APPLICATION_CREDENTIALS=/home/user/FlowStudio/lyrical-epigram-484715-v6-f865e736b70b.json \
GOOGLE_PROJECT=lyrical-epigram-484715-v6 \
terraform plan -out=tfplan3 && \
GOOGLE_APPLICATION_CREDENTIALS=/home/user/FlowStudio/lyrical-epigram-484715-v6-f865e736b70b.json \
GOOGLE_PROJECT=lyrical-epigram-484715-v6 \
terraform apply tfplan3
```

### Step 2: Verify Cloud Run services are running

```bash
export CLOUDSDK_ACTIVE_CONFIG_NAME=flowstudio
gcloud run services list --project=lyrical-epigram-484715-v6 --region=us-east4

# Check client URL
CLIENT_URL=$(gcloud run services describe flowstudio-client --project=lyrical-epigram-484715-v6 --region=us-east4 --format='value(status.url)')
echo "Client: $CLIENT_URL"
curl -s -o /dev/null -w "%{http_code}" $CLIENT_URL
```

### Step 3: Get terraform outputs

```bash
cd /home/user/FlowStudio/infra/terraform
GOOGLE_APPLICATION_CREDENTIALS=/home/user/FlowStudio/lyrical-epigram-484715-v6-f865e736b70b.json \
GOOGLE_PROJECT=lyrical-epigram-484715-v6 \
terraform output
```

### Step 4: Make client publicly accessible (if terraform doesn't handle it)

```bash
export CLOUDSDK_ACTIVE_CONFIG_NAME=flowstudio
gcloud run services add-iam-policy-binding flowstudio-client \
  --region=us-east4 \
  --project=lyrical-epigram-484715-v6 \
  --member="allUsers" \
  --role="roles/run.invoker"
```

### Step 5: Restore default gcloud config (ALWAYS DO THIS)

```bash
gcloud config configurations activate default
unset CLOUDSDK_ACTIVE_CONFIG_NAME
unset GOOGLE_APPLICATION_CREDENTIALS
unset GOOGLE_PROJECT

# Verify
gcloud config get-value project  # Should show quanta-ai-dev-941522
```

## NOT YET DONE (future steps)
- Cloud Function for upload URL generation (Step 11 in DEPLOY_PROMPT.md)
- SpacetimeDB module deployment on the GCE VM
- DNS setup (stdb.flowstudio.ai, app.flowstudio.ai)
- Git commit of all code changes

## Files Changed (uncommitted)
- `packages/workers/intent-graph/package.json` — vertex-sdk
- `packages/workers/narrative-planner/package.json` — vertex-sdk
- `packages/workers/edit-planner/package.json` — vertex-sdk
- `packages/workers/shared/src/config.ts` — vertexRegion/vertexProjectId
- `packages/workers/intent-graph/src/worker.ts` — AnthropicVertex
- `packages/workers/narrative-planner/src/worker.ts` — AnthropicVertex
- `packages/workers/edit-planner/src/worker.ts` — AnthropicVertex
- `packages/shared/src/utils.ts` — crypto.randomUUID()
- `claudeFrontend/src/app/page.tsx` — removed .js imports
- `claudeFrontend/src/app/project/[id]/page.tsx` — removed .js imports
- `claudeFrontend/src/components/Header.tsx` — removed .js imports
- `claudeFrontend/src/components/CreateProjectDialog.tsx` — removed .js imports
- `claudeFrontend/src/lib/hooks.ts` — removed .js imports
- `infra/terraform/secrets.tf` — removed anthropic, added vertex IAM
- `infra/terraform/cloud-run.tf` — vertex_workers, deletion_protection
- `infra/terraform/network.tf` — VPC connector throughput
- `infra/docker/Dockerfile.client` — npm install pnpm
- `infra/docker/Dockerfile.worker` — npm install pnpm
- `infra/scripts/setup-secrets.sh` — removed anthropic
- `.env.example` — VERTEX_REGION
- `DEPLOY_PROMPT.md` — removed MISSING block, added aiplatform API
- `pnpm-lock.yaml` — updated deps
