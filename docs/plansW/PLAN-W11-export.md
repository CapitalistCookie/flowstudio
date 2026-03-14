# PLAN-W11 — Export Pipeline

> **Problem**: Users can see the edit plan on the timeline but can't get a final video out. Export is stubbed.
> **Goal**: User clicks Export → gets MP4/WebM file with all edits applied.

---

## Two Export Strategies

### Strategy A: Server-side (Render Worker)
The existing `render` worker uses FFmpeg to apply edits and produce MP4.

**Pros**: Full FFmpeg power, high quality, hardware acceleration possible.
**Cons**: Requires GCS round-trip, worker must be running, slower for user.

### Strategy B: Client-side (ffmpeg.wasm / Canvas)
Use ffmpeg.wasm or Canvas/WebCodecs API in the browser.

**Pros**: Instant, no server needed, works offline.
**Cons**: Slower for long videos, limited codec support, high memory usage.

### Decision: Both, with client-side as primary for hackathon

1. **Quick export** (default): Canvas-based recording of the video preview with edits applied. Uses the existing `ExportModal` approach but enhanced with edit plan awareness.
2. **HQ export** (optional): Triggers the RENDER task in STDB → worker processes → downloads from GCS.

---

## Quick Export (Canvas-based)

### How it works:
1. Play the video through the edit plan (respecting cuts, trims, speed changes)
2. Record the canvas output using MediaRecorder
3. Apply zoom/pan transforms via canvas transformations
4. Output as WebM (or transcode to MP4 via ffmpeg.wasm)

### Implementation:

```typescript
async function quickExport(
  editPlan: EditDecision[],
  videoElement: HTMLVideoElement,
  options: { format: "webm" | "mp4"; resolution: "720p" | "1080p" }
): Promise<Blob> {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d")!;
  const stream = canvas.captureStream(30);
  const recorder = new MediaRecorder(stream, { mimeType: "video/webm" });

  // Build a playback schedule from edit plan
  const schedule = buildPlaybackSchedule(editPlan, videoElement.duration * 1000);

  // Play through schedule, drawing each frame to canvas with transforms
  for (const segment of schedule) {
    videoElement.currentTime = segment.sourceStartMs / 1000;
    videoElement.playbackRate = segment.speed || 1;

    while (videoElement.currentTime < segment.sourceEndMs / 1000) {
      applyTransforms(ctx, segment); // zoom, pan, etc.
      ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);
      await waitForNextFrame();
    }
  }

  recorder.stop();
  return new Blob(recorder.data, { type: "video/webm" });
}
```

### Export Modal Enhancement:

Add to existing `ExportModal`:
- Format selection (WebM / MP4)
- Resolution selection
- Progress bar
- Preview of first frame with edits applied
- "Quick Export" vs "HQ Export (server)" toggle

---

## HQ Export (Server-side)

### Trigger via STDB:
```typescript
async function triggerHqExport(projectId: string, editPlanVersion: number) {
  // Per PLAN-26: user must approve timeline before render
  await callReducer("userApproveTimeline", projectId);
  // This creates the RENDER task in STDB
  // Worker picks it up and processes with FFmpeg
}
```

### Download when complete:
```typescript
stdb.onTaskUpdate((task) => {
  if (task.taskType === "RENDER" && task.status === "COMPLETED") {
    const url = await getSignedDownloadUrl(
      `projects/${projectId}/rendered_video/output.mp4`
    );
    downloadFile(url, `${projectName}.mp4`);
  }
});
```

---

## Test Plan

```typescript
describe("buildPlaybackSchedule", () => {
  it("creates sequential segments from edit plan")
  it("respects cuts (skips cut segments)")
  it("respects trims (shortened segments)")
  it("respects speed changes")
  it("applies zoom transforms")
  it("handles empty edit plan (full video)")
})

describe("Quick Export", () => {
  it("exports WebM blob")
  it("applies edit plan to output")
  it("respects resolution setting")
  it("shows progress during export")
  it("can be cancelled")
})

describe("HQ Export", () => {
  it("calls userApproveTimeline reducer")
  it("RENDER task appears in STDB")
  it("downloads file when render completes")
  it("shows progress from worker status")
})
```

### Acceptance Criteria:
- [ ] User clicks Export → gets downloadable file within 30s (for < 2min video)
- [ ] Exported video has edits applied (cuts visible, zooms visible, speed changes audible)
- [ ] Progress indicator during export
- [ ] Format selection works
- [ ] HQ export triggers server-side render (if workers are running)
