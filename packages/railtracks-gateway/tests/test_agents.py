"""Tests for individual agents (intent, narrative, edit)."""
import json
import pytest
from app.agents.intent_agent import run_intent_agent, extract_json_array, format_signals_for_prompt
from app.agents.narrative_agent import run_narrative_agent
from app.agents.edit_agent import run_edit_agent, run_reprompt_agent


MOCK_INTENTS = [
    {
        "intentId": "i1", "parentIntentId": None, "action": "Writing code",
        "reasoning": "User is typing in IDE", "confidence": 0.95,
        "startMs": 0, "endMs": 30000, "relatedSignalIndices": [0, 1]
    }
]

MOCK_BEATS = [
    {
        "beatIndex": 0, "beatType": "setup", "title": "Opening IDE",
        "description": "User opens project", "suggestedDurationMs": 5000,
        "startMs": 0, "endMs": 5000, "relatedIntentIds": ["i1"]
    },
    {
        "beatIndex": 1, "beatType": "action", "title": "Coding",
        "description": "User writes code", "suggestedDurationMs": 20000,
        "startMs": 5000, "endMs": 25000, "relatedIntentIds": ["i1"]
    }
]

MOCK_EDITS = [
    {
        "editType": "cut", "sourceStartMs": 0, "sourceEndMs": 5000,
        "outputStartMs": 0, "outputEndMs": 5000, "parameters": {},
        "reasoning": "Opening shot"
    },
    {
        "editType": "speedup", "sourceStartMs": 5000, "sourceEndMs": 25000,
        "outputStartMs": 5000, "outputEndMs": 15000,
        "parameters": {"speed": 2.0}, "reasoning": "Speed up coding"
    }
]


def make_llm(response_data):
    """Create a mock LLM callable that returns JSON-wrapped data."""
    async def mock_llm(system_prompt: str, user_message: str) -> str:
        return f"Here is my analysis:\n{json.dumps(response_data)}\nEnd."
    return mock_llm


# ─── extract_json_array ─────────────────────────────────────────────────────

class TestExtractJsonArray:
    def test_simple_array(self):
        result = extract_json_array('[{"a": 1}]')
        assert result == [{"a": 1}]

    def test_surrounded_by_text(self):
        result = extract_json_array('Here: [{"x": 1}] done')
        assert result == [{"x": 1}]

    def test_nested(self):
        result = extract_json_array('[{"a": [1, 2]}, {"b": [3]}]')
        assert result == [{"a": [1, 2]}, {"b": [3]}]

    def test_no_array(self):
        assert extract_json_array("no json here") is None

    def test_unmatched_brackets(self):
        assert extract_json_array('[{"key": "val"}, {') is None

    def test_brackets_in_strings(self):
        result = extract_json_array('[{"text": "array [1,2] in string"}]')
        assert result == [{"text": "array [1,2] in string"}]

    def test_empty_array(self):
        assert extract_json_array("result: []") == []


# ─── format_signals_for_prompt ───────────────────────────────────────────────

class TestFormatSignals:
    def test_wraps_in_xml_fences(self):
        result = format_signals_for_prompt({"speech": [{"text": "hello"}]})
        assert '<signal_data type="speech">' in result
        assert "</signal_data>" in result

    def test_empty_signals_omitted(self):
        result = format_signals_for_prompt({"speech": [], "video": [{"x": 1}]})
        assert "speech" not in result
        assert "video" in result

    def test_sanitizes_labels(self):
        result = format_signals_for_prompt({"bad/label": [{"x": 1}]})
        assert "bad_label" in result


# ─── Intent Agent ────────────────────────────────────────────────────────────

class TestIntentAgent:
    @pytest.mark.asyncio
    async def test_produces_intents_from_signals(self):
        signals = {"speech_segments": [{"text": "hello", "timestampMs": 0}]}
        result = await run_intent_agent(signals, make_llm(MOCK_INTENTS))
        assert len(result) == 1
        assert result[0]["intentId"] == "i1"

    @pytest.mark.asyncio
    async def test_raises_on_empty_signals(self):
        with pytest.raises(ValueError, match="No signals"):
            await run_intent_agent({}, make_llm(MOCK_INTENTS))

    @pytest.mark.asyncio
    async def test_raises_on_bad_llm_response(self):
        async def bad_llm(s, u):
            return "Sorry, I cannot help."
        with pytest.raises(ValueError, match="Failed to parse"):
            await run_intent_agent(
                {"speech": [{"x": 1}]}, bad_llm
            )


# ─── Narrative Agent ─────────────────────────────────────────────────────────

class TestNarrativeAgent:
    @pytest.mark.asyncio
    async def test_produces_beats_from_intents(self):
        result = await run_narrative_agent(MOCK_INTENTS, make_llm(MOCK_BEATS))
        assert len(result) == 2
        assert result[0]["beatType"] == "setup"

    @pytest.mark.asyncio
    async def test_sorts_by_beat_index(self):
        reversed_beats = list(reversed(MOCK_BEATS))
        result = await run_narrative_agent(MOCK_INTENTS, make_llm(reversed_beats))
        assert result[0]["beatIndex"] <= result[1]["beatIndex"]

    @pytest.mark.asyncio
    async def test_raises_on_empty_intents(self):
        with pytest.raises(ValueError, match="Empty intent"):
            await run_narrative_agent([], make_llm(MOCK_BEATS))


# ─── Edit Agent ──────────────────────────────────────────────────────────────

class TestEditAgent:
    @pytest.mark.asyncio
    async def test_produces_edits_from_beats(self):
        result = await run_edit_agent(MOCK_BEATS, make_llm(MOCK_EDITS))
        assert len(result) == 2
        assert result[0]["editType"] == "cut"
        assert result[1]["editType"] == "speedup"

    @pytest.mark.asyncio
    async def test_raises_on_empty_narrative(self):
        with pytest.raises(ValueError, match="Empty narrative"):
            await run_edit_agent([], make_llm(MOCK_EDITS))

    @pytest.mark.asyncio
    async def test_raises_on_bad_llm_response(self):
        async def bad_llm(s, u):
            return "I cannot analyze this."
        with pytest.raises(ValueError, match="Failed to parse"):
            await run_edit_agent(MOCK_BEATS, bad_llm)


# ─── Reprompt Agent ──────────────────────────────────────────────────────────

class TestRepromptAgent:
    @pytest.mark.asyncio
    async def test_produces_revised_edits(self):
        revised = [{**MOCK_EDITS[0], "reasoning": "revised opening"}]
        result = await run_reprompt_agent(MOCK_EDITS, "Make intro shorter", make_llm(revised))
        assert len(result) == 1
        assert result[0]["reasoning"] == "revised opening"

    @pytest.mark.asyncio
    async def test_raises_on_empty_plan(self):
        with pytest.raises(ValueError, match="No previous"):
            await run_reprompt_agent([], "feedback", make_llm(MOCK_EDITS))

    @pytest.mark.asyncio
    async def test_raises_on_empty_feedback(self):
        with pytest.raises(ValueError, match="Feedback"):
            await run_reprompt_agent(MOCK_EDITS, "", make_llm(MOCK_EDITS))
