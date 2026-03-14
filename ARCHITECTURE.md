# FlowStudio Architecture

Exhaustive internal architecture reference for the FlowStudio AI-powered video editing
platform. This document covers every design decision, data flow, edge case, and pattern
a developer must understand to safely modify the codebase.

**Codebase:** `/home/user/FlowStudio`
**Stats:** ~8,700 lines, 17 packages, 13 workers, 7 SpacetimeDB tables, 11 reducers

---

## 1. System Overview

### 1a. Component Diagram

```
                   +-------------------------------------------------+
                   |                  BROWSER                        |
                   |                                                 |
                   |   Next.js Client (port 3000)                    |
                   |   - HTTP polling (3s) for table reads           |
                   |   - HTTP calls for reducer invocations          |
                   |   - Direct GCS upload via signed URL            |
                   +---------+---+----------+------------------------+
                             |   |          |
                    HTTP poll|   |HTTP      |HTTP PUT (signed URL)
                             |   |          |
               +-------------+   |     +----v-----------+
               |                 |     | Cloud Function  |
               |                 |     | generate-upload |
               |                 |     | -url            |
               |                 |     +-------+---------+
               |                 |             |
               |                 |             | Signed URL
               |                 |             |
     +---------v---------+      |     +--------v--------+
     |  SpacetimeDB v2   |      |     |      GCS        |
     |  (GCE VM + Nginx) |      |     |   Bucket        |
     |                   |<-----+     | flowstudio-     |
     |  - 7 tables       |           | assets           |
     |  - 11 reducers    |           +---------^--------+
     |  - Watchdog timer  |                    |
     +---^-----^-----^---+                    |
         |     |     |                        |
       HTTP    |   HTTP             GCS upload/download
         |     |     |                        |
   +-----+  +-+--+  +------+          +------+------+
   |W1   |  |W2  |  |W13   |          |             |
   |audio|  |vid |  |render |          |  All 13     |
   |ext  |  |samp|  |      |          |  Workers    |
   +-----+  +----+  +------+          +-------------+
        Cloud Run services (private, VPC connector)
```

### 1b. Running Processes in Production

| Process | Runtime | Port | Access | Purpose |
|---------|---------|------|--------|---------|
| Next.js Client | Cloud Run | 3000 | Public | Dashboard + project UI |
| SpacetimeDB v2.0.1 | GCE VM (Docker) | 3000 (proxied via Nginx 80/443) | Public (HTTP) | Tables, reducers, task orchestration |
| Nginx | GCE VM | 80, 443 | Public | TLS termination, HTTP proxy, blocks `/v1/publish` |
| audio-extract worker | Cloud Run | 8080 | Private (VPC) | FFmpeg audio extraction |
| video-sample worker | Cloud Run | 8080 | Private (VPC) | FFmpeg frame sampling |
| cursor-processor worker | Cloud Run | 8080 | Private (VPC) | Cursor event analysis |
| typing-detector worker | Cloud Run | 8080 | Private (VPC) | Keyboard burst detection |
| speech-transcription worker | Cloud Run | 8080 | Private (VPC) | Deepgram transcription |
| video-understanding worker | Cloud Run | 8080 | Private (VPC) | Gemini frame analysis |
| ui-change-detector worker | Cloud Run | 8080 | Private (VPC) | Frame diff for UI transitions |
| interaction-pattern worker | Cloud Run | 8080 | Private (VPC) | Clusters cursor+typing signals |
| intent-graph worker | Cloud Run | 8080 | Private (VPC) | Claude intent hierarchy |
| narrative-planner worker | Cloud Run | 8080 | Private (VPC) | Claude narrative beats |
| edit-planner worker | Cloud Run | 8080 | Private (VPC) | Claude edit decisions |
| timeline-builder worker | Cloud Run | 8080 | Private (VPC) | Timeline JSON construction |
| render worker | Cloud Run | 8080 | Private (VPC) | FFmpeg final render |
| Cloud Function (generate-upload-url) | Cloud Functions | -- | Public | Signed GCS upload URLs |

### 1c. Communication Patterns

- **HTTP polling** -- Client and all 13 workers use HTTP polling against SpacetimeDB's
  REST API instead of WebSocket subscriptions. The client polls every **3 seconds** via
  `stdbSdkSync.ts`; workers poll every **1 second** via `base-worker.ts` `pollLoop`.
  Table reads use `POST /v1/database/{module}/sql` with `SELECT * FROM {tableName}`.
  After any reducer call, `forceSync()` triggers an immediate re-poll for UI
  responsiveness, providing near-real-time UX despite not using WebSocket push.

  **Why HTTP polling instead of WebSocket subscriptions:** SpacetimeDB's SDK WebSocket
  protocol requires BSATN binary serialization format, which is not available in the
  current JavaScript SDK. HTTP polling serves as a bridge until the SDK matures and
  `spacetime generate` produces typed bindings with push subscription support.

- **HTTP POST** -- Reducer calls (e.g., `createProject`, `completeTask`) are made via
  HTTP POST to `{stdbHost}/v1/database/{module}/call/{reducerName}`. Both the client and
  workers use this mechanism.

- **GCS** -- All binary data (video, audio, frames, rendered output) and inter-worker
  signal JSON files are stored in GCS. Workers download inputs from GCS, process them,
  and upload outputs to GCS. The client uploads source video directly to GCS via a signed
  URL from the Cloud Function.

---

## 2. SpacetimeDB Module -- Complete Reference

**Source:** `/home/user/FlowStudio/packages/stdb-module/src/index.ts` (782 lines)

The WASM module is entirely self-contained. It cannot import from other workspace packages
at runtime, so all constants (`MAX_TASK_RETRIES`, `STALE_TASK_THRESHOLD_MS`,
`WATCHDOG_INTERVAL_SECS`, `TASK_CHAIN_DAG`, `TASK_DEPENDENCIES`) are duplicated inline.
Corresponding copies exist in `@flowstudio/shared` for use by workers and client.

### 2a. Tables

#### `projects`

| Field | Type | Notes |
|-------|------|-------|
| `id` | `string` | **Primary key**. Generated via `generateId()`. |
| `name` | `string` | User-provided project name. |
| `status` | `string` | One of: `created`, `uploading`, `processing`, `ready`, `failed`. |
| `createdAt` | `u64` | Unix ms timestamp. |
| `updatedAt` | `u64` | Unix ms timestamp. |
| `ownerId` | `string` | Currently hardcoded to `'anonymous'` (no auth). |
| `metadata` | `string` | JSON string, currently `'{}'`. |

- **Purpose:** Top-level entity representing a video editing project.
- **Written by:** `createProject` (insert), `completeTask` (update status to `ready`),
  `updateProjectState` (update status).
- **Read by:** `createAsset` (existence check), `createTask` (existence check),
  `completeTask` (update on final stage), `updateProjectState`.
- **Relationships:** One-to-many with `assets`, `tasks`, `signals`. One-to-one with
  `project_state`.
- **Public:** Yes (polled by client via HTTP SQL).

#### `assets`

| Field | Type | Notes |
|-------|------|-------|
| `id` | `string` | **Primary key**. Generated via `generateId()`. |
| `projectId` | `string` | FK to `projects.id`. |
| `assetType` | `string` | One of: `source_video`, `audio_track`, `frame_sample`, `thumbnail`, `rendered_video`, `transcript`. |
| `gcsPath` | `string` | Full GCS path (e.g., `gs://bucket/projects/{id}/source_video/file.mp4`). |
| `sizeBytes` | `u64` | File size. |
| `mimeType` | `string` | MIME type (e.g., `video/mp4`). |
| `durationMs` | `u64` | Duration for temporal assets; 0 otherwise. |
| `createdAt` | `u64` | Unix ms timestamp. |
| `metadata` | `string` | JSON string (e.g., `{"originalName":"video.mp4"}`). |

- **Purpose:** Registry of all files associated with a project.
- **Written by:** `createAsset` (insert from client after upload).
- **Read by:** Not directly read by reducers -- used for reference/audit.
- **Relationships:** Belongs to `projects` via `projectId`.
- **Public:** Yes.

#### `tasks`

| Field | Type | Notes |
|-------|------|-------|
| `id` | `string` | **Primary key**. Generated via `generateId()`. |
| `projectId` | `string` | FK to `projects.id`. |
| `taskType` | `string` | One of 13 `TaskType` enum values. |
| `status` | `string` | One of: `pending`, `claimed`, `completed`, `failed`, `stale`. |
| `workerId` | `string` | ID of claiming worker; empty if unclaimed. |
| `inputAssetIds` | `string` | JSON array string of input asset IDs or GCS paths. |
| `outputAssetIds` | `string` | JSON array string of output asset IDs; `'[]'` until completion. |
| `config` | `string` | JSON string of task-specific configuration; `'{}'` by default. |
| `createdAt` | `u64` | Unix ms timestamp. |
| `claimedAt` | `u64` | Unix ms when claimed; 0 if unclaimed. |
| `completedAt` | `u64` | Unix ms when completed/failed; 0 if still active. |
| `failureReason` | `string` | Error message; empty if no failure. |
| `retryCount` | `i32` | Current retry number (0-based). |
| `maxRetries` | `i32` | Maximum retries allowed (default 3). |

- **Purpose:** Core orchestration table. Each row represents one unit of work in the
  pipeline.
- **Written by:** `createTask` (insert from client), `claimTask` (update status),
  `findAndClaimTask` (update status), `completeTask` (update status + task chaining
  inserts), `failTask` (update status + retry insert), `watchdog_schedule` (requeue or
  fail stale tasks).
- **Read by:** `claimTask`, `findAndClaimTask` (find pending), `completeTask` (scan for
  completed deps, check existing tasks), `failTask` (read retry info),
  `watchdog_schedule` (scan for stale).
- **Relationships:** Belongs to `projects`. Associated with `signals` via `taskId`.
- **Public:** Yes (polled by client and workers via HTTP SQL).

#### `signals`

| Field | Type | Notes |
|-------|------|-------|
| `id` | `string` | **Primary key**. Generated via `generateId()`. |
| `projectId` | `string` | FK to `projects.id`. |
| `taskId` | `string` | FK to `tasks.id`. |
| `signalType` | `string` | One of 10 `SignalType` enum values. |
| `timestampMs` | `u64` | Position in source video (ms). |
| `durationMs` | `u64` | Duration of the signal (ms). |
| `confidence` | `f64` | Confidence score 0.0-1.0. |
| `payload` | `string` | JSON string with signal-specific data. |
| `createdAt` | `u64` | Unix ms timestamp. |

- **Purpose:** Structured analysis results produced by workers. Stored both in
  SpacetimeDB (for the client) and as JSON files in GCS (for downstream workers).
- **Written by:** `writeSignal` (insert, called by `BaseWorker.handleClaimedTask`),
  `ingestInteractionBatch` (batch insert for cursor/typing data).
- **Read by:** Not directly read by other reducers. Client can poll for display.
- **Relationships:** Belongs to `projects` and `tasks`.
- **Public:** Yes.

#### `project_state`

| Field | Type | Notes |
|-------|------|-------|
| `projectId` | `string` | **Primary key**. FK to `projects.id`. |
| `completedTasks` | `string` | JSON array of completed `TaskType` strings. |
| `totalTasks` | `i32` | Total task count (not actively updated by chaining). |
| `completedCount` | `i32` | Count of completed task types. |
| `currentPhase` | `string` | Current pipeline phase (e.g., `created`, `processing`, `ready`, `failed`). |
| `lastUpdated` | `u64` | Unix ms timestamp. |

