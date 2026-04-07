"""FastAPI gateway for the FlowStudio agentic edit pipeline.

Uses Railtracks for agent orchestration and observability.
"""
from __future__ import annotations
import json
import logging
import os
import time
from collections import defaultdict

import firebase_admin
from firebase_admin import auth as firebase_auth, credentials
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse

from .config import get_settings
from .schemas import (
    GenerateEditsRequest,
    RepromptRequest,
    FlowRunResponse,
    FlowRunStatus,
)
from .flow import edit_flow, reprompt_flow

# Initialize Firebase Admin SDK
if not firebase_admin._apps:
    sa_key = os.environ.get("FIREBASE_SERVICE_ACCOUNT_KEY")
    if sa_key:
        cred = credentials.Certificate(json.loads(sa_key))
        firebase_admin.initialize_app(credential=cred)
    else:
        # On GCP, use default credentials
        firebase_admin.initialize_app()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(name)s %(levelname)s %(message)s",
)
logger = logging.getLogger(__name__)

settings = get_settings()


class RateLimitMiddleware(BaseHTTPMiddleware):
    """Sliding window rate limiter per client IP."""

    def __init__(self, app, rpm: int = 30):
        super().__init__(app)
        self.rpm = rpm
        self._hits: dict[str, list[float]] = defaultdict(list)

    async def dispatch(self, request: Request, call_next):
        if request.url.path == "/health" or request.method == "OPTIONS":
            return await call_next(request)

        client = request.client.host if request.client else "unknown"
        now = time.time()
        window = self._hits[client]
        window[:] = [t for t in window if now - t < 60]

        if len(window) >= self.rpm:
            return JSONResponse(
                {"error": "Rate limit exceeded"}, status_code=429
            )

        window.append(now)
        return await call_next(request)


class ApiKeyMiddleware(BaseHTTPMiddleware):
    """Require X-API-Key header when GATEWAY_API_KEY is set."""

    def __init__(self, app, api_key: str):
        super().__init__(app)
        self.api_key = api_key

    async def dispatch(self, request: Request, call_next):
        if not self.api_key or request.url.path == "/health" or request.method == "OPTIONS":
            return await call_next(request)

        provided = request.headers.get("x-api-key", "")
        if provided != self.api_key:
            return JSONResponse(
                {"error": "Invalid or missing API key"}, status_code=401
            )
        return await call_next(request)


class FirebaseAuthMiddleware(BaseHTTPMiddleware):
    """Verify Firebase ID token from Authorization: Bearer header."""

    async def dispatch(self, request: Request, call_next):
        if request.url.path == "/health" or request.method == "OPTIONS":
            return await call_next(request)

        auth_header = request.headers.get("authorization", "")
        if not auth_header.startswith("Bearer "):
            return JSONResponse(
                {"error": "Missing or invalid Authorization header"},
                status_code=401,
            )

        token = auth_header[7:]
        try:
            decoded = firebase_auth.verify_id_token(token)
            request.state.firebase_uid = decoded["uid"]
        except Exception:
            return JSONResponse(
                {"error": "Invalid Firebase token"}, status_code=401
            )

        return await call_next(request)


app = FastAPI(
    title="FlowStudio Agentic Gateway",
    description="Railtracks-powered agentic AI loop for video edit planning",
    version="0.2.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(RateLimitMiddleware, rpm=settings.rate_limit_rpm)
# Firebase auth is the primary auth layer
app.add_middleware(FirebaseAuthMiddleware)
# API key middleware kept as optional secondary layer
if settings.api_key:
    app.add_middleware(ApiKeyMiddleware, api_key=settings.api_key)


@app.get("/health")
async def health():
    return {"healthy": True, "service": "railtracks-gateway", "framework": "railtracks"}


@app.post("/api/v1/generate-edits", response_model=FlowRunResponse)
async def generate_edits(request: GenerateEditsRequest):
    """Run the full agentic pipeline: signals → intent → narrative → edit plan.

    Powered by Railtracks Flow with full observability.
    """
    signals = {
        "speech_segments": request.signals.speech_segments,
        "scene_descriptions": request.signals.scene_descriptions,
        "ui_transitions": request.signals.ui_transitions,
        "interaction_clusters": request.signals.interaction_clusters,
    }

    try:
        result = await edit_flow.ainvoke(json.dumps(signals))
        result_text = result.text if hasattr(result, 'text') else result
        output = json.loads(result_text)
    except Exception as e:
        logger.exception(f"Edit flow failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

    return FlowRunResponse(
        run_id="rt-" + str(id(result)),
        status=FlowRunStatus.COMPLETED,
        project_id=request.project_id,
        edit_plan=output.get("edit_plan", []),
        intent_graph=output.get("intent_graph"),
        narrative_plan=output.get("narrative_plan"),
    )


@app.post("/api/v1/reprompt", response_model=FlowRunResponse)
async def reprompt(request: RepromptRequest):
    """Re-run the edit agent with user feedback on a previous plan.

    Powered by Railtracks Flow with full observability.
    """
    prev_plan = [e.model_dump(by_alias=True) for e in request.previous_edit_plan]

    try:
        result = await reprompt_flow.ainvoke(json.dumps({
            "previous_edit_plan": prev_plan,
            "feedback": request.feedback,
        }))
        result_text = result.text if hasattr(result, 'text') else result
        output = json.loads(result_text)
    except Exception as e:
        logger.exception(f"Reprompt flow failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

    return FlowRunResponse(
        run_id="rt-" + str(id(result)),
        status=FlowRunStatus.COMPLETED,
        project_id=request.project_id,
        edit_plan=output.get("edit_plan", []),
    )
