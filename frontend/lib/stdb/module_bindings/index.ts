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

// ─── Timeline Persistence Tables ─────────────────────────────────────

const timelineClips = table({
  name: 'timeline_clips', public: true,
  indexes: [{ accessor: 'byProjectId', algorithm: 'btree' as const, columns: ['projectId'] as const }],
}, {
  id: t.string().primaryKey(),
  projectId: t.string(),
  mediaFileId: t.string(),
  trackId: t.string(),
  startTime: t.f64(),
  duration: t.f64(),
  mediaOffset: t.f64(),
  label: t.string(),
  clipType: t.string(),
  transform: t.string(),
  effects: t.string(),
  aiReasoning: t.string(),
  sortOrder: t.i32(),
  updatedBy: t.string(),
});

const mediaFilesTable = table({
  name: 'media_files', public: true,
  indexes: [{ accessor: 'byProjectId', algorithm: 'btree' as const, columns: ['projectId'] as const }],
}, {
  id: t.string().primaryKey(),
  projectId: t.string(),
  name: t.string(),
  durationSeconds: t.f64(),
  fileType: t.string(),
  gcsPath: t.string(),
  gcsUrl: t.string(),
  sizeBytes: t.u64(),
  captionsJson: t.string(),
});

const effectBlocks = table({
  name: 'effect_blocks', public: true,
  indexes: [{ accessor: 'byProjectId', algorithm: 'btree' as const, columns: ['projectId'] as const }],
}, {
  id: t.string().primaryKey(),
  projectId: t.string(),
  effectType: t.string(),
  startTime: t.f64(),
  duration: t.f64(),
  config: t.string(),
});

const projectPresence = table({
  name: 'project_presence', public: true,
  indexes: [{ accessor: 'byProjectId', algorithm: 'btree' as const, columns: ['projectId'] as const }],
}, {
  id: t.string().primaryKey(),
  projectId: t.string(),
  firebaseUid: t.string(),
  displayName: t.string(),
  color: t.string(),
  lastHeartbeat: t.u64(),
  currentTimelinePosition: t.f64(),
});

const projectLocks = table({
  name: 'project_locks', public: true,
}, {
  projectId: t.string().primaryKey(),
  lockedBy: t.string(),
  lockedByName: t.string(),
  lockedAt: t.u64(),
  expiresAt: t.u64(),
  lockVersion: t.i32(),
});

const projectCollaborators = table({
  name: 'project_collaborators', public: true,
  indexes: [
    { accessor: 'byProjectId', algorithm: 'btree' as const, columns: ['projectId'] as const },
    { accessor: 'byFirebaseUid', algorithm: 'btree' as const, columns: ['firebaseUid'] as const },
  ],
}, {
  id: t.string().primaryKey(),
  projectId: t.string(),
  firebaseUid: t.string(),
  role: t.string(),
  displayName: t.string(),
  email: t.string(),
  addedBy: t.string(),
  addedAt: t.u64(),
});

const shareLinks = table({
  name: 'share_links', public: true,
  indexes: [
    { accessor: 'byProjectId', algorithm: 'btree' as const, columns: ['projectId'] as const },
  ],
}, {
  id: t.string().primaryKey(),
  projectId: t.string(),
  token: t.string(),
  role: t.string(),
  createdBy: t.string(),
  createdAt: t.u64(),
  expiresAt: t.u64(),
  maxUses: t.i32(),
  useCount: t.i32(),
});

// ─── Schema & Reducers ───────────────────────────────────────────────

const s = schema({ projects, folders, assets, tasks, signals, timelineClips, mediaFiles: mediaFilesTable, effectBlocks, projectPresence, projectLocks, projectCollaborators, shareLinks });

