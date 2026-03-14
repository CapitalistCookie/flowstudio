/**
 * FlowStudio SpacetimeDB v2 Module
 *
 * Self-contained WASM module that defines all tables, reducers, and task-chaining
 * logic for the FlowStudio video-editing pipeline. SpacetimeDB modules cannot
 * import from other workspace packages at runtime, so all constants are inlined.
 */

import { table, t, schema, ScheduleAt } from 'spacetimedb/server';

// ---------------------------------------------------------------------------
// Constants (mirrored from @flowstudio/shared — WASM modules are self-contained)
// ---------------------------------------------------------------------------

const MAX_TASK_RETRIES = 3;
const STALE_TASK_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes
const WATCHDOG_INTERVAL_SECS = 30;

/** Task chaining DAG: completed task type -> downstream task types to potentially create */
const TASK_CHAIN_DAG: Record<string, string[]> = {
  AUDIO_EXTRACT: ['SPEECH_TRANSCRIPTION'],
  VIDEO_SAMPLE: ['VIDEO_UNDERSTANDING', 'UI_CHANGE_DETECT'],
  CURSOR_PROCESS: ['INTERACTION_PATTERN'],
  TYPING_DETECT: ['INTERACTION_PATTERN'],
  SPEECH_TRANSCRIPTION: ['INTENT_GRAPH'],
  VIDEO_UNDERSTANDING: ['INTENT_GRAPH'],
  UI_CHANGE_DETECT: ['INTENT_GRAPH'],
  INTERACTION_PATTERN: ['INTENT_GRAPH'],
  INTENT_GRAPH: ['NARRATIVE_PLAN'],
  NARRATIVE_PLAN: ['EDIT_PLAN'],
  EDIT_PLAN: ['TIMELINE_BUILD'],
  TIMELINE_BUILD: ['RENDER'],
  RENDER: [],
};

