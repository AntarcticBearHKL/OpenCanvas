import { nanoid } from "nanoid";

import { createCanvasContext } from "@/lib/canvas/canvas-2d";
import { resolveBlendMode } from "@/lib/canvas/blend-modes";
import { psCopyParams, psParseGradientStops } from "@/lib/canvas/ps-adjustments";
import type { CanvasPsLayerStyle, CanvasPsLayerStyleType, CanvasPsParamValue } from "@/types/canvas";

export const PS_LAYER_STYLE_TYPES: CanvasPsLayerStyleType[] = ["stroke", "drop-shadow", "inner-shadow", "outer-glow", "inner-glow", "bevel", "satin", "color-overlay", "gradient-overlay", "pattern-overlay"];

export const PS_LAYER_STYLE_NAME_KEYS: Record<CanvasPsLayerStyleType, string> = {
    stroke: "canvas.ps.fx.stroke",
    "drop-shadow": "canvas.ps.fx.dropShadow",
    "inner-shadow": "canvas.ps.fx.innerShadow",
    "outer-glow": "canvas.ps.fx.outerGlow",
    "inner-glow": "canvas.ps.fx.innerGlow",
    bevel: "canvas.ps.fx.bevel",
    satin: "canvas.ps.fx.satin",
    "color-overlay": "canvas.ps.fx.colorOverlay",
    "gradient-overlay": "canvas.ps.fx.gradientOverlay",
    "pattern-overlay": "canvas.ps.fx.patternOverlay",
};

export const PS_PATTERN_KINDS = ["checker", "dots", "stripes", "crosshatch"];

export const PS_LAYER_STYLE_DEFAULTS: Record<CanvasPsLayerStyleType, Record<string, CanvasPsParamValue>> = {
    stroke: { size: 3, position: "outside", opacity: 100, blendMode: "normal", color: "#000000" },
    "drop-shadow": { color: "#000000", opacity: 75, angle: 120, distance: 5, spread: 0, size: 5, blendMode: "multiply" },
    "inner-shadow": { color: "#000000", opacity: 75, angle: 120, distance: 5, spread: 0, size: 5, blendMode: "multiply" },
    "outer-glow": { color: "#ffffbe", opacity: 75, size: 5, spread: 0, blendMode: "screen" },
    "inner-glow": { color: "#ffffbe", opacity: 75, size: 5, spread: 0, blendMode: "screen" },
    bevel: { style: "inner", depth: 100, direction: "up", size: 5, soften: 0, angle: 120, highlightColor: "#ffffff", highlightOpacity: 75, shadowColor: "#000000", shadowOpacity: 75 },
    satin: { color: "#000000", opacity: 50, angle: 19, distance: 11, size: 14, blendMode: "multiply" },
    "color-overlay": { color: "#ff0000", opacity: 100, blendMode: "normal" },
    "gradient-overlay": { stops: ["#000000@0", "#ffffff@1"], angle: 90, scale: 100, reverse: 0, opacity: 100, blendMode: "normal" },
    "pattern-overlay": { pattern: "checker", scale: 100, angle: 0, opacity: 100, blendMode: "normal" },
};

/** Styles drawn beneath the layer content; everything else (inner effects, overlays, stroke) is drawn on top. */
const UNDER_STYLES: CanvasPsLayerStyleType[] = ["drop-shadow", "outer-glow"];
const OVER_ORDER: CanvasPsLayerStyleType[] = ["inner-shadow", "inner-glow", "bevel", "satin", "color-overlay", "gradient-overlay", "pattern-overlay", "stroke"];
const TAU = Math.PI * 2;

const param = (params: Record<string, CanvasPsParamValue>, key: string, fallback: number) => (typeof params[key] === "number" ? (params[key] as number) : fallback);
const text = (params: Record<string, CanvasPsParamValue>, key: string, fallback: string) => (typeof params[key] === "string" ? (params[key] as string) : fallback);

export function createPsLayerStyle(type: CanvasPsLayerStyleType): CanvasPsLayerStyle {
    return { id: nanoid(), type, enabled: true, params: psCopyParams(PS_LAYER_STYLE_DEFAULTS[type]) };
}

export function psStylePadding(styles: CanvasPsLayerStyle[], scale: number) {
    let extent = 0;
    styles
        .filter((style) => style.enabled)
        .forEach((style) => {
            const size = param(style.params, "size", 0) * scale;
            const distance = param(style.params, "distance", 0) * scale;
            if (style.type === "drop-shadow" || style.type === "inner-shadow") extent = Math.max(extent, distance + size * 3);
            else if (style.type === "stroke") extent = Math.max(extent, text(style.params, "position", "outside") === "inside" ? 0 : size);
            else if (style.type !== "color-overlay" && style.type !== "gradient-overlay" && style.type !== "pattern-overlay") extent = Math.max(extent, size * 3 + distance);
        });
    return Math.min(400, Math.ceil(extent + 2));
}

