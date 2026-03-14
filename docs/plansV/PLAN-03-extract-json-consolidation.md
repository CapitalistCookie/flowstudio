# PLAN-03: extractJsonArray Consolidation

**Objective:** Eliminate the duplicated `extractJsonArray` function from 4 worker files and consolidate into `@flowstudio/shared`.

**Current Duplication Locations:**
1. `packages/workers/video-understanding/src/worker.ts`
2. `packages/workers/intent-graph/src/worker.ts`
3. `packages/workers/narrative-planner/src/worker.ts`
4. `packages/workers/edit-planner/src/worker.ts`

**Already exists in:** `packages/shared/src/prompt-security.ts` (string-aware bracket counting version)

---

## Changes

### Step 1: Verify the shared version is the best
The version in `prompt-security.ts` includes string-awareness (`inString`, `escaped` flags). The worker duplicates may be simpler (no string awareness). Confirm shared version is a superset.

### Step 2: Delete the local copies from 4 workers
Each worker file has a local `function extractJsonArray(text: string): string | null` — delete these and import from `@flowstudio/shared`.

### Step 3: Add import to each worker
```typescript
import { extractJsonArray } from '@flowstudio/shared';
```

### Step 4: Test that all 4 workers still compile
```bash
pnpm -r exec tsc --noEmit
```

---

## Test Cases (in PLAN-01)

Tests T1.11, T1.12, T1.13 already cover `extractJsonArray`. Additional edge cases:

### T3.1 — Deeply Nested JSON
```typescript
test('extractJsonArray handles 5 levels of nesting', () => {
  const text = '[[[[["deep"]]]]]';
  expect(JSON.parse(extractJsonArray(text)!)).toEqual([[[[["deep"]]]]]);
});
```

### T3.2 — Escaped Quotes in Strings
```typescript
test('extractJsonArray handles escaped quotes', () => {
  const text = '[{"key": "value with \\"quotes\\""}]';
  const result = extractJsonArray(text);
  expect(result).not.toBeNull();
  expect(JSON.parse(result!)).toEqual([{key: 'value with "quotes"'}]);
});
```

### T3.3 — Unmatched Brackets (Truncated LLM Response)
```typescript
test('extractJsonArray returns null for unmatched brackets', () => {
  const text = '[{"key": "value"}, {';
  expect(extractJsonArray(text)).toBeNull();
});
```

---

## Success Criteria
- Zero duplicates of `extractJsonArray` in worker files
- `grep -rn 'function extractJsonArray' packages/workers/` returns zero results
- `pnpm -r exec tsc --noEmit` passes
- All edge case tests pass
