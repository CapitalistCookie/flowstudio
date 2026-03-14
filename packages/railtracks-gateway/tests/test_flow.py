"""Tests for the agentic flow orchestration."""
import json
import pytest
from app.flow import run_edit_flow, run_reprompt_flow, get_run, FlowRunStatus


MOCK_INTENTS = [
    {"intentId": "i1", "parentIntentId": None, "action": "Coding",
     "reasoning": "User typed", "confidence": 0.9,
     "startMs": 0, "endMs": 30000, "relatedSignalIndices": [0]}
]

MOCK_BEATS = [
    {"beatIndex": 0, "beatType": "action", "title": "Coding", "description": "Writing code",
     "suggestedDurationMs": 25000, "startMs": 0, "endMs": 25000, "relatedIntentIds": ["i1"]}
]

MOCK_EDITS = [
    {"editType": "cut", "sourceStartMs": 0, "sourceEndMs": 25000,
     "outputStartMs": 0, "outputEndMs": 25000, "parameters": {}, "reasoning": "Full clip"}
]


call_count = 0

async def mock_llm_sequential(system_prompt: str, user_message: str) -> str:
    """Returns different responses for each sequential call."""
    global call_count
    call_count += 1
    if call_count % 3 == 1:
        return json.dumps(MOCK_INTENTS)
    elif call_count % 3 == 2:
        return json.dumps(MOCK_BEATS)
    else:
        return json.dumps(MOCK_EDITS)


class TestEditFlow:
    @pytest.fixture(autouse=True)
    def reset_call_count(self):
        global call_count
        call_count = 0

    @pytest.mark.asyncio
    async def test_full_flow_produces_edit_plan(self):
        signals = {"speech_segments": [{"text": "hello"}], "scene_descriptions": [], "ui_transitions": [], "interaction_clusters": []}
        run = await run_edit_flow("proj-1", signals, mock_llm_sequential)

        assert run.status == FlowRunStatus.COMPLETED
        assert run.edit_plan is not None
        assert len(run.edit_plan) > 0
        assert run.intent_graph is not None
        assert run.narrative_plan is not None

    @pytest.mark.asyncio
    async def test_flow_records_steps(self):
        signals = {"speech_segments": [{"text": "hi"}]}
        run = await run_edit_flow("proj-2", signals, mock_llm_sequential)

        assert len(run.steps) == 3
        step_names = [s["name"] for s in run.steps]
        assert "intent_agent" in step_names
        assert "narrative_agent" in step_names
        assert "edit_agent" in step_names

    @pytest.mark.asyncio
    async def test_flow_tracks_duration(self):
        signals = {"speech_segments": [{"text": "hi"}]}
        run = await run_edit_flow("proj-3", signals, mock_llm_sequential)
        assert run.duration_ms is not None
        assert run.duration_ms >= 0

    @pytest.mark.asyncio
    async def test_flow_is_retrievable_by_run_id(self):
        signals = {"speech_segments": [{"text": "hi"}]}
        run = await run_edit_flow("proj-4", signals, mock_llm_sequential)
        retrieved = get_run(run.run_id)
        assert retrieved is not None
        assert retrieved.run_id == run.run_id

    @pytest.mark.asyncio
    async def test_flow_fails_gracefully_on_llm_error(self):
        async def failing_llm(s, u):
            raise RuntimeError("LLM API error")

        signals = {"speech_segments": [{"text": "hi"}]}
        run = await run_edit_flow("proj-5", signals, failing_llm)

        assert run.status == FlowRunStatus.FAILED
        assert run.error is not None
        assert "LLM API error" in run.error

    @pytest.mark.asyncio
    async def test_flow_fails_on_empty_signals(self):
        signals = {}
        run = await run_edit_flow("proj-6", signals, mock_llm_sequential)
        assert run.status == FlowRunStatus.FAILED

    @pytest.mark.asyncio
    async def test_nonexistent_run_returns_none(self):
        assert get_run("nonexistent-id") is None


class TestRepromptFlow:
    @pytest.fixture(autouse=True)
    def reset_call_count(self):
        global call_count
        call_count = 0

    @pytest.mark.asyncio
    async def test_reprompt_produces_revised_plan(self):
        async def reprompt_llm(s, u):
            return json.dumps([{**MOCK_EDITS[0], "reasoning": "revised"}])

        run = await run_reprompt_flow("proj-7", MOCK_EDITS, "Make it shorter", reprompt_llm)
        assert run.status == FlowRunStatus.COMPLETED
        assert run.edit_plan is not None
        assert len(run.edit_plan) > 0

    @pytest.mark.asyncio
    async def test_reprompt_records_step(self):
        async def reprompt_llm(s, u):
            return json.dumps(MOCK_EDITS)

        run = await run_reprompt_flow("proj-8", MOCK_EDITS, "Add zoom", reprompt_llm)
        assert len(run.steps) == 1
        assert run.steps[0]["name"] == "reprompt_agent"

    @pytest.mark.asyncio
    async def test_reprompt_fails_on_empty_feedback(self):
        async def reprompt_llm(s, u):
            return json.dumps(MOCK_EDITS)

        run = await run_reprompt_flow("proj-9", MOCK_EDITS, "", reprompt_llm)
        assert run.status == FlowRunStatus.FAILED
