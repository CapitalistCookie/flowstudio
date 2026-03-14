# PLAN-24: Video Context Extraction Strategy

**Objective:** Determine and implement the best approach for extracting semantic video context.

---

## Current State

The architecture diagram mentioned **TwelveLabs Pegasus** for video semantics, but the actual implementation uses **Google Gemini multimodal** (`video-understanding` worker). This works but has limitations:

1. Only analyzes individual frames (not video sequences)
2. Misses temporal patterns (gesture, motion, pacing)
3. Frame-by-frame analysis is expensive (many Gemini API calls)

## Options

### Option A: Keep Gemini Multimodal (Recommended for Hackathon) ✅
- **Pros:** Already implemented, GCP keys available, fast
- **Cons:** Frame-level only, no video-level understanding
- **Enhancement:** Send video chunks directly to Gemini 2.0 Pro (supports video input)

### Option B: Add Google Video Intelligence API
- **Pros:** Purpose-built for video analysis, shot detection, label detection
- **Cons:** Additional API cost, another dependency
- **Enhancement:** Complementary to Gemini for different signal types

### Option C: TwelveLabs Pegasus (Original Architecture)
- **Pros:** Best video understanding, purpose-built for video semantics
- **Cons:** Need API key, another vendor dependency, cost
- **Status:** Not implemented, would need new worker

---

## Recommended Enhancement: Gemini 2.0 with Video Input

Instead of sending individual frames, send the entire video (or chunks) to Gemini:

```typescript
// Enhanced video-understanding worker
const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

// Upload video to Gemini using File API
const file = await genAI.uploadFile(videoPath, { mimeType: 'video/mp4' });

const result = await model.generateContent([
  { fileData: { mimeType: 'video/mp4', fileUri: file.uri } },
  'Analyze this screen recording and describe what the user is doing...'
]);
```

This gives us:
- Full video context (motion, transitions, pacing)
- Single API call instead of many frame calls
- Better temporal understanding

## Test Cases

### T24.1 — Video Upload to Gemini File API
```typescript
test('uploads video to Gemini and gets file URI', async () => {});
```

### T24.2 — Video Analysis Response
```typescript
test('Gemini returns scene descriptions from video', async () => {});
```

---

## Success Criteria
- Video context extraction works with available API keys
- Output matches existing signal format (scene_descriptions.json)
- Compatible with downstream intent-graph worker
