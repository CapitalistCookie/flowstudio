# FlowStudio — Build Handoff

**Built:** 2026-03-14
**Repo:** https://github.com/Dawgsrlife/FlowStudio
**Location:** `/home/user/FlowStudio`
**Stats:** 219 files, ~8,700 lines, 17 packages, 4 commits

---

## What Was Built

A complete TypeScript monorepo for an AI-powered video editing platform. SpacetimeDB v2 (self-hosted on GCE) replaces Postgres/Redis/Celery as the coordination backbone. 13 specialized workers process a video pipeline. Next.js frontend for monitoring. All on GCP.

### Architecture

```
┌──────────────┐     ┌─────────────────────┐     ┌──────────────┐
│  Next.js     │────▶│  SpacetimeDB v2     │◀────│  13 Workers  │
│  Client      │ ws  │  (GCE VM + Nginx)   │ ws  │  (Cloud Run) │
└──────────────┘     └─────────────────────┘     └──────┬───────┘
                                                         │
                                                    ┌────▼────┐
                                                    │  GCS    │
                                                    │  Bucket │
                                                    └─────────┘
```

### Package Map

| Package | Purpose |
|---------|---------|
| `@flowstudio/shared` | Types, enums, constants, branding, utils |
| `@flowstudio/stdb-module` | SpacetimeDB tables + reducers (WASM module) |
| `@flowstudio/client` | Next.js 15 dashboard + project view |
| `@flowstudio/worker-shared` | BaseWorker, GCS client, semaphore, logger |
| `@flowstudio/worker-{name}` | 13 pipeline workers (see Pipeline below) |

### Video Processing Pipeline

```
Upload → [AUDIO_EXTRACT]  → [SPEECH_TRANSCRIPTION] ──────────┐
       → [VIDEO_SAMPLE]   → [VIDEO_UNDERSTANDING]  ──────────┤
                           → [UI_CHANGE_DETECT]     ──────────┤
       → [CURSOR_PROCESS] ──────────┐                        │
       → [TYPING_DETECT]  ──────────┤                        │
                                    ▼                        │
                           [INTERACTION_PATTERN] ─────────────┤
                                                              ▼
                                                    [INTENT_GRAPH]
                                                         │
                                                    [NARRATIVE_PLAN]
                                                         │
                                                    [EDIT_PLAN]
                                                         │
                                                    [TIMELINE_BUILD]
                                                         │
                                                      [RENDER] → ready
```

Task chaining is automatic — `completeTask` reducer checks the DAG and creates downstream tasks when all dependencies are met. Upstream `outputAssetIds` are forwarded.

---

## Commits

```
a64c3bc fix: final sweep suggestions (error handling, Dockerfile path)
d36707d fix: address all code review findings (sweeps 1-2)
31fd3fc feat: complete FlowStudio implementation (phases 1-6)
5ae941d chore: monorepo scaffold
```

---

## Verification Status

All 10 stop conditions pass:

| # | Condition | Status |
|---|-----------|--------|
| 1 | `pnpm -r exec tsc --noEmit` | PASS |
| 2 | Zero `any` types | PASS |
| 3 | Zero hardcoded brand strings | PASS |
| 4 | Zero hardcoded secrets | PASS |
| 5 | All reducers validate input | PASS |
| 6 | All async has error handling | PASS |
| 7 | Dockerfiles structurally correct | PASS |
| 8 | `terraform validate` | PASS |
| 9 | `.env.example` complete | PASS |
| 10 | Public exports documented | PASS |

3 code review sweeps completed. 27 issues found and fixed across sweeps 1-2. Sweep 3 confirmed all clear.

---

## Push Blocker

```
remote: Permission to Dawgsrlife/FlowStudio.git denied to CapitalistCookie.
```

The VM's `gh` auth is for `CapitalistCookie`. Options:
1. **Add collaborator:** `Dawgsrlife` adds `CapitalistCookie` as a collaborator on the repo
2. **Re-auth:** Run `gh auth login` with credentials that have push access to `Dawgsrlife/FlowStudio`
3. **Change remote:** Fork the repo under `CapitalistCookie` and push there
4. **PAT:** Set a personal access token: `git remote set-url origin https://<PAT>@github.com/Dawgsrlife/FlowStudio.git`

Once auth is resolved: `cd /home/user/FlowStudio && git push -u origin main`

---

## What's Needed Before Deployment

### Infrastructure Setup (one-time)

1. **Create Terraform state bucket manually** (chicken-and-egg with Terraform):
   ```bash
   gsutil mb -l us-east4 gs://flowstudio-terraform-state
   ```

2. **Apply Terraform:**
   ```bash
   cd infra/terraform && terraform init && terraform apply
   ```

3. **Point DNS:** `stdb.flowstudio.ai` A record → Terraform output `stdb_external_ip`

4. **Store secrets:**
   ```bash
   ./infra/scripts/setup-secrets.sh
   ```

5. **Publish SpacetimeDB module:**
   ```bash
   ./infra/scripts/deploy-stdb.sh
   ```
   Note: Requires `spacetime` CLI on the GCE VM. The WASM build (`spacetime build`) must happen on the VM since the dev machine only does TypeScript compilation.

6. **Build and deploy all services:**
   ```bash
   gcloud auth print-access-token | docker login -u oauth2accesstoken --password-stdin us-east4-docker.pkg.dev
   ./infra/scripts/deploy-all.sh v1
   ```

### GitHub Actions Setup

Add these secrets to the repo:
- `WIF_PROVIDER` — Workload Identity Federation provider
- `WIF_SA` — Service account for CI/CD

### Known Architectural Gaps

1. **Cursor/keyboard data capture:** The pipeline expects cursor/typing event data as separate JSON files. Currently only video upload is implemented. Workers gracefully handle missing data (return empty signals), so the pipeline completes through the audio/video branches.

2. **Authentication:** No auth on SpacetimeDB reducers or the upload Cloud Function. Acceptable for MVP, needs auth layer before public launch.

3. **SpacetimeDB ScheduleAt:** The `__init__` reducer uses `ScheduleAt.interval()` which matches the SDK API, but actual behavior depends on SpacetimeDB v2.0.1 runtime. Test on the GCE VM after module publish.

---

## Key Files Reference

| What | Where |
|------|-------|
| Branding (single source) | `packages/shared/src/branding.ts` |
| Task chaining DAG | `packages/stdb-module/src/index.ts` (lines 20-56) |
| All reducers | `packages/stdb-module/src/index.ts` (11 reducers) |
| Worker base class | `packages/workers/shared/src/base-worker.ts` |
| SpacetimeDB type stubs | `packages/stdb-module/src/spacetimedb-server.d.ts` |
| Upload flow | `packages/client/src/app/project/[id]/page.tsx` |
| Terraform entry | `infra/terraform/main.tf` |
| Worker Dockerfile | `infra/docker/Dockerfile.worker` |
| Deploy all script | `infra/scripts/deploy-all.sh` |
| Environment vars | `.env.example` |

---

## Development Commands

```bash
# Install deps
pnpm install

# Typecheck everything
pnpm -r exec tsc --noEmit

# Build shared packages
pnpm --filter @flowstudio/shared run build
pnpm --filter @flowstudio/worker-shared run build

# Run client locally
pnpm --filter @flowstudio/client run dev

# Validate Terraform
cd infra/terraform && terraform validate

# Build a single worker image
./infra/scripts/build-and-push.sh audio-extract v1

# Deploy everything
./infra/scripts/deploy-all.sh v1
```
