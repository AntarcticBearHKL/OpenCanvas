import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import i18n from "@/i18n";
import { isSiteTool, runSiteTool } from "@/lib/agent/agent-site-tools";
import { applyAgentOps, getAgentActions, getAgentSchema, subscribeAgentActions } from "@/lib/agent/action-registry";
import { captureWorkspaceScreenshot } from "@/lib/agent/screenshot-registry";
import type { AgentOp, AgentPageSnapshot } from "@/lib/agent/agent-ops";
import { randomId } from "@/lib/utils";
import { activateAgentClient, postState, postToolResult } from "@/services/api/canvas-agent";
import { useAgentStore, type AgentPageContext, type AgentPendingToolCall } from "@/stores/use-agent-store";

const AGENT_PROTOCOL_VERSION = 7;

type AgentClientGlobal = typeof globalThis & { __infiniteCanvasAgentClientIdPromise?: Promise<string> };
type AgentHelloEvent = { protocolVersion?: number };

function parseEventData<T>(event: Event) {
    try {
        return JSON.parse((event as MessageEvent).data) as T;
    } catch {
        return null;
    }
}

/** Build the page snapshot envelope posted to the server; availableActions carries no schema. */
function buildPageSnapshot(context: AgentPageContext | null): AgentPageSnapshot | null {
    if (!context) return null;
    return { page: context.page, title: context.title, state: context.state, availableActions: getAgentActions() };
}

/** `app_describe_actions` result: namespaces with their op list and JSON Schema. */
function describeAgentActions(ns?: string) {
    return {
        namespaces: getAgentActions()
            .filter((action) => !ns || action.ns === ns)
            .map((action) => ({ ...action, schema: getAgentSchema(action.ns) })),
    };
}

/** Tolerate legacy ops that omit `ns` by defaulting them to the canvas namespace. */
function normalizeAgentOps(ops: unknown): AgentOp[] {
    if (!Array.isArray(ops)) return [];
    return ops
        .filter((op): op is Record<string, unknown> => Boolean(op) && typeof op === "object")
        .map((op) => ({ ns: "canvas", ...op }) as AgentOp);
}

/**
 * Headless runtime that owns the invisible Agent machinery: the SSE connection to the local bridge,
 * page snapshot publishing, tool-call execution, and the result callback. It renders nothing and is
 * mounted globally so an external MCP agent can drive the page without any chat UI.
 */