- **Purpose:** Aggregate progress tracking for each project.
- **Written by:** `createProject` (insert), `completeTask` (update completedTasks,
  completedCount, and set `ready` on final stage), `failTask` (set `failed` when max
  retries exhausted), `updateProjectState` (direct update from client).
- **Read by:** `completeTask`, `failTask`, `updateProjectState`.
- **Relationships:** One-to-one with `projects`.
- **Public:** Yes.

#### `worker_configs`

| Field | Type | Notes |
|-------|------|-------|
| `workerId` | `string` | **Primary key**. Worker instance ID. |
| `workerType` | `string` | `TaskType` this worker handles. |
| `lastHeartbeat` | `u64` | Unix ms timestamp of last heartbeat. |
| `isActive` | `bool` | Whether the worker is active. |
| `concurrency` | `i32` | Max concurrent tasks for this worker. |
| `metadata` | `string` | JSON string, currently `'{}'`. |

- **Purpose:** Worker registration and heartbeat tracking.
- **Written by:** `updateWorkerConfig` (upsert, called by `BaseWorker.registerWorker`).
- **Read by:** Not directly queried by other reducers. Available for monitoring.
- **Relationships:** None (standalone).
- **Public:** Yes.

#### `watchdog_schedule`

| Field | Type | Notes |
|-------|------|-------|
| `scheduledId` | `u64` | **Primary key**. Auto-incrementing. |
| `scheduledAt` | `ScheduleAt` | Schedule interval (every 30 seconds). |

- **Purpose:** Internal SpacetimeDB scheduled table that triggers the `watchdog_schedule`
  reducer at a fixed interval.
- **Written by:** `__init__` (insert on module initialization).
- **Read by:** SpacetimeDB runtime (triggers `watchdog_schedule` reducer).
- **Relationships:** None.
- **Public:** No (internal).

### 2b. Reducers

#### `createProject`

- **Parameters:** `name: string`, `ownerId: string`, `metadata: string`
- **Preconditions:** None.
- **Behavior:**
  1. Generates a unique ID.
  2. Inserts a new row into `projects` with status `'created'`.
  3. Inserts a corresponding row into `project_state` with empty `completedTasks`,
     counts at 0, phase `'created'`.
- **Side effects:** Creates `project_state` row.
- **Error conditions:** None (all inputs accepted).
- **Called by:** Client (`CreateProjectDialog`).

#### `createAsset`

- **Parameters:** `projectId: string`, `assetType: string`, `gcsPath: string`,
  `sizeBytes: u64`, `mimeType: string`, `durationMs: u64`, `metadata: string`
- **Preconditions:** Project with `projectId` must exist.
- **Behavior:**
  1. Validates project existence via `findByPrimaryKey`.
  2. Generates a unique ID.
  3. Inserts a new row into `assets`.
- **Side effects:** None.
- **Error conditions:** Throws if project not found.
- **Called by:** Client (upload flow in `project/[id]/page.tsx`).

#### `ingestInteractionBatch`

- **Parameters:** `projectId: string`, `taskId: string`, `signalType: string`,
  `batchJson: string`
- **Preconditions:** `batchJson` must be valid JSON array with max 1000 items.
- **Behavior:**
  1. Parses `batchJson` as array.
  2. Validates batch size <= 1000.
  3. For each item, inserts a row into `signals`.
- **Side effects:** Multiple `signals` rows inserted.
- **Error conditions:** Throws if JSON parse fails. Throws if batch > 1000.
- **Called by:** Workers (cursor/typing data ingestion -- currently unused, as cursor/typing
  data passes through GCS instead).

#### `createTask`

- **Parameters:** `projectId: string`, `taskType: string`, `inputAssetIds: string`,
  `config: string`, `maxRetries: i32`
- **Preconditions:** Project with `projectId` must exist.
- **Behavior:**
  1. Validates project existence via `findByPrimaryKey`.
  2. Generates a unique ID.
  3. Inserts a new row into `tasks` with status `'pending'`, retryCount 0.
- **Side effects:** None.
- **Error conditions:** Throws if project not found.
- **Called by:** Client (upload flow creates initial tasks), `completeTask` (task chaining
  creates downstream tasks).

#### `claimTask`

- **Parameters:** `taskId: string`, `workerId: string`
- **Preconditions:** Task must exist and be in `'pending'` status.
- **Behavior:**
  1. Looks up task by primary key.
  2. Validates status is `'pending'`.
  3. Updates status to `'claimed'`, sets `workerId` and `claimedAt`.
- **Side effects:** None.
- **Error conditions:** Throws if task not found. Throws if task is not `'pending'`
  (race-condition safe -- only the first claimer wins).
- **Called by:** Workers (not directly -- `findAndClaimTask` is preferred).

#### `findAndClaimTask`

- **Parameters:** `taskType: string`, `workerId: string`
- **Preconditions:** At least one pending task of the given type must exist.
- **Behavior:**
  1. Iterates all tasks to find the first with matching `taskType` and status `'pending'`.
  2. Atomically updates it to `'claimed'` with the given `workerId`.
- **Side effects:** None.
- **Error conditions:** Throws if no pending task of the given type exists (normal -- the
  worker catches this and waits for next poll).
- **Called by:** Workers (`BaseWorker.pollForTasks`).

  **Atomicity note:** SpacetimeDB reducers execute serially within a module. Two workers
  calling `findAndClaimTask` simultaneously will be serialized -- only one will claim any
  given task. This is the core race-condition safety guarantee.

#### `completeTask`

- **Parameters:** `taskId: string`, `outputAssetIds: string`
- **Preconditions:** Task must exist.
- **Behavior:**
  1. Updates task status to `'completed'`, sets `outputAssetIds` and `completedAt`.
  2. Updates `project_state`: parses `completedTasks` JSON, adds this task type if not
     already present, increments `completedCount`.
  3. Looks up downstream task types from `TASK_CHAIN_DAG`.
  4. If no downstream types (i.e., `RENDER` just completed):
     - Sets `project_state.currentPhase` to `'ready'`.
     - Sets `projects.status` to `'ready'`.
     - Returns.
  5. Collects all completed task types for this project.
  6. Collects all existing task types for this project (to prevent duplicates).
  7. For each downstream type:
     a. Skips if a task of that type already exists for this project.
     b. Looks up `TASK_DEPENDENCIES[dsType]` and checks if ALL are in the completed set.
     c. If all deps met, collects `outputAssetIds` from all completed upstream tasks.
     d. Creates a new `'pending'` task with the collected upstream asset IDs as inputs.
- **Side effects:** May insert 0-N new `tasks` rows. May update `project_state` and
  `projects`.
- **Error conditions:** Throws if task not found.
- **Called by:** Workers (`BaseWorker.handleClaimedTask` after `processTask` succeeds).

#### `failTask`

- **Parameters:** `taskId: string`, `failureReason: string`
- **Preconditions:** Task must exist.
- **Behavior:**
  1. Reads `retryCount` and `maxRetries` from the task.
  2. Updates task status to `'failed'`, sets `failureReason` and `completedAt`.
  3. If `retryCount < maxRetries`: creates a NEW pending task with same `projectId`,
     `taskType`, `inputAssetIds`, `config`, and `retryCount + 1`.
  4. If `retryCount >= maxRetries`: sets `project_state.currentPhase` to `'failed'`.
- **Side effects:** May insert a retry task. May update `project_state`.
- **Error conditions:** Throws if task not found.
- **Called by:** Workers (`BaseWorker.handleClaimedTask` on `processTask` failure).

  **Important:** The failed task is always marked as failed. The retry creates a NEW row
  with a new ID and incremented `retryCount`. The original failed row remains in the table
  as a permanent record.

#### `writeSignal`

- **Parameters:** `projectId: string`, `taskId: string`, `signalType: string`,
  `timestampMs: u64`, `durationMs: u64`, `confidence: f64`, `payload: string`
- **Preconditions:** None (no existence checks).
- **Behavior:** Inserts a single row into `signals`.
- **Side effects:** None.
- **Error conditions:** None.
- **Called by:** Workers (`BaseWorker.handleClaimedTask` for each signal in `TaskResult`).

#### `updateProjectState`

- **Parameters:** `projectId: string`, `currentPhase: string`, `status: string`
- **Preconditions:** `project_state` row must exist for this project.
- **Behavior:**
  1. Updates `project_state.currentPhase` and `lastUpdated`.
  2. Updates `projects.status` and `updatedAt`.
- **Side effects:** Modifies both `project_state` and `projects`.
- **Error conditions:** Throws if no project_state row found.
- **Called by:** Client (upload flow, to transition project to `'processing'`).

#### `updateWorkerConfig`

- **Parameters:** `workerId: string`, `workerType: string`, `isActive: bool`,
  `concurrency: i32`, `metadata: string`
- **Preconditions:** None.
- **Behavior:** Upserts a `worker_configs` row -- updates if `workerId` exists, inserts
  otherwise. Always sets `lastHeartbeat` to current time.
- **Side effects:** None.
- **Error conditions:** None.
- **Called by:** Workers (`BaseWorker.registerWorker` at startup).

#### `watchdog_schedule`

- **Parameters:** None (empty args).
- **Preconditions:** Must be triggered by the SpacetimeDB scheduler.
- **Behavior:**
  1. Scans all tasks for rows where `status === 'claimed'` and `claimedAt < (now - 5min)`.
  2. For each stale task:
     - If `retryCount >= maxRetries`: marks as `'failed'` with reason
       `'Exceeded max retries after becoming stale'`.
     - Otherwise: resets to `'pending'`, clears `workerId`, increments `retryCount`,
       resets `claimedAt` to 0.
- **Side effects:** Modifies stale task rows.
- **Error conditions:** None.
- **Called by:** SpacetimeDB scheduler (every 30 seconds).

  **Design note:** The watchdog requeues the SAME row (modifies in place) rather than
  creating a new row like `failTask` does. This is because the watchdog handles silent
  worker death -- the task was never truly "processed," so there is no failure record to
  preserve.

#### `__init__`

- **Parameters:** None.
- **Preconditions:** Module initialization.
- **Behavior:** Inserts a row into `watchdog_schedule` with
  `ScheduleAt.interval(30_000)` to start the watchdog timer.
- **Side effects:** Seeds the scheduled table.
- **Error conditions:** None.
- **Called by:** SpacetimeDB runtime (once, on module publish).

### 2c. Task Chaining DAG

```
                                         AUDIO_EXTRACT
                                              |
                                              v
Upload  ------->  AUDIO_EXTRACT  -------> SPEECH_TRANSCRIPTION  -----+
        |                                                             |
        +-------> VIDEO_SAMPLE  --------> VIDEO_UNDERSTANDING  ------+
        |                  |                                          |
        |                  +--------> UI_CHANGE_DETECT  -------------+
        |                                                             |
        +-------> CURSOR_PROCESS  --+                                 |
        |                           +---> INTERACTION_PATTERN  ------+
        +-------> TYPING_DETECT  ---+                                 |
                                                                      v
                                                               INTENT_GRAPH
                                                                      |
                                                                      v
                                                              NARRATIVE_PLAN
                                                                      |
                                                                      v
                                                                EDIT_PLAN
                                                                      |
                                                                      v
                                                              TIMELINE_BUILD
                                                                      |
                                                                      v
                                                                   RENDER
```

#### Forward Map: `TASK_CHAIN_DAG`

