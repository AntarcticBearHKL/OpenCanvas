type CanvasBlendMode = {
    id: string;
    canvas: GlobalCompositeOperation;
    css: string;
};

export const CANVAS_BLEND_MODES: CanvasBlendMode[] = [
    { id: "normal", canvas: "source-over", css: "normal" },
    { id: "multiply", canvas: "multiply", css: "multiply" },
    { id: "screen", canvas: "screen", css: "screen" },
    { id: "overlay", canvas: "overlay", css: "overlay" },
    { id: "darken", canvas: "darken", css: "darken" },
    { id: "lighten", canvas: "lighten", css: "lighten" },
    { id: "color-dodge", canvas: "color-dodge", css: "color-dodge" },
    { id: "color-burn", canvas: "color-burn", css: "color-burn" },
    { id: "hard-light", canvas: "hard-light", css: "hard-light" },
    { id: "soft-light", canvas: "soft-light", css: "soft-light" },
    { id: "difference", canvas: "difference", css: "difference" },
    { id: "exclusion", canvas: "exclusion", css: "exclusion" },
    { id: "hue", canvas: "hue", css: "hue" },
    { id: "saturation", canvas: "saturation", css: "saturation" },
    { id: "color", canvas: "color", css: "color" },
    { id: "luminosity", canvas: "luminosity", css: "luminosity" },
];

export const DEFAULT_BLEND_MODE = "normal";

export const LAYER_OPACITY_MIN = 0;
export const LAYER_OPACITY_MAX = 1;
export const LAYER_OPACITY_DEFAULT = 1;

export function clampLayerOpacity(value: number | undefined): number {
    if (typeof value !== "number" || !Number.isFinite(value)) return LAYER_OPACITY_DEFAULT;
    return Math.min(LAYER_OPACITY_MAX, Math.max(LAYER_OPACITY_MIN, Math.round(value * 100) / 100));
}

export function resolveBlendMode(id?: string) {
    return CANVAS_BLEND_MODES.find((mode) => mode.id === id) || CANVAS_BLEND_MODES[0];
}
