"""Railtracks Flow definition — the core agentic pipeline.

Sequential Flow: IntentAgent → NarrativeAgent → EditAgent
With validation loops at each stage to ensure output quality.
"""

import json
import logging
from typing import Any

import railtracks as rt
from pydantic import BaseModel, Field

from app.agents.intent_agent import IntentAgent
from app.agents.narrative_agent import NarrativeAgent
from app.agents.edit_agent import EditAgent
from app.agents.validation import (
    validate_json_output,
    validate_intent_graph,
    validate_narrative_plan,
    validate_edit_plan,
)
from app.config import config

logger = logging.getLogger(__name__)


# ─── Pydantic models for Railtracks function_node parameters ──────────────────
# (Railtracks does not allow bare dict parameters)


class EditFlowInput(BaseModel):
    """Input for the edit flow function_node."""
    signals_json: str = Field(description="JSON-encoded signal data")
    project_id: str = Field(description="Project ID")


class RepromptFlowInput(BaseModel):
    """Input for the reprompt flow function_node."""
    previous_edit_plan_json: str = Field(description="JSON-encoded previous edit plan")
    feedback: str = Field(description="User feedback text")
    project_id: str = Field(description="Project ID")


def _format_signals_for_prompt(signals: dict[str, Any]) -> str:
    """Format upstream signal data into a structured prompt for the LLM."""
    sections = []

    if signals.get("speech_segments"):
        sections.append(
            f"=== SPEECH SEGMENTS ({len(signals['speech_segments'])} items) ===\n"
            + json.dumps(signals["speech_segments"], indent=2)
        )

    if signals.get("scene_descriptions"):
        sections.append(
            f"=== SCENE DESCRIPTIONS ({len(signals['scene_descriptions'])} items) ===\n"
            + json.dumps(signals["scene_descriptions"], indent=2)
        )

    if signals.get("ui_transitions"):
        sections.append(
            f"=== UI TRANSITIONS ({len(signals['ui_transitions'])} items) ===\n"
            + json.dumps(signals["ui_transitions"], indent=2)
        )

    if signals.get("interaction_clusters"):
        sections.append(
            f"=== INTERACTION CLUSTERS ({len(signals['interaction_clusters'])} items) ===\n"
            + json.dumps(signals["interaction_clusters"], indent=2)
        )

    if not sections:
        return "No signals available. Generate a basic intent graph for a screen recording."

    return "\n\n".join(sections)


async def _call_agent_with_validation(
    agent: Any,
    prompt: str,
    validator: Any,
    stage_name: str,
    max_retries: int = 2,
) -> list[dict]:
    """Call an agent and validate its output, retrying on failure.

    Implements the Railtracks Validation Loop pattern.
    """
    last_errors: list[str] = []
    parsed = None

    for attempt in range(max_retries + 1):
        # Build prompt with feedback if retrying
        actual_prompt = prompt
        if attempt > 0 and last_errors:
            feedback = "\n".join(f"- {e}" for e in last_errors)
            actual_prompt = (
                f"{prompt}\n\n"
                f"PREVIOUS ATTEMPT HAD ERRORS (attempt {attempt + 1}/{max_retries + 1}):\n"
                f"{feedback}\n\n"
                f"Please fix these issues and try again. Respond with valid JSON only."
            )

        # Call the agent via Railtracks
        raw_response = await rt.call(agent, actual_prompt)
        response_text = str(raw_response)

        # Extract and validate JSON
        parsed, parse_errors = validate_json_output(response_text)
        if parse_errors:
            logger.warning(f"{stage_name} attempt {attempt + 1}: parse errors: {parse_errors}")
            last_errors = parse_errors
            continue

        if parsed is None:
            last_errors = ["Failed to parse response"]
            continue

        # Run domain-specific validation
        domain_errors = validator(parsed)
        if domain_errors:
            logger.warning(f"{stage_name} attempt {attempt + 1}: validation errors: {domain_errors}")
            last_errors = domain_errors
            continue

        # Success!
        logger.info(f"{stage_name} completed on attempt {attempt + 1} with {len(parsed)} items")
        return parsed

    # All retries exhausted — return whatever we have or empty
    logger.error(f"{stage_name} failed after {max_retries + 1} attempts. Last errors: {last_errors}")
    if parsed is not None:
        return parsed  # Return partial results
    return []


