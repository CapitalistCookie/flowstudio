"""Edit Planner Agent — Converts narrative beats into specific video edit decisions.

Uses Railtracks agent_node for LLM call with full observability.
"""

import railtracks as rt
from app.agents.intent_agent import _get_llm

EDIT_SYSTEM_PROMPT = """You are a professional video editor. Convert these narrative beats into specific edit decisions.

For each beat, decide specific edits:
- Cut points (where to start/end clips)
- Speed changes (speedup boring parts, slow important parts)
- Zoom/pan on important UI elements
- Transitions between beats

Respond ONLY with a JSON array. No other text, no markdown fences:
[
  {
    "edit_type": "cut" | "trim" | "speedup" | "slowdown" | "zoom" | "pan" | "transition" | "overlay",
    "source_start_ms": number,
    "source_end_ms": number,
    "output_start_ms": number,
    "output_end_ms": number,
    "parameters": { "speed": number, "zoom_level": number, "transition_type": "string", etc. },
    "reasoning": "why this edit"
  }
]"""

EditAgent = rt.agent_node(
    llm=_get_llm(),
    system_message=EDIT_SYSTEM_PROMPT,
)
