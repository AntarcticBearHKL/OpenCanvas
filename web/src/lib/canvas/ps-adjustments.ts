import type { CanvasPsAdjustmentType, CanvasPsParamValue } from "@/types/canvas";

export const PS_ADJUSTMENT_TYPES: CanvasPsAdjustmentType[] = ["brightness-contrast", "levels", "curves", "exposure", "vibrance", "hue-saturation", "color-balance", "black-white", "photo-filter", "channel-mixer", "gradient-map", "invert", "posterize", "threshold", "selective-color"];

export const PS_ADJUSTMENT_NAME_KEYS: Record<CanvasPsAdjustmentType, string> = {
    "brightness-contrast": "canvas.ps.adjust.brightnessContrast",
    levels: "canvas.ps.adjust.levels",
    curves: "canvas.ps.adjust.curves",
    exposure: "canvas.ps.adjust.exposure",
    vibrance: "canvas.ps.adjust.vibrance",
    "hue-saturation": "canvas.ps.adjust.hueSaturation",
    "color-balance": "canvas.ps.adjust.colorBalance",
    "black-white": "canvas.ps.adjust.blackWhite",
    "photo-filter": "canvas.ps.adjust.photoFilter",
    "channel-mixer": "canvas.ps.adjust.channelMixer",
    "gradient-map": "canvas.ps.adjust.gradientMap",
    invert: "canvas.ps.adjust.invert",
    posterize: "canvas.ps.adjust.posterize",
    threshold: "canvas.ps.adjust.threshold",
    "selective-color": "canvas.ps.adjust.selectiveColor",
};

export const PS_CURVE_IDENTITY: number[] = [0, 0, 255, 255];
export const PS_GRADIENT_MAP_DEFAULT: string[] = ["#000000@0", "#ffffff@1"];
export const PS_CHANNEL_MIXER_DEFAULT: number[] = [100, 0, 0, 0, 0, 100, 0, 0, 0, 0, 100, 0];

export const PS_ADJUSTMENT_DEFAULTS: Record<CanvasPsAdjustmentType, Record<string, CanvasPsParamValue>> = {
    "brightness-contrast": { brightness: 0, contrast: 0 },
    levels: { channel: "rgb", inBlack: 0, inWhite: 255, gamma: 1, outBlack: 0, outWhite: 255 },
    curves: { channel: "rgb", points: [...PS_CURVE_IDENTITY] },
    exposure: { exposure: 0, offset: 0, gamma: 1 },
    vibrance: { vibrance: 0, saturation: 0 },
    "hue-saturation": { channel: "master", hue: 0, saturation: 0, lightness: 0 },
    "color-balance": { tone: "midtones", shadows: [0, 0, 0], midtones: [0, 0, 0], highlights: [0, 0, 0], preserve: 1 },
    "black-white": { reds: 40, yellows: 60, greens: 40, cyans: 60, blues: 20, magentas: 80 },
    "photo-filter": { color: "#ec8a00", density: 25, preserve: 1 },
    "channel-mixer": { output: "red", monochrome: 0, values: [...PS_CHANNEL_MIXER_DEFAULT] },
    "gradient-map": { stops: [...PS_GRADIENT_MAP_DEFAULT], reverse: 0 },
    invert: { channel: "rgb" },
    posterize: { levels: 4 },
    threshold: { level: 128 },
    "selective-color": { range: 0, method: "relative", values: Array.from({ length: 36 }, () => 0) },
};

export function psCopyParams(params: Record<string, CanvasPsParamValue>): Record<string, CanvasPsParamValue> {
    return Object.fromEntries(Object.entries(params).map(([key, value]) => [key, Array.isArray(value) ? [...value] : value])) as Record<string, CanvasPsParamValue>;
}

const clampByte = (value: number) => Math.min(255, Math.max(0, Math.round(value)));
const param = (params: Record<string, CanvasPsParamValue>, key: string, fallback: number) => (typeof params[key] === "number" ? (params[key] as number) : fallback);
const text = (params: Record<string, CanvasPsParamValue>, key: string, fallback: string) => (typeof params[key] === "string" ? (params[key] as string) : fallback);
const numbers = (params: Record<string, CanvasPsParamValue>, key: string, fallback: number[]) => (Array.isArray(params[key]) && typeof params[key][0] !== "string" ? (params[key] as number[]) : fallback);

export function psHexToRgb(color: string) {
    return /^#[0-9a-f]{6}$/i.test(color) ? [parseInt(color.slice(1, 3), 16), parseInt(color.slice(3, 5), 16), parseInt(color.slice(5, 7), 16)] : [0, 0, 0];
}

