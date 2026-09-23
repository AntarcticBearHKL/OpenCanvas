"""Node-oriented canvas tool builders (port of ``operations/nodes.ts``)."""

from __future__ import annotations

import uuid
from typing import Any

from canvas_mcp.operations.shared import apply_ops, find_node, omit_none, text_node_op
from canvas_mcp.tools import next_canvas_x
from canvas_mcp.types import CanvasSnapshot


def _number(value: Any, fallback: float) -> float:
    return fallback if value is None else float(value)


def create_node(input_data: dict[str, Any], state: CanvasSnapshot | None) -> dict[str, Any]:
    return apply_ops(
        [
            omit_none(
                {
                    "type": "add_node",
                    "nodeType": input_data.get("nodeType"),
                    "title": input_data.get("title"),
                    "position": {
                        "x": _number(input_data.get("x"), next_canvas_x(state)),
                        "y": _number(input_data.get("y"), 0),
                    },
                    "width": input_data.get("width"),
                    "height": input_data.get("height"),
                    "metadata": input_data.get("metadata"),
                }
            )
        ]
    )


def create_text_node(input_data: dict[str, Any], state: CanvasSnapshot | None) -> dict[str, Any]:
    x = _number(input_data.get("x"), next_canvas_x(state))
    y = _number(input_data.get("y"), 0)
    return apply_ops([text_node_op(input_data, x, y)])


def create_text_nodes(input_data: dict[str, Any], state: CanvasSnapshot | None) -> dict[str, Any]:
    x = _number(input_data.get("x"), next_canvas_x(state))
    y = _number(input_data.get("y"), 0)
    gap = _number(input_data.get("gap"), 40)
    row = input_data.get("direction") == "row"
    ops = []
    for index, item in enumerate(input_data["items"]):
        default_x = x + index * (340 + gap) if row else x
        default_y = y if row else y + index * (240 + gap)
        ops.append(text_node_op(item, _number(item.get("x"), default_x), _number(item.get("y"), default_y)))
    return apply_ops(ops)


def update_node(input_data: dict[str, Any], _state: CanvasSnapshot | None) -> dict[str, Any]:
    return apply_ops(
        [
            omit_none(
                {
                    "type": "update_node",
                    "id": input_data["id"],
                    "patch": input_data.get("patch"),
                    "metadata": input_data.get("metadata"),
                }
            )
        ]
    )


def update_node_text(input_data: dict[str, Any], _state: CanvasSnapshot | None) -> dict[str, Any]:
    patch = {"title": input_data["title"]} if input_data.get("title") else {}
    return apply_ops(
        [{"type": "update_node", "id": input_data["id"], "patch": patch, "metadata": {"content": input_data["text"], "status": "success"}}]
    )


def move_nodes(input_data: dict[str, Any], state: CanvasSnapshot | None) -> dict[str, Any]:
    ops = []
    for item in input_data["items"]:
        current = find_node(state, item["id"])
        position = (current or {}).get("position") or {}
        x = item.get("x") if item.get("x") is not None else (position.get("x") or 0) + (item.get("dx") or 0)
        y = item.get("y") if item.get("y") is not None else (position.get("y") or 0) + (item.get("dy") or 0)
        ops.append({"type": "update_node", "id": item["id"], "patch": {"position": {"x": x, "y": y}}})
    return apply_ops(ops)


def resize_node(input_data: dict[str, Any], _state: CanvasSnapshot | None) -> dict[str, Any]:
    free_resize = input_data.get("freeResize")
    metadata = {"freeResize": free_resize} if free_resize is not None else None
    return apply_ops(
        [
            omit_none(
                {
                    "type": "update_node",
                    "id": input_data["id"],
                    "patch": {"width": input_data["width"], "height": input_data["height"]},
                    "metadata": metadata,
                }
            )
        ]
    )


def set_node_flags(input_data: dict[str, Any], _state: CanvasSnapshot | None) -> dict[str, Any]:
    metadata: dict[str, Any] = {}
    if input_data.get("locked") is not None:
        metadata["locked"] = input_data["locked"]
    if input_data.get("hidden") is not None:
        metadata["hidden"] = input_data["hidden"]
    if not metadata:
        raise ValueError("locked 与 hidden 至少需要一个")
    return apply_ops([{"type": "update_node", "id": node_id, "metadata": metadata} for node_id in input_data["ids"]])


def bulk_rename(input_data: dict[str, Any], _state: CanvasSnapshot | None) -> dict[str, Any]:
    title = str(input_data["title"]).strip()
    if not title:
        return apply_ops([])
    ids = input_data["ids"]
    patches = [
        {"type": "update_node", "id": node_id, "patch": {"title": f"{title} {index + 1}" if len(ids) > 1 else title}}
        for index, node_id in enumerate(ids)
    ]
    return apply_ops(patches)


def duplicate_node(input_data: dict[str, Any], state: CanvasSnapshot | None) -> dict[str, Any]:
    source = find_node(state, input_data["id"])
    if not source:
        return apply_ops([])
    copy_id = f"copy-{uuid.uuid4()}"
    dx = _number(input_data.get("dx"), 40)
    dy = _number(input_data.get("dy"), 40)
    return apply_ops(
        [
            omit_none(
                {
                    "type": "add_node",
                    "id": copy_id,
                    "nodeType": source.get("type"),
                    "title": source.get("title"),
                    "position": {"x": source["position"]["x"] + dx, "y": source["position"]["y"] + dy},
                    "width": source.get("width"),
                    "height": source.get("height"),
                    "metadata": source.get("metadata"),
                }
            ),
            {"type": "select_nodes", "ids": [copy_id]},
        ]
    )


def delete_nodes(input_data: dict[str, Any], _state: CanvasSnapshot | None) -> dict[str, Any]:
    return apply_ops([{"type": "delete_node", "ids": input_data["ids"]}])
