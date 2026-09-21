import { psPathSampler } from "@/lib/canvas/ps-path";
import type { PsMesh } from "@/lib/canvas/ps-transform";
import type { CanvasPsPath, CanvasPsLayer, CanvasPsTextAlign, CanvasPsTextCase, CanvasPsTextWarp, CanvasPsTextWarpStyle } from "@/types/canvas";

export type PsTextRun = { char: string; small: boolean };
export type PsTextLine = { runs: PsTextRun[]; paragraphStart: boolean };

export const PS_FONT_FAMILIES = ["sans-serif", "serif", "monospace", "Arial", "Helvetica", "Georgia", "Times New Roman", "Verdana", "Trebuchet MS", "Courier New", "Impact"];
export const PS_TEXT_CASES: CanvasPsTextCase[] = ["none", "upper", "lower", "small-caps"];
export const PS_TEXT_ALIGNS: CanvasPsTextAlign[] = ["left", "center", "right", "justify"];
export const PS_TEXT_WARP_STYLES: CanvasPsTextWarpStyle[] = ["arc", "arc-lower", "arc-upper", "flag", "wave", "fish", "rise", "bulge", "shell", "squeeze"];

export const PS_TEXT_CASE_NAME_KEYS: Record<CanvasPsTextCase, string> = { none: "canvas.ps.textCaseNone", upper: "canvas.ps.textCaseUpper", lower: "canvas.ps.textCaseLower", "small-caps": "canvas.ps.textCaseSmallCaps" };
export const PS_TEXT_ALIGN_NAME_KEYS: Record<CanvasPsTextAlign, string> = { left: "canvas.ps.alignLeft", center: "canvas.ps.alignCenter", right: "canvas.ps.alignRight", justify: "canvas.ps.alignJustify" };
export const PS_TEXT_WARP_NAME_KEYS: Record<CanvasPsTextWarpStyle, string> = {
    arc: "canvas.ps.warpArc",
    "arc-lower": "canvas.ps.warpArcLower",
    "arc-upper": "canvas.ps.warpArcUpper",
    flag: "canvas.ps.warpFlag",
    wave: "canvas.ps.warpWave",
    fish: "canvas.ps.warpFish",
    rise: "canvas.ps.warpRise",
    bulge: "canvas.ps.warpBulge",
    shell: "canvas.ps.warpShell",
    squeeze: "canvas.ps.warpSqueeze",
};

const DEFAULT_FONT_SIZE = 32;
const DEFAULT_LINE_HEIGHT = 1.2;
const SMALL_CAPS_SCALE = 0.8;

export function psTextFontSize(layer: CanvasPsLayer) {
    return Math.max(1, layer.fontSize || DEFAULT_FONT_SIZE);
}

export function psTextLineHeight(layer: CanvasPsLayer) {
    return Math.max(1, layer.leading || psTextFontSize(layer) * DEFAULT_LINE_HEIGHT);
}

export function psTextFont(layer: CanvasPsLayer, scale: number) {
    const style = layer.fauxItalic ? "italic " : "";
    const weight = layer.fauxBold ? "bold " : "normal ";
    return `${style}${weight}${Math.max(1, psTextFontSize(layer) * scale)}px ${layer.fontFamily || "sans-serif"}`;
}

export function psTextSmallCapsFont(layer: CanvasPsLayer, scale: number) {
    const weight = layer.fauxBold ? "bold " : "normal ";
    return `${weight}${Math.max(1, psTextFontSize(layer) * scale * SMALL_CAPS_SCALE)}px ${layer.fontFamily || "sans-serif"}`;
}

export function psTextScaleX(layer: CanvasPsLayer) {
    return Math.max(1, layer.textScaleX ?? 100) / 100;
}

export function psTextScaleY(layer: CanvasPsLayer) {
    return Math.max(1, layer.textScaleY ?? 100) / 100;
}

export function psTextNeedsRaster(layer: CanvasPsLayer) {
    return Boolean(
        layer.tracking ||
            layer.kerning ||
            layer.leading ||
            layer.baselineShift ||
            (layer.textScaleX !== undefined && layer.textScaleX !== 100) ||
            (layer.textScaleY !== undefined && layer.textScaleY !== 100) ||
            layer.fauxBold ||
            layer.fauxItalic ||
            layer.underline ||
            layer.strikethrough ||
            (layer.textCase && layer.textCase !== "none") ||
            layer.paragraph ||
            layer.textPathId ||
            layer.textWarp,
    );
}

export function psTextParagraph(layer: CanvasPsLayer) {
    return layer.paragraph ?? { align: "left" as CanvasPsTextAlign, indentLeft: 0, indentRight: 0, indentFirst: 0, spaceBefore: 0, spaceAfter: 0, hyphenate: false };
}

