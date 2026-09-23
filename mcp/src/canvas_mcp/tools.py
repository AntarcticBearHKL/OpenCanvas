"""Canvas tool helpers mirroring ``web/server/canvas/tools.ts``."""

from __future__ import annotations

from typing import Any

from canvas_mcp.schemas import INPUT_MODELS, TOOL_NAMES
from canvas_mcp.types import CanvasNode, CanvasSnapshot


def is_tool_name(name: Any) -> bool:
    """Return whether ``name`` is one of the registered canvas tools."""
    return isinstance(name, str) and name in TOOL_NAMES


def parse_tool_input(name: str, raw_input: Any) -> dict[str, Any]:
    """Validate the tool input against its schema.

    Validation is delegated to the Pydantic model (the zod ``.parse`` equivalent);
    the original mapping is returned so passthrough keys survive the round trip.
    """
    data = raw_input if isinstance(raw_input, dict) else {}
    INPUT_MODELS[name].model_validate(data)
    return dict(data)


def compact_canvas_state(state: CanvasSnapshot | None) -> dict[str, Any]:
    """Return a snapshot with node content truncated for the agent."""
    if not state:
        raise ValueError("当前没有已连接画布")
    return {**state, "nodes": [compact_node(node) for node in state.get("nodes") or []]}


def compact_node(node: CanvasNode) -> dict[str, Any]:
    """Truncate a single node's ``metadata.content`` when it exceeds 240 chars."""
    metadata = dict(node.get("metadata") or {})
    content = metadata.get("content")
    if isinstance(content, str) and len(content) > 240:
        metadata["content"] = f"{content[:120]}..."
    return {
        "id": node.get("id"),
        "type": node.get("type"),
        "title": node.get("title"),
        "position": node.get("position"),
        "width": node.get("width"),
        "height": node.get("height"),
        "metadata": metadata,
    }


def next_canvas_x(state: CanvasSnapshot | None) -> float:
    """Compute the default x for a new node placed to the right of the canvas."""
    nodes = (state or {}).get("nodes") or []
    if not nodes:
        return 0.0
    return max(node["position"]["x"] + node["width"] for node in nodes) + 80
