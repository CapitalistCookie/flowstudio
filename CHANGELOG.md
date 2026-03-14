# Changelog

All notable changes to FlowStudio are documented in this file.

## [Unreleased]

### Fixed
- **Create Project bug** — replaced broken WebSocket-based STDB client with HTTP polling. STDB v2 requires BSATN binary for client→server WS messages, making the JSON WebSocket client non-functional. Now uses `POST /sql` for data fetching, 3s polling for live updates, and `POST /call/{reducer}` for mutations with immediate refresh after writes. (client v6)

## [0.1.0] — 2026-03-14

Initial deployment of FlowStudio to GCP.

### Added
- Monorepo scaffold: `packages/client`, `packages/shared`, `packages/stdb-module`, `infra/`
- Full implementation (phases 1-6): project CRUD, asset upload, 13-stage task DAG, signal ingestion, worker orchestration
- SpacetimeDB module with tables: projects, assets, tasks, signals, project_state, worker_configs
- Next.js client with project dashboard, create dialog, project detail page, file upload
- GCS upload via Cloud Function (`flowstudio-generate-upload-url`)
- WebSocket proxy (Cloud Run) for STDB access through HTTPS
- GCP deployment: 14 Cloud Run services, GCE VM for SpacetimeDB, Artifact Registry

### Fixed
- Rewrote STDB module for SpacetimeDB v2.0.4 API (new `table()` / `schema()` / `reducer()` syntax)
- STDB WebSocket: API path `v1/database/{module}/{action}` (not `/database/{action}/{module}`)
- STDB reducers: camelCase→snake_case conversion for v2 naming
- WebSocket proxy: forward `Sec-WebSocket-Protocol` header via `noServer` + `handleProtocols`
- Comprehensive code sweep: 38 issues across error handling, type safety, Dockerfiles, and documentation
- Removed credentials from tracked files
