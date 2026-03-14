"""Pydantic schemas matching the TypeScript shared types."""

from __future__ import annotations
from pydantic import BaseModel, Field
from typing import Optional


# ─── Request / Response DTOs ──────────────────────────────────────────────────

class SignalData(BaseModel):
    """Collection of upstream signals from the TS workers."""
    speech_segments: list[dict] = Field(default_factory=list)
    scene_descriptions: list[dict] = Field(default_factory=list)
    ui_transitions: list[dict] = Field(default_factory=list)
    interaction_clusters: list[dict] = Field(default_factory=list)


class GenerateEditsRequest(BaseModel):
    """POST /api/v1/generate-edits body."""
    project_id: str
    signals: SignalData


class RepromptRequest(BaseModel):
    """POST /api/v1/reprompt body."""
    project_id: str
    previous_edit_plan: list[dict]
    feedback: str


class EditDecision(BaseModel):
    """A single video edit decision."""
    edit_type: str = Field(description="cut | trim | speedup | slowdown | zoom | pan | transition | overlay")
    source_start_ms: int = Field(ge=0)
    source_end_ms: int = Field(ge=0)
    output_start_ms: int = Field(ge=0)
    output_end_ms: int = Field(ge=0)
    parameters: dict = Field(default_factory=dict)
    reasoning: str = ""


class IntentNode(BaseModel):
    """A node in the intent graph."""
    intent_id: str
    parent_intent_id: Optional[str] = None
    action: str
    reasoning: str
    confidence: float = Field(ge=0.0, le=1.0)
    start_ms: int = Field(ge=0)
    end_ms: int = Field(ge=0)
    related_signal_indices: list[int] = Field(default_factory=list)


class NarrativeBeat(BaseModel):
    """A narrative beat for the edited video."""
    beat_index: int = Field(ge=0)
    beat_type: str = Field(description="setup | action | result | transition | highlight")
    title: str
    description: str
    suggested_duration_ms: int = Field(ge=0)
    start_ms: int = Field(ge=0)
    end_ms: int = Field(ge=0)
    related_intent_ids: list[str] = Field(default_factory=list)


class FlowResult(BaseModel):
    """Result from running the edit flow."""
    project_id: str
    intent_graph: list[dict] = Field(default_factory=list)
    narrative_plan: list[dict] = Field(default_factory=list)
    edit_plan: list[dict] = Field(default_factory=list)
    run_id: Optional[str] = None
    status: str = "completed"


class RunStatus(BaseModel):
    """Status of a Railtracks flow run."""
    run_id: str
    status: str
    steps_completed: int = 0
    total_steps: int = 3  # intent → narrative → edit
    result: Optional[FlowResult] = None
