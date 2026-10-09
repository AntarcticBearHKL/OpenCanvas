"""Canvas session: SSE client registry, state cache and tool dispatch.

Port of ``web/server/canvas/session.ts``.
"""

from __future__ import annotations

import asyncio
import json
import time
import uuid
from dataclasses import dataclass
from typing import Any

from canvas_mcp.config import AGENT_PROTOCOL_VERSION
from canvas_mcp.logger import logger
from canvas_mcp.operations import HANDLERS, build_canvas_tool_request
from canvas_mcp.tools import is_tool_name, parse_tool_input
from canvas_mcp.types import PageSnapshot

GENERIC_TOOLS = frozenset({"app_get_state", "app_describe_actions", "app_apply_ops", "app_screenshot"})
SITE_TOOLS = frozenset(
    {
        "canvas_list_projects",
        "generation_get_status",
        "canvas_get_node_content",
        "canvas_get_image_group",
        "canvas_create_project",
        "canvas_rename_project",
        "canvas_delete_projects",
        "canvas_move_project_to_library",
        "canvas_create_library",
        "canvas_rename_library",
        "canvas_delete_library",
        "canvas_create_pixel_project",
        "canvas_apply_pixel_ops",
        "canvas_list_pixel_projects",
        "canvas_rename_pixel_project",
        "canvas_delete_pixel_projects",
    }
)
RELAY_TOOLS = SITE_TOOLS | GENERIC_TOOLS

# Canvas macros compiled server-side into ``app_apply_ops`` (excludes the site-level canvas_* tools).
CANVAS_MACRO_TOOLS = frozenset(name for name in HANDLERS if name.startswith("canvas_"))

# Canvas ops that need the target project open in a live workspace (IO / generation / handlers).
OPEN_PROJECT_OPS = frozenset(
    {
        "crop_image",
        "split_image",
        "upscale_image",
        "ocr_image",
        "remove_background",
        "generate_angle",
        "generate_image_from_text",
        "retry_generation",
        "capture_video_frame",
        "transcribe_midi",
        "import_midi_to_audio",
        "run_generation",
    }
)

REQUEST_TIMEOUT_SECONDS = 30.0
# Resource reads encode stored bytes to a base64 data URL in the browser, which can take far longer
# than a regular control call; these tools get their own larger budget instead of the global default.
SLOW_REQUEST_TIMEOUT_SECONDS = 120.0
SLOW_TOOLS = frozenset({"canvas_get_node_content"})
PROJECT_OWNER_LEASE_SECONDS = 60.0


def _canvas_batch_project_id(input_data: dict[str, Any]) -> str:
    """Read the target canvas project id from an ``app_apply_ops`` batch, ignoring non-canvas namespaces."""
    ops = input_data.get("ops")
    if not isinstance(ops, list):
        return ""
    canvas_ops = [op for op in ops if isinstance(op, dict) and op.get("ns") in (None, "canvas")]
    if not canvas_ops:
        return ""
    top_level = input_data.get("projectId")
    if isinstance(top_level, str) and top_level:
        return top_level
    for op in canvas_ops:
        op_project_id = op.get("projectId")
        if isinstance(op_project_id, str) and op_project_id:
            return op_project_id
    return ""


def _canvas_batch_has_ops(input_data: dict[str, Any]) -> bool:
    """Return whether an ``app_apply_ops`` batch contains any canvas-namespace op."""
    ops = input_data.get("ops")
    if not isinstance(ops, list):
        return False
    return any(isinstance(op, dict) and op.get("ns") in (None, "canvas") for op in ops)


def _ops_need_open_project(ops: Any) -> bool:
    """Return whether an op batch contains any runtime op that needs a live workspace."""
    if not isinstance(ops, list):
        return False
    return any(isinstance(op, dict) and op.get("type") in OPEN_PROJECT_OPS for op in ops)


