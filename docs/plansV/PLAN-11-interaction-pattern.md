# PLAN-11: interaction-pattern Worker Standalone Test

**Objective:** Verify cursor + typing signal clustering and intent inference.

**File Under Test:** `packages/workers/interaction-pattern/src/worker.ts`

---

## Test Cases

### T11.1 — Merges Cursor and Typing Signals
```typescript
test('reads both cursor_movements.json and typing_events.json', async () => {
  // Upload both signal files to MockGCS 
  // Verify worker reads both and merges by timestamp
});
```

### T11.2 — 5-Second Window Clustering
```typescript
test('clusters interactions within 5s windows', async () => {
  // Events at 1000ms, 2000ms, 4000ms (one cluster)
  // Events at 12000ms, 13000ms (second cluster)
  // Should produce 2 INTERACTION_CLUSTER signals
});
```

### T11.3 — Intent Inference: form_interaction
```typescript
test('cursor + typing in same cluster = form_interaction', async () => {
  // Both cursor and typing events in same time window
  // Should infer intent: 'form_interaction'
});
```

### T11.4 — Intent Inference: navigation
```typescript
test('cursor only in cluster = navigation', async () => {});
```

### T11.5 — Both Files Missing (Graceful)
```typescript
test('returns empty signals when no data available', async () => {
  // Both cursor_movements.json and typing_events.json missing
  // Should return empty (warning logged), NOT throw
});
```

### T11.6 — GCS Output Contract
```typescript
test('writes to projects/{id}/signals/interaction_clusters.json', async () => {});
```

---

## Success Criteria
- Signal merge + sort by timestamp verified
- 5-second clustering window works correctly
- Intent inference logic (form_interaction, text_input, navigation, unknown) verified
- Both-files-missing case is graceful
