# PLAN-X07 — Verify STDB Reducer Name Mapping

> **Problem**: The STDB module defines reducers with camelCase names like `"createProject"`, `"createAsset"`, etc. The frontend and workers convert these to snake_case before calling the HTTP API: `createProject` → `create_project`. SpacetimeDB's TS SDK v2 may or may not normalize reducer names when compiling to WASM.
>
> If SpacetimeDB stores the reducer as `createProject` (camelCase), calling `/call/create_project` (snake_case) will return 404. If it normalizes to `create_project`, the current code is correct.
>
> **Impact**: If the name mapping is wrong, every reducer call fails even after fixing the JSON format (X-01).

---

## Acceptance Criteria

- [ ] Confirmed whether SpacetimeDB TS SDK v2 normalizes camelCase → snake_case in compiled WASM
- [ ] `callReducer` and `StdbClient` use the correct name format
- [ ] A test documents the expected reducer names for the module

---

## Investigation Steps

### Step 1: Check the compiled module schema

```bash
spacetime start  # if not running
spacetime publish --project-path packages/stdb-module flowstudio
spacetime describe flowstudio
```

Or via HTTP:
```bash
curl http://localhost:3000/v1/database/flowstudio/schema?version=9 | jq '.reducers[].name'
```

This will show the actual reducer names in the compiled module. If they're snake_case (`create_project`), the current conversion is correct. If they're camelCase (`createProject`), we need to remove the conversion.

### Step 2: Based on the result

**If reducers are snake_case** (most likely — the SpacetimeDB TS SDK convention):
- Current `callReducer` snake_case conversion is correct
- Document this in a comment

**If reducers are camelCase**:
- Remove the snake_case conversion from both `connection.ts` and `stdb-client.ts`
- Update tests

### Step 3: Write a reducer name map test

```typescript
describe('STDB reducer name mapping', () => {
  // Document the expected mapping for every reducer
  const EXPECTED_NAMES = {
    createProject: 'create_project',  // or 'createProject' based on step 1
    createAsset: 'create_asset',
    createTask: 'create_task',
    // ... etc
  };

  for (const [input, expected] of Object.entries(EXPECTED_NAMES)) {
    it(`${input} → ${expected}`, () => {
      expect(reducerToSnakeCase(input)).toBe(expected);
    });
  }
});
```

---

## Dependencies

- X-01 (shares the same code path — fix format and naming together)
- Requires SpacetimeDB running locally
