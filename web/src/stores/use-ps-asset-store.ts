import { create } from "zustand";
import { persist, type PersistStorage, type StorageValue } from "zustand/middleware";

import { nanoid } from "nanoid";
import i18n from "@/i18n";
import { localForageStorage } from "@/lib/localforage-storage";

export type PsGradientStopPreset = { color: string; position: number; midpoint: number };
export type PsGradientPreset = { id: string; name: string; stops: PsGradientStopPreset[] };
export type PsPatternPreset = { id: string; name: string; storageKey: string; width: number; height: number };
export type PsBrushPreset = { id: string; name: string; size: number; hardness: number; opacity: number; spacing: number; scatter: number; angle: number; roundness: number; dynamics: number; texture: number };
export type PsActionStep =
    | { kind: "menu"; command: string }
    | { kind: "layer"; command: string }
    | { kind: "adjustment"; adjustment: string }
    | { kind: "filter"; filter: string; params: Record<string, number | string> }
    | { kind: "transform"; params: { dx: number; dy: number; scaleX: number; scaleY: number; rotation: number; skewX: number; skewY: number } };
export type PsAction = { id: string; name: string; steps: PsActionStep[]; createdAt: string };

export type PsAssetStore = {
    hydrated: boolean;
    swatches: string[];
    gradients: PsGradientPreset[];
    patterns: PsPatternPreset[];
    brushes: PsBrushPreset[];
    actions: PsAction[];
    addSwatch: (color: string) => void;
    removeSwatch: (index: number) => void;
    saveGradient: (preset: { id?: string; name: string; stops: PsGradientStopPreset[] }) => string;
    removeGradient: (id: string) => void;
    addPattern: (preset: Omit<PsPatternPreset, "id">) => string;
    removePattern: (id: string) => void;
    saveBrush: (preset: { id?: string } & Omit<PsBrushPreset, "id">) => string;
    removeBrush: (id: string) => void;
    saveAction: (action: { id?: string; name: string; steps: PsActionStep[] }) => string;
    renameAction: (id: string, name: string) => void;
    removeAction: (id: string) => void;
};

const PS_ASSET_STORE_KEY = "infinite-canvas:ps_asset_store";

const DEFAULT_SWATCHES = ["#000000", "#ffffff", "#ff0000", "#ff7f00", "#ffff00", "#00ff00", "#00ffff", "#0000ff", "#7f00ff", "#ff00ff", "#7f7f7f", "#c0c0c0"];
const DEFAULT_BRUSHES: Omit<PsBrushPreset, "id">[] = [
    { name: "canvas.ps.brushHardRound", size: 24, hardness: 1, opacity: 1, spacing: 0.15, scatter: 0, angle: 0, roundness: 1, dynamics: 0, texture: 0 },
    { name: "canvas.ps.brushSoftRound", size: 60, hardness: 0.25, opacity: 0.9, spacing: 0.12, scatter: 0, angle: 0, roundness: 1, dynamics: 0, texture: 0 },
    { name: "canvas.ps.brushCalligraphy", size: 32, hardness: 0.8, opacity: 1, spacing: 0.08, scatter: 0, angle: 45, roundness: 0.25, dynamics: 0, texture: 0 },
    { name: "canvas.ps.brushSpray", size: 48, hardness: 0.4, opacity: 0.6, spacing: 0.25, scatter: 0.6, angle: 0, roundness: 1, dynamics: 0.4, texture: 0.5 },
];
const DEFAULT_GRADIENTS: Omit<PsGradientPreset, "id">[] = [
    { name: "canvas.ps.gradientBlackWhite", stops: [{ color: "#000000", position: 0, midpoint: 0.5 }, { color: "#ffffff", position: 1, midpoint: 0.5 }] },
    { name: "canvas.ps.gradientRainbow", stops: [{ color: "#ff0000", position: 0, midpoint: 0.5 }, { color: "#ffff00", position: 0.33, midpoint: 0.5 }, { color: "#00ff00", position: 0.66, midpoint: 0.5 }, { color: "#0000ff", position: 1, midpoint: 0.5 }] },
    { name: "canvas.ps.gradientSunset", stops: [{ color: "#2b1055", position: 0, midpoint: 0.4 }, { color: "#ff6b6b", position: 0.55, midpoint: 0.5 }, { color: "#ffd93d", position: 1, midpoint: 0.5 }] },
    { name: "canvas.ps.gradientSteel", stops: [{ color: "#0f2027", position: 0, midpoint: 0.5 }, { color: "#2c5364", position: 0.5, midpoint: 0.5 }, { color: "#a8c0cc", position: 1, midpoint: 0.5 }] },
];

const psAssetStorage: PersistStorage<PsAssetStore> = {
    getItem: async (name) => {
        const value = await localForageStorage.getItem(name);
        return value ? (JSON.parse(value) as StorageValue<PsAssetStore>) : null;
    },
    setItem: (name, value) => localForageStorage.setItem(name, JSON.stringify(value)),
    removeItem: (name) => localForageStorage.removeItem(name),
};

function psSeed<T extends { id: string }>(items: T[] | undefined, defaults: Omit<T, "id">[]): T[] {
    if (items?.length) return items;
    return defaults.map((item) => ({ ...item, id: nanoid() }) as T);
}

function psMixColor(from: string, to: string, ratio: number) {
    const parse = (color: string) => {
        const value = /^#[0-9a-f]{6}$/i.test(color) ? color.slice(1) : "000000";
        return [parseInt(value.slice(0, 2), 16), parseInt(value.slice(2, 4), 16), parseInt(value.slice(4, 6), 16)];
    };
    const [r1, g1, b1] = parse(from);
    const [r2, g2, b2] = parse(to);
    const channel = (a: number, b: number) => Math.round(a + (b - a) * ratio).toString(16).padStart(2, "0");
    return `#${channel(r1, r2)}${channel(g1, g2)}${channel(b1, b2)}`;
}

