/**
 * FlowStudio SpacetimeDB v2 Module
 * Rewritten for SpacetimeDB SDK v2.0.4 API
 */

import { table, t, schema } from "spacetimedb/server";
import { ScheduleAt } from "spacetimedb";

// Constants
const WORKER_SECRET = 'UGgMWej2dv3KJfQWiKFLWXyCC0JSY33ihxTRj0cG82E='; // Managed via Secret Manager: flowstudio-stdb-worker-secret
const MAX_TASK_RETRIES = 3;
const STALE_TASK_THRESHOLD_MS = BigInt(5 * 60 * 1000);
const WATCHDOG_INTERVAL_SECS = 30;

// Helper: get tasks by projectId, using index if available, falling back to iter()
function getTasksByProjectId(ctx: any, projectId: string) {
  if (ctx.db.tasks.byProjectId) {
    return [...ctx.db.tasks.byProjectId.filter(projectId)];
  }
  const results: any[] = [];
  for (const task of ctx.db.tasks.iter()) {
    if (task.projectId === projectId) results.push(task);
  }
  return results;
}

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

// Phase 1.1: Remove mutable global state — use ctx.timestamp + ctx.random()
function generateId(ctx: any): string {
  return ctx.timestamp.microsSinceUnixEpoch.toString(36) + '-' + ctx.random().toString(36).slice(2, 10);
}

// Phase 1.2: Replace Date.now() with ctx.timestamp
function nowMs(ctx: any): bigint {
  return ctx.timestamp.microsSinceUnixEpoch / 1000n;
}

// ─── Authorization helpers ──────────────────────────────────────────

function getSenderHex(ctx: any): string {
  return ctx.sender.toHexString ? ctx.sender.toHexString() : String(ctx.sender);
}

function getCallerUid(ctx: any): string | null {
  const mapping = ctx.db.userIdentities.identity.find(getSenderHex(ctx));
  return mapping ? mapping.firebaseUid : null;
}

function assertProjectOwnership(ctx: any, projectId: string): void {
  const callerUid = getCallerUid(ctx);
  if (!callerUid) throw new Error('Identity not registered');
  if (callerUid.startsWith('worker:')) return;
  const project = ctx.db.projects.id.find(projectId);
  if (!project) throw new Error('Project not found');
  if (callerUid !== project.ownerId) throw new Error('Permission denied');
}

const ROLE_LEVEL: Record<string, number> = { viewer: 1, editor: 2, owner: 3 };

function assertProjectAccess(ctx: any, projectId: string, requiredRole: string): void {
  const callerUid = getCallerUid(ctx);
  if (!callerUid) throw new Error('Identity not registered');
  if (callerUid.startsWith('worker:')) return; // Worker bypass

  const project = ctx.db.projects.id.find(projectId);
  if (!project) throw new Error('Project not found');

  // Check collaborator table first
  let found = false;
  for (const collab of ctx.db.projectCollaborators.iter()) {
    if (collab.projectId === projectId && collab.firebaseUid === callerUid) {
      if ((ROLE_LEVEL[collab.role] || 0) >= (ROLE_LEVEL[requiredRole] || 0)) {
        return; // Authorized
      }
      found = true;
      break;
    }
  }

  // Backward compat: if no collaborator rows exist for this project, treat ownerId as implicit owner
  if (!found) {
    let hasAnyCollabs = false;
    for (const collab of ctx.db.projectCollaborators.iter()) {
      if (collab.projectId === projectId) { hasAnyCollabs = true; break; }
    }
    if (!hasAnyCollabs && callerUid === project.ownerId) {
      return; // Legacy implicit owner
    }
  }

  throw new Error('Permission denied');
}

