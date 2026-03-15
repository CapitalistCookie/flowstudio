# Start Everything Locally (FlowStudio)

Use these commands to install dependencies and run all services for local testing.  
**Frontend** = `frontend/` (not `finalFrontend/`).

---

## 1. Prerequisites

- **Node.js** ≥ 20.18  
- **pnpm** ≥ 9 (`corepack enable && corepack prepare pnpm@9 --activate`)  
- **Docker** (for SpacetimeDB)  
- **Python 3.10+** (for Railtracks gateway)  
- **SpacetimeDB CLI** (for publishing the module) — [install](https://spacetimedb.com/docs/getting-started)

Ensure `.env` exists (copy from `.env.example`) and is filled for Clerk, GCP, STDB, and gateway.

---

## 2. Install Dependencies

```bash
# From repo root
cd /Users/vishnu/Documents/FlowStudio

# Monorepo (shared, stdb-module, workers)
pnpm install

# Frontend (lives outside pnpm workspace)
cd frontend && pnpm install && cd ..

# Railtracks gateway (Python)
cd packages/railtracks-gateway && python -m venv .venv && source .venv/bin/activate && pip install -r requirements.txt && cd ../..

# Upload Cloud Function (for signed GCS URLs when testing uploads)
cd infra/cloud-function/generate-upload-url && npm install && cd ../../..
```

---

## 3. Build Shared Packages

Required before frontend or workers can run:

```bash
pnpm --filter @flowstudio/shared run build
pnpm --filter @flowstudio/worker-shared run build
```

---

## 4. Start Services (order matters)

**Terminal 1 — SpacetimeDB (Docker)**

Uses `clockworklabs/spacetime` (the old `clockworklabs/spacetimedb` image was deprecated in 2025).  
SpacetimeDB is mapped to **host port 3002** so it doesn’t conflict with anything on 3000. Set `STDB_BACKEND_URL=http://127.0.0.1:3002` in `.env`.

```bash
# If you previously had "Permission denied" or connection refused, reset the volume:
docker compose down -v

docker compose up stdb -d
sleep 5
# Publish the STDB module (CLI uses -p/--module-path; -s points at local Docker)
cd packages/stdb-module && ~/.local/bin/spacetime publish flowstudio -p . -s http://localhost:3002 -y
# Or from repo root: spacetime publish flowstudio -p packages/stdb-module -s http://localhost:3002 -y
```

**Terminal 2 — Upload Cloud Function (optional; needed for GCS uploads from the app)**

```bash
cd infra/cloud-function/generate-upload-url
GCS_BUCKET=flowstudio-assets npx @google-cloud/functions-framework --target=generateUploadUrl --port=8081
# Or with GOOGLE_APPLICATION_CREDENTIALS if not using default gcloud auth
```

**Terminal 3 — Railtracks gateway (AI edit pipeline)**

```bash
cd packages/railtracks-gateway
source .venv/bin/activate
uvicorn app.main:app --reload --port 8000
```

**Terminal 4 — Frontend (Next.js)**

```bash
cd frontend
PORT=3001 pnpm run dev
```

Frontend will be at **http://localhost:3001** (port 3001 so SpacetimeDB can use 3000).  
It uses `/api/stdb` (proxies to `STDB_BACKEND_URL`, default `http://127.0.0.1:3000`) and `/api/upload-url` (proxies to `UPLOAD_FUNCTION_URL`, default `http://localhost:8081`).  
So: **SpacetimeDB on port 3000**, **upload function on 8081** for uploads, **gateway on 8000** for AI edits.

---

## 5. Optional: Workers (Docker)

To run the full pipeline (audio extract, video sample, transcription, etc.) locally via Docker:

```bash
# After stdb is up and module is published
docker compose --profile full up -d
```

Or run only core services (SpacetimeDB + gateway) without workers:

```bash
docker compose --profile core up -d
```

---

## 6. One-liner summary

```bash
# Install
pnpm install && (cd frontend && pnpm install) && (cd packages/railtracks-gateway && python -m venv .venv && .venv/bin/pip install -r requirements.txt) && (cd infra/cloud-function/generate-upload-url && npm install)

# Build shared
pnpm --filter @flowstudio/shared run build && pnpm --filter @flowstudio/worker-shared run build

# Start stdb + publish (then in other terminals: upload fn, gateway, frontend)
docker compose up stdb -d && sleep 5 && (cd packages/stdb-module && spacetime publish flowstudio -p . -s http://localhost:3002 -y)
```

---

## 7. Stop

```bash
docker compose --profile full down   # or: docker compose down
# Stop gateway and frontend with Ctrl+C in their terminals
```