/** Reverse map: what task types must ALL be completed before a task type can start */
const TASK_DEPENDENCIES: Record<string, string[]> = {
  AUDIO_EXTRACT: [],
  VIDEO_SAMPLE: [],
  CURSOR_PROCESS: [],
  TYPING_DETECT: [],
  SPEECH_TRANSCRIPTION: ['AUDIO_EXTRACT'],
  VIDEO_UNDERSTANDING: ['VIDEO_SAMPLE'],
  UI_CHANGE_DETECT: ['VIDEO_SAMPLE'],
  INTERACTION_PATTERN: ['CURSOR_PROCESS', 'TYPING_DETECT'],
  INTENT_GRAPH: [
    'SPEECH_TRANSCRIPTION',
    'VIDEO_UNDERSTANDING',
    'UI_CHANGE_DETECT',
    'INTERACTION_PATTERN',
  ],
  NARRATIVE_PLAN: ['INTENT_GRAPH'],
  EDIT_PLAN: ['NARRATIVE_PLAN'],
  TIMELINE_BUILD: ['EDIT_PLAN'],
  RENDER: ['TIMELINE_BUILD'],
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Generate a unique ID (no node:crypto in WASM) */
function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

/** Current Unix ms timestamp */
function nowMs(): number {
  return Date.now();
}

// ---------------------------------------------------------------------------
// Tables
// ---------------------------------------------------------------------------

const projects = table({ name: 'projects', public: true }, {
  id: t.string().primaryKey(),
  name: t.string(),
  status: t.string(),
  createdAt: t.u64(),
  updatedAt: t.u64(),
  ownerId: t.string(),
  metadata: t.string(),
});

const assets = table({ name: 'assets', public: true }, {
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

const tasks = table({ name: 'tasks', public: true }, {
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

const signals = table({ name: 'signals', public: true }, {
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

const projectState = table({ name: 'project_state', public: true }, {
  projectId: t.string().primaryKey(),
  completedTasks: t.string(),
  totalTasks: t.i32(),
  completedCount: t.i32(),
  currentPhase: t.string(),
  lastUpdated: t.u64(),
});

const workerConfigs = table({ name: 'worker_configs', public: true }, {
  workerId: t.string().primaryKey(),
  workerType: t.string(),
  lastHeartbeat: t.u64(),
  isActive: t.bool(),
  concurrency: t.i32(),
  metadata: t.string(),
});

/** Scheduled table for the recurring watchdog */
const watchdogSchedule = table(
  { name: 'watchdog_schedule', public: false, scheduledAt: 'scheduledAt' },
  {
    scheduledId: t.u64().autoInc().primaryKey(),
    scheduledAt: t.scheduleAt(),
  },
);

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

const stdb = schema(
  projects,
  assets,
  tasks,
  signals,
  projectState,
  workerConfigs,
  watchdogSchedule,
);

// ---------------------------------------------------------------------------
// Reducers
// ---------------------------------------------------------------------------

/**
 * createProject — Create a new project and its associated project_state row.
 */
stdb.reducer(
  'createProject',
  {
    name: t.string(),
    ownerId: t.string(),
    metadata: t.string(),
  },
  (ctx, args) => {
    const now = nowMs();
    const id = generateId();

    ctx.db.projects.insert({
      id,
      name: args.name as string,
      status: 'created',
      createdAt: now,
      updatedAt: now,
      ownerId: args.ownerId as string,
      metadata: args.metadata as string,
    });

    ctx.db.project_state.insert({
      projectId: id,
      completedTasks: '[]',
      totalTasks: 0,
      completedCount: 0,
      currentPhase: 'created',
      lastUpdated: now,
    });
  },
);

/**
 * createAsset — Register a new asset linked to a project.
 */
stdb.reducer(
  'createAsset',
  {
    projectId: t.string(),
    assetType: t.string(),
    gcsPath: t.string(),
    sizeBytes: t.u64(),
    mimeType: t.string(),
    durationMs: t.u64(),
    metadata: t.string(),
  },
  (ctx, args) => {
    const id = generateId();

    ctx.db.assets.insert({
      id,
      projectId: args.projectId as string,
      assetType: args.assetType as string,
      gcsPath: args.gcsPath as string,
      sizeBytes: args.sizeBytes as number,
      mimeType: args.mimeType as string,
      durationMs: args.durationMs as number,
      createdAt: nowMs(),
      metadata: args.metadata as string,
    });
  },
);

/**
 * ingestInteractionBatch — Batch-write cursor/typing interaction data as signals.
 * Accepts a JSON-encoded array of signal payloads.
 */
stdb.reducer(
  'ingestInteractionBatch',
  {
    projectId: t.string(),
    taskId: t.string(),
    signalType: t.string(),
    batchJson: t.string(),
  },
  (ctx, args) => {
    const projectId = args.projectId as string;
    const taskId = args.taskId as string;
    const signalType = args.signalType as string;
    const now = nowMs();

    let batch: Array<{ timestampMs: number; durationMs: number; confidence: number; payload: string }>;
    try {
      batch = JSON.parse(args.batchJson as string);
    } catch {
      throw new Error('ingestInteractionBatch: invalid batchJson');
    }

    for (const item of batch) {
      ctx.db.signals.insert({
        id: generateId(),
        projectId,
        taskId,
        signalType,
        timestampMs: item.timestampMs,
        durationMs: item.durationMs,
        confidence: item.confidence,
        payload: item.payload,
        createdAt: now,
      });
    }
  },
);

/**
 * createTask — Create a task in PENDING status with configuration.
 */
stdb.reducer(
  'createTask',
  {
    projectId: t.string(),
    taskType: t.string(),
    inputAssetIds: t.string(),
    config: t.string(),
    maxRetries: t.i32(),
  },
  (ctx, args) => {
    const id = generateId();

    ctx.db.tasks.insert({
      id,
      projectId: args.projectId as string,
      taskType: args.taskType as string,
      status: 'pending',
      workerId: '',
      inputAssetIds: args.inputAssetIds as string,
      outputAssetIds: '[]',
      config: args.config as string,
      createdAt: nowMs(),
      claimedAt: 0,
      completedAt: 0,
      failureReason: '',
      retryCount: 0,
      maxRetries: args.maxRetries as number,
    });
  },
);

/**
 * claimTask — Atomically claim a PENDING task for a worker.
 * Fails if the task is not in PENDING status (race-condition safe).
 */
stdb.reducer(
  'claimTask',
  {
    taskId: t.string(),
    workerId: t.string(),
  },
  (ctx, args) => {
    const taskId = args.taskId as string;
    const workerId = args.workerId as string;

    const task = ctx.db.tasks.findByPrimaryKey(taskId);
    if (!task) {
      throw new Error(`claimTask: task ${taskId} not found`);
    }
    if (task.status !== 'pending') {
      throw new Error(`claimTask: task ${taskId} is ${task.status}, not pending`);
    }

    ctx.db.tasks.updateByPrimaryKey(taskId, {
      status: 'claimed',
      workerId,
      claimedAt: nowMs(),
    });
  },
);

/**
 * completeTask — Mark a task as COMPLETED, record output assets, then run task
 * chaining: for each downstream task type whose dependencies are ALL met,
 * create a new PENDING task.
 */
stdb.reducer(
  'completeTask',
  {
    taskId: t.string(),
    outputAssetIds: t.string(),
  },
  (ctx, args) => {
    const taskId = args.taskId as string;
    const now = nowMs();

    const task = ctx.db.tasks.findByPrimaryKey(taskId);
    if (!task) {
      throw new Error(`completeTask: task ${taskId} not found`);
    }

    // Mark completed
    ctx.db.tasks.updateByPrimaryKey(taskId, {
      status: 'completed',
      outputAssetIds: args.outputAssetIds as string,
      completedAt: now,
    });

    const projectId = task.projectId as string;
    const completedType = task.taskType as string;

    // ------ Update project_state ------
    const state = ctx.db.project_state.findByPrimaryKey(projectId);
    if (state) {
      let completed: string[];
      try {
        completed = JSON.parse(state.completedTasks as string);
      } catch {
        completed = [];
      }
      if (!completed.includes(completedType)) {
        completed.push(completedType);
      }
      ctx.db.project_state.updateByPrimaryKey(projectId, {
        completedTasks: JSON.stringify(completed),
        completedCount: completed.length,
        lastUpdated: now,
      });
    }

    // ------ Task chaining ------
    const downstreamTypes = TASK_CHAIN_DAG[completedType];
    if (!downstreamTypes || downstreamTypes.length === 0) {
      return;
    }

    // Collect all completed task types for this project
    const completedTypesSet = new Set<string>();
    for (const row of ctx.db.tasks.iter()) {
      if (row.projectId === projectId && row.status === 'completed') {
        completedTypesSet.add(row.taskType as string);
      }
    }
    // Include the task we just completed (the iter may not reflect the update yet)
    completedTypesSet.add(completedType);

    // Check if downstream tasks already exist for this project
    const existingTaskTypes = new Set<string>();
    for (const row of ctx.db.tasks.iter()) {
      if (row.projectId === projectId) {
        existingTaskTypes.add(row.taskType as string);
      }
    }

    for (const dsType of downstreamTypes) {
      // Skip if a task of this type already exists for the project
      if (existingTaskTypes.has(dsType)) {
        continue;
      }

      // Check if ALL dependencies for this downstream type are completed
      const deps = TASK_DEPENDENCIES[dsType];
      if (!deps) {
        continue;
      }

      const allDepsMet = deps.every((dep) => completedTypesSet.has(dep));
      if (!allDepsMet) {
        continue;
      }

      // All dependencies met and task doesn't exist yet — create it
      ctx.db.tasks.insert({
        id: generateId(),
        projectId,
        taskType: dsType,
        status: 'pending',
        workerId: '',
        inputAssetIds: '[]',
        outputAssetIds: '[]',
        config: '{}',
        createdAt: now,
        claimedAt: 0,
        completedAt: 0,
        failureReason: '',
        retryCount: 0,
        maxRetries: MAX_TASK_RETRIES,
      });
    }
  },
);

/**
 * failTask — Mark a task as FAILED. If retryCount < maxRetries, create a new
 * PENDING copy (retry). Updates project_state accordingly.
 */
stdb.reducer(
  'failTask',
  {
    taskId: t.string(),
    failureReason: t.string(),
  },
  (ctx, args) => {
    const taskId = args.taskId as string;
    const reason = args.failureReason as string;
    const now = nowMs();

    const task = ctx.db.tasks.findByPrimaryKey(taskId);
    if (!task) {
      throw new Error(`failTask: task ${taskId} not found`);
    }

    const currentRetry = (task.retryCount as number) || 0;
    const maxRetries = (task.maxRetries as number) || MAX_TASK_RETRIES;

    // Mark original task as failed
    ctx.db.tasks.updateByPrimaryKey(taskId, {
      status: 'failed',
      failureReason: reason,
      completedAt: now,
    });

    // If retries remain, create a new PENDING copy
    if (currentRetry < maxRetries) {
      ctx.db.tasks.insert({
        id: generateId(),
        projectId: task.projectId as string,
        taskType: task.taskType as string,
        status: 'pending',
        workerId: '',
        inputAssetIds: task.inputAssetIds as string,
        outputAssetIds: '[]',
        config: task.config as string,
        createdAt: now,
        claimedAt: 0,
        completedAt: 0,
        failureReason: '',
        retryCount: currentRetry + 1,
        maxRetries,
      });
    } else {
      // Max retries exhausted — update project state
      const state = ctx.db.project_state.findByPrimaryKey(task.projectId as string);
      if (state) {
        ctx.db.project_state.updateByPrimaryKey(task.projectId as string, {
          currentPhase: 'failed',
          lastUpdated: now,
        });
      }
    }
  },
);

/**
 * writeSignal — Insert a single signal record.
 */
stdb.reducer(
  'writeSignal',
  {
    projectId: t.string(),
    taskId: t.string(),
    signalType: t.string(),
    timestampMs: t.u64(),
    durationMs: t.u64(),
    confidence: t.f64(),
    payload: t.string(),
  },
  (ctx, args) => {
    ctx.db.signals.insert({
      id: generateId(),
      projectId: args.projectId as string,
      taskId: args.taskId as string,
      signalType: args.signalType as string,
      timestampMs: args.timestampMs as number,
      durationMs: args.durationMs as number,
      confidence: args.confidence as number,
      payload: args.payload as string,
      createdAt: nowMs(),
    });
  },
);

/**
 * updateProjectState — Direct update of project state fields.
 */
stdb.reducer(
  'updateProjectState',
  {
    projectId: t.string(),
    currentPhase: t.string(),
    status: t.string(),
  },
  (ctx, args) => {
    const projectId = args.projectId as string;
    const now = nowMs();

    const state = ctx.db.project_state.findByPrimaryKey(projectId);
    if (!state) {
      throw new Error(`updateProjectState: no state for project ${projectId}`);
    }

    ctx.db.project_state.updateByPrimaryKey(projectId, {
      currentPhase: args.currentPhase as string,
      lastUpdated: now,
    });

    // Also update the project's status field
    const project = ctx.db.projects.findByPrimaryKey(projectId);
    if (project) {
      ctx.db.projects.updateByPrimaryKey(projectId, {
        status: args.status as string,
        updatedAt: now,
      });
    }
  },
);

/**
 * updateWorkerConfig — Upsert a worker configuration with heartbeat.
 */
stdb.reducer(
  'updateWorkerConfig',
  {
    workerId: t.string(),
    workerType: t.string(),
    isActive: t.bool(),
    concurrency: t.i32(),
    metadata: t.string(),
  },
  (ctx, args) => {
    const workerId = args.workerId as string;
    const now = nowMs();

    const existing = ctx.db.worker_configs.findByPrimaryKey(workerId);
    if (existing) {
      ctx.db.worker_configs.updateByPrimaryKey(workerId, {
        workerType: args.workerType as string,
        lastHeartbeat: now,
        isActive: args.isActive as boolean,
        concurrency: args.concurrency as number,
        metadata: args.metadata as string,
      });
    } else {
      ctx.db.worker_configs.insert({
        workerId,
        workerType: args.workerType as string,
        lastHeartbeat: now,
        isActive: args.isActive as boolean,
        concurrency: args.concurrency as number,
        metadata: args.metadata as string,
      });
    }
  },
);

// ---------------------------------------------------------------------------
// Scheduled Reducer: Watchdog
// ---------------------------------------------------------------------------

/**
 * watchdog_schedule — Runs every WATCHDOG_INTERVAL_SECS seconds.
 * Finds stale tasks (CLAIMED/RUNNING for longer than STALE_TASK_THRESHOLD_MS)
 * and either requeues them as PENDING or marks them FAILED if max retries exceeded.
 */
stdb.reducer('watchdog_schedule', {}, (ctx, _args) => {
  const now = nowMs();
  const threshold = now - STALE_TASK_THRESHOLD_MS;

  // Collect stale task IDs first to avoid mutating while iterating
  const staleTasks: Array<{
    id: string;
    projectId: string;
    taskType: string;
    inputAssetIds: string;
    config: string;
    retryCount: number;
    maxRetries: number;
  }> = [];

  for (const task of ctx.db.tasks.iter()) {
    const status = task.status as string;
    if (
      (status === 'claimed' || status === 'running') &&
      (task.claimedAt as number) > 0 &&
      (task.claimedAt as number) < threshold
    ) {
      staleTasks.push({
        id: task.id as string,
        projectId: task.projectId as string,
        taskType: task.taskType as string,
        inputAssetIds: task.inputAssetIds as string,
        config: task.config as string,
        retryCount: (task.retryCount as number) || 0,
        maxRetries: (task.maxRetries as number) || MAX_TASK_RETRIES,
      });
    }
  }

  for (const stale of staleTasks) {
    if (stale.retryCount >= stale.maxRetries) {
      // Max retries exhausted — mark as failed
      ctx.db.tasks.updateByPrimaryKey(stale.id, {
        status: 'failed',
        failureReason: 'Exceeded max retries after becoming stale',
        completedAt: now,
      });
    } else {
      // Requeue: reset to pending, clear worker, increment retry
      ctx.db.tasks.updateByPrimaryKey(stale.id, {
        status: 'pending',
        workerId: '',
        retryCount: stale.retryCount + 1,
        claimedAt: 0,
      });
    }
  }
});

// ---------------------------------------------------------------------------
// Init Reducer — seeds the watchdog schedule
// ---------------------------------------------------------------------------

stdb.reducer('__init__', {}, (ctx, _args) => {
  ctx.db.watchdog_schedule.insert({
    scheduledId: 0,
    scheduledAt: { __brand: 'ScheduleAt' } as ScheduleAt,
    // SpacetimeDB interprets the scheduledAt field. At runtime, the WASM host
    // resolves ScheduleAt.interval(Duration.from_secs(WATCHDOG_INTERVAL_SECS)).
    // For type-checking purposes we use the branded type.
  });
});

export default stdb;
