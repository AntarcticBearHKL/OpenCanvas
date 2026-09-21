import { create } from "zustand";

import {
    getBrowserCacheStatus,
    initBrowserCacheBridge,
    listBrowserCache,
    subscribeBrowserCacheStatus,
    type BrowserCacheItem,
    type BrowserCacheStatus,
} from "@/services/api/browser-cache";

type BrowserCacheStore = {
    status: BrowserCacheStatus;
    items: BrowserCacheItem[];
    refresh: () => Promise<void>;
    init: () => void;
};

let initialized = false;

export const useBrowserCacheStore = create<BrowserCacheStore>()((set, get) => ({
    status: getBrowserCacheStatus(),
    items: [],
    refresh: async () => {
        if (getBrowserCacheStatus() !== "ready") return;
        try {
            set({ items: await listBrowserCache() });
        } catch {
            set({ items: [] });
        }
    },
    init: () => {
        if (!initialized) {
            initialized = true;
            subscribeBrowserCacheStatus((status) => {
                set({ status });
                if (status === "ready") void get().refresh();
            });
        }
        set({ status: getBrowserCacheStatus() });
        initBrowserCacheBridge();
        void get().refresh();
    },
}));