function psLut(fn: (value: number) => number) {
    const table = new Uint8ClampedArray(256);
    for (let value = 0; value < 256; value += 1) table[value] = clampByte(fn(value));
    return table;
}

function psApplyLut(image: ImageData, table: Uint8ClampedArray, channel?: "r" | "g" | "b") {
    const offsets = channel ? [{ r: 0, g: 1, b: 2 }[channel]] : [0, 1, 2];
    const data = image.data;
    for (let index = 0; index < data.length; index += 4) {
        offsets.forEach((offset) => {
            data[index + offset] = table[data[index + offset]];
        });
    }
}

function psCurveLut(points: number[]) {
    const control = [];
    for (let index = 0; index + 1 < points.length; index += 2) control.push({ x: Math.min(255, Math.max(0, points[index])), y: Math.min(255, Math.max(0, points[index + 1])) });
    control.sort((a, b) => a.x - b.x);
    if (control.length < 2) return psLut((value) => value);
    const table = new Uint8ClampedArray(256);
    for (let value = 0; value < 256; value += 1) {
        let left = control[0];
        let right = control[control.length - 1];
        for (let index = 0; index + 1 < control.length; index += 1) {
            if (value >= control[index].x && value <= control[index + 1].x) {
                left = control[index];
                right = control[index + 1];
                break;
            }
        }
        table[value] = right.x === left.x ? clampByte(right.y) : clampByte(left.y + ((value - left.x) / (right.x - left.x)) * (right.y - left.y));
    }
    return table;
}

function psRgbToHsl(r: number, g: number, b: number) {
    const rn = r / 255;
    const gn = g / 255;
    const bn = b / 255;
    const max = Math.max(rn, gn, bn);
    const min = Math.min(rn, gn, bn);
    const l = (max + min) / 2;
    if (max === min) return [0, 0, l] as const;
    const delta = max - min;
    const s = l > 0.5 ? delta / (2 - max - min) : delta / (max + min);
    const hue = max === rn ? ((gn - bn) / delta + (gn < bn ? 6 : 0)) : max === gn ? (bn - rn) / delta + 2 : (rn - gn) / delta + 4;
    return [(hue / 6) * 360, s, l] as const;
}

function psHslToRgb(h: number, s: number, l: number) {
    if (s <= 0) return [l * 255, l * 255, l * 255];
    const hue = ((h % 360) + 360) % 360 / 360;
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    const channel = (offset: number) => {
        const t = (hue + offset) % 1;
        if (t < 1 / 6) return p + (q - p) * 6 * t;
        if (t < 1 / 2) return q;
        if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
        return p;
    };
    return [channel(1 / 3) * 255, channel(0) * 255, channel(-1 / 3) * 255];
}

function psHueWeight(hue: number, centre: number) {
    const distance = Math.abs(((hue - centre + 540) % 360) - 180);
    return distance >= 60 ? 0 : 1 - distance / 60;
}

function psApplyHueSaturation(image: ImageData, params: Record<string, CanvasPsParamValue>) {
    const channel = text(params, "channel", "master");
    const hueShift = param(params, "hue", 0);
    const saturation = param(params, "saturation", 0);
    const lightness = param(params, "lightness", 0);
    if (!hueShift && !saturation && !lightness) return;
    const centres: Record<string, number> = { reds: 0, yellows: 60, greens: 120, cyans: 180, blues: 240, magentas: 300 };
    const centre = centres[channel];
    const data = image.data;
    for (let index = 0; index < data.length; index += 4) {
        const [hue, sat, luma] = psRgbToHsl(data[index], data[index + 1], data[index + 2]);
        const weight = centre === undefined ? 1 : psHueWeight(hue, centre);
        if (!weight) continue;
        const nextSat = sat + ((saturation / 100) * weight * (saturation >= 0 ? 1 - sat : sat));
        const nextLight = Math.min(1, Math.max(0, luma + (lightness / 200) * weight));
        const [r, g, b] = psHslToRgb(hue + hueShift * weight, Math.min(1, Math.max(0, nextSat)), nextLight);
        data[index] = clampByte(r);
        data[index + 1] = clampByte(g);
        data[index + 2] = clampByte(b);
    }
}

