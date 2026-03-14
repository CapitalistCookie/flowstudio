/**
 * FlowStudio SpacetimeDB v2 Module
 * Rewritten for SpacetimeDB SDK v2.0.4 API
 */

import { table, t, schema } from "spacetimedb/server";
import { ScheduleAt } from "spacetimedb";

// Constants
const MAX_TASK_RETRIES = 3;
const STALE_TASK_THRESHOLD_MS = BigInt(5 * 60 * 1000);
const WATCHDOG_INTERVAL_SECS = 30;

const TASK_CHAIN_DAG: Record<string, string[]> = {
  AUDIO_EXTRACT: ["SPEECH_TRANSCRIPTION"],
  VIDEO_SAMPLE: ["VIDEO_UNDERSTANDING", "UI_CHANGE_DETECT"],
  CURSOR_PROCESS: ["INTERACTION_PATTERN"],
  TYPING_DETECT: ["INTERACTION_PATTERN"],
  SPEECH_TRANSCRIPTION: ["INTENT_GRAPH"],
  VIDEO_UNDERSTANDING: ["INTENT_GRAPH"],
  UI_CHANGE_DETECT: ["INTENT_GRAPH"],
  INTERACTION_PATTERN: ["INTENT_GRAPH"],
  INTENT_GRAPH: ["NARRATIVE_PLAN"],
  NARRATIVE_PLAN: ["EDIT_PLAN"],
  EDIT_PLAN: ["TIMELINE_BUILD"],
  TIMELINE_BUILD: [],
  RENDER: [],
};

const TASK_DEPENDENCIES: Record<string, string[]> = {
  AUDIO_EXTRACT: [],
  VIDEO_SAMPLE: [],
  CURSOR_PROCESS: [],
  TYPING_DETECT: [],
  SPEECH_TRANSCRIPTION: ["AUDIO_EXTRACT"],
  VIDEO_UNDERSTANDING: ["VIDEO_SAMPLE"],
  UI_CHANGE_DETECT: ["VIDEO_SAMPLE"],
  INTERACTION_PATTERN: ["CURSOR_PROCESS", "TYPING_DETECT"],
  INTENT_GRAPH: ["SPEECH_TRANSCRIPTION", "VIDEO_UNDERSTANDING", "UI_CHANGE_DETECT", "INTERACTION_PATTERN"],
  NARRATIVE_PLAN: ["INTENT_GRAPH"],
  EDIT_PLAN: ["NARRATIVE_PLAN"],
  TIMELINE_BUILD: ["EDIT_PLAN"],
  RENDER: ["TIMELINE_BUILD"],
};

// Phase 1.1: Remove mutable global state — use ctx.timestamp + Math.random()
function generateId(ctx: any): string {
  return ctx.timestamp.microsSinceUnixEpoch.toString(36) + '-' + Math.random().toString(36).slice(2, 10);
}

// Phase 1.2: Replace Date.now() with ctx.timestamp
function nowMs(ctx: any): bigint {
  return ctx.timestamp.microsSinceUnixEpoch / 1000n;
}

// Tables — Phase 2.1: Add BTree indexes
const projects = table({ name: "projects", public: true }, {
  id: t.string().primaryKey(),
  name: t.string(),
  status: t.string(),
  createdAt: t.u64(),
  updatedAt: t.u64(),
  ownerId: t.string(),
  metadata: t.string(),
  starred: t.bool(),
  folderId: t.string(),
}, {
  indexes: [
    { name: 'byOwnerId', algorithm: 'btree' as const, columns: ['ownerId'] },
  ],
});

const folders = table({ name: "folders", public: true }, {
  id: t.string().primaryKey(),
  name: t.string(),
  ownerId: t.string(),
  color: t.string(),
  sortOrder: t.i32(),
  createdAt: t.u64(),
  updatedAt: t.u64(),
}, {
  indexes: [
    { name: 'byOwnerId', algorithm: 'btree' as const, columns: ['ownerId'] },
  ],
});

const assets = table({ name: "assets", public: true }, {
  id: t.string().primaryKey(),
  projectId: t.string(),
  assetType: t.string(),
  gcsPath: t.string(),
  sizeBytes: t.u64(),
  mimeType: t.string(),
  durationMs: t.u64(),
  createdAt: t.u64(),
  metadata: t.string(),
}, {
  indexes: [
    { name: 'byProjectId', algorithm: 'btree' as const, columns: ['projectId'] },
  ],
});

