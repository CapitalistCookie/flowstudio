# PLAN-18: SpacetimeDB WASM Module Tests

**Objective:** Verify all 11 reducers and the task state machine logic.

**File Under Test:** `packages/stdb-module/src/index.ts` (782 lines)

---

## Challenge

The SpacetimeDB module compiles to WASM and executes inside the SpacetimeDB runtime.
We cannot unit test it with Vitest directly. Options:

### Option A: TypeScript Logic Extraction (Recommended for Hackathon)
Extract pure business logic from reducers into testable helper functions, leaving only the SpacetimeDB CRUD operations in the reducer bodies.

### Option B: Integration Test Against Live SpacetimeDB
Requires a running SpacetimeDB instance. Test via HTTP API calls.

### Option C: Mock the SpacetimeDB Runtime
Create mock `Table` and `ReducerContext` types to simulate the runtime.

---

## Test Cases (via Logic Extraction)

### T18.1 — DAG Consistency (Mirrors PLAN-01 T1.1-T1.5)
```typescript
test('stdb-module DAG matches shared constants DAG', () => {
  // Parse the raw string DAGs from stdb-module/src/index.ts
  // Compare against TASK_CHAIN_DAG and TASK_DEPENDENCIES from @flowstudio/shared
  // They MUST be identical
});
```

### T18.2 — Task State Machine
```typescript
test('valid transitions: pending→claimed, claimed→completed, claimed→failed', () => {
  // Verify only valid transitions are allowed
  // Invalid: completed→pending, failed→claimed, etc.
});
```

### T18.3 — Watchdog Stale Detection
```typescript
test('task is stale when claimed > 5 minutes ago', () => {
  // claimedAt = now - 6 minutes → stale
  // claimedAt = now - 4 minutes → not stale
  // claimedAt = 0 → not stale (not yet claimed)
});
```

### T18.4 — Watchdog Requeue vs Fail
```typescript
test('stale task with retries: requeued. Without retries: failed', () => {
  // retryCount < maxRetries → reset to pending
  // retryCount >= maxRetries → mark as failed
});
```

### T18.5 — generateId Uniqueness
```typescript
test('generateId produces unique IDs', () => {
  const ids = new Set(Array.from({length: 1000}, () => generateId()));
  expect(ids.size).toBe(1000);
});
```

---

## Verification Command
```bash
# TypeScript compilation check (stdb-module must compile)
pnpm --filter @flowstudio/stdb-module exec tsc --noEmit
```

---

## Success Criteria
- stdb-module DAG matches shared constants (no drift)
- Task state machine transitions validated
- Watchdog stale detection thresholds correct
- ID generation produces unique values
