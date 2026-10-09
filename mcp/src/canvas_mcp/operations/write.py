"""Write-oriented tool builders (port of the writing studio entity-canvas tools)."""

from __future__ import annotations

from typing import Any

from canvas_mcp.operations.shared import apply_ops, omit_none
from canvas_mcp.types import AgentSnapshot


def list_entities(_input_data: dict[str, Any], _state: AgentSnapshot | None) -> dict[str, Any]:
    return apply_ops([{"ns": "write", "type": "list_entities"}])


def create_entity(input_data: dict[str, Any], _state: AgentSnapshot | None) -> dict[str, Any]:
    return apply_ops([omit_none({"ns": "write", "type": "create_entity", "kind": input_data["kind"], "name": input_data.get("name")})])


def link_entities(input_data: dict[str, Any], _state: AgentSnapshot | None) -> dict[str, Any]:
    return apply_ops(
        [
            omit_none(
                {
                    "ns": "write",
                    "type": "link_entities",
                    "fromEntityId": input_data["fromEntityId"],
                    "toEntityId": input_data["toEntityId"],
                    "label": input_data.get("label"),
                }
            )
        ]
    )


def entity_context(input_data: dict[str, Any], _state: AgentSnapshot | None) -> dict[str, Any]:
    return apply_ops([{"ns": "write", "type": "entity_context", "entityId": input_data["entityId"]}])


def backlinks(input_data: dict[str, Any], _state: AgentSnapshot | None) -> dict[str, Any]:
    return apply_ops([{"ns": "write", "type": "backlinks", "entityId": input_data["entityId"]}])
