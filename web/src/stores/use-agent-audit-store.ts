import { create } from "zustand";
import { persist, type PersistStorage, type StorageValue } from "zustand/middleware";

import { nanoid } from "nanoid";
import { localForageStorage } from "@/lib/localforage-storage";
import { DEFAULT_AGENT_PERMISSIONS, mergeAgentPermissions, type AgentPermissionPolicy } from "@/lib/canvas/agent-permissions";
import type { CanvasAgentOp } from "@/lib/canvas/canvas-agent-ops";

export type AgentAuditEntry = { id: string; at: number; ops: CanvasAgentOp[]; blocked: number; replayedFrom?: string };

type AgentAuditInput = { ops: CanvasAgentOp[]; blocked: number; replayedFrom?: string };

const AGENT_AUDIT_LIMIT = 100;

type AgentAuditStore = {
    records: AgentAuditEntry[];
    permissions: AgentPermissionPolicy;
    append: (input: AgentAuditInput) => string;
    clear: () => void;
    setPermission: (type: CanvasAgentOp["type"], allowed: boolean) => void;
    resetPermissions: () => void;
};

const AGENT_AUDIT_STORE_KEY = "infinite-canvas:agent_audit_store";

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
            append: (input) => {
                const id = nanoid();
                const entry: AgentAuditEntry = { id, at: Date.now(), ops: input.ops, blocked: input.blocked, replayedFrom: input.replayedFrom };
                set((state) => ({ records: [entry, ...state.records].slice(0, AGENT_AUDIT_LIMIT) }));
                return id;
            },
            clear: () => set({ records: [] }),
            setPermission: (type, allowed) => set((state) => ({ permissions: { ...state.permissions, [type]: allowed } })),
            resetPermissions: () => set({ permissions: DEFAULT_AGENT_PERMISSIONS }),
        }),
        {
            name: AGENT_AUDIT_STORE_KEY,
            storage: auditStorage,
            partialize: (state) => ({ records: state.records, permissions: state.permissions }) as StorageValue<AgentAuditStore>["state"],
            merge: (persisted, current) => {
                const persistedState = (persisted || {}) as Partial<AgentAuditStore>;
                return { ...current, records: persistedState.records || [], permissions: mergeAgentPermissions(persistedState.permissions) };
            },
        },
    ),
);

export function recordAgentAudit(input: AgentAuditInput) {
    return useAgentAuditStore.getState().append(input);
}
