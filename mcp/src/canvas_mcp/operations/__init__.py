"""Translate high-level canvas tools into front-end batch ops.

Port of ``web/server/canvas/operations/index.ts``.
"""

from __future__ import annotations

from collections.abc import Callable
from typing import Any

from canvas_mcp.operations.flows import auto_generate, create_config_node, create_generation_flow, create_image_prompt_flow, expand_story, run_generation
from canvas_mcp.operations.nodes import (
    bulk_rename,
    create_node,
    create_text_node,
    create_text_nodes,
    delete_nodes,
    duplicate_node,
    move_nodes,
    resize_node,
    set_node_flags,
    update_node,
    update_node_text,
)
from canvas_mcp.operations.shared import CanvasToolRequest
from canvas_mcp.operations.transform import align_nodes
from canvas_mcp.operations.view import connect_nodes, select_nodes, set_viewport
from canvas_mcp.types import CanvasSnapshot

CanvasToolHandler = Callable[[dict[str, Any], CanvasSnapshot | None], CanvasToolRequest]

HANDLERS: dict[str, CanvasToolHandler] = {
    "canvas_create_node": create_node,
    "canvas_create_text_node": create_text_node,
    "canvas_create_text_nodes": create_text_nodes,
    "canvas_create_image_prompt_flow": create_image_prompt_flow,
    "canvas_create_config_node": create_config_node,
    "canvas_create_generation_flow": create_generation_flow,
    "canvas_generate_text": auto_generate("text"),
    "canvas_generate_image": auto_generate("image"),
    "canvas_generate_video": auto_generate("video"),
    "canvas_generate_audio": auto_generate("audio"),
    "canvas_update_node": update_node,
    "canvas_update_node_text": update_node_text,
    "canvas_move_nodes": move_nodes,
    "canvas_resize_node": resize_node,
    "canvas_set_node_flags": set_node_flags,
    "canvas_bulk_rename": bulk_rename,
    "canvas_align_nodes": align_nodes,
    "canvas_duplicate_node": duplicate_node,
    "canvas_delete_nodes": delete_nodes,
    "canvas_connect_nodes": connect_nodes,
    "canvas_select_nodes": select_nodes,
    "canvas_set_viewport": set_viewport,
    "canvas_run_generation": run_generation,
    "canvas_expand_story": expand_story,
}


def build_canvas_tool_request(name: str, input_data: dict[str, Any], state: CanvasSnapshot | None) -> CanvasToolRequest:
    """Convert an upper-level tool call into a front-end ``canvas_apply_ops`` request."""
    if name == "canvas_apply_ops":
        return {"name": name, "input": input_data}
    handler = HANDLERS.get(name)
    if handler:
        return handler(input_data, state)
    raise ValueError(f"未知工具：{name}")