/** Midpoints become real stops here, so the fill, the gradient tool and Gradient Overlay all keep taking plain stops. */
export function psExpandGradientStops(stops: PsGradientStopPreset[]) {
    const sorted = [...stops].sort((a, b) => a.position - b.position);
    const expanded: { color: string; position: number }[] = [];
    sorted.forEach((stop, index) => {
        expanded.push({ color: stop.color, position: stop.position });
        const next = sorted[index + 1];
        const midpoint = stop.midpoint ?? 0.5;
        if (next && midpoint > 0 && midpoint < 1 && next.position > stop.position) expanded.push({ color: psMixColor(stop.color, next.color, midpoint), position: stop.position + (next.position - stop.position) * midpoint });
    });
    return expanded;
}

/** Called by the shared image cleanup so pattern bitmaps in this store are never swept as unused. */
export function psPatternCleanupExtra() {
    return { psPatterns: usePsAssetStore.getState().patterns };
}

export const usePsAssetStore = create<PsAssetStore>()(
    persist(
        (set, get) => ({
            hydrated: false,
            swatches: DEFAULT_SWATCHES,
            gradients: DEFAULT_GRADIENTS.map((item) => ({ ...item, id: nanoid() })),
            patterns: [],
            brushes: DEFAULT_BRUSHES.map((item) => ({ ...item, id: nanoid() })),
            actions: [],
            addSwatch: (color) =>
                set((state) => {
                    const value = color.toLowerCase();
                    if (state.swatches.includes(value)) return state;
                    return { swatches: [value, ...state.swatches].slice(0, 120) };
                }),
            removeSwatch: (index) => set((state) => ({ swatches: state.swatches.filter((_, item) => item !== index) })),
            saveGradient: (preset) => {
                const id = preset.id ?? nanoid();
                set((state) => {
                    const entry: PsGradientPreset = { id, name: preset.name, stops: preset.stops };
                    return { gradients: state.gradients.some((item) => item.id === id) ? state.gradients.map((item) => (item.id === id ? entry : item)) : [...state.gradients, entry] };
                });
                return id;
            },
            removeGradient: (id) => set((state) => ({ gradients: state.gradients.filter((item) => item.id !== id) })),
            addPattern: (preset) => {
                const id = nanoid();
                set((state) => ({ patterns: [{ ...preset, id }, ...state.patterns] }));
                return id;
            },
            removePattern: (id) => set((state) => ({ patterns: state.patterns.filter((item) => item.id !== id) })),
            saveBrush: (preset) => {
                const id = preset.id ?? nanoid();
                const entry: PsBrushPreset = {
                    id,
                    name: preset.name,
                    size: preset.size,
                    hardness: preset.hardness,
                    opacity: preset.opacity,
                    spacing: preset.spacing,
                    scatter: preset.scatter,
                    angle: preset.angle,
                    roundness: preset.roundness,
                    dynamics: preset.dynamics,
                    texture: preset.texture,
                };
                set((state) => ({ brushes: state.brushes.some((item) => item.id === id) ? state.brushes.map((item) => (item.id === id ? entry : item)) : [...state.brushes, entry] }));
                return id;
            },
            removeBrush: (id) => set((state) => ({ brushes: state.brushes.filter((item) => item.id !== id) })),
            saveAction: (action) => {
                const id = action.id ?? nanoid();
                set((state) => {
                    const entry: PsAction = { id, name: action.name, steps: action.steps, createdAt: new Date().toISOString() };
                    return { actions: state.actions.some((item) => item.id === id) ? state.actions.map((item) => (item.id === id ? { ...item, name: action.name, steps: action.steps } : item)) : [entry, ...state.actions] };
                });
                return id;
            },
            renameAction: (id, name) => set((state) => ({ actions: state.actions.map((item) => (item.id === id ? { ...item, name: name.trim() || item.name } : item)) })),
            removeAction: (id) => set((state) => ({ actions: state.actions.filter((item) => item.id !== id) })),
        }),
        {
            name: PS_ASSET_STORE_KEY,
            storage: psAssetStorage,
            partialize: (state) => ({ swatches: state.swatches, gradients: state.gradients, patterns: state.patterns, brushes: state.brushes, actions: state.actions }) as StorageValue<PsAssetStore>["state"],
            merge: (persisted, current) => {
                const saved = persisted as Partial<PsAssetStore> | undefined;
                return {
                    ...current,
                    ...saved,
                    swatches: saved?.swatches?.length ? saved.swatches : DEFAULT_SWATCHES,
                    gradients: psSeed(saved?.gradients, DEFAULT_GRADIENTS),
                    brushes: psSeed(saved?.brushes, DEFAULT_BRUSHES),
                    patterns: saved?.patterns ?? [],
                    actions: saved?.actions ?? [],
                };
            },
            onRehydrateStorage: () => () => {
                usePsAssetStore.setState({ hydrated: true });
            },
        },
    ),
);

export const PS_BRUSH_DEFAULT: Omit<PsBrushPreset, "id" | "name"> = { size: 24, hardness: 0.8, opacity: 1, spacing: 0.15, scatter: 0, angle: 0, roundness: 1, dynamics: 0, texture: 0 };

export function psBrushPresetName(preset: PsBrushPreset) {
    return preset.name.startsWith("canvas.") ? i18n.t(preset.name) : preset.name;
}

export function psGradientPresetName(preset: PsGradientPreset) {
    return preset.name.startsWith("canvas.") ? i18n.t(preset.name) : preset.name;
}
