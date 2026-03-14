"""Narrative planner agent — converts intent graph into narrative beats."""
from __future__ import annotations
import json
import logging
from typing import Any

from .intent_agent import extract_json_array

logger = logging.getLogger(__name__)

NARRATIVE_SYSTEM_PROMPT = """You are a video editor creating a narrative structure for an edited video from a screen recording.

Create a sequence of narrative beats that would make a compelling, clear edited video:
- Each beat is a segment of the final video
- Beats should flow logically (setup → action → result)
- Remove dead time, repetition, and errors
- Highlight key moments and achievements

Respond with a valid JSON array:
{
  "beatIndex": number,
  "beatType": "setup" | "action" | "result" | "transition" | "highlight",
  "title": "short title",
  "description": "what happens in this beat",
  "suggestedDurationMs": number,
  "startMs": number,
  "endMs": number,
  "relatedIntentIds": ["string"]
}"""


async def run_narrative_agent(
    intent_graph: list[dict],
    llm_call: Any,
) -> list[dict]:
    """Convert intent graph into narrative beats.

    Args:
        intent_graph: List of intent node dicts
        llm_call: Async callable(system_prompt, user_message) -> str
    """
    if not intent_graph:
        raise ValueError("Empty intent graph — cannot create narrative plan")

    user_message = f'<signal_data type="intent_graph">\n{json.dumps(intent_graph, indent=2)}\n</signal_data>'
    response_text = await llm_call(NARRATIVE_SYSTEM_PROMPT, user_message)
    beats = extract_json_array(response_text)
    if beats is None:
        raise ValueError("Failed to parse narrative beats from LLM response")

    beats.sort(key=lambda b: b.get("beatIndex", 0))
    logger.info(f"Narrative agent produced {len(beats)} beats")
    return beats
