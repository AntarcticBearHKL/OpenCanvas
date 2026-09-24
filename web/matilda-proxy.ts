import { randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { MatildaCore, trustApiBaseUrl } from "@maincode-ai/matilda-agent-sdk";
import type { Connect, Plugin } from "vite";

const MATILDA_PREFIX = "/matilda";
const MATILDA_API_BASE_URL = trustApiBaseUrl("https://matilda.maincode.com/api");
const MATILDA_MODEL_ID = "matilda";
const RESPONSES_PATH = "/v1/responses";
const CHAT_COMPLETIONS_PATH = "/v1/chat/completions";
const MODELS_PATH = "/v1/models";
const MAX_REQUEST_BODY_BYTES = 32 * 1024 * 1024;

type ChatResponseMode = "auto" | "instant" | "deep";
type MatildaTurn = { role: "user" | "assistant"; text: string };

class MatildaProxyError extends Error {
    readonly status: number;

    constructor(status: number, message: string) {
        super(message);
        this.status = status;
    }
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function parseJsonRecord(raw: string): Record<string, unknown> | null {
    try {
        const parsed: unknown = JSON.parse(raw);
        return isRecord(parsed) ? parsed : null;
    } catch {
        return null;
    }
}

function writeJson(response: ServerResponse, status: number, payload: unknown) {
    const body = JSON.stringify(payload);
    response.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Content-Length": Buffer.byteLength(body) });
    response.end(body);
}

function writeError(response: ServerResponse, status: number, message: string) {
    writeJson(response, status, { error: { message, type: "matilda_proxy_error" } });
}

function writeSse(response: ServerResponse, payload: unknown) {
    const data = typeof payload === "string" ? payload : JSON.stringify(payload);
    response.write(`data: ${data}\n\n`);
}

function writeSseHeaders(response: ServerResponse) {
    response.writeHead(200, {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
    });
}

function writeStreamError(response: ServerResponse, error: unknown) {
    const status = error instanceof MatildaProxyError ? error.status : 502;
    const message = error instanceof Error && error.message ? error.message : "Matilda request failed.";
    if (!response.headersSent) {
        writeError(response, status, message);
        return;
    }
    writeSse(response, { type: "error", error: { message } });
    writeSse(response, "[DONE]");
    response.end();
}

function readRawBody(request: IncomingMessage, onComplete: () => void): Promise<Buffer> {
    return new Promise((resolve, reject) => {
        const chunks: Buffer[] = [];
        let size = 0;
        let completed = false;
        request.on("data", (chunk: Buffer) => {
            size += chunk.byteLength;
            if (size > MAX_REQUEST_BODY_BYTES) {
                reject(new MatildaProxyError(413, "Request body is too large."));
                request.destroy();
                return;
            }
            chunks.push(chunk);
        });
        request.on("end", () => {
            completed = true;
            onComplete();
            resolve(Buffer.concat(chunks));
        });
        request.on("close", () => {
            if (!completed) reject(new MatildaProxyError(400, "Request body was interrupted."));
        });
        request.on("error", (error) => reject(new MatildaProxyError(400, error.message || "Request body could not be read.")));
    });
}

async function readJsonBody(request: IncomingMessage, onComplete: () => void): Promise<Record<string, unknown>> {
    const raw = (await readRawBody(request, onComplete)).toString("utf8").trim();
    if (!raw) return {};
    const parsed = parseJsonRecord(raw);
    if (!parsed) throw new MatildaProxyError(400, "Request body must be a JSON object.");
    return parsed;
}

function readBearerToken(request: IncomingMessage) {
    const header = request.headers.authorization;
    const value = typeof header === "string" ? header.trim() : "";
    const match = value.match(/^Bearer\s+(\S+)$/i);
    return match ? match[1] : "";
}

async function readRequest(request: IncomingMessage, response: ServerResponse) {
    const controller = new AbortController();
    let bodyRead = false;
    request.on("close", () => {
        if (!bodyRead) controller.abort();
    });
    response.on("close", () => {
        if (!response.writableEnded) controller.abort();
    });
    const body = await readJsonBody(request, () => {
        bodyRead = true;
    });
    return { body, controller };
}

function collectText(content: unknown): string {
    if (typeof content === "string") return content;
    if (!Array.isArray(content)) return "";
    const parts: string[] = [];
    for (const part of content) {
        if (!isRecord(part) || typeof part.text !== "string") continue;
        if (part.type === undefined || part.type === "input_text" || part.type === "text") parts.push(part.text);
    }
    return parts.join("\n");
}

function buildMatildaMessage(input: unknown): string {
    const items = Array.isArray(input) ? input : typeof input === "string" ? [{ role: "user", content: input }] : [];
    const systemParts: string[] = [];
    const turns: MatildaTurn[] = [];
    for (const item of items) {
        if (!isRecord(item)) continue;
        const text = collectText(item.content).trim();
        if (!text) continue;
        const role = item.role;
        if (role === "system" || role === "developer") {
            systemParts.push(text);
            continue;
        }
        if (role !== "user" && role !== "assistant") continue;
        turns.push({ role, text });
    }
    const sections: string[] = [];
    if (systemParts.length) sections.push(systemParts.join("\n\n"));
    if (turns.length === 1) sections.push(turns[0].text);
    if (turns.length > 1) {
        sections.push("Conversation so far:");
        for (const turn of turns) sections.push(`${turn.role === "user" ? "User" : "Assistant"}: ${turn.text}`);
    }
    return sections.join("\n\n").trim();
}

function resolveResponseMode(reasoning: unknown): ChatResponseMode {
    if (!isRecord(reasoning) || typeof reasoning.effort !== "string") return "auto";
    const effort = reasoning.effort.toLowerCase();
    if (effort === "low" || effort === "minimal") return "instant";
    if (effort === "high" || effort === "xhigh") return "deep";
    return "auto";
}

function readUpstreamError(status: number, body: string) {
    const raw = body.trim();
    const parsed = raw ? parseJsonRecord(raw) : null;
    if (parsed) {
        const nested = isRecord(parsed.error) ? parsed.error.message : undefined;
        const message = typeof parsed.error === "string" ? parsed.error : typeof parsed.message === "string" ? parsed.message : typeof nested === "string" ? nested : "";
        if (message.trim()) return message.trim().slice(0, 500);
    }
    if (raw && !raw.startsWith("<")) return raw.slice(0, 500);
    if (status === 401 || status === 403) return "Matilda rejected the API key. Check the mc_live_ key in Settings → Channels.";
    if (status === 429) return "Matilda rate limited this request. Try again shortly.";
    return `Matilda request failed (${status}).`;
}

type MatildaStreamOptions = {
    apiKey: string;
    message: string;
    responseMode: ChatResponseMode;
    signal: AbortSignal;
    onStart: () => void;
    onDelta: (delta: string) => void;
};

async function streamMatilda(options: MatildaStreamOptions): Promise<string> {
    const core = new MatildaCore({ baseUrl: MATILDA_API_BASE_URL });
    const response = await core.sendChatRequest([{ role: "user", content: options.message }], {
        accessToken: options.apiKey,
        responseMode: options.responseMode,
        persist: false,
        signal: options.signal,
    });
    if (!response.ok) {
        const body = await response.text().catch(() => "");
        throw new MatildaProxyError(response.status, readUpstreamError(response.status, body));
    }
    const reader = response.body?.getReader();
    if (!reader) throw new MatildaProxyError(502, "Matilda returned an empty response stream.");
    options.onStart();
    const decoder = new TextDecoder();
    let buffer = "";
    let eventName = "";
    let text = "";
    let failure = "";
    while (!failure) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
            if (line.startsWith("event:")) {
                eventName = line.slice(6).trim();
                continue;
            }
            if (!line.startsWith("data:")) {
                if (!line.trim()) eventName = "";
                continue;
            }
            const payload = line.slice(5).trim();
            if (!payload || payload === "[DONE]") continue;
            const event = parseJsonRecord(payload);
            if (eventName === "token") {
                const chunk = typeof event?.content === "string" ? event.content : "";
                if (chunk) {
                    text += chunk;
                    options.onDelta(chunk);
                }
                continue;
            }
            if (eventName === "error") {
                failure = typeof event?.error === "string" ? event.error : "Matilda stream failed.";
            }
        }
    }
    if (failure) {
        await reader.cancel().catch(() => undefined);
        throw new MatildaProxyError(502, failure);
    }
    return text;
}

