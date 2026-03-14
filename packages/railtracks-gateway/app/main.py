"""FastAPI gateway for the FlowStudio agentic edit pipeline."""
from __future__ import annotations
import logging

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from .config import get_settings
from .schemas import GenerateEditsRequest, RepromptRequest, FlowRunResponse, FlowRunStatus
from .flow import run_edit_flow, run_reprompt_flow, get_run

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)

app = FastAPI(
    title="FlowStudio Agentic Gateway",
    description="Agentic AI loop for video edit planning: intent → narrative → edits",
    version="0.1.0",
)

settings = get_settings()

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


async def _default_llm_call(system_prompt: str, user_message: str) -> str:
    """Default LLM call using Google Generative AI (Gemini)."""
    try:
        import google.generativeai as genai
    except ImportError:
        raise HTTPException(status_code=500, detail="google-generativeai not installed")

    if not settings.google_ai_api_key:
        raise HTTPException(status_code=500, detail="GOOGLE_AI_API_KEY not configured")

    genai.configure(api_key=settings.google_ai_api_key)
    model = genai.GenerativeModel("gemini-2.0-flash")
    response = model.generate_content(
        [{"role": "user", "parts": [f"{system_prompt}\n\n{user_message}"]}],
    )
    return response.text


@app.get("/health")
async def health():
    return {"healthy": True, "service": "railtracks-gateway"}


@app.post("/api/v1/generate-edits", response_model=FlowRunResponse)
async def generate_edits(request: GenerateEditsRequest):
    """Run the full agentic pipeline: signals → intent → narrative → edit plan."""
    signals = {
        "speech_segments": request.signals.speech_segments,
        "scene_descriptions": request.signals.scene_descriptions,
        "ui_transitions": request.signals.ui_transitions,
        "interaction_clusters": request.signals.interaction_clusters,
    }

    run = await run_edit_flow(
        project_id=request.project_id,
        signals=signals,
        llm_call=_default_llm_call,
    )

    if run.status == FlowRunStatus.FAILED:
        raise HTTPException(status_code=500, detail=run.error or "Flow failed")

    return FlowRunResponse(
        run_id=run.run_id,
        status=run.status,
        project_id=run.project_id,
        edit_plan=[_dict_to_edit(e) for e in (run.edit_plan or [])],
        intent_graph=run.intent_graph,
        narrative_plan=run.narrative_plan,
        duration_ms=run.duration_ms,
        token_usage={"total": run.total_tokens},
    )


@app.post("/api/v1/reprompt", response_model=FlowRunResponse)
async def reprompt(request: RepromptRequest):
    """Re-run the edit agent with user feedback on a previous plan."""
    prev_plan = [e.model_dump(by_alias=True) for e in request.previous_edit_plan]

    run = await run_reprompt_flow(
        project_id=request.project_id,
        previous_edit_plan=prev_plan,
        feedback=request.feedback,
        llm_call=_default_llm_call,
    )

    if run.status == FlowRunStatus.FAILED:
        raise HTTPException(status_code=500, detail=run.error or "Reprompt failed")

    return FlowRunResponse(
        run_id=run.run_id,
        status=run.status,
        project_id=run.project_id,
        edit_plan=[_dict_to_edit(e) for e in (run.edit_plan or [])],
        duration_ms=run.duration_ms,
        token_usage={"total": run.total_tokens},
    )


@app.get("/api/v1/runs/{run_id}", response_model=FlowRunResponse)
async def get_run_status(run_id: str):
    """Get the status and details of a flow run."""
    run = get_run(run_id)
    if not run:
        raise HTTPException(status_code=404, detail=f"Run {run_id} not found")

    return FlowRunResponse(
        run_id=run.run_id,
        status=run.status,
        project_id=run.project_id,
        edit_plan=[_dict_to_edit(e) for e in (run.edit_plan or [])],
        intent_graph=run.intent_graph,
        narrative_plan=run.narrative_plan,
        error=run.error,
        duration_ms=run.duration_ms,
        token_usage={"total": run.total_tokens},
    )


def _dict_to_edit(d: dict) -> dict:
    """Pass through dict for response serialization."""
    return d