const tasks = table({ name: "tasks", public: true }, {
  id: t.string().primaryKey(),
  projectId: t.string(),
  taskType: t.string(),
  status: t.string(),
  workerId: t.string(),
  inputAssetIds: t.string(),
  outputAssetIds: t.string(),
  config: t.string(),
  createdAt: t.u64(),
  claimedAt: t.u64(),
  completedAt: t.u64(),
  failureReason: t.string(),
  retryCount: t.i32(),
  maxRetries: t.i32(),
}, {
  indexes: [
    { name: 'byTaskTypeStatus', algorithm: 'btree' as const, columns: ['taskType', 'status'] },
    { name: 'byProjectId', algorithm: 'btree' as const, columns: ['projectId'] },
  ],
});

const signals = table({ name: "signals", public: true }, {
  id: t.string().primaryKey(),
  projectId: t.string(),
  taskId: t.string(),
  signalType: t.string(),
  timestampMs: t.u64(),
  durationMs: t.u64(),
  confidence: t.f64(),
  payload: t.string(),
  createdAt: t.u64(),
}, {
  indexes: [
    { name: 'byProjectId', algorithm: 'btree' as const, columns: ['projectId'] },
  ],
});

// Phase 2.5: Make internal tables private
const projectState = table({ name: "project_state", public: false }, {
  projectId: t.string().primaryKey(),
  completedTasks: t.string(),
  totalTasks: t.i32(),
  completedCount: t.i32(),
  currentPhase: t.string(),
  lastUpdated: t.u64(),
});

const workerConfigs = table({ name: "worker_configs", public: false }, {
  workerId: t.string().primaryKey(),
  workerType: t.string(),
  lastHeartbeat: t.u64(),
  isActive: t.bool(),
  concurrency: t.i32(),
  metadata: t.string(),
});

// Phase 2.4: Watchdog schedule table
const watchdogSchedule = table(
  { name: 'watchdog_schedule', scheduled: (): any => runWatchdog },
  {
    scheduled_id: t.u64().primaryKey().autoInc(),
    scheduled_at: t.scheduleAt(),
  }
);

// Schema
const stdb = (schema as any)({
  projects,
  folders,
  assets,
  tasks,
  signals,
  projectState,
  workerConfigs,
  watchdogSchedule,
});

// Phase 2.3: Lifecycle reducers
export const init = stdb.init((ctx: any) => {
  console.log('[FlowStudio] Module initialized');
  // Seed watchdog to run every 30 seconds
  ctx.db.watchdogSchedule.insert({
    scheduled_id: 0n,
    scheduled_at: ScheduleAt.interval(BigInt(WATCHDOG_INTERVAL_SECS) * 1_000_000n),
  });
});

export const onConnect = stdb.clientConnected((ctx: any) => {
  console.log(`[FlowStudio] Client connected: ${ctx.sender}`);
});

export const onDisconnect = stdb.clientDisconnected((ctx: any) => {
  console.log(`[FlowStudio] Client disconnected: ${ctx.sender}`);
  // TODO: Mark worker inactive and release stale claimed tasks.
  // Currently, workers do not store their identity mapping, so we cannot directly
  // match a disconnected client identity to a workerConfigs entry. The watchdog
  // reducer (runWatchdog) handles stale claimed tasks by checking all tasks with
  // claimedAt timestamps older than STALE_TASK_THRESHOLD_MS and resets them to pending.
  // This design ensures cleanup happens consistently even if clientDisconnected is not
  // called (e.g., network abrupt failure without explicit disconnect).
});

// Phase 2.4: Watchdog reducer
export const runWatchdog = stdb.reducer(
  { arg: watchdogSchedule.rowType },
  (ctx: any, { arg }: any) => {
    console.log('[runWatchdog] checking for stale tasks');
    const now = nowMs(ctx);
    let resetCount = 0;
    // Iterate all tasks and check for stale claimed ones
    for (const task of ctx.db.tasks.iter()) {
      if (task.status === 'claimed' && task.claimedAt > 0n) {
        const elapsed = now - task.claimedAt;
        if (elapsed > STALE_TASK_THRESHOLD_MS) {
          if (task.retryCount >= (task.maxRetries || MAX_TASK_RETRIES)) {
            ctx.db.tasks.id.update({ ...task, status: 'failed', failureReason: 'Watchdog: exceeded max retries after stale claim' });
          } else {
            ctx.db.tasks.id.update({ ...task, status: 'pending', workerId: '', claimedAt: 0n, retryCount: task.retryCount + 1 });
            resetCount++;
          }
        }
      }
    }
    if (resetCount > 0) {
      console.log(`[Watchdog] Reset ${resetCount} stale tasks`);
    }
  }
);