function responsesPayload(id: string, text: string) {
    return {
        id,
        object: "response",
        created_at: Math.floor(Date.now() / 1000),
        status: "completed",
        model: MATILDA_MODEL_ID,
        output_text: text,
        output: [{ id: `msg_${id}`, type: "message", status: "completed", role: "assistant", content: [{ type: "output_text", text, annotations: [] }] }],
    };
}

function chatCompletionPayload(id: string, text: string) {
    return {
        id,
        object: "chat.completion",
        created: Math.floor(Date.now() / 1000),
        model: MATILDA_MODEL_ID,
        choices: [{ index: 0, message: { role: "assistant", content: text }, finish_reason: "stop" }],
    };
}

async function handleResponses(request: IncomingMessage, response: ServerResponse, apiKey: string) {
    const { body, controller } = await readRequest(request, response);
    const message = buildMatildaMessage(body.input);
    if (!message) throw new MatildaProxyError(400, "Request input contains no text content.");
    const id = `resp_${randomUUID()}`;
    if (body.stream !== true) {
        const text = await streamMatilda({ apiKey, message, responseMode: resolveResponseMode(body.reasoning), signal: controller.signal, onStart: () => undefined, onDelta: () => undefined });
        writeJson(response, 200, responsesPayload(id, text));
        return;
    }
    try {
        const text = await streamMatilda({
            apiKey,
            message,
            responseMode: resolveResponseMode(body.reasoning),
            signal: controller.signal,
            onStart: () => writeSseHeaders(response),
            onDelta: (delta) => writeSse(response, { type: "response.output_text.delta", item_id: `msg_${id}`, output_index: 0, content_index: 0, delta }),
        });
        writeSse(response, { type: "response.output_text.done", item_id: `msg_${id}`, output_index: 0, content_index: 0, text });
        writeSse(response, { type: "response.completed", response: responsesPayload(id, text) });
        writeSse(response, "[DONE]");
        response.end();
    } catch (error) {
        writeStreamError(response, error);
    }
}

