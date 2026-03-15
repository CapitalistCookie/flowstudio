# PLAN-X14 — Propagate Source Video Through the DAG

> **Problem**: `TIMELINE_BUILD` and `RENDER` workers need access to the original source video. But:
> 1. `TIMELINE_BUILD` gets `inputAssetIds` from `EDIT_PLAN`'s `outputAssetIds` = `["edit-plan-{projectId}"]`
> 2. `RENDER` gets `inputAssetIds` from `TIMELINE_BUILD`'s `outputAssetIds` = `["timeline-{projectId}"]`
> 3. Neither receives the source video asset ID
>
> The workers hardcode the source video path as `projects/{projectId}/source_video/...` and list GCS files, but this is fragile.
>
> **Impact**: `TIMELINE_BUILD` and `RENDER` can't find the source video reliably.

---

## Acceptance Criteria

- [ ] Source video asset ID/path is available to `TIMELINE_BUILD` and `RENDER`
- [ ] Workers don't need to guess or list GCS directories to find the source video
- [ ] A test verifies the source video path is accessible at each stage

---

## Design Options

### Option A: Store source video path in task config

When creating initial tasks, include `sourceVideoPath` in the task config. This propagates through DAG chaining since `completeTask` uses `config: "{}"` for downstream tasks.

Problem: downstream tasks get empty config `{}`, so this doesn't propagate.

### Option B: Store source video path in project metadata

The `projects` table has a `metadata` field. Store `sourceVideoPath` there. Any worker can query `projects` to find the source video.

This is the cleanest approach — the source video is a project-level attribute, not a task-level one.

### Option C: Always use convention-based paths

Workers look for `projects/{projectId}/source_video/*` and pick the first file. This is what some workers do now.

Fragile if multiple source videos exist.

### Recommendation: Option B

---

## Implementation

### Step 1: Update `pipeline-trigger.ts` to store source video path in project metadata

```typescript
// After creating the asset, update project metadata
await callReducer('updateProjectState', {
  projectId,
  currentPhase: 'processing',
  status: 'processing',
});
```

Actually, we should store it in the asset table. The `createAsset` call already stores `gcsPath`. Workers can query the asset by `projectId` and `assetType='source_video'`.

### Step 2: Update `TIMELINE_BUILD` and `RENDER` workers

Instead of using `inputAssetIds[0]` as the source video, query the assets table for the project's `source_video` asset:

```typescript
const assets = await this.stdb.queryTable('assets');
const sourceVideo = assets.find(a => a.projectId === task.projectId && a.assetType === 'source_video');
const videoPath = sourceVideo?.gcsPath;
```

### Step 3: Test

```typescript
it('TIMELINE_BUILD finds source video via asset query, not inputAssetIds', () => {
  // Mock STDB queryTable to return a source_video asset
  // Verify worker uses that path, not inputAssetIds[0]
});
```

---

## Dependencies

- X-01 (STDB calls must work)
- X-04 (createAsset must include durationMs)
- X-13 (inputAssetIds semantics must be correct for initial tasks)
