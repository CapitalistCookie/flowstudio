# PLAN-07: typing-detector Worker Standalone Test

**Objective:** Verify typing burst detection and paste event classification.

**File Under Test:** `packages/workers/typing-detector/src/worker.ts`

---

## Test Cases

### T7.1 — Normal Typing Burst
```typescript
test('detects typing burst with >3 keys and <1500ms gap', async () => {
  const events = 'hello'.split('').map((key, i) => ({
    key, timestampMs: i * 200, type: 'keydown'
  }));
  // Should produce TYPING_EVENT signal with isPaste=false
});
```

### T7.2 — Paste Event Detection
```typescript
test('classifies >15 chars/sec as paste', async () => {
  // 20 characters in 1 second = 20 chars/sec > 15 threshold
  // Should produce TYPING_EVENT with isPaste=true
});
```

### T7.3 — Filters Non-Keydown Events
```typescript
test('ignores keyup and keypress events', async () => {
  // Mix of keydown and keyup events
  // Only keydown should be counted
});
```

### T7.4 — Missing Keyboard Data (Graceful)
```typescript
test('returns empty signals for missing keyboard data', async () => {
  // Like cursor-processor, should handle missing data gracefully
});
```

### T7.5 — GCS Output Contract
```typescript
test('writes to projects/{id}/signals/typing_events.json', async () => {
  // Exact path verification
});
```

---

## Success Criteria
- Typing burst detection works (≥3 keys, <1500ms gap between consecutive keys)
- Paste detection threshold (>15 chars/sec) verified
- Output path matches `signals/typing_events.json` contract
