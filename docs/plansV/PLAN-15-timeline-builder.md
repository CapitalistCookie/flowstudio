# PLAN-15: timeline-builder Worker Standalone Test

**Objective:** Verify edit decisions are correctly assembled into a structured timeline.

**File Under Test:** `packages/workers/timeline-builder/src/worker.ts`

---

## Test Cases

### T15.1 — Video Track Construction
```typescript
test('creates video clips from edit decisions', async () => {
  // Edit decisions with cut, speedup, zoom
  // Each becomes a video clip with appropriate effects
});
```

### T15.2 — Audio Track Construction
```typescript
test('creates audio clips mirroring video clips (except visual-only edits)', async () => {
  // zoom/pan/overlay edits should NOT get audio clips
  // cut/trim/speedup/slowdown edits SHOULD get audio clips
});
```

### T15.3 — Speed Effect Inheritance
```typescript
test('audio clips inherit speed effects from video clips', async () => {
  // Video clip with speed: 2.0
  // Corresponding audio clip should also have speed: 2.0
});
```

### T15.4 — Clip Ordering
```typescript
test('clips sorted by outputStartMs', async () => {
  // Edit decisions arrive out of order
  // Timeline should sort them by outputStartMs
});
```

### T15.5 — Timeline JSON Schema
```typescript
test('timeline has videoTrack and audioTrack arrays', async () => {
  // Verify the output structure matches what render worker expects
  // { videoTrack: [TimelineClip], audioTrack: [TimelineClip] }
});
```

### T15.6 — GCS Output Contract
```typescript
test('writes to projects/{id}/timeline/timeline.json', async () => {});
```

---

## Success Criteria
- Video and audio tracks correctly constructed
- Speed effects propagated to audio
- Clips sorted by output time
- Timeline JSON matches render worker's expected input format
