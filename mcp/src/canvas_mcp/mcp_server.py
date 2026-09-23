"""MCP server wiring: the 33 tools over the official Streamable HTTP transport.

Port of ``web/server/mcp.ts`` using the low-level ``Server`` callbacks so tool
names, descriptions and input schemas are exactly controlled.
"""

from __future__ import annotations

import json
from typing import Any

import mcp.types as types
from mcp.server.lowlevel import Server
from mcp.server.streamable_http_manager import StreamableHTTPSessionManager
from mcp.server.transport_security import TransportSecuritySettings

from canvas_mcp.config import INSTRUCTIONS, VERSION
from canvas_mcp.schemas import INPUT_SCHEMAS, TOOL_DESCRIPTIONS, TOOL_NAMES
from canvas_mcp.session import CanvasSession

# Match ``express.json({limit: "30mb"})`` in the TypeScript bridge.
MAX_REQUEST_BODY_SIZE = 30 * 1024 * 1024

# Loopback-only transport security so the SDK does not reject local requests with 421.
TRANSPORT_SECURITY = TransportSecuritySettings(
    enable_dns_rebinding_protection=True,
    allowed_hosts=["127.0.0.1:*", "localhost:*", "[::1]:*"],
    allowed_origins=["http://127.0.0.1:*", "http://localhost:*", "http://[::1]:*"],
)


def failure_message(result: dict[str, Any]) -> str:
    """Read the error string from an explicit ``{ok: false}`` tool result."""
    error = result.get("error")
    return error if isinstance(error, str) and error else "tool call failed"


def create_mcp(session: CanvasSession) -> tuple[Server[Any], StreamableHTTPSessionManager]:
    """Build the MCP server bound to the shared canvas session and its session manager."""

    async def list_tools(_ctx: Any, _params: Any) -> types.ListToolsResult:
        return types.ListToolsResult(
            tools=[
                types.Tool(name=name, description=TOOL_DESCRIPTIONS[name], input_schema=INPUT_SCHEMAS[name])
                for name in TOOL_NAMES
            ]
        )

    async def call_tool(_ctx: Any, params: types.CallToolRequestParams) -> types.CallToolResult:
        try:
            result = await session.call_tool(params.name, params.arguments)
        except Exception as exc:  # tool failures surface as MCP tool errors
            return types.CallToolResult(content=[types.TextContent(type="text", text=str(exc))], is_error=True)
        if isinstance(result, dict) and result.get("ok") is False:
            return types.CallToolResult(content=[types.TextContent(type="text", text=failure_message(result))], is_error=True)
        return types.CallToolResult(
            content=[types.TextContent(type="text", text=json.dumps(result, ensure_ascii=False, indent=2))]
        )

    server: Server[Any] = Server(
        "opencanvas-mcp",
        version=VERSION,
        instructions=INSTRUCTIONS,
        on_list_tools=list_tools,
        on_call_tool=call_tool,
    )
    manager = StreamableHTTPSessionManager(
        app=server,
        json_response=False,
        stateless=False,
        security_settings=TRANSPORT_SECURITY,
        max_request_body_size=MAX_REQUEST_BODY_SIZE,
    )
    return server, manager