```typescript
// Source: packages/stdb-module/src/index.ts, lines 20-34
// (Mirrored in: packages/shared/src/constants.ts, lines 20-34)

const TASK_CHAIN_DAG: Record<string, string[]> = {
  AUDIO_EXTRACT:        ['SPEECH_TRANSCRIPTION'],
  VIDEO_SAMPLE:         ['VIDEO_UNDERSTANDING', 'UI_CHANGE_DETECT'],
  CURSOR_PROCESS:       ['INTERACTION_PATTERN'],
  TYPING_DETECT:        ['INTERACTION_PATTERN'],
  SPEECH_TRANSCRIPTION: ['INTENT_GRAPH'],
  VIDEO_UNDERSTANDING:  ['INTENT_GRAPH'],
  UI_CHANGE_DETECT:     ['INTENT_GRAPH'],
  INTERACTION_PATTERN:  ['INTENT_GRAPH'],
  INTENT_GRAPH:         ['NARRATIVE_PLAN'],
  NARRATIVE_PLAN:       ['EDIT_PLAN'],
  EDIT_PLAN:            ['TIMELINE_BUILD'],
  TIMELINE_BUILD:       ['RENDER'],
  RENDER:               [],
};
```

#### Reverse Map: `TASK_DEPENDENCIES`

```typescript
// Source: packages/stdb-module/src/index.ts, lines 37-56
// (Mirrored in: packages/shared/src/constants.ts, lines 37-56)

const TASK_DEPENDENCIES: Record<string, string[]> = {
  AUDIO_EXTRACT:        [],
  VIDEO_SAMPLE:         [],
  CURSOR_PROCESS:       [],
  TYPING_DETECT:        [],
  SPEECH_TRANSCRIPTION: ['AUDIO_EXTRACT'],
  VIDEO_UNDERSTANDING:  ['VIDEO_SAMPLE'],
  UI_CHANGE_DETECT:     ['VIDEO_SAMPLE'],
  INTERACTION_PATTERN:  ['CURSOR_PROCESS', 'TYPING_DETECT'],
  INTENT_GRAPH:         ['SPEECH_TRANSCRIPTION', 'VIDEO_UNDERSTANDING',
                         'UI_CHANGE_DETECT', 'INTERACTION_PATTERN'],
  NARRATIVE_PLAN:       ['INTENT_GRAPH'],
  EDIT_PLAN:            ['NARRATIVE_PLAN'],
  TIMELINE_BUILD:       ['EDIT_PLAN'],
  RENDER:               ['TIMELINE_BUILD'],
};
```

#### How `completeTask` Triggers Downstream Tasks

1. When a task completes, `completeTask` looks up `TASK_CHAIN_DAG[completedType]` to find
   candidate downstream types.
2. It collects ALL completed task types for this project by iterating the `tasks` table
   (plus the just-completed type, which may not yet be reflected in the iterator).
3. It also collects ALL existing task types for this project (any status) to prevent
   duplicates.
4. For each candidate downstream type:
   - If a task of that type already exists for this project, it is **skipped** (no
     duplicates).
   - If ANY required dependency (from `TASK_DEPENDENCIES`) is missing from the completed
     set, it is **skipped** (wait for other deps).
   - If all deps met and no duplicate exists, a new pending task is created.

**Duplicate prevention:** The check `existingTaskTypes.has(dsType)` prevents creating the
same task type twice for a project, even if multiple upstream tasks complete near-
simultaneously. Since SpacetimeDB reducers are serialized, this is race-condition safe.

#### How `outputAssetIds` Propagate

When creating a downstream task, `completeTask` iterates all completed tasks that are
dependencies of the downstream type and collects their `outputAssetIds` arrays. These are
merged into a single JSON array and set as the downstream task's `inputAssetIds`.

For example, when `INTENT_GRAPH` is created, its `inputAssetIds` will contain the output
asset IDs from `SPEECH_TRANSCRIPTION`, `VIDEO_UNDERSTANDING`, `UI_CHANGE_DETECT`, and
`INTERACTION_PATTERN`. However, in practice most workers ignore `inputAssetIds` from the
task and instead read well-known GCS paths directly. The `inputAssetIds` propagation
primarily serves workers like `video-understanding` (receives frame asset IDs like
`frame-0000`, `frame-0001`, etc.) and `render` (receives the source video asset ID).

### 2d. Watchdog

**Purpose:** Detects and recovers from stale tasks -- tasks that were claimed by a worker
but never completed (worker crash, timeout, OOM, etc.).

**How it detects stale tasks:**
- Runs every **30 seconds** via SpacetimeDB's `ScheduleAt.interval(30_000)`.
- Scans all `tasks` rows where `status === 'claimed'` AND `claimedAt > 0` AND
  `claimedAt < (now - 5_minutes)`.

**Threshold:** `STALE_TASK_THRESHOLD_MS = 5 * 60 * 1000` (5 minutes).

**Recovery logic:**
- If `retryCount >= maxRetries` (default 3): Task is marked as `'failed'` with reason
  `'Exceeded max retries after becoming stale'`. This is a terminal failure.
- If `retryCount < maxRetries`: Task is reset to `'pending'` (in place), `workerId`
  cleared, `retryCount` incremented, `claimedAt` reset to 0. This allows another worker
  to pick it up.

**Difference from `failTask`:** The watchdog modifies the SAME row. `failTask` marks the
row as failed and creates a NEW row for retry. This is because the watchdog handles silent
death (no error to record on the original), while `failTask` records a specific error.

---

## 3. Worker Architecture

### 3a. BaseWorker Lifecycle

**Source:** `/home/user/FlowStudio/packages/workers/shared/src/base-worker.ts`

```
  start()
    |
    +---> startHealthServer(port 8080)   [HTTP /health endpoint]
    |
    +---> stdb.connect()                 [HTTP connectivity check to SpacetimeDB]
    |
    +---> registerWorker()               [calls updateWorkerConfig reducer via HTTP]
    |
    +---> pollLoop()  <------ runs while this.running === true
    |       |
    |       +---> pollForTasks()
    |       |       |
    |       |       +---> if semaphore.activeCount >= concurrency: return
    |       |       |
    |       |       +---> stdb.callReducer('findAndClaimTask', ...)
    |       |       |       |
    |       |       |       +-- success: query tasks table via SQL to find
    |       |       |       |   claimed task, then dispatch for processing
    |       |       |       +-- failure: no pending task, wait for next poll
    |       |       |
    |       |       +---> sleep(pollIntervalMs)  [default 1000ms]
    |       |
    |       +---> [repeat]
    |
    +---> SIGTERM/SIGINT --> stop()
                              |
                              +---> this.running = false
                              +---> wait for activeTasks === 0 (30s timeout)
                              +---> stdb.disconnect()
                              +---> process.exit(0)


  handleClaimedTask(taskData)
    |
    +---> inFlightTaskIds.add(taskId)
    |
    +---> semaphore.run(async () => {
    |       |
    |       +---> activeTasks++
    |       |
    |       +---> processTask(task)    [abstract -- implemented by each worker]
    |       |       |
    |       |       +-- returns TaskResult { outputAssetIds, signals }
    |       |
    |       +---> for each signal: stdb.callReducer('writeSignal', ...)
    |       |
    |       +---> stdb.callReducer('completeTask', { taskId, outputAssetIds })
    |       |
    |       +---> activeTasks--
    |     })
    |
    +---> on error:
    |       +---> stdb.callReducer('failTask', { taskId, failureReason })
    |       +---> activeTasks--
    |
    +---> finally:
            +---> inFlightTaskIds.delete(taskId)
```

### 3b. Task Claiming Protocol

The task claiming flow uses HTTP polling exclusively:

**Step 1: Claim attempt (HTTP POST)**
- The worker polls every `pollIntervalMs` (default 1000ms) by calling the
  `findAndClaimTask` reducer via HTTP POST.
- If no pending task exists for this worker's `taskType`, the reducer throws and the
  worker silently catches the error and waits for the next poll cycle.
- If a pending task exists, the reducer atomically transitions it to `'claimed'` with
  this worker's ID.

**Step 2: Discover claimed task (HTTP SQL query)**
- After a successful `findAndClaimTask` call, the worker queries the `tasks` table
  via `SELECT * FROM tasks` (HTTP POST to the SQL endpoint) to find tasks matching:
  `status === 'claimed' AND workerId === this.config.workerId AND taskType === this.taskType`.
- Matching tasks that are NOT in `inFlightTaskIds` are dispatched for processing.

**`inFlightTaskIds` deduplication:**
- A `Set<string>` that tracks task IDs currently being processed.
- Before dispatching, the worker checks `!this.inFlightTaskIds.has(taskId)`.
- After dispatch completes (success or failure), the ID is removed.
- This prevents duplicate processing if the same task is seen across multiple poll
  cycles before processing completes.

**Race condition safety:**
- SpacetimeDB reducers execute **serially** within a module. Two workers calling
  `findAndClaimTask` simultaneously will be queued and executed one after the other.
- The first call claims the task; the second call either claims a different task or
  throws "no pending tasks."
- `claimTask` has an explicit `status !== 'pending'` check that prevents double-claiming
  even if called with a known task ID.

### 3c. GCS Client

**Source:** `/home/user/FlowStudio/packages/workers/shared/src/gcs-client.ts`

**Path cleaning:** All methods strip the `gs://bucket/` prefix from paths using
`gcsPath.replace('gs://${this.bucket}/', '')`. This means workers can pass either raw
relative paths (e.g., `projects/{id}/audio_track/audio.wav`) or full GCS URIs.

**API:**

| Method | Purpose | Retry |
|--------|---------|-------|
| `upload(gcsPath, data, contentType)` | Upload a buffer | 3 retries, exponential backoff |
| `download(gcsPath)` | Download a file as Buffer | 3 retries, exponential backoff |
| `exists(gcsPath)` | Check if file exists | No retry |
| `getSignedUploadUrl(gcsPath, expiresInMs)` | V4 signed write URL | No retry |
| `getSignedDownloadUrl(gcsPath, expiresInMs)` | V4 signed read URL | No retry |

**Retry strategy:** Exponential backoff with base delay 1000ms. Delays: 1s, 2s, 4s.
Max 3 attempts total.

**Path prefix conventions:**
```
projects/{projectId}/source_video/{filename}     -- original uploaded video
projects/{projectId}/audio_track/audio.wav        -- extracted audio
projects/{projectId}/frame_sample/frame-NNNN.jpg  -- sampled frames
projects/{projectId}/cursor_data/{assetId}        -- cursor event JSON
projects/{projectId}/keyboard_data/{assetId}      -- keyboard event JSON
projects/{projectId}/transcript/transcript.json   -- Deepgram transcript
projects/{projectId}/signals/{signal_file}.json   -- inter-worker signal files
projects/{projectId}/timeline/timeline.json       -- assembled timeline
projects/{projectId}/rendered_video/output.mp4    -- final rendered video
```

### 3d. Concurrency Control

**Source:** `/home/user/FlowStudio/packages/workers/shared/src/semaphore.ts`

A counting semaphore that limits the number of concurrent task executions per worker
instance.

**Default concurrency:** 2 (set via `WORKER_CONCURRENCY` env var).

**Implementation:**
- `acquire()`: If `current < max`, increments and resolves immediately. Otherwise,
  enqueues a resolver in `queue` and returns a pending promise.
