import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import i18n from "@/i18n";
import { isSiteTool, runSiteTool } from "@/lib/agent/agent-site-tools";
import { randomId } from "@/lib/utils";
import { activateAgentClient, postState, postToolResult } from "@/services/api/canvas-agent";
import { useAgentStore, type AgentCanvasContext, type AgentPendingToolCall } from "@/stores/use-agent-store";
import type { CanvasAgentOp, CanvasAgentSnapshot } from "@/lib/canvas/canvas-agent-ops";

const AGENT_PROTOCOL_VERSION = 6;

type AgentClientGlobal = typeof globalThis & { __infiniteCanvasAgentClientIdPromise?: Promise<string> };
type AgentHelloEvent = { protocolVersion?: number };

function parseEventData<T>(event: Event) {
    try {
        return JSON.parse((event as MessageEvent).data) as T;
    } catch {
        return null;
    }
}

/**
 * Headless runtime that owns the invisible Agent machinery: the SSE connection to the same-origin
 * bridge, canvas snapshot publishing, tool-call execution, and the result callback. It renders
 * nothing and is mounted globally so an external MCP agent can drive the canvas without any chat UI.
 */
export function AgentRuntime() {
    const navigate = useNavigate();
    const url = useAgentStore((state) => state.url);
    const enabled = useAgentStore((state) => state.enabled);
    const connected = useAgentStore((state) => state.connected);
    const setAgentState = useAgentStore((state) => state.setAgentState);
    const endpoint = useMemo(() => url.trim().replace(/\/$/, ""), [url]);
    const canvasContextRef = useRef<AgentCanvasContext | null>(useAgentStore.getState().canvasContext);
    const clientIdRef = useRef("");
    const connectedRef = useRef(false);
    const [clientReady, setClientReady] = useState(false);

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

    // Imperatively subscribe to canvasContext to keep the ref current and debounce snapshot reports.
    useEffect(() => {
        let timer: ReturnType<typeof setTimeout> | null = null;
        const unsubscribe = useAgentStore.subscribe((state) => {
            if (state.canvasContext === canvasContextRef.current) return;
            canvasContextRef.current = state.canvasContext;
            if (!useAgentStore.getState().connected) return;
            if (timer) clearTimeout(timer);
            timer = setTimeout(() => void postState(endpoint, clientIdRef.current, canvasContextRef.current?.snapshot || null), 300);
        });
        return () => {
            unsubscribe();
            if (timer) clearTimeout(timer);
        };
    }, [endpoint]);

    const runToolCall = useCallback(async (endpoint: string, payload: AgentPendingToolCall) => {
        if (isSiteTool(payload.name)) {
            try {
                const result = await runSiteTool(payload.name, payload.input || {}, navigate, { canvasSnapshot: canvasContextRef.current?.snapshot || null });
                await postToolResult(endpoint, clientIdRef.current, { requestId: payload.requestId, result });
            } catch (error) {
                const text = error instanceof Error ? error.message : i18n.t("agent.runtime.toolExecutionFailed");
                await postToolResult(endpoint, clientIdRef.current, { requestId: payload.requestId, error: text });
            }
            return;
        }
        try {
            const input: { ops?: CanvasAgentOp[]; path?: string } = payload.input || {};
            let result: unknown;
            if (payload.name === "site_navigate") {
                const path = input.path || "/";
                navigate(path);
                result = { ok: true, path };
            } else if (payload.name === "canvas_apply_ops") {
                const context = canvasContextRef.current;
                if (!context) throw new Error(i18n.t("agent.runtime.openCanvasFirst"));
                result = context.applyOps(input.ops || []);
                void postState(endpoint, clientIdRef.current, result as CanvasAgentSnapshot);
            } else {
                const snapshot = canvasContextRef.current?.snapshot;
                if (!snapshot) throw new Error(i18n.t("agent.runtime.openCanvasFirst"));
                result = snapshot;
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
        if (!clientReady || !enabled) return;
        const clientId = clientIdRef.current;
        let disposed = false;
        let protocolRejected = false;
        const isCurrentConnection = () => !disposed && clientIdRef.current === clientId;
        const source = new EventSource(`${endpoint}/events?clientId=${encodeURIComponent(clientId)}`);
        source.addEventListener("hello", (event) => {
            if (!isCurrentConnection()) return;
            const hello = parseEventData<AgentHelloEvent>(event);
            if (hello?.protocolVersion !== AGENT_PROTOCOL_VERSION) {
                protocolRejected = true;
                source.close();
                connectedRef.current = false;
                setAgentState({ enabled: false, connected: false, activity: i18n.t("agent.runtime.restartRequired"), connectError: i18n.t("agent.runtime.agentOutdated") });
                return;
            }
            connectedRef.current = true;
            setAgentState({ connected: true, activity: i18n.t("agent.runtime.connected"), connectError: "" });
            void postState(endpoint, clientId, canvasContextRef.current?.snapshot || null);
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
            if (!wasConnected) {
                source.close();
                setAgentState({ enabled: false });
            }
        };
        return () => {
            disposed = true;
            source.close();
            connectedRef.current = false;
        };
    }, [clientReady, enabled, endpoint, handleToolCall, setAgentState]);

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
