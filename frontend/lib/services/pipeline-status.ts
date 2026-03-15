'use client';

/**
 * Pipeline Status — tracks worker progress for a project.
 *
 * Polls STDB tasks table and provides aggregate status so the UI
 * can show real-time pipeline progress.
 */

import { useState, useEffect, useCallback } from 'react';
import { queryTable } from '../stdb/connection';

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

const PIPELINE_TASK_ORDER = [
  'AUDIO_EXTRACT',
  'VIDEO_SAMPLE',
  'CURSOR_PROCESS',
  'TYPING_DETECT',
  'SPEECH_TRANSCRIPTION',
  'VIDEO_UNDERSTANDING',
  'UI_CHANGE_DETECT',
  'INTERACTION_PATTERN',
  'INTENT_GRAPH',
  'NARRATIVE_PLAN',
  'EDIT_PLAN',
  'TIMELINE_BUILD',
  'RENDER',
];

export async function getPipelineStatus(projectId: string): Promise<PipelineStatus> {
  const allTasks = await queryTable('tasks');
  const tasks = (allTasks as Array<Record<string, unknown>>)
    .filter((t) => t.projectId === projectId)
    .map((t) => ({
      taskType: t.taskType as string,
      status: t.status as string,
      failureReason: (t.failureReason as string) || undefined,
    }));

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

  const signalProducers = ['SPEECH_TRANSCRIPTION', 'VIDEO_UNDERSTANDING', 'UI_CHANGE_DETECT', 'INTERACTION_PATTERN'];
  const hasSignals = signalProducers.every((type) => {
    const task = bestStatus.get(type);
    return task && task.status === 'completed';
  });

  return { tasks: orderedTasks, completedCount, totalCount, currentPhase, isComplete, hasFailed, hasSignals };
}

export function usePipelineStatus(projectId: string | null, pollIntervalMs = 3000) {
  const [status, setStatus] = useState<PipelineStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!projectId) return;
    try {
      const s = await getPipelineStatus(projectId);
      setStatus(s);
      setError(null);
      return s;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch status');
      return null;
    }
  }, [projectId]);

  useEffect(() => {
    if (!projectId) return;

    refresh();

    const interval = setInterval(async () => {
      const s = await refresh();
      if (s && (s.isComplete || s.hasFailed)) {
        clearInterval(interval);
      }
    }, pollIntervalMs);

    return () => clearInterval(interval);
  }, [projectId, pollIntervalMs, refresh]);

  return { status, error, refresh };
}
