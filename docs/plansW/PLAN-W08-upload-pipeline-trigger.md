# PLAN-W08 — Upload → Pipeline Trigger

> **Problem**: Even though `finalFrontend` can upload to GCS, the connection between "video uploaded" and "pipeline starts processing" is not wired end-to-end.
> **Goal**: User uploads/records video → STDB tasks are created → Workers pick them up → Pipeline runs to completion.

---

## The Flow

```
User records screen (or uploads video)
  → Blob created in browser
  → Fetch signed upload URL from Cloud Function
  → PUT blob to GCS at projects/{projectId}/source_video/recording.webm
  → Call STDB reducer: createAsset(projectId, "source_video", gcsPath, ...)
  → Call STDB reducer: createTask(projectId, "AUDIO_EXTRACT", ["source-{projectId}"])
  → Call STDB reducer: createTask(projectId, "VIDEO_SAMPLE", ["source-{projectId}"])
  → If cursor data captured:
      → Upload cursor_data/events.json to GCS
      → createTask(projectId, "CURSOR_PROCESS", ["cursor-{projectId}"])
  → If keyboard data captured:
      → Upload keyboard_data/events.json to GCS
      → createTask(projectId, "TYPING_DETECT", ["keyboard-{projectId}"])
  → STDB DAG takes over: as tasks complete, downstream tasks auto-created
```

---

## Components

### 1. Upload Orchestrator (`frontend/lib/upload/pipeline-trigger.ts`)

```typescript
export async function triggerPipeline(
  projectId: string,
  videoBlob: Blob,
  captureData?: { cursor: CursorEvent[]; keyboard: KeyboardEvent[] }
): Promise<void> {
  // 1. Upload video
  const videoUrl = await uploadToGcs(projectId, "source_video/recording.webm", videoBlob);

  // 2. Create source asset
  await callReducer("createAsset", projectId, "source_video", videoUrl, videoBlob.size, "video/webm");

  // 3. Create initial extraction tasks
  await callReducer("createTask", projectId, "AUDIO_EXTRACT", [`source-${projectId}`]);
  await callReducer("createTask", projectId, "VIDEO_SAMPLE", [`source-${projectId}`]);

  // 4. Upload capture data if available
  if (captureData?.cursor?.length) {
    const cursorUrl = await uploadJsonToGcs(projectId, "cursor_data/events.json", captureData.cursor);
    await callReducer("createAsset", projectId, "cursor_data", cursorUrl, 0, "application/json");
    await callReducer("createTask", projectId, "CURSOR_PROCESS", [`cursor-${projectId}`]);
  }

  if (captureData?.keyboard?.length) {
    const kbUrl = await uploadJsonToGcs(projectId, "keyboard_data/events.json", captureData.keyboard);
    await callReducer("createAsset", projectId, "keyboard_data", kbUrl, 0, "application/json");
    await callReducer("createTask", projectId, "TYPING_DETECT", [`keyboard-${projectId}`]);
  }
}
```

### 2. Record Page Integration

After recording stops:
```typescript
const blob = await stopRecording();
const projectId = await createProject("My Recording");
await triggerPipeline(projectId, blob, { cursor: cursorEvents, keyboard: keyboardEvents });
router.push(`/studio?projectId=${projectId}`);
```

### 3. Upload Page (drag-and-drop)

```typescript
const onDrop = async (file: File) => {
  const projectId = await createProject(file.name);
  await triggerPipeline(projectId, file);
  router.push(`/studio?projectId=${projectId}`);
};
```

---

## STDB DAG Chain

Once initial tasks are created, the STDB `completeTask` reducer automatically creates downstream tasks:

```
AUDIO_EXTRACT ────→ SPEECH_TRANSCRIPTION
VIDEO_SAMPLE ─────→ VIDEO_UNDERSTANDING
                  → UI_CHANGE_DETECT
CURSOR_PROCESS ──→ INTERACTION_PATTERN
TYPING_DETECT ───→ INTERACTION_PATTERN

INTERACTION_PATTERN → INTENT_GRAPH (waits for all 4 upstream signals)
INTENT_GRAPH → NARRATIVE_PLAN → EDIT_PLAN → TIMELINE_BUILD
```

Workers poll for available tasks and process them. No additional orchestration needed.

---

## Missing: What if no cursor/keyboard data?

If user uploads a video file (not a recording), there's no cursor/keyboard data. The DAG must handle this:

**Option A**: Skip CURSOR_PROCESS and TYPING_DETECT entirely. INTERACTION_PATTERN runs with only speech + scene signals.

**Option B**: Create CURSOR/TYPING tasks that immediately complete with empty output.

**Decision**: Option A. Modify INTENT_GRAPH to not require all 4 signals — it already handles partial signals per PLAN-12. We just need to ensure the DAG doesn't block on missing initial tasks.

**Implementation**: When creating tasks, only create what we have data for. The STDB `completeTask` logic needs a small change: INTENT_GRAPH should start when all *created* upstream tasks are complete, not when all *possible* upstream tasks exist.

---

## Test Plan

```typescript
describe("triggerPipeline", () => {
  it("uploads video blob to GCS at correct path")
  it("creates source_video asset in STDB")
  it("creates AUDIO_EXTRACT task")
  it("creates VIDEO_SAMPLE task")
  it("creates CURSOR_PROCESS task when cursor data provided")
  it("skips CURSOR_PROCESS when no cursor data")
  it("creates TYPING_DETECT task when keyboard data provided")
  it("skips TYPING_DETECT when no keyboard data")
  it("uploads cursor events as JSON to GCS")
  it("uploads keyboard events as JSON to GCS")
})

describe("Record page → Pipeline", () => {
  it("after stop recording, calls triggerPipeline with blob")
  it("navigates to studio page with projectId")
  it("shows upload progress indicator")
})

describe("DAG with partial signals", () => {
  it("INTENT_GRAPH starts with only speech + scene (no cursor/keyboard)")
  it("INTENT_GRAPH starts when all created upstream tasks complete")
})
```

### Acceptance Criteria:
- [ ] Record → upload → pipeline starts within 5s
- [ ] Workers pick up tasks and process them
- [ ] DAG chains correctly (downstream tasks created as upstream completes)
- [ ] Works with video-only upload (no cursor/keyboard)
- [ ] Works with full recording (video + cursor + keyboard)
- [ ] Pipeline reaches EDIT_PLAN stage