def _stamp_canvas_project_id(input_data: dict[str, Any], project_id: str) -> None:
    """Stamp ``projectId`` onto canvas ops (or ops without a namespace) before relaying them."""
    ops = input_data.get("ops")
    if not isinstance(ops, list):
        return
    for op in ops:
        if isinstance(op, dict) and op.get("ns") in (None, "canvas"):
            op["projectId"] = project_id


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
        self._page_states: dict[str, PageSnapshot] = {}
        self._client_projects: dict[str, set[str]] = {}
        self._client_open_project: dict[str, str | None] = {}
        self._project_owner: dict[str, tuple[str, float]] = {}
        self._active_client_id = ""
        self._bound_client_id = ""
        self._focus_sequence = 0

    @property
    def _target_client_id(self) -> str:
        # Only an explicitly bound client is operated on; focus never steers the target.
        return self._bound_client_id

    @property
    def _page_state(self) -> PageSnapshot | None:
        target = self._target_client_id
        return self._page_states.get(target) if target in self._clients else None

    def _state_for(self, client_id: str) -> PageSnapshot | None:
        return self._page_states.get(client_id) if client_id in self._clients else None

    def health(self) -> dict[str, Any]:
        """Connection status returned by ``GET /health``."""
        state = self._page_state or {}
        return {
            "ok": True,
            "protocolVersion": AGENT_PROTOCOL_VERSION,
            "hasPage": bool(self._page_state),
            "page": state.get("page"),
            "clients": len(self._clients),
            "boundClientId": self._bound_client_id,
        }

    def list_clients(self) -> list[dict[str, Any]]:
        """Connected browser clients with their page snapshot and binding flags."""
        items: list[dict[str, Any]] = []
        for client_id in self._clients:
            state = self._page_states.get(client_id) or {}
            items.append(
                {
                    "clientId": client_id,
                    "page": state.get("page"),
                    "title": state.get("title"),
                    "active": client_id == self._active_client_id,
                    "bound": client_id == self._bound_client_id,
                }
            )
        return items

    def bindings(self) -> dict[str, Any]:
        """Binding info served by ``GET /clients``."""
        return {"boundClientId": self._bound_client_id, "clients": self.list_clients()}

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
        self._page_states.pop(client_id, None)
        self._client_projects.pop(client_id, None)
        self._client_open_project.pop(client_id, None)
        for project_id, (owner, _expiry) in list(self._project_owner.items()):
            if owner == client_id:
                self._project_owner.pop(project_id, None)
        if self._bound_client_id == client_id:
            self._bound_client_id = ""
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
        state: PageSnapshot = {**(body if isinstance(body, dict) else {}), "clientId": target}
        self._page_states[target] = state
        raw_projects = state.get("projectIds")
        self._client_projects[target] = (
            {item for item in raw_projects if isinstance(item, str) and item} if isinstance(raw_projects, list) else set()
        )
        raw_open = state.get("openProjectId")
        self._client_open_project[target] = raw_open if isinstance(raw_open, str) and raw_open else None
        logger.debug(
            "Page state updated",
            {"clientId": target, "page": state.get("page"), "title": state.get("title")},
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

    def _client_advertises(self, client_id: str, project_id: str) -> bool:
        return project_id in self._client_projects.get(client_id, set())

    def _touch_owner(self, project_id: str, client_id: str, now: float) -> None:
        self._project_owner[project_id] = (client_id, now + PROJECT_OWNER_LEASE_SECONDS)

    def resolve_client(self, project_id: str, *, require_open: bool = False) -> str:
        """Resolve which connected client serves ``project_id``.

        Order: explicit bound client (if it advertises the project), a still-valid owner lease,
        then the first connected client advertising the project.
        """
        if not project_id:
            raise ValueError("缺少画布 id")
        now = time.monotonic()
        bound = self._bound_client_id
        if bound and bound in self._clients and self._client_advertises(bound, project_id):
            if not require_open or self._client_open_project.get(bound) == project_id:
                self._touch_owner(project_id, bound, now)
                return bound
        lease = self._project_owner.get(project_id)
        if lease is not None:
            owner, expiry = lease
            if (
                expiry > now
                and owner in self._clients
                and self._client_advertises(owner, project_id)
                and (not require_open or self._client_open_project.get(owner) == project_id)
            ):
                self._touch_owner(project_id, owner, now)
                return owner
            self._project_owner.pop(project_id, None)
        for client_id in self._clients:
            if not self._client_advertises(client_id, project_id):
                continue
            if require_open and self._client_open_project.get(client_id) != project_id:
                continue
            self._touch_owner(project_id, client_id, now)
            return client_id
        raise ValueError("该画布不在任何已连接网页中")

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
        """Validate arguments and dispatch a call (canvas calls require an explicit projectId)."""
        if not is_tool_name(name):
            raise ValueError(f"未知工具：{name}")
        # Route before validation so a missing canvas projectId yields our explicit error, not Pydantic's.
        project_id = self._routing_project_id(name, raw_input if isinstance(raw_input, dict) else {})
        input_data = parse_tool_input(name, raw_input)
        if project_id:
            if self._needs_open_project(name, input_data):
                try:
                    client_id = self.resolve_client(project_id, require_open=True)
                except ValueError:
                    raise ValueError(f"该操作需要打开画布 {project_id}") from None
            else:
                client_id = self.resolve_client(project_id)
        else:
            if not self._bound_client_id:
                raise ValueError("尚未连接：请在网页「设置 → Agent」点击「连接」后再操作")
            if self._bound_client_id not in self._clients:
                raise ValueError("已连接的网页已断开，请重新连接")
            client_id = self._bound_client_id
        logger.info("MCP tool called", {"name": name, "targetClientId": client_id, "projectId": project_id})
        if name in RELAY_TOOLS:
            return await self._request_browser_tool(name, input_data, client_id=client_id)
        # Geometry is resolved in the browser from the target project's nodes; a projectId-targeted
        # call must not read this client's page snapshot (the target project may not be open here).
        request = build_canvas_tool_request(name, input_data, None if project_id else self._state_for(client_id))
        if project_id:
            _stamp_canvas_project_id(request["input"], project_id)
        return await self._request_browser_tool(request["name"], request["input"], client_id=client_id)

    def _needs_open_project(self, name: str, input_data: dict[str, Any]) -> bool:
        """Whether a project-targeted call contains an op that needs that canvas open.

        Checks the resolved canvas ops for both ``app_apply_ops`` batches and canvas macros
        (macros are compiled to an ``app_apply_ops`` request before inspection).
        """
        if name == "app_apply_ops":
            return _ops_need_open_project(input_data.get("ops"))
        if name in CANVAS_MACRO_TOOLS:
            request = build_canvas_tool_request(name, input_data, None)
            return _ops_need_open_project(request.get("input", {}).get("ops"))
        return False

    def _routing_project_id(self, name: str, input_data: dict[str, Any]) -> str:
        """Target canvas project id for a call.

        Canvas calls (macros and canvas ``app_apply_ops`` batches) must carry an explicit
        ``projectId``; only relay/non-canvas tools use the bound-client path and return ``""``.
        """
        if name == "app_apply_ops":
            project_id = _canvas_batch_project_id(input_data)
            if not project_id and _canvas_batch_has_ops(input_data):
                raise ValueError("画布操作必须提供 projectId")
            return project_id
        if name in CANVAS_MACRO_TOOLS:
            project_id = input_data.get("projectId")
            if not (isinstance(project_id, str) and project_id):
                raise ValueError("画布操作必须提供 projectId")
            return project_id
        if name in ("canvas_get_node_content", "canvas_get_image_group"):
            # Project-scoped even though relayed; the data comes from localforage, so the canvas must
            # only be advertised by a connected client, not currently open.
            project_id = input_data.get("projectId")
            if not (isinstance(project_id, str) and project_id):
                raise ValueError("画布操作必须提供 projectId")
            return project_id
        return ""

    def _send_event(self, client_id: str, event_type: str, payload: Any) -> None:
        queue = self._clients.get(client_id)
        if queue is not None:
            queue.put_nowait(format_sse(event_type, payload))

    async def _request_browser_tool(self, name: str, input_data: dict[str, Any], client_id: str | None = None) -> Any:
        """Relay a tool request to the target browser and await its result."""
        request_id = str(uuid.uuid4())
        target = client_id or self._target_client_id
        if target not in self._clients:
            raise ValueError("当前没有已连接网页")
        self._send_event(target, "tool_call", {"requestId": request_id, "name": name, "input": input_data})
        logger.debug("Browser tool request sent", {"requestId": request_id, "name": name, "clientId": target})
        future: asyncio.Future[Any] = asyncio.get_running_loop().create_future()
        self._pending[request_id] = _PendingRequest(target, future)
        timeout = SLOW_REQUEST_TIMEOUT_SECONDS if name in SLOW_TOOLS else REQUEST_TIMEOUT_SECONDS
        try:
            return await asyncio.wait_for(future, timeout=timeout)
        except TimeoutError:
            self._pending.pop(request_id, None)
            logger.warn("Browser tool request timed out", {"requestId": request_id, "name": name, "clientId": target})
            raise ValueError("画布操作超时") from None
