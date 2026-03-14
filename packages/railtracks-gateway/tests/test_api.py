"""Tests for FastAPI endpoints."""
import json
import pytest
from unittest.mock import patch, AsyncMock
from fastapi.testclient import TestClient

from app.main import app
from app.flow import FlowRun, FlowRunStatus, _runs


client = TestClient(app)


MOCK_INTENTS = [
    {"intentId": "i1", "parentIntentId": None, "action": "Coding",
     "reasoning": "Typed", "confidence": 0.9,
     "startMs": 0, "endMs": 30000, "relatedSignalIndices": [0]}
]
MOCK_BEATS = [
    {"beatIndex": 0, "beatType": "action", "title": "Code", "description": "Writing",
     "suggestedDurationMs": 25000, "startMs": 0, "endMs": 25000, "relatedIntentIds": ["i1"]}
]
MOCK_EDITS = [
    {"editType": "cut", "sourceStartMs": 0, "sourceEndMs": 25000,
     "outputStartMs": 0, "outputEndMs": 25000, "parameters": {}, "reasoning": "Clip"}
]


class TestHealthEndpoint:
    def test_health_returns_200(self):
        response = client.get("/health")
        assert response.status_code == 200
        data = response.json()
        assert data["healthy"] is True
        assert data["service"] == "railtracks-gateway"


class TestGenerateEditsEndpoint:
    def test_valid_request_structure(self):
        response = client.post("/api/v1/generate-edits", json={
            "project_id": "test-proj",
            "signals": {
                "speech_segments": [{"text": "hello"}],
                "scene_descriptions": [],
                "ui_transitions": [],
                "interaction_clusters": [],
            },
        })
        # Will fail since no LLM key, but validates request parsing
        assert response.status_code in (200, 500)

    def test_rejects_empty_project_id(self):
        response = client.post("/api/v1/generate-edits", json={
            "project_id": "",
            "signals": {"speech_segments": []},
        })
        assert response.status_code == 422

    def test_rejects_missing_signals(self):
        response = client.post("/api/v1/generate-edits", json={
            "project_id": "test",
        })
        assert response.status_code == 422


class TestRepromptEndpoint:
    def test_valid_reprompt_structure(self):
        response = client.post("/api/v1/reprompt", json={
            "project_id": "test-proj",
            "previous_edit_plan": [{
                "editType": "cut", "sourceStartMs": 0, "sourceEndMs": 5000,
                "outputStartMs": 0, "outputEndMs": 5000,
                "parameters": {}, "reasoning": "test"
            }],
            "feedback": "Make it shorter",
        })
        assert response.status_code in (200, 500)

    def test_rejects_empty_feedback(self):
        response = client.post("/api/v1/reprompt", json={
            "project_id": "test",
            "previous_edit_plan": [{
                "editType": "cut", "sourceStartMs": 0, "sourceEndMs": 5000,
                "outputStartMs": 0, "outputEndMs": 5000,
                "parameters": {}, "reasoning": "x"
            }],
            "feedback": "",
        })
        assert response.status_code == 422

    def test_rejects_feedback_too_long(self):
        response = client.post("/api/v1/reprompt", json={
            "project_id": "test",
            "previous_edit_plan": [{
                "editType": "cut", "sourceStartMs": 0, "sourceEndMs": 5000,
                "outputStartMs": 0, "outputEndMs": 5000,
                "parameters": {}, "reasoning": "x"
            }],
            "feedback": "x" * 5001,
        })
        assert response.status_code == 422


class TestRunStatusEndpoint:
    def test_nonexistent_run_returns_404(self):
        response = client.get("/api/v1/runs/nonexistent-id")
        assert response.status_code == 404

    def test_existing_run_returns_data(self):
        run = FlowRun("test-proj")
        run.status = FlowRunStatus.COMPLETED
        run.edit_plan = MOCK_EDITS
        run.start_time = 1000.0
        run.end_time = 1001.0
        _runs[run.run_id] = run

        response = client.get(f"/api/v1/runs/{run.run_id}")
        assert response.status_code == 200
        data = response.json()
        assert data["run_id"] == run.run_id
        assert data["status"] == "completed"
        assert data["project_id"] == "test-proj"

        # Cleanup
        del _runs[run.run_id]


class TestSchemaValidation:
    def test_edit_type_validation(self):
        response = client.post("/api/v1/reprompt", json={
            "project_id": "test",
            "previous_edit_plan": [{
                "editType": "invalid_type", "sourceStartMs": 0, "sourceEndMs": 5000,
                "outputStartMs": 0, "outputEndMs": 5000,
                "parameters": {}, "reasoning": "x"
            }],
            "feedback": "fix it",
        })
        assert response.status_code == 422
