"""Railtracks-powered agentic flow: signals → intent → narrative → edit plan.

Uses rt.agent_node, rt.function_node, and rt.Flow for full observability
and compatibility with the Railtracks prize track.
"""
from __future__ import annotations
import json
import logging
import re
from typing import Any

import railtracks as rt

from .config import get_settings
from .agents.intent_agent import INTENT_SYSTEM_PROMPT, format_signals_for_prompt
from .agents.narrative_agent import NARRATIVE_SYSTEM_PROMPT
from .agents.edit_agent import EDIT_SYSTEM_PROMPT, REPROMPT_SYSTEM_PROMPT
from .agents.validation import (
    validate_json_output,
    validate_intent_graph,
    validate_narrative_plan,
    validate_edit_plan,
)

logger = logging.getLogger(__name__)

settings = get_settings()

# ── LLM configuration ─────────────────────────────────────────────────────────
# Railtracks uses litellm under the hood, which supports Gemini via the
# GEMINI_API_KEY env var or by specifying gemini/ prefix in model name.

def _get_llm() -> rt.llm.ModelBase:
    """Create the LLM instance based on configuration."""
    model = settings.google_ai_model or "gemini-2.5-pro"
    api_key = settings.google_ai_api_key
    if api_key:
        return rt.llm.GeminiLLM(model, api_key=api_key)
    return rt.llm.GeminiLLM(model)


# ── Validation tools (agents can call these to check their own output) ────────

@rt.function_node
def validate_intent_output(raw_json: str) -> str:
    """Validate that intent graph JSON is well-formed and structurally correct."""
    parsed, parse_errors = validate_json_output(raw_json)
    if parse_errors:
        return f"VALIDATION_FAILED: {'; '.join(parse_errors)}"
    errors = validate_intent_graph(parsed or [])
    if errors:
        return f"VALIDATION_WARNINGS: {'; '.join(errors)}"
    return f"VALIDATION_OK: {len(parsed or [])} intents validated"


@rt.function_node
def validate_narrative_output(raw_json: str) -> str:
    """Validate that narrative plan JSON is well-formed and structurally correct."""
    parsed, parse_errors = validate_json_output(raw_json)
    if parse_errors:
        return f"VALIDATION_FAILED: {'; '.join(parse_errors)}"
    errors = validate_narrative_plan(parsed or [])
    if errors:
        return f"VALIDATION_WARNINGS: {'; '.join(errors)}"
    return f"VALIDATION_OK: {len(parsed or [])} beats validated"


@rt.function_node
def validate_edit_output(raw_json: str) -> str:
    """Validate that edit plan JSON is well-formed and structurally correct."""
    parsed, parse_errors = validate_json_output(raw_json)
    if parse_errors:
        return f"VALIDATION_FAILED: {'; '.join(parse_errors)}"
    errors = validate_edit_plan(parsed or [])
    if errors:
        return f"VALIDATION_WARNINGS: {'; '.join(errors)}"
    return f"VALIDATION_OK: {len(parsed or [])} edits validated"


# ── Railtracks Agent Nodes ─────────────────────────────────────────────────────

IntentAgent = rt.agent_node(
    "IntentAnalyzer",
    llm=_get_llm(),
    system_message=INTENT_SYSTEM_PROMPT,
    tool_nodes=(validate_intent_output,),
)

NarrativeAgent = rt.agent_node(
    "NarrativePlanner",
    llm=_get_llm(),
    system_message=NARRATIVE_SYSTEM_PROMPT,
    tool_nodes=(validate_narrative_output,),
)

EditAgent = rt.agent_node(
    "EditPlanner",
    llm=_get_llm(),
    system_message=EDIT_SYSTEM_PROMPT,
    tool_nodes=(validate_edit_output,),
)

RepromptAgent = rt.agent_node(
    "RepromptPlanner",
    llm=_get_llm(),
    system_message=REPROMPT_SYSTEM_PROMPT,
    tool_nodes=(validate_edit_output,),
)


# ── Helper: extract JSON from agent response ──────────────────────────────────

def _extract_json_from_response(text: str) -> list[dict]:
    """Extract a JSON array from an agent's text response."""
    parsed, errors = validate_json_output(text)
    if parsed is not None:
        return parsed
    raise ValueError(f"Failed to parse JSON from agent response: {'; '.join(errors)}")


# ── Railtracks Flow: Full Edit Pipeline ───────────────────────────────────────

@rt.function_node
async def edit_pipeline(signals_json: str) -> str:
    """Run the full agentic edit pipeline: signals → intent → narrative → edits.

    Input: JSON-encoded dict of signal_type -> signal list.
    Output: JSON-encoded edit plan array.
    """
    signals = json.loads(signals_json)
    formatted_signals = format_signals_for_prompt(signals)

    if not formatted_signals.strip():
        raise ValueError("No signals available to build intent graph")

    intent_response = await rt.call(IntentAgent, formatted_signals)
    intent_graph = _extract_json_from_response(intent_response.text)
    logger.info(f"Intent agent produced {len(intent_graph)} intents")

    narrative_input = f'<signal_data type="intent_graph">\n{json.dumps(intent_graph, indent=2)}\n</signal_data>'
    narrative_response = await rt.call(NarrativeAgent, narrative_input)
    narrative_plan = _extract_json_from_response(narrative_response.text)
    narrative_plan.sort(key=lambda b: b.get("beatIndex", 0))
    logger.info(f"Narrative agent produced {len(narrative_plan)} beats")

    edit_input = f'<signal_data type="narrative_beats">\n{json.dumps(narrative_plan, indent=2)}\n</signal_data>'
    edit_response = await rt.call(EditAgent, edit_input)
    edit_plan = _extract_json_from_response(edit_response.text)
    logger.info(f"Edit agent produced {len(edit_plan)} edit decisions")

    return json.dumps({
        "intent_graph": intent_graph,
        "narrative_plan": narrative_plan,
        "edit_plan": edit_plan,
    })


@rt.function_node
async def reprompt_pipeline(reprompt_json: str) -> str:
    """Re-plan edits based on user feedback on a previous edit plan.

    Input: JSON with previous_edit_plan and feedback.
    Output: JSON-encoded revised edit plan array.
    """
    data = json.loads(reprompt_json)
    previous_plan = data["previous_edit_plan"]
    feedback = data["feedback"]

    if not previous_plan:
        raise ValueError("No previous edit plan to revise")
    if not feedback.strip():
        raise ValueError("Feedback cannot be empty")

    user_message = (
        f'<signal_data type="previous_edit_plan">\n{json.dumps(previous_plan, indent=2)}\n</signal_data>\n\n'
        f'<signal_data type="user_feedback">\n{feedback}\n</signal_data>'
    )
    response = await rt.call(RepromptAgent, user_message)
    edit_plan = _extract_json_from_response(response.text)
    logger.info(f"Reprompt agent produced {len(edit_plan)} revised edit decisions")

    return json.dumps({"edit_plan": edit_plan})


# ── Flow definitions ──────────────────────────────────────────────────────────

edit_flow = rt.Flow(
    name="FlowStudio Edit Pipeline",
    entry_point=edit_pipeline,
    save_state=True,
)

reprompt_flow = rt.Flow(
    name="FlowStudio Reprompt",
    entry_point=reprompt_pipeline,
    save_state=True,
)
