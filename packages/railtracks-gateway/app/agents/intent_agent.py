"""Intent Graph Agent — Analyzes upstream signals to build intent hierarchy.

Uses Railtracks agent_node to wrap the LLM call with observability.
"""

import railtracks as rt
from app.config import config

INTENT_SYSTEM_PROMPT = """You are analyzing a screen recording of someone using software.
Based on signals extracted from the video, build an intent graph — a hierarchy of what the user was trying to accomplish.

Build a tree of intents where:
- Root intents are high-level goals (e.g., "Writing a blog post", "Debugging code")
- Child intents are sub-tasks (e.g., "Formatting text", "Searching for function")
- Each intent references the signal timestamps that support it

Respond ONLY with a JSON array of objects. No other text, no markdown fences:
[
  {
    "intent_id": "string",
    "parent_intent_id": "string or null",
    "action": "what the user is doing",
    "reasoning": "why you think this",
    "confidence": 0.0-1.0,
    "start_ms": number,
    "end_ms": number,
    "related_signal_indices": [number]
  }
]"""


def _get_llm():
    """Create the appropriate Railtracks LLM based on config."""
    provider = config.LLM_PROVIDER.lower()
    model = config.get_llm_model_name()

    if provider == "openai":
        return rt.llm.OpenAILLM(model)
    elif provider == "anthropic":
        return rt.llm.AnthropicLLM(model)
    elif provider == "gemini":
        return rt.llm.GeminiLLM(model)
    else:
        # Default to Gemini since GCP is set up
        return rt.llm.GeminiLLM(model)


IntentAgent = rt.agent_node(
    llm=_get_llm(),
    system_message=INTENT_SYSTEM_PROMPT,
)
