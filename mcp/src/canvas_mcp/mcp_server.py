"""MCP server wiring: the 41 tools over the official Streamable HTTP transport.

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

# Decoded-byte ceiling for a node-content envelope, mirroring ``MAX_NODE_CONTENT_BYTES`` in the web
# resolver; ``canvas_get_node_content`` may lower it per call via ``maxBytes``.
MAX_CONTENT_BYTES = 16 * 1024 * 1024
CONTENT_KINDS = frozenset({"image", "video", "audio", "midi", "text"})

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


def content_result(result: dict[str, Any], node_id: str, max_bytes: int) -> types.CallToolResult:
    """Convert a node-content envelope into MCP media blocks, keeping metadata in a leading text block.

    Image -> ``ImageContent``, audio -> ``AudioContent``, text -> ``TextContent``, video/MIDI/other
    binary -> ``EmbeddedResource`` with a ``BlobResourceContents`` payload.
    """
    kind = str(result.get("kind"))
    mime_type = str(result.get("mimeType") or "application/octet-stream")
    filename = str(result.get("filename") or "")
    data_url = result.get("dataUrl")
    payload = data_url.partition(",")[2] if isinstance(data_url, str) and data_url.startswith("data:") else ""
    size = result.get("bytes")
    decoded = int(size) if isinstance(size, (int, float)) else len(payload) * 3 // 4
    meta = {"kind": kind, "mimeType": mime_type, "filename": filename, "bytes": decoded, "nodeId": node_id}
    if decoded > max_bytes:
        return types.CallToolResult(content=[types.TextContent(type="text", text=f"节点内容超过大小上限：{decoded} bytes > {max_bytes}")], is_error=True)
    meta_block = types.TextContent(type="text", text=json.dumps(meta, ensure_ascii=False))
    if kind == "text":
        return types.CallToolResult(content=[meta_block, types.TextContent(type="text", text=str(result.get("text") or ""))])
    if not payload:
        return types.CallToolResult(content=[types.TextContent(type="text", text="节点内容缺少数据")], is_error=True)
    if kind == "image":
        return types.CallToolResult(content=[meta_block, types.ImageContent(type="image", data=payload, mimeType=mime_type)])
    if kind == "audio":
        return types.CallToolResult(content=[meta_block, types.AudioContent(type="audio", data=payload, mimeType=mime_type)])
    resource = types.BlobResourceContents(uri=f"canvas://node/{node_id}", mimeType=mime_type, blob=payload)
    return types.CallToolResult(content=[meta_block, types.EmbeddedResource(type="resource", resource=resource)])


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
        if isinstance(result, dict) and result.get("ok") is True and result.get("kind") in CONTENT_KINDS and "filename" in result:
            arguments = params.arguments if isinstance(params.arguments, dict) else {}
            node_id = str(arguments.get("nodeId") or "unknown")
            raw_max = arguments.get("maxBytes")
            max_bytes = int(raw_max) if isinstance(raw_max, (int, float)) and raw_max > 0 else MAX_CONTENT_BYTES
            return content_result(result, node_id, max_bytes)
        data_url = result.get("dataUrl") if isinstance(result, dict) else None
        if isinstance(data_url, str) and data_url.startswith("data:"):
            header, _, payload = data_url.partition(",")
            mime_type = header[5:].split(";", 1)[0] or "image/png"
            return types.CallToolResult(content=[types.ImageContent(type="image", data=payload, mimeType=mime_type)])
        return types.CallToolResult(
            content=[types.TextContent(type="text", text=json.dumps(result, ensure_ascii=False, indent=2))]
        )

    server: Server[Any] = Server(
        "open-canvas-mcp",
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
