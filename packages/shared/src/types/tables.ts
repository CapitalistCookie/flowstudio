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
