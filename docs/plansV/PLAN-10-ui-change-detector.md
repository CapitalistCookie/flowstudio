# PLAN-10: ui-change-detector Worker Standalone Test

**Objective:** Verify UI transition detection via frame pixel-diff analysis.

**File Under Test:** `packages/workers/ui-change-detector/src/worker.ts`

**Dependencies:** sharp (native image processing)

---

## Test Cases

### T10.1 — Navigation Detection
```typescript
test('classifies >70% region change as navigation', async () => {
  // Two very different frames (>70% of 4x4 grid changed)
  // Should produce UI_TRANSITION with transitionType 'navigation'
});
```

### T10.2 — Modal Detection
```typescript
test('classifies center-cluster change as modal', async () => {
  // Only center regions of the 4x4 grid change 
  // Should produce transitionType 'modal'
});
```

### T10.3 — Scroll Detection
```typescript
test('classifies vertical strip change as scroll', async () => {
  // Vertical column of regions changes
});
```

### T10.4 — Below Threshold (No Transition)
```typescript
test('no signal when diff < 0.05', async () => {
  // Two nearly identical frames
  // Should produce zero UI_TRANSITION signals
});
```

### T10.5 — Missing Frames (Graceful)
```typescript
test('skips missing frames without crashing', async () => {
  // Some frame files missing from GCS
  // Should process available frames and skip gaps
});
```

### T10.6 — GCS Output Contract
```typescript
test('writes to projects/{id}/signals/ui_transitions.json', async () => {});
```

---

## Success Criteria
- UI transition classification logic verified (navigation, modal, tab, scroll, other)
- Diff threshold (0.05) correctly applied
- Missing frames don't crash the worker
- Output path matches intent-graph contract
