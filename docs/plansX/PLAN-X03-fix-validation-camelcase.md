# PLAN-X03 — Fix validation.py camelCase/snake_case Mismatch

> **Problem**: The gateway validation functions in `packages/railtracks-gateway/app/agents/validation.py` check for **snake_case** field names (`intent_id`, `start_ms`, `edit_type`, `beat_type`, `source_start_ms`), but:
> - The LLM prompt instructions tell the model to output **camelCase** (`intentId`, `startMs`, `editType`, `beatType`, `sourceStartMs`)
> - The Pydantic schemas in `schemas.py` use camelCase aliases
> - The frontend expects camelCase
> - The Zod schemas in `packages/shared/src/schemas.ts` use camelCase
>
> **Impact**: `validate_intent_graph()`, `validate_narrative_plan()`, and `validate_edit_plan()` always report validation warnings/failures even when the LLM output is correct. The Railtracks validation tools return `VALIDATION_WARNINGS` on every run.

---

## Acceptance Criteria

- [ ] `validate_intent_graph` checks for `intentId`, `startMs`, `endMs`, `parentIntentId` (camelCase)
- [ ] `validate_narrative_plan` checks for `beatType`, `suggestedDurationMs` (camelCase)
- [ ] `validate_edit_plan` checks for `editType`, `sourceStartMs`, `sourceEndMs` (camelCase)
- [ ] Existing tests in `tests/test_validation.py` updated and passing
- [ ] New test: valid camelCase LLM output passes validation with `VALIDATION_OK`

---

## Tests to Write FIRST

### `packages/railtracks-gateway/tests/test_validation.py` (update existing)

```python
def test_valid_camelcase_intent_passes():
    items = [
        {"intentId": "i1", "parentIntentId": None, "action": "coding",
         "confidence": 0.9, "startMs": 0, "endMs": 5000, "relatedSignalIndices": [0]}
    ]
    errors = validate_intent_graph(items)
    assert errors == []

def test_valid_camelcase_edit_passes():
    items = [
        {"editType": "zoom", "sourceStartMs": 0, "sourceEndMs": 5000,
         "outputStartMs": 0, "outputEndMs": 5000, "parameters": {}, "reasoning": "Focus on code"}
    ]
    errors = validate_edit_plan(items)
    assert errors == []

def test_valid_camelcase_narrative_passes():
    items = [
        {"beatIndex": 0, "beatType": "action", "title": "Code review",
         "description": "...", "suggestedDurationMs": 5000, "startMs": 0, "endMs": 5000}
    ]
    errors = validate_narrative_plan(items)
    assert errors == []
```

---

## Implementation

### Update `validation.py`

Change all field name checks from snake_case to camelCase:

**`validate_intent_graph`**:
- `intent_id` → `intentId`
- `parent_intent_id` → `parentIntentId`
- `start_ms` → `startMs`
- `end_ms` → `endMs`

**`validate_narrative_plan`**:
- `beat_type` → `beatType`
- `suggested_duration_ms` → `suggestedDurationMs`

**`validate_edit_plan`**:
- `edit_type` → `editType`
- `source_start_ms` → `sourceStartMs`
- `source_end_ms` → `sourceEndMs`

---

## Verification

1. `cd packages/railtracks-gateway && python -m pytest tests/ -v` — all tests pass
2. `npx vitest run` — TS tests still pass
3. Manual: start gateway, send a generate-edits request, verify validation tools return `VALIDATION_OK`

---

## Dependencies

- None (independent backend fix)
