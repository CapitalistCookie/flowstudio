# PLAN-13: narrative-planner Worker Standalone Test

**Objective:** Verify narrative beat creation from the intent graph.

**File Under Test:** `packages/workers/narrative-planner/src/worker.ts`

---

## Test Cases

### T13.1 — Reads Intent Graph
```typescript
test('downloads intent_graph.json from GCS', async () => {});
```

### T13.2 — Claude Prompt with Intents
```typescript
test('sends intent hierarchy to Claude for narrative planning', async () => {
  // Verify prompt includes intent data
  // Verify system prompt matches PROMPT_REGISTRY['narrative-planner']
});
```

### T13.3 — Beat Types
```typescript
test('produces beats of types: setup, action, result, transition, highlight', async () => {
  // Mock Claude to return beats with all 5 types
  // Verify each becomes a NARRATIVE_BEAT signal
});
```

### T13.4 — Beat Ordering
```typescript
test('beats are ordered by beatIndex', async () => {
  // Verify beats come out in correct sequence
});
```

### T13.5 — Missing Intent Graph (Throws)
```typescript
test('throws when intent_graph.json not in GCS', async () => {});
```

### T13.6 — GCS Output Contract
```typescript
test('writes to projects/{id}/signals/narrative_plan.json', async () => {});
```

---

## Success Criteria
- Intent graph correctly consumed
- Claude called with proper prompt
- NARRATIVE_BEAT signals with correct beat types
- Output path matches edit-planner contract
