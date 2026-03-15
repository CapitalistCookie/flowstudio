/**
 * MIGRATION NOTE: These manual type definitions mirror the SpacetimeDB module schema.
 * When `spacetime generate` bindings are available, these should be replaced with
 * the auto-generated types from `module_bindings/`.
 * See: packages/stdb-module/package.json scripts (stdb:generate:frontend, stdb:generate:workers)
 */

import { TaskType, TaskStatus, ProjectStatus, AssetType, SignalType } from './enums.js';

/** SpacetimeDB: projects table */
export interface Project {
  id: string;
  name: string;
  status: ProjectStatus;
  createdAt: number;     // Unix ms
  updatedAt: number;
  ownerId: string;
  metadata: string;      // JSON string
  starred: boolean;
  folderId: string;      // empty string = ungrouped
}

/** SpacetimeDB: folders table */
export interface Folder {
  id: string;
  name: string;
  ownerId: string;
  color: string;
  sortOrder: number;
  createdAt: number;
  updatedAt: number;
}

/** SpacetimeDB: assets table */
export interface Asset {
  id: string;
  projectId: string;
  assetType: AssetType;
  gcsPath: string;       // gs://bucket/path
  sizeBytes: number;
  mimeType: string;
  durationMs: number;    // 0 for non-temporal assets
  createdAt: number;
  metadata: string;      // JSON string
}

/** SpacetimeDB: tasks table */
export interface Task {
  id: string;
  projectId: string;
  taskType: TaskType;
  status: TaskStatus;
  workerId: string;       // empty if unclaimed
  inputAssetIds: string;  // JSON array string
  outputAssetIds: string; // JSON array string
  config: string;         // JSON string
  createdAt: number;
  claimedAt: number;
  completedAt: number;
  failureReason: string;
  retryCount: number;
  maxRetries: number;
}

/** SpacetimeDB: signals table */
export interface Signal {
  id: string;
  projectId: string;
  taskId: string;
  signalType: SignalType;
  timestampMs: number;    // Position in source video
  durationMs: number;
  confidence: number;     // 0-1
  payload: string;        // JSON string with signal-specific data
  createdAt: number;
}

/** SpacetimeDB: project_state table */
export interface ProjectState {
  projectId: string;      // primary key
  completedTasks: string; // JSON array of TaskType
  totalTasks: number;
  completedCount: number;
  currentPhase: string;
  lastUpdated: number;
}

/** SpacetimeDB: worker_configs table */
export interface WorkerConfig {
  workerId: string;       // primary key
  workerType: TaskType;
  lastHeartbeat: number;
  isActive: boolean;
  concurrency: number;
  metadata: string;       // JSON string
}

/** SpacetimeDB: timeline_clips table */
export interface TimelineClipRow {
  id: string;
  projectId: string;
  mediaFileId: string;
  trackId: string;
  startTime: number;      // pixels from left
  duration: number;       // width in pixels
  mediaOffset: number;    // offset into source media (pixels)
  label: string;
  clipType: string;       // "video" | "audio"
  transform: string;      // JSON string of ClipTransform
  effects: string;        // JSON string of ClipEffects
  aiReasoning: string;
  sortOrder: number;
  updatedBy: string;
}

/** SpacetimeDB: media_files table */
export interface MediaFileRow {
  id: string;
  projectId: string;
  name: string;
  durationSeconds: number;
  fileType: string;
  gcsPath: string;
  gcsUrl: string;
  sizeBytes: number;
  captionsJson: string;   // JSON string of Caption[]
}

/** SpacetimeDB: effect_blocks table */
export interface EffectBlockRow {
  id: string;
  projectId: string;
  effectType: string;
  startTime: number;
  duration: number;
  config: string;         // JSON string
}

/** SpacetimeDB: project_presence table */
export interface ProjectPresenceRow {
  id: string;             // identity hex
  projectId: string;
  firebaseUid: string;
  displayName: string;
  color: string;
  lastHeartbeat: number;
  currentTimelinePosition: number;
}

/** SpacetimeDB: project_locks table */
export interface ProjectLockRow {
  projectId: string;      // primary key
  lockedBy: string;       // firebase UID
  lockedByName: string;
  lockedAt: number;
  expiresAt: number;
  lockVersion: number;
}
