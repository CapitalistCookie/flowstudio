# FlowStudio GCP Deployment — Execution Prompt

**Project:** `lyrical-epigram-484715-v6`
**Region:** `us-east4`
**Date prepared:** 2026-03-14

> Give this entire prompt to Claude Code in a fresh session. It contains everything needed to deploy FlowStudio to GCP.

---

## Context

You are deploying the FlowStudio project from `/home/user/FlowStudio` to GCP project `lyrical-epigram-484715-v6`.

**CRITICAL: This VM also hosts the Eigenstate project (`quanta-ai-dev-941522`). Do NOT modify gcloud's global config. Use `--project` flags on every gcloud command. Never run `gcloud config set project`.**

The service account key is at `/home/user/FlowStudio/lyrical-epigram-484715-v6-f865e736b70b.json`.

## Credentials Available

```
DEEPGRAM_API_KEY=f32984e51572725d28a819363f203e64c9299a3c
GOOGLE_AI_API_KEY=AQ.Ab8RN6L6oBdbR1-HlL0lx5-I337M4wzwjzznh83sdVxJfVl1xQ
VERTEX_PROJECT_ID=lyrical-epigram-484715-v6
VERTEX_LOCATION=us-central1
GCP_PROJECT_ID=lyrical-epigram-484715-v6
GCP_REGION=us-east4
SERVICE_ACCOUNT_JSON=/home/user/FlowStudio/lyrical-epigram-484715-v6-f865e736b70b.json
SERVICE_ACCOUNT_EMAIL=vertex-express@lyrical-epigram-484715-v6.iam.gserviceaccount.com
```

## Execution Steps

Execute these steps IN ORDER. Stop and report if any step fails.

### Step 0: Verify Prerequisites

```bash
# Check gcloud is available and current project is NOT changed
gcloud --version
gcloud config get-value project  # Should show quanta-ai-dev-941522 — DO NOT CHANGE THIS

# Verify we can access the FlowStudio project without changing default
gcloud projects describe lyrical-epigram-484715-v6 --format="value(projectId)"

# Check Docker is available
docker --version

# Check node/pnpm
node --version  # Need 20+
pnpm --version  # Need 9+

# Check terraform
terraform --version  # Need 1.5+
```

### Step 1: Enable Required GCP APIs

```bash
PROJECT=lyrical-epigram-484715-v6

gcloud services enable compute.googleapis.com --project=$PROJECT
gcloud services enable run.googleapis.com --project=$PROJECT
gcloud services enable artifactregistry.googleapis.com --project=$PROJECT
gcloud services enable secretmanager.googleapis.com --project=$PROJECT
gcloud services enable aiplatform.googleapis.com --project=$PROJECT
gcloud services enable vpcaccess.googleapis.com --project=$PROJECT
gcloud services enable cloudfunctions.googleapis.com --project=$PROJECT
gcloud services enable cloudbuild.googleapis.com --project=$PROJECT
gcloud services enable storage.googleapis.com --project=$PROJECT
```

### Step 2: Create Terraform State Bucket (chicken-and-egg)

```bash
gsutil mb -p lyrical-epigram-484715-v6 -l us-east4 gs://flowstudio-terraform-state 2>/dev/null || echo "Bucket already exists"
```

### Step 3: Activate Service Account for FlowStudio Operations

Do NOT use `gcloud auth activate-service-account` globally — it would affect Eigenstate. Instead, set up a named gcloud configuration:

```bash
# Create a separate gcloud config for FlowStudio
gcloud config configurations create flowstudio 2>/dev/null || true
gcloud config configurations activate flowstudio
gcloud auth activate-service-account vertex-express@lyrical-epigram-484715-v6.iam.gserviceaccount.com \
  --key-file=/home/user/FlowStudio/lyrical-epigram-484715-v6-f865e736b70b.json \
  --project=lyrical-epigram-484715-v6
gcloud config set project lyrical-epigram-484715-v6 --configuration=flowstudio
gcloud config set compute/region us-east4 --configuration=flowstudio
gcloud config set compute/zone us-east4-c --configuration=flowstudio

# IMPORTANT: Switch back to default config immediately
gcloud config configurations activate default
```

