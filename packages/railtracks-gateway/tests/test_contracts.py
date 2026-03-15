"""Data contract verification: schema shapes match frontend expectations."""
import pytest
from pydantic import ValidationError

from app.schemas import (
    BeatType,
    EditDecision,
    EditType,
    FlowRunResponse,
    FlowRunStatus,
    GenerateEditsRequest,
    IntentNode,
    NarrativeBeat,
    RepromptRequest,
    SignalData,
)


def test_generate_edits_request_shape():
    """GenerateEditsRequest validates correctly with real-shaped signal data."""
    req = GenerateEditsRequest(
        project_id="proj-123",
        signals=SignalData(
            speech_segments=[{"text": "hello", "timestampMs": 0}],
            scene_descriptions=[{"description": "coding", "timestampMs": 1000}],
            ui_transitions=[],
            interaction_clusters=[],
        ),
    )
    assert req.project_id == "proj-123"
    assert len(req.signals.speech_segments) == 1
    assert req.signals.speech_segments[0]["text"] == "hello"
    assert len(req.signals.scene_descriptions) == 1


def test_reprompt_request_shape():
    """RepromptRequest validates with a list of EditDecision objects."""
    req = RepromptRequest(
        project_id="proj-123",
        previous_edit_plan=[
            EditDecision(
                editType="zoom",
                sourceStartMs=0,
                sourceEndMs=5000,
                outputStartMs=0,
                outputEndMs=5000,
                parameters={"zoomLevel": 1.5},
                reasoning="Zoom into click",
            )
        ],
        feedback="Make the zoom more gradual",
    )
    assert len(req.previous_edit_plan) == 1
    assert req.feedback == "Make the zoom more gradual"
    assert req.previous_edit_plan[0].edit_type == EditType.ZOOM


def test_flow_run_response_serializes():
    """FlowRunResponse can serialize edit_plan, intent_graph, and narrative_plan."""
    resp = FlowRunResponse(
        run_id="rt-123",
        status=FlowRunStatus.COMPLETED,
        project_id="proj-123",
        edit_plan=[{"editType": "zoom", "sourceStartMs": 0}],
        intent_graph=[{"intentId": "i-1"}],
        narrative_plan=[{"beatIndex": 0}],
    )
    assert resp.status == FlowRunStatus.COMPLETED
    assert len(resp.edit_plan) == 1
    assert len(resp.intent_graph) == 1
    assert len(resp.narrative_plan) == 1
    # Serialize to dict (what would be sent as JSON)
    data = resp.model_dump()
    assert data["edit_plan"][0]["editType"] == "zoom"
    assert data["intent_graph"][0]["intentId"] == "i-1"
    assert data["narrative_plan"][0]["beatIndex"] == 0


def test_edit_decision_camel_case():
    """EditDecision validates camelCase aliases correctly (editType, sourceStartMs, etc.)."""
    ed = EditDecision(
        editType="zoom",
        sourceStartMs=0,
        sourceEndMs=5000,
        outputStartMs=0,
        outputEndMs=5000,
        parameters={"zoomLevel": 1.5},
        reasoning="Zoom into click action",
    )
    dumped = ed.model_dump(by_alias=True)
    assert "editType" in dumped
    assert "sourceStartMs" in dumped
    assert "sourceEndMs" in dumped
    assert "outputStartMs" in dumped
    assert "outputEndMs" in dumped
    assert dumped["editType"] == "zoom"
    assert dumped["sourceStartMs"] == 0
    assert dumped["sourceEndMs"] == 5000


def test_edit_decision_rejects_invalid_range():
    """EditDecision rejects sourceEndMs < sourceStartMs."""
    with pytest.raises(ValidationError) as exc_info:
        EditDecision(
            editType="trim",
            sourceStartMs=5000,
            sourceEndMs=1000,  # Invalid: end < start
            outputStartMs=0,
            outputEndMs=4000,
            parameters={},
            reasoning="test",
        )
    assert "sourceEndMs must be >= sourceStartMs" in str(exc_info.value)


def test_intent_node_camel_case():
    """IntentNode validates camelCase aliases (intentId, startMs, endMs, etc.)."""
    node = IntentNode(
        intentId="i-1",
        parentIntentId=None,
        action="Click button",
        reasoning="User clicks submit",
        confidence=0.95,
        startMs=0,
        endMs=3000,
        relatedSignalIndices=[0, 1],
    )
    dumped = node.model_dump(by_alias=True)
    assert "intentId" in dumped
    assert "parentIntentId" in dumped
    assert "startMs" in dumped
    assert "endMs" in dumped
    assert "relatedSignalIndices" in dumped
    assert dumped["intentId"] == "i-1"
    assert dumped["startMs"] == 0
    assert dumped["endMs"] == 3000


def test_narrative_beat_camel_case():
    """NarrativeBeat validates camelCase aliases (beatIndex, beatType, startMs, endMs, etc.)."""
    beat = NarrativeBeat(
        beatIndex=0,
        beatType="setup",
        title="Introduction",
        description="Opening of the demo",
        suggestedDurationMs=5000,
        startMs=0,
        endMs=5000,
        relatedIntentIds=["i-1"],
    )
    dumped = beat.model_dump(by_alias=True)
    assert "beatIndex" in dumped
    assert "beatType" in dumped
    assert "suggestedDurationMs" in dumped
    assert "startMs" in dumped
    assert "endMs" in dumped
    assert "relatedIntentIds" in dumped
    assert dumped["beatIndex"] == 0
    assert dumped["beatType"] == BeatType.SETUP.value