// Reducers — Phase 2.6: All reducers include console.log
export const createProject = stdb.reducer(
  "createProject",
  { name: t.string(), ownerId: t.string(), metadata: t.string() },
  (ctx: any, args: any) => {
    console.log(`[createProject] name=${args.name} ownerId=${args.ownerId}`);
    const now = nowMs(ctx);
    const id = generateId(ctx);
    ctx.db.projects.insert({ id, name: args.name, status: "created", createdAt: now, updatedAt: now, ownerId: args.ownerId, metadata: args.metadata, starred: false, folderId: "" });
    ctx.db.projectState.insert({ projectId: id, completedTasks: "[]", totalTasks: 0, completedCount: 0, currentPhase: "created", lastUpdated: now });
  },
);

export const createAsset = stdb.reducer(
  "createAsset",
  { projectId: t.string(), assetType: t.string(), gcsPath: t.string(), sizeBytes: t.u64(), mimeType: t.string(), durationMs: t.u64(), metadata: t.string() },
  (ctx: any, args: any) => {
    console.log(`[createAsset] projectId=${args.projectId} assetType=${args.assetType}`);
    const id = generateId(ctx);
    ctx.db.assets.insert({ id, projectId: args.projectId, assetType: args.assetType, gcsPath: args.gcsPath, sizeBytes: args.sizeBytes, mimeType: args.mimeType, durationMs: args.durationMs, createdAt: nowMs(ctx), metadata: args.metadata });
  },
);

export const createTask = stdb.reducer(
  "createTask",
  { projectId: t.string(), taskType: t.string(), inputAssetIds: t.string(), config: t.string(), maxRetries: t.i32() },
  (ctx: any, args: any) => {
    console.log(`[createTask] projectId=${args.projectId} taskType=${args.taskType}`);
    const id = generateId(ctx);
    ctx.db.tasks.insert({ id, projectId: args.projectId, taskType: args.taskType, status: "pending", workerId: "", inputAssetIds: args.inputAssetIds, outputAssetIds: "[]", config: args.config, createdAt: nowMs(ctx), claimedAt: 0n, completedAt: 0n, failureReason: "", retryCount: 0, maxRetries: args.maxRetries });
  },
);

export const claimTask = stdb.reducer(
  "claimTask",
  { taskId: t.string(), workerId: t.string() },
  (ctx: any, args: any) => {
    console.log(`[claimTask] taskId=${args.taskId} workerId=${args.workerId}`);
    const task = ctx.db.tasks.id.find(args.taskId);
    if (!task) throw new Error("claimTask: task not found");
    if (task.status !== "pending") throw new Error("claimTask: task is " + task.status);
    ctx.db.tasks.id.update({ ...task, status: "claimed", workerId: args.workerId, claimedAt: nowMs(ctx) });
  },
);

// Phase 2.2: Use index for findAndClaimTask
export const findAndClaimTask = stdb.reducer(
  "findAndClaimTask",
  { taskType: t.string(), workerId: t.string() },
  (ctx: any, args: any) => {
    console.log(`[findAndClaimTask] taskType=${args.taskType} workerId=${args.workerId}`);
    let found: any = null;
    for (const task of ctx.db.tasks.byTaskTypeStatus.filter([args.taskType, 'pending'])) {
      found = task;
      break;
    }
    if (!found) throw new Error("findAndClaimTask: no pending " + args.taskType + " tasks");
    ctx.db.tasks.id.update({ ...found, status: "claimed", workerId: args.workerId, claimedAt: nowMs(ctx) });
  },
);

