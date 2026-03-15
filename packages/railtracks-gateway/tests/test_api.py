"""Tests for FastAPI endpoints."""
import json
import pytest
from unittest.mock import patch, AsyncMock, MagicMock
from fastapi.testclient import TestClient

from app.main import app


client = TestClient(app)


class TestHealthEndpoint:
    def test_health_returns_200(self):
        response = client.get("/health")
        assert response.status_code == 200
        data = response.json()
        assert data["healthy"] is True
        assert data["service"] == "railtracks-gateway"
        assert data["framework"] == "railtracks"


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
        # Will fail since no LLM key configured, but validates request parsing
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