function psCaseRuns(text: string, textCase: CanvasPsTextCase): PsTextRun[] {
    if (textCase === "upper") return Array.from(text, (char) => ({ char: char.toUpperCase(), small: false }));
    if (textCase === "lower") return Array.from(text, (char) => ({ char: char.toLowerCase(), small: false }));
    if (textCase === "small-caps") return Array.from(text, (char) => ({ char: char.toUpperCase(), small: char !== char.toUpperCase() && char === char.toLowerCase() }));
    return Array.from(text, (char) => ({ char, small: false }));
}

function psRunWidth(context: CanvasRenderingContext2D, run: PsTextRun) {
    const width = context.measureText(run.char).width;
    return run.small ? width * SMALL_CAPS_SCALE : width;
}

/** One measured pass over the text with wrap and paragraph rules; the fill, the decorations and the path placement share these lines. */
export function psLayoutText(context: CanvasRenderingContext2D, layer: CanvasPsLayer, maxWidth: number, scale: number): PsTextLine[] {
    const paragraph = psTextParagraph(layer);
    const normalFont = psTextFont(layer, scale);
    const smallFont = psTextSmallCapsFont(layer, scale);
    const lines: PsTextLine[] = [];
    const measure = (run: PsTextRun) => {
        context.font = run.small ? smallFont : normalFont;
        return psRunWidth(context, run);
    };
    (layer.text || "").split("\n").forEach((raw) => {
        const runs = psCaseRuns(raw, layer.textCase || "none");
        const available = Math.max(1, maxWidth - (paragraph.indentLeft + paragraph.indentRight) * scale);
        let current: PsTextRun[] = [];
        let width = 0;
        const flush = (paragraphStart: boolean) => {
            lines.push({ runs: current, paragraphStart });
            current = [];
            width = 0;
        };
        runs.forEach((run) => {
            const runWidth = measure(run);
            if (run.char !== " " && width + runWidth > available && current.length) {
                flush(false);
                if (paragraph.hyphenate && runWidth > available) {
                    current.push(run);
                    flush(false);
                } else {
                    current.push(run);
                    width = runWidth;
                }
                return;
            }
            current.push(run);
            width += runWidth;
        });
        flush(true);
    });
    return lines;
}

function psLineWidth(context: CanvasRenderingContext2D, layer: CanvasPsLayer, line: PsTextLine, scale: number, tracking: number, kerning: number) {
    const normalFont = psTextFont(layer, scale);
    const smallFont = psTextSmallCapsFont(layer, scale);
    return line.runs.reduce((total, run, index) => {
        context.font = run.small ? smallFont : normalFont;
        return total + psRunWidth(context, run) + (index ? tracking + kerning : 0);
    }, 0);
}

function psDrawDecorations(context: CanvasRenderingContext2D, layer: CanvasPsLayer, width: number, fontSize: number, y: number) {
    if (!layer.underline && !layer.strikethrough) return;
    context.save();
    context.strokeStyle = layer.color || "#000000";
    context.lineWidth = Math.max(1, fontSize * 0.05);
    if (layer.underline) {
        context.beginPath();
        context.moveTo(0, y + fontSize * 1.05);
        context.lineTo(width, y + fontSize * 1.05);
        context.stroke();
    }
    if (layer.strikethrough) {
        context.beginPath();
        context.moveTo(0, y + fontSize * 0.55);
        context.lineTo(width, y + fontSize * 0.55);
        context.stroke();
    }
    context.restore();
}

/** Glyphs are placed one by one so tracking, kerning, scale, case and the decorations all share one layout. */
export function psDrawTextLines(context: CanvasRenderingContext2D, layer: CanvasPsLayer, lines: PsTextLine[], scale: number, origin: { x: number; y: number }, boxWidth: number) {
    const paragraph = psTextParagraph(layer);
    const normalFont = psTextFont(layer, scale);
    const smallFont = psTextSmallCapsFont(layer, scale);
    const fontSize = Math.max(1, psTextFontSize(layer) * scale);
    const lineHeight = Math.max(1, psTextLineHeight(layer) * scale);
    const tracking = (layer.tracking ?? 0) * (fontSize / 1000);
    const kerning = (layer.kerning ?? 0) * scale;
    const baselineShift = (layer.baselineShift ?? 0) * scale;
    const scaleX = psTextScaleX(layer);
    const scaleY = psTextScaleY(layer);
    context.save();
    context.fillStyle = layer.color || "#000000";
    context.textBaseline = "top";
    context.transform(1, 0, layer.fauxItalic ? -0.25 : 0, 1, 0, 0);
    let y = origin.y;
    lines.forEach((line, lineIndex) => {
        if (lineIndex && line.paragraphStart) y += paragraph.spaceBefore * scale;
        const indent = paragraph.indentLeft + (line.paragraphStart ? paragraph.indentFirst : 0);
        const lineWidth = psLineWidth(context, layer, line, scale, tracking, kerning);
        const available = Math.max(1, boxWidth - (paragraph.indentLeft + paragraph.indentRight) * scale);
        const gaps = Math.max(0, line.runs.length - 1);
        const justify = paragraph.align === "justify" && !line.paragraphStart;
        const extra = justify && gaps ? Math.max(0, available - indent - lineWidth) / gaps : 0;
        let left = origin.x + indent * scale;
        if (paragraph.align === "center") left = origin.x + indent * scale + Math.max(0, available - lineWidth) / 2;
        if (paragraph.align === "right") left = origin.x + indent * scale + Math.max(0, available - lineWidth);
        context.save();
        context.translate(left, y + baselineShift);
        context.scale(scaleX, scaleY);
        let x = 0;
        line.runs.forEach((run, index) => {
            if (index) x += tracking + kerning + extra;
            context.font = run.small ? smallFont : normalFont;
            context.fillText(run.char, x, 0);
            if (layer.fauxBold) {
                context.strokeStyle = layer.color || "#000000";
                context.lineWidth = Math.max(0.5, fontSize * 0.03);
                context.strokeText(run.char, x, 0);
            }
            x += psRunWidth(context, run);
        });
        context.restore();
        psDrawDecorations(context, layer, lineWidth, fontSize, y + baselineShift);
        y += lineHeight + (line.paragraphStart ? paragraph.spaceAfter * scale : 0);
    });
    context.restore();
}

