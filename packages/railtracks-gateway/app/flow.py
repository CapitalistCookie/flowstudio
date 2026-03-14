"""Agentic flow: signals → intent → narrative → edit plan.

This module orchestrates the sequential agent pipeline with full
observability. Each step is tracked with timing and token usage.
"""
from __future__ import annotations
import time
import uuid
import logging
from typing import Any, Callable, Awaitable

from .agents.intent_agent import run_intent_agent
from .agents.narrative_agent import run_narrative_agent
from .agents.edit_agent import run_edit_agent, run_reprompt_agent
from .schemas import FlowRunStatus

logger = logging.getLogger(__name__)

LLMCallFn = Callable[[str, str], Awaitable[str]]


class FlowRun:
    """Tracks a single execution of the edit pipeline."""

    def __init__(self, project_id: str):
        self.run_id = str(uuid.uuid4())
        self.project_id = project_id
        self.status = FlowRunStatus.PENDING
        self.intent_graph: list[dict] | None = None
        self.narrative_plan: list[dict] | None = None
        self.edit_plan: list[dict] | None = None
        self.error: str | None = None
        self.steps: list[dict] = []
        self.start_time: float | None = None
        self.end_time: float | None = None
        self.total_tokens = 0

    @property
    def duration_ms(self) -> int | None:
        if self.start_time and self.end_time:
            return int((self.end_time - self.start_time) * 1000)
        return None

    def record_step(self, name: str, duration_ms: int, tokens: int = 0, **kwargs: Any) -> None:
        self.steps.append({
            "name": name,
            "duration_ms": duration_ms,
            "tokens": tokens,
            **kwargs,
        })
        self.total_tokens += tokens

    def to_dict(self) -> dict:
        return {
            "run_id": self.run_id,
            "project_id": self.project_id,
            "status": self.status.value,
            "intent_graph": self.intent_graph,
            "narrative_plan": self.narrative_plan,
            "edit_plan": self.edit_plan,
            "error": self.error,
            "duration_ms": self.duration_ms,
            "steps": self.steps,
            "token_usage": {"total": self.total_tokens},
        }


_runs: dict[str, FlowRun] = {}


def get_run(run_id: str) -> FlowRun | None:
    return _runs.get(run_id)


async def run_edit_flow(
    project_id: str,
    signals: dict[str, list[dict]],
    llm_call: LLMCallFn,
) -> FlowRun:
    """Execute the full agentic edit pipeline.

    Args:
        project_id: The project being processed
        signals: Dict of signal_type -> list of signal dicts
        llm_call: Async LLM callable(system_prompt, user_message) -> response_text
    """
    run = FlowRun(project_id)
    _runs[run.run_id] = run
    run.status = FlowRunStatus.RUNNING
    run.start_time = time.time()

    try:
        t0 = time.time()
        run.intent_graph = await run_intent_agent(signals, llm_call)
        run.record_step("intent_agent", int((time.time() - t0) * 1000), output_count=len(run.intent_graph))

        t0 = time.time()
        run.narrative_plan = await run_narrative_agent(run.intent_graph, llm_call)
        run.record_step("narrative_agent", int((time.time() - t0) * 1000), output_count=len(run.narrative_plan))

        t0 = time.time()
        run.edit_plan = await run_edit_agent(run.narrative_plan, llm_call)
        run.record_step("edit_agent", int((time.time() - t0) * 1000), output_count=len(run.edit_plan))

        run.status = FlowRunStatus.COMPLETED
    except Exception as e:
        run.status = FlowRunStatus.FAILED
        run.error = str(e)
        logger.exception(f"Flow run {run.run_id} failed: {e}")
    finally:
        run.end_time = time.time()

    return run


async def run_reprompt_flow(
    project_id: str,
    previous_edit_plan: list[dict],
    feedback: str,
    llm_call: LLMCallFn,
) -> FlowRun:
    """Re-run the edit agent with user feedback."""
    run = FlowRun(project_id)
    _runs[run.run_id] = run
    run.status = FlowRunStatus.RUNNING
    run.start_time = time.time()

    try:
        t0 = time.time()
        run.edit_plan = await run_reprompt_agent(previous_edit_plan, feedback, llm_call)
        run.record_step("reprompt_agent", int((time.time() - t0) * 1000), output_count=len(run.edit_plan))

        run.status = FlowRunStatus.COMPLETED
    except Exception as e:
        run.status = FlowRunStatus.FAILED
        run.error = str(e)
        logger.exception(f"Reprompt flow {run.run_id} failed: {e}")
    finally:
        run.end_time = time.time()

    return run
