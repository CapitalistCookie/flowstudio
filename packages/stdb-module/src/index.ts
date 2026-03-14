/**
 * FlowStudio SpacetimeDB v2 Module
 * Rewritten for SpacetimeDB SDK v2.0.4 API
 */

import { table, t, schema } from "spacetimedb/server";

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
  TIMELINE_BUILD: ["RENDER"],
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

let idCounter = 0;
function generateId(ctx?: any): string {
  idCounter++;
  const rand = ctx && ctx.random ? ctx.random() : 0.5; return Date.now().toString(36) + "-" + idCounter.toString(36) + "-" + rand.toString(36).slice(2, 10);
}

function nowMs(): bigint {
  return BigInt(Date.now());
}

// Tables
const projects = table({ name: "projects", public: true }, {
  id: t.string().primaryKey(),
  name: t.string(),
  status: t.string(),
  createdAt: t.u64(),
  updatedAt: t.u64(),
  ownerId: t.string(),
  metadata: t.string(),
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
});

const projectState = table({ name: "project_state", public: true }, {
  projectId: t.string().primaryKey(),
  completedTasks: t.string(),
  totalTasks: t.i32(),
  completedCount: t.i32(),
  currentPhase: t.string(),
  lastUpdated: t.u64(),
});

const workerConfigs = table({ name: "worker_configs", public: true }, {
  workerId: t.string().primaryKey(),
  workerType: t.string(),
  lastHeartbeat: t.u64(),
  isActive: t.bool(),
  concurrency: t.i32(),
  metadata: t.string(),
});

// Schema
const stdb = (schema as any)({
  projects,
  assets,
  tasks,
  signals,
  projectState,
  workerConfigs,
});

// Reducers
export const createProject = stdb.reducer(
  "createProject",
  { name: t.string(), ownerId: t.string(), metadata: t.string() },
  (ctx: any, args: any) => {
    const now = nowMs();
    const id = generateId(ctx);
    ctx.db.projects.insert({ id, name: args.name, status: "created", createdAt: now, updatedAt: now, ownerId: args.ownerId, metadata: args.metadata });
    ctx.db.projectState.insert({ projectId: id, completedTasks: "[]", totalTasks: 0, completedCount: 0, currentPhase: "created", lastUpdated: now });
  },
);

export const createAsset = stdb.reducer(
  "createAsset",
  { projectId: t.string(), assetType: t.string(), gcsPath: t.string(), sizeBytes: t.u64(), mimeType: t.string(), durationMs: t.u64(), metadata: t.string() },
  (ctx: any, args: any) => {
    const id = generateId(ctx);
    ctx.db.assets.insert({ id, projectId: args.projectId, assetType: args.assetType, gcsPath: args.gcsPath, sizeBytes: args.sizeBytes, mimeType: args.mimeType, durationMs: args.durationMs, createdAt: nowMs(), metadata: args.metadata });
  },
);

export const createTask = stdb.reducer(
  "createTask",
  { projectId: t.string(), taskType: t.string(), inputAssetIds: t.string(), config: t.string(), maxRetries: t.i32() },
  (ctx: any, args: any) => {
    const id = generateId(ctx);
    ctx.db.tasks.insert({ id, projectId: args.projectId, taskType: args.taskType, status: "pending", workerId: "", inputAssetIds: args.inputAssetIds, outputAssetIds: "[]", config: args.config, createdAt: nowMs(), claimedAt: 0n, completedAt: 0n, failureReason: "", retryCount: 0, maxRetries: args.maxRetries });
  },
);

export const claimTask = stdb.reducer(
  "claimTask",
  { taskId: t.string(), workerId: t.string() },
  (ctx: any, args: any) => {
    const task = ctx.db.tasks.id.find(args.taskId);
    if (!task) throw new Error("claimTask: task not found");
    if (task.status !== "pending") throw new Error("claimTask: task is " + task.status);
    ctx.db.tasks.id.update({ ...task, status: "claimed", workerId: args.workerId, claimedAt: nowMs() });
  },
);

