import { create } from "zustand";
import { persist, type PersistStorage, type StorageValue } from "zustand/middleware";

import { nanoid } from "nanoid";
import { localForageStorage } from "@/lib/localforage-storage";
import { DEFAULT_AGENT_PERMISSIONS, mergeAgentPermissions, type AgentPermissionPolicy } from "@/lib/agent/agent-permissions";
import type { AgentOp } from "@/lib/agent/agent-ops";
import { recordRuntimeLog, truncateLogText } from "@/lib/runtime-log";

export type AgentAuditEntry = { id: string; at: number; page: string; ops: AgentOp[]; blocked: number; replayedFrom?: string };

type AgentAuditInput = { ops: AgentOp[]; blocked: number; page?: string; replayedFrom?: string };

const AGENT_AUDIT_LIMIT = 100;

type AgentAuditStore = {
    records: AgentAuditEntry[];
    permissions: AgentPermissionPolicy;
    mcpEnabled: boolean;
    append: (input: AgentAuditInput) => string;
    clear: () => void;
    setPermission: (key: string, allowed: boolean) => void;
    setMcpEnabled: (enabled: boolean) => void;
    resetPermissions: () => void;
};

const AGENT_AUDIT_STORE_KEY = "open-canvas:agent_audit_store";

const auditStorage: PersistStorage<AgentAuditStore> = {
    getItem: async (name) => {
        const value = await localForageStorage.getItem(name);
        return value ? (JSON.parse(value) as StorageValue<AgentAuditStore>) : null;
    },
    setItem: (name, value) => localForageStorage.setItem(name, JSON.stringify(value)),
    removeItem: (name) => localForageStorage.removeItem(name),
};

export const useAgentAuditStore = create<AgentAuditStore>()(
    persist(
        (set) => ({
            records: [],
            permissions: DEFAULT_AGENT_PERMISSIONS,
            mcpEnabled: false,
            append: (input) => {
                const id = nanoid();
                const entry: AgentAuditEntry = { id, at: Date.now(), page: input.page || "", ops: input.ops, blocked: input.blocked, replayedFrom: input.replayedFrom };
                set((state) => ({ records: [entry, ...state.records].slice(0, AGENT_AUDIT_LIMIT) }));
                return id;
            },
            clear: () => set({ records: [] }),
            setPermission: (key, allowed) => set((state) => ({ permissions: { ...state.permissions, [key]: allowed } })),
            setMcpEnabled: (enabled) => set({ mcpEnabled: enabled }),
            resetPermissions: () => set({ permissions: DEFAULT_AGENT_PERMISSIONS }),
        }),
        {
            name: AGENT_AUDIT_STORE_KEY,
            storage: auditStorage,
            partialize: (state) => ({ records: state.records, permissions: state.permissions, mcpEnabled: state.mcpEnabled }) as StorageValue<AgentAuditStore>["state"],
            merge: (persisted, current) => {
                const persistedState = (persisted || {}) as Partial<AgentAuditStore>;
                return { ...current, records: persistedState.records || [], permissions: mergeAgentPermissions(persistedState.permissions), mcpEnabled: persistedState.mcpEnabled === true };
            },
        },
    ),
);

export function recordAgentAudit(input: AgentAuditInput) {
    const id = useAgentAuditStore.getState().append(input);
    const firstOp = input.ops[0];
    recordRuntimeLog({
        category: "agent",
        action: firstOp ? `${firstOp.ns}.${firstOp.type}` : "agent.blocked",
        message: `${input.ops.length} op${input.ops.length === 1 ? "" : "s"}${input.blocked ? ` · ${input.blocked} blocked` : ""}`,
        detail: truncateLogText({ page: input.page, blocked: input.blocked, replayedFrom: input.replayedFrom, ops: input.ops.map((op) => `${op.ns}.${op.type}`) }),
    });
    return id;
}