// Phase 2.2: Use byProjectId index in completeTask dependency scans
export const completeTask = stdb.reducer(
  "completeTask",
  { taskId: t.string(), outputAssetIds: t.string() },
  (ctx: any, args: any) => {
    console.log(`[completeTask] taskId=${args.taskId}`);
    const now = nowMs(ctx);
    const task = ctx.db.tasks.id.find(args.taskId);
    if (!task) throw new Error("completeTask: task not found");
    ctx.db.tasks.id.update({ ...task, status: "completed", outputAssetIds: args.outputAssetIds, completedAt: now });

    const projectId = task.projectId;
    const completedType = task.taskType;

    const state = ctx.db.projectState.projectId.find(projectId);
    if (state) {
      let completed: string[] = [];
      try { completed = JSON.parse(state.completedTasks); } catch {}
      if (!completed.includes(completedType)) completed.push(completedType);
      ctx.db.projectState.projectId.update({ ...state, completedTasks: JSON.stringify(completed), completedCount: completed.length, lastUpdated: now });
    }

    const downstreamTypes = TASK_CHAIN_DAG[completedType];
    if (!downstreamTypes || downstreamTypes.length === 0) {
      const freshState = ctx.db.projectState.projectId.find(projectId);
      if (freshState) ctx.db.projectState.projectId.update({ ...freshState, currentPhase: "ready", lastUpdated: now });
      const project = ctx.db.projects.id.find(projectId);
      if (project) ctx.db.projects.id.update({ ...project, status: "ready", updatedAt: now });
      return;
    }

    const completedTypesSet = new Set<string>();
    const existingTaskTypes = new Set<string>();
    for (const row of ctx.db.tasks.byProjectId.filter(projectId)) {
      if (row.status === "completed") completedTypesSet.add(row.taskType);
      existingTaskTypes.add(row.taskType);
    }
    completedTypesSet.add(completedType);

    for (const dsType of downstreamTypes) {
      if (existingTaskTypes.has(dsType)) continue;
      const deps = TASK_DEPENDENCIES[dsType];
      if (!deps) continue;
      if (!deps.every((dep) => completedTypesSet.has(dep))) continue;

      const upstreamAssetIds: string[] = [];
      for (const row of ctx.db.tasks.byProjectId.filter(projectId)) {
        if (row.status === "completed" && deps.includes(row.taskType)) {
          try { const outputs = JSON.parse(row.outputAssetIds); if (Array.isArray(outputs)) upstreamAssetIds.push(...outputs); } catch {}
        }
      }

      ctx.db.tasks.insert({ id: generateId(ctx), projectId, taskType: dsType, status: "pending", workerId: "", inputAssetIds: JSON.stringify(upstreamAssetIds), outputAssetIds: "[]", config: "{}", createdAt: now, claimedAt: 0n, completedAt: 0n, failureReason: "", retryCount: 0, maxRetries: MAX_TASK_RETRIES });
    }
  },
);

export const failTask = stdb.reducer(
  "failTask",
  { taskId: t.string(), failureReason: t.string() },
  (ctx: any, args: any) => {
    console.log(`[failTask] taskId=${args.taskId} reason=${args.failureReason}`);
    const now = nowMs(ctx);
    const task = ctx.db.tasks.id.find(args.taskId);
    if (!task) throw new Error("failTask: task not found");

    const currentRetry = task.retryCount || 0;
    const maxRetries = task.maxRetries || MAX_TASK_RETRIES;

    ctx.db.tasks.id.update({ ...task, status: "failed", failureReason: args.failureReason, completedAt: now });

    if (currentRetry < maxRetries) {
      ctx.db.tasks.insert({ id: generateId(ctx), projectId: task.projectId, taskType: task.taskType, status: "pending", workerId: "", inputAssetIds: task.inputAssetIds, outputAssetIds: "[]", config: task.config, createdAt: now, claimedAt: 0n, completedAt: 0n, failureReason: "", retryCount: currentRetry + 1, maxRetries });
    } else {
      const state = ctx.db.projectState.projectId.find(task.projectId);
      if (state) ctx.db.projectState.projectId.update({ ...state, currentPhase: "failed", lastUpdated: now });
    }
  },
);

export const writeSignal = stdb.reducer(
  "writeSignal",
  { projectId: t.string(), taskId: t.string(), signalType: t.string(), timestampMs: t.u64(), durationMs: t.u64(), confidence: t.f64(), payload: t.string() },
  (ctx: any, args: any) => {
    console.log(`[writeSignal] projectId=${args.projectId} taskId=${args.taskId} signalType=${args.signalType}`);
    ctx.db.signals.insert({ id: generateId(ctx), projectId: args.projectId, taskId: args.taskId, signalType: args.signalType, timestampMs: args.timestampMs, durationMs: args.durationMs, confidence: args.confidence, payload: args.payload, createdAt: nowMs(ctx) });
  },
);

export const ingestInteractionBatch = stdb.reducer(
  "ingestInteractionBatch",
  { projectId: t.string(), taskId: t.string(), signalType: t.string(), batchJson: t.string() },
  (ctx: any, args: any) => {
    console.log(`[ingestInteractionBatch] projectId=${args.projectId} signalType=${args.signalType}`);
    const now = nowMs(ctx);
    let batch: any[];
    try { batch = JSON.parse(args.batchJson); } catch { throw new Error("invalid batchJson"); }
    if (batch.length > 1000) throw new Error("batch too large");
    console.log(`[ingestInteractionBatch] processing ${batch.length} items`);
    for (const item of batch) {
      ctx.db.signals.insert({ id: generateId(ctx), projectId: args.projectId, taskId: args.taskId, signalType: args.signalType, timestampMs: item.timestampMs, durationMs: item.durationMs, confidence: item.confidence, payload: item.payload, createdAt: now });
    }
  },
);

