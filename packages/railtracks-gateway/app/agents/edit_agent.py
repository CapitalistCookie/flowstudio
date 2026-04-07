"""Edit planner agent — converts narrative beats into video edit decisions."""
from __future__ import annotations
import json
import logging
from typing import Any

from .intent_agent import extract_json_array

logger = logging.getLogger(__name__)

EDIT_SYSTEM_PROMPT = """You are a professional video editor. Convert these narrative beats into specific edit decisions.

For each beat, decide specific edits:
- Cut points (where to start/end clips)
- Speed changes (speedup boring parts, slow important parts)
- Zoom/pan on important UI elements
- Transitions between beats

Respond with a valid JSON array:
{
  "editType": "cut" | "trim" | "speedup" | "slowdown" | "zoom" | "pan" | "transition" | "overlay",
  "sourceStartMs": number,
  "sourceEndMs": number,
  "outputStartMs": number,
  "outputEndMs": number,
  "parameters": { "speed": number, "zoomLevel": number, "transitionType": string, ... },
  "reasoning": "why this edit"
}"""

REPROMPT_SYSTEM_PROMPT = """You are a professional video editor revising an edit plan based on user feedback.

The user has seen the previous edit plan and wants changes. Modify the edit plan to address their feedback while maintaining good video flow.

Previous edit plan and user feedback are provided. You MUST respond with the COMPLETE revised edit plan as a JSON array. Each element must have: editType, sourceStartMs, sourceEndMs, outputStartMs, outputEndMs, parameters, reasoning.

Valid editType values: "cut", "trim", "speedup", "slowdown", "zoom", "pan", "transition", "overlay".

If the user says "implement" or similar, return the previous edit plan unchanged as a JSON array. Always output a JSON array — never plain text."""


async def run_edit_agent(
    narrative_plan: list[dict],
    llm_call: Any,
) -> list[dict]:
    """Generate edit decisions from narrative beats."""
    if not narrative_plan:
        raise ValueError("Empty narrative plan — cannot create edit plan")

    user_message = f'<signal_data type="narrative_beats">\n{json.dumps(narrative_plan, indent=2)}\n</signal_data>'
    response_text = await llm_call(EDIT_SYSTEM_PROMPT, user_message)
    edits = extract_json_array(response_text)
    if edits is None:
        raise ValueError("Failed to parse edit decisions from LLM response")

    for edit in edits:
        if edit.get("sourceEndMs", 0) < edit.get("sourceStartMs", 0):
            logger.warning(f"Edit has invalid time range: {edit}")

    logger.info(f"Edit agent produced {len(edits)} edit decisions")
    return edits


async def run_reprompt_agent(
    previous_edit_plan: list[dict],
    feedback: str,
    llm_call: Any,
) -> list[dict]:
    """Revise an edit plan based on user feedback."""
    if not previous_edit_plan:
        raise ValueError("No previous edit plan to revise")
    if not feedback.strip():
        raise ValueError("Feedback cannot be empty")

    user_message = (
        f'<signal_data type="previous_edit_plan">\n{json.dumps(previous_edit_plan, indent=2)}\n</signal_data>\n\n'
        f'<signal_data type="user_feedback">\n{feedback}\n</signal_data>'
    )
    response_text = await llm_call(REPROMPT_SYSTEM_PROMPT, user_message)
    edits = extract_json_array(response_text)
    if edits is None:
        raise ValueError("Failed to parse revised edit plan from LLM response")

    logger.info(f"Reprompt agent produced {len(edits)} revised edit decisions")
    return edits
