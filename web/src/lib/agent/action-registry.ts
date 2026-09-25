import type { AgentActionNamespace, AgentOp } from "@/lib/agent/agent-ops";
import { filterPermittedOps } from "@/lib/agent/agent-permissions";
import { recordAgentAudit, useAgentAuditStore } from "@/stores/use-agent-audit-store";
import { useAgentStore } from "@/stores/use-agent-store";

// One registered action namespace contributed by a page. `schema` is a JSON Schema
// discriminated union on `type`; permissions are enforced centrally in applyAgentOps.
export type AgentNamespaceRegistration = {
    ns: string;
    title: string;
    description: string;
    ops: string[];
    danger?: boolean;
    schema: Record<string, unknown>;
    applyOps: (ops: AgentOp[]) => Record<string, unknown> | void;
};

export type AgentApplyResult = {
    applied: number;
    blocked: number;
    errors: { index: number; error: string }[];
    state?: Record<string, unknown>;
};

const registry = new Map<string, AgentNamespaceRegistration>();
const listeners = new Set<() => void>();

function notify() {
    listeners.forEach((listener) => listener());
}

export function registerAgentNamespace(reg: AgentNamespaceRegistration) {
    registry.set(reg.ns, reg);
    notify();
    return () => {
        if (registry.get(reg.ns) !== reg) return;
        registry.delete(reg.ns);
        notify();
    };
}

export function getAgentActions(): AgentActionNamespace[] {
    return Array.from(registry.values()).map(({ ns, title, description, ops, danger }) => ({ ns, title, description, ops, ...(danger ? { danger } : {}) }));
}

export function getAgentSchema(ns: string): Record<string, unknown> | null {
    return registry.get(ns)?.schema ?? null;
}

export function subscribeAgentActions(listener: () => void) {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
}

function resolveNamespace(ns: string) {
    return registry.get(ns);
}

export function applyAgentOps(ops: AgentOp[]): AgentApplyResult {
    return applyOpsInternal(Array.isArray(ops) ? ops : []);
}

function applyOpsInternal(ops: AgentOp[], replayedFrom?: string): AgentApplyResult {
    const policy = useAgentAuditStore.getState().permissions;
    const errors: { index: number; error: string }[] = [];
    const known: { op: AgentOp; index: number }[] = [];
    ops.forEach((op, index) => {
        if (!op || typeof op.ns !== "string" || !op.ns) {
            errors.push({ index, error: "操作缺少命名空间 ns" });
            return;
        }
        if (!resolveNamespace(op.ns)) {
            errors.push({ index, error: `未知的命名空间：${op.ns}` });
            return;
        }
        known.push({ op, index });
    });

    const { permitted, blocked } = filterPermittedOps(
        known.map((item) => item.op),
        policy,
        resolveNamespace,
    );
    const indexByOp = new Map(known.map((item) => [item.op, item.index]));

    const groups = new Map<string, { ops: AgentOp[]; firstIndex: number }>();
    permitted.forEach((op) => {
        const group = groups.get(op.ns);
        if (group) group.ops.push(op);
        else groups.set(op.ns, { ops: [op], firstIndex: indexByOp.get(op) ?? 0 });
    });

    let state: Record<string, unknown> | undefined;
    groups.forEach((group, ns) => {
        const reg = resolveNamespace(ns);
        if (!reg) return;
        try {
            const result = reg.applyOps(group.ops);
            if (result) state = result;
        } catch (error) {
            errors.push({ index: group.firstIndex, error: error instanceof Error ? error.message : String(error) });
        }
    });

    if (permitted.length || blocked.length) {
        recordAgentAudit({ ops: permitted, blocked: blocked.length, page: useAgentStore.getState().pageContext?.page || "", replayedFrom });
    }
    return { applied: permitted.length, blocked: blocked.length, errors, ...(state ? { state } : {}) };
}

export function replayAgentEntry(id: string): boolean {
    const entry = useAgentAuditStore.getState().records.find((record) => record.id === id);
    if (!entry || !entry.ops.length) return false;
    applyOpsInternal(entry.ops, id);
    return true;
}