export const updateProjectState = stdb.reducer(
  "updateProjectState",
  { projectId: t.string(), currentPhase: t.string(), status: t.string() },
  (ctx: any, args: any) => {
    console.log(`[updateProjectState] projectId=${args.projectId} phase=${args.currentPhase} status=${args.status}`);
    const now = nowMs(ctx);
    const state = ctx.db.projectState.projectId.find(args.projectId);
    if (!state) throw new Error("no state for project " + args.projectId);
    ctx.db.projectState.projectId.update({ ...state, currentPhase: args.currentPhase, lastUpdated: now });
    const project = ctx.db.projects.id.find(args.projectId);
    if (project) ctx.db.projects.id.update({ ...project, status: args.status, updatedAt: now });
  },
);

export const updateWorkerConfig = stdb.reducer(
  "updateWorkerConfig",
  { workerId: t.string(), workerType: t.string(), isActive: t.bool(), concurrency: t.i32(), metadata: t.string() },
  (ctx: any, args: any) => {
    console.log(`[updateWorkerConfig] workerId=${args.workerId} workerType=${args.workerType} isActive=${args.isActive}`);
    const now = nowMs(ctx);
    const existing = ctx.db.workerConfigs.workerId.find(args.workerId);
    if (existing) {
      ctx.db.workerConfigs.workerId.update({ ...existing, workerType: args.workerType, lastHeartbeat: now, isActive: args.isActive, concurrency: args.concurrency, metadata: args.metadata });
    } else {
      ctx.db.workerConfigs.insert({ workerId: args.workerId, workerType: args.workerType, lastHeartbeat: now, isActive: args.isActive, concurrency: args.concurrency, metadata: args.metadata });
    }
  },
);

export const toggleProjectStar = stdb.reducer(
  "toggleProjectStar",
  { projectId: t.string() },
  (ctx: any, args: any) => {
    console.log(`[toggleProjectStar] projectId=${args.projectId}`);
    const project = ctx.db.projects.id.find(args.projectId);
    if (!project) throw new Error("toggleProjectStar: project not found");
    ctx.db.projects.id.update({ ...project, starred: !project.starred, updatedAt: nowMs(ctx) });
  },
);

export const createFolder = stdb.reducer(
  "createFolder",
  { name: t.string(), ownerId: t.string(), color: t.string(), sortOrder: t.i32() },
  (ctx: any, args: any) => {
    console.log(`[createFolder] name=${args.name} ownerId=${args.ownerId}`);
    const now = nowMs(ctx);
    const id = generateId(ctx);
    ctx.db.folders.insert({ id, name: args.name, ownerId: args.ownerId, color: args.color, sortOrder: args.sortOrder, createdAt: now, updatedAt: now });
  },
);

export const renameFolder = stdb.reducer(
  "renameFolder",
  { folderId: t.string(), name: t.string() },
  (ctx: any, args: any) => {
    console.log(`[renameFolder] folderId=${args.folderId} name=${args.name}`);
    const folder = ctx.db.folders.id.find(args.folderId);
    if (!folder) throw new Error("renameFolder: folder not found");
    ctx.db.folders.id.update({ ...folder, name: args.name, updatedAt: nowMs(ctx) });
  },
);

export const deleteFolder = stdb.reducer(
  "deleteFolder",
  { folderId: t.string() },
  (ctx: any, args: any) => {
    console.log(`[deleteFolder] folderId=${args.folderId}`);
    const folder = ctx.db.folders.id.find(args.folderId);
    if (!folder) throw new Error("deleteFolder: folder not found");
    const now = nowMs(ctx);
    for (const project of ctx.db.projects.iter()) {
      if (project.folderId === args.folderId) {
        ctx.db.projects.id.update({ ...project, folderId: "", updatedAt: now });
      }
    }
    ctx.db.folders.id.delete(args.folderId);
  },
);

export const moveProjectToFolder = stdb.reducer(
  "moveProjectToFolder",
  { projectId: t.string(), folderId: t.string() },
  (ctx: any, args: any) => {
    console.log(`[moveProjectToFolder] projectId=${args.projectId} folderId=${args.folderId}`);
    const project = ctx.db.projects.id.find(args.projectId);
    if (!project) throw new Error("moveProjectToFolder: project not found");
    ctx.db.projects.id.update({ ...project, folderId: args.folderId, updatedAt: nowMs(ctx) });
  },
);

export default stdb;
