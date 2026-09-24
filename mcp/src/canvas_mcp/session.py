"""Canvas session: SSE client registry, state cache and tool dispatch.

Port of ``web/server/canvas/session.ts``.
"""

from __future__ import annotations

import asyncio
import json
import uuid
from dataclasses import dataclass
from typing import Any

from canvas_mcp.config import AGENT_PROTOCOL_VERSION
from canvas_mcp.logger import logger
from canvas_mcp.operations import build_canvas_tool_request
from canvas_mcp.tools import compact_canvas_state, compact_node, is_tool_name, parse_tool_input
from canvas_mcp.types import CanvasSnapshot

SITE_TOOLS = frozenset({"site_navigate", "canvas_list_projects", "generation_get_status"})
READ_TOOLS = frozenset({"canvas_get_state", "canvas_get_selection", "canvas_export_snapshot"})

REQUEST_TIMEOUT_SECONDS = 30.0


@dataclass
class _PendingRequest:
    client_id: str
    future: asyncio.Future[Any]


def format_sse(event_type: str, payload: Any) -> str:
    """Serialise one server-sent event."""
    return f"event: {event_type}\ndata: {json.dumps(payload, ensure_ascii=False)}\n\n"


class CanvasSession:
    """Owns connected browser clients, their canvas snapshots and pending tool calls."""

    def __init__(self) -> None:
        self._clients: dict[str, asyncio.Queue[str]] = {}
        self._client_focus_order: dict[str, int] = {}
        self._pending: dict[str, _PendingRequest] = {}
        self._canvas_states: dict[str, CanvasSnapshot] = {}
        self._active_client_id = ""
        self._bound_client_id = ""
        self._focus_sequence = 0

    @property
    def _target_client_id(self) -> str:
        return self._bound_client_id or self._active_client_id

    @property
    def _canvas_state(self) -> CanvasSnapshot | None:
        target = self._target_client_id
        return self._canvas_states.get(target) if target in self._clients else None

    def health(self) -> dict[str, Any]:
        """Connection status returned by ``GET /health``."""
        return {
            "ok": True,
            "protocolVersion": AGENT_PROTOCOL_VERSION,
            "hasCanvas": bool(self._canvas_state),
            "clients": len(self._clients),
        }

    def canvas_state_for_client(self, client_id: str) -> CanvasSnapshot | None:
        """Read one client's snapshot without focus/binding influence."""
        return self._canvas_states.get(client_id) if client_id in self._clients else None

    def open_events(self, client_id: str) -> asyncio.Queue[str]:
        """Register an SSE client and return the queue its events are pushed to."""
        logger.info("SSE client connected", {"clientId": client_id})
        queue: asyncio.Queue[str] = asyncio.Queue()
        self._clients[client_id] = queue
        self._client_focus_order.setdefault(client_id, 0)
        if not self._active_client_id:
            self._active_client_id = client_id
            self._focus_sequence += 1
            self._client_focus_order[client_id] = self._focus_sequence
        return queue

    def close_events(self, client_id: str) -> None:
        """Drop a disconnected SSE client and reject its pending tool calls."""
        logger.info("SSE client disconnected", {"clientId": client_id})
        if client_id not in self._clients:
            return
        self._clients.pop(client_id, None)
        self._client_focus_order.pop(client_id, None)
        self._canvas_states.pop(client_id, None)
        for request_id, item in list(self._pending.items()):
            if item.client_id != client_id:
                continue
            self._pending.pop(request_id, None)
            if not item.future.done():
                item.future.set_exception(RuntimeError("请求页面已断开"))
        if self._active_client_id == client_id:
            remaining = sorted(self._clients, key=lambda cid: self._client_focus_order.get(cid, 0), reverse=True)
            self._active_client_id = remaining[0] if remaining else ""

    def update_state(self, body: Any, client_id: str | None = None) -> None:
        """Store the latest snapshot reported by a client."""
        target = client_id or self._active_client_id
        if not target or target not in self._clients:
            return
        state: CanvasSnapshot = {**(body if isinstance(body, dict) else {}), "clientId": target}
        self._canvas_states[target] = state
        logger.debug(
            "Canvas state updated",
            {"clientId": target, "nodes": len(state.get("nodes") or []), "connections": len(state.get("connections") or [])},
        )

    def activate_client(self, client_id: str) -> None:
        """Make a client the most recently focused tool target."""
        if client_id not in self._clients:
            raise ValueError("当前网页未连接")
        self._active_client_id = client_id
        self._focus_sequence += 1
        self._client_focus_order[client_id] = self._focus_sequence
        logger.debug("Canvas client activated", {"clientId": client_id})

    def bind_client(self, client_id: str) -> None:
        """Pin tool calls to one client."""
        if client_id not in self._clients:
            raise ValueError("当前网页未连接")
        self._bound_client_id = client_id
        logger.debug("Canvas client bound", {"clientId": client_id})

    def release_client(self, client_id: str) -> None:
        """Release the pinned client when it matches."""
        if self._bound_client_id == client_id:
            self._bound_client_id = ""
        logger.debug("Canvas client released", {"clientId": client_id})

    def resolve_result(self, client_id: str, body: Any) -> bool:
        """Deliver a browser tool result to the waiting request."""
        data = body if isinstance(body, dict) else {}
        request_id = data.get("requestId")
        item = self._pending.get(request_id) if isinstance(request_id, str) and request_id else None
        if not item or item.client_id != client_id or item.future.done():
            return False
        self._pending.pop(request_id, None)
        logger.debug("Canvas tool result received", {"clientId": client_id, "requestId": request_id, "error": data.get("error")})
        if data.get("error"):
            item.future.set_exception(RuntimeError(str(data["error"])))
        else:
            item.future.set_result(data.get("result"))
        return True

    async def call_tool(self, name: Any, raw_input: Any) -> Any:
        """Validate arguments and dispatch a tool call to the current target client."""
        if not is_tool_name(name):
            raise ValueError(f"未知工具：{name}")
        logger.info("MCP tool called", {"name": name, "targetClientId": self._target_client_id})
        input_data = parse_tool_input(name, raw_input)
        if name in SITE_TOOLS:
            if not self._clients:
                raise ValueError("当前没有已连接网页")
            return await self._request_canvas_tool(name, input_data)
        if name in READ_TOOLS and (not self._clients or not self._canvas_state):
            raise ValueError("当前没有已连接画布")
        if name in ("canvas_get_state", "canvas_export_snapshot"):
            return compact_canvas_state(self._canvas_state)
        if name == "canvas_get_selection":
            selected = set((self._canvas_state or {}).get("selectedNodeIds") or [])
            nodes = (self._canvas_state or {}).get("nodes") or []
            return {"nodes": [compact_node(node) for node in nodes if node.get("id") in selected]}
        if not self._clients:
            raise ValueError("当前没有已连接画布")
        request = build_canvas_tool_request(name, input_data, self._canvas_state)
        return await self._request_canvas_tool(request["name"], request["input"])

    def _send_event(self, client_id: str, event_type: str, payload: Any) -> None:
        queue = self._clients.get(client_id)
        if queue is not None:
            queue.put_nowait(format_sse(event_type, payload))

    async def _request_canvas_tool(self, name: str, input_data: dict[str, Any]) -> Any:
        """Relay a tool request to the target browser and await its result."""
        request_id = str(uuid.uuid4())
        client_id = self._target_client_id
        if client_id not in self._clients:
            raise ValueError("当前没有已连接画布")
        self._send_event(client_id, "tool_call", {"requestId": request_id, "name": name, "input": input_data})
        logger.debug("Canvas tool request sent", {"requestId": request_id, "name": name, "clientId": client_id})
        future: asyncio.Future[Any] = asyncio.get_running_loop().create_future()
        self._pending[request_id] = _PendingRequest(client_id, future)
        try:
            return await asyncio.wait_for(future, timeout=REQUEST_TIMEOUT_SECONDS)
        except TimeoutError:
            self._pending.pop(request_id, None)
            logger.warn("Canvas tool request timed out", {"requestId": request_id, "name": name, "clientId": client_id})
            raise ValueError("画布操作超时") from None
