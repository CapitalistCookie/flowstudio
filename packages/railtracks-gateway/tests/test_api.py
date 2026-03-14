"""Tests for the FastAPI endpoints — no LLM calls required.

Tests the HTTP interface, request validation, and health endpoint.
The generate-edits endpoint is tested with mocked flow execution.
"""

import pytest
from unittest.mock import patch, AsyncMock
from fastapi.testclient import TestClient

from app.main import app


@pytest.fixture
def client():
    return TestClient(app)


class TestHealthEndpoint:
    def test_health_returns_200(self, client):
        response = client.get("/api/v1/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "healthy"
        assert data["service"] == "railtracks-gateway"
        assert "llm_provider" in data
        assert "model" in data
        assert "timestamp" in data


class TestGenerateEditsEndpoint:
    def test_rejects_missing_project_id(self, client):
        response = client.post("/api/v1/generate-edits", json={
            "signals": {"speech_segments": []}
        })
        assert response.status_code == 422  # Pydantic validation error

    def test_accepts_valid_request_shape(self, client):
        """Test that request validation passes (actual flow is mocked)."""
        mock_result = {
            "project_id": "test-123",
            "intent_graph": [{"intent_id": "i1", "action": "test"}],
            "narrative_plan": [{"beat_index": 0, "title": "intro"}],
            "edit_plan": [{"edit_type": "cut", "source_start_ms": 0, "source_end_ms": 1000}],
            "status": "completed",
        }

        with patch("app.main.run_edit_flow", new_callable=AsyncMock, return_value=mock_result):
            response = client.post("/api/v1/generate-edits", json={
                "project_id": "test-123",
                "signals": {
                    "speech_segments": [{"text": "hello"}],
                    "scene_descriptions": [],
                    "ui_transitions": [],
                    "interaction_clusters": [],
                }
            })
            assert response.status_code == 200
            data = response.json()
            assert data["project_id"] == "test-123"
            assert data["status"] == "completed"
            assert len(data["edit_plan"]) > 0

    def test_handles_empty_signals(self, client):
        """Empty signals should still be accepted (flow reads from GCS)."""
        mock_result = {
            "project_id": "test",
            "intent_graph": [],
            "narrative_plan": [],
            "edit_plan": [],
            "status": "completed",
        }

        with patch("app.main.run_edit_flow", new_callable=AsyncMock, return_value=mock_result):
            with patch("app.main.get_gcs") as mock_gcs:
                mock_gcs.return_value.read_all_signals.return_value = {
                    "speech_segments": [],
                    "scene_descriptions": [],
                    "ui_transitions": [],
                    "interaction_clusters": [],
                }
                response = client.post("/api/v1/generate-edits", json={
                    "project_id": "test",
                    "signals": {}
                })
                assert response.status_code == 200


class TestRepromptEndpoint:
    def test_rejects_missing_feedback(self, client):
        response = client.post("/api/v1/reprompt", json={
            "project_id": "test",
            "previous_edit_plan": [],
        })
        assert response.status_code == 422

    def test_accepts_valid_reprompt(self, client):
        mock_result = {
            "project_id": "test",
            "edit_plan": [{"edit_type": "zoom", "source_start_ms": 5000, "source_end_ms": 8000}],
            "status": "completed",
        }

        with patch("app.main.run_reprompt_flow", new_callable=AsyncMock, return_value=mock_result):
            response = client.post("/api/v1/reprompt", json={
                "project_id": "test",
                "previous_edit_plan": [{"edit_type": "cut", "source_start_ms": 0, "source_end_ms": 5000}],
                "feedback": "Add a zoom at 0:45",
            })
            assert response.status_code == 200
            data = response.json()
            assert data["status"] == "completed"


class TestRunsEndpoint:
    def test_unknown_run_returns_404(self, client):
        response = client.get("/api/v1/runs/nonexistent")
        assert response.status_code == 404