function assertFolderOwnership(ctx: any, folderId: string): void {
  const callerUid = getCallerUid(ctx);
  if (!callerUid) throw new Error('Identity not registered');
  if (callerUid.startsWith('worker:')) return;
  const folder = ctx.db.folders.id.find(folderId);
  if (!folder) throw new Error('Folder not found');
  if (callerUid !== folder.ownerId) throw new Error('Permission denied');
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

// Authorization: identity → Firebase UID mapping (private)
const userIdentities = table({ name: "user_identities", public: false }, {
  identity: t.string().primaryKey(),
  firebaseUid: t.string(),
});

// ─── Timeline Persistence Tables ──────────────────────────────────────

const timelineClips = table({ name: "timeline_clips", public: true }, {
  id: t.string().primaryKey(),
  projectId: t.string(),
  mediaFileId: t.string(),
  trackId: t.string(),
  startTime: t.f64(),
  duration: t.f64(),
  mediaOffset: t.f64(),
  label: t.string(),
  clipType: t.string(),       // "video" | "audio"
  transform: t.string(),      // JSON string
  effects: t.string(),        // JSON string
  aiReasoning: t.string(),
  sortOrder: t.i32(),
  updatedBy: t.string(),
}, {
  indexes: [
    { name: 'byProjectId', algorithm: 'btree' as const, columns: ['projectId'] },
  ],
});

const mediaFiles = table({ name: "media_files", public: true }, {
  id: t.string().primaryKey(),
  projectId: t.string(),
  name: t.string(),
  durationSeconds: t.f64(),
  fileType: t.string(),
  gcsPath: t.string(),
  gcsUrl: t.string(),
  sizeBytes: t.u64(),
  captionsJson: t.string(),    // JSON string of Caption[]
}, {
  indexes: [
    { name: 'byProjectId', algorithm: 'btree' as const, columns: ['projectId'] },
  ],
});

const effectBlocks = table({ name: "effect_blocks", public: true }, {
  id: t.string().primaryKey(),
  projectId: t.string(),
  effectType: t.string(),
  startTime: t.f64(),
  duration: t.f64(),
  config: t.string(),          // JSON string
}, {
  indexes: [
    { name: 'byProjectId', algorithm: 'btree' as const, columns: ['projectId'] },
  ],
});

const projectPresence = table({ name: "project_presence", public: true }, {
  id: t.string().primaryKey(),  // identity hex
  projectId: t.string(),
  firebaseUid: t.string(),
  displayName: t.string(),
  color: t.string(),
  lastHeartbeat: t.u64(),
  currentTimelinePosition: t.f64(),
}, {
  indexes: [
    { name: 'byProjectId', algorithm: 'btree' as const, columns: ['projectId'] },
  ],
});

const projectLocks = table({ name: "project_locks", public: true }, {
  projectId: t.string().primaryKey(),
  lockedBy: t.string(),        // firebase UID
  lockedByName: t.string(),
  lockedAt: t.u64(),
  expiresAt: t.u64(),
  lockVersion: t.i32(),
});

const projectCollaborators = table({ name: "project_collaborators", public: true }, {
  id: t.string().primaryKey(),
  projectId: t.string(),
  firebaseUid: t.string(),
  role: t.string(),        // "owner" | "editor" | "viewer"
  displayName: t.string(),
  email: t.string(),
  addedBy: t.string(),
  addedAt: t.u64(),
}, {
  indexes: [
    { name: 'byProjectId', algorithm: 'btree' as const, columns: ['projectId'] },
    { name: 'byFirebaseUid', algorithm: 'btree' as const, columns: ['firebaseUid'] },
  ],
});

const shareLinks = table({ name: "share_links", public: true }, {
  id: t.string().primaryKey(),
  projectId: t.string(),
  token: t.string(),
  role: t.string(),         // "editor" | "viewer"
  createdBy: t.string(),
  createdAt: t.u64(),
  expiresAt: t.u64(),       // 0 = never
  maxUses: t.i32(),         // 0 = unlimited
  useCount: t.i32(),
}, {
  indexes: [
    { name: 'byProjectId', algorithm: 'btree' as const, columns: ['projectId'] },
  ],
});

// Phase 2.4: Watchdog schedule table
const watchdogSchedule = table(
  { name: "watchdog_schedule", scheduled: (): any => runWatchdog },
  {
    scheduled_id: t.u64().primaryKey().autoInc(),
    scheduled_at: t.scheduleAt(),
  }
);

// Schema
const LOCK_EXPIRY_MS = BigInt(30 * 60 * 1000);      // 30 minutes
const PRESENCE_STALE_MS = BigInt(2 * 60 * 1000);    // 2 minutes
const MAX_BATCH_CLIPS = 200;
const PRESENCE_COLORS = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA0DD', '#98D8C8', '#F7DC6F'];

const stdb = (schema as any)({
  projects,
  folders,
  assets,
  tasks,
  signals,
  projectState,
  workerConfigs,
  watchdogSchedule,
  userIdentities,
  timelineClips,
  mediaFiles,
  effectBlocks,
  projectPresence,
  projectLocks,
  projectCollaborators,
  shareLinks,
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
  const senderHex = getSenderHex(ctx);
  console.log(`[FlowStudio] Client disconnected: ${senderHex}`);

  // Clean up presence rows for this identity
  for (const presence of ctx.db.projectPresence.iter()) {
    if (presence.id === senderHex) {
      ctx.db.projectPresence.id.delete(senderHex);
      break;
    }
  }

  // Release any locks held by this identity
  const mapping = ctx.db.userIdentities.identity.find(senderHex);
  if (mapping) {
    for (const lock of ctx.db.projectLocks.iter()) {
      if (lock.lockedBy === mapping.firebaseUid) {
        ctx.db.projectLocks.projectId.delete(lock.projectId);
      }
    }
  }
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

    // Clean stale presence (>2 min without heartbeat)
    let presenceCleanCount = 0;
    for (const presence of ctx.db.projectPresence.iter()) {
      if (presence.lastHeartbeat > 0n && (now - presence.lastHeartbeat) > PRESENCE_STALE_MS) {
        ctx.db.projectPresence.id.delete(presence.id);
        presenceCleanCount++;
      }
    }
    if (presenceCleanCount > 0) {
      console.log(`[Watchdog] Cleaned ${presenceCleanCount} stale presence entries`);
    }

    // Release expired locks
    let lockCleanCount = 0;
    for (const lock of ctx.db.projectLocks.iter()) {
      if (lock.expiresAt > 0n && now > lock.expiresAt) {
        ctx.db.projectLocks.projectId.delete(lock.projectId);
        lockCleanCount++;
      }
    }
    if (lockCleanCount > 0) {
      console.log(`[Watchdog] Released ${lockCleanCount} expired locks`);
    }
  }
);

// ─── Authorization reducer ──────────────────────────────────────────

export const registerIdentity = stdb.reducer(
  "register_identity",
  { firebaseUid: t.string() },
  (ctx: any, args: any) => {
    const senderHex = getSenderHex(ctx);
    console.log(`[registerIdentity] sender=${senderHex} firebaseUid=${args.firebaseUid.slice(0, 4)}...`);
    if (args.firebaseUid.startsWith('worker:')) {
      throw new Error('Cannot register worker identity from client');
    }
    const existing = ctx.db.userIdentities.identity.find(senderHex);
    if (existing) {
      if (existing.firebaseUid !== args.firebaseUid) {
        throw new Error('Identity already bound to a different UID');
      }
      return; // Already registered with same UID — no-op
    } else {
      ctx.db.userIdentities.insert({ identity: senderHex, firebaseUid: args.firebaseUid });
    }
  },
);

export const registerWorkerIdentity = stdb.reducer(
  "register_worker_identity",
  { workerId: t.string(), secret: t.string() },
  (ctx: any, args: any) => {
    if (!WORKER_SECRET || args.secret !== WORKER_SECRET) throw new Error('Invalid worker secret');
    const senderHex = getSenderHex(ctx);
    const uid = `worker:${args.workerId}`;
    console.log(`[registerWorkerIdentity] sender=${senderHex} workerId=${args.workerId}`);
    const existing = ctx.db.userIdentities.identity.find(senderHex);
    if (existing) {
      ctx.db.userIdentities.identity.update({ ...existing, firebaseUid: uid });
    } else {
      ctx.db.userIdentities.insert({ identity: senderHex, firebaseUid: uid });
    }
  },
);

// Reducers — Phase 2.6: All reducers include console.log
export const createProject = stdb.reducer(
  "create_project",
  { id: t.string(), name: t.string(), ownerId: t.string(), metadata: t.string() },
  (ctx: any, args: any) => {
    console.log(`[createProject] id=${args.id} name=${args.name} ownerId=${args.ownerId}`);
    const callerUid = getCallerUid(ctx);
    if (!callerUid) throw new Error('Identity not registered');
    if (!callerUid.startsWith('worker:') && callerUid !== args.ownerId) {
      throw new Error('Cannot create project with a different ownerId');
    }
    if (!args.id || args.id.trim() === '') throw new Error('Project id is required');
    if (ctx.db.projects.id.find(args.id)) throw new Error('Project with this id already exists');
    const now = nowMs(ctx);
    const id = args.id;
    ctx.db.projects.insert({ id, name: args.name, status: "created", createdAt: now, updatedAt: now, ownerId: args.ownerId, metadata: args.metadata, starred: false, folderId: "" });
    // Auto-insert owner as collaborator
    ctx.db.projectCollaborators.insert({
      id: generateId(ctx),
      projectId: id,
      firebaseUid: args.ownerId,
      role: 'owner',
      displayName: '',
      email: '',
      addedBy: args.ownerId,
      addedAt: now,
    });
    ctx.db.projectState.insert({ projectId: id, completedTasks: "[]", totalTasks: 0, completedCount: 0, currentPhase: "created", lastUpdated: now });
  },
);

export const createAsset = stdb.reducer(
  "create_asset",
  { projectId: t.string(), assetType: t.string(), gcsPath: t.string(), sizeBytes: t.u64(), mimeType: t.string(), durationMs: t.u64(), metadata: t.string() },
  (ctx: any, args: any) => {
    console.log(`[createAsset] projectId=${args.projectId} assetType=${args.assetType}`);
    const id = generateId(ctx);
    ctx.db.assets.insert({ id, projectId: args.projectId, assetType: args.assetType, gcsPath: args.gcsPath, sizeBytes: args.sizeBytes, mimeType: args.mimeType, durationMs: args.durationMs, createdAt: nowMs(ctx), metadata: args.metadata });
  },
);

export const createTask = stdb.reducer(
  "create_task",
  { projectId: t.string(), taskType: t.string(), inputAssetIds: t.string(), config: t.string(), maxRetries: t.i32() },
  (ctx: any, args: any) => {
    console.log(`[createTask] projectId=${args.projectId} taskType=${args.taskType}`);
    const id = generateId(ctx);
    ctx.db.tasks.insert({ id, projectId: args.projectId, taskType: args.taskType, status: "pending", workerId: "", inputAssetIds: args.inputAssetIds, outputAssetIds: "[]", config: args.config, createdAt: nowMs(ctx), claimedAt: 0n, completedAt: 0n, failureReason: "", retryCount: 0, maxRetries: args.maxRetries });
  },
);

export const claimTask = stdb.reducer(
  "claim_task",
  { taskId: t.string(), workerId: t.string() },
  (ctx: any, args: any) => {
    console.log(`[claimTask] taskId=${args.taskId} workerId=${args.workerId}`);
    const task = ctx.db.tasks.id.find(args.taskId);
    if (!task) throw new Error("claimTask: task not found");
    if (task.status !== "pending") throw new Error("claimTask: task is " + task.status);
    ctx.db.tasks.id.update({ ...task, status: "claimed", workerId: args.workerId, claimedAt: nowMs(ctx) });
  },
);

// Phase 2.2: Find and claim a pending task by type
export const findAndClaimTask = stdb.reducer(
  "find_and_claim_task",
  { taskType: t.string(), workerId: t.string() },
  (ctx: any, args: any) => {
    console.log(`[findAndClaimTask] taskType=${args.taskType} workerId=${args.workerId}`);
    let found: any = null;
    // Use index if available, fall back to iter()
    const source = ctx.db.tasks.byTaskTypeStatus
      ? ctx.db.tasks.byTaskTypeStatus.filter([args.taskType, 'pending'])
      : ctx.db.tasks.iter();
    for (const task of source) {
      if (task.taskType === args.taskType && task.status === 'pending') {
        found = task;
        break;
      }
    }
    if (!found) throw new Error("findAndClaimTask: no pending " + args.taskType + " tasks");
    ctx.db.tasks.id.update({ ...found, status: "claimed", workerId: args.workerId, claimedAt: nowMs(ctx) });
  },
);

// Phase 2.2: Use byProjectId index in completeTask dependency scans
export const completeTask = stdb.reducer(
  "complete_task",
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
    for (const row of getTasksByProjectId(ctx, projectId)) {
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
      for (const row of getTasksByProjectId(ctx, projectId)) {
        if (row.status === "completed" && deps.includes(row.taskType)) {
          try { const outputs = JSON.parse(row.outputAssetIds); if (Array.isArray(outputs)) upstreamAssetIds.push(...outputs); } catch {}
        }
      }

      ctx.db.tasks.insert({ id: generateId(ctx), projectId, taskType: dsType, status: "pending", workerId: "", inputAssetIds: JSON.stringify(upstreamAssetIds), outputAssetIds: "[]", config: "{}", createdAt: now, claimedAt: 0n, completedAt: 0n, failureReason: "", retryCount: 0, maxRetries: MAX_TASK_RETRIES });
    }
  },
);

