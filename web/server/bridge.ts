import crypto from "node:crypto";

import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import express, { type Express, type NextFunction, type Request, type Response } from "express";

import { AGENT_PROTOCOL_VERSION, type CanvasSession } from "./canvas/session";
import { createCanvasMcpServer } from "./mcp";
import { logger } from "./utils/logger";

/** Express 应用在运行时可作为 Connect 中间件调用；类型定义未暴露 handle，这里补上。 */
type CanvasServiceApp = Express & { handle: (req: Request, res: Response, next: NextFunction) => void };

/** 创建浏览器桥接与 HTTP MCP 的 Express 应用，由 Vite 中间件链复用同一端口。 */
export function createCanvasService(session: CanvasSession): CanvasServiceApp {
    const app = express() as CanvasServiceApp;
    app.disable("x-powered-by");
    app.use(express.json({ limit: "30mb" }));
    app.use((req, res, next) => {
        if (!logger.enabled) return next();
        const startedAt = Date.now();
        const pathname = requestUrl(req).pathname;
        res.on("finish", () => {
            if (req.method === "OPTIONS" || (res.statusCode < 400 && ["/health", "/config", "/canvas/state", "/canvas/activate"].includes(pathname))) return;
            logger.debug(`HTTP ${req.method} ${pathname}`, { status: res.statusCode, durationMs: Date.now() - startedAt });
        });
        next();
    });
    app.use(sameOriginGuard);
    app.get("/health", (_req, res) => res.json(session.health()));
    app.get("/config", (req, res) => res.json({ ok: true, protocolVersion: AGENT_PROTOCOL_VERSION, url: requestOrigin(req), hasToken: false }));
    mountMcp(app, session);
    app.get("/events", (req, res) => {
        session.openEvents(requestUrl(req), res);
    });
    app.post("/canvas/state", (req, res) => {
        session.updateState(req.body, clientId(req) || undefined);
        res.json({ ok: true });
    });
    app.post("/canvas/activate", (req, res) => {
        session.activateClient(clientId(req));
        res.json({ ok: true });
    });
    app.post("/canvas/result", (req, res) => {
        const ok = session.resolveResult(clientId(req), req.body);
        res.status(ok ? 200 : 409).json({ ok });
    });
    app.use((error: Error, req: Request, res: Response, next: NextFunction) => {
        logger.error("HTTP request failed", { method: req.method, path: req.path, error });
        if (res.headersSent) return next(error);
        res.status(500).json({ ok: false, error: error.message });
    });
    // Unmatched requests fall back to Vite's middleware chain instead of an Express 404.
    app.use((_req, _res, next) => next());
    return app;
}

/** 在同一个 Express 应用上挂载 Streamable HTTP MCP 传输。 */
function mountMcp(app: Express, session: CanvasSession) {
    const transports = new Map<string, StreamableHTTPServerTransport>();

    app.post("/mcp", async (req, res) => {
        try {
            const sessionId = headerValue(req.headers["mcp-session-id"]);
            if (sessionId) {
                const existing = transports.get(sessionId);
                if (!existing) return void res.status(400).json(mcpError("Bad Request: No valid session ID provided"));
                await existing.handleRequest(req, res, req.body);
                return;
            }
            if (!isInitializeRequest(req.body)) return void res.status(400).json(mcpError("Bad Request: No valid session ID provided"));
            const transport = new StreamableHTTPServerTransport({
                sessionIdGenerator: () => crypto.randomUUID(),
                onsessioninitialized: (initializedId) => {
                    transports.set(initializedId, transport);
                },
            });
            transport.onclose = () => {
                const id = transport.sessionId;
                if (id) transports.delete(id);
            };
            await createCanvasMcpServer(session).connect(transport);
            await transport.handleRequest(req, res, req.body);
        } catch (error) {
            handleMcpError(res, error);
        }
    });

    app.get("/mcp", async (req, res) => {
        const id = headerValue(req.headers["mcp-session-id"]);
        const transport = id ? transports.get(id) : undefined;
        if (!transport) return void res.status(400).send("Invalid or missing session ID");
        await transport.handleRequest(req, res);
    });

    app.delete("/mcp", async (req, res) => {
        const id = headerValue(req.headers["mcp-session-id"]);
        const transport = id ? transports.get(id) : undefined;
        if (!transport) return void res.status(400).send("Invalid or missing session ID");
        await transport.handleRequest(req, res);
    });
}

/** 读取单值请求头。 */
function headerValue(value: string | string[] | undefined) {
    return Array.isArray(value) ? value[0] : value;
}

/** 构造 JSON-RPC 错误响应。 */
function mcpError(message: string) {
    return { jsonrpc: "2.0", error: { code: -32000, message }, id: null };
}

/** 统一处理 MCP 请求异常。 */
function handleMcpError(res: Response, error: unknown) {
    logger.error("MCP request failed", { error });
    if (!res.headersSent) res.status(500).json({ jsonrpc: "2.0", error: { code: -32603, message: "Internal server error" }, id: null });
}

/** 结合请求地址解析当前请求 URL。 */
function requestUrl(req: Request) {
    return new URL(req.originalUrl || req.url || "/", "http://localhost");
}

/** 读取请求查询参数中的 clientId。 */
function clientId(req: Request) {
    return String(req.query.clientId || "");
}

/** 由请求 Host 推导对外声明的服务地址。 */
function requestOrigin(req: Request) {
    const host = req.headers.host || "127.0.0.1:3000";
    const forwarded = headerValue(req.headers["x-forwarded-proto"]);
    const protocol = forwarded?.split(",")[0]?.trim() || req.protocol || "http";
    return `${protocol}://${host}`;
}

/** 校验请求来源：同源或本机来源放行，无 Origin 的非浏览器客户端放行。 */
function sameOriginGuard(req: Request, res: Response, next: NextFunction) {
    const origin = req.headers.origin;
    if (origin) {
        if (!isAllowedOrigin(origin, req.headers.host)) return void res.status(403).json({ error: "origin not allowed" });
        res.setHeader("Access-Control-Allow-Origin", origin);
        res.setHeader("Vary", "Origin");
    }
    res.setHeader("Access-Control-Allow-Headers", "content-type,mcp-session-id,mcp-protocol-version");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    res.setHeader("Access-Control-Allow-Private-Network", "true");
    if (req.method === "OPTIONS") return void res.status(204).end();
    next();
}

/** 判断浏览器来源是否与本机服务同源。 */
function isAllowedOrigin(origin: string, host: string | undefined) {
    try {
        const parsed = new URL(origin);
        if (parsed.hostname === "127.0.0.1" || parsed.hostname === "localhost") return true;
        return Boolean(host) && parsed.host === host;
    } catch {
        return false;
    }
}
