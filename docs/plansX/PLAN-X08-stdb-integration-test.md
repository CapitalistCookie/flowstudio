# PLAN-X08 — STDB Call Format Integration Test

> **Problem**: We have no test that verifies a reducer call actually succeeds against a real SpacetimeDB instance. All current tests mock STDB entirely. We need a contract test that catches format mismatches.
>
> **Goal**: A test that serializes reducer args in the exact format we'd send to STDB, validates the shape against the module definition, and (when STDB is available) does a live round-trip.

---

## Acceptance Criteria

- [ ] Contract test validates every reducer's arg count, field names, and types
- [ ] Test compares frontend `REDUCER_PARAMS` against `stdb-module/src/index.ts` definitions
- [ ] Optional integration test (gated behind env var) calls real STDB and verifies success

---

## Tests to Write

### `packages/shared/__tests__/stdb-reducer-contracts.test.ts`

```typescript
describe('STDB reducer contracts', () => {
  // Parse the stdb-module source to extract reducer definitions
  // Compare against REDUCER_PARAMS from shared/src/stdb-reducers.ts

  it('REDUCER_PARAMS covers all reducers in stdb-module', () => {
    // Read stdb-module/src/index.ts
    // Extract all stdb.reducer("name", { ...params }, ...) calls
    // Verify every one has an entry in REDUCER_PARAMS
  });

  it('parameter order matches stdb-module definition order', () => {
    // For each reducer, verify the param names and order match
  });

  it('no extra or missing parameters', () => {
    // Exact match between REDUCER_PARAMS[name] and stdb-module definition
  });
});
```

### `packages/shared/__tests__/stdb-live-roundtrip.test.ts` (optional, env-gated)

```typescript
describe.skipIf(!process.env.STDB_TEST_HOST)('STDB live roundtrip', () => {
  it('createProject succeeds and row appears', async () => {
    await callReducer('createProject', { name: 'test', ownerId: 'test-user', metadata: '{}' });
    const rows = await queryTable('projects');
    expect(rows).toContainEqual(expect.objectContaining({ name: 'test' }));
  });
});
```

---

## Implementation

1. Create `packages/shared/src/stdb-reducers.ts` (from X-01)
2. Write the source-code parsing test that reads `stdb-module/src/index.ts` and extracts reducer definitions
3. Compare against `REDUCER_PARAMS`
4. Add the optional live roundtrip test

---

## Dependencies

- X-01 (creates `REDUCER_PARAMS` and `serializeReducerArgs`)
- X-07 (confirms reducer name mapping)
