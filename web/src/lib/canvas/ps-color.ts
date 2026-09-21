import { psHexToRgb } from "@/lib/canvas/ps-adjustments";

export type PsHsb = { h: number; s: number; b: number };

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

export function psNormalizeHex(value: string) {
    const match = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(value.trim());
    if (!match) return "";
    const hex = match[1];
    return `#${(hex.length === 3 ? hex.split("").map((char) => char + char).join("") : hex).toLowerCase()}`;
}

export function psRgbToHex(rgb: [number, number, number]) {
    return `#${rgb.map((value) => Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, "0")).join("")}`;
}

export function psRgbToHsb(rgb: [number, number, number]): PsHsb {
    const [r, g, b] = rgb.map((value) => value / 255);
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const delta = max - min;
    let h = 0;
    if (delta) {
        if (max === r) h = ((g - b) / delta) % 6;
        else if (max === g) h = (b - r) / delta + 2;
        else h = (r - g) / delta + 4;
        h *= 60;
        if (h < 0) h += 360;
    }
    return { h, s: max ? (delta / max) * 100 : 0, b: max * 100 };
}

export function psHsbToRgb(hsb: PsHsb): [number, number, number] {
    const h = ((hsb.h % 360) + 360) % 360;
    const s = clamp01(hsb.s / 100);
    const v = clamp01(hsb.b / 100);
    const chroma = v * s;
    const secondary = chroma * (1 - Math.abs(((h / 60) % 2) - 1));
    const offset = v - chroma;
    const table: [number, number, number] = h < 60 ? [chroma, secondary, 0] : h < 120 ? [secondary, chroma, 0] : h < 180 ? [0, chroma, secondary] : h < 240 ? [0, secondary, chroma] : h < 300 ? [secondary, 0, chroma] : [chroma, 0, secondary];
    return table.map((value) => Math.round((value + offset) * 255)) as [number, number, number];
}

export function psHexToHsb(hex: string): PsHsb {
    return psRgbToHsb(psHexToRgbTriple(hex));
}

export function psHsbToHex(hsb: PsHsb) {
    return psRgbToHex(psHsbToRgb(hsb));
}

export function psHexToRgbTriple(hex: string): [number, number, number] {
    const [r, g, b] = psHexToRgb(psNormalizeHex(hex) || "#000000");
    return [r, g, b];
}

/** Readable label colour on a swatch; the luminance test is the WCAG relative-luminance approximation. */
export function psReadableText(hex: string) {
    const [r, g, b] = psHexToRgbTriple(hex);
    return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 > 0.55 ? "#000000" : "#ffffff";
}