export const findAndClaimTask = stdb.reducer(
  "findAndClaimTask",
  { taskType: t.string(), workerId: t.string() },
  (ctx: any, args: any) => {
    let found: any = null;
    for (const task of ctx.db.tasks.iter()) {
      if (task.taskType === args.taskType && task.status === "pending") {
        found = task;
        break;
      }
    }
    if (!found) throw new Error("findAndClaimTask: no pending " + args.taskType + " tasks");
    ctx.db.tasks.id.update({ ...found, status: "claimed", workerId: args.workerId, claimedAt: nowMs() });
  },
);

export const completeTask = stdb.reducer(
  "completeTask",
  { taskId: t.string(), outputAssetIds: t.string() },
  (ctx: any, args: any) => {
    const now = nowMs();
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
      if (state) ctx.db.projectState.projectId.update({ ...state, currentPhase: "ready", lastUpdated: now });
      const project = ctx.db.projects.id.find(projectId);
      if (project) ctx.db.projects.id.update({ ...project, status: "ready", updatedAt: now });
      return;
    }

    const completedTypesSet = new Set<string>();
    const existingTaskTypes = new Set<string>();
    for (const row of ctx.db.tasks.iter()) {
      if (row.projectId === projectId) {
        if (row.status === "completed") completedTypesSet.add(row.taskType);
        existingTaskTypes.add(row.taskType);
      }
    }
    completedTypesSet.add(completedType);

    for (const dsType of downstreamTypes) {
      if (existingTaskTypes.has(dsType)) continue;
      const deps = TASK_DEPENDENCIES[dsType];
      if (!deps) continue;
      if (!deps.every((dep) => completedTypesSet.has(dep))) continue;

      const upstreamAssetIds: string[] = [];
      for (const row of ctx.db.tasks.iter()) {
        if (row.projectId === projectId && row.status === "completed" && deps.includes(row.taskType)) {
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
    const now = nowMs();
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
    ctx.db.signals.insert({ id: generateId(ctx), projectId: args.projectId, taskId: args.taskId, signalType: args.signalType, timestampMs: args.timestampMs, durationMs: args.durationMs, confidence: args.confidence, payload: args.payload, createdAt: nowMs() });
  },
);

export const ingestInteractionBatch = stdb.reducer(
  "ingestInteractionBatch",
  { projectId: t.string(), taskId: t.string(), signalType: t.string(), batchJson: t.string() },
  (ctx: any, args: any) => {
    const now = nowMs();
    let batch: any[];
    try { batch = JSON.parse(args.batchJson); } catch { throw new Error("invalid batchJson"); }
    if (batch.length > 1000) throw new Error("batch too large");
    for (const item of batch) {
      ctx.db.signals.insert({ id: generateId(ctx), projectId: args.projectId, taskId: args.taskId, signalType: args.signalType, timestampMs: item.timestampMs, durationMs: item.durationMs, confidence: item.confidence, payload: item.payload, createdAt: now });
    }
  },
);

export const updateProjectState = stdb.reducer(
  "updateProjectState",
  { projectId: t.string(), currentPhase: t.string(), status: t.string() },
  (ctx: any, args: any) => {
    const now = nowMs();
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
    const now = nowMs();
    const existing = ctx.db.workerConfigs.workerId.find(args.workerId);
    if (existing) {
      ctx.db.workerConfigs.workerId.update({ ...existing, workerType: args.workerType, lastHeartbeat: now, isActive: args.isActive, concurrency: args.concurrency, metadata: args.metadata });
    } else {
      ctx.db.workerConfigs.insert({ workerId: args.workerId, workerType: args.workerType, lastHeartbeat: now, isActive: args.isActive, concurrency: args.concurrency, metadata: args.metadata });
    }
  },
);

export default stdb;
