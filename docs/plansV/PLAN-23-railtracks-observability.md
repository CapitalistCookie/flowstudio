# PLAN-23: Railtracks Observability & Visualization

**Objective:** Configure Railtracks CLI observability so judges can see agent runs.

---

## Setup

```bash
cd packages/railtracks-gateway
pip install railtracks[cli]
railtracks init
```

## After Running Agent Flows

```bash
railtracks viz
```

This opens a web UI showing:
- Every agent step in the flow (IntentAgent → NarrativeAgent → EditAgent)
- LLM call details (model, prompt, response, tokens)
- Timing / latency for each step
- Flow execution graph

## Test Cases

### T23.1 — Viz Shows Agent Steps
```python
def test_railtracks_records_flow():
    """Run a flow and verify railtracks recorded it"""
    flow.invoke(signals=mock_signals, project_id="test")
    # Check that railtracks local storage has the run data
```

### T23.2 — Token Usage Tracking
```python
def test_token_usage_reported():
    """Verify each LLM call reports token counts"""
    pass
```

---

## Integration with Demo

For the hackathon demo:
1. Run a video through the pipeline
2. Open `railtracks viz` to show judges the agent thinking process
3. Show the reprompt loop: user gives feedback → agent re-edits

---

## Success Criteria
- `railtracks viz` opens and shows recorded runs
- Agent steps visible in the flow graph
- Token usage and latency visible per step