/** Text on a path: glyphs are walked along the path by their own advance and rotated to the local tangent. */
export function psDrawTextOnPath(context: CanvasRenderingContext2D, layer: CanvasPsLayer, path: CanvasPsPath, scale: number, origin: { x: number; y: number }) {
    const sampler = psPathSampler(path);
    if (sampler.total <= 0) return;
    const font = psTextFont(layer, scale);
    const fontSize = Math.max(1, psTextFontSize(layer) * scale);
    const tracking = (layer.tracking ?? 0) * (fontSize / 1000);
    const kerning = (layer.kerning ?? 0) * scale;
    const firstLine = (layer.text || "").split("\n")[0];
    context.save();
    context.translate(origin.x, origin.y);
    context.textBaseline = "alphabetic";
    context.fillStyle = layer.color || "#000000";
    context.font = font;
    let cursor = 0;
    Array.from(firstLine).forEach((char, index) => {
        const run: PsTextRun = { char, small: false };
        const width = psRunWidth(context, run);
        if (cursor + width > sampler.total) return;
        const middle = cursor + width / 2;
        const point = sampler.pointAt(middle);
        if (!point) return;
        context.save();
        context.translate(point.x, point.y);
        context.rotate((sampler.angleAt(middle) * Math.PI) / 180);
        context.fillText(char, -width / 2, 0);
        context.restore();
        cursor += width + tracking + (index ? kerning : 0);
    });
    context.restore();
}

function psWarpOffset(warp: CanvasPsTextWarp, u: number, v: number): { x: number; y: number } {
    const bend = Math.max(-100, Math.min(100, warp.bend)) / 100;
    const horizontal = Math.max(-100, Math.min(100, warp.horizontal)) / 100;
    const vertical = Math.max(-100, Math.min(100, warp.vertical)) / 100;
    const middle = Math.sin(Math.PI * u);
    const across = Math.sin(Math.PI * v);
    let x = 0;
    let y = 0;
    switch (warp.style) {
        case "arc":
            y = -bend * middle * 0.5;
            break;
        case "arc-lower":
            y = bend * middle * 0.5 * v;
            break;
        case "arc-upper":
            y = -bend * middle * 0.5 * (1 - v);
            break;
        case "flag":
            y = bend * Math.sin(2 * Math.PI * u) * 0.25 * (0.4 + v);
            break;
        case "wave":
            y = bend * Math.sin(3 * Math.PI * u) * 0.2;
            break;
        case "fish":
            x = -bend * across * (u - 0.5) * 0.6;
            break;
        case "rise":
            y = -bend * u * 0.5;
            break;
        case "bulge":
            x = bend * (u - 0.5) * across * 0.6;
            break;
        case "shell":
            y = -bend * (1 - Math.abs(2 * u - 1)) * 0.4;
            break;
        case "squeeze":
            x = bend * (u - 0.5) * across * 0.6;
            y = bend * (v - 0.5) * middle * 0.4;
            break;
    }
    return { x: x + horizontal * (u - 0.5) * (1 - Math.abs(2 * v - 1)) * 0.5, y: y + vertical * (v - 0.5) * (1 - Math.abs(2 * u - 1)) * 0.5 };
}

/** The text warp as the same 4x4 mesh the layer transform uses, so both draw through the shared warped-content path. */
export function psTextWarpMesh(warp: CanvasPsTextWarp): PsMesh {
    return Array.from({ length: 16 }, (_, index) => {
        const u = (index % 4) / 3;
        const v = Math.floor(index / 4) / 3;
        const offset = psWarpOffset(warp, u, v);
        return { x: u + offset.x, y: v + offset.y };
    });
}

export function psTextWarpDefault(): CanvasPsTextWarp {
    return { style: "arc", bend: 0, horizontal: 0, vertical: 0 };
}
