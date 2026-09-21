import type { Request, Response } from "express";
import type { Connect } from "vite";

import { CanvasSession } from "./canvas/session";
import { createCanvasService } from "./bridge";

const BRIDGE_PATHS = [/^\/health(\/|\?|$)/, /^\/config(\/|\?|$)/, /^\/events(\/|\?|$)/, /^\/canvas\/(state|activate|result)(\/|\?|$)/, /^\/mcp(\/|\?|$)/];
const CONFIG_PATH = /^\/config(\/|\?|$)/;

/** 将画布桥接与 HTTP MCP 挂载到 Vite 中间件链，与前端画布共用同一个端口。 */
export function mountCanvasService(middlewares: Connect.Server) {
    const session = new CanvasSession();
    const app = createCanvasService(session);
    middlewares.use((req, res, next) => {
        const url = req.url || "/";
        // /config 同时也是前端路由，浏览器导航交给 Vite 提供 SPA，接口请求才返回 JSON。
        if (CONFIG_PATH.test(url) && req.headers.accept?.includes("text/html")) return next();
        if (!BRIDGE_PATHS.some((pattern) => pattern.test(url))) return next();
        app.handle(req as Request, res as Response, next);
    });
}
