"""Tests for the Railtracks-based agentic flow.

Tests the flow construction, validation tools, and helper functions.
Full LLM integration is tested separately via the API endpoints.
"""
import json
import pytest
from unittest.mock import AsyncMock, patch, MagicMock

from app.flow import (
    edit_flow,
    reprompt_flow,
    _extract_json_from_response,
    validate_intent_output,
    validate_narrative_output,
    validate_edit_output,
)


class TestFlowConstruction:
    def test_edit_flow_is_initialized(self):
        assert edit_flow.name == "FlowStudio Edit Pipeline"

    def test_reprompt_flow_is_initialized(self):
        assert reprompt_flow.name == "FlowStudio Reprompt"


class TestJsonExtraction:
    def test_extracts_valid_json_array(self):
        text = 'Some text [{"key": "value"}] more text'
        result = _extract_json_from_response(text)
        assert result == [{"key": "value"}]

    def test_raises_on_no_json(self):
        with pytest.raises(ValueError, match="Failed to parse"):
            _extract_json_from_response("No JSON here")

    def test_raises_on_malformed_json(self):
        with pytest.raises(ValueError, match="Failed to parse"):
            _extract_json_from_response("[{invalid json}]")


class TestValidationTools:
    def test_validate_intent_output_ok(self):
        intents = [{"intentId": "i1", "action": "coding", "confidence": 0.9, "startMs": 0, "endMs": 1000}]
        result = validate_intent_output(json.dumps(intents))
        assert "VALIDATION_OK" in result

    def test_validate_intent_output_missing_field(self):
        intents = [{"confidence": 0.5}]
        result = validate_intent_output(json.dumps(intents))
        assert "VALIDATION_WARNINGS" in result

    def test_validate_intent_output_bad_json(self):
        result = validate_intent_output("not json at all")
        assert "VALIDATION_FAILED" in result

    def test_validate_narrative_output_ok(self):
        beats = [{"beatType": "action", "title": "Coding", "suggestedDurationMs": 5000}]
        result = validate_narrative_output(json.dumps(beats))
        assert "VALIDATION_OK" in result

    def test_validate_edit_output_ok(self):
        edits = [{"editType": "cut", "sourceStartMs": 0, "sourceEndMs": 1000, "reasoning": "trim dead time"}]
        result = validate_edit_output(json.dumps(edits))
        assert "VALIDATION_OK" in result

    def test_validate_edit_output_invalid_type(self):
        edits = [{"editType": "invalid", "sourceStartMs": 0, "sourceEndMs": 1000, "reasoning": "test"}]
        result = validate_edit_output(json.dumps(edits))
        assert "VALIDATION_WARNINGS" in result
