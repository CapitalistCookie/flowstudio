# PLAN-05: video-sample Worker Standalone Test

**Objective:** Verify frame sampling, scene detection, and asset ID format contract.

**File Under Test:** `packages/workers/video-sample/src/worker.ts`

**Dependencies:** FFmpeg, sharp (native image processing)

---

## Test Cases

### T5.1 — Frame Extraction at 2s Intervals
```typescript
test('extracts frames at configured interval', async () => {
  // 10-second video → should produce 5 frames at 0, 2, 4, 6, 8 seconds
  // Verify: 5 JPEG files in MockGCS at projects/{id}/frame_sample/frame-NNNN.jpg
});
```

### T5.2 — Asset ID Format (CRITICAL — Bug C1 Fix)
```typescript
test('outputAssetIds match GCS frame filenames', async () => {
  // outputAssetIds should be ["frame-0000", "frame-0001", ...]
  // GCS files should be frame-0000.jpg, frame-0001.jpg
  // This contract is consumed by video-understanding worker
});
```

### T5.3 — Scene Change Detection
```typescript
test('detects scene changes from frame diffs', async () => {
  // Use a test video with a dramatic scene cut
  // Verify: SCENE_CHANGE signals produced with confidence > 0.3 threshold
});
```

### T5.4 — Frame Resolution
```typescript
test('resized frames are 1280x720 JPEG quality 85', async () => {
  // Use sharp to read output frame metadata
  // Verify width=1280, height=720
});
```

### T5.5 — Zero-Padding
```typescript
test('frame IDs are zero-padded to 4 digits', async () => {
  // Verify: frame-0000, not frame-0 or frame-00
});
```

---

## Commands
```bash
cd packages/workers/video-sample && npx vitest run
```

## Success Criteria
- Asset ID format `frame-NNNN` matches GCS filename `frame-NNNN.jpg`
- Scene change detection produces valid SCENE_CHANGE signals
- Frame resolution is correct (1280x720)
