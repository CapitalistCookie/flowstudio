'use client';

import { useProjectStore } from '@/hooks/useStores';
import { Badge } from '@/components/ui/Badge';
import { TaskStatus } from '@flowstudio/shared';
import { Loader2 } from 'lucide-react';

export function PipelineOverlay() {
  const tasks = useProjectStore((s) => s.tasks);

  const activeTasks = tasks.filter(
    (t) => t.status === TaskStatus.CLAIMED || t.status === TaskStatus.PENDING
  );
  const failedTasks = tasks.filter((t) => t.status === TaskStatus.FAILED);
  const completedCount = tasks.filter((t) => t.status === TaskStatus.COMPLETED).length;
  const totalCount = tasks.length;

  if (totalCount === 0 || completedCount === totalCount) return null;

  const progress = Math.round((completedCount / totalCount) * 100);

  return (
    <div
      className="absolute bottom-4 left-4 right-4 rounded-xl p-3 z-10"
      style={{
        backgroundColor: 'rgba(255, 255, 255, 0.92)',
        border: '1px solid var(--color-border)',
        backdropFilter: 'blur(12px)',
      }}
    >
      <div className="flex items-center gap-3">
        <Loader2 className="h-4 w-4 animate-spin" style={{ color: 'var(--color-primary)' }} />
        <div className="flex-1">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-medium">Processing pipeline</span>
            <span className="text-xs" style={{ color: 'var(--color-muted)' }}>
              {completedCount}/{totalCount} tasks
            </span>
          </div>
          <div
            className="h-1.5 rounded-full overflow-hidden"
            style={{ backgroundColor: 'var(--color-surface)' }}
          >
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${progress}%`,
                backgroundColor: failedTasks.length > 0 ? 'var(--color-error)' : 'var(--color-primary)',
              }}
            />
          </div>
        </div>
        {failedTasks.length > 0 && (
          <Badge variant="error">{failedTasks.length} failed</Badge>
        )}
      </div>
      {activeTasks.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {activeTasks.slice(0, 3).map((task) => (
            <Badge key={task.id} variant="outline" className="text-xs">
              {task.taskType.replace(/_/g, ' ').toLowerCase()}
            </Badge>
          ))}
          {activeTasks.length > 3 && (
            <Badge variant="outline" className="text-xs">
              +{activeTasks.length - 3} more
            </Badge>
          )}
        </div>
      )}
    </div>
  );
}
