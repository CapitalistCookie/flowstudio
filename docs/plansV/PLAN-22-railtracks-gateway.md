# PLAN-22: Railtracks FastAPI Gateway — Agentic AI Loop

**Objective:** Create a Python FastAPI microservice using Railtracks to wrap the agentic AI portion of the pipeline (intent-graph → narrative-planner → edit-planner) as a Railtracks Flow with full observability.

**This is the REQUIRED prize track integration.**

---

## Architecture

```
                    ┌──────────────────────────────────┐
                    │  FastAPI Service (Python)         │
                    │  Port: 8000                       │
                    │                                   │
                    │  POST /api/v1/generate-edits      │
                    │  POST /api/v1/reprompt             │
                    │  GET  /api/v1/runs/{run_id}       │
                    │                                   │
                    │  ┌───────────────────────────────┐│
                    │  │  Railtracks Flow               ││
                    │  │                                ││
                    │  │  IntentAgent                   ││
                    │  │    ↓                           ││
                    │  │  NarrativeAgent                ││
                    │  │    ↓                           ││
                    │  │  EditAgent                     ││
                    │  │    ↓                           ││
                    │  │  (Validation Loop)             ││
                    │  │    ↓                           ││
                    │  │  TimelineBuilder (function)    ││
                    │  └───────────────────────────────┘│
                    └──────────────────────────────────┘
                              ↕ HTTP
                    ┌──────────────────────────────────┐
                    │  Existing TS Workers              │
                    │  (SpacetimeDB + GCS)              │
                    └──────────────────────────────────┘
```

---

## New Files

```
packages/railtracks-gateway/
├── requirements.txt
├── app/
│   ├── __init__.py
│   ├── main.py              # FastAPI app
│   ├── agents/
│   │   ├── __init__.py
│   │   ├── intent_agent.py  # Railtracks agent_node for intent graph
│   │   ├── narrative_agent.py
│   │   ├── edit_agent.py
│   │   └── validation.py    # Validation loop for edit quality
│   ├── flow.py              # Railtracks Flow definition
│   ├── gcs_tools.py         # Tools for reading/writing GCS
│   ├── schemas.py           # Pydantic models matching TS types
│   └── config.py            # Environment config
├── tests/
│   ├── test_agents.py
│   ├── test_flow.py
│   └── test_api.py
└── Dockerfile
```

---

## Implementation

### `app/main.py`
```python
from fastapi import FastAPI
from app.flow import run_edit_flow, run_reprompt_flow

app = FastAPI(title="FlowStudio Railtracks Gateway")

@app.post("/api/v1/generate-edits")
async def generate_edits(request: GenerateEditsRequest):
    """Entry point: takes signal data, runs the agentic loop, returns edit plan."""
    result = await run_edit_flow(
        project_id=request.project_id,
        signals=request.signals,
    )
    return result

@app.post("/api/v1/reprompt")
async def reprompt(request: RepromptRequest):
    """Re-run the edit loop with user feedback."""
    result = await run_reprompt_flow(
        project_id=request.project_id,
        previous_edit_plan=request.previous_edit_plan,
        user_feedback=request.feedback,
    )
    return result

@app.get("/api/v1/runs/{run_id}")
async def get_run(run_id: str):
    """Get the status and details of a Railtracks flow run."""
    # Read from Railtracks observability
    pass
```

### `app/flow.py`
```python
import railtracks as rt
from app.agents.intent_agent import IntentAgent
from app.agents.narrative_agent import NarrativeAgent
from app.agents.edit_agent import EditAgent

@rt.function_node
async def edit_flow(signals: dict, project_id: str):
    """Main agentic flow: signals → intent → narrative → edits"""
    # Step 1: Build intent graph from signals
    intent_graph = await rt.call(IntentAgent, signals)
    
    # Step 2: Create narrative plan from intents
    narrative_plan = await rt.call(NarrativeAgent, intent_graph)
    
    # Step 3: Generate edit decisions from narrative
    edit_plan = await rt.call(EditAgent, narrative_plan)
    
    return edit_plan

flow = rt.Flow("FlowStudio Edit Pipeline", entry_point=edit_flow)

async def run_edit_flow(project_id: str, signals: dict):
    result = flow.invoke(signals=signals, project_id=project_id)
    return result
```

### `app/agents/intent_agent.py`
```python
import railtracks as rt

IntentAgent = rt.agent_node(
    llm=rt.llm.GoogleLLM("gemini-2.0-flash"),  # Use Gemini (we have GCP keys)
    system_message="""You are analyzing signals extracted from a screen recording.
    Build an intent graph — a hierarchy of what the user was trying to accomplish.
    Respond with valid JSON array...""",
)
```

---

## Test Cases

### T22.1 — Flow Invocation
```python
def test_edit_flow_produces_edit_plan():
    """Full flow: mock signals → intent → narrative → edit plan"""
    mock_signals = {
        "speech_segments": [...],
        "scene_descriptions": [...],
    }
    result = flow.invoke(signals=mock_signals, project_id="test-123")
    assert "edit_plan" in result
    assert len(result["edit_plan"]) > 0
```

### T22.2 — FastAPI Endpoint
```python
def test_generate_edits_endpoint():
    """POST /api/v1/generate-edits returns 200"""
    from fastapi.testclient import TestClient
    client = TestClient(app)
    response = client.post("/api/v1/generate-edits", json={
        "project_id": "test",
        "signals": { "speech_segments": [] }
    })
    assert response.status_code == 200
```

### T22.3 — Reprompt Flow
```python
def test_reprompt_modifies_edit_plan():
    """Reprompt with user feedback changes the output"""
    pass
```

### T22.4 — Railtracks Observability
```bash
# After running a flow:
railtracks viz
# Should show the agent steps, LLM calls, token usage
```

### T22.5 — GCS Integration
```python
def test_reads_signals_from_gcs():
    """Flow correctly reads signal files from GCS"""
    pass
```

---

## Commands

```bash
# Setup
cd packages/railtracks-gateway
python -m venv .venv
source .venv/bin/activate
pip install railtracks fastapi uvicorn google-cloud-storage

# Run locally
uvicorn app.main:app --port 8000 --reload

# Run tests
pytest tests/ -v

# Railtracks visualization
pip install railtracks[cli]
railtracks init
railtracks viz
```

---

## Why This Matters for the Prize Track

Railtracks is about **agent observability and pure-Python agent orchestration**. By wrapping our agentic AI loop (intent→narrative→edit) in Railtracks Flows:

1. **We get full observability** — see every LLM call, token usage, latency
2. **We use their architecture patterns** — Sequential Agent, Validation Loop
3. **We demonstrate their SDK** in a real production use case
4. **The judges can see Railtracks viz** with our agent runs

The FastAPI gateway sits ALONGSIDE the existing TypeScript workers — it doesn't replace them. The TS workers handle signal extraction (audio, video, cursor), and the Python gateway handles the agentic AI thinking.

---

## Success Criteria
- FastAPI service starts and responds to requests
- Railtracks Flow runs the full agent chain
- `railtracks viz` shows agent runs with token usage
- Edit plans are valid JSON matching EditPlanOutputSchema
- Reprompt endpoint changes output based on feedback
