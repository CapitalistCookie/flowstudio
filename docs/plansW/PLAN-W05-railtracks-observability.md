# PLAN-W05 — Railtracks Observability

> **Problem**: No observability into agent runs. Can't see token usage, latency, or step-by-step execution.
> **Goal**: `railtracks viz` shows live/past runs with full step traces, token counts, and timing.

---

## What Railtracks Provides Out of the Box

When using `rt.Flow`, `rt.agent_node`, and `rt.call`, Railtracks automatically records:
- Each agent call as a step
- LLM token usage (input/output)
- Step duration
- Agent responses
- Tool calls made by agents

All stored locally by default. `railtracks viz` opens a web UI to inspect runs.

---

## Setup

### 1. Install CLI
```bash
pip install railtracks[cli]
```

### 2. Initialize
```bash
cd packages/railtracks-gateway
railtracks init
```

### 3. Verify recording
After running a flow via the API, check:
```bash
railtracks viz
```

---

## What We Need to Verify

1. **Runs are recorded**: After `POST /api/v1/generate-edits`, a run appears in `railtracks viz`
2. **Steps are visible**: Intent → Narrative → Edit shown as 3 steps
3. **Token usage tracked**: Each agent call shows input/output tokens
4. **Latency visible**: Each step has wall-clock timing
5. **Tool calls shown**: Validation tool calls appear in the trace
6. **Reprompt runs**: Separate run for `/api/v1/reprompt` with previous plan context

---

## Demo Script

For the hackathon demo, we need to show:
1. Trigger a pipeline run
2. Open `railtracks viz`
3. Click into the run → see 3 agent steps
4. Show token usage breakdown
5. Show a reprompt run that references the original

---

## Test Plan

```python
def test_railtracks_viz_initializes():
    """railtracks init creates necessary files"""

def test_run_is_recorded_after_flow_invoke():
    """After flow.invoke(), railtracks has a recorded run"""

def test_recorded_run_has_three_steps():
    """Intent, Narrative, Edit appear as distinct steps"""

def test_token_usage_is_nonzero():
    """Each step records input_tokens > 0 and output_tokens > 0"""
```

### Acceptance Criteria:
- [ ] `railtracks init` succeeds in gateway directory
- [ ] `railtracks viz` opens without error
- [ ] At least one completed run visible after API call
- [ ] Token usage displayed per step
- [ ] Reprompt runs distinguishable from initial runs
