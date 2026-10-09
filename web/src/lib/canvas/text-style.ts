import type { CanvasNodeMetadata } from "@/types/canvas";

export type TextAlign = "left" | "center" | "right";

type CanvasTextStyle = {
    fontSize: number;
    lineHeight: number;
    fontFamily?: string;
    bold: boolean;
    italic: boolean;
    align: TextAlign;
    color?: string;
};

export const TEXT_FONT_FAMILIES: { label: string; value: string }[] = [
    { label: "System", value: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif' },
    { label: "Sans", value: "ui-sans-serif, Helvetica, Arial, sans-serif" },
    { label: "Serif", value: 'Georgia, "Times New Roman", serif' },
    { label: "Mono", value: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace" },
        { label: "Rounded", value: 'ui-rounded, "SF Pro Rounded", "Hiragino Maru Gothic ProN", Quicksand, sans-serif' },
];

export const TEXT_FONT_SIZE_MIN = 8;
export const TEXT_FONT_SIZE_MAX = 200;
export const TEXT_LINE_HEIGHT_MIN = 1;
export const TEXT_LINE_HEIGHT_MAX = 3;
export const TEXT_FONT_SIZE_DEFAULT = 14;
export const TEXT_LINE_HEIGHT_DEFAULT = 1.65;

const TEXT_ALIGNS: TextAlign[] = ["left", "center", "right"];

export function clampFontSize(value: number): number {
    if (!Number.isFinite(value)) return TEXT_FONT_SIZE_DEFAULT;
    return Math.min(TEXT_FONT_SIZE_MAX, Math.max(TEXT_FONT_SIZE_MIN, Math.round(value)));
}

export function clampLineHeight(value: number): number {
    if (!Number.isFinite(value)) return TEXT_LINE_HEIGHT_DEFAULT;
    return Math.min(TEXT_LINE_HEIGHT_MAX, Math.max(TEXT_LINE_HEIGHT_MIN, Math.round(value * 100) / 100));
}

export function resolveTextStyle(metadata: CanvasNodeMetadata | undefined): CanvasTextStyle {
    const fontFamily = typeof metadata?.fontFamily === "string" && metadata.fontFamily.trim() ? metadata.fontFamily : undefined;
    const color = typeof metadata?.textColor === "string" && metadata.textColor.trim() ? metadata.textColor : undefined;
    return {
        fontSize: clampFontSize(metadata?.fontSize ?? TEXT_FONT_SIZE_DEFAULT),
        lineHeight: clampLineHeight(metadata?.lineHeight ?? TEXT_LINE_HEIGHT_DEFAULT),
        fontFamily,
        bold: metadata?.fontWeight === "bold",
        italic: metadata?.italic === true,
        align: TEXT_ALIGNS.find((value) => value === metadata?.textAlign) || "left",
        color,
    };
}

export function textStyleToCss(style: CanvasTextStyle): Record<string, string | number> {
    return {
        fontSize: `${style.fontSize}px`,
        lineHeight: style.lineHeight,
        ...(style.fontFamily ? { fontFamily: style.fontFamily } : {}),
        fontWeight: style.bold ? "bold" : "normal",
        fontStyle: style.italic ? "italic" : "normal",
        textAlign: style.align,
        ...(style.color ? { color: style.color } : {}),
    };
}
