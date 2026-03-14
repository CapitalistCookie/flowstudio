# PLAN-W02 — Unified Environment Configuration

> **Problem**: `.env.example` and `.env` are completely mismatched. Workers can't run locally. Frontend has keys the backend doesn't know about. No validation.
> **Goal**: Single `.env.example` that covers ALL services. Validation script that tells you exactly what's missing.

---

## Current Mismatch

### `.env.example` has (but `.env` is missing):
- `STDB_HOST`, `STDB_MODULE`, `STDB_INTERNAL_HOST`, `STDB_INTERNAL_PORT`
- `GCS_BUCKET`, `GCP_REGION`
- `WORKER_NAME`, `WORKER_CONCURRENCY`, `WORKER_POLL_INTERVAL_MS`, `HEALTH_PORT`
- `NEXT_PUBLIC_STDB_HOST`, `NEXT_PUBLIC_STDB_MODULE`, `NEXT_PUBLIC_UPLOAD_FUNCTION_URL`
- `ARTIFACT_REGISTRY`, `STDB_VM_*`, `VPC_CONNECTOR_NAME`

### `.env` has (but `.env.example` is missing):
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, `NEXT_PUBLIC_CLERK_*_URL`
- `VERTEX_API_KEY`, `VERTEX_PROJECT_ID`, `VERTEX_LOCATION`
- `LLM_PROVIDER`
- `GOOGLE_CLOUD_LOCATION`, `GOOGLE_CLOUD_PROJECT_NUMBER`, `GOOGLE_CLOUD_PROJECT`
- `GOOGLE_APPLICATION_CREDENTIALS`

---

## Unified `.env.example`

Group by service, mark required vs optional, distinguish local vs production.

```env
# ─── Auth (Clerk) ─────────────────────────────
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=     # Required: Clerk publishable key
CLERK_SECRET_KEY=                       # Required: Clerk secret key
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL=/dashboard
NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL=/dashboard

# ─── SpacetimeDB ──────────────────────────────
STDB_HOST=localhost:3000               # Local dev default
STDB_MODULE=flowstudio
STDB_INTERNAL_HOST=localhost           # For workers (same as STDB_HOST in local dev)
STDB_INTERNAL_PORT=3000
NEXT_PUBLIC_STDB_HOST=ws://localhost:3000  # WebSocket URL for frontend

# ─── GCP ──────────────────────────────────────
GCP_PROJECT_ID=                        # Required for GCS/Cloud Run
GCP_REGION=us-east4
GCS_BUCKET=flowstudio-assets           # Required for workers
GOOGLE_APPLICATION_CREDENTIALS=        # Path to service account JSON (local dev)

# ─── AI / LLM ────────────────────────────────
LLM_PROVIDER=gemini                    # gemini | anthropic
GOOGLE_AI_API_KEY=                     # Required for Gemini (workers + railtracks)
DEEPGRAM_API_KEY=                      # Required for speech transcription
VERTEX_PROJECT_ID=                     # Optional: Vertex AI project
VERTEX_LOCATION=us-central1

# ─── Railtracks Gateway ──────────────────────
RAILTRACKS_GATEWAY_URL=http://localhost:8000
RAILTRACKS_GATEWAY_PORT=8000

# ─── Workers (only needed when running workers) ─
WORKER_NAME=audio-extract              # Set per-worker in docker/scripts
WORKER_CONCURRENCY=2
WORKER_POLL_INTERVAL_MS=1000
HEALTH_PORT=8080

# ─── Frontend ────────────────────────────────
NEXT_PUBLIC_UPLOAD_FUNCTION_URL=http://localhost:8081
NEXT_PUBLIC_RAILTRACKS_URL=http://localhost:8000

# ─── Infrastructure (deploy only) ───────────
ARTIFACT_REGISTRY=                     # Docker registry URL
STDB_VM_NAME=flowstudio-stdb
STDB_VM_ZONE=us-east4-c
STDB_DOMAIN=stdb.flowstudio.ai
STDB_CERTBOT_EMAIL=admin@flowstudio.ai
VPC_CONNECTOR_NAME=flowstudio-vpc
```

---

## Validation Script

Create `scripts/check-env.ts` that:
1. Reads `.env` (or env vars from process)
2. Checks required vars per context:
   - `--frontend`: Clerk, STDB, upload URL
   - `--worker <name>`: STDB, GCS, Deepgram/Gemini (per worker type)
   - `--gateway`: Gemini, STDB
   - `--all`: Everything
3. Prints ✅ for present, ❌ for missing, ⚠️ for empty
4. Exits non-zero if required vars missing

---

## Changes

| File | Change |
|------|--------|
| `.env.example` | Rewrite: unified, grouped, documented |
| `scripts/check-env.ts` | New: validation script |
| `package.json` | Add `"env:check"` script |
| `.env` | User updates to match new example |

---

## Test Plan

```
describe("check-env", () => {
  it("passes when all required frontend vars are set")
  it("fails when CLERK_SECRET_KEY is missing for frontend context")
  it("fails when GCS_BUCKET is missing for worker context")
  it("warns when optional vars are empty")
  it("prints human-readable report")
})
```

### Acceptance Criteria:
- [ ] `.env.example` covers all services in one file
- [ ] `pnpm env:check --frontend` passes with current `.env`
- [ ] `pnpm env:check --worker audio-extract` tells you exactly what's missing
- [ ] No service requires env vars not documented in `.env.example`