function psApplyColorBalance(image: ImageData, params: Record<string, CanvasPsParamValue>) {
    const shadows = numbers(params, "shadows", [0, 0, 0]);
    const midtones = numbers(params, "midtones", [0, 0, 0]);
    const highlights = numbers(params, "highlights", [0, 0, 0]);
    const preserve = param(params, "preserve", 1) >= 0.5;
    const data = image.data;
    for (let index = 0; index < data.length; index += 4) {
        const r = data[index];
        const g = data[index + 1];
        const b = data[index + 2];
        const luma = 0.299 * r + 0.587 * g + 0.114 * b;
        const shadowWeight = Math.min(1, Math.max(0, (128 - luma) / 128));
        const highlightWeight = Math.min(1, Math.max(0, (luma - 128) / 128));
        const midWeight = 1 - Math.abs(luma - 128) / 128;
        const shifts = [0, 1, 2].map((channel) => shadows[channel] * shadowWeight + midtones[channel] * midWeight + highlights[channel] * highlightWeight);
        let nextR = r + shifts[0] * 0.4;
        let nextG = g + shifts[1] * 0.4;
        let nextB = b + shifts[2] * 0.4;
        if (preserve) {
            const nextLuma = 0.299 * nextR + 0.587 * nextG + 0.114 * nextB;
            const scale = nextLuma > 1 ? luma / nextLuma : 1;
            nextR *= scale;
            nextG *= scale;
            nextB *= scale;
        }
        data[index] = clampByte(nextR);
        data[index + 1] = clampByte(nextG);
        data[index + 2] = clampByte(nextB);
    }
}

function psApplyBlackWhite(image: ImageData, params: Record<string, CanvasPsParamValue>) {
    const reds = param(params, "reds", 40);
    const yellows = param(params, "yellows", 60);
    const greens = param(params, "greens", 40);
    const cyans = param(params, "cyans", 60);
    const blues = param(params, "blues", 20);
    const magentas = param(params, "magentas", 80);
    const boost = (base: number, source: number, amount: number) => base + (source - base) * (amount / 100);
    const data = image.data;
    for (let index = 0; index < data.length; index += 4) {
        const r = data[index];
        const g = data[index + 1];
        const b = data[index + 2];
        let gray = 0.299 * r + 0.587 * g + 0.114 * b;
        gray = boost(gray, r, reds);
        gray = boost(gray, (r + g) / 2, yellows);
        gray = boost(gray, g, greens);
        gray = boost(gray, (g + b) / 2, cyans);
        gray = boost(gray, b, blues);
        gray = boost(gray, (r + b) / 2, magentas);
        const value = clampByte(gray);
        data[index] = value;
        data[index + 1] = value;
        data[index + 2] = value;
    }
}

function psApplyPhotoFilter(image: ImageData, params: Record<string, CanvasPsParamValue>) {
    const [fr, fg, fb] = psHexToRgb(text(params, "color", "#ec8a00"));
    const density = param(params, "density", 25) / 100;
    const preserve = param(params, "preserve", 1) >= 0.5;
    const filterLuma = 0.299 * fr + 0.587 * fg + 0.114 * fb;
    const data = image.data;
    for (let index = 0; index < data.length; index += 4) {
        const r = data[index];
        const g = data[index + 1];
        const b = data[index + 2];
        const blend = [r, g, b].map((value, channel) => {
            const filter = [fr, fg, fb][channel];
            return filterLuma > 128 ? 255 - ((255 - value) * (255 - filter)) / 255 : (value * filter) / 255;
        });
        const mix = [r, g, b].map((value, channel) => value * (1 - density) + blend[channel] * density);
        if (preserve) {
            const luma = 0.299 * r + 0.587 * g + 0.114 * b;
            const nextLuma = 0.299 * mix[0] + 0.587 * mix[1] + 0.114 * mix[2];
            const scale = nextLuma > 1 ? luma / nextLuma : 1;
            mix[0] *= scale;
            mix[1] *= scale;
            mix[2] *= scale;
        }
        data[index] = clampByte(mix[0]);
        data[index + 1] = clampByte(mix[1]);
        data[index + 2] = clampByte(mix[2]);
    }
}

