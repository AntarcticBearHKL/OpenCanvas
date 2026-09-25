import type { AgentActionNamespace, AgentOp } from "@/lib/agent/agent-ops";

// Policy keys are "ns:type" (exact), "ns:*" (whole namespace) or "*" (global default).
export type AgentPermissionPolicy = Record<string, boolean>;

export const DEFAULT_AGENT_PERMISSIONS: AgentPermissionPolicy = {
    "*": true,
    "config:*": false,
    "config:set_provider_key": false,
    "config:reveal_key": false,
};

/** Resolution order: exact -> "ns:*" -> danger default-deny -> "*" -> allowed. */
export function isAgentOpPermitted(op: AgentOp, policy: AgentPermissionPolicy, nsMeta?: AgentActionNamespace): boolean {
    const exact = `${op.ns}:${op.type}`;
    if (typeof policy[exact] === "boolean") return policy[exact];
    const namespaceWide = `${op.ns}:*`;
    if (typeof policy[namespaceWide] === "boolean") return policy[namespaceWide];
    if (nsMeta?.danger) return false;
    return policy["*"] ?? true;
}

export function filterPermittedOps(
    ops: AgentOp[] | undefined,
    policy: AgentPermissionPolicy,
    resolveNamespace?: (ns: string) => AgentActionNamespace | undefined,
): { permitted: AgentOp[]; blocked: AgentOp[] } {
    const permitted: AgentOp[] = [];
    const blocked: AgentOp[] = [];
    (Array.isArray(ops) ? ops : []).forEach((op) => {
        if (isAgentOpPermitted(op, policy, resolveNamespace?.(op.ns))) permitted.push(op);
        else blocked.push(op);
    });
    return { permitted, blocked };
}

export function describeAgentOp(op: AgentOp): string {
    const head = `${op.ns}:${op.type}`;
    const text = (value: unknown) => (typeof value === "string" ? value : "");
    const list = (value: unknown) => (Array.isArray(value) ? value.filter((item): item is string => typeof item === "string").join(",") : "");
    if (op.type === "add_node") return `${head} ${text(op.id) || text(op.nodeType) || "node"}`;
    if (op.type === "update_node") return `${head} ${text(op.id)}`;
    if (op.type === "delete_node") return `${head} ${list(op.ids) || text(op.id) || text(op.nodeType) || "all"}`;
    if (op.type === "delete_connections") return `${head} ${op.all ? "all" : list(op.ids) || text(op.id) || "none"}`;
    if (op.type === "connect_nodes") return `${head} ${text(op.fromNodeId)}->${text(op.toNodeId)}`;
    if (op.type === "select_nodes") return `${head} ${list(op.ids)}`;
    if (op.type === "run_generation") return `${head} ${text(op.nodeId)} ${text(op.mode) || "image"}`;
    if (op.type === "arrange_board") return `${head} ${text(op.id)}`;
    if (op.type === "place_on_board") return `${head} ${text(op.nodeId)}`;
    return head;
}

export function mergeAgentPermissions(persisted: Partial<AgentPermissionPolicy> | undefined): AgentPermissionPolicy {
    const merged: AgentPermissionPolicy = { ...DEFAULT_AGENT_PERMISSIONS };
    Object.entries(persisted || {}).forEach(([key, value]) => {
        if (typeof value === "boolean") merged[key] = value;
    });
    return merged;
}
