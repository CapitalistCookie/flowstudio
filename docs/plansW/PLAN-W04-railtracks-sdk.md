# PLAN-W04 — Railtracks SDK Integration

> **Problem**: `packages/railtracks-gateway` is named "railtracks" but uses zero Railtracks SDK. It's just plain FastAPI + async functions. The prize track requires actual `railtracks` framework usage.
> **Goal**: Rewrite the gateway to use `railtracks` SDK: `rt.agent_node`, `rt.function_node`, `rt.Flow`, `rt.call`.

---

## Current State

```python
# What we have now (custom orchestration):
async def run_edit_flow(project_id, signals, llm_call):
    intent = await run_intent_agent(signals, llm_call)
    narrative = await run_narrative_agent(intent, llm_call)
    edits = await run_edit_agent(narrative, llm_call)
    return FlowRun(...)
```

## Target State

```python
import railtracks as rt

IntentAgent = rt.agent_node(
    "IntentAnalyzer",
    llm=rt.llm.GoogleLLM("gemini-2.0-flash"),
    system_message=INTENT_SYSTEM_PROMPT,
    tool_nodes=(validate_intent_graph,),
)

NarrativeAgent = rt.agent_node(
    "NarrativePlanner",
    llm=rt.llm.GoogleLLM("gemini-2.0-flash"),
    system_message=NARRATIVE_SYSTEM_PROMPT,
    tool_nodes=(validate_narrative_plan,),
)

EditAgent = rt.agent_node(
    "EditPlanner",
    llm=rt.llm.GoogleLLM("gemini-2.0-flash"),
    system_message=EDIT_SYSTEM_PROMPT,
    tool_nodes=(validate_edit_plan,),
)

@rt.function_node
async def edit_pipeline(signals: dict):
    intent_graph = await rt.call(IntentAgent, format_signals(signals))
    narrative = await rt.call(NarrativeAgent, format_intent(intent_graph))
    edit_plan = await rt.call(EditAgent, format_narrative(narrative))
    return edit_plan

@rt.function_node
async def reprompt_pipeline(previous_plan: list, feedback: str):
    revised = await rt.call(EditAgent, format_reprompt(previous_plan, feedback))
    return revised

flow = rt.Flow("FlowStudio Edit Pipeline", entry_point=edit_pipeline)
reprompt_flow = rt.Flow("FlowStudio Reprompt", entry_point=reprompt_pipeline)
```

---

## Architecture

### What stays the same:
- FastAPI endpoints (`/api/v1/generate-edits`, `/api/v1/reprompt`, `/api/v1/runs/{run_id}`)
- Pydantic schemas for request/response
- GCS client for reading signals and writing plans

### What changes:
- Agents become `rt.agent_node` instances
- Orchestration becomes `rt.Flow` with `rt.function_node` entries
- Validation becomes `rt.tool_node` (tools the agent can call)
- LLM is configured via `rt.llm.GoogleLLM` instead of raw `genai`

### Railtracks LLM providers:
Need to verify Google/Gemini support. If not natively supported, wrap with a custom LLM adapter.

---

## Changes

| File | Change |
|------|--------|
| `requirements.txt` | Add `railtracks>=1.2.6`, `railtracks[cli]` |
| `app/agents/intent_agent.py` | Rewrite: `rt.agent_node` + validation tool |
| `app/agents/narrative_agent.py` | Rewrite: `rt.agent_node` + validation tool |
| `app/agents/edit_agent.py` | Rewrite: `rt.agent_node` + reprompt tool |
| `app/agents/validation.py` | Rewrite as `@rt.tool_node` functions |
| `app/flow.py` | Rewrite: `rt.Flow`, `@rt.function_node` |
| `app/main.py` | Update to use `flow.invoke()` / `flow.ainvoke()` |
| `app/config.py` | Add Railtracks-specific config |

---

## Test Plan (TDD)

### Unit tests (`tests/test_railtracks_flow.py`):
```python
def test_edit_pipeline_calls_three_agents_in_order():
    """Intent → Narrative → Edit, each via rt.call"""

def test_reprompt_pipeline_calls_edit_agent_with_feedback():
    """Previous plan + feedback → revised plan"""

def test_validation_tool_rejects_invalid_intent_graph():
    """Tool returns error message for malformed JSON"""

def test_validation_tool_accepts_valid_edit_plan():
    """Tool returns success for well-formed plan"""

def test_flow_invoke_returns_edit_plan():
    """Full flow with mocked LLM produces valid output"""

def test_flow_records_steps():
    """Railtracks records each agent call as a step"""
```

### Integration test (`tests/test_api_railtracks.py`):
```python
def test_generate_edits_endpoint_uses_railtracks_flow():
    """POST /api/v1/generate-edits → flow.invoke() → valid response"""

def test_reprompt_endpoint_uses_railtracks_flow():
    """POST /api/v1/reprompt → reprompt_flow.invoke() → valid response"""
```

### Acceptance Criteria:
- [ ] `import railtracks as rt` appears in the codebase
- [ ] At least 3 `rt.agent_node` definitions (intent, narrative, edit)
- [ ] At least 1 `rt.Flow` definition
- [ ] `rt.call()` used for agent invocation
- [ ] `railtracks` in `requirements.txt`
- [ ] All existing tests still pass
- [ ] New railtracks-specific tests pass
- [ ] `railtracks viz` can display a completed run (see W-05)
