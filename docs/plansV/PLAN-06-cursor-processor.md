# PLAN-06: cursor-processor Worker Standalone Test

**Objective:** Verify cursor event segmentation and movement classification.

**File Under Test:** `packages/workers/cursor-processor/src/worker.ts`

---

## Test Cases

### T6.1 — Linear Movement Detection
```typescript
test('classifies straight-line cursor movement as linear', async () => {
  const events = Array.from({length: 20}, (_, i) => ({
    x: i * 10, y: i * 5, timestampMs: i * 100, type: 'mousemove'
  }));
  // Upload as cursor_data, run worker
  // Assert: CURSOR_MOVEMENT signal with movementType 'linear'
});
```

### T6.2 — Erratic Movement Detection
```typescript
test('classifies random zigzag as erratic', async () => {
  // Events with high variance, low R-squared linearity
});
```

### T6.3 — Hover Detection
```typescript
test('classifies stationary cursor as hover', async () => {
  // Many events at roughly the same position, speed < 5 px/s
});
```

### T6.4 — Segment Split on Time Gap
```typescript
test('splits into segments at >2000ms gaps', async () => {
  // Events at 0-1000ms, then gap, then 5000-6000ms
  // Should produce 2 separate CURSOR_MOVEMENT signals
});
```

### T6.5 — Missing Cursor Data (Graceful)
```typescript
test('returns empty signals when no cursor data exists', async () => {
  // inputAssetId points to non-existent file
  // Should NOT throw — returns { outputAssetIds: [], signals: [] }
});
```

### T6.6 — GCS Output Contract
```typescript
test('writes signals to projects/{id}/signals/cursor_movements.json', async () => {
  // Verify exact output path for interaction-pattern worker
});
```

---

## Success Criteria
- All 6 test cases pass
- Movement classification logic verified (linear, erratic, hover, click)
- Graceful handling of missing data confirmed
- Output path matches `signals/cursor_movements.json` contract