From here on, use `--configuration=flowstudio` on gcloud commands OR set the env var:
```bash
export CLOUDSDK_ACTIVE_CONFIG_NAME=flowstudio
```

**Before finishing the session, ALWAYS run:**
```bash
gcloud config configurations activate default
unset CLOUDSDK_ACTIVE_CONFIG_NAME
```

### Step 4: Check Service Account Permissions

The `vertex-express` SA needs these roles on the project. Check and grant if missing:

```bash
PROJECT=lyrical-epigram-484715-v6
SA=vertex-express@lyrical-epigram-484715-v6.iam.gserviceaccount.com

# Check current roles
gcloud projects get-iam-policy $PROJECT --flatten="bindings[].members" \
  --filter="bindings.members:$SA" --format="table(bindings.role)" 2>/dev/null

# Grant required roles (only if missing — these are needed for Terraform + deployment)
ROLES=(
  roles/compute.admin
  roles/run.admin
  roles/storage.admin
  roles/artifactregistry.admin
  roles/secretmanager.admin
  roles/vpcaccess.admin
  roles/iam.serviceAccountAdmin
  roles/iam.serviceAccountUser
  roles/cloudfunctions.admin
  roles/serviceusage.serviceUsageAdmin
)

for role in "${ROLES[@]}"; do
  gcloud projects add-iam-policy-binding $PROJECT --member="serviceAccount:$SA" --role="$role" --quiet 2>/dev/null
done
```

**NOTE:** If the SA doesn't have permission to grant IAM roles, the user must do this manually from the GCP Console (IAM & Admin > IAM > Edit the vertex-express SA).

### Step 5: Apply Terraform

```bash
cd /home/user/FlowStudio/infra/terraform

# Use the service account key for Terraform
export GOOGLE_APPLICATION_CREDENTIALS=/home/user/FlowStudio/lyrical-epigram-484715-v6-f865e736b70b.json
export GOOGLE_PROJECT=lyrical-epigram-484715-v6

terraform init
terraform plan -out=tfplan

# Review the plan output — should create ~45 resources
# Includes: VPC, subnet, firewall rules, GCE VM, GCS buckets, Artifact Registry,
# Secret Manager secrets, Cloud Run services (14), service accounts, IAM bindings

terraform apply tfplan

# Capture outputs
terraform output
# Key outputs needed: stdb_external_ip, stdb_internal_ip

# Unset after done
unset GOOGLE_APPLICATION_CREDENTIALS
unset GOOGLE_PROJECT
```

### Step 6: Store Secrets in Secret Manager

```bash
PROJECT=lyrical-epigram-484715-v6

# Create secret versions (secrets were created by Terraform, just add values)
echo -n "f32984e51572725d28a819363f203e64c9299a3c" | \
  gcloud secrets versions add flowstudio-deepgram-api-key --data-file=- --project=$PROJECT

echo -n "AQ.Ab8RN6L6oBdbR1-HlL0lx5-I337M4wzwjzznh83sdVxJfVl1xQ" | \
  gcloud secrets versions add flowstudio-google-ai-api-key --data-file=- --project=$PROJECT

```

### Step 7: Build Shared Packages

```bash
cd /home/user/FlowStudio
pnpm install
pnpm --filter @flowstudio/shared run build
pnpm --filter @flowstudio/worker-shared run build

# Verify clean compilation
pnpm -r exec tsc --noEmit
```

### Step 8: Docker Auth for Artifact Registry

```bash
# Auth Docker to push to Artifact Registry using SA key
cat /home/user/FlowStudio/lyrical-epigram-484715-v6-f865e736b70b.json | \
  docker login -u _json_key --password-stdin us-east4-docker.pkg.dev
```

