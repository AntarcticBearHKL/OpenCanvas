import i18n from "@/i18n";
import type { AgentPageSnapshot } from "@/lib/agent/agent-ops";

class AgentApiError<T = unknown> extends Error {
    constructor(readonly status: number, readonly response: T & { code?: string; error?: string; msg?: string }) {
        super(response.error || response.msg || i18n.t("agent.state.requestFailed"));
        this.name = "AgentApiError";
    }
}

function agentHeaders(token: string, headers?: Record<string, string>) {
    const next: Record<string, string> = { ...headers };
    if (token) next.Authorization = `Bearer ${token}`;
    return next;
}

export async function postState(endpoint: string, clientId: string, snapshot: AgentPageSnapshot | null, token = "") {
    try {
        const response = await fetch(`${endpoint}/canvas/state?clientId=${encodeURIComponent(clientId)}`, {
            method: "POST",
            headers: agentHeaders(token, { "content-type": "application/json" }),
            body: JSON.stringify(snapshot ?? { hasCanvas: false }),
        });
        return response.ok;
    } catch {
        return false;
    }
}

export async function activateAgentClient(endpoint: string, clientId: string, token = "") {
    try {
        await fetch(`${endpoint}/canvas/activate?clientId=${encodeURIComponent(clientId)}`, { method: "POST", headers: agentHeaders(token) });
    } catch {}
}

export async function postToolResult(endpoint: string, clientId: string, body: { requestId: string; result?: unknown; error?: string }, token = "") {
    await fetchAgentJson(endpoint, `/canvas/result?clientId=${encodeURIComponent(clientId)}`, { method: "POST", headers: agentHeaders(token, { "content-type": "application/json" }), body: JSON.stringify(body) });
}

async function fetchAgentJson<T>(endpoint: string, path: string, init?: RequestInit) {
    const res = await fetch(`${endpoint}${path}`, init);
    const data = (await res.json().catch(() => ({}))) as T & { error?: string; msg?: string };
    if (!res.ok) throw new AgentApiError(res.status, data);
    return data;
}
