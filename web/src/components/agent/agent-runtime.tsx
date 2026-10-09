import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import i18n from "@/i18n";
import { isSiteTool, runSiteTool } from "@/lib/agent/agent-site-tools";
import { applyAgentOps, getAgentActions, getAgentSchema, subscribeAgentActions } from "@/lib/agent/action-registry";
import { captureWorkspaceScreenshot } from "@/lib/agent/screenshot-registry";
import type { AgentOp, AgentPageSnapshot } from "@/lib/agent/agent-ops";
import { randomId } from "@/lib/utils";
import { bindAgentClient, fetchAgentClients, postState, postToolResult, releaseAgentClient } from "@/services/api/canvas-agent";
import { useCanvasStore } from "@/stores/canvas/use-canvas-store";
import { useAgentAuditStore } from "@/stores/use-agent-audit-store";
import { useAgentStore, type AgentPageContext, type AgentPendingToolCall } from "@/stores/use-agent-store";

const AGENT_PROTOCOL_VERSION = 7;

type AgentClientGlobal = typeof globalThis & { __openCanvasAgentClientIdPromise?: Promise<string> };
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

/** Route-independent catalog so the server can address any project without the page focus changing. */
function buildCatalog(context: AgentPageContext | null) {
    const projectIds = useCanvasStore.getState().projects.map((project) => project.id);
    const state = context?.state;
    const openProjectId = context?.page === "canvas" && typeof state?.projectId === "string" ? state.projectId : null;
    return { projectIds, openProjectId };
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
    const url = useAgentStore((state) => state.url);
    const connected = useAgentStore((state) => state.connected);
    const mcpEnabled = useAgentAuditStore((state) => state.mcpEnabled);
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
                useAgentStore.getState().setAgentState({ clientId });
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
            timer = setTimeout(() => void postState(endpoint, clientIdRef.current, buildPageSnapshot(pageContextRef.current), buildCatalog(pageContextRef.current)), 300);
        };
        const unsubscribeStore = useAgentStore.subscribe((state) => {
            if (state.pageContext === pageContextRef.current) return;
            pageContextRef.current = state.pageContext;
            publish();
        });
        const unsubscribeActions = subscribeAgentActions(publish);
        // Republish the route-independent catalog when the project id set changes (e.g. after async hydration).
        let catalogSignature = useCanvasStore.getState().projects.map((project) => project.id).join("|");
        const unsubscribeCanvas = useCanvasStore.subscribe((state) => {
            const next = state.projects.map((project) => project.id).join("|");
            if (next === catalogSignature) return;
            catalogSignature = next;
            publish();
        });
        return () => {
            unsubscribeStore();
            unsubscribeActions();
            unsubscribeCanvas();
            if (timer) clearTimeout(timer);
        };
    }, [endpoint]);

    const runToolCall = useCallback(async (endpoint: string, payload: AgentPendingToolCall) => {
        if (isSiteTool(payload.name)) {
            try {
                const result = await runSiteTool(payload.name, payload.input || {}, { state: pageContextRef.current?.state || null });
                await postToolResult(endpoint, clientIdRef.current, { requestId: payload.requestId, result });
            } catch (error) {
                const text = error instanceof Error ? error.message : i18n.t("agent.runtime.toolExecutionFailed");
                await postToolResult(endpoint, clientIdRef.current, { requestId: payload.requestId, error: text });
            }
            return;
        }
        try {
            const input: { ops?: AgentOp[]; path?: string; ns?: string; studio?: string; projectId?: string } = payload.input || {};
            let result: unknown;
            if (payload.name === "app_get_state") {
                result = buildPageSnapshot(pageContextRef.current);
            } else if (payload.name === "app_describe_actions") {
                result = describeAgentActions(typeof input.ns === "string" && input.ns ? input.ns : undefined);
            } else if (payload.name === "app_apply_ops") {
                const batchProjectId = typeof input.projectId === "string" && input.projectId ? input.projectId : "";
                const ops = normalizeAgentOps(input.ops);
                if (batchProjectId) {
                    for (const op of ops) {
                        if (op.ns === "canvas" && typeof op.projectId !== "string") op.projectId = batchProjectId;
                    }
                }
                const applied = applyAgentOps(ops);
                result = { applied: applied.applied, blocked: applied.blocked, errors: applied.errors, ...(applied.state ? { state: applied.state } : {}) };
                const context = pageContextRef.current;
                const openProjectId = context?.page === "canvas" && typeof context.state?.projectId === "string" ? context.state.projectId : "";
                const appliedProjectId = batchProjectId || (ops.find((op) => op.ns === "canvas" && typeof op.projectId === "string")?.projectId as string | undefined) || "";
                if (applied.state && (!appliedProjectId || appliedProjectId === openProjectId)) {
                    const snapshot = context ? { page: context.page, title: context.title, state: applied.state, availableActions: getAgentActions() } : null;
                    void postState(endpoint, clientIdRef.current, snapshot, buildCatalog(context));
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
    }, []);

    const handleToolCall = useCallback(async (endpoint: string, payload: AgentPendingToolCall) => {
        if (!useAgentAuditStore.getState().mcpEnabled) {
            await postToolResult(endpoint, clientIdRef.current, { requestId: payload.requestId, error: i18n.t("agent.runtime.mcpDisabled") });
            return;
        }
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
            void postState(endpoint, clientId, buildPageSnapshot(pageContextRef.current), buildCatalog(pageContextRef.current));
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
        if (!clientReady) return;
        let disposed = false;
        const refresh = () =>
            fetchAgentClients(endpoint)
                .then((data) => {
                    if (!disposed) setAgentState({ clients: data.clients || [], boundClientId: data.boundClientId || "" });
                })
                .catch(() => undefined);
        void refresh();
        const timer = setInterval(refresh, 3000);
        return () => {
            disposed = true;
            clearInterval(timer);
        };
    }, [clientReady, endpoint, setAgentState]);

    useEffect(() => {
        if (!clientReady) return;
        const clientId = clientIdRef.current;
        if (!clientId) return;
        if (!mcpEnabled) {
            void releaseAgentClient(endpoint, clientId).catch(() => undefined);
            return;
        }
        if (!connected) return;
        if (useAgentStore.getState().boundClientId && useAgentStore.getState().boundClientId !== clientId) return;
        void bindAgentClient(endpoint, clientId)
            .then(() => fetchAgentClients(endpoint))
            .then((data) => {
                if (clientIdRef.current === clientId) setAgentState({ clients: data.clients || [], boundClientId: data.boundClientId || "" });
            })
            .catch(() => undefined);
    }, [clientReady, connected, mcpEnabled, endpoint, setAgentState]);

    return null;
}

function acquireAgentClientId() {
    const scope = globalThis as AgentClientGlobal;
    scope.__openCanvasAgentClientIdPromise ||= (async () => {
        const storedClientId = readAgentClientId();
        let clientId = storedClientId || randomId();
        if (!navigator.locks) {
            if (!storedClientId) saveAgentClientId(clientId);
            return clientId;
        }
        while (true) {
            const acquired = await new Promise<boolean>((resolve, reject) => {
                void navigator.locks.request(`open-canvas-agent:${clientId}`, { ifAvailable: true }, async (lock) => {
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
    return scope.__openCanvasAgentClientIdPromise;
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
