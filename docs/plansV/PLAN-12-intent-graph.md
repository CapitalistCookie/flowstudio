# PLAN-12: intent-graph Worker Standalone Test

**Objective:** Verify intent graph construction from all upstream signals using Claude.

**File Under Test:** `packages/workers/intent-graph/src/worker.ts`

**External Dependency:** Anthropic Claude API

---

## Test Cases

### T12.1 — Reads All 4 Signal Files
```typescript
test('downloads speech_segments, scene_descriptions, ui_transitions, interaction_clusters', async () => {
  // Upload all 4 signal files to MockGCS
  // Verify worker reads all 4
});
```

### T12.2 — Claude Prompt Construction
```typescript
test('builds Claude prompt with sorted signals summary', async () => {
  // Mock Anthropic client to capture the prompt
  // Verify: signals are sorted by timestamp
  // Verify: system prompt matches PROMPT_REGISTRY['intent-graph']
});
```

### T12.3 — Intent Hierarchy Parsing
```typescript
test('parses Claude JSON response into INTENT_NODE signals', async () => {
  // Mock Claude to return valid intent JSON array
  // Verify: each intent becomes an INTENT_NODE signal
  // Verify: parentIntentId creates hierarchy
});
```

### T12.4 — No Upstream Signals (Throws)
```typescript
test('throws when all 4 signal files are empty/missing', async () => {
  // All signal files missing → should throw (cannot build intent from nothing)
  // This causes the task to fail and retry
});
```

### T12.5 — Partial Signals (Some Missing)
```typescript
test('works with subset of signals (e.g., only speech + video)', async () => {
  // cursor and typing missing (known gap)
  // Should still produce intent graph from available signals
});
```

### T12.6 — Claude JSON Parse Failure → Retry
```typescript
test('throws on invalid JSON from Claude (triggers retry)', async () => {
  // Mock Claude to return "Sorry, I cannot analyze this"
  // extractJsonArray returns null → worker throws
  // BaseWorker catches → failTask → retry
});
```

### T12.7 — GCS Output Contract
```typescript
test('writes to projects/{id}/signals/intent_graph.json', async () => {});
```

---

## Mock Strategy
```typescript
vi.mock('@anthropic-ai/sdk', () => ({
  default: class MockAnthropic {
    messages = {
      create: vi.fn().mockResolvedValue({
        content: [{
          type: 'text',
          text: JSON.stringify([
            { intentId: 'i1', parentIntentId: null, action: 'Writing code',
              reasoning: 'User is typing in an IDE', confidence: 0.95,
              startMs: 0, endMs: 30000, relatedSignalIndices: [0, 1, 2] }
          ])
        }]
      })
    };
  }
}));
```

---

## Success Criteria
- All 4 upstream signal files correctly read (or gracefully handled when missing)
- Claude API called with well-formed prompt
- Intent hierarchy preserved (parent/child relationships)
- JSON extraction from LLM response works
- Error path (no signals, bad JSON) triggers retry
