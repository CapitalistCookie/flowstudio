"""Validation module — programmatic checks on LLM output quality.

Uses Railtracks validation loop pattern: generate → validate → feedback → retry.
"""

import json
from typing import Optional


VALID_EDIT_TYPES = {"cut", "trim", "speedup", "slowdown", "zoom", "pan", "transition", "overlay"}
VALID_BEAT_TYPES = {"setup", "action", "result", "transition", "highlight"}


def validate_json_output(text: str) -> tuple[Optional[list], list[str]]:
    """Extract and validate JSON array from LLM response.

    Returns:
        (parsed_list, errors) — parsed_list is None if extraction/parsing fails.
    """
    errors: list[str] = []

    # Find JSON array in response
    start = text.find("[")
    if start == -1:
        return None, ["No JSON array found in response"]

    # String-aware bracket counting
    depth = 0
    in_string = False
    escaped = False
    end_idx = -1

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
            end_idx = i
            break

    if end_idx == -1:
        return None, ["Unmatched brackets — truncated response"]

    json_str = text[start : end_idx + 1]

    try:
        parsed = json.loads(json_str)
    except json.JSONDecodeError as e:
        return None, [f"JSON parse error: {e}"]

    if not isinstance(parsed, list):
        return None, ["Expected JSON array, got " + type(parsed).__name__]

    return parsed, errors


def validate_intent_graph(items: list[dict]) -> list[str]:
    """Validate intent graph structure."""
    errors: list[str] = []
    if not items:
        errors.append("Empty intent graph")
        return errors

    seen_ids = set()
    for i, item in enumerate(items):
        prefix = f"intent[{i}]"
        if "intentId" not in item:
            errors.append(f"{prefix}: missing intentId")
        else:
            seen_ids.add(item["intentId"])

        if "action" not in item:
            errors.append(f"{prefix}: missing action")

        conf = item.get("confidence", -1)
        if not (0 <= conf <= 1):
            errors.append(f"{prefix}: confidence {conf} out of [0, 1]")

        if item.get("startMs", 0) < 0:
            errors.append(f"{prefix}: negative startMs")
        if item.get("endMs", 0) < 0:
            errors.append(f"{prefix}: negative endMs")

    # Check parent references
    for item in items:
        parent = item.get("parentIntentId")
        if parent and parent not in seen_ids:
            errors.append(f"intent {item.get('intentId')}: parentIntentId '{parent}' not found")

    return errors


def validate_narrative_plan(items: list[dict]) -> list[str]:
    """Validate narrative plan structure."""
    errors: list[str] = []
    if not items:
        errors.append("Empty narrative plan")
        return errors

    for i, item in enumerate(items):
        prefix = f"beat[{i}]"
        bt = item.get("beatType", "")
        if bt not in VALID_BEAT_TYPES:
            errors.append(f"{prefix}: invalid beatType '{bt}'")
        if "title" not in item:
            errors.append(f"{prefix}: missing title")
        if item.get("suggestedDurationMs", 0) <= 0:
            errors.append(f"{prefix}: non-positive duration")

    return errors


def validate_edit_plan(items: list[dict]) -> list[str]:
    """Validate edit plan structure."""
    errors: list[str] = []
    if not items:
        errors.append("Empty edit plan")
        return errors

    for i, item in enumerate(items):
        prefix = f"edit[{i}]"
        et = item.get("editType", "")
        if et not in VALID_EDIT_TYPES:
            errors.append(f"{prefix}: invalid editType '{et}'")

        src_start = item.get("sourceStartMs", -1)
        src_end = item.get("sourceEndMs", -1)
        if src_start < 0:
            errors.append(f"{prefix}: negative sourceStartMs")
        if src_end < 0:
            errors.append(f"{prefix}: negative sourceEndMs")
        if src_start > src_end:
            errors.append(f"{prefix}: sourceStartMs > sourceEndMs")

        if "reasoning" not in item:
            errors.append(f"{prefix}: missing reasoning")

    return errors
