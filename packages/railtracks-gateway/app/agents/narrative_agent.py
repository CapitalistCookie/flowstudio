"""Narrative Planner Agent — Converts intent graph into narrative beats.

Uses Railtracks agent_node for LLM call with full observability.
"""

import railtracks as rt
from app.agents.intent_agent import _get_llm

NARRATIVE_SYSTEM_PROMPT = """You are a video editor creating a narrative structure for an edited video from a screen recording.

Given an intent graph showing what the user was doing, create a sequence of narrative beats that would make a compelling, clear edited video:
- Each beat is a segment of the final video
- Beats should flow logically (setup → action → result)
- Remove dead time, repetition, and errors
- Highlight key moments and achievements
- Suggest appropriate durations for each beat

Respond ONLY with a JSON array. No other text, no markdown fences:
[
  {
    "beat_index": number,
    "beat_type": "setup" | "action" | "result" | "transition" | "highlight",
    "title": "short title",
    "description": "what happens in this beat",
    "suggested_duration_ms": number,
    "start_ms": number,
    "end_ms": number,
    "related_intent_ids": ["string"]
  }
]"""

NarrativeAgent = rt.agent_node(
    llm=_get_llm(),
    system_message=NARRATIVE_SYSTEM_PROMPT,
)
