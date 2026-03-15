'use client';

/**
 * Pipeline trigger — after upload, creates the initial STDB tasks
 * that kick off the worker pipeline (audio extract, video sample, etc.).
 */

import { callReducer } from '../stdb/connection';

const INITIAL_TASK_TYPES = [
  'AUDIO_EXTRACT',
  'VIDEO_SAMPLE',
  'CURSOR_PROCESS',
  'TYPING_DETECT',
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
  const { projectId, gcsPath, fileSize, contentType, durationMs, cursorDataFilename, keyboardDataFilename } = opts;

  await callReducer('createAsset', {
    projectId,
    assetType: 'source_video',
    gcsPath,
    sizeBytes: fileSize,
    mimeType: contentType,
    durationMs: durationMs ?? 0,
    metadata: JSON.stringify({
      uploadedAt: new Date().toISOString(),
    }),
  });

  const videoFilename = gcsPath.split('/').pop() ?? gcsPath;

  for (const taskType of INITIAL_TASK_TYPES) {
    let taskInputAssetIds: string[];
    if (taskType === 'CURSOR_PROCESS') {
      taskInputAssetIds = cursorDataFilename ? [cursorDataFilename] : [];
    } else if (taskType === 'TYPING_DETECT') {
      taskInputAssetIds = keyboardDataFilename ? [keyboardDataFilename] : [];
    } else {
      taskInputAssetIds = [videoFilename];
    }

    await callReducer('createTask', {
      projectId,
      taskType,
      inputAssetIds: JSON.stringify(taskInputAssetIds),
      config: '{}',
      maxRetries: 3,
    });
  }

  await callReducer('updateProjectState', {
    projectId,
    currentPhase: 'processing',
    status: 'processing',
  });
}
