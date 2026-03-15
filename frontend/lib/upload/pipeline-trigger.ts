'use client';

/**
 * Pipeline trigger — after upload, creates the initial STDB tasks
 * that kick off the worker pipeline (audio extract, video sample, etc.).
 */

import { TaskType, AssetType, ProjectStatus } from '@flowstudio/shared';
import { getConnection, isConnected } from '../stdb/spacetimedb';

const INITIAL_TASK_TYPES = [
  TaskType.AUDIO_EXTRACT,
  TaskType.VIDEO_SAMPLE,
  TaskType.CURSOR_PROCESS,
  TaskType.TYPING_DETECT,
] as const;

interface TriggerOptions {
  projectId: string;
  gcsPath: string;
  fileSize: number;
  contentType: string;
  durationMs?: number;
  cursorDataFilename?: string;
  keyboardDataFilename?: string;
}

/**
 * Trigger the full processing pipeline after a video is uploaded.
 *
 * 1. Create an asset record in STDB
 * 2. Create initial tasks (AUDIO_EXTRACT, VIDEO_SAMPLE, etc.)
 * 3. Update project state to 'processing'
 */
export async function triggerPipeline(opts: TriggerOptions): Promise<void> {
  if (!isConnected()) {
    throw new Error('SpacetimeDB not connected. Cannot trigger pipeline.');
  }
  const { projectId, gcsPath, fileSize, contentType, durationMs, cursorDataFilename, keyboardDataFilename } = opts;
  const conn = getConnection();

  conn.reducers.createAsset({
    projectId,
    assetType: AssetType.SOURCE_VIDEO,
    gcsPath,
    sizeBytes: BigInt(fileSize),
    mimeType: contentType,
    durationMs: BigInt(durationMs ?? 0),
    metadata: JSON.stringify({ uploadedAt: new Date().toISOString() }),
  });

  const videoFilename = gcsPath.split('/').pop() ?? gcsPath;

  for (const taskType of INITIAL_TASK_TYPES) {
    let taskInputAssetIds: string[];
    if (taskType === TaskType.CURSOR_PROCESS) {
      taskInputAssetIds = cursorDataFilename ? [cursorDataFilename] : [];
    } else if (taskType === TaskType.TYPING_DETECT) {
      taskInputAssetIds = keyboardDataFilename ? [keyboardDataFilename] : [];
    } else {
      taskInputAssetIds = [videoFilename];
    }

    conn.reducers.createTask({
      projectId,
      taskType,
      inputAssetIds: JSON.stringify(taskInputAssetIds),
      config: '{}',
      maxRetries: 3,
    });
  }

  conn.reducers.updateProjectState({
    projectId,
    currentPhase: ProjectStatus.PROCESSING,
    status: ProjectStatus.PROCESSING,
  });
}
