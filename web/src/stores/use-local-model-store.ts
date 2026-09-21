import { create } from "zustand";

import { createCanvasContext } from "@/lib/canvas/canvas-2d";
import { removeImageBackground } from "@/services/background-removal";

type LocalModelId = "background-removal" | "mobile-sam";

type LocalModelStatus = "idle" | "downloading" | "ready" | "error";

export type LocalModelDescriptor = {
    id: LocalModelId;
    titleKey: string;
    descriptionKey: string;
    prepare: (force?: boolean) => Promise<boolean>;
    clear: () => void;
    read: () => { status: LocalModelStatus; percent: number };
};

type LocalModelState = { status: LocalModelStatus; percent: number };

type LocalModelStore = {
    models: Record<LocalModelId, LocalModelState>;
    prepareModel: (id: LocalModelId, force?: boolean) => Promise<boolean>;
    clearModel: (id: LocalModelId) => void;
};

const READY_KEYS: Record<LocalModelId, string> = {
    "background-removal": "canvas-bg-removal-ready",
    "mobile-sam": "canvas-mobile-sam-ready",
};

const warmUps: Record<LocalModelId, (onProgress: (percent: number) => void) => Promise<void>> = {
    "background-removal": warmUpBackgroundRemoval,
    "mobile-sam": (onProgress) => import("@/lib/image/mobile-sam").then((module) => module.loadMobileSam(onProgress)),
};

const resets: Record<LocalModelId, () => void> = {
    "background-removal": () => {},
    "mobile-sam": () => void import("@/lib/image/mobile-sam").then((module) => module.resetMobileSam()),
};

const preparing = new Map<LocalModelId, Promise<boolean>>();

function initialState(id: LocalModelId): LocalModelState {
    if (typeof window === "undefined" || localStorage.getItem(READY_KEYS[id]) !== "1") return { status: "idle", percent: 0 };
    return { status: "ready", percent: 100 };
}

async function warmUpBackgroundRemoval(onProgress: (percent: number) => void) {
    const { canvas, context } = createCanvasContext(64, 64);
    if (!context) throw new Error("Canvas 2D context is unavailable");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, 64, 64);
    context.fillStyle = "#111111";
    context.beginPath();
    context.arc(32, 32, 18, 0, Math.PI * 2);
    context.fill();
    await removeImageBackground(canvas.toDataURL(), (_key, current, total) => {
        if (total > 0) onProgress(Math.round((current / total) * 100));
    });
}

export const useLocalModelStore = create<LocalModelStore>((set, get) => ({
    models: { "background-removal": initialState("background-removal"), "mobile-sam": initialState("mobile-sam") },
    prepareModel: (id, force?: boolean) => {
        if (!force && get().models[id].status === "ready") return Promise.resolve(true);
        const active = preparing.get(id);
        if (active) return active;
        let percent = 0;
        const update = (status: LocalModelStatus, next: number) => set((state) => ({ models: { ...state.models, [id]: { status, percent: next } } }));
        update("downloading", percent);
        const task = warmUps[id]((next) => {
            percent = Math.max(percent, next);
            update("downloading", percent);
        })
            .then(() => {
                localStorage.setItem(READY_KEYS[id], "1");
                update("ready", 100);
                return true;
            })
            .catch(() => {
                update("error", percent);
                return false;
            })
            .finally(() => {
                preparing.delete(id);
            });
        preparing.set(id, task);
        return task;
    },
    clearModel: (id) => {
        localStorage.removeItem(READY_KEYS[id]);
        resets[id]();
        set((state) => ({ models: { ...state.models, [id]: { status: "idle", percent: 0 } } }));
    },
}));

export function listLocalModels(): LocalModelDescriptor[] {
    return [
        {
            id: "background-removal",
            titleKey: "config.localModels.backgroundRemoval",
            descriptionKey: "config.localModels.backgroundRemovalDescription",
            prepare: (force) => useLocalModelStore.getState().prepareModel("background-removal", force),
            clear: () => useLocalModelStore.getState().clearModel("background-removal"),
            read: () => useLocalModelStore.getState().models["background-removal"],
        },
        {
            id: "mobile-sam",
            titleKey: "config.localModels.mobileSam",
            descriptionKey: "config.localModels.mobileSamDescription",
            prepare: (force) => useLocalModelStore.getState().prepareModel("mobile-sam", force),
            clear: () => useLocalModelStore.getState().clearModel("mobile-sam"),
            read: () => useLocalModelStore.getState().models["mobile-sam"],
        },
    ];
}
