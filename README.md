# FlowStudio

An AI-powered video editing platform that automatically transforms screen recordings into polished, narrative-driven videos. A source recording is uploaded, decomposed into audio, visual, and interaction signals by 13 specialized workers, then reassembled into an edited output via LLM-driven intent analysis, narrative planning, and FFmpeg rendering.

**Repository:** https://github.com/Dawgsrlife/FlowStudio
**Stats:** 57 TypeScript files, ~4,600 lines of code, 17 workspace packages

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Prerequisites](#2-prerequisites)
3. [Repository Structure](#3-repository-structure)
4. [Getting Started](#4-getting-started)
5. [Package Reference](#5-package-reference)
6. [Architecture Deep Dive](#6-architecture-deep-dive)
7. [GCS Path Contract Reference](#7-gcs-path-contract-reference)
8. [Infrastructure](#8-infrastructure)
9. [Development Workflow](#9-development-workflow)
10. [Configuration Reference](#10-configuration-reference)
11. [Troubleshooting](#11-troubleshooting)
12. [Known Limitations and Future Work](#12-known-limitations-and-future-work)

---

## 1. Project Overview

FlowStudio is a TypeScript monorepo that processes video files through a 13-stage AI pipeline. The system extracts audio, samples video frames, detects UI changes, analyzes cursor and keyboard interactions, then uses LLMs (Claude and Gemini) to build an intent graph, create a narrative plan, produce an edit decision list, assemble a timeline, and render the final output with FFmpeg.

SpacetimeDB v2 (a real-time database running as a WASM module on a GCE VM) replaces the traditional Postgres + Redis + Celery stack. It handles task coordination, state management, and automatic task chaining. Workers run as Cloud Run services that poll SpacetimeDB for pending tasks via HTTP. The Next.js frontend uses HTTP polling (3s intervals) against SpacetimeDB's SQL and reducer endpoints for project and pipeline status updates. This HTTP bridge architecture is a temporary measure until the SpacetimeDB TypeScript SDK's BSATN support matures, at which point it can be swapped for real-time WebSocket subscriptions with minimal code changes.

### High-Level Architecture

```
                     Browser (Next.js 15)
                            |
                            | HTTP polling (3s)
                            v
                   +-----------------------+
                   |  SpacetimeDB v2       |
                   |  (GCE VM + Nginx)     |
                   |  - projects table     |
                   |  - tasks table        |
                   |  - signals table      |
                   |  - assets table       |
                   |  - project_state      |
                   |  - worker_configs     |
                   |  - watchdog schedule  |
                   +-----------+-----------+
                               |
                   HTTP (via VPC connector)
                               |
         +---------------------+---------------------+
         |          |          |          |           |
     +---v---+ +---v---+ +---v---+ +---v---+  ... (13 total)
     | audio | | video | |cursor | |typing |
     |extract| |sample | |process| |detect |
     +---+---+ +---+---+ +---+---+ +---+---+
         |          |          |          |
         +----------+----------+----------+
                               |
                          +----v----+
                          |   GCS   |
                          |  Bucket |
                          +---------+
```

### Tech Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Language | TypeScript (strict mode) | 5.7.3 |
| Runtime | Node.js | >= 20.18.0 |
| Package Manager | pnpm (workspaces) | >= 9.0.0 |
| Frontend | Next.js + React + Tailwind CSS | 15.3.2 / 19.1.0 / 4.1.4 |
| Database | SpacetimeDB v2 (WASM module, WebSocket push) | 2.0.4 |
| Object Storage | Google Cloud Storage | -- |
| Workers | Cloud Run (one service per worker type) | -- |
| AI / LLM | Anthropic Claude, Google Gemini | claude-sonnet-4-20250514, gemini-1.5-flash |
| Speech-to-Text | Deepgram Nova-2 | -- |
| Video Processing | FFmpeg (via fluent-ffmpeg) | -- |
| Image Processing | sharp | -- |
| Infrastructure | Terraform (GCP provider ~6.0) | >= 1.5.0 |
| CI/CD | GitHub Actions | -- |
| Container Registry | GCP Artifact Registry | -- |

---

## 2. Prerequisites

### Required Software

| Tool | Minimum Version | Install |
|------|----------------|---------|
| Node.js | 20.18.0 | https://nodejs.org/ |
| pnpm | 9.0.0 | `corepack enable && corepack prepare pnpm@9 --activate` |
| gcloud CLI | latest | https://cloud.google.com/sdk/docs/install |
| Terraform | 1.5.0 | https://developer.hashicorp.com/terraform/install |
| Docker | latest | https://docs.docker.com/engine/install/ |
| spacetime CLI | 2.0.1 | https://spacetimedb.com/docs/getting-started (needed on GCE VM only) |

### GCP Project Requirements

- GCP project with billing enabled
- APIs enabled: Cloud Run, Compute Engine, Cloud Storage, Artifact Registry, Secret Manager, Cloud Functions, VPC Access
- A service account with appropriate IAM roles (see Terraform config)
- Workload Identity Federation configured for GitHub Actions (for CI/CD)

### Required API Keys

| Service | Purpose | Where Used |
|---------|---------|-----------|
| Deepgram | Speech transcription (Nova-2) | `speech-transcription` worker |
| Google AI (Gemini) | Video frame analysis | `video-understanding` worker |
| Anthropic (Claude) | Intent graph, narrative planning, edit planning | `intent-graph`, `narrative-planner`, `edit-planner` workers |

---

## 3. Repository Structure

```
FlowStudio/
├── .github/
│   └── workflows/
│       ├── ci.yml                          # Typecheck on push/PR to main
│       ├── deploy.yml                      # Manual deploy workflow (version + services)
│       └── deploy-stdb.yml                 # Manual SpacetimeDB module publish
├── infra/
│   ├── cloud-function/
│   │   └── generate-upload-url/
│   │       ├── index.js                    # Cloud Function: signed GCS upload URLs
│   │       └── package.json
│   ├── docker/
│   │   ├── Dockerfile.client               # Next.js client (multi-stage, port 3000)
│   │   └── Dockerfile.worker               # Generic worker (multi-stage, port 8080, optional FFmpeg)
│   ├── scripts/
│   │   ├── build-and-push.sh               # Build + push a single Docker image
│   │   ├── deploy-all.sh                   # Build + deploy all 13 workers + client
│   │   ├── deploy-worker.sh                # Deploy a single Cloud Run service
│   │   ├── deploy-stdb.sh                  # Upload + publish SpacetimeDB module to GCE VM
│   │   └── setup-secrets.sh                # Store API keys in GCP Secret Manager
│   └── terraform/
│       ├── main.tf                         # Provider, backend (GCS state bucket)
│       ├── variables.tf                    # project_id, region, zone, stdb_domain, etc.
│       ├── network.tf                      # VPC, subnet, VPC connector, firewall rules
│       ├── stdb-vm.tf                      # GCE VM for SpacetimeDB + Nginx + Certbot
│       ├── cloud-run.tf                    # Client + 13 worker Cloud Run services
│       ├── storage.tf                      # GCS asset bucket, Terraform state bucket, Artifact Registry
│       ├── secrets.tf                      # Secret Manager secrets + IAM bindings
│       └── outputs.tf                      # stdb_external_ip, gcs_bucket, client_url, etc.
├── packages/
│   ├── shared/                             # @flowstudio/shared — types, enums, constants, branding
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/
│   │       ├── index.ts                    # Re-exports everything
│   │       ├── branding.ts                 # Single source of truth for app name, URLs, colors
│   │       ├── constants.ts                # Task chain DAG, dependencies, initial tasks, retry config
│   │       ├── utils.ts                    # generateId, gcsAssetPath, safeJsonParse, sleep
│   │       └── types/
│   │           ├── enums.ts                # TaskType, TaskStatus, ProjectStatus, AssetType, SignalType
│   │           ├── tables.ts               # TypeScript interfaces for all SpacetimeDB tables
│   │           ├── signals.ts              # Payload interfaces for each SignalType
│   │           └── events.ts               # Event interfaces (TaskStatusEvent, etc.)
│   ├── stdb-module/                        # @flowstudio/stdb-module — SpacetimeDB WASM module
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/
│   │       ├── index.ts                    # All tables, reducers, watchdog, task chaining logic
│   │       └── spacetimedb-server.d.ts     # Type stubs for spacetimedb/server runtime
│   ├── claudeFrontend/                      # @flowstudio/frontend — Next.js 15 frontend (production)
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/
│   │       ├── app/
│   │       │   ├── layout.tsx              # Root layout (dark mode, branding metadata)
│   │       │   ├── page.tsx                # Dashboard: project list + create dialog
│   │       │   ├── error.tsx               # Global error boundary
│   │       │   ├── globals.css             # Tailwind + CSS variables from branding
│   │       │   └── project/
│   │       │       └── [id]/
│   │       │           └── page.tsx        # Project detail: upload, pipeline status, progress
│   │       ├── components/
│   │       │   ├── Header.tsx              # App header with connection status indicator
│   │       │   ├── ProjectCard.tsx         # Project list card with status badge
│   │       │   ├── PipelineStatus.tsx      # Task list with status icons and failure reasons
│   │       │   └── CreateProjectDialog.tsx # Modal dialog for creating new projects
│   │       └── lib/
│   │           ├── stdbConnection.ts        # HTTP bridge: initConnection, callReducer, queryTable, disconnect
│   │           └── stdbHooks.ts             # useStdbReducer, useConnectionStatus
│   └── workers/
│       ├── shared/                         # @flowstudio/worker-shared — base worker framework
│       │   ├── package.json
│       │   ├── tsconfig.json
│       │   └── src/
│       │       ├── index.ts                # Re-exports all shared worker modules
│       │       ├── base-worker.ts          # BaseWorker abstract class (poll, claim, process, complete)
│       │       ├── config.ts               # WorkerConfig + loadConfig() from env vars
│       │       ├── gcs-client.ts           # GcsClient: upload, download, exists, signed URLs, retry
│       │       ├── stdb-client.ts          # StdbClient: HTTP-only reducer calls + SQL table queries
│       │       ├── semaphore.ts            # Counting semaphore for concurrency control
│       │       ├── health.ts               # HTTP health check server (/health on port 8080)
│       │       └── logger.ts               # Structured JSON logger (stdout/stderr)
│       ├── audio-extract/                  # Worker: extract audio track via FFmpeg
│       │   └── src/
│       │       ├── entrypoint.ts           # Instantiate + start worker
│       │       ├── worker.ts               # AudioExtractWorker implementation
│       │       └── ffmpeg.d.ts             # Type declarations for FFmpeg modules
│       ├── video-sample/                   # Worker: extract frames at 2s intervals via FFmpeg
│       ├── cursor-processor/               # Worker: process cursor event data into movement signals
│       ├── typing-detector/                # Worker: detect typing bursts from keyboard events
│       ├── speech-transcription/           # Worker: transcribe audio via Deepgram Nova-2
│       ├── video-understanding/            # Worker: analyze frames with Gemini multimodal
│       ├── ui-change-detector/             # Worker: detect UI transitions via frame differencing
│       ├── interaction-pattern/            # Worker: cluster cursor + typing signals
│       ├── intent-graph/                   # Worker: build intent hierarchy via Claude
│       ├── narrative-planner/              # Worker: create narrative beats via Claude
│       ├── edit-planner/                   # Worker: generate edit decisions via Claude
│       ├── timeline-builder/               # Worker: assemble timeline from edit decisions
│       └── render/                         # Worker: render final video via FFmpeg
├── package.json                            # Root: scripts (build, typecheck, lint, clean)
├── pnpm-workspace.yaml                     # Workspace: shared, stdb-module, client, workers/*
├── pnpm-lock.yaml                          # Lockfile
├── tsconfig.base.json                      # Shared TS config (ES2022, NodeNext, strict)
├── .env.example                            # All environment variables with descriptions
└── HANDOFF.md                              # Build handoff document with verification status
```

---

## 4. Getting Started

### Clone and Install

```bash
git clone https://github.com/Dawgsrlife/FlowStudio.git
cd FlowStudio
corepack enable && corepack prepare pnpm@9 --activate
pnpm install
```

### Environment Setup

```bash
cp .env.example .env
```

Edit `.env` and fill in the values. See [Section 10: Configuration Reference](#10-configuration-reference) for a complete variable-by-variable explanation.

### Build Shared Packages

Shared packages must be built before the client or any worker can run:

```bash
pnpm --filter @flowstudio/shared run build
pnpm --filter @flowstudio/worker-shared run build
```

### Run the Client Locally

```bash
pnpm --filter @flowstudio/frontend run dev
```

The client starts at `http://localhost:3000`. It requires a running SpacetimeDB instance (local or remote) to function. Set `NEXT_PUBLIC_STDB_HOST` to `http://localhost:3000` for local development.

### Typecheck Everything

```bash
pnpm -r exec tsc --noEmit
```

This is the CI gate. Zero errors required before merge.

---

## 5. Package Reference

### `@flowstudio/shared`

**Path:** `packages/shared/`
**Purpose:** Single source of truth for all types, enums, constants, branding, and utility functions shared across the client, workers, and infrastructure.

**Key Exports:**

| Export | File | Description |
|--------|------|-------------|
| `BRANDING` | `branding.ts` | App name, tagline, domain, URLs, color palette, infra prefix |
| `TaskType` | `types/enums.ts` | Enum of all 13 task types (AUDIO_EXTRACT through RENDER) |
| `TaskStatus` | `types/enums.ts` | Task lifecycle: pending, claimed, completed, failed, stale |
| `ProjectStatus` | `types/enums.ts` | Project lifecycle: created, uploading, processing, ready, failed |
| `AssetType` | `types/enums.ts` | source_video, audio_track, frame_sample, thumbnail, rendered_video, transcript |
| `SignalType` | `types/enums.ts` | 10 signal types produced by workers |
| `TASK_CHAIN_DAG` | `constants.ts` | Maps completed task -> downstream tasks to create |
| `TASK_DEPENDENCIES` | `constants.ts` | Maps task type -> prerequisite task types |
| `INITIAL_TASK_TYPES` | `constants.ts` | 4 tasks created on upload: AUDIO_EXTRACT, VIDEO_SAMPLE, CURSOR_PROCESS, TYPING_DETECT |
| `Project`, `Task`, `Asset`, `Signal`, `ProjectState`, `WorkerConfig` | `types/tables.ts` | TypeScript interfaces mirroring SpacetimeDB tables |
| Signal payload interfaces | `types/signals.ts` | SpeechSegmentPayload, SceneChangePayload, UITransitionPayload, etc. |
| `gcsAssetPath()` | `utils.ts` | Build standardized GCS paths: `gs://{bucket}/projects/{projectId}/{assetType}/{filename}` |
| `safeJsonParse()` | `utils.ts` | JSON.parse with fallback |

**Dependencies:** None (leaf package).
**Build:** `pnpm --filter @flowstudio/shared run build`

---

### `@flowstudio/stdb-module`

**Path:** `packages/stdb-module/`
**Purpose:** SpacetimeDB WASM module defining all database tables, reducers, task chaining logic, and the watchdog scheduler.

**Key Exports:** The module is compiled to WASM and published to SpacetimeDB. It does not export anything consumed by other packages at build time.

**Important:** WASM modules cannot import from other workspace packages at runtime. All constants (DAG, retry limits, thresholds) are inlined in `src/index.ts`. Changes to `@flowstudio/shared/constants.ts` must be manually mirrored here.

**Dependencies:** `spacetimedb/server` (runtime-provided, type stubs in `spacetimedb-server.d.ts`)
**Build:** `pnpm --filter @flowstudio/stdb-module run build` (TypeScript only; WASM build requires `spacetime build` on the GCE VM)

---

### `@flowstudio/frontend`

**Path:** `claudeFrontend/`
**Purpose:** Next.js 15 frontend dashboard for creating projects, uploading videos, and monitoring pipeline progress in real time.

**Key Exports:** None (standalone application).

**Dependencies:**
- `@flowstudio/shared` (workspace)
- `next` 15.3.2, `react` 19.1.0, `tailwindcss` 4.1.4

**Build:** `pnpm --filter @flowstudio/frontend run build`
**Dev:** `pnpm --filter @flowstudio/frontend run dev`

---

### `@flowstudio/worker-shared`

**Path:** `packages/workers/shared/`
**Purpose:** Base worker framework providing the `BaseWorker` abstract class, GCS client, health server, semaphore, and structured logger. Communicates with SpacetimeDB via native WebSocket SDK.

**Key Exports:**

| Export | Description |
|--------|-------------|
| `BaseWorker` | Abstract class: WebSocket subscription, reactive task claiming, signal writing, error handling |
| `TaskData` | Interface: id, projectId, taskType, inputAssetIds, config |
| `TaskResult` | Interface: outputAssetIds, signals array |
| `GcsClient` | Upload/download/exists with exponential backoff retry (3 attempts) |
| `Semaphore` | Counting semaphore for concurrent task limiting |
| `Logger` | Structured JSON logger with levels (debug, info, warn, error) |
| `loadConfig()` | Load WorkerConfig from environment variables |
| `startHealthServer()` | HTTP server on `/health` endpoint |

**Dependencies:**
- `@flowstudio/shared` (workspace)
- `@google-cloud/storage` 7.16.0

**Build:** `pnpm --filter @flowstudio/worker-shared run build`

---

### Worker Packages (13 total)

Each worker package follows the same structure:

```
packages/workers/{worker-name}/
├── package.json
├── tsconfig.json
└── src/
    ├── entrypoint.ts    # Instantiate worker class, call .start()
    └── worker.ts        # Extends BaseWorker, implements processTask()
```

| Worker Package | Task Type | API Key | FFmpeg | Description |
|----------------|-----------|---------|--------|-------------|
| `audio-extract` | AUDIO_EXTRACT | -- | Yes | Extract WAV audio from source video |
| `video-sample` | VIDEO_SAMPLE | -- | Yes | Extract JPEG frames at 2s intervals, detect scene changes |
| `cursor-processor` | CURSOR_PROCESS | -- | No | Process cursor event JSON into movement signals |
| `typing-detector` | TYPING_DETECT | -- | No | Detect typing bursts from keyboard event JSON |
| `speech-transcription` | SPEECH_TRANSCRIPTION | Deepgram | No | Transcribe audio via Deepgram Nova-2 |
| `video-understanding` | VIDEO_UNDERSTANDING | Google AI | No | Analyze frames with Gemini multimodal (batches of 4) |
| `ui-change-detector` | UI_CHANGE_DETECT | -- | No | Detect UI transitions via grid-based frame differencing |
| `interaction-pattern` | INTERACTION_PATTERN | -- | No | Cluster cursor + typing signals by time proximity |
| `intent-graph` | INTENT_GRAPH | Anthropic | No | Build intent hierarchy from all upstream signals via Claude |
| `narrative-planner` | NARRATIVE_PLAN | Anthropic | No | Create narrative beats from intent graph via Claude |
| `edit-planner` | EDIT_PLAN | Anthropic | No | Generate edit decisions from narrative plan via Claude |
| `timeline-builder` | TIMELINE_BUILD | -- | No | Assemble video/audio timeline from edit decisions |
| `render` | RENDER | -- | Yes | Render final video from timeline via FFmpeg filter_complex |

**Dependencies:** All depend on `@flowstudio/shared` and `@flowstudio/worker-shared`. FFmpeg workers also depend on `fluent-ffmpeg` and `@ffmpeg-installer/ffmpeg`. Vision workers depend on `sharp`. LLM workers depend on `@anthropic-ai/sdk` or `@google/generative-ai`. Speech worker depends on `@deepgram/sdk`.

---

## 6. Architecture Deep Dive

### 6a. SpacetimeDB Module

**File:** `packages/stdb-module/src/index.ts`

SpacetimeDB is an in-memory database that runs application logic as WASM modules. The client and workers communicate via the native SpacetimeDB TypeScript SDK (v2.0.4) over WebSocket with real-time push subscriptions. Table changes arrive instantly via `onInsert`/`onUpdate`/`onDelete` callbacks, and reducers are called through typed generated bindings. The module defines 7 tables and 16 reducers.

#### Tables

| Table | Primary Key | Public | Fields | Purpose |
|-------|------------|--------|--------|---------|
| `projects` | `id: string` | Yes | name, status, createdAt, updatedAt, ownerId, metadata (JSON) | Top-level project records |
| `assets` | `id: string` | Yes | projectId, assetType, gcsPath, sizeBytes, mimeType, durationMs, createdAt, metadata (JSON) | Registered file assets (source video, audio, frames, rendered output) |
| `tasks` | `id: string` | Yes | projectId, taskType, status, workerId, inputAssetIds (JSON), outputAssetIds (JSON), config (JSON), createdAt, claimedAt, completedAt, failureReason, retryCount, maxRetries | Pipeline task records |
| `signals` | `id: string` | Yes | projectId, taskId, signalType, timestampMs, durationMs, confidence (0-1), payload (JSON), createdAt | Signal data produced by workers |
| `project_state` | `projectId: string` | Yes | completedTasks (JSON array), totalTasks, completedCount, currentPhase, lastUpdated | Aggregated project progress |
| `worker_configs` | `workerId: string` | Yes | workerType, lastHeartbeat, isActive, concurrency, metadata (JSON) | Worker registration and heartbeat |
| `watchdog_schedule` | `scheduledId: u64` (auto-inc) | No | scheduledAt | Internal scheduled table for watchdog timer |

#### Reducers

| Reducer | Arguments | Behavior |
|---------|-----------|----------|
| `createProject` | name, ownerId, metadata | Insert project + project_state rows. Status = "created". |
| `createAsset` | projectId, assetType, gcsPath, sizeBytes, mimeType, durationMs, metadata | Validate project exists, insert asset row. |
| `createTask` | projectId, taskType, inputAssetIds, config, maxRetries | Validate project exists, insert task with status = "pending". |
| `claimTask` | taskId, workerId | Atomically set status = "claimed" if currently "pending". Throws if not pending (race-safe). |
| `findAndClaimTask` | taskType, workerId | Find first pending task of given type, atomically claim it. Throws if none found. |
| `completeTask` | taskId, outputAssetIds | Mark task completed. Update project_state. **Run task chaining** (see below). If RENDER completes, mark project "ready". |
| `failTask` | taskId, failureReason | Mark task failed. If retryCount < maxRetries, create a new pending copy with retryCount + 1. Otherwise update project_state to "failed". |
| `writeSignal` | projectId, taskId, signalType, timestampMs, durationMs, confidence, payload | Insert a single signal record. |
| `ingestInteractionBatch` | projectId, taskId, signalType, batchJson | Batch-insert up to 1000 signal records from a JSON array. |
| `updateProjectState` | projectId, currentPhase, status | Update project_state.currentPhase and projects.status. |
| `updateWorkerConfig` | workerId, workerType, isActive, concurrency, metadata | Upsert worker config with heartbeat timestamp. |

**Scheduled Reducers:**

| Reducer | Schedule | Behavior |
|---------|----------|----------|
| `watchdog_schedule` | Every 30 seconds | Scans for stale tasks (claimed > 5 minutes ago). If retries remain, resets to pending. Otherwise marks as failed. |
| `__init__` | Once (on module publish) | Seeds the watchdog schedule interval. |

#### Task Chaining DAG

When `completeTask` runs, it checks the `TASK_CHAIN_DAG` to determine which downstream tasks should be created. A downstream task is created only when ALL of its dependencies are completed and no task of that type already exists for the project.

```
AUDIO_EXTRACT  ─────────> SPEECH_TRANSCRIPTION ──┐
                                                   │
VIDEO_SAMPLE   ─────┬──> VIDEO_UNDERSTANDING ─────┤
                    │                              │
                    └──> UI_CHANGE_DETECT ─────────┤
                                                   │
CURSOR_PROCESS ─────┬──> INTERACTION_PATTERN ──────┤
                    │                              │
TYPING_DETECT  ─────┘                              │
                                                   v
                                            INTENT_GRAPH
                                                   │
                                            NARRATIVE_PLAN
                                                   │
                                             EDIT_PLAN
                                                   │
                                           TIMELINE_BUILD
                                                   │
                                              RENDER
```

**Dependencies (all must be met before task is created):**

| Task Type | Depends On |
|-----------|-----------|
| AUDIO_EXTRACT | (none -- initial) |
| VIDEO_SAMPLE | (none -- initial) |
| CURSOR_PROCESS | (none -- initial) |
| TYPING_DETECT | (none -- initial) |
| SPEECH_TRANSCRIPTION | AUDIO_EXTRACT |
| VIDEO_UNDERSTANDING | VIDEO_SAMPLE |
| UI_CHANGE_DETECT | VIDEO_SAMPLE |
| INTERACTION_PATTERN | CURSOR_PROCESS, TYPING_DETECT |
| INTENT_GRAPH | SPEECH_TRANSCRIPTION, VIDEO_UNDERSTANDING, UI_CHANGE_DETECT, INTERACTION_PATTERN |
| NARRATIVE_PLAN | INTENT_GRAPH |
| EDIT_PLAN | NARRATIVE_PLAN |
| TIMELINE_BUILD | EDIT_PLAN |
| RENDER | TIMELINE_BUILD |

**Output asset forwarding:** When a downstream task is created, the `outputAssetIds` from all completed upstream dependency tasks are collected and passed as the new task's `inputAssetIds`.

---

### 6b. Worker System

**File:** `packages/workers/shared/src/base-worker.ts`

#### BaseWorker Lifecycle

```
start()
  ├── Start HTTP health server on port 8080 (/health endpoint)
  ├── Connect to SpacetimeDB via WebSocket (native SDK)
  ├── Register worker config via typed reducer
  ├── Subscribe to tasks table
  │     └── onInsert: if pending + matching taskType → tryClaimTask()
  │     └── onUpdate: if claimed by this worker → dispatchTask()
  │
  ├── Fallback poll loop (if WebSocket unavailable)
  └── Listen for SIGTERM/SIGINT -> graceful shutdown

handleClaimedTask(task)
  ├── Acquire semaphore slot
  ├── Call processTask(task) [implemented by subclass]
  ├── For each signal in result: call writeSignal reducer
  ├── Call completeTask reducer (triggers chaining)
  └── On error: call failTask reducer
```

#### How to Create a New Worker (Step-by-Step)

1. Create a new directory: `packages/workers/{worker-name}/`

2. Create `package.json`:
   ```json
   {
     "name": "@flowstudio/worker-{worker-name}",
     "version": "0.1.0",
     "private": true,
     "type": "module",
     "scripts": { "build": "tsc", "typecheck": "tsc --noEmit" },
     "dependencies": {
       "@flowstudio/shared": "workspace:*",
       "@flowstudio/worker-shared": "workspace:*"
     },
     "devDependencies": {
       "@types/node": "22.15.3",
       "typescript": "5.7.3"
     }
   }
   ```

3. Create `tsconfig.json` extending `../../../tsconfig.base.json`.

4. Create `src/worker.ts`:
   ```typescript
   import { TaskType } from '@flowstudio/shared';
   import { BaseWorker, type TaskData, type TaskResult } from '@flowstudio/worker-shared';

   export class MyWorker extends BaseWorker {
     readonly taskType = TaskType.MY_TASK_TYPE;

     async processTask(task: TaskData): Promise<TaskResult> {
       // 1. Download inputs from GCS via this.gcs.download()
       // 2. Process data
       // 3. Upload outputs to GCS via this.gcs.upload()
       // 4. Return output asset IDs and signals
       return { outputAssetIds: [], signals: [] };
     }
   }
   ```

5. Create `src/entrypoint.ts`:
   ```typescript
   import { MyWorker } from './worker.js';
   const worker = new MyWorker();
   worker.start().catch((err) => {
     console.error('Failed to start worker:', err);
     process.exit(1);
   });
   ```

6. Add the new `TaskType` to `packages/shared/src/types/enums.ts`.

7. Add the task to `TASK_CHAIN_DAG` and `TASK_DEPENDENCIES` in both:
   - `packages/shared/src/constants.ts`
   - `packages/stdb-module/src/index.ts` (must be mirrored manually)

8. Add the worker name to the `WORKERS` array in `infra/scripts/deploy-all.sh`.

9. Add the worker to `locals.workers` in `infra/terraform/cloud-run.tf`. If it needs API keys, add it to the appropriate `*_workers` set.

10. Run `pnpm install` and `pnpm -r exec tsc --noEmit` to verify.

#### Worker Configuration (Environment Variables)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `STDB_INTERNAL_HOST` | Yes | -- | SpacetimeDB host (internal VPC IP) |
| `STDB_INTERNAL_PORT` | No | 3000 | SpacetimeDB port |
| `STDB_MODULE` | No | flowstudio | SpacetimeDB module name |
| `GCS_BUCKET` | Yes | -- | GCS bucket name for assets |
| `GCP_PROJECT_ID` | Yes | -- | GCP project ID |
| `WORKER_NAME` | Yes | -- | Worker identifier (e.g., "audio-extract") |
| `WORKER_ID` | No | `{WORKER_NAME}-{timestamp}` | Unique worker instance ID |
| `WORKER_CONCURRENCY` | No | 2 | Max concurrent tasks per worker instance |
| `WORKER_POLL_INTERVAL_MS` | No | 1000 | Poll interval in milliseconds |
| `HEALTH_PORT` | No | 8080 | HTTP health check server port |
| `DEEPGRAM_API_KEY` | Worker-specific | -- | Deepgram API key (speech-transcription only) |
| `GOOGLE_AI_API_KEY` | Worker-specific | -- | Google AI API key (video-understanding only) |
| `ANTHROPIC_API_KEY` | Worker-specific | -- | Anthropic API key (intent-graph, narrative-planner, edit-planner) |
| `ANTHROPIC_MODEL` | No | claude-sonnet-4-20250514 | Anthropic model ID |
| `GOOGLE_AI_MODEL` | No | gemini-1.5-flash | Google AI model ID |

#### Concurrency Control

Each worker instance uses a `Semaphore` (file: `packages/workers/shared/src/semaphore.ts`) initialized with `WORKER_CONCURRENCY` (default 2). The poll loop checks `semaphore.activeCount >= concurrency` before attempting to claim a task. Processing runs inside `semaphore.run()` to enforce the limit.

#### Health Checks

Every worker starts an HTTP server (file: `packages/workers/shared/src/health.ts`) on `HEALTH_PORT` (default 8080). Cloud Run startup probes hit `GET /health`. The response is JSON:

```json
{
  "healthy": true,
  "workerName": "audio-extract",
  "workerId": "audio-extract-m3abc",
  "activeTasks": 1,
  "uptime": 3600
}
```

`healthy` is `true` when the worker is running. (The HTTP client is stateless, so connectivity is confirmed by successful reducer/SQL calls.)

#### GCS Client

File: `packages/workers/shared/src/gcs-client.ts`

All GCS operations use exponential backoff retry (3 attempts, base delay 1000ms). The client strips the `gs://{bucket}/` prefix from paths automatically.

Methods: `upload(path, data, contentType)`, `download(path)`, `exists(path)`, `getSignedUploadUrl(path)`, `getSignedDownloadUrl(path)`.

---

### 6c. Frontend

**File:** `claudeFrontend/`

#### Pages and Routing

| Route | Component | Description |
|-------|-----------|-------------|
| `/` | `page.tsx` | Dashboard -- lists all projects, "New Project" button |
| `/project/[id]` | `project/[id]/page.tsx` | Project detail -- upload zone (drag-and-drop), pipeline status, progress bar |

#### SpacetimeDB Connection Management

File: `claudeFrontend/src/lib/spacetimedb.ts`

A singleton module managing the SpacetimeDB WebSocket connection via the native SDK (v2.0.4). On connect, it subscribes to all 5 public tables and wires `onInsert`/`onUpdate`/`onDelete` callbacks to Zustand stores for real-time push updates. Reducer calls are type-safe through generated bindings (`getConnection().reducers.createProject({...})`). BigInt fields from the SDK are converted to Number at the store boundary.

- `initSpacetimeDb(config)` connects via WebSocket, subscribes to tables, wires store callbacks
- `getConnection()` returns the singleton `DbConnection` for typed reducer calls
- `syncStoresForProject(projectStore, signalStore)` re-syncs scoped data on project switch
- `setActiveProjectForSync(id)` sets the active project filter for scoped table callbacks
- `disconnectSpacetimeDb()` tears down the connection

Module bindings: `claudeFrontend/src/module_bindings/index.ts` — typed table schemas and reducer definitions matching the STDB module.

#### Component Hierarchy

```
RootLayout (layout.tsx)
└── DashboardPage (page.tsx)
    ├── Header (connection status indicator)
    ├── ProjectCard[] (project list)
    └── CreateProjectDialog (modal)

RootLayout (layout.tsx)
└── ProjectPage (project/[id]/page.tsx)
    ├── Header
    ├── Progress bar (computed from completed/total tasks)
    ├── PipelineStatus (task list with status icons + failure reasons)
    └── Upload zone (drag-and-drop, 5GB limit, video/* only)
```

#### Upload Flow

1. User drops a video file (max 5GB, must be `video/*`)
2. Client calls Cloud Function `POST /generate-upload-url` with `{ projectId, filename, contentType }`
3. Cloud Function validates input (no path traversal, video content type only) and returns a signed GCS upload URL
4. Client PUTs the file directly to GCS via the signed URL
5. Client calls `createAsset` reducer to register the asset in SpacetimeDB
6. Client calls `createTask` reducer for each of the 4 initial task types (AUDIO_EXTRACT, VIDEO_SAMPLE, CURSOR_PROCESS, TYPING_DETECT), passing the full GCS path as `inputAssetIds`
7. Client calls `updateProjectState` to set status to "processing"

---

### 6d. Video Processing Pipeline

#### Full Pipeline Flow

```
                          SOURCE VIDEO UPLOAD
                                 │
                    ┌────────────┼────────────┬──────────────┐
                    v            v            v              v
             AUDIO_EXTRACT  VIDEO_SAMPLE  CURSOR_PROCESS  TYPING_DETECT
                    │            │            │              │
                    │       ┌────┴────┐       └──────┬───────┘
                    v       v         v              v
            SPEECH_TRANS  VIDEO_UND  UI_CHANGE   INTERACTION_PATTERN
                    │       │         │              │
                    └───────┴─────────┴──────────────┘
                                     │
                                     v
                               INTENT_GRAPH
                                     │
                                     v
                              NARRATIVE_PLAN
                                     │
                                     v
                                EDIT_PLAN
                                     │
                                     v
                              TIMELINE_BUILD
                                     │
                                     v
                                  RENDER
                                     │
                                     v
                              RENDERED VIDEO
```

#### Stage Details

| Stage | Worker | Input | Processing | Output (GCS) | Signals Produced |
|-------|--------|-------|-----------|--------------|-----------------|
| AUDIO_EXTRACT | audio-extract | Source video (GCS path) | FFmpeg: extract mono 16kHz WAV | `projects/{id}/audio_track/audio.wav` | None |
| VIDEO_SAMPLE | video-sample | Source video (GCS path) | FFmpeg: extract frames at 2s intervals; sharp: resize to 1280x720; compare consecutive frames | `projects/{id}/frame_sample/frame-NNNN.jpg` (one per frame) | SCENE_CHANGE (when frame diff > 0.3) |
| CURSOR_PROCESS | cursor-processor | Cursor event JSON (if available) | Segment by 2s gaps, compute speed, classify movement type (linear/erratic/hover/click) | `projects/{id}/signals/cursor_movements.json` | CURSOR_MOVEMENT |
| TYPING_DETECT | typing-detector | Keyboard event JSON (if available) | Detect typing bursts (>= 3 keys, < 1.5s gap), detect paste (> 15 CPS) | `projects/{id}/signals/typing_events.json` | TYPING_EVENT |
| SPEECH_TRANSCRIPTION | speech-transcription | Audio WAV | Deepgram Nova-2 with diarization + utterances | `projects/{id}/transcript/transcript.json` + `projects/{id}/signals/speech_segments.json` | SPEECH_SEGMENT |
| VIDEO_UNDERSTANDING | video-understanding | Frame JPEGs (asset IDs from video-sample) | Gemini multimodal: analyze batches of 4 frames for visual changes | `projects/{id}/signals/scene_descriptions.json` | SCENE_CHANGE |
| UI_CHANGE_DETECT | ui-change-detector | Frame JPEGs (downloaded by frame index) | Grid-based (4x4) pixel differencing between consecutive frames; classify transition type | `projects/{id}/signals/ui_transitions.json` | UI_TRANSITION |
| INTERACTION_PATTERN | interaction-pattern | Cursor + typing signal JSONs from GCS | Time-based clustering (5s window), intent inference (form_interaction/text_input/navigation) | `projects/{id}/signals/interaction_clusters.json` | INTERACTION_CLUSTER |
| INTENT_GRAPH | intent-graph | All 4 upstream signal JSONs from GCS | Claude: build hierarchical intent tree from all signals | `projects/{id}/signals/intent_graph.json` | INTENT_NODE |
| NARRATIVE_PLAN | narrative-planner | Intent graph JSON from GCS | Claude: create narrative beats (setup/action/result/transition/highlight) | `projects/{id}/signals/narrative_plan.json` | NARRATIVE_BEAT |
| EDIT_PLAN | edit-planner | Narrative plan JSON from GCS | Claude: generate specific edit decisions (cut/trim/speedup/slowdown/zoom/pan/transition/overlay) | `projects/{id}/signals/edit_plan.json` | EDIT_DECISION |
| TIMELINE_BUILD | timeline-builder | Edit plan JSON from GCS | Assemble video + audio tracks with effects (speed, zoom, pan, transition) | `projects/{id}/timeline/timeline.json` | TIMELINE_EVENT |
| RENDER | render | Timeline JSON + source video from GCS | FFmpeg filter_complex: trim, setpts, atempo, concat | `projects/{id}/rendered_video/output.mp4` | None |

#### Signal Types and Their Payloads

| SignalType | Produced By | Key Payload Fields |
|-----------|------------|-------------------|
| SPEECH_SEGMENT | speech-transcription | text, words[{word, startMs, endMs, confidence}], speakerId, language |
| SCENE_CHANGE | video-sample, video-understanding | frameIndex, changeScore, description, beforeFrameGcs, afterFrameGcs |
| UI_TRANSITION | ui-change-detector | fromState, toState, transitionType (navigation/modal/scroll/tab/other), affectedRegion, diffScore |
| CURSOR_MOVEMENT | cursor-processor | positions[{x, y, timestampMs}], movementType (linear/erratic/hover/click), speed |
| TYPING_EVENT | typing-detector | detectedText, inputRegion, charactersPerSecond, isPaste |
| INTERACTION_CLUSTER | interaction-pattern | interactions[{type, timestampMs, position}], intent, clusterLabel |
| INTENT_NODE | intent-graph | intentId, parentIntentId, action, reasoning, confidence, relatedSignalIds |
| NARRATIVE_BEAT | narrative-planner | beatIndex, beatType (setup/action/result/transition/highlight), title, description, suggestedDurationMs, relatedIntentIds |
| EDIT_DECISION | edit-planner | editType (cut/trim/speedup/slowdown/zoom/pan/transition/overlay), sourceStartMs, sourceEndMs, outputStartMs, outputEndMs, parameters, reasoning |
| TIMELINE_EVENT | timeline-builder | trackIndex, trackType (video/audio/overlay/text), clipId, startMs, endMs, sourceAssetId, effects |

---

## 7. GCS Path Contract Reference

**CRITICAL:** Mismatched GCS paths between writers and readers were the source of 5 critical bugs during development. Every path listed below is verified end-to-end.

**Bucket:** `flowstudio-assets` (configured via `GCS_BUCKET` env var)
**Base prefix:** `projects/{projectId}/`

| Writer | GCS Path Pattern | Reader(s) | Purpose |
|--------|-----------------|-----------|---------|
| Cloud Function (upload) | `projects/{projectId}/source_video/{filename}` | audio-extract, video-sample, render | Source video file (e.g., `video.mp4`) |
| audio-extract | `projects/{projectId}/audio_track/audio.wav` | speech-transcription | Extracted mono 16kHz WAV audio |
| video-sample | `projects/{projectId}/frame_sample/frame-NNNN.jpg` | video-understanding, ui-change-detector | Sampled frames (0-padded 4-digit index: `frame-0000.jpg`, `frame-0001.jpg`, ...) |
| speech-transcription | `projects/{projectId}/transcript/transcript.json` | (archive) | Full Deepgram transcription result |
| speech-transcription | `projects/{projectId}/signals/speech_segments.json` | intent-graph | Speech segment signals (JSON array) |
| video-understanding | `projects/{projectId}/signals/scene_descriptions.json` | intent-graph | Scene description signals from Gemini (JSON array) |
| ui-change-detector | `projects/{projectId}/signals/ui_transitions.json` | intent-graph | UI transition signals (JSON array) |
| cursor-processor | `projects/{projectId}/signals/cursor_movements.json` | interaction-pattern | Cursor movement signals (JSON array) |
| typing-detector | `projects/{projectId}/signals/typing_events.json` | interaction-pattern | Typing event signals (JSON array) |
| interaction-pattern | `projects/{projectId}/signals/interaction_clusters.json` | intent-graph | Interaction cluster signals (JSON array) |
| intent-graph | `projects/{projectId}/signals/intent_graph.json` | narrative-planner | Intent graph signals (JSON array) |
| narrative-planner | `projects/{projectId}/signals/narrative_plan.json` | edit-planner | Narrative beat signals (JSON array) |
| edit-planner | `projects/{projectId}/signals/edit_plan.json` | timeline-builder | Edit decision signals (JSON array) |
| timeline-builder | `projects/{projectId}/timeline/timeline.json` | render | Timeline with videoTrack and audioTrack arrays |
| render | `projects/{projectId}/rendered_video/output.mp4` | (download by user) | Final rendered video |

**Input data paths (not yet implemented -- workers gracefully handle missing data):**

| Expected Writer | GCS Path Pattern | Reader | Purpose |
|----------------|-----------------|--------|---------|
| (future: browser capture) | `projects/{projectId}/cursor_data/{assetId}` | cursor-processor | Raw cursor event JSON |
| (future: browser capture) | `projects/{projectId}/keyboard_data/{assetId}` | typing-detector | Raw keyboard event JSON |

**Important notes:**
- Frame filenames use zero-padded 4-digit indices: `frame-0000.jpg`, `frame-0001.jpg`, etc.
- video-understanding reads frames using the asset ID from `inputAssetIds` (e.g., `frame-0000`), appending `.jpg` to form: `projects/{projectId}/frame_sample/{assetId}.jpg`
- ui-change-detector reads frames by reconstructing the path from the frame index: `projects/{projectId}/frame_sample/frame-{i.padStart(4, '0')}.jpg`
- All signal files are JSON arrays of signal objects, NOT individual signal objects
- The `inputAssetIds` field on tasks contains full GCS paths (e.g., `gs://flowstudio-assets/projects/{id}/source_video/video.mp4`), not just filenames

---

## 8. Infrastructure

### Terraform Resources

**File:** `infra/terraform/`
**State Backend:** GCS bucket `flowstudio-terraform-state`
**Provider:** `hashicorp/google ~> 6.0`

| Resource | Terraform File | Description |
|----------|---------------|-------------|
| VPC Network | `network.tf` | `flowstudio-vpc`, no auto-subnets |
| Subnet | `network.tf` | `flowstudio-subnet`, CIDR `10.128.0.0/20`, us-east4 |
| VPC Connector | `network.tf` | `flowstudio-vpc`, CIDR `10.8.0.0/28` -- allows Cloud Run to reach GCE VM |
| Firewall (internal) | `network.tf` | Allow TCP 0-65535 from `10.128.0.0/20` + `10.8.0.0/28` to `stdb` tag |
| Firewall (web) | `network.tf` | Allow TCP 80, 443 from `0.0.0.0/0` to `stdb` tag |
| Firewall (SSH) | `network.tf` | Allow TCP 22 from `35.235.240.0/20` (IAP only) to `stdb` tag |
| Static IP | `network.tf` | `flowstudio-stdb-ip` for the GCE VM |
| GCE VM | `stdb-vm.tf` | `flowstudio-stdb`, e2-standard-4, Debian 12, Docker + SpacetimeDB v2.0.1 + Nginx + Certbot |
| Persistent SSD | `stdb-vm.tf` | `flowstudio-stdb-data`, 50GB pd-ssd for SpacetimeDB WAL + snapshots |
| GCE Service Account | `stdb-vm.tf` | `flowstudio-stdb` with cloud-platform scope |
| GCS Bucket (assets) | `storage.tf` | `flowstudio-assets`, lifecycle rule (90d -> Nearline), CORS for app + localhost |
| GCS Bucket (state) | `storage.tf` | `flowstudio-terraform-state` with versioning |
| Artifact Registry | `storage.tf` | `flowstudio` Docker repository |
| Cloud Run (client) | `cloud-run.tf` | `flowstudio-client`, port 3000, 1 CPU / 512Mi, 0-3 instances, public access |
| Cloud Run (workers) | `cloud-run.tf` | `flowstudio-{worker}` x 13, port 8080, 1-2 CPU / 1-2Gi, 0-5 instances, VPC connector |
| Worker Service Account | `cloud-run.tf` | `flowstudio-worker` with GCS objectAdmin |
| Secret Manager | `secrets.tf` | 3 secrets: deepgram-api-key, google-ai-api-key, anthropic-api-key |
| Secret IAM | `secrets.tf` | Worker SA gets secretAccessor on all 3 secrets |

**Heavy workers** (render, video-understanding, intent-graph) get 2 CPU / 2Gi. All others get 1 CPU / 1Gi.

**API key injection** is done via Secret Manager references in Cloud Run env vars:
- `speech-transcription` gets `DEEPGRAM_API_KEY`
- `video-understanding` gets `GOOGLE_AI_API_KEY`
- `intent-graph`, `narrative-planner`, `edit-planner` get `ANTHROPIC_API_KEY`

### Docker Build Process

**Worker Dockerfile:** `infra/docker/Dockerfile.worker`
- Multi-stage: build stage installs pnpm, copies shared + worker-shared + specific worker, builds all three
- Production stage copies only `dist/` and `package.json` for each package
- FFmpeg installed conditionally via `NEEDS_FFMPEG` build arg (for audio-extract, video-sample, render)
- Entrypoint: `node packages/workers/$WORKER_NAME/dist/entrypoint.js`
- Exposes port 8080

**Client Dockerfile:** `infra/docker/Dockerfile.client`
- Multi-stage: build stage installs pnpm, copies shared + client, builds both
- `NEXT_PUBLIC_*` env vars must be passed as build args (baked into the Next.js bundle at build time)
- Production stage runs `next start` on port 3000

### Cloud Function

**File:** `infra/cloud-function/generate-upload-url/index.js`
**Runtime:** Node.js with `@google-cloud/storage` 7.16.0
**Endpoint:** `POST /generate-upload-url`
**Request body:** `{ projectId, filename, contentType }`
**Response:** `{ url, gcsPath }`

Security:
- Rejects path traversal (`..` or `/` in projectId or filename)
- Validates content type starts with `video/`
- CORS headers allow `*` (needs hardening for production)

### Deployment Scripts

| Script | Usage | Description |
|--------|-------|-------------|
| `infra/scripts/build-and-push.sh` | `./build-and-push.sh <service> <version>` | Build Docker image + push to Artifact Registry. Detects FFmpeg need. Handles client vs worker Dockerfiles. |
| `infra/scripts/deploy-worker.sh` | `./deploy-worker.sh <service> <version>` | Deploy a single Cloud Run service from Artifact Registry. |
| `infra/scripts/deploy-all.sh` | `./deploy-all.sh <version>` | Build + push + deploy all 13 workers + client. |
| `infra/scripts/deploy-stdb.sh` | `./deploy-stdb.sh [module-path]` | SCP the stdb-module to the GCE VM, then run `spacetime publish` on the VM. |
| `infra/scripts/setup-secrets.sh` | `./setup-secrets.sh` | Interactively prompt for API keys and store in GCP Secret Manager. |

### Secret Management

API keys are stored in GCP Secret Manager. The `setup-secrets.sh` script prompts for each key and stores it. Cloud Run worker services reference secrets directly via `value_source.secret_key_ref` in Terraform, so secrets are injected as env vars at runtime without touching the Docker image.

---

## 9. Development Workflow

### Local Development Setup

```bash
# 1. Clone and install
git clone https://github.com/Dawgsrlife/FlowStudio.git
cd FlowStudio
corepack enable && corepack prepare pnpm@9 --activate
pnpm install

# 2. Copy and fill environment
cp .env.example .env
# Edit .env with your values (see Section 10)

# 3. Build shared packages (required before anything else)
pnpm --filter @flowstudio/shared run build
pnpm --filter @flowstudio/worker-shared run build

# 4. Run the client
pnpm --filter @flowstudio/frontend run dev
```

### Typecheck the Entire Monorepo

```bash
pnpm -r exec tsc --noEmit
```

This is the CI gate. It runs on every push/PR to `main`. Zero errors required.

### Build Shared Packages

After modifying `packages/shared/` or `packages/workers/shared/`:

```bash
pnpm --filter @flowstudio/shared run build
pnpm --filter @flowstudio/worker-shared run build
```

### Run the Client Locally

```bash
pnpm --filter @flowstudio/frontend run dev
```

Requires `NEXT_PUBLIC_STDB_HOST` and `NEXT_PUBLIC_STDB_MODULE` to be set. For local development, point to a local SpacetimeDB instance at `http://localhost:3000`.

### Build and Deploy a Single Worker

```bash
# Authenticate Docker with Artifact Registry
gcloud auth print-access-token | docker login -u oauth2accesstoken --password-stdin us-east4-docker.pkg.dev

# Build and push
./infra/scripts/build-and-push.sh audio-extract v2

# Deploy to Cloud Run
./infra/scripts/deploy-worker.sh audio-extract v2
```

### Deploy Everything

```bash
gcloud auth print-access-token | docker login -u oauth2accesstoken --password-stdin us-east4-docker.pkg.dev
./infra/scripts/deploy-all.sh v1
```

### Deploy SpacetimeDB Module

```bash
./infra/scripts/deploy-stdb.sh
```

This SCPs the module source to the GCE VM and runs `spacetime publish flowstudio --host http://localhost:3000` on the VM. The `spacetime` CLI must be installed on the VM (not the dev machine).

### Validate Terraform

```bash
cd infra/terraform && terraform validate
```

### Add a New Worker to the Pipeline

Follow the step-by-step guide in [Section 6b: How to Create a New Worker](#how-to-create-a-new-worker-step-by-step).

---

## 10. Configuration Reference

### All Environment Variables

| Variable | Used By | Required | Default | Description |
|----------|---------|----------|---------|-------------|
| **SpacetimeDB** | | | | |
| `STDB_HOST` | (reference only) | -- | `stdb.flowstudio.ai` | Public SpacetimeDB hostname |
| `STDB_MODULE` | Workers, Client | No | `flowstudio` | SpacetimeDB module name |
| `STDB_INTERNAL_HOST` | Workers | Yes (workers) | `10.128.0.100` | SpacetimeDB host via VPC (internal IP) |
| `STDB_INTERNAL_PORT` | Workers | No | `3000` | SpacetimeDB port |
| **GCP** | | | | |
| `GCP_PROJECT_ID` | Workers, Scripts | Yes | `lyrical-epigram-484715-v6` | GCP project ID |
| `GCP_REGION` | Scripts | No | `us-east4` | GCP region |
| `GCS_BUCKET` | Workers, Cloud Function | Yes | `flowstudio-assets` | GCS bucket name for project assets |
| `ARTIFACT_REGISTRY` | Scripts | No | (derived from project + region) | Docker registry URL |
| **API Keys** | | | | |
| `DEEPGRAM_API_KEY` | speech-transcription | Yes (that worker) | -- | Deepgram API key for Nova-2 transcription |
| `GOOGLE_AI_API_KEY` | video-understanding | Yes (that worker) | -- | Google AI API key for Gemini |
| `ANTHROPIC_API_KEY` | intent-graph, narrative-planner, edit-planner | Yes (those workers) | -- | Anthropic API key for Claude |
| **Worker Config** | | | | |
| `WORKER_NAME` | Workers | Yes | -- | Worker type identifier (e.g., `audio-extract`) |
| `WORKER_ID` | Workers | No | `{WORKER_NAME}-{timestamp}` | Unique instance ID |
| `WORKER_CONCURRENCY` | Workers | No | `2` | Max concurrent tasks |
| `WORKER_POLL_INTERVAL_MS` | Workers | No | `1000` | Poll interval in ms |
| `HEALTH_PORT` | Workers | No | `8080` | Health check HTTP server port |
| `ANTHROPIC_MODEL` | LLM Workers | No | `claude-sonnet-4-20250514` | Claude model ID override |
| `GOOGLE_AI_MODEL` | video-understanding | No | `gemini-1.5-flash` | Gemini model ID override |
| **Client** | | | | |
| `NEXT_PUBLIC_STDB_HOST` | Client | Yes | `https://stdb.flowstudio.ai` | HTTP URL for SpacetimeDB (baked at build time; converted to HTTP base URL internally) |
| `NEXT_PUBLIC_STDB_MODULE` | Client | No | `flowstudio` | SpacetimeDB module name (baked at build time) |
| `NEXT_PUBLIC_UPLOAD_FUNCTION_URL` | Client | Yes | -- | Cloud Function URL for upload URL generation (baked at build time) |
| **Infrastructure** | | | | |
| `STDB_VM_NAME` | deploy-stdb.sh | No | `flowstudio-stdb` | GCE VM name |
| `STDB_VM_ZONE` | deploy-stdb.sh | No | `us-east4-c` | GCE VM zone |
| `STDB_DOMAIN` | Terraform | No | `stdb.flowstudio.ai` | Domain for SpacetimeDB TLS |
| `STDB_CERTBOT_EMAIL` | Terraform | No | `admin@flowstudio.ai` | Email for Let's Encrypt |
| `VPC_CONNECTOR_NAME` | (reference only) | -- | `flowstudio-vpc` | VPC connector name |

**IMPORTANT:** `NEXT_PUBLIC_*` variables are baked into the Next.js bundle at Docker build time. They must be passed as `--build-arg` values to `docker build`, not set at runtime. The `build-and-push.sh` script and `Dockerfile.client` handle this.

---

## 11. Troubleshooting

### Common Issues

| Problem | Cause | Solution |
|---------|-------|---------|
| Client shows "Disconnected" | SpacetimeDB is not running or unreachable | Check GCE VM status: `gcloud compute instances describe flowstudio-stdb --zone=us-east4-c`. Verify Nginx is running. Check `NEXT_PUBLIC_STDB_HOST` points to correct URL. |
| Client shows "Connection timeout" | HTTP probe fails to reach SpacetimeDB | Verify DNS for `stdb.flowstudio.ai` resolves to the correct IP. Check TLS cert is valid. Check VPC connector if running locally. |
| Upload fails with "Failed to get upload URL" | Cloud Function unreachable or `NEXT_PUBLIC_UPLOAD_FUNCTION_URL` not set | Verify the Cloud Function is deployed. Check the env var was set at build time (not runtime). |
| Worker logs "Missing required env var" | Environment not configured | Check Cloud Run service env vars in Terraform. Verify Secret Manager secrets have versions. |
| Worker logs "HTTP connection failed" | Worker cannot reach SpacetimeDB | Verify VPC connector is created. Check `STDB_INTERNAL_HOST` matches the GCE VM's internal IP (from `terraform output stdb_internal_ip`). |
| Task stuck in "claimed" status | Worker crashed mid-task | Watchdog runs every 30s. Tasks claimed > 5 minutes are automatically reset to pending (up to 3 retries). Wait for watchdog cycle. |
| Task stuck in "pending" | No worker of that type is running | Check Cloud Run service is deployed and has instances scaled up. Check `gcloud run services describe flowstudio-{worker} --region=us-east4`. |
| Pipeline stops after initial 4 tasks | Downstream tasks not created | Verify task chaining: all dependencies must complete. Check if cursor-processor or typing-detector failed (they handle missing data gracefully, but check). Inspect `project_state.completedTasks` in SpacetimeDB. |
| LLM worker produces empty signals | JSON parsing failed on LLM response | Check worker logs for "Failed to parse" warnings. The `extractJsonArray()` function uses bracket-depth counting. If the LLM response format changed, the parser may need updating. |
| `pnpm -r exec tsc --noEmit` fails | Type errors | Fix errors before deploying. This is the CI gate. Common causes: missing `@types/*` packages, stale `dist/` from shared packages (rebuild shared first). |
| Docker build fails with NEXT_PUBLIC errors | `NEXT_PUBLIC_*` vars not passed as build args | Use `build-and-push.sh` which passes them automatically. If building manually, add `--build-arg NEXT_PUBLIC_UPLOAD_FUNCTION_URL=...`. |

### How to Debug a Stuck Pipeline

1. **Check task states in SpacetimeDB.** Query the `tasks` table for the project via the SQL endpoint or the `spacetime sql` CLI. Look for tasks in `failed` or `stale` status.

2. **Check worker logs.** View Cloud Run logs:
   ```bash
   gcloud run services logs read flowstudio-{worker-name} --region=us-east4 --limit=50
   ```

3. **Check if GCS artifacts exist.** The pipeline passes data between workers via GCS. If an upstream worker completed but the downstream one fails:
   ```bash
   gsutil ls gs://flowstudio-assets/projects/{projectId}/signals/
   gsutil ls gs://flowstudio-assets/projects/{projectId}/frame_sample/
   ```

4. **Check for GCS path mismatches.** Compare the path the writer used (from worker logs) with the path the reader expects (from the worker source code). See [Section 7](#7-gcs-path-contract-reference) for the authoritative path table.

5. **Check task chaining logic.** If tasks are not being created after upstream completion, verify that ALL dependencies are met. The `completeTask` reducer only creates a downstream task when every entry in `TASK_DEPENDENCIES[downstreamType]` has a completed task in the project.

### How to Check Worker Health

```bash
# Cloud Run service status
gcloud run services describe flowstudio-audio-extract --region=us-east4 --format='value(status.conditions)'

# Worker health endpoint (from within the VPC or via port-forward)
curl http://{worker-internal-ip}:8080/health
```

### How to Inspect SpacetimeDB State

The client application already shows project and task state (via HTTP polling). For direct inspection, use the SpacetimeDB CLI on the GCE VM:

```bash
gcloud compute ssh flowstudio-stdb --zone=us-east4-c
spacetime sql flowstudio --host http://localhost:3000 "SELECT * FROM tasks WHERE projectId = '{id}'"
```

---

## 12. Known Limitations and Future Work

### Authentication (Critical for Production)

- **SpacetimeDB reducers have no authentication.** Any client can call any reducer. Before public launch, add an auth layer (token validation in reducers, or a gateway proxy).
- **Cloud Function has no authentication.** The `generate-upload-url` endpoint is open. Add Firebase Auth or API key validation.
- **CORS wildcard in Cloud Function.** The `Access-Control-Allow-Origin: *` header should be restricted to the production frontend domain.

### Cursor and Keyboard Data Capture

The pipeline expects cursor and keyboard event data as separate JSON files uploaded to GCS. Currently, only video upload is implemented in the frontend. The `cursor-processor` and `typing-detector` workers gracefully handle missing data (return empty signals, pipeline continues through audio/video branches). To enable full interaction analysis:

1. Build a browser extension or screen recording tool that captures cursor and keyboard events
2. Upload the event JSON to GCS at the expected paths (see [Section 7](#7-gcs-path-contract-reference))
3. Pass the asset IDs when creating CURSOR_PROCESS and TYPING_DETECT tasks

### Code Duplication

The `extractJsonArray()` function is duplicated in 4 worker files (video-understanding, intent-graph, narrative-planner, edit-planner). Consider extracting to `@flowstudio/worker-shared` or a shared utility module.

### Hardcoded Assumptions

- **2-second frame interval** is hardcoded in `video-sample` (`SAMPLE_INTERVAL_SECS = 2`) and assumed by `video-understanding` and `ui-change-detector` when computing timestamps (`i * 2000`). Changing the sample interval requires updating all three workers.
- **Frame naming convention** (`frame-NNNN.jpg`) must match exactly between video-sample (writer) and video-understanding / ui-change-detector (readers).

### SpacetimeDB Considerations

- **ScheduleAt behavior.** The `__init__` reducer uses `ScheduleAt.interval()` which matches the SDK API, but actual behavior depends on the SpacetimeDB v2.0.1 runtime. Test on the GCE VM after module publish.
- **WASM module constants.** The `stdb-module/src/index.ts` file inlines constants from `@flowstudio/shared` because WASM modules cannot import workspace packages at runtime. Any change to task chaining DAG, retry limits, or stale thresholds must be mirrored in both files.

### Operational

- **No monitoring or alerting.** Add Cloud Monitoring alerts for worker failures, task queue depth, and GCE VM health.
- **No log aggregation.** Workers produce structured JSON logs to stdout/stderr. Configure Cloud Logging sinks for analysis.
- **GCS lifecycle.** The asset bucket has a 90-day lifecycle rule (move to Nearline). For long-term storage, consider additional policies.

### GitHub Actions CI/CD

Two GitHub repo secrets must be configured before the deploy workflows function:
- `WIF_PROVIDER` -- Workload Identity Federation provider resource name
- `WIF_SA` -- Service account email for CI/CD

The CI workflow (`ci.yml`) runs `pnpm -r exec tsc --noEmit` on every push/PR to `main`.
The deploy workflow (`deploy.yml`) is manual (workflow_dispatch) with inputs for version and services.
The SpacetimeDB deploy workflow (`deploy-stdb.yml`) is manual.
