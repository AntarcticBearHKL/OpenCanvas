import localforage from "localforage";
import type { PersistStorage, StateStorage, StorageValue } from "zustand/middleware";

localforage.config({
    name: "open-canvas",
    storeName: "app_state",
});

export const localForageStorage: StateStorage = {
    getItem: async (name) => {
        if (typeof window === "undefined") return null;
        try {
            return (await localforage.getItem<string>(name)) || null;
        } catch {
            return window.localStorage.getItem(name);
        }
    },
    setItem: async (name, value) => {
        if (typeof window === "undefined") return;
        try {
            await localforage.setItem(name, value);
        } catch {
            window.localStorage.setItem(name, value);
        }
    },
    removeItem: async (name) => {
        if (typeof window === "undefined") return;
        try {
            await localforage.removeItem(name);
        } catch {
            window.localStorage.removeItem(name);
        }
    },
};

/** Debounced localforage persist storage shared by the project stores; skips writes when the watched fields are reference-equal. */
export function createDebouncedPersist<TState extends object>(watched: readonly (keyof TState)[], delayMs = 400): PersistStorage<TState> {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let queued: TState | null = null;
    return {
        getItem: async (name) => {
            const value = await localForageStorage.getItem(name);
            if (!value) return null;
            const parsed = JSON.parse(value) as StorageValue<TState>;
            queued = parsed.state as TState;
            return parsed;
        },
        setItem: (name, value) => {
            const next = value.state as TState;
            const prev = queued;
            if (prev && watched.every((key) => prev[key] === next[key])) return;
            queued = next;
            if (timer) clearTimeout(timer);
            timer = setTimeout(() => {
                timer = null;
                void localForageStorage.setItem(name, JSON.stringify(value));
            }, delayMs);
        },
        removeItem: (name) => localForageStorage.removeItem(name),
    };
}
