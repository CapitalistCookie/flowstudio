# PLAN-X12 — EditDecision → TimelineClip Round-Trip Test

> **Problem**: The gateway produces `EditDecision[]` (camelCase), the frontend converts them to `TimelineClip[]`, and then save/load serializes them as `TimelineClipData[]`. We need to verify this full round-trip preserves all data.
>
> **Goal**: A test that takes a gateway response, converts to timeline clips, serializes to save format, deserializes back, and verifies nothing is lost.

---

## Acceptance Criteria

- [ ] Gateway `EditDecision` → `editPlanToTimelineClips()` → `TimelineClip[]` preserves edit type, timing, reasoning
- [ ] `TimelineClip` → `TimelineClipData` (save) → `TimelineClip` (load) preserves `aiEditType` and `aiReasoning`
- [ ] AI clips are distinguishable from manual clips after round-trip
- [ ] Position/width calculations are reversible (clip position matches source timing)

---

## Tests to Write

Most of this already exists in `frontend/__tests__/e2e-contracts.test.ts`. Extend with:

```typescript
it('full round-trip: EditDecision → TimelineClip → save → load', () => {
  const decision: EditDecision = {
    editType: 'zoom', sourceStartMs: 5000, sourceEndMs: 8000,
    outputStartMs: 5000, outputEndMs: 8000,
    parameters: { zoomLevel: 1.5 }, reasoning: 'Focus',
  };

  // Convert
  const clips = editPlanToTimelineClips([decision], 'media-1');
  expect(clips).toHaveLength(1);

  // Serialize (save)
  const saved: TimelineClipData = {
    ...clips[0],
    transform: clips[0].transform,
    effects: clips[0].effects,
    aiEditType: clips[0].aiEditType,
    aiReasoning: clips[0].aiReasoning,
  };

  // Deserialize (load)
  const loaded: TimelineClip = {
    ...saved,
    transform: saved.transform ?? DEFAULT_CLIP_TRANSFORM,
    effects: saved.effects ?? DEFAULT_CLIP_EFFECTS,
    aiEditType: saved.aiEditType,
    aiReasoning: saved.aiReasoning,
  };

  // Verify
  expect(loaded.aiEditType).toBe('zoom');
  expect(loaded.aiReasoning).toBe('Focus');
});
```

---

## Dependencies

- X-03 (validation camelCase — gateway must produce correct format)
- X-10 (gateway contract — gateway response shape)