function psStyleCanvas(width: number, height: number) {
    return createCanvasContext(Math.max(1, Math.round(width)), Math.max(1, Math.round(height)));
}

function psTinted(source: HTMLCanvasElement, color: string) {
    const canvas = psStyleCanvas(source.width, source.height);
    if (!canvas.context) return source;
    canvas.context.drawImage(source, 0, 0);
    canvas.context.globalCompositeOperation = "source-in";
    canvas.context.fillStyle = color;
    canvas.context.fillRect(0, 0, canvas.canvas.width, canvas.canvas.height);
    return canvas.canvas;
}

function psBlurred(source: HTMLCanvasElement, blur: number) {
    if (blur <= 0.5) return source;
    const canvas = psStyleCanvas(source.width, source.height);
    if (!canvas.context) return source;
    canvas.context.filter = `blur(${blur}px)`;
    canvas.context.drawImage(source, 0, 0);
    canvas.context.filter = "none";
    return canvas.canvas;
}

function psShifted(source: HTMLCanvasElement, dx: number, dy: number) {
    const canvas = psStyleCanvas(source.width, source.height);
    if (!canvas.context) return source;
    canvas.context.drawImage(source, dx, dy);
    return canvas.canvas;
}

function psCutOut(base: HTMLCanvasElement, cut: HTMLCanvasElement) {
    const canvas = psStyleCanvas(base.width, base.height);
    if (!canvas.context) return base;
    canvas.context.drawImage(base, 0, 0);
    canvas.context.globalCompositeOperation = "destination-out";
    canvas.context.drawImage(cut, 0, 0);
    return canvas.canvas;
}

function psClipTo(base: HTMLCanvasElement, clip: HTMLCanvasElement) {
    const canvas = psStyleCanvas(base.width, base.height);
    if (!canvas.context) return base;
    canvas.context.drawImage(base, 0, 0);
    canvas.context.globalCompositeOperation = "destination-in";
    canvas.context.drawImage(clip, 0, 0);
    return canvas.canvas;
}

function psDilate(source: HTMLCanvasElement, radius: number) {
    if (radius <= 0.5) return source;
    const canvas = psStyleCanvas(source.width, source.height);
    const context = canvas.context;
    if (!context) return source;
    const steps = 24;
    [0, 0.5, 1].forEach((ring) => {
        const distance = radius * ring;
        if (!distance) {
            context.drawImage(source, 0, 0);
            return;
        }
        for (let step = 0; step < steps; step += 1) {
            const angle = (step / steps) * TAU;
            context.drawImage(source, Math.cos(angle) * distance, Math.sin(angle) * distance);
        }
    });
    return canvas.canvas;
}

function psErode(source: HTMLCanvasElement, radius: number) {
    if (radius <= 0.5) return source;
    const canvas = psStyleCanvas(source.width, source.height);
    const context = canvas.context;
    if (!context) return source;
    context.drawImage(source, 0, 0);
    const steps = 24;
    [0.5, 1].forEach((ring) => {
        const distance = radius * ring;
        for (let step = 0; step < steps; step += 1) {
            const angle = (step / steps) * TAU;
            context.globalCompositeOperation = "destination-in";
            context.drawImage(source, Math.cos(angle) * distance, Math.sin(angle) * distance);
        }
    });
    context.globalCompositeOperation = "source-over";
    return canvas.canvas;
}

function psDrawOver(context: CanvasRenderingContext2D, source: HTMLCanvasElement, blendMode: string, opacity: number) {
    if (opacity <= 0) return;
    context.save();
    context.globalAlpha = Math.min(1, opacity / 100);
    context.globalCompositeOperation = resolveBlendMode(blendMode).canvas;
    context.drawImage(source, 0, 0);
    context.restore();
}

function psLightVector(angle: number) {
    const radians = (angle * Math.PI) / 180;
    return { x: Math.cos(radians), y: -Math.sin(radians) };
}

function psShadowOffset(params: Record<string, CanvasPsParamValue>) {
    const distance = param(params, "distance", 5);
    const light = psLightVector(param(params, "angle", 120));
    return { x: -light.x * distance, y: -light.y * distance };
}

