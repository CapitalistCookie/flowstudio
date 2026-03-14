# PLAN-04: audio-extract Worker Standalone Test

**Objective:** Verify audio-extract worker correctly extracts audio from video using FFmpeg.

**File Under Test:** `packages/workers/audio-extract/src/worker.ts`

**Dependencies:** FFmpeg (system), `@ffmpeg-installer/ffmpeg` (npm), `@flowstudio/worker-shared`

---

## Test Cases

### T4.1 — Happy Path: Extract Audio from Valid Video
```typescript
test('processes video and produces WAV output', async () => {
  // Setup: Upload a 5-second test video to MockGCS at projects/{id}/source_video/test.mp4
  // Execute: Call worker.processTask() with inputAssetIds pointing to the video
  // Assert: MockGCS contains projects/{id}/audio_track/audio.wav
  // Assert: outputAssetIds contains "audio-{projectId}"
  // Assert: signals array is empty
});
```

### T4.2 — Missing Source Video
```typescript
test('throws when source video not found in GCS', async () => {
  // inputAssetIds points to non-existent file
  // Expect: processTask throws with descriptive error
});
```

### T4.3 — Output Format Verification
```typescript
test('extracted audio is mono 16kHz PCM s16le WAV', async () => {
  // Use ffprobe on the output to verify: channels=1, sample_rate=16000, codec=pcm_s16le
});
```

### T4.4 — GCS Path Contract
```typescript
test('uploads to correct GCS path', async () => {
  // Verify output goes to exactly: projects/{projectId}/audio_track/audio.wav
  // This is the contract speech-transcription worker depends on
});
```

---

## Commands to Run
```bash
# Requires FFmpeg installed locally
brew install ffmpeg  # if not already

# Create a 2-second test video
ffmpeg -f lavfi -i testsrc=duration=2:size=320x240:rate=30 -f lavfi -i sine=frequency=440:duration=2 -c:v libx264 -c:a aac /tmp/test-flowstudio.mp4

# Run tests
cd packages/workers/audio-extract && npx vitest run
```

## Success Criteria
- Worker correctly calls FFmpeg with `-ac 1 -ar 16000 -f wav` flags
- Output path matches GCS contract: `projects/{projectId}/audio_track/audio.wav`
- Worker handles missing source gracefully (throws, enabling retry)
