"""Starlette app: browser bridge routes, auth/CORS guard and the MCP mount.

Port of ``web/server/bridge.ts``, replacing the same-origin guard with an exact
origin allowlist plus token auth, and mounting the MCP Streamable HTTP session
manager whose lifespan is owned by this app.
"""

from __future__ import annotations

import asyncio
import hmac
import json
import time
import uuid
from collections.abc import AsyncIterator, Callable
from contextlib import asynccontextmanager
from typing import Any
from urllib.parse import parse_qs

from mcp.server.streamable_http_manager import StreamableHTTPASGIApp
from starlette.applications import Starlette
from starlette.datastructures import Headers
from starlette.middleware import Middleware
from starlette.requests import Request
from starlette.responses import JSONResponse, StreamingResponse
from starlette.routing import Route

from canvas_mcp.config import AGENT_PROTOCOL_VERSION, Settings
from canvas_mcp.logger import logger
from canvas_mcp.mcp_server import create_mcp
from canvas_mcp.session import CanvasSession, format_sse

CORS_BASE_HEADERS: list[tuple[bytes, bytes]] = [
    (b"access-control-allow-methods", b"GET, POST, OPTIONS, DELETE"),
    (b"access-control-allow-headers", b"content-type, authorization, mcp-session-id, mcp-protocol-version"),
    (b"access-control-expose-headers", b"mcp-session-id"),
    (b"access-control-allow-private-network", b"true"),
    (b"access-control-max-age", b"600"),
]

PING_INTERVAL_SECONDS = 15.0


def _cors_headers(origin: str | None) -> list[tuple[bytes, bytes]]:
    """CORS headers for a request, echoing the origin only when it is allowlisted."""
    if origin is None:
        return list(CORS_BASE_HEADERS)
    return [(b"access-control-allow-origin", origin.encode("latin-1")), (b"vary", b"Origin"), *CORS_BASE_HEADERS]


def _json_asgi(status: int, payload: Any, extra: list[tuple[bytes, bytes]] = []) -> Callable[..., Any]:  # noqa: B006 - static header list
    """A minimal ASGI response used before the wrapped app runs."""
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    raw_headers = [(b"content-type", b"application/json"), *extra]

    class _Response:
        async def __call__(self, scope: Any, receive: Any, send: Any) -> None:
            await send({"type": "http.response.start", "status": status, "headers": raw_headers})
            await send({"type": "http.response.body", "body": body})

    return _Response()


def _empty_asgi(status: int, extra: list[tuple[bytes, bytes]]) -> Callable[..., Any]:
    """An ASGI response with no body (used for ``204`` preflight)."""

    class _Response:
        async def __call__(self, scope: Any, receive: Any, send: Any) -> None:
            await send({"type": "http.response.start", "status": status, "headers": list(extra)})
            await send({"type": "http.response.body", "body": b""})

    return _Response()


class BridgeGuard:
    """Raw ASGI middleware: origin allowlist, CORS, preflight and token auth.

    Raw ASGI (not ``BaseHTTPMiddleware``) so SSE responses stream unbuffered.
    """

    def __init__(self, app: Any, settings: Settings) -> None:
        self.app = app
        self.settings = settings
        self.allowed_origins = frozenset(settings.origins)
        self.token = settings.token

    async def __call__(self, scope: dict[str, Any], receive: Any, send: Any) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        headers = Headers(scope=scope)
        origin = headers.get("origin")
        if origin is not None and origin not in self.allowed_origins:
            await _json_asgi(403, {"error": "origin not allowed"})(scope, receive, send)
            return
        cors = _cors_headers(origin)
        path = scope.get("path", "")
        if scope["method"] == "OPTIONS":
            await _empty_asgi(204, cors)(scope, receive, send)
            return
        if self._needs_token(path) and not self._token_ok(headers, scope.get("query_string", b"")):
            await _json_asgi(401, {"error": "unauthorized"}, cors)(scope, receive, send)
            return

        async def send_cors(message: dict[str, Any]) -> None:
            if message["type"] == "http.response.start":
                message = {**message, "headers": [*message["headers"], *cors]}
            await send(message)

        await self.app(scope, receive, send_cors)

    @staticmethod
    def _needs_token(path: str) -> bool:
        return path == "/events" or path.startswith("/canvas/") or path == "/mcp" or path.startswith("/mcp/")

    def _token_ok(self, headers: Headers, query_string: bytes) -> bool:
        authorization = headers.get("authorization") or ""
        provided = authorization[7:].strip() if authorization.lower().startswith("bearer ") else ""
        if not provided:
            provided = (parse_qs(query_string.decode("latin-1")).get("token") or [""])[0]
        return bool(provided) and hmac.compare_digest(provided, self.token)