function psPatternTile(kind: string, size: number) {
    const canvas = psStyleCanvas(size, size);
    if (!canvas.context) return canvas.canvas;
    const context = canvas.context;
    context.fillStyle = "#ffffff";
    if (kind === "dots") {
        context.beginPath();
        context.arc(size / 2, size / 2, size * 0.28, 0, TAU);
        context.fill();
        return canvas.canvas;
    }
    if (kind === "stripes") {
        context.lineWidth = Math.max(1, size * 0.18);
        context.strokeStyle = "#ffffff";
        context.beginPath();
        context.moveTo(-size * 0.25, size * 1.25);
        context.lineTo(size * 1.25, -size * 0.25);
        context.moveTo(-size * 0.25, size * 0.25);
        context.lineTo(size * 0.25, -size * 0.25);
        context.moveTo(size * 0.75, size * 1.25);
        context.lineTo(size * 1.25, size * 0.75);
        context.stroke();
        return canvas.canvas;
    }
    if (kind === "crosshatch") {
        context.lineWidth = Math.max(1, size * 0.12);
        context.strokeStyle = "#ffffff";
        context.beginPath();
        context.moveTo(0, 0);
        context.lineTo(size, size);
        context.moveTo(size, 0);
        context.lineTo(0, size);
        context.stroke();
        return canvas.canvas;
    }
    const half = size / 2;
    context.fillRect(0, 0, half, half);
    context.fillRect(half, half, half, half);
    return canvas.canvas;
}

function psFillWith(source: HTMLCanvasElement, draw: (context: CanvasRenderingContext2D) => void) {
    const canvas = psStyleCanvas(source.width, source.height);
    if (!canvas.context) return source;
    draw(canvas.context);
    return psClipTo(canvas.canvas, source);
}

function psGradientOverlay(content: HTMLCanvasElement, params: Record<string, CanvasPsParamValue>) {
    const raw = params.stops;
    const stops = psParseGradientStops(Array.isArray(raw) && typeof raw[0] === "string" ? (raw as string[]) : ["#000000@0", "#ffffff@1"]);
    const reverse = param(params, "reverse", 0) >= 0.5;
    const ordered = reverse ? [...stops].reverse().map((stop) => ({ color: stop.color, position: 1 - stop.position })) : stops;
    const angle = param(params, "angle", 90);
    const scale = Math.max(10, param(params, "scale", 100)) / 100;
    const width = content.width;
    const height = content.height;
    return psFillWith(content, (context) => {
        const radians = ((angle - 90) * Math.PI) / 180;
        const dx = Math.cos(radians) * (width / 2) * scale;
        const dy = Math.sin(radians) * (height / 2) * scale;
        const ramp = context.createLinearGradient(width / 2 - dx, height / 2 - dy, width / 2 + dx, height / 2 + dy);
        ordered.forEach((stop) => ramp.addColorStop(Math.min(1, Math.max(0, stop.position)), stop.color));
        context.fillStyle = ramp;
        context.fillRect(0, 0, width, height);
    });
}

function psPatternOverlay(content: HTMLCanvasElement, params: Record<string, CanvasPsParamValue>, patterns?: Map<string, HTMLImageElement | null>) {
    const scale = Math.max(10, param(params, "scale", 100)) / 100;
    const angle = param(params, "angle", 0);
    const tile = Math.max(4, Math.round(16 * scale));
    const saved = patterns?.get(text(params, "patternKey", ""));
    return psFillWith(content, (context) => {
        const pattern = saved ? context.createPattern(saved, "repeat") : context.createPattern(psPatternTile(text(params, "pattern", "checker"), tile), "repeat");
        if (!pattern) return;
        pattern.setTransform(new DOMMatrix().rotate(angle));
        context.fillStyle = pattern;
        context.fillRect(0, 0, content.width, content.height);
    });
}

