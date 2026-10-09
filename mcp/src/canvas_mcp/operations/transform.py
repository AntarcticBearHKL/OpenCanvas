"""Align / distribute builders (port of ``operations/transform.ts``)."""

from __future__ import annotations

from typing import Any

from canvas_mcp.operations.shared import apply_ops
from canvas_mcp.types import AgentSnapshot


def align_nodes(input_data: dict[str, Any], _state: AgentSnapshot | None) -> dict[str, Any]:
    return apply_ops([{"type": "align_nodes", "ids": input_data["ids"], "axis": input_data["mode"]}])
