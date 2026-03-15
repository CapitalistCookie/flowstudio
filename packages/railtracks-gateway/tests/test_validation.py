"""Tests for the validation module — no LLM calls required."""

import pytest
from app.agents.validation import (
    validate_json_output,
    validate_intent_graph,
    validate_narrative_plan,
    validate_edit_plan,
)


# ─── validate_json_output ────────────────────────────────────────────────────

class TestValidateJsonOutput:
    def test_extracts_clean_array(self):
        parsed, errors = validate_json_output('[{"a": 1}]')
        assert parsed == [{"a": 1}]
        assert errors == []

    def test_extracts_array_from_surrounding_text(self):
        text = 'Sure! Here is my analysis:\n[{"x": 1}]\nHope this helps!'
        parsed, errors = validate_json_output(text)
        assert parsed == [{"x": 1}]

    def test_handles_nested_arrays(self):
        parsed, _ = validate_json_output('[{"nested": [1, 2, [3]]}]')
        assert parsed == [{"nested": [1, 2, [3]]}]

    def test_handles_brackets_in_strings(self):
        parsed, _ = validate_json_output('[{"text": "array [1,2] here"}]')
        assert parsed == [{"text": "array [1,2] here"}]

    def test_returns_none_for_no_array(self):
        parsed, errors = validate_json_output("No JSON here at all")
        assert parsed is None
        assert "No JSON array found" in errors[0]

    def test_returns_none_for_truncated_response(self):
        parsed, errors = validate_json_output('[{"key": "value"}, {')
        assert parsed is None
        assert "Unmatched brackets" in errors[0]

    def test_returns_none_for_malformed_json(self):
        parsed, errors = validate_json_output("[{invalid json}]")
        assert parsed is None
        assert "JSON parse error" in errors[0]

    def test_handles_empty_array(self):
        parsed, _ = validate_json_output("[]")
        assert parsed == []

    def test_handles_escaped_quotes(self):
        parsed, _ = validate_json_output('[{"key": "value with \\"quotes\\""}]')
        assert parsed is not None
        assert parsed[0]["key"] == 'value with "quotes"'


# ─── validate_intent_graph ───────────────────────────────────────────────────

class TestValidateIntentGraph:
    def test_valid_intent(self):
        items = [{
            "intentId": "i1",
            "parentIntentId": None,
            "action": "Writing code",
            "reasoning": "User is typing in an IDE",
            "confidence": 0.95,
            "startMs": 0,
            "endMs": 30000,
            "related_signal_indices": [0, 1, 2],
        }]
        errors = validate_intent_graph(items)
        assert errors == []

    def test_empty_graph(self):
        errors = validate_intent_graph([])
        assert "Empty intent graph" in errors

    def test_missing_intent_id(self):
        items = [{"action": "test", "confidence": 0.5}]
        errors = validate_intent_graph(items)
        assert any("missing intentId" in e for e in errors)

    def test_invalid_confidence(self):
        items = [{"intentId": "i1", "action": "test", "confidence": 1.5}]
        errors = validate_intent_graph(items)
        assert any("confidence" in e for e in errors)

    def test_broken_parent_reference(self):
        items = [{"intentId": "i1", "parentIntentId": "nonexistent", "action": "test", "confidence": 0.5}]
        errors = validate_intent_graph(items)
        assert any("not found" in e for e in errors)


# ─── validate_narrative_plan ─────────────────────────────────────────────────

class TestValidateNarrativePlan:
    def test_valid_beat(self):
        items = [{
            "beat_index": 0,
            "beatType": "setup",
            "title": "Introduction",
            "description": "Setting the scene",
            "suggestedDurationMs": 5000,
            "startMs": 0,
            "endMs": 5000,
        }]
        errors = validate_narrative_plan(items)
        assert errors == []

    def test_invalid_beat_type(self):
        items = [{"beatType": "explosion", "title": "x", "suggestedDurationMs": 1000}]
        errors = validate_narrative_plan(items)
        assert any("invalid beatType" in e for e in errors)

    def test_all_valid_beat_types(self):
        for bt in ["setup", "action", "result", "transition", "highlight"]:
            items = [{"beatType": bt, "title": "x", "suggestedDurationMs": 1000}]
            errors = validate_narrative_plan(items)
            assert not any("invalid beatType" in e for e in errors)

    def test_empty_plan(self):
        errors = validate_narrative_plan([])
        assert "Empty narrative plan" in errors


# ─── validate_edit_plan ──────────────────────────────────────────────────────

class TestValidateEditPlan:
    def test_valid_edit(self):
        items = [{
            "editType": "cut",
            "sourceStartMs": 0,
            "sourceEndMs": 5000,
            "outputStartMs": 0,
            "outputEndMs": 5000,
            "parameters": {},
            "reasoning": "Remove dead time",
        }]
        errors = validate_edit_plan(items)
        assert errors == []

    def test_invalid_edit_type(self):
        items = [{"editType": "delete", "sourceStartMs": 0, "sourceEndMs": 100, "reasoning": "x"}]
        errors = validate_edit_plan(items)
        assert any("invalid editType" in e for e in errors)

    def test_all_valid_edit_types(self):
        for et in ["cut", "trim", "speedup", "slowdown", "zoom", "pan", "transition", "overlay"]:
            items = [{"editType": et, "sourceStartMs": 0, "sourceEndMs": 100, "reasoning": "x"}]
            errors = validate_edit_plan(items)
            assert not any("invalid editType" in e for e in errors)

    def test_reversed_time_range(self):
        items = [{"editType": "cut", "sourceStartMs": 5000, "sourceEndMs": 1000, "reasoning": "x"}]
        errors = validate_edit_plan(items)
        assert any("sourceStartMs > sourceEndMs" in e for e in errors)

    def test_empty_plan(self):
        errors = validate_edit_plan([])
        assert "Empty edit plan" in errors
