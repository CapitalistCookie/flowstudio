"""Intent graph agent — builds a hierarchy of user intents from upstream signals."""
from __future__ import annotations
import json
import re
import logging
from typing import Any

logger = logging.getLogger(__name__)

INTENT_SYSTEM_PROMPT = """You are analyzing a screen recording of someone using software. Based on signals extracted from the video, build an intent graph — a hierarchy of what the user was trying to accomplish.

Build a tree of intents where:
- Root intents are high-level goals (e.g., "Writing a blog post", "Debugging code")
- Child intents are sub-tasks (e.g., "Formatting text", "Searching for function")
- Each intent references the signal timestamps that support it

Respond with a valid JSON array of objects:
{
  "intentId": "string",
  "parentIntentId": "string | null",
  "action": "what the user is doing",
  "reasoning": "why you think this",
  "confidence": 0.0-1.0,
  "startMs": number,
  "endMs": number,
  "relatedSignalIndices": [number]
}"""


def extract_json_array(text: str) -> list[dict] | None:
    """Extract a JSON array from LLM response text with bracket counting."""
    start = text.find("[")
    if start == -1:
        return None
    depth = 0
    in_string = False
    escaped = False
    for i in range(start, len(text)):
        ch = text[i]
        if escaped:
            escaped = False
            continue
        if ch == "\\" and in_string:
            escaped = True
            continue
        if ch == '"':
            in_string = not in_string
            continue
        if in_string:
            continue
        if ch == "[":
            depth += 1
        elif ch == "]":
            depth -= 1
        if depth == 0:
            try:
                return json.loads(text[start : i + 1])
            except json.JSONDecodeError:
                return None
    return None


def format_signals_for_prompt(signals: dict[str, list[dict]]) -> str:
    """Format signal data into an XML-fenced string for the LLM prompt."""
    parts: list[str] = []
    for signal_type, items in signals.items():
        if not items:
            continue
        safe_label = re.sub(r"[^a-zA-Z0-9_-]", "_", signal_type)
        content = json.dumps(items[:50], indent=2)
        parts.append(f'<signal_data type="{safe_label}">\n{content}\n</signal_data>')
    return "\n\n".join(parts)


async def run_intent_agent(
    signals: dict[str, list[dict]],
    llm_call: Any,
) -> list[dict]:
    """Build intent graph from signals using an LLM.

    Args:
        signals: Dict of signal_type -> list of signal dicts
        llm_call: Async callable(system_prompt, user_message) -> str
    """
    user_message = format_signals_for_prompt(signals)
    if not user_message.strip():
        raise ValueError("No signals available to build intent graph")

    response_text = await llm_call(INTENT_SYSTEM_PROMPT, user_message)
    intents = extract_json_array(response_text)
    if intents is None:
        raise ValueError(f"Failed to parse intent graph JSON from LLM response")

    logger.info(f"Intent agent produced {len(intents)} intents")
    return intents
