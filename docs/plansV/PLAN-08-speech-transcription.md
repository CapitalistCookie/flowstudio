# PLAN-08: speech-transcription Worker Standalone Test

**Objective:** Verify Deepgram API integration, transcript handling, and signal generation.

**File Under Test:** `packages/workers/speech-transcription/src/worker.ts`

**External Dependency:** Deepgram API (`DEEPGRAM_API_KEY` required)

---

## Test Cases

### T8.1 — Mock Deepgram Response → Signals
```typescript
test('converts Deepgram utterances to SPEECH_SEGMENT signals', async () => {
  // Mock Deepgram SDK to return a canned transcript response
  // Verify: Each utterance becomes a SPEECH_SEGMENT signal
  // Verify: word-level timing preserved in payload
});
```

### T8.2 — Transcript JSON Upload
```typescript
test('uploads full transcript to projects/{id}/transcript/transcript.json', async () => {
  // Verify the raw Deepgram response is uploaded as-is
});
```

### T8.3 — Signal File Upload
```typescript
test('writes speech segments to projects/{id}/signals/speech_segments.json', async () => {
  // Verify exact path for intent-graph worker consumption
});
```

### T8.4 — Missing API Key
```typescript
test('throws descriptive error when DEEPGRAM_API_KEY not set', async () => {
  // Unset env var, verify error message helps debugging
});
```

### T8.5 — Empty Audio (No Speech)
```typescript
test('produces zero signals for silent audio', async () => {
  // Deepgram returns empty transcript
  // Should complete successfully with empty signals
});
```

### T8.6 — Live Integration Test (Optional)
```bash
# Only run with real API key:
DEEPGRAM_API_KEY=xxx npx vitest run --filter live
```

---

## Mock Strategy

```typescript
// Mock the Deepgram SDK
vi.mock('@deepgram/sdk', () => ({
  createClient: () => ({
    listen: {
      prerecorded: {
        transcribeFile: vi.fn().mockResolvedValue({
          result: {
            results: {
              utterances: [{
                transcript: 'Hello world',
                start: 0, end: 2.5,
                words: [
                  { word: 'Hello', start: 0, end: 0.5, confidence: 0.98 },
                  { word: 'world', start: 0.6, end: 1.0, confidence: 0.95 }
                ],
                speaker: 0
              }]
            }
          }
        })
      }
    }
  })
}));
```

---

## Success Criteria
- Deepgram response correctly parsed into SPEECH_SEGMENT signals
- Word-level timing preserved
- Output paths match downstream contracts
- Graceful handling of missing API key and empty audio
