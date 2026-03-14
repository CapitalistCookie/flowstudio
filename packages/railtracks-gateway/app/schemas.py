"""Pydantic models matching the TypeScript shared types."""
from __future__ import annotations
from enum import Enum
from pydantic import BaseModel, Field, field_validator


class EditType(str, Enum):
    CUT = "cut"
    TRIM = "trim"
    SPEEDUP = "speedup"
    SLOWDOWN = "slowdown"
    ZOOM = "zoom"
    PAN = "pan"
    TRANSITION = "transition"
    OVERLAY = "overlay"


class BeatType(str, Enum):
    SETUP = "setup"
    ACTION = "action"
    RESULT = "result"
    TRANSITION = "transition"
    HIGHLIGHT = "highlight"


class IntentNode(BaseModel):
    intent_id: str = Field(max_length=200, alias="intentId")
    parent_intent_id: str | None = Field(max_length=200, alias="parentIntentId")
    action: str = Field(max_length=500)
    reasoning: str = Field(max_length=1000)
    confidence: float = Field(ge=0.0, le=1.0)
    start_ms: int = Field(ge=0, alias="startMs")
    end_ms: int = Field(ge=0, alias="endMs")
    related_signal_indices: list[int] = Field(alias="relatedSignalIndices")

    model_config = {"populate_by_name": True}


class NarrativeBeat(BaseModel):
    beat_index: int = Field(ge=0, alias="beatIndex")
    beat_type: BeatType = Field(alias="beatType")
    title: str = Field(max_length=200)
    description: str = Field(max_length=1000)
    suggested_duration_ms: int = Field(ge=0, alias="suggestedDurationMs")
    start_ms: int = Field(ge=0, alias="startMs")
    end_ms: int = Field(ge=0, alias="endMs")
    related_intent_ids: list[str] = Field(alias="relatedIntentIds")

    model_config = {"populate_by_name": True}


class EditDecision(BaseModel):
    edit_type: EditType = Field(alias="editType")
    source_start_ms: int = Field(ge=0, alias="sourceStartMs")
    source_end_ms: int = Field(ge=0, alias="sourceEndMs")
    output_start_ms: int = Field(ge=0, alias="outputStartMs")
    output_end_ms: int = Field(ge=0, alias="outputEndMs")
    parameters: dict = Field(default_factory=dict)
    reasoning: str = Field(max_length=1000)

    model_config = {"populate_by_name": True}

    @field_validator("source_end_ms")
    @classmethod
    def source_end_after_start(cls, v: int, info) -> int:
        start = info.data.get("source_start_ms", 0)
        if v < start:
            raise ValueError("sourceEndMs must be >= sourceStartMs")
        return v


class SignalData(BaseModel):
    speech_segments: list[dict] = Field(default_factory=list)
    scene_descriptions: list[dict] = Field(default_factory=list)
    ui_transitions: list[dict] = Field(default_factory=list)
    interaction_clusters: list[dict] = Field(default_factory=list)


class GenerateEditsRequest(BaseModel):
    project_id: str = Field(min_length=1, max_length=200)
    signals: SignalData


class RepromptRequest(BaseModel):
    project_id: str = Field(min_length=1, max_length=200)
    previous_edit_plan: list[EditDecision]
    feedback: str = Field(min_length=1, max_length=5000)


class FlowRunStatus(str, Enum):
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"


class FlowRunResponse(BaseModel):
    run_id: str
    status: FlowRunStatus
    project_id: str
    intent_graph: list[IntentNode] | None = None
    narrative_plan: list[NarrativeBeat] | None = None
    edit_plan: list[EditDecision] | None = None
    error: str | None = None
    duration_ms: int | None = None
    token_usage: dict | None = None
