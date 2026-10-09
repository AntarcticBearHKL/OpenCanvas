import { nanoid } from "nanoid";
import { create } from "zustand";
import { persist, type PersistStorage, type StorageValue } from "zustand/middleware";

import { localForageStorage } from "@/lib/localforage-storage";

export type RuntimeLogLevel = "info" | "warn" | "error";
export type RuntimeLogCategory = "generation" | "canvas" | "agent" | "system";
export type RuntimeLogEntry = { id: string; at: number; level: RuntimeLogLevel; category: RuntimeLogCategory; action: string; message: string; detail?: string };

type RuntimeLogInput = { level?: RuntimeLogLevel; category: RuntimeLogCategory; action: string; message: string; detail?: string };

type RuntimeLogStore = {
    records: RuntimeLogEntry[];
    append: (input: RuntimeLogInput) => string;
    clear: () => void;
};

export const RUNTIME_LOG_LIMIT = 500;

const RUNTIME_LOG_STORE_KEY = "open-canvas:runtime_log_store";

const logStorage: PersistStorage<RuntimeLogStore> = {
    getItem: async (name) => {
        const value = await localForageStorage.getItem(name);
        return value ? (JSON.parse(value) as StorageValue<RuntimeLogStore>) : null;
    },
    setItem: (name, value) => localForageStorage.setItem(name, JSON.stringify(value)),
    removeItem: (name) => localForageStorage.removeItem(name),
};

export const useRuntimeLogStore = create<RuntimeLogStore>()(
    persist(
        (set) => ({
            records: [],
            append: (input) => {
                const id = nanoid();
                const entry: RuntimeLogEntry = { id, at: Date.now(), level: input.level || "info", category: input.category, action: input.action, message: input.message, detail: input.detail };
                set((state) => ({ records: [entry, ...state.records].slice(0, RUNTIME_LOG_LIMIT) }));
                return id;
            },
            clear: () => set({ records: [] }),
        }),
        {
            name: RUNTIME_LOG_STORE_KEY,
            storage: logStorage,
            partialize: (state) => ({ records: state.records }) as StorageValue<RuntimeLogStore>["state"],
        },
    ),
);
