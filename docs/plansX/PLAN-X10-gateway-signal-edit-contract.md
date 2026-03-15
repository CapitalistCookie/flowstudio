# PLAN-X10 — Gateway Signal→Edit Contract Test

> **Problem**: The gateway receives signals and produces edit plans, but we have no test that verifies the full data contract: (1) signals format in → (2) LLM processes → (3) edit plan format out → (4) frontend can parse it.
>
> **Goal**: Test that a representative signal payload produces a structurally valid edit plan that the frontend's `editPlanToTimelineClips` can consume.

---

## Acceptance Criteria

- [ ] Test sends realistic signal data to `generate-edits` endpoint
- [ ] Test verifies the response has `edit_plan` as a list of objects
- [ ] Test verifies each edit decision has: `editType`, `sourceStartMs`, `sourceEndMs`, `outputStartMs`, `outputEndMs`, `parameters`, `reasoning`
- [ ] Test verifies `editType` values are in the allowed set
- [ ] Test verifies the response can be parsed by `editPlanToTimelineClips()`
- [ ] Test verifies the reprompt endpoint accepts a previous edit plan and feedback
- [ ] All tests work with a mocked LLM (no real API calls needed)

---

## Tests to Write FIRST

### `packages/shared/__tests__/gateway-frontend-contract.test.ts`

```typescript
import { editPlanToTimelineClips } from '../../frontend/lib/agent/edit-plan-to-timeline';

const VALID_EDIT_TYPES = ['cut', 'trim', 'speedup', 'slowdown', 'zoom', 'pan', 'transition', 'overlay'];

describe('Gateway → Frontend edit plan contract', () => {
  const sampleGatewayResponse = {
    run_id: 'rt-123',
    status: 'completed',
    project_id: 'test-project',
    edit_plan: [
      {
        editType: 'zoom',
        sourceStartMs: 5000,
        sourceEndMs: 8000,
        outputStartMs: 5000,
        outputEndMs: 8000,
        parameters: { zoomLevel: 1.5 },
        reasoning: 'Focus on code editor',
      },
      {
        editType: 'speedup',
        sourceStartMs: 0,
        sourceEndMs: 5000,
        outputStartMs: 0,
        outputEndMs: 2500,
        parameters: { speed: 2.0 },
        reasoning: 'Skip slow intro',
      },
    ],
  };

  it('edit_plan items have all required fields', () => {
    for (const edit of sampleGatewayResponse.edit_plan) {
      expect(edit).toHaveProperty('editType');
      expect(edit).toHaveProperty('sourceStartMs');
      expect(edit).toHaveProperty('sourceEndMs');
      expect(edit).toHaveProperty('outputStartMs');
      expect(edit).toHaveProperty('outputEndMs');
      expect(edit).toHaveProperty('parameters');
      expect(edit).toHaveProperty('reasoning');
    }
  });

  it('editType values are in the allowed set', () => {
    for (const edit of sampleGatewayResponse.edit_plan) {
      expect(VALID_EDIT_TYPES).toContain(edit.editType);
    }
  });

  it('edit plan can be converted to timeline clips', () => {
    const clips = editPlanToTimelineClips(sampleGatewayResponse.edit_plan, 'video-1');
    expect(clips).toHaveLength(2);
    expect(clips[0].aiEditType).toBe('zoom');
    expect(clips[1].aiEditType).toBe('speedup');
  });

  it('timestamps are non-negative and end >= start', () => {
    for (const edit of sampleGatewayResponse.edit_plan) {
      expect(edit.sourceStartMs).toBeGreaterThanOrEqual(0);
      expect(edit.sourceEndMs).toBeGreaterThanOrEqual(edit.sourceStartMs);
      expect(edit.outputStartMs).toBeGreaterThanOrEqual(0);
      expect(edit.outputEndMs).toBeGreaterThanOrEqual(edit.outputStartMs);
    }
  });
});
```

### `packages/railtracks-gateway/tests/test_contract.py`

```python
def test_generate_edits_response_shape():
    """Verify the gateway response matches what the frontend expects."""
    response = client.post("/api/v1/generate-edits", json={
        "project_id": "test",
        "signals": {
            "speech_segments": [{"text": "test", "timestampMs": 0}],
            "scene_descriptions": [],
            "ui_transitions": [],
            "interaction_clusters": [],
        },
    })
    # With mocked LLM, verify structure
    data = response.json()
    assert "edit_plan" in data
    assert isinstance(data["edit_plan"], list)
```

---

## Dependencies

- X-03 (validation must accept camelCase first)
