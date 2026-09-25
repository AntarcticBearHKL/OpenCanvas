"""Agent data shapes mirroring the frozen browser wire contract.

The wire payloads are dynamic JSON, so these are plain aliases rather than
validated models; the tool input schemas in :mod:`canvas_mcp.schemas` own parsing.
"""

from __future__ import annotations

from typing import Any

Position = dict[str, float]
Viewport = dict[str, float]
CanvasNode = dict[str, Any]
CanvasConnection = dict[str, Any]
AgentSnapshot = dict[str, Any]
PageSnapshot = dict[str, Any]
