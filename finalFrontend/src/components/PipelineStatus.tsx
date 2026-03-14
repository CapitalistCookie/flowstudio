'use client';

import type { Task } from '@flowstudio/shared';
import { TaskStatus } from '@flowstudio/shared';

interface PipelineStatusProps {
  tasks: Task[];
}

const STATUS_ICONS: Record<string, string> = {
  [TaskStatus.PENDING]: '\u25CB',
  [TaskStatus.CLAIMED]: '\u25D0',
  [TaskStatus.COMPLETED]: '\u2713',
  [TaskStatus.FAILED]: '\u2717',
  [TaskStatus.STALE]: '\u27F3',
};

const STATUS_COLORS: Record<string, string> = {
  [TaskStatus.PENDING]: 'var(--color-muted)',
  [TaskStatus.CLAIMED]: 'var(--color-warning)',
  [TaskStatus.COMPLETED]: 'var(--color-success)',
  [TaskStatus.FAILED]: 'var(--color-error)',
  [TaskStatus.STALE]: 'var(--color-warning)',
};

export function PipelineStatus({ tasks }: PipelineStatusProps) {
  const sorted = [...tasks].sort((a, b) => a.createdAt - b.createdAt);

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold uppercase tracking-wider" style={{ color: 'var(--color-muted)' }}>
        Pipeline
      </h3>
      <div className="space-y-1">
        {sorted.map(task => (
          <div
            key={task.id}
            className="flex items-center gap-3 glass-subtle rounded-xl px-3 py-2 text-sm"
          >
            <span style={{ color: STATUS_COLORS[task.status] ?? 'var(--color-muted)' }}>
              {STATUS_ICONS[task.status] ?? '?'}
            </span>
            <span className="flex-1 font-mono text-xs">
              {task.taskType.replace(/_/g, ' ').toLowerCase()}
            </span>
            <span className="text-xs" style={{ color: STATUS_COLORS[task.status] ?? 'var(--color-muted)' }}>
              {task.status}
            </span>
            {task.status === TaskStatus.FAILED && task.failureReason && (
              <span
                className="text-xs truncate max-w-[200px]"
                style={{ color: 'var(--color-error)' }}
                title={task.failureReason}
              >
                {task.failureReason}
              </span>
            )}
          </div>
        ))}
        {tasks.length === 0 && (
          <p className="text-sm" style={{ color: 'var(--color-muted)' }}>
            No tasks yet. Upload a video to start processing.
          </p>
        )}
      </div>
    </div>
  );
}
