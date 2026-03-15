# PLAN-X13 — Fix inputAssetIds Semantics Across the DAG

> **Problem**: `pipeline-trigger.ts` passes `inputAssetIds: JSON.stringify([gcsPath])` for all four initial tasks. But:
> 1. `cursor-processor` expects `inputAssetIds[0]` to be a filename like `events.json` under `projects/{projectId}/cursor_data/`
> 2. `typing-detector` expects the same pattern under `keyboard_data/`
> 3. `audio-extract` and `video-sample` expect it to be the source video filename
> 4. Downstream tasks (created by `completeTask` DAG) get `outputAssetIds` from upstream, which are asset IDs like `audio-{projectId}` — correct semantics
>
> The initial tasks are the problem. Workers construct GCS paths as `projects/{projectId}/{subfolder}/{inputAssetIds[0]}`. If the input is a full GCS path like `projects/p1/source_video/recording_123.webm`, the constructed path becomes `projects/p1/source_video/projects/p1/source_video/recording_123.webm` — doubled and wrong.
>
> **Impact**: Every initial worker fails to find its input file in GCS.

---

## Acceptance Criteria

- [ ] `pipeline-trigger.ts` passes just the **filename** (not full GCS path) as `inputAssetIds`
- [ ] `audio-extract` receives `["recording_123.webm"]` and builds `projects/{projectId}/source_video/recording_123.webm`
- [ ] `video-sample` receives the same
- [ ] `cursor-processor` receives `["events.json"]` (or an empty array if no cursor data)
- [ ] `typing-detector` receives `["events.json"]` (or empty if no keyboard data)
- [ ] A test verifies the path construction doesn't double-nest
- [ ] Worker path construction works for both initial tasks and DAG-chained tasks

---

## Tests to Write FIRST

### `packages/shared/__tests__/input-asset-id-semantics.test.ts`

```typescript
describe('inputAssetIds semantics', () => {
  it('initial video tasks get filename only, not full GCS path', () => {
    const gcsPath = 'projects/p1/source_video/recording_123.webm';
    const filename = gcsPath.split('/').pop(); // 'recording_123.webm'
    const constructedPath = `projects/p1/source_video/${filename}`;
    expect(constructedPath).toBe(gcsPath); // No doubling
  });

  it('cursor-processor with empty inputAssetIds returns empty signals', () => {
    // Worker should handle [] gracefully
  });

  it('downstream task inputAssetIds are asset IDs from upstream outputs', () => {
    // audio-extract outputs: ["audio-p1"]
    // speech-transcription receives inputAssetIds: ["audio-p1"]
    // speech-transcription constructs: projects/p1/audio_track/audio.wav (using a known path, not the asset ID directly)
  });
});
```

---

## Implementation

### Step 1: Fix `pipeline-trigger.ts`

```typescript
// Extract just the filename from gcsPath
const videoFilename = gcsPath.split('/').pop() ?? gcsPath;

for (const taskType of INITIAL_TASK_TYPES) {
  let inputAssetIds: string[];
  if (taskType === 'CURSOR_PROCESS') {
    inputAssetIds = hasCursorData ? ['events.json'] : [];
  } else if (taskType === 'TYPING_DETECT') {
    inputAssetIds = hasKeyboardData ? ['events.json'] : [];
  } else {
    inputAssetIds = [videoFilename];
  }

  await callReducer('createTask', {
    projectId, taskType,
    inputAssetIds: JSON.stringify(inputAssetIds),
    config: '{}', maxRetries: 3,
  });
}
```

### Step 2: Verify each worker's path construction handles both filename and asset ID

Review and fix path construction in all 13 workers.

---

## Dependencies

- X-01 (STDB call format — must work first)
- X-09 (GCS path contracts — provides the path verification framework)
