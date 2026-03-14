# PLAN-16: render Worker Standalone Test

**Objective:** Verify FFmpeg filter_complex construction and video rendering from timeline.

**File Under Test:** `packages/workers/render/src/worker.ts`

**Dependencies:** FFmpeg (system)

---

## Test Cases

### T16.1 — Filter Complex Generation
```typescript
test('builds correct FFmpeg filter_complex from timeline', async () => {
  // Timeline with 3 cuts at different times with speed changes
  // Verify filter_complex string has correct trim, setpts, atrim, asetpts, concat
});
```

### T16.2 — Speed Change in Filter
```typescript
test('setpts includes speed factor: (PTS-STARTPTS)/speed', async () => {
  // speed: 2.0 → setpts=(PTS-STARTPTS)/2.0
  // atempo=2.0
});
```

### T16.3 — Concat Order
```typescript
test('concat=n=N:v=1:a=1 with correct N', async () => {
  // Number of clips = N in concat filter
});
```

### T16.4 — Output Codec Settings
```typescript
test('uses libx264 CRF 23 fast preset and aac', async () => {
  // Verify FFmpeg args include: -c:v libx264 -crf 23 -preset fast -c:a aac
});
```

### T16.5 — Missing Timeline (Throws)
```typescript
test('throws when timeline.json not in GCS', async () => {});
```

### T16.6 — Missing Source Video (Throws)
```typescript
test('throws when source video not in GCS', async () => {});
```

### T16.7 — GCS Output Contract
```typescript
test('writes to projects/{id}/rendered_video/output.mp4', async () => {});
```

### T16.8 — Integration: Renders a Real Video (Optional)
```bash
# With FFmpeg installed, render a short test video from a mock timeline
ffmpeg -f lavfi -i testsrc=duration=5:size=320x240:rate=30 \
  -f lavfi -i sine=frequency=440:duration=5 \
  -c:v libx264 -c:a aac /tmp/test-render-input.mp4
# Then run worker with this as source
```

---

## Success Criteria
- FFmpeg filter_complex string is syntactically correct
- Speed changes correctly reflected in video and audio filters
- Concat combines correct number of streams
- Output codec settings match expected configuration
- Error paths (missing timeline/video) correctly trigger retry
