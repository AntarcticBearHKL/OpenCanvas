"""Generation-flow builders (port of ``operations/flows.ts``)."""

from __future__ import annotations

import re
import uuid
from collections.abc import Callable
from typing import Any

from canvas_mcp.operations.shared import apply_ops, generation_mode, generation_node_op, prompt_node_op, run_generation_op
from canvas_mcp.types import AgentSnapshot

_MENTION = re.compile(r"@\[node:([\w-]+)\]", re.ASCII)


def _flow_position(x: Any, y: Any, offset_x: float = 0.0) -> dict[str, float] | None:
    """Position for a flow node; omitted when the caller gave no coordinates so the browser resolves it."""
    if x is None and y is None:
        return None
    return {"x": (0.0 if x is None else float(x)) + offset_x, "y": 0.0 if y is None else float(y)}


def generation_flow_ops(input_data: dict[str, Any], _state: AgentSnapshot | None) -> list[Any]:
    """Build the prompt node, generation node, reference links and optional auto-run."""
    mode = generation_mode(input_data.get("mode"))
    prompt = str(input_data.get("prompt") or "")
    x = input_data.get("x")
    y = input_data.get("y")
    prompt_id = f"prompt-{uuid.uuid4()}"
    generation_id = f"generation-{uuid.uuid4()}"
    reference_ids = [item for item in input_data.get("referenceNodeIds") or [] if isinstance(item, str)]
    # When the prompt only @-mentions nodes already passed as references, reuse them instead of minting a duplicate prompt node.
    mentioned_ids = [match.group(1) for match in _MENTION.finditer(prompt)]
    reuse_references = (
        bool(reference_ids)
        and bool(mentioned_ids)
        and all(item in reference_ids for item in mentioned_ids)
        and _MENTION.sub("", prompt).strip() == ""
    )
    ops: list[Any] = []
    if not reuse_references:
        ops.append(prompt_node_op(prompt_id, mode, prompt, str(input_data.get("title") or "提示词"), _flow_position(x, y)))
    ops.append(generation_node_op(generation_id, input_data, _flow_position(x, y, offset_x=420)))
    if not reuse_references:
        ops.append({"type": "connect_nodes", "fromNodeId": prompt_id, "toNodeId": generation_id})
    ops.extend({"type": "connect_nodes", "fromNodeId": from_id, "toNodeId": prompt_id} for from_id in reference_ids)
    ops.append({"type": "select_nodes", "ids": [generation_id]})
    if input_data.get("autoRun"):
        ops.append(run_generation_op(generation_id, mode))
    return ops


def create_image_prompt_flow(input_data: dict[str, Any], state: AgentSnapshot | None) -> dict[str, Any]:
    return apply_ops(generation_flow_ops({**input_data, "mode": "image"}, state))


def create_generation_flow(input_data: dict[str, Any], state: AgentSnapshot | None) -> dict[str, Any]:
    return apply_ops(generation_flow_ops(input_data, state))


def auto_generate(mode: str) -> Callable[[dict[str, Any], AgentSnapshot | None], dict[str, Any]]:
    def handler(input_data: dict[str, Any], state: AgentSnapshot | None) -> dict[str, Any]:
        return apply_ops(generation_flow_ops({**input_data, "mode": mode, "autoRun": True}, state))

    return handler


def run_generation(input_data: dict[str, Any], _state: AgentSnapshot | None) -> dict[str, Any]:
    return apply_ops([run_generation_op(input_data["nodeId"], generation_mode(input_data.get("mode")), input_data.get("prompt"))])
