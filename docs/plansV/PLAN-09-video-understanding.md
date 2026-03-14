# PLAN-09: video-understanding Worker Standalone Test

**Objective:** Verify Gemini multimodal frame analysis and JSON extraction.

**File Under Test:** `packages/workers/video-understanding/src/worker.ts`

**External Dependency:** Google Generative AI (`GOOGLE_AI_API_KEY` required)

---

## Test Cases

### T9.1 — Frame Batch Processing
```typescript
test('processes frames in batches of 4', async () => {
  // Upload 10 frames to MockGCS
  // Mock Gemini to return JSON analysis for each batch
  // Verify: 3 batches processed (4+4+2)
});
```

### T9.2 — Frame Download from Correct GCS Path
```typescript
test('reads frames from projects/{id}/frame_sample/{assetId}.jpg', async () => {
  // inputAssetIds: ["frame-0000", "frame-0001"]
  // Verify: GCS downloads from frame_sample/frame-0000.jpg
});
```

### T9.3 — JSON Extraction from LLM Response
```typescript
test('extracts JSON array from Gemini response with surrounding text', async () => {
  // Mock Gemini response: "Here's my analysis:\n[{...}]\nHope that helps!"
  // Verify: extractJsonArray correctly pulls out the array
});
```

### T9.4 — LLM Returns Non-JSON (Graceful)
```typescript
test('logs warning and continues when Gemini returns non-JSON', async () => {
  // Mock Gemini to return "I cannot analyze these frames"
  // Verify: Empty batch (no signals), warning logged, task does NOT fail
});
```

### T9.5 — Timestamp Calculation
```typescript
test('calculates timestamps using frame index * 2000ms', async () => {
  // Frame 3 → timestamp 6000ms
  // NOTE: This is the hardcoded 2s interval assumption
});
```

### T9.6 — Output Contract
```typescript
test('writes to projects/{id}/signals/scene_descriptions.json', async () => {
  // Verify exact path for intent-graph consumption
});
```

---

## Known Issue to Document
The hardcoded 2s frame interval assumption means timestamps will be wrong if `video-sample` uses a different `sampleIntervalSecs` config. Document this as a TODO fix: propagate actual interval through task config.

---

## Success Criteria
- Frames processed in correct batch sizes
- GCS paths match video-sample output contract
- Graceful handling of non-JSON LLM responses
- Scene descriptions written to correct signal file
