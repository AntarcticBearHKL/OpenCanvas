import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { toolDescriptions, toolInputSchemas, toolNames, type ToolName } from "./canvas/schemas";
import type { CanvasSession } from "./canvas/session";
import { INSTRUCTIONS, VERSION } from "./config";

/** 创建绑定到共享画布会话的 MCP 服务实例。 */
export function createCanvasMcpServer(session: CanvasSession) {
    const server = new McpServer({ name: "opencanvas-mcp", version: VERSION }, { instructions: INSTRUCTIONS });
    toolNames.forEach((name) => registerCanvasTool(server, session, name));
    return server;
}

/** 向 MCP Server 注册单个画布工具。 */
function registerCanvasTool(server: McpServer, session: CanvasSession, name: ToolName) {
    const schema = toolInputSchemas[name];
    server.registerTool(name, { description: toolDescriptions[name], inputSchema: schema.shape }, async (input: unknown) => {
        const result = await session.callTool(name, schema.parse(input));
        if (isFailedResult(result)) throw new Error(failureMessage(result));
        return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    });
}

/** 判断工具结果是否为显式失败。 */
function isFailedResult(result: unknown): result is { ok: false; error?: unknown } {
    return Boolean(result) && typeof result === "object" && (result as { ok?: unknown }).ok === false;
}

/** 读取工具失败结果中的错误信息。 */
function failureMessage(result: { ok: false; error?: unknown }) {
    return typeof result.error === "string" && result.error ? result.error : "tool call failed";
}
