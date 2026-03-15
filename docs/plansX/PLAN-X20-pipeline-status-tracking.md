# PLAN-X20 — Pipeline Status Tracking

> **Problem**: After the pipeline is triggered (tasks created in STDB), the frontend has no way to know:
> 1. Which tasks have completed
> 2. What the current pipeline phase is
> 3. When all signals are ready for AI planning
> 4. Whether any task failed
>
> There's no polling, no WebSocket subscription, no status display.
>
> **Impact**: After uploading, the user stares at a blank screen with no progress indication.

---

## Acceptance Criteria

- [ ] Studio page shows pipeline progress when a project is processing
- [ ] Each task type is shown with status (pending/claimed/completed/failed)
- [ ] Progress bar shows overall completion (X of Y tasks done)
- [ ] When all tasks complete, the "Generate Edit Plan" button becomes available
- [ ] Polling interval is configurable (default 3 seconds)
- [ ] Failed tasks show error messages

---

## Implementation

### Step 1: Create `lib/services/pipeline-status.ts`

```typescript
import { queryTable } from '../stdb/connection';

export interface PipelineStatus {
  tasks: Array<{
    taskType: string;
    status: string;
    failureReason?: string;
  }>;
  completedCount: number;
  totalCount: number;
  currentPhase: string;
  isComplete: boolean;
  hasFailed: boolean;
}

export async function getPipelineStatus(projectId: string): Promise<PipelineStatus> {
  const allTasks = await queryTable('tasks');
  const tasks = allTasks.filter(t => t.projectId === projectId);
  // ... aggregate status
}
```

### Step 2: Create `usePipelineStatus` hook

```typescript
export function usePipelineStatus(projectId: string, pollIntervalMs = 3000) {
  const [status, setStatus] = useState<PipelineStatus | null>(null);

  useEffect(() => {
    if (!projectId) return;
    const interval = setInterval(async () => {
      const s = await getPipelineStatus(projectId);
      setStatus(s);
      if (s.isComplete || s.hasFailed) clearInterval(interval);
    }, pollIntervalMs);
    return () => clearInterval(interval);
  }, [projectId, pollIntervalMs]);

  return status;
}
```

### Step 3: Add status display to Studio page

Show a pipeline progress panel when the project is in "processing" state.

---

## Dependencies

- X-01 (STDB queries must work)
- X-18 (STDB connection)
- X-19 (projects in STDB)
