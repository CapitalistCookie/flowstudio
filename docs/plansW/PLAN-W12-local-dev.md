# PLAN-W12 — Local Development Environment

> **Problem**: No docker-compose, no way to run the full stack locally. Developers must guess at env vars, hope GCP is configured, and run services manually.
> **Goal**: `docker-compose up` → SpacetimeDB + workers + gateway + frontend all running locally.

---

## Services

| Service | Image | Port | Purpose |
|---------|-------|------|---------|
| `stdb` | `clockworklabs/spacetimedb` | 3000 | SpacetimeDB server |
| `gateway` | Build from `packages/railtracks-gateway` | 8000 | Railtracks agentic gateway |
| `upload-fn` | Build from `infra/cloud-function` | 8081 | GCS upload URL generator |
| `frontend` | Build from `frontend/` | 3001 | Next.js app |
| `worker-audio` | Build from worker Dockerfile | — | Audio extract worker |
| `worker-video-sample` | Build from worker Dockerfile | — | Video sample worker |
| `worker-speech` | Build from worker Dockerfile | — | Speech transcription worker |
| `worker-video-understand` | Build from worker Dockerfile | — | Video understanding worker |
| `worker-cursor` | Build from worker Dockerfile | — | Cursor processor worker |
| `worker-typing` | Build from worker Dockerfile | — | Typing detector worker |
| `worker-ui-change` | Build from worker Dockerfile | — | UI change detector worker |
| `worker-interaction` | Build from worker Dockerfile | — | Interaction pattern worker |
| `worker-intent` | Build from worker Dockerfile | — | Intent graph worker |
| `worker-narrative` | Build from worker Dockerfile | — | Narrative planner worker |
| `worker-edit` | Build from worker Dockerfile | — | Edit planner worker |
| `worker-timeline` | Build from worker Dockerfile | — | Timeline builder worker |
| `worker-render` | Build from worker Dockerfile | — | Render worker |

---

## Profiles

Not all services needed for all dev scenarios:

### `docker-compose --profile core up`
- stdb, frontend, gateway, upload-fn

### `docker-compose --profile full up`
- All services

### `docker-compose --profile workers up`
- All workers only

---

## GCS for Local Dev

### Option A: Real GCS (simplest)
Use the service account key. Workers read/write to the real bucket.

### Option B: MinIO (offline dev)
Run MinIO as S3-compatible storage. Requires workers to use S3 protocol.

### Decision: Option A for hackathon. Real GCS with test bucket.

---

## SpacetimeDB Local

```yaml
stdb:
  image: clockworklabs/spacetimedb:latest
  ports:
    - "3000:3000"
  volumes:
    - stdb-data:/var/lib/spacetimedb
```

After start:
```bash
spacetime publish flowstudio --path packages/stdb-module
```

Or auto-publish via init script.

---

## docker-compose.yml

```yaml
version: "3.9"

services:
  stdb:
    image: clockworklabs/spacetimedb:latest
    ports:
      - "3000:3000"
    volumes:
      - stdb-data:/var/lib/spacetimedb

  frontend:
    build:
      context: .
      dockerfile: frontend/Dockerfile
    ports:
      - "3001:3000"
    env_file: .env
    depends_on:
      - stdb
    profiles: ["core", "full"]

  gateway:
    build:
      context: packages/railtracks-gateway
    ports:
      - "8000:8000"
    env_file: .env
    depends_on:
      - stdb
    profiles: ["core", "full"]

  upload-fn:
    build:
      context: infra/cloud-function/generate-upload-url
    ports:
      - "8081:8081"
    env_file: .env
    profiles: ["core", "full"]

  # Workers use a shared Dockerfile with WORKER_NAME arg
  worker-audio-extract:
    build:
      context: .
      dockerfile: infra/docker/Dockerfile.worker
      args:
        WORKER_NAME: audio-extract
        NEEDS_FFMPEG: "true"
    env_file: .env
    environment:
      WORKER_NAME: audio-extract
    depends_on:
      - stdb
    profiles: ["workers", "full"]

  # ... repeat for each worker ...

volumes:
  stdb-data:
```

---

## Dev Scripts

| Script | Command | Purpose |
|--------|---------|---------|
| `pnpm dev` | `next dev` in frontend/ | Frontend hot reload |
| `pnpm dev:gateway` | `uvicorn app.main:app --reload` | Gateway hot reload |
| `pnpm dev:stdb` | `spacetime publish` + logs | STDB module dev |
| `pnpm dev:full` | `docker-compose --profile full up` | Everything |

---

## Test Plan

```
describe("Local dev environment", () => {
  it("docker-compose --profile core up starts stdb, frontend, gateway")
  it("frontend accessible at http://localhost:3001")
  it("gateway health check at http://localhost:8000/health")
  it("STDB accessible at ws://localhost:3000")
  it("upload function accessible at http://localhost:8081")
})
```

### Acceptance Criteria:
- [ ] `docker-compose --profile core up` starts in < 2 minutes
- [ ] Frontend can connect to STDB
- [ ] Upload function generates signed URLs
- [ ] Gateway responds to health check
- [ ] Workers can connect to STDB and GCS
