"""Connection / selection / viewport builders (port of ``operations/view.ts``)."""

from __future__ import annotations

from typing import Any

from canvas_mcp.operations.shared import apply_ops
from canvas_mcp.types import AgentSnapshot


def connect_nodes(input_data: dict[str, Any], _state: AgentSnapshot | None) -> dict[str, Any]:
    return apply_ops([{"type": "connect_nodes", **connection} for connection in input_data["connections"]])


def select_nodes(input_data: dict[str, Any], _state: AgentSnapshot | None) -> dict[str, Any]:
    return apply_ops([{"type": "select_nodes", "ids": input_data["ids"]}])


def set_viewport(input_data: dict[str, Any], _state: AgentSnapshot | None) -> dict[str, Any]:
    return apply_ops([{"type": "set_viewport", "viewport": input_data["viewport"]}])