@rt.function_node
async def edit_flow(input_data: EditFlowInput) -> str:
    """Main agentic flow: signals → intent graph → narrative plan → edit plan.

    This is the Sequential Agent pattern from Railtracks, with validation loops
    at each stage to ensure output quality.

    Returns JSON-encoded result dict.
    """
    signals = json.loads(input_data.signals_json)
    project_id = input_data.project_id

    logger.info(f"Starting edit flow for project {project_id}")
    max_retries = config.MAX_VALIDATION_RETRIES

    # ─── Stage 1: Build intent graph from signals ────────────────────────────
    signals_prompt = _format_signals_for_prompt(signals)
    intent_graph = await _call_agent_with_validation(
        agent=IntentAgent,
        prompt=f"Analyze these signals from a screen recording:\n\n{signals_prompt}",
        validator=validate_intent_graph,
        stage_name="IntentGraph",
        max_retries=max_retries,
    )

    # ─── Stage 2: Create narrative plan from intent graph ────────────────────
    intent_prompt = json.dumps(intent_graph, indent=2)
    narrative_plan = await _call_agent_with_validation(
        agent=NarrativeAgent,
        prompt=f"Create a narrative plan from this intent graph:\n\n{intent_prompt}",
        validator=validate_narrative_plan,
        stage_name="NarrativePlan",
        max_retries=max_retries,
    )

    # ─── Stage 3: Generate edit decisions from narrative ─────────────────────
    narrative_prompt = json.dumps(narrative_plan, indent=2)
    edit_plan = await _call_agent_with_validation(
        agent=EditAgent,
        prompt=f"Generate specific video edit decisions from these narrative beats:\n\n{narrative_prompt}",
        validator=validate_edit_plan,
        stage_name="EditPlan",
        max_retries=max_retries,
    )

    logger.info(
        f"Edit flow complete for {project_id}: "
        f"{len(intent_graph)} intents, {len(narrative_plan)} beats, {len(edit_plan)} edits"
    )

    return json.dumps({
        "project_id": project_id,
        "intent_graph": intent_graph,
        "narrative_plan": narrative_plan,
        "edit_plan": edit_plan,
        "status": "completed",
    })


@rt.function_node
async def reprompt_flow_node(input_data: RepromptFlowInput) -> str:
    """Re-run the edit planning stage with user feedback.

    This is the key "Cursor for video editing" interaction:
    User sees edit plan → provides feedback → AI modifies the plan.

    Returns JSON-encoded result dict.
    """
    previous_edit_plan = json.loads(input_data.previous_edit_plan_json)
    feedback = input_data.feedback
    project_id = input_data.project_id

    logger.info(f"Reprompt flow for project {project_id}: {feedback[:100]}...")

    reprompt_prompt = (
        f"The user has reviewed the following edit plan and provided feedback.\n\n"
        f"CURRENT EDIT PLAN:\n{json.dumps(previous_edit_plan, indent=2)}\n\n"
        f"USER FEEDBACK:\n{feedback}\n\n"
        f"Please modify the edit plan based on the user's feedback. "
        f"Keep edits the user didn't mention, and only change what they asked for."
    )

    updated_plan = await _call_agent_with_validation(
        agent=EditAgent,
        prompt=reprompt_prompt,
        validator=validate_edit_plan,
        stage_name="Reprompt",
        max_retries=config.MAX_VALIDATION_RETRIES,
    )

    return json.dumps({
        "project_id": project_id,
        "edit_plan": updated_plan,
        "status": "completed",
    })


# ─── Flow instances ──────────────────────────────────────────────────────────
main_flow = rt.Flow("FlowStudio Edit Pipeline", entry_point=edit_flow)
reprompt_flow = rt.Flow("FlowStudio Reprompt", entry_point=reprompt_flow_node)


async def run_edit_flow(project_id: str, signals: dict) -> dict:
    """Run the full edit flow and return results."""
    input_data = EditFlowInput(
        signals_json=json.dumps(signals),
        project_id=project_id,
    )
    result_json = await main_flow.ainvoke(input_data=input_data)
    return json.loads(result_json)


async def run_reprompt_flow(
    project_id: str,
    previous_edit_plan: list[dict],
    feedback: str,
) -> dict:
    """Run the reprompt flow and return updated edit plan."""
    input_data = RepromptFlowInput(
        previous_edit_plan_json=json.dumps(previous_edit_plan),
        feedback=feedback,
        project_id=project_id,
    )
    result_json = await reprompt_flow.ainvoke(input_data=input_data)
    return json.loads(result_json)
