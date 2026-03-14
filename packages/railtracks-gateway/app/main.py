"""FastAPI application — HTTP interface for the Railtracks agentic pipeline.

Endpoints:
  POST /api/v1/generate-edits  — Run full pipeline (signals → edit plan)
  POST /api/v1/reprompt        — Re-run edit planning with user feedback
  GET  /api/v1/health          — Health check
"""

import logging
import uuid
from contextlib import asynccontextmanager
from datetime import datetime

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from app.config import config
from app.schemas import (
    GenerateEditsRequest,
    RepromptRequest,
    FlowResult,
)
from app.flow import run_edit_flow, run_reprompt_flow
from app.gcs_tools import get_gcs

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
)
logger = logging.getLogger(__name__)

# ─── In-memory run store (for demo/hackathon — not production) ────────────────
_runs: dict[str, dict] = {}


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifecycle."""
    logger.info("FlowStudio Railtracks Gateway starting...")
    logger.info(f"LLM Provider: {config.LLM_PROVIDER}")
    logger.info(f"Model: {config.get_llm_model_name()}")
    logger.info(f"GCS Bucket: {config.GCS_BUCKET}")
    yield
    logger.info("Gateway shutting down.")


app = FastAPI(
    title="FlowStudio Railtracks Gateway",
    description=(
        "Agentic AI video editing pipeline powered by Railtracks. "
        "Runs intent graph → narrative planning → edit planning with "
        "validation loops and full agent observability."
    ),
    version="0.1.0",
    lifespan=lifespan,
)

# CORS — allow frontend and SpacetimeDB to call us
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # TODO: restrict for production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ─── Endpoints ────────────────────────────────────────────────────────────────


@app.get("/api/v1/health")
async def health():
    """Health check endpoint."""
    return {
        "status": "healthy",
        "service": "railtracks-gateway",
        "llm_provider": config.LLM_PROVIDER,
        "model": config.get_llm_model_name(),
        "timestamp": datetime.utcnow().isoformat(),
    }


@app.post("/api/v1/generate-edits", response_model=FlowResult)
async def generate_edits(request: GenerateEditsRequest):
    """Run the full agentic edit pipeline.

    Accepts upstream signals (from TS workers), runs them through
    IntentAgent → NarrativeAgent → EditAgent with validation loops.
    Returns the complete edit plan.
    """
    run_id = str(uuid.uuid4())
    logger.info(f"[{run_id}] Starting edit generation for project {request.project_id}")

    # Track run
    _runs[run_id] = {
        "status": "running",
        "project_id": request.project_id,
        "started_at": datetime.utcnow().isoformat(),
    }

    try:
        signals = request.signals.model_dump()

        # If no signals provided, try reading from GCS
        has_signals = any(
            len(signals.get(k, [])) > 0
            for k in ["speech_segments", "scene_descriptions", "ui_transitions", "interaction_clusters"]
        )
        if not has_signals:
            logger.info(f"[{run_id}] No signals in request, reading from GCS...")
            try:
                gcs = get_gcs()
                signals = gcs.read_all_signals(request.project_id)
            except Exception as e:
                logger.warning(f"[{run_id}] GCS read failed: {e}. Using empty signals.")

        # Run the Railtracks flow
        result = await run_edit_flow(
            project_id=request.project_id,
            signals=signals,
        )

        # Write results to GCS (best-effort)
        try:
            gcs = get_gcs()
            if result.get("intent_graph"):
                gcs.write_intent_graph(request.project_id, result["intent_graph"])
            if result.get("narrative_plan"):
                gcs.write_narrative_plan(request.project_id, result["narrative_plan"])
            if result.get("edit_plan"):
                gcs.write_edit_plan(request.project_id, result["edit_plan"])
        except Exception as e:
            logger.warning(f"[{run_id}] GCS write failed (non-fatal): {e}")

        # Update run status
        _runs[run_id]["status"] = "completed"
        _runs[run_id]["completed_at"] = datetime.utcnow().isoformat()

        return FlowResult(
            project_id=request.project_id,
            intent_graph=result.get("intent_graph", []),
            narrative_plan=result.get("narrative_plan", []),
            edit_plan=result.get("edit_plan", []),
            run_id=run_id,
            status="completed",
        )

    except Exception as e:
        logger.error(f"[{run_id}] Edit generation failed: {e}", exc_info=True)
        _runs[run_id]["status"] = "failed"
        _runs[run_id]["error"] = str(e)
        raise HTTPException(status_code=500, detail=f"Edit generation failed: {str(e)}")


@app.post("/api/v1/reprompt", response_model=FlowResult)
async def reprompt(request: RepromptRequest):
    """Re-run edit planning with user feedback.

    The "Cursor for video editing" interaction:
    User reviews edit plan → provides feedback → AI modifies the plan.
    """
    run_id = str(uuid.uuid4())
    logger.info(
        f"[{run_id}] Reprompt for project {request.project_id}: {request.feedback[:80]}..."
    )

    try:
        result = await run_reprompt_flow(
            project_id=request.project_id,
            previous_edit_plan=request.previous_edit_plan,
            feedback=request.feedback,
        )

        # Write updated plan to GCS with version bump
        try:
            gcs = get_gcs()
            # Simple version counting — in production, query GCS for latest version
            gcs.write_edit_plan(request.project_id, result.get("edit_plan", []), version=2)
        except Exception as e:
            logger.warning(f"[{run_id}] GCS write failed (non-fatal): {e}")

        return FlowResult(
            project_id=request.project_id,
            edit_plan=result.get("edit_plan", []),
            run_id=run_id,
            status="completed",
        )

    except Exception as e:
        logger.error(f"[{run_id}] Reprompt failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Reprompt failed: {str(e)}")


@app.get("/api/v1/runs/{run_id}")
async def get_run(run_id: str):
    """Get the status of a flow run."""
    if run_id not in _runs:
        raise HTTPException(status_code=404, detail="Run not found")
    return _runs[run_id]


# ─── Entry point ──────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "app.main:app",
        host=config.HOST,
        port=config.PORT,
        reload=True,
    )
