# PLAN-X17 — Add approveTimeline + triggerRender Reducers

> **Problem**: The pipeline DAG maps `TIMELINE_BUILD → []` (no downstream). There is no way to trigger the `RENDER` task. The shared `TASK_DEPENDENCIES` says `RENDER` depends on `TIMELINE_BUILD`, but nothing creates the RENDER task. The `userApproveTimeline` concept exists in `packages/shared/__tests__/reprompt-loop.test.ts` but is not implemented in the STDB module.
>
> **Impact**: The pipeline stops at TIMELINE_BUILD. Users can never get a rendered video.

---

## Acceptance Criteria

- [ ] New STDB reducer `approveTimeline` creates a RENDER task for a project
- [ ] The RENDER task gets `inputAssetIds` from the TIMELINE_BUILD output + source video
- [ ] A test verifies the reducer creates the correct task
- [ ] Frontend has a "Render" button that calls this reducer
- [ ] RENDER completion updates project status to "rendered"

---

## Implementation

### Step 1: Add reducer to `stdb-module/src/index.ts`

```typescript
export const approveTimeline = stdb.reducer(
  "approveTimeline",
  { projectId: t.string() },
  (ctx: any, args: any) => {
    const projectId = args.projectId;
    const now = nowMs(ctx);

    // Find completed TIMELINE_BUILD task
    let timelineBuildTask: any = null;
    for (const task of ctx.db.tasks.byProjectId.filter(projectId)) {
      if (task.taskType === 'TIMELINE_BUILD' && task.status === 'completed') {
        timelineBuildTask = task;
        break;
      }
    }
    if (!timelineBuildTask) throw new Error("No completed TIMELINE_BUILD task");

    // Check RENDER doesn't already exist
    for (const task of ctx.db.tasks.byProjectId.filter(projectId)) {
      if (task.taskType === 'RENDER') throw new Error("RENDER task already exists");
    }

    // Collect inputAssetIds: timeline output + source video
    const timelineOutputs = JSON.parse(timelineBuildTask.outputAssetIds);
    ctx.db.tasks.insert({
      id: generateId(ctx), projectId, taskType: 'RENDER', status: 'pending',
      workerId: '', inputAssetIds: JSON.stringify(timelineOutputs),
      outputAssetIds: '[]', config: '{}',
      createdAt: now, claimedAt: 0n, completedAt: 0n,
      failureReason: '', retryCount: 0, maxRetries: MAX_TASK_RETRIES,
    });

    // Update state
    const state = ctx.db.projectState.projectId.find(projectId);
    if (state) ctx.db.projectState.projectId.update({ ...state, currentPhase: 'rendering', lastUpdated: now });
  },
);
```

### Step 2: Add to REDUCER_PARAMS in shared

```typescript
approveTimeline: ['projectId'],
```

### Step 3: Add "Render" button to frontend

In the export modal or studio page, add a button that calls:
```typescript
await callReducer('approveTimeline', { projectId });
```

---

## Dependencies

- X-01 (STDB call format)
- X-14 (source video propagation)
