"""Node-oriented canvas tool builders (port of ``operations/nodes.ts``)."""

from __future__ import annotations

from typing import Any

from canvas_mcp.operations.shared import apply_ops, omit_none, text_node_op
from canvas_mcp.types import AgentSnapshot


def _number(value: Any, fallback: float) -> float:
    return fallback if value is None else float(value)


def _position(x: Any, y: Any) -> dict[str, float] | None:
    """Build a position only when the caller supplied coordinates; otherwise let the browser resolve it."""
    if x is None and y is None:
        return None
    return {"x": _number(x, 0), "y": _number(y, 0)}


def create_node(input_data: dict[str, Any], _state: AgentSnapshot | None) -> dict[str, Any]:
    return apply_ops(
        [
            omit_none(
                {
                    "type": "add_node",
                    "nodeType": input_data.get("nodeType"),
                    "title": input_data.get("title"),
                    "position": _position(input_data.get("x"), input_data.get("y")),
                    "width": input_data.get("width"),
                    "height": input_data.get("height"),
                    "metadata": input_data.get("metadata"),
                }
            )
        ]
    )


def create_text_node(input_data: dict[str, Any], _state: AgentSnapshot | None) -> dict[str, Any]:
    return apply_ops([text_node_op(input_data, _position(input_data.get("x"), input_data.get("y")))])


def create_text_nodes(input_data: dict[str, Any], _state: AgentSnapshot | None) -> dict[str, Any]:
    gap = _number(input_data.get("gap"), 40)
    row = input_data.get("direction") == "row"
    base_x = input_data.get("x")
    base_y = input_data.get("y")
    ops = []
    for index, item in enumerate(input_data["items"]):
        item_x = item.get("x")
        item_y = item.get("y")
        if item_x is None and item_y is None and base_x is None and base_y is None:
            # No coordinates anywhere: let the browser lay the batch out from the project's nodes.
            ops.append(text_node_op(item, None))
            continue
        x = _number(item_x, _number(base_x, 0) + (index * (340 + gap) if row else 0))
        y = _number(item_y, _number(base_y, 0) + (0 if row else index * (240 + gap)))
        ops.append(text_node_op(item, {"x": x, "y": y}))
    return apply_ops(ops)


def update_node(input_data: dict[str, Any], _state: AgentSnapshot | None) -> dict[str, Any]:
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


def update_node_text(input_data: dict[str, Any], _state: AgentSnapshot | None) -> dict[str, Any]:
    patch = {"title": input_data["title"]} if input_data.get("title") else {}
    return apply_ops(
        [{"type": "update_node", "id": input_data["id"], "patch": patch, "metadata": {"content": input_data["text"], "status": "success"}}]
    )


def move_nodes(input_data: dict[str, Any], _state: AgentSnapshot | None) -> dict[str, Any]:
    ops = []
    for item in input_data["items"]:
        if item.get("x") is not None or item.get("y") is not None:
            ops.append({"type": "update_node", "id": item["id"], "patch": {"position": {"x": _number(item.get("x"), 0), "y": _number(item.get("y"), 0)}}})
        else:
            ops.append({"type": "move_node", "id": item["id"], "dx": _number(item.get("dx"), 0), "dy": _number(item.get("dy"), 0)})
    return apply_ops(ops)


def resize_node(input_data: dict[str, Any], _state: AgentSnapshot | None) -> dict[str, Any]:
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


def set_node_flags(input_data: dict[str, Any], _state: AgentSnapshot | None) -> dict[str, Any]:
    metadata: dict[str, Any] = {}
    if input_data.get("locked") is not None:
        metadata["locked"] = input_data["locked"]
    if input_data.get("hidden") is not None:
        metadata["hidden"] = input_data["hidden"]
    if not metadata:
        raise ValueError("locked 与 hidden 至少需要一个")
    return apply_ops([{"type": "update_node", "id": node_id, "metadata": metadata} for node_id in input_data["ids"]])


def bulk_rename(input_data: dict[str, Any], _state: AgentSnapshot | None) -> dict[str, Any]:
    title = str(input_data["title"]).strip()
    if not title:
        return apply_ops([])
    ids = input_data["ids"]
    patches = [
        {"type": "update_node", "id": node_id, "patch": {"title": f"{title} {index + 1}" if len(ids) > 1 else title}}
        for index, node_id in enumerate(ids)
    ]
    return apply_ops(patches)


def duplicate_node(input_data: dict[str, Any], _state: AgentSnapshot | None) -> dict[str, Any]:
    return apply_ops([{"type": "duplicate_node", "id": input_data["id"]}])


def delete_nodes(input_data: dict[str, Any], _state: AgentSnapshot | None) -> dict[str, Any]:
    return apply_ops([{"type": "delete_node", "ids": input_data["ids"]}])


def group_images(input_data: dict[str, Any], _state: AgentSnapshot | None) -> dict[str, Any]:
    return apply_ops(
        [
            omit_none(
                {
                    "type": "pack_images_into_group",
                    "nodeIds": input_data["nodeIds"],
                    "title": input_data.get("title"),
                    "position": _position(input_data.get("x"), input_data.get("y")),
                    "removeSources": input_data.get("removeSources"),
                }
            )
        ]
    )


def ungroup_images(input_data: dict[str, Any], _state: AgentSnapshot | None) -> dict[str, Any]:
    return apply_ops(
        [
            omit_none(
                {
                    "type": "unpack_image_group",
                    "nodeId": input_data["nodeId"],
                    "gap": input_data.get("gap"),
                    "columns": input_data.get("columns"),
                    "keepGroup": input_data.get("keepGroup"),
                }
            )
        ]
    )