function psDrawStyle(context: CanvasRenderingContext2D, content: HTMLCanvasElement, style: CanvasPsLayerStyle, scale: number, patterns?: Map<string, HTMLImageElement | null>) {
    const params = style.params;
    const size = param(params, "size", 5) * scale;
    const opacity = param(params, "opacity", 100);
    const blendMode = text(params, "blendMode", "normal");
    if (style.type === "drop-shadow") {
        const offset = psShadowOffset(params);
        const spread = psDilate(psTinted(content, text(params, "color", "#000000")), (param(params, "spread", 0) / 100) * size);
        psDrawOver(context, psShifted(psBlurred(spread, size), offset.x * scale, offset.y * scale), blendMode, opacity);
        return;
    }
    if (style.type === "outer-glow") {
        const glow = psDilate(psTinted(content, text(params, "color", "#ffffbe")), (param(params, "spread", 0) / 100) * size);
        psDrawOver(context, psBlurred(glow, size), blendMode, opacity);
        return;
    }
    if (style.type === "inner-shadow") {
        const offset = psShadowOffset(params);
        const shifted = psShifted(content, offset.x * scale, offset.y * scale);
        const sliver = psBlurred(psCutOut(psTinted(content, text(params, "color", "#000000")), shifted), size);
        psDrawOver(context, psClipTo(sliver, content), blendMode, opacity);
        return;
    }
    if (style.type === "inner-glow") {
        const glow = psBlurred(psDilate(psTinted(content, text(params, "color", "#ffffbe")), (param(params, "spread", 0) / 100) * size), size);
        psDrawOver(context, psClipTo(glow, content), blendMode, opacity);
        return;
    }
    if (style.type === "bevel") {
        const light = psLightVector(param(params, "angle", 120));
        const direction = text(params, "direction", "up") === "down" ? -1 : 1;
        const distance = Math.max(1, (param(params, "depth", 100) / 100) * size * 0.8);
        const soften = param(params, "soften", 0) * scale;
        const highlight = psClipTo(psBlurred(psCutOut(psTinted(content, text(params, "highlightColor", "#ffffff")), psShifted(content, -light.x * distance * direction, -light.y * distance * direction)), size + soften), content);
        const shadow = psClipTo(psBlurred(psCutOut(psTinted(content, text(params, "shadowColor", "#000000")), psShifted(content, light.x * distance * direction, light.y * distance * direction)), size + soften), content);
        psDrawOver(context, highlight, "screen", param(params, "highlightOpacity", 75));
        psDrawOver(context, shadow, "multiply", param(params, "shadowOpacity", 75));
        return;
    }
    if (style.type === "satin") {
        const radians = (param(params, "angle", 19) * Math.PI) / 180;
        const distance = param(params, "distance", 11) * scale;
        const shifted = psShifted(content, Math.cos(radians) * distance, Math.sin(radians) * distance);
        const sheen = psClipTo(psBlurred(psCutOut(psTinted(content, text(params, "color", "#000000")), shifted), size), content);
        psDrawOver(context, sheen, blendMode, opacity);
        return;
    }
    if (style.type === "color-overlay") {
        psDrawOver(context, psTinted(content, text(params, "color", "#ff0000")), blendMode, opacity);
        return;
    }
    if (style.type === "gradient-overlay") {
        psDrawOver(context, psGradientOverlay(content, params), blendMode, opacity);
        return;
    }
    if (style.type === "pattern-overlay") {
        psDrawOver(context, psPatternOverlay(content, params, patterns), blendMode, opacity);
        return;
    }
    const position = text(params, "position", "outside");
    const outer = position === "inside" ? 0 : position === "center" ? size / 2 : size;
    const inner = position === "outside" ? 0 : position === "center" ? size / 2 : size;
    const ring = psStyleCanvas(content.width, content.height);
    if (!ring.context) return;
    ring.context.drawImage(outer > 0 ? psDilate(content, outer) : content, 0, 0);
    if (inner > 0) {
        ring.context.globalCompositeOperation = "destination-out";
        ring.context.drawImage(psErode(content, inner), 0, 0);
        ring.context.globalCompositeOperation = "source-over";
    }
    psDrawOver(context, psTinted(ring.canvas, text(params, "color", "#000000")), blendMode, opacity);
}

/** Composes a layer's own content canvas with its enabled styles; same-size canvas back, so the caller only offsets by its padding. */
/** `patterns` carries the already-loaded bitmaps for pattern overlays that reference a saved pattern, so this stays synchronous. */
export function psComposeLayerStyles(content: HTMLCanvasElement, styles: CanvasPsLayerStyle[], scale: number, patterns?: Map<string, HTMLImageElement | null>) {
    const enabled = styles.filter((style) => style.enabled);
    if (!enabled.length) return content;
    const under = psStyleCanvas(content.width, content.height);
    const over = psStyleCanvas(content.width, content.height);
    if (!under.context || !over.context) return content;
    const ordered = (types: CanvasPsLayerStyleType[]) => types.flatMap((type) => enabled.filter((style) => style.type === type));
    ordered(UNDER_STYLES).forEach((style) => psDrawStyle(under.context!, content, style, scale, patterns));
    ordered(OVER_ORDER).forEach((style) => psDrawStyle(over.context!, content, style, scale, patterns));
    const output = psStyleCanvas(content.width, content.height);
    if (!output.context) return content;
    output.context.drawImage(under.canvas, 0, 0);
    output.context.drawImage(content, 0, 0);
    output.context.drawImage(over.canvas, 0, 0);
    return output.canvas;
}
