# PLAN-X26 — Wire Timeline-Builder Output → Frontend

> **Problem**: The `timeline-builder` worker produces a `timeline.json` file in GCS and writes `TIMELINE_EVENT` signals to STDB. But the frontend doesn't read either of these. The timeline in the editor is populated only by manual clip placement or the AI agent chat flow (use-agent.ts). There is no path from the worker-produced timeline to the frontend editor.
>
> **Impact**: Even after the full worker pipeline completes, the timeline shows nothing.

---

## Acceptance Criteria

- [ ] When studio page loads a project with a completed TIMELINE_BUILD task, it fetches the timeline data
- [ ] Timeline data from the worker is converted to `TimelineClip[]` and applied to the editor
- [ ] This happens automatically (no user action needed)
- [ ] Worker-produced clips are visually distinct (same amber AI style from W-09)
- [ ] A test verifies the conversion from worker timeline format to editor format

---

## Implementation

### Step 1: Understand the worker output format

The `timeline-builder` worker writes `timeline/timeline.json` to GCS. Its format is:

```json
{
  "clips": [
    {
      "sourceStartMs": 0,
      "sourceEndMs": 5000,
      "outputStartMs": 0,
      "outputEndMs": 5000,
      "editType": "cut",
      "parameters": {},
      "sourceAssetId": "..."
    }
  ]
}
```

This is essentially the same as `EditDecision[]` — the `editPlanToTimelineClips` converter should work.

### Step 2: Create `lib/services/timeline-loader.ts`

```typescript
export async function loadWorkerTimeline(projectId: string): Promise<EditDecision[]> {
  // Option A: Read from STDB signals (EDIT_DECISION signals written by edit-planner)
  const signals = await queryTable('signals');
  const editSignals = signals
    .filter(s => s.projectId === projectId && s.signalType === 'EDIT_DECISION')
    .map(s => JSON.parse(s.payload as string));

  return editSignals;
}
```

### Step 3: Auto-apply in studio page

When the studio page loads with a `projectId` query param, check if the project has completed tasks and apply the edit plan.

---

## Dependencies

- X-15 (signal-fetcher framework)
- X-20 (pipeline status tracking — know when timeline is ready)