export const failTask = stdb.reducer(
  "fail_task",
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
  "write_signal",
  { projectId: t.string(), taskId: t.string(), signalType: t.string(), timestampMs: t.u64(), durationMs: t.u64(), confidence: t.f64(), payload: t.string() },
  (ctx: any, args: any) => {
    console.log(`[writeSignal] projectId=${args.projectId} taskId=${args.taskId} signalType=${args.signalType}`);
    ctx.db.signals.insert({ id: generateId(ctx), projectId: args.projectId, taskId: args.taskId, signalType: args.signalType, timestampMs: args.timestampMs, durationMs: args.durationMs, confidence: args.confidence, payload: args.payload, createdAt: nowMs(ctx) });
  },
);

export const ingestInteractionBatch = stdb.reducer(
  "ingest_interaction_batch",
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
  "update_project_state",
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
  "update_worker_config",
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

export const renameProject = stdb.reducer(
  "rename_project",
  { projectId: t.string(), name: t.string() },
  (ctx: any, args: any) => {
    console.log(`[renameProject] projectId=${args.projectId} name=${args.name}`);
    assertProjectAccess(ctx, args.projectId, 'owner');
    const project = ctx.db.projects.id.find(args.projectId);
    if (!project) throw new Error("renameProject: project not found");
    ctx.db.projects.id.update({ ...project, name: args.name, updatedAt: nowMs(ctx) });
  },
);

export const toggleProjectStar = stdb.reducer(
  "toggle_project_star",
  { projectId: t.string() },
  (ctx: any, args: any) => {
    console.log(`[toggleProjectStar] projectId=${args.projectId}`);
    assertProjectAccess(ctx, args.projectId, 'editor');
    const project = ctx.db.projects.id.find(args.projectId);
    if (!project) throw new Error("toggleProjectStar: project not found");
    ctx.db.projects.id.update({ ...project, starred: !project.starred, updatedAt: nowMs(ctx) });
  },
);

export const createFolder = stdb.reducer(
  "create_folder",
  { name: t.string(), ownerId: t.string(), color: t.string(), sortOrder: t.i32() },
  (ctx: any, args: any) => {
    console.log(`[createFolder] name=${args.name} ownerId=${args.ownerId}`);
    const callerUid = getCallerUid(ctx);
    if (!callerUid) throw new Error('Identity not registered');
    if (!callerUid.startsWith('worker:') && callerUid !== args.ownerId) {
      throw new Error('Cannot create folder with a different ownerId');
    }
    const now = nowMs(ctx);
    const id = generateId(ctx);
    ctx.db.folders.insert({ id, name: args.name, ownerId: args.ownerId, color: args.color, sortOrder: args.sortOrder, createdAt: now, updatedAt: now });
  },
);

export const renameFolder = stdb.reducer(
  "rename_folder",
  { folderId: t.string(), name: t.string() },
  (ctx: any, args: any) => {
    console.log(`[renameFolder] folderId=${args.folderId} name=${args.name}`);
    assertFolderOwnership(ctx, args.folderId);
    const folder = ctx.db.folders.id.find(args.folderId);
    if (!folder) throw new Error("renameFolder: folder not found");
    ctx.db.folders.id.update({ ...folder, name: args.name, updatedAt: nowMs(ctx) });
  },
);

export const deleteFolder = stdb.reducer(
  "delete_folder",
  { folderId: t.string() },
  (ctx: any, args: any) => {
    console.log(`[deleteFolder] folderId=${args.folderId}`);
    assertFolderOwnership(ctx, args.folderId);
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
  "move_project_to_folder",
  { projectId: t.string(), folderId: t.string() },
  (ctx: any, args: any) => {
    console.log(`[moveProjectToFolder] projectId=${args.projectId} folderId=${args.folderId}`);
    assertProjectAccess(ctx, args.projectId, 'owner');
    const project = ctx.db.projects.id.find(args.projectId);
    if (!project) throw new Error("moveProjectToFolder: project not found");
    ctx.db.projects.id.update({ ...project, folderId: args.folderId, updatedAt: nowMs(ctx) });
  },
);

export const approveTimeline = stdb.reducer(
  "approve_timeline",
  { projectId: t.string() },
  (ctx: any, args: any) => {
    console.log(`[approveTimeline] projectId=${args.projectId}`);
    assertProjectAccess(ctx, args.projectId, 'editor');
    const projectId = args.projectId;
    const now = nowMs(ctx);

    let timelineBuildTask: any = null;
    for (const task of getTasksByProjectId(ctx, projectId)) {
      if (task.taskType === 'TIMELINE_BUILD' && task.status === 'completed') {
        timelineBuildTask = task;
        break;
      }
    }
    if (!timelineBuildTask) throw new Error("approveTimeline: no completed TIMELINE_BUILD task");

    for (const task of getTasksByProjectId(ctx, projectId)) {
      if (task.taskType === 'RENDER' && (task.status === 'pending' || task.status === 'claimed')) {
        throw new Error("approveTimeline: RENDER task already in progress");
      }
    }

    const timelineOutputs: string[] = JSON.parse(timelineBuildTask.outputAssetIds || '[]');
    ctx.db.tasks.insert({
      id: generateId(ctx), projectId, taskType: 'RENDER', status: 'pending',
      workerId: '', inputAssetIds: JSON.stringify(timelineOutputs),
      outputAssetIds: '[]', config: '{}',
      createdAt: now, claimedAt: 0n, completedAt: 0n,
      failureReason: '', retryCount: 0, maxRetries: MAX_TASK_RETRIES,
    });

    const state = ctx.db.projectState.projectId.find(projectId);
    if (state) ctx.db.projectState.projectId.update({ ...state, currentPhase: 'rendering', lastUpdated: now });
    const project = ctx.db.projects.id.find(projectId);
    if (project) ctx.db.projects.id.update({ ...project, status: 'rendering', updatedAt: now });
  },
);

// ─── Timeline Reducers ──────────────────────────────────────────────

export const upsertTimelineClip = stdb.reducer(
  "upsert_timeline_clip",
  { projectId: t.string(), clipId: t.string(), mediaFileId: t.string(), trackId: t.string(), startTime: t.f64(), duration: t.f64(), mediaOffset: t.f64(), label: t.string(), clipType: t.string(), transform: t.string(), effects: t.string(), aiReasoning: t.string(), sortOrder: t.i32() },
  (ctx: any, args: any) => {
    assertProjectAccess(ctx, args.projectId, 'editor');
    const callerUid = getCallerUid(ctx)!;
    const existing = ctx.db.timelineClips.id.find(args.clipId);
    const row = { id: args.clipId, projectId: args.projectId, mediaFileId: args.mediaFileId, trackId: args.trackId, startTime: args.startTime, duration: args.duration, mediaOffset: args.mediaOffset, label: args.label, clipType: args.clipType, transform: args.transform, effects: args.effects, aiReasoning: args.aiReasoning, sortOrder: args.sortOrder, updatedBy: callerUid };
    if (existing) {
      ctx.db.timelineClips.id.update(row);
    } else {
      ctx.db.timelineClips.insert(row);
    }
  },
);

export const removeTimelineClip = stdb.reducer(
  "remove_timeline_clip",
  { clipId: t.string() },
  (ctx: any, args: any) => {
    const clip = ctx.db.timelineClips.id.find(args.clipId);
    if (!clip) throw new Error('Clip not found');
    assertProjectAccess(ctx, clip.projectId, 'editor');
    ctx.db.timelineClips.id.delete(args.clipId);
  },
);

export const batchUpsertTimelineClips = stdb.reducer(
  "batch_upsert_timeline_clips",
  { projectId: t.string(), clipsJson: t.string() },
  (ctx: any, args: any) => {
    assertProjectAccess(ctx, args.projectId, 'editor');
    const callerUid = getCallerUid(ctx)!;
    let clips: any[];
    try { clips = JSON.parse(args.clipsJson); } catch { throw new Error('Invalid clipsJson'); }
    if (clips.length > MAX_BATCH_CLIPS) throw new Error(`Batch too large (max ${MAX_BATCH_CLIPS})`);
    for (const c of clips) {
      const row = { id: c.id, projectId: args.projectId, mediaFileId: c.mediaFileId, trackId: c.trackId, startTime: c.startTime, duration: c.duration, mediaOffset: c.mediaOffset, label: c.label, clipType: c.clipType, transform: JSON.stringify(c.transform ?? {}), effects: JSON.stringify(c.effects ?? {}), aiReasoning: c.aiReasoning ?? '', sortOrder: c.sortOrder ?? 0, updatedBy: callerUid };
      const existing = ctx.db.timelineClips.id.find(c.id);
      if (existing) {
        ctx.db.timelineClips.id.update(row);
      } else {
        ctx.db.timelineClips.insert(row);
      }
    }
  },
);

export const clearProjectTimeline = stdb.reducer(
  "clear_project_timeline",
  { projectId: t.string() },
  (ctx: any, args: any) => {
    assertProjectAccess(ctx, args.projectId, 'editor');
    const clips = ctx.db.timelineClips.byProjectId
      ? [...ctx.db.timelineClips.byProjectId.filter(args.projectId)]
      : [...ctx.db.timelineClips.iter()].filter((c: any) => c.projectId === args.projectId);
    for (const clip of clips) {
      ctx.db.timelineClips.id.delete(clip.id);
    }
  },
);

// ─── Media File Reducers ────────────────────────────────────────────

export const createMediaFile = stdb.reducer(
  "create_media_file",
  { id: t.string(), projectId: t.string(), name: t.string(), durationSeconds: t.f64(), fileType: t.string(), gcsPath: t.string(), gcsUrl: t.string(), sizeBytes: t.u64(), captionsJson: t.string() },
  (ctx: any, args: any) => {
    assertProjectAccess(ctx, args.projectId, 'editor');
    ctx.db.mediaFiles.insert({ id: args.id, projectId: args.projectId, name: args.name, durationSeconds: args.durationSeconds, fileType: args.fileType, gcsPath: args.gcsPath, gcsUrl: args.gcsUrl, sizeBytes: args.sizeBytes, captionsJson: args.captionsJson });
  },
);

export const updateMediaFileCaptions = stdb.reducer(
  "update_media_file_captions",
  { mediaFileId: t.string(), captionsJson: t.string() },
  (ctx: any, args: any) => {
    const mf = ctx.db.mediaFiles.id.find(args.mediaFileId);
    if (!mf) throw new Error('Media file not found');
    assertProjectAccess(ctx, mf.projectId, 'editor');
    ctx.db.mediaFiles.id.update({ ...mf, captionsJson: args.captionsJson });
  },
);

export const removeMediaFile = stdb.reducer(
  "remove_media_file",
  { mediaFileId: t.string() },
  (ctx: any, args: any) => {
    const mf = ctx.db.mediaFiles.id.find(args.mediaFileId);
    if (!mf) throw new Error('Media file not found');
    assertProjectAccess(ctx, mf.projectId, 'editor');
    ctx.db.mediaFiles.id.delete(args.mediaFileId);
  },
);

// ─── Effect Block Reducers ──────────────────────────────────────────

export const upsertEffectBlock = stdb.reducer(
  "upsert_effect_block",
  { id: t.string(), projectId: t.string(), effectType: t.string(), startTime: t.f64(), duration: t.f64(), config: t.string() },
  (ctx: any, args: any) => {
    assertProjectAccess(ctx, args.projectId, 'editor');
    const existing = ctx.db.effectBlocks.id.find(args.id);
    const row = { id: args.id, projectId: args.projectId, effectType: args.effectType, startTime: args.startTime, duration: args.duration, config: args.config };
    if (existing) {
      ctx.db.effectBlocks.id.update(row);
    } else {
      ctx.db.effectBlocks.insert(row);
    }
  },
);

export const removeEffectBlock = stdb.reducer(
  "remove_effect_block",
  { effectBlockId: t.string() },
  (ctx: any, args: any) => {
    const eb = ctx.db.effectBlocks.id.find(args.effectBlockId);
    if (!eb) throw new Error('Effect block not found');
    assertProjectAccess(ctx, eb.projectId, 'editor');
    ctx.db.effectBlocks.id.delete(args.effectBlockId);
  },
);

// ─── Presence Reducers ──────────────────────────────────────────────

export const joinProject = stdb.reducer(
  "join_project",
  { projectId: t.string(), displayName: t.string() },
  (ctx: any, args: any) => {
    const callerUid = getCallerUid(ctx);
    if (!callerUid) throw new Error('Identity not registered');
    const senderHex = getSenderHex(ctx);
    const now = nowMs(ctx);

    // Assign a color based on existing presence count
    let colorIndex = 0;
    for (const p of ctx.db.projectPresence.iter()) {
      if (p.projectId === args.projectId) colorIndex++;
    }

    const existing = ctx.db.projectPresence.id.find(senderHex);
    const row = { id: senderHex, projectId: args.projectId, firebaseUid: callerUid, displayName: args.displayName, color: PRESENCE_COLORS[colorIndex % PRESENCE_COLORS.length], lastHeartbeat: now, currentTimelinePosition: 0.0 };
    if (existing) {
      ctx.db.projectPresence.id.update(row);
    } else {
      ctx.db.projectPresence.insert(row);
    }
  },
);

export const leaveProject = stdb.reducer(
  "leave_project",
  {},
  (ctx: any) => {
    const senderHex = getSenderHex(ctx);
    const existing = ctx.db.projectPresence.id.find(senderHex);
    if (existing) {
      ctx.db.projectPresence.id.delete(senderHex);
    }
  },
);

export const heartbeatPresence = stdb.reducer(
  "heartbeat_presence",
  { currentTimelinePosition: t.f64() },
  (ctx: any, args: any) => {
    const senderHex = getSenderHex(ctx);
    const existing = ctx.db.projectPresence.id.find(senderHex);
    if (!existing) return; // Not in a project
    ctx.db.projectPresence.id.update({ ...existing, lastHeartbeat: nowMs(ctx), currentTimelinePosition: args.currentTimelinePosition });
  },
);

// ─── Locking Reducers ───────────────────────────────────────────────

export const acquireLock = stdb.reducer(
  "acquire_lock",
  { projectId: t.string(), displayName: t.string() },
  (ctx: any, args: any) => {
    const callerUid = getCallerUid(ctx);
    if (!callerUid) throw new Error('Identity not registered');
    assertProjectAccess(ctx, args.projectId, 'editor');
    const now = nowMs(ctx);

    const existing = ctx.db.projectLocks.projectId.find(args.projectId);
    if (existing) {
      // Check if expired
      if (now > existing.expiresAt) {
        // Expired — replace
        ctx.db.projectLocks.projectId.update({ projectId: args.projectId, lockedBy: callerUid, lockedByName: args.displayName, lockedAt: now, expiresAt: now + LOCK_EXPIRY_MS, lockVersion: existing.lockVersion + 1 });
      } else if (existing.lockedBy === callerUid) {
        // Already held by caller — renew
        ctx.db.projectLocks.projectId.update({ ...existing, expiresAt: now + LOCK_EXPIRY_MS });
      } else {
        throw new Error(`Project locked by ${existing.lockedByName}`);
      }
    } else {
      ctx.db.projectLocks.insert({ projectId: args.projectId, lockedBy: callerUid, lockedByName: args.displayName, lockedAt: now, expiresAt: now + LOCK_EXPIRY_MS, lockVersion: 1 });
    }
  },
);

export const renewLock = stdb.reducer(
  "renew_lock",
  { projectId: t.string() },
  (ctx: any, args: any) => {
    const callerUid = getCallerUid(ctx);
    if (!callerUid) throw new Error('Identity not registered');
    const lock = ctx.db.projectLocks.projectId.find(args.projectId);
    if (!lock) throw new Error('No lock exists');
    if (lock.lockedBy !== callerUid) throw new Error('Lock not held by caller');
    ctx.db.projectLocks.projectId.update({ ...lock, expiresAt: nowMs(ctx) + LOCK_EXPIRY_MS });
  },
);

export const releaseLock = stdb.reducer(
  "release_lock",
  { projectId: t.string() },
  (ctx: any, args: any) => {
    const callerUid = getCallerUid(ctx);
    if (!callerUid) throw new Error('Identity not registered');
    const lock = ctx.db.projectLocks.projectId.find(args.projectId);
    if (!lock) return; // No lock — no-op
    if (lock.lockedBy !== callerUid) throw new Error('Lock not held by caller');
    ctx.db.projectLocks.projectId.delete(args.projectId);
  },
);

export const forceReleaseLock = stdb.reducer(
  "force_release_lock",
  { projectId: t.string() },
  (ctx: any, args: any) => {
    // Only the project owner can force-release
    assertProjectAccess(ctx, args.projectId, 'owner');
    const lock = ctx.db.projectLocks.projectId.find(args.projectId);
    if (!lock) return;
    ctx.db.projectLocks.projectId.delete(args.projectId);
  },
);

// ─── Collaboration Reducers ─────────────────────────────────────────

export const addCollaborator = stdb.reducer(
  "add_collaborator",
  { projectId: t.string(), firebaseUid: t.string(), role: t.string(), displayName: t.string(), email: t.string() },
  (ctx: any, args: any) => {
    console.log(`[addCollaborator] projectId=${args.projectId} uid=${args.firebaseUid} role=${args.role}`);
    assertProjectAccess(ctx, args.projectId, 'owner');
    if (!['editor', 'viewer'].includes(args.role)) throw new Error('Invalid role');
    // Check for duplicate
    for (const collab of ctx.db.projectCollaborators.iter()) {
      if (collab.projectId === args.projectId && collab.firebaseUid === args.firebaseUid) {
        throw new Error('User is already a collaborator');
      }
    }
    const callerUid = getCallerUid(ctx)!;
    ctx.db.projectCollaborators.insert({
      id: generateId(ctx),
      projectId: args.projectId,
      firebaseUid: args.firebaseUid,
      role: args.role,
      displayName: args.displayName,
      email: args.email,
      addedBy: callerUid,
      addedAt: nowMs(ctx),
    });
  },
);

export const updateCollaboratorRole = stdb.reducer(
  "update_collaborator_role",
  { projectId: t.string(), firebaseUid: t.string(), role: t.string() },
  (ctx: any, args: any) => {
    console.log(`[updateCollaboratorRole] projectId=${args.projectId} uid=${args.firebaseUid} role=${args.role}`);
    assertProjectAccess(ctx, args.projectId, 'owner');
    if (!['editor', 'viewer'].includes(args.role)) throw new Error('Invalid role');
    for (const collab of ctx.db.projectCollaborators.iter()) {
      if (collab.projectId === args.projectId && collab.firebaseUid === args.firebaseUid) {
        if (collab.role === 'owner') throw new Error('Cannot change owner role');
        ctx.db.projectCollaborators.id.update({ ...collab, role: args.role });
        return;
      }
    }
    throw new Error('Collaborator not found');
  },
);

export const removeCollaborator = stdb.reducer(
  "remove_collaborator",
  { projectId: t.string(), firebaseUid: t.string() },
  (ctx: any, args: any) => {
    console.log(`[removeCollaborator] projectId=${args.projectId} uid=${args.firebaseUid}`);
    assertProjectAccess(ctx, args.projectId, 'owner');
    for (const collab of ctx.db.projectCollaborators.iter()) {
      if (collab.projectId === args.projectId && collab.firebaseUid === args.firebaseUid) {
        if (collab.role === 'owner') throw new Error('Cannot remove project owner');
        ctx.db.projectCollaborators.id.delete(collab.id);
        return;
      }
    }
    throw new Error('Collaborator not found');
  },
);

export const leaveCollaboratorProject = stdb.reducer(
  "leave_collaborator_project",
  { projectId: t.string() },
  (ctx: any, args: any) => {
    const callerUid = getCallerUid(ctx);
    if (!callerUid) throw new Error('Identity not registered');
    console.log(`[leaveCollaboratorProject] projectId=${args.projectId} uid=${callerUid}`);
    for (const collab of ctx.db.projectCollaborators.iter()) {
      if (collab.projectId === args.projectId && collab.firebaseUid === callerUid) {
        if (collab.role === 'owner') throw new Error('Owner cannot leave project');
        ctx.db.projectCollaborators.id.delete(collab.id);
        return;
      }
    }
    throw new Error('Not a collaborator');
  },
);

export const createShareLink = stdb.reducer(
  "create_share_link",
  { projectId: t.string(), role: t.string(), expiresAt: t.u64(), maxUses: t.i32() },
  (ctx: any, args: any) => {
    console.log(`[createShareLink] projectId=${args.projectId} role=${args.role}`);
    assertProjectAccess(ctx, args.projectId, 'owner');
    if (!['editor', 'viewer'].includes(args.role)) throw new Error('Invalid role');
    const callerUid = getCallerUid(ctx)!;
    const token = generateId(ctx) + '-' + ctx.random().toString(36).slice(2, 14);
    ctx.db.shareLinks.insert({
      id: generateId(ctx),
      projectId: args.projectId,
      token,
      role: args.role,
      createdBy: callerUid,
      createdAt: nowMs(ctx),
      expiresAt: args.expiresAt,
      maxUses: args.maxUses,
      useCount: 0,
    });
  },
);

export const deleteShareLink = stdb.reducer(
  "delete_share_link",
  { linkId: t.string() },
  (ctx: any, args: any) => {
    console.log(`[deleteShareLink] linkId=${args.linkId}`);
    const link = ctx.db.shareLinks.id.find(args.linkId);
    if (!link) throw new Error('Share link not found');
    assertProjectAccess(ctx, link.projectId, 'owner');
    ctx.db.shareLinks.id.delete(args.linkId);
  },
);

export const redeemShareLink = stdb.reducer(
  "redeem_share_link",
  { token: t.string() },
  (ctx: any, args: any) => {
    const callerUid = getCallerUid(ctx);
    if (!callerUid) throw new Error('Identity not registered');
    console.log(`[redeemShareLink] uid=${callerUid}`);
    // Find link by token (iterate — low volume)
    let link: any = null;
    for (const l of ctx.db.shareLinks.iter()) {
      if (l.token === args.token) { link = l; break; }
    }
    if (!link) throw new Error('Invalid share link');
    const now = nowMs(ctx);
    if (link.expiresAt > 0n && now > link.expiresAt) throw new Error('Share link expired');
    if (link.maxUses > 0 && link.useCount >= link.maxUses) throw new Error('Share link usage limit reached');
    // Check if already a collaborator
    for (const collab of ctx.db.projectCollaborators.iter()) {
      if (collab.projectId === link.projectId && collab.firebaseUid === callerUid) {
        throw new Error('Already a collaborator');
      }
    }
    // Add as collaborator
    ctx.db.projectCollaborators.insert({
      id: generateId(ctx),
      projectId: link.projectId,
      firebaseUid: callerUid,
      role: link.role,
      displayName: '',
      email: '',
      addedBy: link.createdBy,
      addedAt: now,
    });
    // Increment use count
    ctx.db.shareLinks.id.update({ ...link, useCount: link.useCount + 1 });
  },
);

export default stdb;
