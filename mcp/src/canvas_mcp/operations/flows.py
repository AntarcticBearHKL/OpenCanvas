"""Generation-flow builders (port of ``operations/flows.ts``)."""

from __future__ import annotations

import re
import uuid
from collections.abc import Callable
from typing import Any

from canvas_mcp.operations.shared import apply_ops, config_node_op, generation_mode, run_generation_op, text_node_op
from canvas_mcp.tools import next_canvas_x
from canvas_mcp.types import CanvasSnapshot

_MENTION = re.compile(r"@\[node:([\w-]+)\]", re.ASCII)


def generation_flow_ops(input_data: dict[str, Any], state: CanvasSnapshot | None) -> list[Any]:
    """Build the prompt node, config node, reference links and optional auto-run."""
    mode = generation_mode(input_data.get("mode"))
    prompt = str(input_data.get("prompt") or "")
    x = next_canvas_x(state) if input_data.get("x") is None else float(input_data["x"])
    y = 0.0 if input_data.get("y") is None else float(input_data["y"])
    text_id = f"text-{uuid.uuid4()}"
    config_id = f"config-{uuid.uuid4()}"
    reference_ids = [item for item in input_data.get("referenceNodeIds") or [] if isinstance(item, str)]
    # When the prompt only @-mentions nodes already passed as references, reuse them instead of minting a duplicate text node.
    mentioned_ids = [match.group(1) for match in _MENTION.finditer(prompt)]
    reuse_references = (
        bool(reference_ids)
        and bool(mentioned_ids)
        and all(item in reference_ids for item in mentioned_ids)
        and _MENTION.sub("", prompt).strip() == ""
    )
    tokens = (
        [f"@[node:{item}]" for item in reference_ids]
        if reuse_references
        else [f"@[node:{text_id}]", *[f"@[node:{item}]" for item in reference_ids]]
    )
    prompt_text = "\n".join(tokens)
    ops: list[Any] = []
    if not reuse_references:
        ops.append(text_node_op({"id": text_id, "text": prompt, "title": str(input_data.get("title") or "提示词")}, x, y))
    ops.append(config_node_op(config_id, {**input_data, "prompt": prompt_text}, x + 420, y))
    if not reuse_references:
        ops.append({"type": "connect_nodes", "fromNodeId": text_id, "toNodeId": config_id})
    ops.extend({"type": "connect_nodes", "fromNodeId": from_id, "toNodeId": config_id} for from_id in reference_ids)
    ops.append({"type": "select_nodes", "ids": [config_id]})
    if input_data.get("autoRun"):
        ops.append(run_generation_op(config_id, mode, prompt_text))
    return ops


def create_image_prompt_flow(input_data: dict[str, Any], state: CanvasSnapshot | None) -> dict[str, Any]:
    return apply_ops(generation_flow_ops({**input_data, "mode": "image"}, state))


def create_config_node(input_data: dict[str, Any], state: CanvasSnapshot | None) -> dict[str, Any]:
    x = next_canvas_x(state) if input_data.get("x") is None else float(input_data["x"])
    y = 0.0 if input_data.get("y") is None else float(input_data["y"])
    config_id = f"config-{uuid.uuid4()}"
    mode = generation_mode(input_data.get("mode"))
    prompt = str(input_data.get("prompt") or "")
    ops = [config_node_op(config_id, input_data, x, y)]
    if input_data.get("autoRun"):
        ops.append(run_generation_op(config_id, mode, prompt))
    return apply_ops(ops)


def create_generation_flow(input_data: dict[str, Any], state: CanvasSnapshot | None) -> dict[str, Any]:
    return apply_ops(generation_flow_ops(input_data, state))


def auto_generate(mode: str) -> Callable[[dict[str, Any], CanvasSnapshot | None], dict[str, Any]]:
    def handler(input_data: dict[str, Any], state: CanvasSnapshot | None) -> dict[str, Any]:
        return apply_ops(generation_flow_ops({**input_data, "mode": mode, "autoRun": True}, state))

    return handler


def run_generation(input_data: dict[str, Any], _state: CanvasSnapshot | None) -> dict[str, Any]:
    return apply_ops([run_generation_op(input_data["nodeId"], generation_mode(input_data.get("mode")), input_data.get("prompt"))])