### Step 9: Build and Push Docker Images

```bash
cd /home/user/FlowStudio
PROJECT_ID=lyrical-epigram-484715-v6
REGION=us-east4
VERSION=v1
REGISTRY="${REGION}-docker.pkg.dev/${PROJECT_ID}/flowstudio"

# Build and push client
DOCKER_BUILDKIT=1 docker build \
  -f infra/docker/Dockerfile.client \
  -t "${REGISTRY}/client:${VERSION}" \
  --build-arg NEXT_PUBLIC_STDB_HOST="wss://stdb.flowstudio.ai" \
  --build-arg NEXT_PUBLIC_STDB_MODULE="flowstudio" \
  --build-arg NEXT_PUBLIC_UPLOAD_FUNCTION_URL="" \
  .
docker push "${REGISTRY}/client:${VERSION}"

# Build and push all workers
FFMPEG_WORKERS="audio-extract video-sample render"
ALL_WORKERS="audio-extract video-sample cursor-processor typing-detector speech-transcription video-understanding ui-change-detector interaction-pattern intent-graph narrative-planner edit-planner timeline-builder render"

for worker in $ALL_WORKERS; do
  NEEDS_FFMPEG="false"
  if echo "$FFMPEG_WORKERS" | grep -qw "$worker"; then
    NEEDS_FFMPEG="true"
  fi

  echo "=== Building ${worker} (ffmpeg=${NEEDS_FFMPEG}) ==="
  DOCKER_BUILDKIT=1 docker build \
    -f infra/docker/Dockerfile.worker \
    -t "${REGISTRY}/${worker}:${VERSION}" \
    --build-arg WORKER_NAME="${worker}" \
    --build-arg NEEDS_FFMPEG="${NEEDS_FFMPEG}" \
    .
  docker push "${REGISTRY}/${worker}:${VERSION}"
done
```

**NOTE:** This builds 14 images. Each takes 2-5 minutes. Total ~30-60 minutes. Consider parallelizing with `&` if disk I/O allows.

### Step 10: Deploy Cloud Run Services

```bash
PROJECT=lyrical-epigram-484715-v6
REGION=us-east4
VERSION=v1
REGISTRY="${REGION}-docker.pkg.dev/${PROJECT}/flowstudio"

# Deploy client (public)
gcloud run deploy flowstudio-client \
  --image="${REGISTRY}/client:${VERSION}" \
  --region=$REGION \
  --project=$PROJECT \
  --platform=managed \
  --allow-unauthenticated \
  --quiet

# Deploy all workers
ALL_WORKERS="audio-extract video-sample cursor-processor typing-detector speech-transcription video-understanding ui-change-detector interaction-pattern intent-graph narrative-planner edit-planner timeline-builder render"

for worker in $ALL_WORKERS; do
  echo "=== Deploying ${worker} ==="
  gcloud run deploy "flowstudio-${worker}" \
    --image="${REGISTRY}/${worker}:${VERSION}" \
    --region=$REGION \
    --project=$PROJECT \
    --platform=managed \
    --quiet
done
```

**NOTE:** Cloud Run env vars and secrets are configured by Terraform. If Terraform hasn't been applied yet, these deploys will lack env vars.

### Step 11: Deploy Cloud Function

```bash
cd /home/user/FlowStudio/infra/cloud-function/generate-upload-url

gcloud functions deploy flowstudio-generate-upload-url \
  --runtime=nodejs20 \
  --trigger-http \
  --allow-unauthenticated \
  --entry-point=generateUploadUrl \
  --region=us-east4 \
  --project=lyrical-epigram-484715-v6 \
  --set-env-vars="GCS_BUCKET=flowstudio-assets" \
  --quiet

# Get the function URL
gcloud functions describe flowstudio-generate-upload-url \
  --region=us-east4 \
  --project=lyrical-epigram-484715-v6 \
  --format="value(httpsTrigger.url)"
```

