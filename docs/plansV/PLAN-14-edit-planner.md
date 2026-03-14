# PLAN-14: edit-planner Worker Standalone Test

**Objective:** Verify conversion of narrative beats into specific video edit decisions.

**File Under Test:** `packages/workers/edit-planner/src/worker.ts`

---

## Test Cases

### T14.1 — Reads Narrative Plan
```typescript
test('downloads narrative_plan.json from GCS', async () => {});
```

### T14.2 — Edit Types
```typescript
test('produces edit decisions: cut, trim, speedup, slowdown, zoom, pan, transition, overlay', async () => {
  // Mock Claude to return edits of various types
  // Verify each becomes an EDIT_DECISION signal with correct editType
});
```

### T14.3 — Time Range Mapping
```typescript
test('edit decisions have valid source and output time ranges', async () => {
  // sourceStartMs <= sourceEndMs
  // outputStartMs <= outputEndMs
});
```

### T14.4 — Zod Schema Validation
```typescript
test('edit plan output validates against EditPlanOutputSchema', async () => {
  // Use the shared schema to validate worker output
});
```

### T14.5 — GCS Output Contract
```typescript
test('writes to projects/{id}/signals/edit_plan.json', async () => {});
```

---

## Success Criteria
- Narrative beats correctly consumed
- Edit decisions have valid time ranges
- Output validates against EditPlanOutputSchema
- Output path matches timeline-builder contract