- `release()`: Decrements `current`. If there are waiters in `queue`, shifts the first
  and calls it (which increments `current` and resolves the waiter's promise).
- `run(fn)`: Wraps `acquire()` + `fn()` + `release()` with a `try/finally` to ensure
  release even on error.

**Over-release guard:** `release()` throws `'Semaphore: release without acquire'` if
`current <= 0`. This catches bugs where release is called without a matching acquire.

**Poll loop integration:** The `pollForTasks` method checks
`this.semaphore.activeCount >= this.config.concurrency` before attempting to claim a task.
This prevents polling when all slots are full.

### 3e. Health Checks

**Source:** `/home/user/FlowStudio/packages/workers/shared/src/health.ts`

A minimal HTTP server that responds to `GET /health` with a JSON status object.

**Endpoint:** `GET /health` on port 8080 (configurable via `HEALTH_PORT`).

**Response:**
```json
{
  "healthy": true,
  "workerName": "audio-extract",
  "workerId": "audio-extract-m4k7x2",
  "activeTasks": 1,
  "uptime": 3600
}
```

**Health criteria:** `healthy = this.running && this.stdb.isConnected`. A worker is
unhealthy if it has been stopped or lost connectivity to SpacetimeDB.

**Cloud Run integration:** Workers declare a startup probe in Terraform:
```hcl
startup_probe {
  http_get {
    path = "/health"
    port = 8080
  }
  initial_delay_seconds = 5
  period_seconds        = 5
  failure_threshold     = 3
}
```
This gives workers 20 seconds (5s initial + 3*5s) to connect to SpacetimeDB and become
healthy before Cloud Run kills them.

---

## 4. Pipeline Deep Dive

### Stage 1: Initial Processing

These four workers run in parallel immediately after upload. They have no upstream
dependencies.

#### audio-extract

**Source:** `/home/user/FlowStudio/packages/workers/audio-extract/src/worker.ts`

- **Purpose:** Extract audio track from source video.
- **Input:** Source video from GCS (`projects/{projectId}/source_video/{inputAssetId}`).
- **Processing:**
  1. Downloads source video to temp directory.
  2. Uses FFmpeg to extract audio: mono, 16kHz, PCM s16le WAV format.
  3. Uploads extracted audio to GCS.
- **Output:**
  - GCS: `projects/{projectId}/audio_track/audio.wav` (audio/wav)
  - outputAssetIds: `["audio-{projectId}"]`
  - Signals: none.
- **External dependencies:** FFmpeg (installed via `@ffmpeg-installer/ffmpeg` npm package,
  also needs system FFmpeg for Docker -- `NEEDS_FFMPEG=true`).
- **Failure modes:** Source video not found in GCS; FFmpeg extraction fails (corrupt video,
  no audio track); GCS upload fails.
- **Configuration:** None worker-specific.

#### video-sample

**Source:** `/home/user/FlowStudio/packages/workers/video-sample/src/worker.ts`

- **Purpose:** Extract frame samples at regular intervals and detect scene changes.
- **Input:** Source video from GCS (`projects/{projectId}/source_video/{inputAssetId}`).
- **Processing:**
  1. Downloads source video to temp directory.
  2. Uses FFmpeg to extract frames at `sampleIntervalSecs` (default 2s) intervals.
  3. Resizes each frame to 1280x720 JPEG (quality 85) using `sharp`.
  4. Uploads each frame to GCS.
  5. Computes frame-to-frame pixel difference (64x64 greyscale downscale) to detect scene
     changes (threshold > 0.3).
- **Output:**
  - GCS: `projects/{projectId}/frame_sample/frame-NNNN.jpg` (zero-padded 4 digits)
  - outputAssetIds: `["frame-0000", "frame-0001", ...]`
  - Signals: `SCENE_CHANGE` for each detected transition (includes `beforeFrameGcs` and
    `afterFrameGcs` paths).
- **External dependencies:** FFmpeg, `sharp` (native image processing).
- **Failure modes:** Source video not found; FFmpeg fails; sharp processing fails.
- **Configuration:** `config.sampleIntervalSecs` (default 2).

  **Critical contract:** Frame asset IDs use the format `frame-NNNN` (e.g., `frame-0000`).
  This MUST match the GCS filename pattern. Bug C1 was caused by a mismatch here.

#### cursor-processor

**Source:** `/home/user/FlowStudio/packages/workers/cursor-processor/src/worker.ts`

- **Purpose:** Analyze cursor movement events into classified movement signals.
- **Input:** Cursor event JSON from GCS (`projects/{projectId}/cursor_data/{inputAssetId}`).
- **Processing:**
  1. Downloads cursor event data (array of `{x, y, timestampMs, type}` objects).
  2. Segments events by time gaps (>2000ms gap = new segment).
  3. For each segment: computes distance, speed, and classifies as `linear`, `erratic`,
     `hover`, or `click` (based on R-squared linearity and speed threshold 5 px/s).
  4. Writes signals to GCS for downstream workers.
- **Output:**
  - GCS: `projects/{projectId}/signals/cursor_movements.json`
  - outputAssetIds: `[]`
  - Signals: `CURSOR_MOVEMENT` with payload `{positions, movementType, speed}`.
- **External dependencies:** None.
- **Failure modes:** Gracefully handles missing cursor data -- returns empty signals
  (cursor data capture is a known architectural gap).
- **Configuration:** None.

#### typing-detector

**Source:** `/home/user/FlowStudio/packages/workers/typing-detector/src/worker.ts`

- **Purpose:** Detect typing bursts and paste events from keyboard data.
- **Input:** Keyboard event JSON from GCS (`projects/{projectId}/keyboard_data/{inputAssetId}`).
- **Processing:**
  1. Downloads keyboard event data (array of `{key, timestampMs, type}` objects).
  2. Filters to `keydown` events.
  3. Detects typing bursts: consecutive keystrokes with <1500ms gap, minimum 3 keys.
  4. Classifies paste events: bursts with >15 characters/second.
  5. Writes signals to GCS for downstream workers.
- **Output:**
  - GCS: `projects/{projectId}/signals/typing_events.json`
  - outputAssetIds: `[]`
  - Signals: `TYPING_EVENT` with payload `{detectedText, inputRegion, charactersPerSecond, isPaste}`.
- **External dependencies:** None.
- **Failure modes:** Gracefully handles missing keyboard data -- returns empty signals.
- **Configuration:** None.

### Stage 2: Analysis

These workers depend on Stage 1 outputs.

#### speech-transcription

**Source:** `/home/user/FlowStudio/packages/workers/speech-transcription/src/worker.ts`

- **Purpose:** Transcribe extracted audio using Deepgram.
- **Input:** Audio file from GCS (`projects/{projectId}/audio_track/audio.wav`).
  Depends on: `AUDIO_EXTRACT`.
- **Processing:**
  1. Downloads audio WAV from GCS.
  2. Sends to Deepgram API (`nova-2` model) with smart formatting, utterance detection,
     speaker diarization, and punctuation.
  3. Uploads full transcript JSON to GCS.
  4. Converts utterances to speech segment signals with word-level timing.
  5. Writes signals to GCS.
- **Output:**
  - GCS: `projects/{projectId}/transcript/transcript.json` (full Deepgram response)
  - GCS: `projects/{projectId}/signals/speech_segments.json` (signal file)
  - outputAssetIds: `["transcript-{projectId}"]`
  - Signals: `SPEECH_SEGMENT` with payload `{text, words[], speakerId, language}`.
- **External dependencies:** Deepgram API (`DEEPGRAM_API_KEY` required).
- **Failure modes:** Missing API key (throws); Deepgram API error; no audio track in GCS.
- **Configuration:** Uses `nova-2` model (hardcoded).

#### video-understanding

**Source:** `/home/user/FlowStudio/packages/workers/video-understanding/src/worker.ts`

- **Purpose:** Analyze frame content using Google Gemini multimodal AI.
- **Input:** Frame asset IDs from `VIDEO_SAMPLE` output (e.g., `frame-0000`, `frame-0001`).
  Depends on: `VIDEO_SAMPLE`.
- **Processing:**
  1. Receives frame asset IDs via `task.inputAssetIds`.
  2. Processes frames in batches of 4.
  3. For each batch: downloads frame JPEGs from GCS, encodes as base64, sends to Gemini
     with a prompt requesting JSON analysis of visual changes.
  4. Parses JSON response using bracket-counting `extractJsonArray()`.
  5. Writes signals to GCS.
- **Output:**
  - GCS: `projects/{projectId}/signals/scene_descriptions.json`
  - outputAssetIds: `[]`
  - Signals: `SCENE_CHANGE` with payload `{frameIndex, changeScore, description}`.
- **External dependencies:** Google Generative AI (`GOOGLE_AI_API_KEY` required).
  Model: configurable via `GOOGLE_AI_MODEL`, default `gemini-1.5-flash`.
- **Failure modes:** Missing API key; Gemini API error; LLM returns non-JSON response
  (logged as warning, continues with empty batch); frame files not in GCS.
- **Configuration:** `config.googleAiModel` override.

  **Known limitation:** Hardcoded 2-second frame interval assumption for timestamp
  calculation (`i * 2000`).

#### ui-change-detector

**Source:** `/home/user/FlowStudio/packages/workers/ui-change-detector/src/worker.ts`

- **Purpose:** Detect UI transitions by comparing consecutive frames pixel-by-pixel.
- **Input:** Frame asset IDs from `VIDEO_SAMPLE` output.
  Depends on: `VIDEO_SAMPLE`.
- **Processing:**
  1. Downloads frames from GCS using the pattern
     `projects/{projectId}/frame_sample/frame-NNNN.jpg`.
  2. For each consecutive pair, divides into a 4x4 grid (16 regions) and computes
     normalized pixel difference per region (128x128 greyscale downscale).
  3. If average diff > 0.05, classifies the transition type based on spatial pattern:
     - >70% regions changed = `navigation`
     - Center cluster = `modal`
     - Top row only = `tab`
     - Vertical strip = `scroll`
     - Otherwise = `other`
  4. Writes signals to GCS.
- **Output:**
  - GCS: `projects/{projectId}/signals/ui_transitions.json`
  - outputAssetIds: `[]`
  - Signals: `UI_TRANSITION` with payload `{fromState, toState, transitionType,
    affectedRegion, diffScore}`.
- **External dependencies:** `sharp` (native image processing).
- **Failure modes:** Frame files not in GCS (silently skips missing frames via try/catch).
- **Configuration:** None.

  **Known limitation:** Hardcoded 2-second frame interval assumption for timestamp
  calculation (`i * 2000`) and `durationMs` (always 2000).

#### interaction-pattern

**Source:** `/home/user/FlowStudio/packages/workers/interaction-pattern/src/worker.ts`

- **Purpose:** Cluster cursor and typing signals into interaction patterns.
- **Input:** Signal files from GCS (cursor_movements.json, typing_events.json).
  Depends on: `CURSOR_PROCESS`, `TYPING_DETECT`.
- **Processing:**
  1. Downloads cursor and typing signal files from GCS (separate reads, each may not exist).
  2. Sorts all signals by timestamp.
  3. Clusters interactions within 5-second windows.
  4. Infers intent per cluster: `form_interaction` (both cursor+typing), `text_input`
     (typing only), `navigation` (cursor only), `unknown`.
  5. Writes signals to GCS.
- **Output:**
  - GCS: `projects/{projectId}/signals/interaction_clusters.json`
  - outputAssetIds: `[]`
  - Signals: `INTERACTION_CLUSTER` with payload `{interactions, intent, clusterLabel}`.
- **External dependencies:** None.
- **Failure modes:** Both signal files missing = empty result (warning logged). This is
  normal when no cursor/typing data was captured.
- **Configuration:** None.

### Stage 3: Intelligence

#### intent-graph

**Source:** `/home/user/FlowStudio/packages/workers/intent-graph/src/worker.ts`

- **Purpose:** Build a hierarchical intent graph from all upstream signals using Claude.
- **Input:** Four signal files from GCS: `speech_segments.json`,
  `scene_descriptions.json`, `ui_transitions.json`, `interaction_clusters.json`.
  Depends on: `SPEECH_TRANSCRIPTION`, `VIDEO_UNDERSTANDING`, `UI_CHANGE_DETECT`,
  `INTERACTION_PATTERN`.
- **Processing:**
  1. Downloads all 4 signal files (each may not exist -- logged as warning).
  2. If no signals at all: throws error (cannot build intent graph from nothing).
  3. Sorts signals by timestamp and builds a summary for the LLM prompt.
  4. Sends to Claude with a prompt requesting a JSON intent hierarchy.
  5. Parses JSON response using bracket-counting `extractJsonArray()`.
  6. Converts intents to signals and writes to GCS.
- **Output:**
  - GCS: `projects/{projectId}/signals/intent_graph.json`
  - outputAssetIds: `["intent-graph-{projectId}"]`
  - Signals: `INTENT_NODE` with payload `{intentId, parentIntentId, action, reasoning,
    confidence, relatedSignalIds}`.
- **External dependencies:** Anthropic Claude (`ANTHROPIC_API_KEY` required).
  Model: configurable via `ANTHROPIC_MODEL`, default `claude-sonnet-4-20250514`.
- **Failure modes:** Missing API key; no upstream signals (throws); Claude API error;
  JSON parse failure (throws with descriptive error, triggering retry).
- **Configuration:** `config.anthropicModel` override.

### Stage 4: Planning

#### narrative-planner

**Source:** `/home/user/FlowStudio/packages/workers/narrative-planner/src/worker.ts`

- **Purpose:** Create a narrative structure (beats) from the intent graph.
- **Input:** `projects/{projectId}/signals/intent_graph.json`.
  Depends on: `INTENT_GRAPH`.
- **Processing:**
  1. Downloads intent graph from GCS.
  2. Sends to Claude with a prompt requesting narrative beats (setup/action/result/
     transition/highlight) with durations and intent references.
  3. Parses JSON response using bracket-counting `extractJsonArray()`.
  4. Writes to GCS.
- **Output:**
  - GCS: `projects/{projectId}/signals/narrative_plan.json`
  - outputAssetIds: `["narrative-{projectId}"]`
  - Signals: `NARRATIVE_BEAT` with payload `{beatIndex, beatType, title, description,
    suggestedDurationMs, relatedIntentIds}`.
- **External dependencies:** Anthropic Claude (`ANTHROPIC_API_KEY` required).
- **Failure modes:** Intent graph not in GCS; Claude API error; JSON parse failure
  (throws, triggers retry).
- **Configuration:** `config.anthropicModel` override.

#### edit-planner

**Source:** `/home/user/FlowStudio/packages/workers/edit-planner/src/worker.ts`

- **Purpose:** Convert narrative beats into specific video edit decisions.
- **Input:** `projects/{projectId}/signals/narrative_plan.json`.
  Depends on: `NARRATIVE_PLAN`.
- **Processing:**
  1. Downloads narrative plan from GCS.
  2. Sends to Claude with a prompt requesting edit decisions: cut points, speed changes,
     zoom/pan, transitions.
  3. Parses JSON response using bracket-counting `extractJsonArray()`.
  4. Writes to GCS.
- **Output:**
  - GCS: `projects/{projectId}/signals/edit_plan.json`
  - outputAssetIds: `["edit-plan-{projectId}"]`
  - Signals: `EDIT_DECISION` with payload `{editType, sourceStartMs, sourceEndMs,
    outputStartMs, outputEndMs, parameters, reasoning}`.
- **External dependencies:** Anthropic Claude (`ANTHROPIC_API_KEY` required).
- **Failure modes:** Narrative plan not in GCS; Claude API error; JSON parse failure
  (throws, triggers retry).
- **Configuration:** `config.anthropicModel` override.

### Stage 5: Production

#### timeline-builder

**Source:** `/home/user/FlowStudio/packages/workers/timeline-builder/src/worker.ts`

- **Purpose:** Transform edit decisions into a structured timeline with video and audio
  tracks.
- **Input:** `projects/{projectId}/signals/edit_plan.json`.
  Depends on: `EDIT_PLAN`.
- **Processing:**
  1. Downloads edit plan from GCS.
  2. Sorts edits by `outputStartMs`.
  3. For each edit decision:
     - Creates a video clip with effects based on `editType` (speed, zoom, pan,
       transition).
     - Creates a corresponding audio clip (unless the edit is visual-only: zoom/pan/overlay).
     - Audio clips inherit speed effects.
  4. Writes timeline JSON to GCS.
- **Output:**
  - GCS: `projects/{projectId}/timeline/timeline.json`
  - outputAssetIds: `["timeline-{projectId}"]`
  - Signals: `TIMELINE_EVENT` for each clip with payload `{trackIndex, trackType, clipId,
    startMs, endMs, sourceAssetId, effects}`.
- **External dependencies:** None.
- **Failure modes:** Edit plan not in GCS.
- **Configuration:** None.

#### render

**Source:** `/home/user/FlowStudio/packages/workers/render/src/worker.ts`

- **Purpose:** Execute the timeline by rendering the final edited video using FFmpeg.
- **Input:** `projects/{projectId}/timeline/timeline.json` and source video.
  Depends on: `TIMELINE_BUILD`.
- **Processing:**
  1. Downloads timeline JSON from GCS.
  2. Downloads source video from GCS.
  3. Builds an FFmpeg `filter_complex` string from timeline clips:
     - `[0:v]trim=start=X:end=Y,setpts=(PTS-STARTPTS)/speed[vN]` per video clip
     - `[0:a]atrim=start=X:end=Y,asetpts=PTS-STARTPTS,atempo=speed[aN]` per audio clip
     - `concat=n=N:v=1:a=1[outv][outa]` to concatenate all clips
  4. Runs FFmpeg with `libx264` (CRF 23, fast preset) and `aac` codec.
  5. Uploads rendered video to GCS.
- **Output:**
  - GCS: `projects/{projectId}/rendered_video/output.mp4`
  - outputAssetIds: `["rendered-{projectId}"]`
  - Signals: none.
- **External dependencies:** FFmpeg (system install required -- `NEEDS_FFMPEG=true`).
- **Failure modes:** Timeline not in GCS; source video not in GCS; FFmpeg fails (invalid
  filter complex, corrupt source, insufficient resources).
- **Configuration:** None.

  **Note:** When `completeTask` processes the RENDER completion, it detects `RENDER: []`
  in `TASK_CHAIN_DAG` and transitions the project to `'ready'` status.

---

## 5. GCS Path Contract Map

This section documents EVERY GCS read and write across the entire codebase. Path
mismatches between writers and readers have been the source of 5 critical bugs (C1-C4 in
the code sweep, plus one in the cloud function). Any modification to a GCS path MUST be
verified against this table.

### 5a. Complete Path Table

| Stage | Worker/Component | Operation | GCS Path Pattern | Content Type | Source File : Line |
|-------|-----------------|-----------|-----------------|--------------|-------------------|
| Upload | Cloud Function | write (signed URL) | `projects/{projectId}/source_video/{filename}` | `video/*` | `infra/cloud-function/generate-upload-url/index.js:45` |
| 1 | audio-extract | read | `projects/{projectId}/source_video/{inputAssetId}` | `video/*` | `packages/workers/audio-extract/src/worker.ts:26` |
| 1 | audio-extract | write | `projects/{projectId}/audio_track/audio.wav` | `audio/wav` | `packages/workers/audio-extract/src/worker.ts:50` |
| 1 | video-sample | read | `projects/{projectId}/source_video/{inputAssetId}` | `video/*` | `packages/workers/video-sample/src/worker.ts:32` |
| 1 | video-sample | write | `projects/{projectId}/frame_sample/frame-{NNNN}.jpg` | `image/jpeg` | `packages/workers/video-sample/src/worker.ts:70` |
| 1 | cursor-processor | read | `projects/{projectId}/cursor_data/{inputAssetId}` | `application/json` | `packages/workers/cursor-processor/src/worker.ts:29` |
| 1 | cursor-processor | write | `projects/{projectId}/signals/cursor_movements.json` | `application/json` | `packages/workers/cursor-processor/src/worker.ts:79` |
| 1 | typing-detector | read | `projects/{projectId}/keyboard_data/{inputAssetId}` | `application/json` | `packages/workers/typing-detector/src/worker.ts:38` |
| 1 | typing-detector | write | `projects/{projectId}/signals/typing_events.json` | `application/json` | `packages/workers/typing-detector/src/worker.ts:77` |
| 2 | speech-transcription | read | `projects/{projectId}/audio_track/audio.wav` | `audio/wav` | `packages/workers/speech-transcription/src/worker.ts:19` |
| 2 | speech-transcription | write | `projects/{projectId}/transcript/transcript.json` | `application/json` | `packages/workers/speech-transcription/src/worker.ts:34` |
| 2 | speech-transcription | write | `projects/{projectId}/signals/speech_segments.json` | `application/json` | `packages/workers/speech-transcription/src/worker.ts:69` |
| 2 | video-understanding | read | `projects/{projectId}/frame_sample/{assetId}.jpg` | `image/jpeg` | `packages/workers/video-understanding/src/worker.ts:43` |
| 2 | video-understanding | write | `projects/{projectId}/signals/scene_descriptions.json` | `application/json` | `packages/workers/video-understanding/src/worker.ts:108` |
| 2 | ui-change-detector | read | `projects/{projectId}/frame_sample/frame-{NNNN}.jpg` | `image/jpeg` | `packages/workers/ui-change-detector/src/worker.ts:30` |
| 2 | ui-change-detector | write | `projects/{projectId}/signals/ui_transitions.json` | `application/json` | `packages/workers/ui-change-detector/src/worker.ts:70` |
| 2 | interaction-pattern | read | `projects/{projectId}/signals/cursor_movements.json` | `application/json` | `packages/workers/interaction-pattern/src/worker.ts:22` |
| 2 | interaction-pattern | read | `projects/{projectId}/signals/typing_events.json` | `application/json` | `packages/workers/interaction-pattern/src/worker.ts:23` |
| 2 | interaction-pattern | write | `projects/{projectId}/signals/interaction_clusters.json` | `application/json` | `packages/workers/interaction-pattern/src/worker.ts:72` |
| 3 | intent-graph | read | `projects/{projectId}/signals/speech_segments.json` | `application/json` | `packages/workers/intent-graph/src/worker.ts:37` |
| 3 | intent-graph | read | `projects/{projectId}/signals/scene_descriptions.json` | `application/json` | `packages/workers/intent-graph/src/worker.ts:38` |
| 3 | intent-graph | read | `projects/{projectId}/signals/ui_transitions.json` | `application/json` | `packages/workers/intent-graph/src/worker.ts:39` |
| 3 | intent-graph | read | `projects/{projectId}/signals/interaction_clusters.json` | `application/json` | `packages/workers/intent-graph/src/worker.ts:40` |
| 3 | intent-graph | write | `projects/{projectId}/signals/intent_graph.json` | `application/json` | `packages/workers/intent-graph/src/worker.ts:139` |
| 4 | narrative-planner | read | `projects/{projectId}/signals/intent_graph.json` | `application/json` | `packages/workers/narrative-planner/src/worker.ts:26` |
| 4 | narrative-planner | write | `projects/{projectId}/signals/narrative_plan.json` | `application/json` | `packages/workers/narrative-planner/src/worker.ts:98` |
| 4 | edit-planner | read | `projects/{projectId}/signals/narrative_plan.json` | `application/json` | `packages/workers/edit-planner/src/worker.ts:25` |
| 4 | edit-planner | write | `projects/{projectId}/signals/edit_plan.json` | `application/json` | `packages/workers/edit-planner/src/worker.ts:96` |
| 5 | timeline-builder | read | `projects/{projectId}/signals/edit_plan.json` | `application/json` | `packages/workers/timeline-builder/src/worker.ts:34` |
| 5 | timeline-builder | write | `projects/{projectId}/timeline/timeline.json` | `application/json` | `packages/workers/timeline-builder/src/worker.ts:129` |
| 5 | render | read | `projects/{projectId}/timeline/timeline.json` | `application/json` | `packages/workers/render/src/worker.ts:35` |
| 5 | render | read | `projects/{projectId}/source_video/{sourceAssetId}` | `video/*` | `packages/workers/render/src/worker.ts:41` |
| 5 | render | write | `projects/{projectId}/rendered_video/output.mp4` | `video/mp4` | `packages/workers/render/src/worker.ts:89` |

### 5b. Signal File Contracts

| Signal File | Writer Worker | Reader Worker | Schema (payload fields) |
|-------------|--------------|---------------|------------------------|
| `signals/cursor_movements.json` | cursor-processor | interaction-pattern | `{positions: [{x,y,timestampMs}], movementType, speed}` |
| `signals/typing_events.json` | typing-detector | interaction-pattern | `{detectedText, inputRegion: {x,y,w,h}, charactersPerSecond, isPaste}` |
| `signals/speech_segments.json` | speech-transcription | intent-graph | `{text, words: [{word,startMs,endMs,confidence}], speakerId, language}` |
| `signals/scene_descriptions.json` | video-understanding | intent-graph | `{frameIndex, changeScore, description, beforeFrameGcs, afterFrameGcs}` |
| `signals/ui_transitions.json` | ui-change-detector | intent-graph | `{fromState, toState, transitionType, affectedRegion: {x,y,w,h}, diffScore}` |
| `signals/interaction_clusters.json` | interaction-pattern | intent-graph | `{interactions: [{type,timestampMs,position}], intent, clusterLabel}` |
| `signals/intent_graph.json` | intent-graph | narrative-planner | `{intentId, parentIntentId, action, reasoning, confidence, relatedSignalIds}` |
| `signals/narrative_plan.json` | narrative-planner | edit-planner | `{beatIndex, beatType, title, description, suggestedDurationMs, relatedIntentIds}` |
| `signals/edit_plan.json` | edit-planner | timeline-builder | `{editType, sourceStartMs, sourceEndMs, outputStartMs, outputEndMs, parameters, reasoning}` |
| `timeline/timeline.json` | timeline-builder | render | `{videoTrack: [TimelineClip], audioTrack: [TimelineClip]}` |

### 5c. Path Construction Rules

1. **All paths are relative to bucket root.** The `GcsClient` strips `gs://bucket/` prefixes
   automatically.

2. **Top-level pattern:** `projects/{projectId}/{category}/{filename}`

3. **Frame naming:** `frame-NNNN.jpg` where NNNN is zero-padded to 4 digits.
   - Writer (video-sample): `frame-${String(i).padStart(4, '0')}.jpg`
   - Reader (video-understanding): `{assetId}.jpg` where assetId = `frame-NNNN`
   - Reader (ui-change-detector): `frame-${String(i).padStart(4, '0')}.jpg`

4. **Asset ID format for frames:** `frame-NNNN` (no `.jpg` extension). The extension is
   added by the reader.

5. **Signal file naming:** Always `{signal_type_snake_case}.json` under
   `projects/{projectId}/signals/`.

6. **Source video naming:** The original filename from the upload (e.g., `video.mp4`).
   The `inputAssetId` for initial tasks is the full GCS path (including `gs://` prefix)
   as set by the client upload flow.

### 5d. Contract Verification

To verify path contracts have not been broken, run:

```bash
# Find all GCS path constructions in workers
grep -rn 'projects/\${' packages/workers/ --include='*.ts'

# Find all gcs.download calls
grep -rn 'this.gcs.download' packages/workers/ --include='*.ts'

# Find all gcs.upload calls
grep -rn 'this.gcs.upload' packages/workers/ --include='*.ts'

# Verify frame naming consistency
grep -rn 'frame-' packages/workers/ --include='*.ts'

# Verify signal file naming consistency
grep -rn 'signals/' packages/workers/ --include='*.ts'
```

---

## 6. Frontend Architecture

### 6a. SpacetimeDB Connection

**Source:** `/home/user/FlowStudio/finalFrontend/src/lib/stdbConnection.ts`

**HTTP bridge pattern:** A functional module (no class) exports `initConnection`,
`callReducer`, `queryTable`, `disconnect`, and `isConnected`. All communication uses HTTP
-- no WebSocket. Once `spacetime generate` produces typed SDK bindings, this module will
be swapped for a real `DbConnection.builder().build()` with push subscriptions.

```typescript
export async function initConnection(
  onConnect?: () => void,
  onDisconnect?: () => void,
): Promise<void> { /* probe via SQL endpoint */ }

export async function queryTable(tableName: string): Promise<Record<string, unknown>[]> { ... }
export async function callReducer(name: string, args: Record<string, unknown>): Promise<void> { ... }
export function disconnect(): void { ... }
export function isConnected(): boolean { ... }
```

**Table reads:** `queryTable()` issues `SELECT * FROM {table}` via HTTP POST to
`/v1/database/{module}/sql`. Column names are converted from snake_case to camelCase.
BigInt values are converted to Number.

**Reducer calls:** `callReducer()` posts to `/v1/database/{module}/call/{reducerName}`
with a JSON body. Reducer names are converted from camelCase to snake_case.

**Connection probe:** `initConnection()` sends `SELECT 1` to the SQL endpoint. Any
non-5xx response (including 400) counts as reachable, since SpacetimeDB may reject
the query if no table exists.

### 6b. State Management

**No external state library.** All state comes from SpacetimeDB via HTTP polling.

**Hook:** `useStdbReducer()` (`/home/user/FlowStudio/finalFrontend/src/lib/stdbHooks.ts`)
- Returns a `callReducer` function that proxies to `stdbConnection.callReducer()`.
- After each reducer call, triggers `forceSync()` from `stdbSdkSync.ts` for immediate UI refresh.
- Memoized with `useCallback` (empty deps -- stable reference).

**Hook:** `useConnectionStatus()` (`stdbHooks.ts`)
- Polls `isConnected()` every 1 second via `setInterval`.
- Returns a boolean for the Header connection indicator.

**Sync service:** `stdbSdkSync.ts` (`/home/user/FlowStudio/finalFrontend/src/core/services/stdbSdkSync.ts`)
- Polls all tables (projects, folders, assets, tasks, signals) via `queryTable()` on a 3s interval.
- Maps rows to typed objects and pushes into Zustand stores.
- `forceSync()` triggers an immediate poll cycle (called after reducer mutations).

**Data flow:** `stdbSdkSync` poll timer --> `queryTable()` HTTP SQL --> parse rows -->
Zustand store setter --> React re-render via `useStore()` selectors.

### 6c. Upload Flow

**Source:** `/home/user/FlowStudio/finalFrontend/src/app/project/[id]/page.tsx`

Step-by-step sequence:

```
1. User drops file or selects via file input
   |
2. handleFileUpload(file) called
   |
3. File validation:
   |  - file.type must start with 'video/' (else alert and return)
   |  - file.size must be <= 5 GB (else alert and return)
   |
4. Request signed upload URL from Cloud Function:
   |  POST {NEXT_PUBLIC_UPLOAD_FUNCTION_URL}/generate-upload-url
   |  Body: { projectId, filename: file.name, contentType: file.type }
   |  Response: { url: signedUrl, gcsPath: 'gs://bucket/projects/...' }
   |
5. Upload file directly to GCS via signed URL:
   |  PUT {signedUrl}
   |  Headers: Content-Type: file.type
   |  Body: raw file
   |
6. Register asset in SpacetimeDB:
   |  callReducer('createAsset', {
   |    projectId, assetType: 'source_video', gcsPath,
   |    sizeBytes: file.size, mimeType: file.type,
   |    durationMs: 0, metadata: JSON.stringify({originalName: file.name})
   |  })
   |
7. Create initial pipeline tasks (4 tasks in sequence):
   |  for each of [AUDIO_EXTRACT, VIDEO_SAMPLE, CURSOR_PROCESS, TYPING_DETECT]:
   |    callReducer('createTask', {
   |      projectId, taskType, inputAssetIds: JSON.stringify([gcsPath]),
   |      config: '{}', maxRetries: 3
   |    })
   |
8. Update project state to 'processing':
   |  callReducer('updateProjectState', {
   |    projectId, currentPhase: 'processing', status: 'processing'
   |  })
   |  NOTE: This is called AFTER all tasks are created (fix H7).
   |        If task creation fails partway, the project stays in 'created' state
   |        rather than being stuck in 'processing' with missing tasks.
```

**Important:** The `inputAssetIds` for initial tasks is `[gcsPath]` where `gcsPath` is the
full GCS URI (e.g., `gs://flowstudio-assets/projects/{id}/source_video/video.mp4`). This
was bug C4 -- originally it passed just `file.name`.

### 6d. Component Tree

```
layout.tsx                          (RootLayout -- HTML shell, metadata from BRANDING)
|
+-- page.tsx                        (DashboardPage -- project list)
|   +-- Header                      (brand name, tagline, connection status indicator)
|   +-- CreateProjectDialog         (modal: project name input, calls createProject reducer)
|   +-- ProjectCard[]               (per-project card with name, status, click-to-navigate)
|
+-- project/[id]/page.tsx           (ProjectPage -- single project view)
|   +-- Header
|   +-- Progress bar                (completedCount / totalCount percentage)
|   +-- PipelineStatus              (task list with status icons, failure reasons)
|   +-- Upload dropzone             (drag-and-drop + file input, signed URL upload)
|
+-- error.tsx                       (GlobalError -- error boundary with retry button)
```

---

## 7. Infrastructure

### 7a. Network Topology

```
                    INTERNET
                       |
           +-----------+-----------+
           |                       |
       HTTPS (443)           HTTP PUT (signed URL)
           |                       |
     +-----v------+         +-----v------+
     | Nginx      |         | GCS Bucket |
     | (GCE VM)   |         | flowstudio-|
     | stdb.flow  |         | assets     |
     | studio.ai  |         +-----^------+
     +-----+------+               |
           |                      |
      localhost:3000    Service Account
           |                      |
     +-----v------+              |
     | SpacetimeDB|              |
     | Docker     |              |
     +-----^------+              |
           |                     |
     ======+======================+========= VPC: flowstudio-vpc
     | Subnet: 10.128.0.0/20              |
     | VPC Connector: 10.8.0.0/28         |
     |                                     |
     |  +----------+  +----------+         |
     |  |Cloud Run |  |Cloud Run |  ...    |
     |  |audio-ext |  |video-samp|         |
     |  |:8080     |  |:8080     |         |
     |  +----------+  +----------+         |
     +=====================================+
```

**Firewall rules:**

| Rule | Protocol | Ports | Source | Target | Purpose |
|------|----------|-------|--------|--------|---------|
| `flowstudio-allow-internal` | TCP | 0-65535 | `10.128.0.0/20`, `10.8.0.0/28` | tag: `stdb` | Workers -> SpacetimeDB |
| `flowstudio-allow-web` | TCP | 80, 443 | `0.0.0.0/0` | tag: `stdb` | Public HTTPS |
| `flowstudio-allow-ssh` | TCP | 22 | `35.235.240.0/20` | tag: `stdb` | IAP SSH only |

**Source:** `/home/user/FlowStudio/infra/terraform/network.tf`

### 7b. Cloud Run Services

#### Client Service

- **Image:** `{registry}/client:latest`
- **Port:** 3000
- **Access:** Public (`allUsers` -> `roles/run.invoker`)
- **Resources:** 1 CPU, 512Mi memory
- **Scaling:** 0-3 instances
- **Env vars:** `NEXT_PUBLIC_STDB_HOST`, `NEXT_PUBLIC_STDB_MODULE`,
  `NEXT_PUBLIC_UPLOAD_FUNCTION_URL`
- **No VPC connector** (public service, connects to SpacetimeDB via public domain)

#### Worker Services (13 instances, one per worker type)

- **Image:** `{registry}/{worker-name}:latest`
- **Port:** 8080
- **Access:** Private (no public IAM binding)
- **VPC connector:** `flowstudio-vpc` (egress: `PRIVATE_RANGES_ONLY`)
- **Resources:**
  - Standard workers: 1 CPU, 1Gi memory
  - Heavy workers (render, video-understanding, intent-graph): 2 CPU, 2Gi memory
- **Scaling:** 0-5 instances
- **Startup probe:** `GET /health` on port 8080 (5s initial delay, 5s period, 3 failures)
- **Env vars:**
  - All workers: `WORKER_NAME`, `STDB_INTERNAL_HOST`, `STDB_MODULE`, `GCS_BUCKET`,
    `GCP_PROJECT_ID`
  - speech-transcription: `DEEPGRAM_API_KEY` (from Secret Manager)
  - video-understanding: `GOOGLE_AI_API_KEY` (from Secret Manager)
  - intent-graph, narrative-planner, edit-planner: `ANTHROPIC_API_KEY` (from Secret Manager)

**Source:** `/home/user/FlowStudio/infra/terraform/cloud-run.tf`

### 7c. Security Model

**What's public:**
- Client Cloud Run service (unauthenticated access for all users)
- SpacetimeDB via Nginx (HTTP, no auth on reducers)
- Cloud Function for upload URL generation (no auth, CORS wildcard `*`)

**What's private:**
- Worker Cloud Run services (no public IAM binding, internal VPC only)
- SpacetimeDB module publish (`/v1/publish` blocked by Nginx to external traffic)
- GCS bucket (uniform bucket-level access, only service accounts)

**SSH access:** IAP only (`35.235.240.0/20`).

**Secret Manager integration:** Three secrets:
- `flowstudio-deepgram-api-key`
- `flowstudio-google-ai-api-key`
- `flowstudio-anthropic-api-key`

Workers access secrets via `value_source.secret_key_ref` in Terraform. The worker service
account has `roles/secretmanager.secretAccessor` on all three secrets.

**Known security gaps:**
- No authentication on SpacetimeDB reducers (anyone can call `createProject`, etc.)
- No authentication on the Cloud Function (anyone can generate upload URLs)
- CORS wildcard `*` on Cloud Function (should be restricted to frontend domain)
- No user identity system (all projects owned by `'anonymous'`)

**Source:** `/home/user/FlowStudio/infra/terraform/secrets.tf`

### 7d. Docker Build

**Two Dockerfiles:**

#### `Dockerfile.client` (`/home/user/FlowStudio/infra/docker/Dockerfile.client`)

```
Multi-stage build:
  Stage 1 (base): node:20.18-slim
    - Copies workspace root configs + shared + client packages
    - Installs deps with pnpm
    - Build args: NEXT_PUBLIC_STDB_HOST, NEXT_PUBLIC_STDB_MODULE,
      NEXT_PUBLIC_UPLOAD_FUNCTION_URL
    - Builds shared then client

  Stage 2 (production): node:20.18-slim
    - Copies .next, package.json, node_modules, shared dist
    - Runs: next start on port 3000
```

**CRITICAL:** Build args for `NEXT_PUBLIC_*` environment variables must be passed at
`docker build` time, not runtime. Next.js inlines these values during the build. Missing
build args = broken frontend.

#### `Dockerfile.worker` (`/home/user/FlowStudio/infra/docker/Dockerfile.worker`)

```
Multi-stage build:
  Stage 1 (base): node:20.18-slim
    - Conditional FFmpeg install (ARG NEEDS_FFMPEG)
    - Copies workspace root configs + shared + worker-shared + specific worker
    - Installs deps with pnpm (filtered to relevant packages)
    - Builds shared, worker-shared, then specific worker

  Stage 2 (production): node:20.18-slim
    - Conditional FFmpeg install (ARG NEEDS_FFMPEG)
    - Copies dist + package.json for shared, worker-shared, and specific worker
    - Creates /entrypoint.sh that runs:
      node packages/workers/$WORKER_NAME/dist/entrypoint.js
    - Exposes port 8080
```

**Build and push script:** `/home/user/FlowStudio/infra/scripts/build-and-push.sh`

```bash
# Workers (auto-detects FFmpeg need)
./infra/scripts/build-and-push.sh audio-extract v1

# Client (passes NEXT_PUBLIC_* env vars from shell)
./infra/scripts/build-and-push.sh client v1
```

FFmpeg workers: `audio-extract`, `video-sample`, `render` (determined by `FFMPEG_WORKERS`
variable in the script).

---

## 8. Data Flow Diagrams

### 8a. Happy Path -- Full Pipeline Run

```
  Browser                 Cloud Fn        GCS                SpacetimeDB         Workers
    |                        |              |                      |                 |
    |-- POST /generate-upload-url -------->|                      |                 |
    |<-- {url, gcsPath} ------------------|                      |                 |
    |                        |              |                      |                 |
    |-- PUT signedUrl ------------------------------------------>|                 |
    |   (upload video)       |              |                      |                 |
    |                        |              |                      |                 |
    |-- callReducer('createAsset') -------------------------------->|                 |
    |                        |              |                      |                 |
    |-- callReducer('createTask', AUDIO_EXTRACT) ------------------>|                 |
    |-- callReducer('createTask', VIDEO_SAMPLE) ------------------->|                 |
    |-- callReducer('createTask', CURSOR_PROCESS) ----------------->|                 |
    |-- callReducer('createTask', TYPING_DETECT) ------------------>|                 |
    |                        |              |                      |                 |
    |-- callReducer('updateProjectState', processing) ------------->|                 |
    |                        |              |                      |                 |
    |                        |              |              tasks table updated       |
    |                        |              |                      |                 |
    |                        |              |                      |<-- findAndClaimTask
    |                        |              |                      |    (poll from worker)
    |                        |              |                      |                 |
    |                        |              |                      |-- task claimed   |
    |                        |              |                      |  (next poll) -->|
    |                        |              |                      |                 |
    |                        |              |<---------- download source video ------|
    |                        |              |----------- upload audio.wav ---------->|
    |                        |              |                      |                 |
    |                        |              |                      |<- completeTask --|
    |                        |              |                      |                 |
    |                        |              |               [task chaining:          |
    |                        |              |                creates SPEECH_TRANSCR]  |
    |                        |              |                      |                 |
    |                        |              |    ... (repeat for each pipeline stage) |
    |                        |              |                      |                 |
    |                        |              |              [RENDER completes]         |
    |                        |              |              project.status = 'ready'   |
    |                        |              |                      |                 |
    |<-- HTTP poll: projects table (status=ready) -----------------|                 |
```

### 8b. Failure and Retry

```
  Worker                        SpacetimeDB
    |                                |
    |-- processTask() throws         |
    |                                |
    |-- callReducer('failTask',      |
    |     {taskId, failureReason})    |
    |                                |
    |                     failTask reducer:
    |                       1. Mark task as 'failed'
    |                       2. If retryCount < maxRetries:
    |                          Create NEW pending task
    |                          with retryCount + 1
    |                       3. If retryCount >= maxRetries:
    |                          Set project_state.currentPhase = 'failed'
    |                                |
    |                     [New pending task created]
    |                                |
    |<-- HTTP poll: tasks table -----|
    |                                |
    |-- findAndClaimTask ----------->|
    |   (claims the retry task)      |
    |                                |
    |-- processTask() (retry)        |
```

**Watchdog recovery path:**

```
  SpacetimeDB (every 30s)
    |
    watchdog_schedule reducer:
      1. Scan tasks: status='claimed' AND claimedAt < (now - 5min)
      2. For each stale task:
         If retryCount >= maxRetries:
           Update status -> 'failed'
           (terminal failure)
         Else:
           Update status -> 'pending'
           Clear workerId
           Increment retryCount
           Reset claimedAt to 0
           (task returns to pool for re-claiming)
```

### 8c. Task State Machine

```
                                    createTask / task chaining
                                           |
                                           v
                                      +--------+
                        +------------>|PENDING |<-----------+
                        |             +---+----+            |
                        |                 |                 |
                        |     findAndClaimTask / claimTask  |
                        |                 |                 |
                        |                 v                 |
                        |            +---------+            |
                        |            | CLAIMED |            |
                        |            +----+----+            |
                        |                 |                  |
                 watchdog requeue    +----+----+    watchdog requeue
                 (retries remain)    |         |   (retries remain)
                        |      completeTask  failTask
                        |           |         |
                        |           v         v
                        |     +---------+ +--------+
                        |     |COMPLETED| | FAILED |
                        |     +---------+ +---+----+
                        |                     |
                        |              retries remain?
                        |              yes: create NEW
                        +----- pending task (copy) -----+
                                                        |
                                       no: terminal failure
                                       (project_state -> 'failed')

  Note: 'stale' is NOT a real status in the database.
  The watchdog resets stale 'claimed' tasks directly to 'pending'
  or 'failed'. TaskStatus.STALE exists in the enum only for the
  client PipelineStatus display (dead code, from removed RUNNING
  status audit -- see M13).
```

---

## 9. Design Decisions & Tradeoffs

### Why SpacetimeDB instead of Postgres + Redis + Celery

SpacetimeDB provides three capabilities in one:
1. **Relational storage** (tables with primary keys, queries via SQL and iterators)
2. **Atomic task queue** (reducers execute serially -- no need for advisory locks or
   SELECT FOR UPDATE)
3. **Real-time subscriptions** (designed for WebSocket push via BSATN binary protocol)

This eliminates three separate infrastructure components and their coordination complexity.
The tradeoff is that SpacetimeDB is beta software (v2.0.1) with limited production track
record and in-memory-only storage.

**Current state:** The WebSocket subscription capability (point 3) is not currently used.
The SpacetimeDB SDK's WebSocket protocol requires BSATN binary serialization, which is
not available in the current JavaScript SDK. Instead, the system uses HTTP polling as a
bridge: the client polls tables every 3 seconds via `stdbSdkSync.ts`, and workers poll
every 1 second via `base-worker.ts`. Calls to `forceSync()` after reducer invocations
trigger immediate re-polls, providing near-real-time UX. Once `spacetime generate`
produces typed SDK bindings with BSATN support, the HTTP polling layer (`stdbSdkSync.ts`,
`stdb-client.ts`) will be replaced with native push subscriptions.

### Why task chaining in the reducer instead of a separate orchestrator

Task chaining lives inside the `completeTask` reducer because:
1. **Atomicity:** The entire chain evaluation runs within a single reducer call. There is
   no window where a task is completed but downstream tasks haven't been created.
2. **Simplicity:** No separate orchestrator service to deploy, monitor, or debug.
3. **Consistency:** The DAG is a simple constant; the chaining logic is ~50 lines.

The tradeoff is that the DAG is duplicated (WASM module inlines it; `@flowstudio/shared`
exports it). Changes to the pipeline structure must be updated in BOTH places.

### Why GCS for inter-worker data instead of SpacetimeDB tables

SpacetimeDB is in-memory. Storing video frames, audio files, and large JSON signal arrays
in SpacetimeDB tables would consume all available RAM. GCS provides cheap, durable, and
virtually unlimited storage for binary and large JSON data.

Signal data is stored in BOTH places: SpacetimeDB `signals` table (for real-time client
display) and GCS JSON files (for downstream worker consumption). Workers read from GCS
because it supports downloading large files as buffers, while SpacetimeDB table iteration
is not designed for bulk data transfer.

### Why HTTP polling for task discovery

Workers poll SpacetimeDB via `findAndClaimTask` every second using HTTP POST. Both task
claiming (reducer calls) and task discovery (SQL queries) happen over HTTP. Polling was
chosen because:
1. SpacetimeDB reducers cannot make outbound HTTP calls to workers.
2. Workers may crash and restart with different IDs -- push assignment would require a
   registry.
3. Polling is self-healing: a newly started worker automatically picks up pending tasks.
4. The 1-second poll interval is fast enough for a video processing pipeline where tasks
   take seconds to minutes.
5. The SpacetimeDB JS SDK does not yet support BSATN-based WebSocket subscriptions, so
   HTTP polling is the only viable mechanism for table reads in the current stack.

### Why no authentication layer yet

This is an explicit MVP decision documented as a "Known Architectural Gap." The project
prioritized pipeline correctness and completeness over auth. Adding auth requires:
1. SpacetimeDB Identity/Token integration (or a proxy auth layer)
2. Cloud Function authentication
3. Frontend login flow
4. Per-project access control in reducers

---

## 10. Adding a New Worker (Step-by-Step Guide)

### 1. Create the package directory

```bash
mkdir -p packages/workers/my-worker/src
```

### 2. Create `package.json`

```json
{
  "name": "@flowstudio/worker-my-worker",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "tsc",
    "dev": "tsx src/entrypoint.ts"
  },
  "dependencies": {
    "@flowstudio/shared": "workspace:*",
    "@flowstudio/worker-shared": "workspace:*"
  },
  "devDependencies": {
    "typescript": "^5.5.0",
    "tsx": "^4.0.0"
  }
}
```

### 3. Create `tsconfig.json`

```json
{
  "extends": "../../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"],
  "references": [
    { "path": "../../shared" },
    { "path": "../shared" }
  ]
}
```

### 4. Implement the worker class

```typescript
// packages/workers/my-worker/src/worker.ts
import { TaskType, SignalType } from '@flowstudio/shared';
import { BaseWorker, type TaskData, type TaskResult } from '@flowstudio/worker-shared';

export class MyWorker extends BaseWorker {
  readonly taskType = TaskType.MY_TASK_TYPE;

  async processTask(task: TaskData): Promise<TaskResult> {
    // 1. Download inputs from GCS
    // 2. Process them
    // 3. Upload outputs to GCS
    // 4. Return output asset IDs and signals

    return {
      outputAssetIds: [],
      signals: [],
    };
  }
}
```

### 5. Create the entrypoint

```typescript
// packages/workers/my-worker/src/entrypoint.ts
import { MyWorker } from './worker.js';

const worker = new MyWorker();
worker.start().catch((err) => {
  console.error('Worker failed to start:', err);
  process.exit(1);
});
```

### 6. Add the TaskType enum value

In `/home/user/FlowStudio/packages/shared/src/types/enums.ts`:

```typescript
export enum TaskType {
  // ... existing values ...
  MY_TASK_TYPE = 'MY_TASK_TYPE',
}
```

### 7. Add to the pipeline DAG

In **TWO places** (they must match):

**`packages/shared/src/constants.ts`:**
```typescript
export const TASK_CHAIN_DAG = {
  // ... existing ...
  [TaskType.SOME_UPSTREAM]: [TaskType.MY_TASK_TYPE], // or add to existing array
  [TaskType.MY_TASK_TYPE]: [TaskType.SOME_DOWNSTREAM],
};

export const TASK_DEPENDENCIES = {
  // ... existing ...
  [TaskType.MY_TASK_TYPE]: [TaskType.SOME_UPSTREAM],
};
```

**`packages/stdb-module/src/index.ts`:**
```typescript
const TASK_CHAIN_DAG = {
  // ... existing (uses raw strings, not enum) ...
  SOME_UPSTREAM: ['MY_TASK_TYPE'],
  MY_TASK_TYPE: ['SOME_DOWNSTREAM'],
};

const TASK_DEPENDENCIES = {
  // ... existing ...
  MY_TASK_TYPE: ['SOME_UPSTREAM'],
};
```

If the new worker is an initial task (no dependencies), also add it to `INITIAL_TASK_TYPES`
in `packages/shared/src/constants.ts`.

### 8. Add SignalType if producing new signal types

In `/home/user/FlowStudio/packages/shared/src/types/enums.ts`:

```typescript
export enum SignalType {
  // ... existing ...
  MY_SIGNAL = 'my_signal',
}
```

### 9. Add to Terraform workers list

In `/home/user/FlowStudio/infra/terraform/cloud-run.tf`:

```hcl
locals {
  workers = [
    // ... existing ...
    "my-worker",
  ]

  // If it needs FFmpeg:
  ffmpeg_workers = toset(["audio-extract", "video-sample", "render", "my-worker"])

  // If it needs more resources:
  heavy_workers = toset(["render", "video-understanding", "intent-graph", "my-worker"])

  // If it needs API keys:
  anthropic_workers = toset(["intent-graph", "narrative-planner", "edit-planner", "my-worker"])
}
```

### 10. Add to deploy scripts

In `/home/user/FlowStudio/infra/scripts/deploy-all.sh`, the script iterates `local.workers`
from Terraform, so it should pick up the new worker automatically if using the standard
deploy flow. Verify by running:

```bash
./infra/scripts/build-and-push.sh my-worker v1
```

### 11. Build and test

```bash
# Install deps
pnpm install

# Build shared packages first (required for tsc --noEmit)
pnpm --filter @flowstudio/shared run build
pnpm --filter @flowstudio/worker-shared run build

# Typecheck everything
pnpm -r exec tsc --noEmit

# Build the new worker
pnpm --filter @flowstudio/worker-my-worker run build

# Build Docker image
./infra/scripts/build-and-push.sh my-worker v1
```

---

## 11. Common Pitfalls

### GCS path mismatches between writers and readers

**Root cause:** Worker A writes to `projects/{id}/signals/foo.json`, Worker B reads from
`projects/{id}/signals/bar.json`. No compile-time check catches this.

**Prevention:** Always verify new GCS paths against Section 5 (GCS Path Contract Map).
Run the grep commands from Section 5d after any change.

**Historical bugs:** C1 (frame asset ID format mismatch), C2 (cursor_typing.json vs
separate files), C3 (all_signals.json vs individual files).

### Assuming signal data exists (it may not for optional inputs)

**Root cause:** `cursor-processor` and `typing-detector` gracefully return empty signals
when no data exists. But downstream workers (`interaction-pattern`) may crash if they
assume signal files exist.

**Prevention:** Always wrap GCS downloads in try/catch when reading signal files that may
not exist. Check `interaction-pattern/src/worker.ts:26-33` for the pattern.

### Greedy regex for JSON extraction from LLM responses

**Root cause:** LLM responses contain JSON embedded in explanatory text. A greedy regex
like `/\[[\s\S]*\]/` captures everything from the first `[` to the LAST `]`, including
garbage text after the JSON.

**Prevention:** Use the bracket-counting `extractJsonArray()` function. It is currently
duplicated in 4 worker files (`video-understanding`, `intent-graph`, `narrative-planner`,
`edit-planner`). A future improvement would extract this to `@flowstudio/worker-shared`.

```typescript
function extractJsonArray(text: string): string | null {
  const start = text.indexOf('[');
  if (start === -1) return null;
  let depth = 0;
  for (let i = start; i < text.length; i++) {
    if (text[i] === '[') depth++;
    else if (text[i] === ']') depth--;
    if (depth === 0) return text.slice(start, i + 1);
  }
  return null;
}
```

### Silent catch blocks that hide failures

**Root cause:** A `catch {}` block that does nothing causes the task to complete
successfully with empty/partial results instead of failing and retrying.

**Prevention:** Always either re-throw, log a warning, or return a deliberate empty result
in catch blocks. If the data is required, throw. If optional, log a warning.

**Historical bugs:** H5 (LLM JSON parse failures silently produced empty signals -- now
throw so tasks retry), H6 (same pattern).

### Forgetting to add new env vars to Docker build args

**Root cause:** Next.js `NEXT_PUBLIC_*` variables are inlined at build time. If
`NEXT_PUBLIC_UPLOAD_FUNCTION_URL` is missing from `docker build --build-arg`, the client
builds successfully but uploads fail at runtime.

**Prevention:** Check three places when adding a `NEXT_PUBLIC_*` variable:
1. `infra/docker/Dockerfile.client` (ARG + ENV lines)
2. `infra/scripts/build-and-push.sh` (--build-arg flag)
3. `infra/terraform/cloud-run.tf` (client container env block)

**Historical bugs:** C5 (missing `NEXT_PUBLIC_UPLOAD_FUNCTION_URL`).

### Forgetting to declare Terraform variables

**Root cause:** Using `var.upload_function_url` in `cloud-run.tf` without declaring it in
`variables.tf` causes `terraform validate` to fail.

**Prevention:** Always run `cd infra/terraform && terraform validate` after Terraform
changes.

**Historical bugs:** T1 (missing `upload_function_url` variable).

### Testing with `tsc --noEmit` requires building shared packages first

**Root cause:** Worker packages reference `@flowstudio/shared` and
`@flowstudio/worker-shared` via TypeScript project references. If these aren't built,
`tsc --noEmit` fails with "cannot find module" errors.

**Prevention:** Always build shared packages first:

```bash
pnpm --filter @flowstudio/shared run build
pnpm --filter @flowstudio/worker-shared run build
pnpm -r exec tsc --noEmit
```

### DAG changes require updating TWO files

**Root cause:** `TASK_CHAIN_DAG` and `TASK_DEPENDENCIES` are defined in both
`packages/shared/src/constants.ts` (typed, using enums) and
`packages/stdb-module/src/index.ts` (raw strings, WASM-compatible). These must be kept
in sync manually.

**Prevention:** After any DAG change, search for both copies and verify they match:

```bash
grep -A 20 'TASK_CHAIN_DAG' packages/shared/src/constants.ts
grep -A 20 'TASK_CHAIN_DAG' packages/stdb-module/src/index.ts
```

### Cloud Function CORS wildcard

**Current state:** The Cloud Function sets `Access-Control-Allow-Origin: *`. This means
any website can request signed upload URLs for any project ID.

**Fix before production:** Restrict to the frontend domain:
```javascript
res.set('Access-Control-Allow-Origin', 'https://app.flowstudio.ai');
```

### Hardcoded 2-second frame interval

Both `video-understanding` and `ui-change-detector` assume frames were sampled at 2-second
intervals for timestamp calculation (`i * 2000`). If `sampleIntervalSecs` is changed in
`video-sample` config, these workers will produce incorrect timestamps.

**Fix:** Propagate the actual sample interval through the task config or store it as
metadata alongside the frames.
