import { defaultParams, PARAM_SLOTS } from "./registry";

export { PARAM_SLOTS };
export { defaultParams };

export type BlendMode = "normal" | "add" | "multiply" | "screen" | "mask";
export const BLEND_MODES: BlendMode[] = ["normal", "add", "multiply", "screen", "mask"];
/** Shader u_blendMode: 0 Normal, 1 Add, 2 Multiply, 3 Screen, 4 Mask. */
export const BLEND_MODE_ID: Record<BlendMode, number> = { normal: 0, add: 1, multiply: 2, screen: 3, mask: 4 };

export type Resolution = 64 | 128 | 256 | 512 | 1024 | 2048;
export const RESOLUTIONS: Resolution[] = [64, 128, 256, 512, 1024, 2048];

export type RGB = [number, number, number];

export interface GradientStop {
    position: number;
    color: string; // "#rrggbb"
}

export interface LayerState {
    id: number;
    name: string;
    type: string;
    blendMode: BlendMode;
    opacity: number;
    polarConversion: boolean;
    invertEnable: boolean;
    visible: boolean;
    /** u_params[16]. */
    typeParams: number[];
    offsetX: number;
    offsetY: number;
    scaleX: number;
    scaleY: number;
    /** degrees */
    rotation: number;
    scrollX: number;
    scrollY: number;
    gradEnable: boolean;
    gradStops: GradientStop[];
    solidColorEnabled: boolean;
    solidColor: RGB;
}

export interface PostEffects {
    blurEnabled: boolean;
    blurStrength: number;
    sharpenEnabled: boolean;
    sharpenStrength: number;
    pixelationEnabled: boolean;
    pixelSize: number;
    chromaticAberrationEnabled: boolean;
    chromaticAberration: number;
    vignetteEnabled: boolean;
    vignetteStrength: number;
    vignetteSize: number;
    vignetteColor: RGB;
    scanlineEnabled: boolean;
    scanlineDensity: number;
    scanlineSpeed: number;
    scanlineStrength: number;
    scanlineColor: RGB;
    kaleidoscopeEnabled: boolean;
    kaleidoSegments: number;
    kaleidoRotation: number;
    mirrorTileEnabled: boolean;
    mirrorTileX: boolean;
    mirrorTileY: boolean;
    swirlEnabled: boolean;
    swirlStrength: number;
    swirlRadius: number;
    edgeDetectionEnabled: boolean;
    edgeThickness: number;
    edgeColor: RGB;
    toonEnabled: boolean;
    toonDark: number;
    toonLight: number;
    vignetteMaskEnabled: boolean;
    bloomEnabled: boolean;
    bloomStrength: number;
    colorEnabled: boolean;
    colorShadow: RGB;
    colorMidtone: RGB;
    colorHighlight: RGB;
}

export interface EditorState {
    resolution: Resolution;
    time: number;
    animate: boolean;
    animSpeed: number;
    checkerboard: boolean;
    blackBackground: boolean;
    gifFps: number;
    gifDuration: number;
    gifSeamless: boolean;
    postEffects: PostEffects;
    activeLayerId: number;
    layerCounter: number;
    layers: LayerState[];
}

export const DEFAULT_GRADIENT_STOPS: GradientStop[] = [
    { position: 0, color: "#000000" },
    { position: 1, color: "#ffffff" },
];

export const DEFAULT_POST_EFFECTS: PostEffects = {
    blurEnabled: false,
    blurStrength: 1,
    sharpenEnabled: false,
    sharpenStrength: 1,
    pixelationEnabled: false,
    pixelSize: 10,
    chromaticAberrationEnabled: false,
    chromaticAberration: 0.01,
    vignetteEnabled: false,
    vignetteStrength: 0.5,
    vignetteSize: 0.5,
    vignetteColor: [0, 0, 0],
    scanlineEnabled: false,
    scanlineDensity: 100,
    scanlineSpeed: 1,
    scanlineStrength: 0.5,
    scanlineColor: [0, 0, 0],
    kaleidoscopeEnabled: false,
    kaleidoSegments: 6,
    kaleidoRotation: 0,
    mirrorTileEnabled: false,
    mirrorTileX: true,
    mirrorTileY: true,
    swirlEnabled: false,
    swirlStrength: 3,
    swirlRadius: 0.5,
    edgeDetectionEnabled: false,
    edgeThickness: 1,
    edgeColor: [0, 1, 0],
    toonEnabled: false,
    toonDark: 4,
    toonLight: 4,
    vignetteMaskEnabled: false,
    bloomEnabled: false,
    bloomStrength: 1,
    colorEnabled: false,
    colorShadow: [0, 0, 0],
    colorMidtone: [0.5, 0.5, 0.5],
    colorHighlight: [1, 1, 1],
};

export function createDefaultLayer(id = 1, type = "Circle"): LayerState {
    return {
        id,
        name: `Layer ${id}`,
        type,
        blendMode: "normal",
        opacity: 1,
        polarConversion: false,
        invertEnable: false,
        visible: true,
        typeParams: defaultParams(type),
        offsetX: 0,
        offsetY: 0,
        scaleX: 1,
        scaleY: 1,
        rotation: 0,
        scrollX: 0,
        scrollY: 0,
        gradEnable: false,
        gradStops: DEFAULT_GRADIENT_STOPS.map((s) => ({ ...s })),
        solidColorEnabled: false,
        solidColor: [1, 1, 1],
    };
}

export function createDefaultState(): EditorState {
    return {
        resolution: 512,
        time: 0,
        animate: false,
        animSpeed: 1,
        checkerboard: true,
        blackBackground: false,
        gifFps: 30,
        gifDuration: 2,
        gifSeamless: false,
        postEffects: { ...DEFAULT_POST_EFFECTS },
        activeLayerId: 1,
        layerCounter: 1,
        layers: [createDefaultLayer(1, "Circle")],
    };
}

// ---------- channel packing ----------

export const CHANNEL_SOURCES = [
    "baseR",
    "baseG",
    "baseB",
    "baseA",
    "baseLuma",
    "normalX",
    "normalY",
    "normalZ",
    "black",
    "white",
] as const;
export type ChannelSource = (typeof CHANNEL_SOURCES)[number];

export interface ChannelConfig {
    r: ChannelSource;
    g: ChannelSource;
    b: ChannelSource;
    a: ChannelSource;
}

export const CHANNEL_PRESETS: Record<string, ChannelConfig> = {
    base: { r: "baseR", g: "baseG", b: "baseB", a: "baseA" },
    normal_xy: { r: "normalX", g: "normalY", b: "black", a: "baseA" },
    normal_xyz: { r: "normalX", g: "normalY", b: "normalZ", a: "baseA" },
    luma_alpha: { r: "baseLuma", g: "baseLuma", b: "baseLuma", a: "baseA" },
};
