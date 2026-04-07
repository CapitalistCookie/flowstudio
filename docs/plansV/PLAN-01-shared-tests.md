# PLAN-01: Shared Package Tests (`@flowstudio/shared`)

**Objective:** Validate all shared types, constants, schemas, utilities, and prompt security functions.

**Files Under Test:**
- `packages/shared/src/constants.ts` — DAG, dependencies, initial task types
- `packages/shared/src/types/enums.ts` — All enums (TaskType, TaskStatus, ProjectStatus, AssetType, SignalType)
- `packages/shared/src/schemas.ts` — Zod schemas (IntentGraphOutput, NarrativePlanOutput, EditPlanOutput)
- `packages/shared/src/prompt-security.ts` — sanitizeText, buildSecurePrompt, extractJsonArray, validateOutput
- `packages/shared/src/prompt-registry.ts` — PROMPT_REGISTRY templates
- `packages/shared/src/utils.ts` — Utility functions

**New Files to Create:**
- `packages/shared/vitest.config.ts`
- `packages/shared/__tests__/constants.test.ts`
- `packages/shared/__tests__/schemas.test.ts`
- `packages/shared/__tests__/prompt-security.test.ts`
- `packages/shared/__tests__/prompt-registry.test.ts`

---

## Test Cases

### T1.1 — DAG Consistency
```typescript
test('TASK_CHAIN_DAG and TASK_DEPENDENCIES are inverses', () => {
  // For every entry TASK_CHAIN_DAG[A] = [B], TASK_DEPENDENCIES[B] must include A
  for (const [upstream, downstreams] of Object.entries(TASK_CHAIN_DAG)) {
    for (const ds of downstreams) {
      expect(TASK_DEPENDENCIES[ds]).toContain(upstream);
    }
  }
});
```

### T1.2 — DAG Covers All TaskTypes
```typescript
test('every TaskType appears in both DAG and DEPENDENCIES', () => {
  for (const tt of Object.values(TaskType)) {
    expect(TASK_CHAIN_DAG).toHaveProperty(tt);
    expect(TASK_DEPENDENCIES).toHaveProperty(tt);
  }
});
```

### T1.3 — DAG Has No Cycles
```typescript
test('DAG has no cycles (topological sort succeeds)', () => {
  // Implement Kahn's algorithm on TASK_CHAIN_DAG
  // Should produce a valid topological ordering of all 13 task types
});
```

### T1.4 — INITIAL_TASK_TYPES Have Zero Dependencies
```typescript
test('initial task types have empty dependencies', () => {
  for (const tt of INITIAL_TASK_TYPES) {
    expect(TASK_DEPENDENCIES[tt]).toEqual([]);
  }
});
```

### T1.5 — RENDER Is Terminal
```typescript
test('RENDER has no downstream tasks', () => {
  expect(TASK_CHAIN_DAG[TaskType.RENDER]).toEqual([]);
});
```

### T1.6 — Zod Schema Validation (Happy Path)
```typescript
test('IntentGraphOutputSchema accepts valid data', () => {
  const valid = [{ intentId: 'i1', parentIntentId: null, action: 'click button',
    reasoning: 'user moved cursor', confidence: 0.9, startMs: 0, endMs: 1000,
    relatedSignalIndices: [0, 1] }];
  expect(IntentGraphOutputSchema.safeParse(valid).success).toBe(true);
});
```

### T1.7 — Zod Schema Rejection (Invalid Data)
```typescript
test('IntentGraphOutputSchema rejects confidence > 1', () => {
  const invalid = [{ intentId: 'i1', parentIntentId: null, action: 'x',
    reasoning: 'y', confidence: 1.5, startMs: 0, endMs: 100,
    relatedSignalIndices: [] }];
  expect(IntentGraphOutputSchema.safeParse(invalid).success).toBe(false);
});
```

### T1.8 — sanitizeText Strips Control Characters
```typescript
test('sanitizeText removes control chars but keeps tabs/newlines', () => {
  const input = 'hello\x00world\tnewline\n';
  const result = sanitizeText(input);
  expect(result).toBe('helloworld\tnewline\n');
});
```

### T1.9 — sanitizeText Strips Unicode Direction Overrides
```typescript
test('sanitizeText removes unicode direction overrides', () => {
  const result = sanitizeText('hello\u202Aworld');
  expect(result).not.toContain('\u202A');
});
```

### T1.10 — sanitizeText Truncates
```typescript
test('sanitizeText truncates to maxLength', () => {
  const long = 'a'.repeat(20000);
  expect(sanitizeText(long, 100).length).toBe(100);
});
```

### T1.11 — extractJsonArray (Nested)
```typescript
test('extractJsonArray handles nested arrays', () => {
  const text = 'Here is the result: [{"a": [1, 2]}, {"b": [3]}] end';
  const result = extractJsonArray(text);
  expect(JSON.parse(result!)).toEqual([{a: [1,2]}, {b: [3]}]);
});
```

### T1.12 — extractJsonArray (No JSON)
```typescript
test('extractJsonArray returns null for no array', () => {
  expect(extractJsonArray('no json here')).toBeNull();
});
```

### T1.13 — extractJsonArray (Brackets in Strings)
```typescript
test('extractJsonArray handles brackets inside JSON strings', () => {
  const text = '[{"text": "array [1,2] in string"}]';
  const result = extractJsonArray(text);
  expect(JSON.parse(result!)).toEqual([{text: 'array [1,2] in string'}]);
});
```

### T1.14 — validateOutput (Full Pipeline)
```typescript
test('validateOutput returns parsed data and confidence 1 on valid input', () => {
  const raw = 'Some analysis: [{"editType": "cut", ...}]';
  const result = validateOutput(raw, EditPlanOutputSchema);
  expect(result.confidence).toBe(1);
  expect(result.parsed).not.toBeNull();
});
```

### T1.15 — buildSecurePrompt XML Fencing
```typescript
test('buildSecurePrompt wraps data in XML fences', () => {
  const result = buildSecurePrompt({
    systemPrompt: 'Analyze this',
    dataBlocks: [{ label: 'speech', content: 'hello world' }],
  });
  expect(result.user).toContain('<signal_data type="speech">');
  expect(result.user).toContain('</signal_data>');
});
```

---

## Commands to Run

```bash
# Install vitest
cd /home/user/projects/flowstudio && pnpm add -Dw vitest

# Add vitest config to shared package
# (created by the plan)

# Run tests
pnpm --filter @flowstudio/shared run test

# Or directly:
cd packages/shared && npx vitest run
```

## Success Criteria
- All 15 test cases pass
- `pnpm --filter @flowstudio/shared run test` exits 0
- DAG consistency verified (no cycles, inverses match)
- All Zod schemas accept valid / reject invalid data
- Prompt security functions handle edge cases
