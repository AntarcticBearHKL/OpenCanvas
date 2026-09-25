"""Align / distribute builders (port of ``operations/transform.ts``)."""

from __future__ import annotations

import math
from typing import Any

from canvas_mcp.operations.shared import apply_ops, find_node
from canvas_mcp.types import AgentSnapshot, CanvasNode


def _round(value: float) -> int:
    """Match JavaScript ``Math.round`` (half away from -infinity), unlike Python's banker's rounding."""
    return math.floor(value + 0.5)


def _align_ops(input_data: dict[str, Any], state: AgentSnapshot | None) -> list[Any]:
    nodes: list[CanvasNode] = [node for node in (find_node(state, node_id) for node_id in input_data["ids"]) if node]
    if len(nodes) < 2:
        return []
    left = min(node["position"]["x"] for node in nodes)
    top = min(node["position"]["y"] for node in nodes)
    right = max(node["position"]["x"] + node["width"] for node in nodes)
    bottom = max(node["position"]["y"] + node["height"] for node in nodes)
    mode = input_data["mode"]
    if mode in ("distribute-x", "distribute-y"):
        if len(nodes) < 3:
            return []
        horizontal = mode == "distribute-x"
        ordered = sorted(nodes, key=lambda node: node["position"]["x"] if horizontal else node["position"]["y"])
        used = sum(node["width"] if horizontal else node["height"] for node in ordered)
        span = (right - left) if horizontal else (bottom - top)
        gap = (span - used) / (len(ordered) - 1)
        cursor = left if horizontal else top
        ops = []
        for node in ordered:
            position = {
                "x": _round(cursor) if horizontal else node["position"]["x"],
                "y": node["position"]["y"] if horizontal else _round(cursor),
            }
            cursor += (node["width"] if horizontal else node["height"]) + gap
            ops.append({"type": "update_node", "id": node["id"], "patch": {"position": position}})
        return ops
    ops = []
    for node in nodes:
        if mode == "left":
            x = left
        elif mode == "center-x":
            x = left + (right - left - node["width"]) / 2
        elif mode == "right":
            x = right - node["width"]
        else:
            x = node["position"]["x"]
        if mode == "top":
            y = top
        elif mode == "center-y":
            y = top + (bottom - top - node["height"]) / 2
        elif mode == "bottom":
            y = bottom - node["height"]
        else:
            y = node["position"]["y"]
        ops.append({"type": "update_node", "id": node["id"], "patch": {"position": {"x": _round(x), "y": _round(y)}}})
    return ops


def align_nodes(input_data: dict[str, Any], state: AgentSnapshot | None) -> dict[str, Any]:
    return apply_ops(_align_ops(input_data, state))