function psApplyChannelMixer(image: ImageData, params: Record<string, CanvasPsParamValue>) {
    const values = numbers(params, "values", PS_CHANNEL_MIXER_DEFAULT);
    const monochrome = param(params, "monochrome", 0) >= 0.5;
    const data = image.data;
    for (let index = 0; index < data.length; index += 4) {
        const r = data[index];
        const g = data[index + 1];
        const b = data[index + 2];
        if (monochrome) {
            const gray = (r * values[0] + g * values[1] + b * values[2]) / 100 + values[3] * 2.55;
            const value = clampByte(gray);
            data[index] = value;
            data[index + 1] = value;
            data[index + 2] = value;
            continue;
        }
        const nextR = (r * values[0] + g * values[1] + b * values[2]) / 100 + values[3] * 2.55;
        const nextG = (r * values[4] + g * values[5] + b * values[6]) / 100 + values[7] * 2.55;
        const nextB = (r * values[8] + g * values[9] + b * values[10]) / 100 + values[11] * 2.55;
        data[index] = clampByte(nextR);
        data[index + 1] = clampByte(nextG);
        data[index + 2] = clampByte(nextB);
    }
}

export function psParseGradientStops(stops: string[]) {
    return stops
        .map((stop) => {
            const [color, position] = stop.split("@");
            return { color: /^#[0-9a-f]{6}$/i.test(color) ? color : "#000000", position: Math.min(1, Math.max(0, Number(position) || 0)) };
        })
        .sort((a, b) => a.position - b.position);
}

export function psFormatGradientStop(color: string, position: number) {
    return `${color}@${Math.round(Math.min(1, Math.max(0, position)) * 100) / 100}`;
}

function psApplyGradientMap(image: ImageData, params: Record<string, CanvasPsParamValue>) {
    const raw = params.stops;
    const stops = psParseGradientStops(Array.isArray(raw) && typeof raw[0] === "string" ? (raw as string[]) : PS_GRADIENT_MAP_DEFAULT);
    if (stops.length < 2) return;
    const reverse = param(params, "reverse", 0) >= 0.5;
    const table = new Uint8ClampedArray(256 * 3);
    for (let value = 0; value < 256; value += 1) {
        const target = reverse ? 1 - value / 255 : value / 255;
        let left = stops[0];
        let right = stops[stops.length - 1];
        for (let index = 0; index + 1 < stops.length; index += 1) {
            if (target >= stops[index].position && target <= stops[index + 1].position) {
                left = stops[index];
                right = stops[index + 1];
                break;
            }
        }
        const ratio = right.position === left.position ? 0 : (target - left.position) / (right.position - left.position);
        const [lr, lg, lb] = psHexToRgb(left.color);
        const [rr, rg, rb] = psHexToRgb(right.color);
        table[value * 3] = clampByte(lr + (rr - lr) * ratio);
        table[value * 3 + 1] = clampByte(lg + (rg - lg) * ratio);
        table[value * 3 + 2] = clampByte(lb + (rb - lb) * ratio);
    }
    const data = image.data;
    for (let index = 0; index < data.length; index += 4) {
        const luma = Math.round(0.299 * data[index] + 0.587 * data[index + 1] + 0.114 * data[index + 2]);
        data[index] = table[luma * 3];
        data[index + 1] = table[luma * 3 + 1];
        data[index + 2] = table[luma * 3 + 2];
    }
}

function psSelectiveWeight(range: number, r: number, g: number, b: number) {
    const [hue, sat, luma] = psRgbToHsl(r, g, b);
    const luma255 = luma * 255;
    const satWeight = Math.min(1, sat * 3);
    const centres = [0, 60, 120, 180, 240, 300];
    if (range < 6) return psHueWeight(hue, centres[range]) * satWeight;
    const neutral = 1 - satWeight;
    if (range === 6) return Math.min(1, Math.max(0, (luma255 - 128) / 127)) * neutral;
    if (range === 7) return (1 - Math.abs(luma255 - 128) / 128) * neutral;
    return Math.min(1, Math.max(0, (128 - luma255) / 128)) * neutral;
}

function psApplySelectiveColor(image: ImageData, params: Record<string, CanvasPsParamValue>) {
    const values = numbers(params, "values", Array.from({ length: 36 }, () => 0));
    const relative = text(params, "method", "relative") === "relative";
    if (values.every((value) => !value)) return;
    const data = image.data;
    for (let index = 0; index < data.length; index += 4) {
        const r = data[index];
        const g = data[index + 1];
        const b = data[index + 2];
        let cyan = 1 - r / 255;
        let magenta = 1 - g / 255;
        let yellow = 1 - b / 255;
        let black = 0;
        for (let range = 0; range < 9; range += 1) {
            const weight = psSelectiveWeight(range, r, g, b);
            if (!weight) continue;
            const base = range * 4;
            const apply = (value: number, amount: number) => value + (relative ? value * amount * weight : amount * weight);
            cyan = apply(cyan, values[base] / 100);
            magenta = apply(magenta, values[base + 1] / 100);
            yellow = apply(yellow, values[base + 2] / 100);
            black = apply(black, values[base + 3] / 100);
        }
        const clampUnit = (value: number) => Math.min(1, Math.max(0, value + black));
        data[index] = clampByte(255 * (1 - clampUnit(cyan)));
        data[index + 1] = clampByte(255 * (1 - clampUnit(magenta)));
        data[index + 2] = clampByte(255 * (1 - clampUnit(yellow)));
    }
}

/** Applies one adjustment in place; `params` keys and defaults come from PS_ADJUSTMENT_DEFAULTS so the editor and the renderer always agree. */
export function applyPsAdjustment(image: ImageData, type: CanvasPsAdjustmentType, params: Record<string, CanvasPsParamValue> = {}) {
    const channelOf = () => {
        const channel = text(params, "channel", "rgb");
        return channel === "red" ? "r" : channel === "green" ? "g" : channel === "blue" ? "b" : undefined;
    };
    if (type === "brightness-contrast") {
        const brightness = param(params, "brightness", 0);
        const contrast = param(params, "contrast", 0);
        psApplyLut(image, psLut((value) => 128 + (value + brightness - 128) * (1 + contrast / 100)));
        return;
    }
    if (type === "levels") {
        const inBlack = param(params, "inBlack", 0);
        const inWhite = param(params, "inWhite", 255);
        const gamma = Math.max(0.01, param(params, "gamma", 1));
        const outBlack = param(params, "outBlack", 0);
        const outWhite = param(params, "outWhite", 255);
        const span = Math.max(1, inWhite - inBlack);
        psApplyLut(image, psLut((value) => outBlack + Math.pow(Math.min(1, Math.max(0, (value - inBlack) / span)), 1 / gamma) * (outWhite - outBlack)), channelOf());
        return;
    }
    if (type === "curves") {
        psApplyLut(image, psCurveLut(numbers(params, "points", PS_CURVE_IDENTITY)), channelOf());
        return;
    }
    if (type === "exposure") {
        const exposure = param(params, "exposure", 0);
        const offset = param(params, "offset", 0);
        const gamma = Math.max(0.01, param(params, "gamma", 1));
        const factor = Math.pow(2, exposure);
        psApplyLut(image, psLut((value) => Math.pow(Math.min(1, Math.max(0, (value * factor) / 255)), 1 / gamma) * 255 + offset * 255));
        return;
    }
    if (type === "vibrance") {
        const vibrance = param(params, "vibrance", 0);
        const saturation = param(params, "saturation", 0);
        const data = image.data;
        for (let index = 0; index < data.length; index += 4) {
            const r = data[index];
            const g = data[index + 1];
            const b = data[index + 2];
            const max = Math.max(r, g, b);
            const min = Math.min(r, g, b);
            const sat = max > 0 ? (max - min) / max : 0;
            const factor = Math.max(0, 1 + saturation / 100 + (vibrance / 100) * (1 - sat));
            const luma = 0.299 * r + 0.587 * g + 0.114 * b;
            data[index] = clampByte(luma + (r - luma) * factor);
            data[index + 1] = clampByte(luma + (g - luma) * factor);
            data[index + 2] = clampByte(luma + (b - luma) * factor);
        }
        return;
    }
    if (type === "hue-saturation") return psApplyHueSaturation(image, params);
    if (type === "color-balance") return psApplyColorBalance(image, params);
    if (type === "black-white") return psApplyBlackWhite(image, params);
    if (type === "photo-filter") return psApplyPhotoFilter(image, params);
    if (type === "channel-mixer") return psApplyChannelMixer(image, params);
    if (type === "gradient-map") return psApplyGradientMap(image, params);
    if (type === "invert") {
        const channel = channelOf();
        psApplyLut(image, psLut((value) => 255 - value), channel);
        return;
    }
    if (type === "posterize") {
        const levels = Math.max(2, Math.min(255, Math.round(param(params, "levels", 4))));
        const step = 255 / (levels - 1);
        psApplyLut(image, psLut((value) => Math.round(value / step) * step));
        return;
    }
    if (type === "threshold") {
        const level = param(params, "level", 128);
        const data = image.data;
        for (let index = 0; index < data.length; index += 4) {
            const value = 0.299 * data[index] + 0.587 * data[index + 1] + 0.114 * data[index + 2] >= level ? 255 : 0;
            data[index] = value;
            data[index + 1] = value;
            data[index + 2] = value;
        }
        return;
    }
    psApplySelectiveColor(image, params);
}