const r = reducers(
  reducerSchema('create_project', {
    id: t.string(), name: t.string(), ownerId: t.string(), metadata: t.string(),
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
  reducerSchema('rename_project', {
    projectId: t.string(), name: t.string(),
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
  reducerSchema('register_identity', {
    firebaseUid: t.string(),
  }),
  // Timeline reducers
  reducerSchema('upsert_timeline_clip', {
    projectId: t.string(), clipId: t.string(), mediaFileId: t.string(), trackId: t.string(),
    startTime: t.f64(), duration: t.f64(), mediaOffset: t.f64(), label: t.string(),
    clipType: t.string(), transform: t.string(), effects: t.string(), aiReasoning: t.string(), sortOrder: t.i32(),
  }),
  reducerSchema('remove_timeline_clip', { clipId: t.string() }),
  reducerSchema('batch_upsert_timeline_clips', { projectId: t.string(), clipsJson: t.string() }),
  reducerSchema('clear_project_timeline', { projectId: t.string() }),
  // Media file reducers
  reducerSchema('create_media_file', {
    id: t.string(), projectId: t.string(), name: t.string(), durationSeconds: t.f64(),
    fileType: t.string(), gcsPath: t.string(), gcsUrl: t.string(), sizeBytes: t.u64(), captionsJson: t.string(),
  }),
  reducerSchema('update_media_file_captions', { mediaFileId: t.string(), captionsJson: t.string() }),
  reducerSchema('remove_media_file', { mediaFileId: t.string() }),
  // Effect block reducers
  reducerSchema('upsert_effect_block', {
    id: t.string(), projectId: t.string(), effectType: t.string(),
    startTime: t.f64(), duration: t.f64(), config: t.string(),
  }),
  reducerSchema('remove_effect_block', { effectBlockId: t.string() }),
  // Presence reducers
  reducerSchema('join_project', { projectId: t.string(), displayName: t.string() }),
  reducerSchema('leave_project', {}),
  reducerSchema('heartbeat_presence', { currentTimelinePosition: t.f64() }),
  // Lock reducers
  reducerSchema('acquire_lock', { projectId: t.string(), displayName: t.string() }),
  reducerSchema('renew_lock', { projectId: t.string() }),
  reducerSchema('release_lock', { projectId: t.string() }),
  reducerSchema('force_release_lock', { projectId: t.string() }),
  // Collaboration reducers
  reducerSchema('add_collaborator', {
    projectId: t.string(), firebaseUid: t.string(), role: t.string(), displayName: t.string(), email: t.string(),
  }),
  reducerSchema('update_collaborator_role', {
    projectId: t.string(), firebaseUid: t.string(), role: t.string(),
  }),
  reducerSchema('remove_collaborator', {
    projectId: t.string(), firebaseUid: t.string(),
  }),
  reducerSchema('leave_collaborator_project', {
    projectId: t.string(),
  }),
  reducerSchema('create_share_link', {
    projectId: t.string(), role: t.string(), expiresAt: t.u64(), maxUses: t.i32(),
  }),
  reducerSchema('delete_share_link', {
    linkId: t.string(),
  }),
  reducerSchema('redeem_share_link', {
    token: t.string(),
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

export type TimelineClipRow = {
  id: string;
  projectId: string;
  mediaFileId: string;
  trackId: string;
  startTime: number;
  duration: number;
  mediaOffset: number;
  label: string;
  clipType: string;
  transform: string;
  effects: string;
  aiReasoning: string;
  sortOrder: number;
  updatedBy: string;
};

export type MediaFileRow = {
  id: string;
  projectId: string;
  name: string;
  durationSeconds: number;
  fileType: string;
  gcsPath: string;
  gcsUrl: string;
  sizeBytes: bigint;
  captionsJson: string;
};

export type EffectBlockRow = {
  id: string;
  projectId: string;
  effectType: string;
  startTime: number;
  duration: number;
  config: string;
};

export type ProjectPresenceRow = {
  id: string;
  projectId: string;
  firebaseUid: string;
  displayName: string;
  color: string;
  lastHeartbeat: bigint;
  currentTimelinePosition: number;
};

export type ProjectLockRow = {
  projectId: string;
  lockedBy: string;
  lockedByName: string;
  lockedAt: bigint;
  expiresAt: bigint;
  lockVersion: number;
};

export type ProjectCollaboratorRow = {
  id: string;
  projectId: string;
  firebaseUid: string;
  role: string;
  displayName: string;
  email: string;
  addedBy: string;
  addedAt: bigint;
};

export type ShareLinkRow = {
  id: string;
  projectId: string;
  token: string;
  role: string;
  createdBy: string;
  createdAt: bigint;
  expiresAt: bigint;
  maxUses: number;
  useCount: number;
};
