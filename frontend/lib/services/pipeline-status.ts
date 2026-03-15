'use client';

/**
 * Pipeline Status — tracks worker progress for a project.
 *
 * Polls STDB tasks table and provides aggregate status so the UI
 * can show real-time pipeline progress.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { TaskType } from '@flowstudio/shared';
import { getConnection, isConnected } from '../stdb/spacetimedb';

export interface TaskStatus {
  taskType: string;
  status: string;
  failureReason?: string;
}

export interface PipelineStatus {
  tasks: TaskStatus[];
  completedCount: number;
  totalCount: number;
  currentPhase: string;
  isComplete: boolean;
  hasFailed: boolean;
  hasSignals: boolean;
}

const PIPELINE_TASK_ORDER: string[] = [
  TaskType.AUDIO_EXTRACT,
  TaskType.VIDEO_SAMPLE,
  TaskType.CURSOR_PROCESS,
  TaskType.TYPING_DETECT,
  TaskType.SPEECH_TRANSCRIPTION,
  TaskType.VIDEO_UNDERSTANDING,
  TaskType.UI_CHANGE_DETECT,
  TaskType.INTERACTION_PATTERN,
  TaskType.INTENT_GRAPH,
  TaskType.NARRATIVE_PLAN,
  TaskType.EDIT_PLAN,
  TaskType.TIMELINE_BUILD,
  TaskType.RENDER,
];

/** Build pipeline status from the SDK's in-memory task cache. */
export function getPipelineStatus(projectId: string): PipelineStatus {
  const tasks: TaskStatus[] = [];

  if (isConnected()) {
    try {
      const conn = getConnection();
      for (const row of conn.db.tasks.iter()) {
        if (row.projectId === projectId) {
          tasks.push({
            taskType: row.taskType,
            status: row.status,
            failureReason: row.failureReason || undefined,
          });
        }
      }
    } catch {
      // Connection not ready yet
    }
  }

  const bestStatus = new Map<string, TaskStatus>();
  for (const task of tasks) {
    const existing = bestStatus.get(task.taskType);
    if (!existing || task.status === 'completed' || (task.status === 'claimed' && existing.status === 'pending')) {
      bestStatus.set(task.taskType, task);
    }
  }

  const orderedTasks = PIPELINE_TASK_ORDER
    .filter((type) => bestStatus.has(type))
    .map((type) => bestStatus.get(type)!);

  const completedCount = orderedTasks.filter((t) => t.status === 'completed').length;
  const totalCount = orderedTasks.length;
  const hasFailed = orderedTasks.some((t) => t.status === 'failed');
  const isComplete = totalCount > 0 && completedCount === totalCount;

  let currentPhase = 'waiting';
  const claimed = orderedTasks.find((t) => t.status === 'claimed');
  if (claimed) currentPhase = claimed.taskType;
  else if (isComplete) currentPhase = 'complete';
  else if (hasFailed) currentPhase = 'failed';

  const signalProducers = [
    TaskType.SPEECH_TRANSCRIPTION,
    TaskType.VIDEO_UNDERSTANDING,
    TaskType.UI_CHANGE_DETECT,
    TaskType.INTERACTION_PATTERN,
  ];
  const hasSignals = signalProducers.every((type) => {
    const task = bestStatus.get(type);
    return task && task.status === 'completed';
  });

  return { tasks: orderedTasks, completedCount, totalCount, currentPhase, isComplete, hasFailed, hasSignals };
}

/**
 * React hook that reactively tracks pipeline status.
 * Uses STDB onInsert/onUpdate callbacks for real-time push (no polling).
 * Falls back to a slow poll if SDK is not connected yet.
 */
export function usePipelineStatus(projectId: string | null, pollIntervalMs = 3000) {
  const [status, setStatus] = useState<PipelineStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const callbacksWired = useRef(false);

  const refresh = useCallback(() => {
    if (!projectId) return;
    try {
      const s = getPipelineStatus(projectId);
      setStatus(s);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch status');
    }
  }, [projectId]);

  useEffect(() => {
    if (!projectId) return;

    // Initial read
    refresh();

    // Wire reactive callbacks if SDK is connected
    if (isConnected() && !callbacksWired.current) {
      try {
        const conn = getConnection();
        const onTaskChange = () => refresh();
        conn.db.tasks.onInsert(onTaskChange);
        conn.db.tasks.onUpdate(onTaskChange);
        callbacksWired.current = true;
      } catch {
        // SDK not ready — fall through to polling
      }
    }

    // Fallback poll for when SDK hasn't connected yet
    const interval = setInterval(() => {
      refresh();
    }, pollIntervalMs);

    return () => clearInterval(interval);
  }, [projectId, pollIntervalMs, refresh]);

  return { status, error, refresh };
}