def _request_origin(request: Request, settings: Settings) -> str:
    """Derive the advertised service URL from the request (mirrors ``requestOrigin``)."""
    host = request.headers.get("host") or f"{settings.host}:{settings.port}"
    forwarded = request.headers.get("x-forwarded-proto")
    scheme = forwarded.split(",")[0].strip() if forwarded else request.url.scheme
    return f"{scheme}://{host}"


def create_app(settings: Settings) -> Starlette:
    """Build the Starlette app with the bridge routes and the MCP mount at ``/mcp``."""
    session = CanvasSession()
    _server, manager = create_mcp(session)

    async def health(_request: Request) -> JSONResponse:
        return JSONResponse(session.health())

    async def config(request: Request) -> JSONResponse:
        return JSONResponse(
            {
                "ok": True,
                "protocolVersion": AGENT_PROTOCOL_VERSION,
                "url": _request_origin(request, settings),
                "hasToken": True,
            }
        )

    async def events(request: Request) -> StreamingResponse:
        client_id = request.query_params.get("clientId") or str(uuid.uuid4())
        queue = session.open_events(client_id)

        async def stream() -> AsyncIterator[str]:
            async def ping() -> None:
                while True:
                    await asyncio.sleep(PING_INTERVAL_SECONDS)
                    queue.put_nowait(format_sse("ping", {"time": int(time.time() * 1000)}))

            pinger = asyncio.create_task(ping())
            try:
                yield format_sse("hello", {"ok": True, "protocolVersion": AGENT_PROTOCOL_VERSION, "clientId": client_id})
                while True:
                    yield await queue.get()
            finally:
                pinger.cancel()
                session.close_events(client_id)

        return StreamingResponse(
            stream(),
            media_type="text/event-stream",
            headers={"Cache-Control": "no-cache", "Connection": "keep-alive", "X-Accel-Buffering": "no"},
        )

    async def state(request: Request) -> JSONResponse:
        session.update_state(await _json_body(request), request.query_params.get("clientId") or None)
        return JSONResponse({"ok": True})

    async def activate(request: Request) -> JSONResponse:
        try:
            session.activate_client(request.query_params.get("clientId") or "")
        except ValueError as exc:
            return JSONResponse({"ok": False, "error": str(exc)}, status_code=500)
        return JSONResponse({"ok": True})

    async def result(request: Request) -> JSONResponse:
        ok = session.resolve_result(request.query_params.get("clientId") or "", await _json_body(request))
        return JSONResponse({"ok": ok}, status_code=200 if ok else 409)

    @asynccontextmanager
    async def lifespan(_app: Starlette) -> AsyncIterator[None]:
        async with manager.run():
            yield

    routes = [
        Route("/health", health, methods=["GET"]),
        Route("/config", config, methods=["GET"]),
        Route("/events", events, methods=["GET"]),
        Route("/canvas/state", state, methods=["POST"]),
        Route("/canvas/activate", activate, methods=["POST"]),
        Route("/canvas/result", result, methods=["POST"]),
        Route("/mcp", endpoint=StreamableHTTPASGIApp(manager)),
    ]
    return Starlette(routes=routes, lifespan=lifespan, middleware=[Middleware(BridgeGuard, settings=settings)])


async def _json_body(request: Request) -> Any:
    """Parse a JSON body, tolerating an empty or invalid payload."""
    try:
        return await request.json()
    except Exception:
        return {}


__all__ = ["BridgeGuard", "create_app", "logger"]
