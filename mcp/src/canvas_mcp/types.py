"""Canvas data shapes mirroring ``web/server/canvas/types.ts``.

The wire payloads are dynamic JSON, so these are plain aliases rather than
validated models; the tool input schemas in :mod:`canvas_mcp.schemas` own parsing.
"""

from __future__ import annotations

from typing import Any

Position = dict[str, float]
Viewport = dict[str, float]
CanvasNode = dict[str, Any]
CanvasConnection = dict[str, Any]
CanvasSnapshot = dict[str, Any]
