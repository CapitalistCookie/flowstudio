/**
 * SpacetimeDB module bindings for FlowStudio.
 *
 * Manually constructed to match the schema in packages/stdb-module/src/index.ts.
 * Regenerate with: spacetime generate --lang typescript --out-dir . --project-path /path/to/stdb-module
 */

/* eslint-disable */
// @ts-nocheck

import { table, t, schema, reducerSchema, reducers } from 'spacetimedb/sdk';
import {
  DbConnectionBuilder,
  DbConnectionImpl,
  type EventContextInterface,
  type ReducerEventContextInterface,
  type SubscriptionEventContextInterface,
  type ErrorContextInterface,
} from 'spacetimedb';

// ─── Table Definitions ───────────────────────────────────────────────

const projects = table({
  name: 'projects', public: true,
  indexes: [{ accessor: 'byOwnerId', algorithm: 'btree' as const, columns: ['ownerId'] as const }],
}, {
  id: t.string().primaryKey(),
  name: t.string(),
  status: t.string(),
  createdAt: t.u64(),
  updatedAt: t.u64(),
  ownerId: t.string(),
  metadata: t.string(),
  starred: t.bool(),
  folderId: t.string(),
});

const folders = table({
  name: 'folders', public: true,
  indexes: [{ accessor: 'byOwnerId', algorithm: 'btree' as const, columns: ['ownerId'] as const }],
}, {
  id: t.string().primaryKey(),
  name: t.string(),
  ownerId: t.string(),
  color: t.string(),
  sortOrder: t.i32(),
  createdAt: t.u64(),
  updatedAt: t.u64(),
});

const assets = table({
  name: 'assets', public: true,
  indexes: [{ accessor: 'byProjectId', algorithm: 'btree' as const, columns: ['projectId'] as const }],
}, {
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

const tasks = table({
  name: 'tasks', public: true,
  indexes: [
    { accessor: 'byTaskTypeStatus', algorithm: 'btree' as const, columns: ['taskType', 'status'] as const },
    { accessor: 'byProjectId', algorithm: 'btree' as const, columns: ['projectId'] as const },
  ],
}, {
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

const signals = table({
  name: 'signals', public: true,
  indexes: [{ accessor: 'byProjectId', algorithm: 'btree' as const, columns: ['projectId'] as const }],
}, {
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

// ─── Schema & Reducers ───────────────────────────────────────────────

const s = schema({ projects, folders, assets, tasks, signals });

const r = reducers(
  reducerSchema('create_project', {
    name: t.string(), ownerId: t.string(), metadata: t.string(),
  }),
  reducerSchema('create_asset', {
    projectId: t.string(), assetType: t.string(), gcsPath: t.string(),
    sizeBytes: t.u64(), mimeType: t.string(), durationMs: t.u64(), metadata: t.string(),
  }),
  reducerSchema('create_task', {
    projectId: t.string(), taskType: t.string(), inputAssetIds: t.string(),
    config: t.string(), maxRetries: t.i32(),
  }),
  reducerSchema('claim_task', {
    taskId: t.string(), workerId: t.string(),
  }),
  reducerSchema('find_and_claim_task', {
    taskType: t.string(), workerId: t.string(),
  }),
  reducerSchema('complete_task', {
    taskId: t.string(), outputAssetIds: t.string(),
  }),
  reducerSchema('fail_task', {
    taskId: t.string(), failureReason: t.string(),
  }),
  reducerSchema('write_signal', {
    projectId: t.string(), taskId: t.string(), signalType: t.string(),
    timestampMs: t.u64(), durationMs: t.u64(), confidence: t.f64(), payload: t.string(),
  }),
  reducerSchema('ingest_interaction_batch', {
    projectId: t.string(), taskId: t.string(), signalType: t.string(), batchJson: t.string(),
  }),
  reducerSchema('update_project_state', {
    projectId: t.string(), currentPhase: t.string(), status: t.string(),
  }),
  reducerSchema('update_worker_config', {
    workerId: t.string(), workerType: t.string(), isActive: t.bool(),
    concurrency: t.i32(), metadata: t.string(),
  }),
  reducerSchema('toggle_project_star', {
    projectId: t.string(),
  }),
  reducerSchema('create_folder', {
    name: t.string(), ownerId: t.string(), color: t.string(), sortOrder: t.i32(),
  }),
  reducerSchema('rename_folder', {
    folderId: t.string(), name: t.string(),
  }),
  reducerSchema('delete_folder', {
    folderId: t.string(),
  }),
  reducerSchema('move_project_to_folder', {
    projectId: t.string(), folderId: t.string(),
  }),
  reducerSchema('approve_timeline', {
    projectId: t.string(),
  }),
);

// ─── Remote Module ───────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const REMOTE_MODULE: any = {
  ...s.schemaType,
  ...r.reducersType,
  procedures: [] as const,
  versionInfo: { cliVersion: '2.0.4' },
};

type FlowModule = typeof s.schemaType & typeof r.reducersType & {
  procedures: readonly [];
  versionInfo: { cliVersion: string };
};

// ─── Context Types ───────────────────────────────────────────────────

export type EventContext = EventContextInterface<FlowModule>;
export type ReducerEventContext = ReducerEventContextInterface<FlowModule>;
export type SubscriptionEventContext = SubscriptionEventContextInterface<FlowModule>;
export type ErrorContext = ErrorContextInterface<FlowModule>;

// ─── DbConnection ────────────────────────────────────────────────────

export class DbConnection extends DbConnectionImpl<FlowModule> {
  static builder() {
    return new DbConnectionBuilder<DbConnection>(
      REMOTE_MODULE as any,
      (config: any) => new DbConnection(config)
    );
  }
}

// ─── Row Type Helpers (for store use) ────────────────────────────────

export type ProjectRow = {
  id: string;
  name: string;
  status: string;
  createdAt: bigint;
  updatedAt: bigint;
  ownerId: string;
  metadata: string;
  starred: boolean;
  folderId: string;
};

export type FolderRow = {
  id: string;
  name: string;
  ownerId: string;
  color: string;
  sortOrder: number;
  createdAt: bigint;
  updatedAt: bigint;
};

export type AssetRow = {
  id: string;
  projectId: string;
  assetType: string;
  gcsPath: string;
  sizeBytes: bigint;
  mimeType: string;
  durationMs: bigint;
  createdAt: bigint;
  metadata: string;
};

export type TaskRow = {
  id: string;
  projectId: string;
  taskType: string;
  status: string;
  workerId: string;
  inputAssetIds: string;
  outputAssetIds: string;
  config: string;
  createdAt: bigint;
  claimedAt: bigint;
  completedAt: bigint;
  failureReason: string;
  retryCount: number;
  maxRetries: number;
};

export type SignalRow = {
  id: string;
  projectId: string;
  taskId: string;
  signalType: string;
  timestampMs: bigint;
  durationMs: bigint;
  confidence: number;
  payload: string;
  createdAt: bigint;
};
