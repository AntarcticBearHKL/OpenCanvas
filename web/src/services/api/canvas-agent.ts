import i18n from "@/i18n";
import type { AgentPageSnapshot } from "@/lib/agent/agent-ops";

class AgentApiError<T = unknown> extends Error {
    constructor(readonly status: number, readonly response: T & { code?: string; error?: string; msg?: string }) {
        super(response.error || response.msg || i18n.t("agent.state.requestFailed"));
        this.name = "AgentApiError";
    }
}

export type AgentStateCatalog = { projectIds: string[]; openProjectId: string | null };

export async function postState(endpoint: string, clientId: string, snapshot: AgentPageSnapshot | null, catalog?: AgentStateCatalog) {
    try {
        const body = { ...(snapshot ?? { hasCanvas: false }), ...(catalog || {}) };
        const response = await fetch(`${endpoint}/canvas/state?clientId=${encodeURIComponent(clientId)}`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(body),
        });
        return response.ok;
    } catch {
        return false;
    }
}

export async function postToolResult(endpoint: string, clientId: string, body: { requestId: string; result?: unknown; error?: string }) {
    await fetchAgentJson(endpoint, `/canvas/result?clientId=${encodeURIComponent(clientId)}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
}

async function fetchAgentJson<T>(endpoint: string, path: string, init?: RequestInit) {
    const res = await fetch(`${endpoint}${path}`, init);
    const data = (await res.json().catch(() => ({}))) as T & { error?: string; msg?: string };
    if (!res.ok) throw new AgentApiError(res.status, data);
    return data;
}

export type AgentClientInfo = { clientId: string; page?: string; title?: string; active: boolean; bound: boolean };
type AgentBindings = { ok: boolean; boundClientId: string; clients: AgentClientInfo[] };

export async function bindAgentClient(endpoint: string, clientId: string) {
    return fetchAgentJson<AgentBindings>(endpoint, `/canvas/bind?clientId=${encodeURIComponent(clientId)}`, { method: "POST" });
}

export async function releaseAgentClient(endpoint: string, clientId: string) {
    return fetchAgentJson<AgentBindings>(endpoint, `/canvas/release?clientId=${encodeURIComponent(clientId)}`, { method: "POST" });
}

export async function fetchAgentClients(endpoint: string) {
    return fetchAgentJson<AgentBindings>(endpoint, "/clients", { method: "GET" });
}