export function AgentRuntime() {
    const navigate = useNavigate();
    const url = useAgentStore((state) => state.url);
    const connected = useAgentStore((state) => state.connected);
    const setAgentState = useAgentStore((state) => state.setAgentState);
    const endpoint = useMemo(() => url.trim().replace(/\/$/, ""), [url]);
    const pageContextRef = useRef<AgentPageContext | null>(useAgentStore.getState().pageContext);
    const clientIdRef = useRef("");
    const connectedRef = useRef(false);
    const retryRef = useRef(0);
    const [clientReady, setClientReady] = useState(false);
    const [reconnectTick, setReconnectTick] = useState(0);

    useEffect(() => {
        let disposed = false;
        void acquireAgentClientId().then((clientId) => {
            if (!disposed) {
                clientIdRef.current = clientId;
                setClientReady(true);
            }
        });
        return () => { disposed = true; };
    }, []);

    // Imperatively subscribe to pageContext (and registry changes) to keep the ref current and debounce reports.
    useEffect(() => {
        let timer: ReturnType<typeof setTimeout> | null = null;
        const publish = () => {
            if (!useAgentStore.getState().connected) return;
            if (timer) clearTimeout(timer);
            timer = setTimeout(() => void postState(endpoint, clientIdRef.current, buildPageSnapshot(pageContextRef.current)), 300);
        };
        const unsubscribeStore = useAgentStore.subscribe((state) => {
            if (state.pageContext === pageContextRef.current) return;
            pageContextRef.current = state.pageContext;
            publish();
        });
        const unsubscribeActions = subscribeAgentActions(publish);
        return () => {
            unsubscribeStore();
            unsubscribeActions();
            if (timer) clearTimeout(timer);
        };
    }, [endpoint]);

    const runToolCall = useCallback(async (endpoint: string, payload: AgentPendingToolCall) => {
        if (isSiteTool(payload.name)) {
            try {
                const result = await runSiteTool(payload.name, payload.input || {}, navigate, { state: pageContextRef.current?.state || null });
                await postToolResult(endpoint, clientIdRef.current, { requestId: payload.requestId, result });
            } catch (error) {
                const text = error instanceof Error ? error.message : i18n.t("agent.runtime.toolExecutionFailed");
                await postToolResult(endpoint, clientIdRef.current, { requestId: payload.requestId, error: text });
            }
            return;
        }
        try {
            const input: { ops?: AgentOp[]; path?: string; ns?: string; studio?: string } = payload.input || {};
            let result: unknown;
            if (payload.name === "site_navigate") {
                const path = input.path || "/";
                navigate(path);
                result = { ok: true, path };
            } else if (payload.name === "app_get_state") {
                result = buildPageSnapshot(pageContextRef.current);
            } else if (payload.name === "app_describe_actions") {
                result = describeAgentActions(typeof input.ns === "string" && input.ns ? input.ns : undefined);
            } else if (payload.name === "app_apply_ops") {
                const applied = applyAgentOps(normalizeAgentOps(input.ops));
                result = { applied: applied.applied, blocked: applied.blocked, errors: applied.errors, ...(applied.state ? { state: applied.state } : {}) };
                if (applied.state) {
                    const context = pageContextRef.current;
                    void postState(endpoint, clientIdRef.current, context ? { page: context.page, title: context.title, state: applied.state, availableActions: getAgentActions() } : null);
                }
            } else if (payload.name === "app_screenshot") {
                const studio = (typeof input.studio === "string" && input.studio) || (pageContextRef.current?.state?.workspace as string) || "";
                const shot = await captureWorkspaceScreenshot(studio);
                if (!shot) throw new Error(i18n.t("agent.runtime.screenshotUnavailable"));
                result = shot;
            } else {
                result = buildPageSnapshot(pageContextRef.current);
            }
            await postToolResult(endpoint, clientIdRef.current, { requestId: payload.requestId, result });
        } catch (error) {
            const text = error instanceof Error ? error.message : i18n.t("agent.runtime.canvasOperationFailed");
            await postToolResult(endpoint, clientIdRef.current, { requestId: payload.requestId, error: text });
        }
    }, [navigate]);

    const handleToolCall = useCallback(async (endpoint: string, payload: AgentPendingToolCall) => {
        // There is no chat UI for manual confirmation, so write tools are always auto-applied.
        await runToolCall(endpoint, payload);
    }, [runToolCall]);

    useEffect(() => {
        if (!clientReady) return;
        const clientId = clientIdRef.current;
        let disposed = false;
        let protocolRejected = false;
        let retryTimer: ReturnType<typeof setTimeout> | null = null;
        const isCurrentConnection = () => !disposed && clientIdRef.current === clientId;
        const source = new EventSource(`${endpoint}/events?clientId=${encodeURIComponent(clientId)}`);
        source.addEventListener("hello", (event) => {
            if (!isCurrentConnection()) return;
            const hello = parseEventData<AgentHelloEvent>(event);
            if (hello?.protocolVersion !== AGENT_PROTOCOL_VERSION) {
                protocolRejected = true;
                source.close();
                connectedRef.current = false;
                setAgentState({ connected: false, activity: i18n.t("agent.runtime.restartRequired"), connectError: i18n.t("agent.runtime.agentOutdated") });
                return;
            }
            connectedRef.current = true;
            retryRef.current = 0;
            setAgentState({ connected: true, activity: i18n.t("agent.runtime.connected"), connectError: "" });
            void postState(endpoint, clientId, buildPageSnapshot(pageContextRef.current));
            if (document.visibilityState === "visible" && document.hasFocus()) void activateAgentClient(endpoint, clientId);
        });
        source.addEventListener("tool_call", (event) => {
            if (!isCurrentConnection()) return;
            const data = parseEventData<AgentPendingToolCall>(event);
            if (data) void handleToolCall(endpoint, data);
        });
        source.onerror = () => {
            if (disposed || protocolRejected) return;
            const wasConnected = connectedRef.current;
            const text = i18n.t(wasConnected ? "agent.runtime.connectionLostDescription" : "agent.runtime.connectionFailedDescription");
            connectedRef.current = false;
            setAgentState({
                activity: i18n.t(wasConnected ? "agent.runtime.connectionLost" : "agent.runtime.connectionFailed"),
                connected: false,
                connectError: text,
            });
            // Retry with backoff so a bridge restart recovers without reloading the page.
            source.close();
            const attempt = (retryRef.current += 1);
            const delay = Math.min(15000, 1000 * 2 ** Math.min(attempt - 1, 4));
            retryTimer = setTimeout(() => {
                if (!disposed) setReconnectTick((tick) => tick + 1);
            }, delay);
        };
        return () => {
            disposed = true;
            if (retryTimer) clearTimeout(retryTimer);
            source.close();
            connectedRef.current = false;
        };
    }, [clientReady, endpoint, handleToolCall, setAgentState, reconnectTick]);

    useEffect(() => {
        if (!connected) return;
        const activate = () => void activateAgentClient(endpoint, clientIdRef.current);
        const activateVisible = () => {
            if (document.visibilityState === "visible") activate();
        };
        window.addEventListener("focus", activate);
        document.addEventListener("visibilitychange", activateVisible);
        return () => {
            window.removeEventListener("focus", activate);
            document.removeEventListener("visibilitychange", activateVisible);
        };
    }, [connected, endpoint]);

    return null;
}

function acquireAgentClientId() {
    const scope = globalThis as AgentClientGlobal;
    scope.__infiniteCanvasAgentClientIdPromise ||= (async () => {
        const storedClientId = readAgentClientId();
        let clientId = storedClientId || randomId();
        if (!navigator.locks) {
            if (!storedClientId) saveAgentClientId(clientId);
            return clientId;
        }
        while (true) {
            const acquired = await new Promise<boolean>((resolve, reject) => {
                void navigator.locks.request(`infinite-canvas-agent:${clientId}`, { ifAvailable: true }, async (lock) => {
                    if (!lock) return resolve(false);
                    resolve(true);
                    await new Promise<void>(() => undefined);
                }).catch(reject);
            });
            if (acquired) {
                saveAgentClientId(clientId);
                return clientId;
            }
            clientId = randomId();
        }
    })().catch(() => {
        const clientId = randomId();
        saveAgentClientId(clientId);
        return clientId;
    });
    return scope.__infiniteCanvasAgentClientIdPromise;
}

function readAgentClientId() {
    try {
        return sessionStorage.getItem("canvas-agent-client-id") || "";
    } catch {
        return "";
    }
}

function saveAgentClientId(clientId: string) {
    try {
        sessionStorage.setItem("canvas-agent-client-id", clientId);
    } catch {
        // The in-memory identity still keeps request ownership consistent within the current page session.
    }
}