### Step 12: Deploy SpacetimeDB Module

After the GCE VM is running (from Terraform):

```bash
# Get VM external IP
STDB_IP=$(gcloud compute instances describe flowstudio-stdb \
  --zone=us-east4-c \
  --project=lyrical-epigram-484715-v6 \
  --format='get(networkInterfaces[0].accessConfigs[0].natIP)')

echo "SpacetimeDB VM IP: $STDB_IP"

# SSH to VM and install spacetime CLI, then publish module
# (Or use deploy-stdb.sh if DNS is configured)
```

### Step 13: DNS Setup

Point these DNS records to the appropriate IPs/URLs:
- `stdb.flowstudio.ai` → A record → SpacetimeDB VM static IP (from Terraform output)
- `app.flowstudio.ai` → CNAME → Cloud Run client URL (optional, can use Cloud Run URL directly)

### Step 14: Verify Deployment

```bash
PROJECT=lyrical-epigram-484715-v6
REGION=us-east4

# Check all Cloud Run services are running
gcloud run services list --project=$PROJECT --region=$REGION

# Check client is accessible
CLIENT_URL=$(gcloud run services describe flowstudio-client --project=$PROJECT --region=$REGION --format='value(status.url)')
curl -s -o /dev/null -w "%{http_code}" $CLIENT_URL

# Check worker health
for worker in audio-extract video-sample speech-transcription video-understanding intent-graph; do
  URL=$(gcloud run services describe "flowstudio-${worker}" --project=$PROJECT --region=$REGION --format='value(status.url)' 2>/dev/null)
  if [ -n "$URL" ]; then
    echo "${worker}: $(curl -s -o /dev/null -w '%{http_code}' ${URL}/health)"
  fi
done

# Check GCE VM is running
gcloud compute instances describe flowstudio-stdb --zone=us-east4-c --project=$PROJECT --format='value(status)'
```

### Step 15: Cleanup — Restore Default gcloud Config

**ALWAYS do this at the end:**

```bash
gcloud config configurations activate default
unset CLOUDSDK_ACTIVE_CONFIG_NAME
unset GOOGLE_APPLICATION_CREDENTIALS
unset GOOGLE_PROJECT

# Verify we're back to Eigenstate project
gcloud config get-value project  # Should show quanta-ai-dev-941522
```

---

## Resource Naming (No Quanta Conflicts)

All FlowStudio resources are prefixed with `flowstudio-`. Eigenstate uses `quanta-` prefix. There is ZERO overlap:

| FlowStudio | Eigenstate |
|------------|------------|
| `flowstudio-vpc` | (different project entirely) |
| `flowstudio-assets` (GCS) | `quanta-ai-dev-*` |
| `flowstudio-*` (Cloud Run) | `quanta-*-dev` |
| `flowstudio-worker` (SA) | `quanta_app` |
| `lyrical-epigram-484715-v6` | `quanta-ai-dev-941522` |

**Different GCP projects = complete isolation. No risk of interference.**

---

## Estimated Costs

| Resource | Monthly Cost |
|----------|-------------|
| GCE VM (e2-standard-4) | ~$100 |
| Cloud Run (14 services, scale-to-zero) | ~$5-50 (usage-based) |
| GCS Storage | ~$1-5 |
| Secret Manager | <$1 |
| Static IP | ~$7 |
| VPC Connector | ~$7 |
| **Total (idle)** | **~$120/mo** |
| **Total (active)** | **~$170/mo** |

---

## Rollback

To tear down everything:
```bash
cd /home/user/FlowStudio/infra/terraform
export GOOGLE_APPLICATION_CREDENTIALS=/home/user/FlowStudio/lyrical-epigram-484715-v6-f865e736b70b.json
terraform destroy
unset GOOGLE_APPLICATION_CREDENTIALS
```