async function handleChatCompletions(request: IncomingMessage, response: ServerResponse, apiKey: string) {
    const { body, controller } = await readRequest(request, response);
    const message = buildMatildaMessage(body.messages);
    if (!message) throw new MatildaProxyError(400, "Request messages contain no text content.");
    const id = `chatcmpl_${randomUUID()}`;
    if (body.stream !== true) {
        const text = await streamMatilda({ apiKey, message, responseMode: "auto", signal: controller.signal, onStart: () => undefined, onDelta: () => undefined });
        writeJson(response, 200, chatCompletionPayload(id, text));
        return;
    }
    try {
        await streamMatilda({
            apiKey,
            message,
            responseMode: "auto",
            signal: controller.signal,
            onStart: () => {
                writeSseHeaders(response);
                writeSse(response, { id, object: "chat.completion.chunk", created: Math.floor(Date.now() / 1000), model: MATILDA_MODEL_ID, choices: [{ index: 0, delta: { role: "assistant" }, finish_reason: null }] });
            },
            onDelta: (delta) => writeSse(response, { id, object: "chat.completion.chunk", created: Math.floor(Date.now() / 1000), model: MATILDA_MODEL_ID, choices: [{ index: 0, delta: { content: delta }, finish_reason: null }] }),
        });
        writeSse(response, { id, object: "chat.completion.chunk", created: Math.floor(Date.now() / 1000), model: MATILDA_MODEL_ID, choices: [{ index: 0, delta: {}, finish_reason: "stop" }] });
        writeSse(response, "[DONE]");
        response.end();
    } catch (error) {
        writeStreamError(response, error);
    }
}

async function handleMatildaRequest(request: IncomingMessage, response: ServerResponse) {
    const rawPath = (request.url ?? "/").split("?")[0];
    const path = (rawPath.startsWith(MATILDA_PREFIX) ? rawPath.slice(MATILDA_PREFIX.length) : rawPath).replace(/\/+$/, "") || "/";
    if (request.method === "OPTIONS") {
        response.writeHead(204, { Allow: "GET, POST, OPTIONS" });
        response.end();
        return;
    }
    try {
        if (path === MODELS_PATH) {
            if (request.method !== "GET" && request.method !== "HEAD") throw new MatildaProxyError(405, "Method not allowed.");
            writeJson(response, 200, { object: "list", data: [{ id: MATILDA_MODEL_ID, object: "model", created: Math.floor(Date.now() / 1000), owned_by: "maincode" }] });
            return;
        }
        if (path !== RESPONSES_PATH && path !== CHAT_COMPLETIONS_PATH) throw new MatildaProxyError(404, `Unknown Matilda proxy path: ${path}`);
        if (request.method !== "POST") throw new MatildaProxyError(405, "Method not allowed.");
        const apiKey = readBearerToken(request);
        if (!apiKey) throw new MatildaProxyError(401, "Missing Matilda API key. Paste your mc_live_ key into the Matilda channel in Settings → Channels.");
        if (path === RESPONSES_PATH) await handleResponses(request, response, apiKey);
        else await handleChatCompletions(request, response, apiKey);
    } catch (error) {
        writeStreamError(response, error);
    }
}

export function matildaProxy(): Plugin {
    const middleware: Connect.NextHandleFunction = (request, response) => {
        void handleMatildaRequest(request, response);
    };
    return {
        name: "matilda-proxy",
        configureServer(server) {
            server.middlewares.use(MATILDA_PREFIX, middleware);
        },
        configurePreviewServer(server) {
            server.middlewares.use(MATILDA_PREFIX, middleware);
        },
    };
}
