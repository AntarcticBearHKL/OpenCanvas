import { createCanvasContext } from "@/lib/canvas/canvas-2d";
import type { CanvasImageModifierCurvePoint, CanvasImageModifierParamKey, CanvasImageModifierParams } from "@/types/canvas";

type ImageModifierParamUnit = "%" | "deg" | "px" | "EV" | "";

type ImageModifierParamSpec = {
    key: CanvasImageModifierParamKey;
    min: number;
    max: number;
    step: number;
    default: number;
    cssFn: string;
    unit: ImageModifierParamUnit;
    labelKey: string;
};

type ImageModifierToneParamSpec = Omit<ImageModifierParamSpec, "cssFn">;

export const IMAGE_MODIFIER_PARAMS: ImageModifierParamSpec[] = [
    { key: "brightness", min: 0, max: 200, step: 1, default: 100, cssFn: "brightness", unit: "%", labelKey: "canvas.imageModifier.brightness" },
    { key: "contrast", min: 0, max: 200, step: 1, default: 100, cssFn: "contrast", unit: "%", labelKey: "canvas.imageModifier.contrast" },
    { key: "saturate", min: 0, max: 200, step: 1, default: 100, cssFn: "saturate", unit: "%", labelKey: "canvas.imageModifier.saturation" },
    { key: "hueRotate", min: -180, max: 180, step: 1, default: 0, cssFn: "hue-rotate", unit: "deg", labelKey: "canvas.imageModifier.hueRotate" },
    { key: "blur", min: 0, max: 20, step: 0.5, default: 0, cssFn: "blur", unit: "px", labelKey: "canvas.imageModifier.blur" },
    { key: "grayscale", min: 0, max: 100, step: 1, default: 0, cssFn: "grayscale", unit: "%", labelKey: "canvas.imageModifier.grayscale" },
    { key: "sepia", min: 0, max: 100, step: 1, default: 0, cssFn: "sepia", unit: "%", labelKey: "canvas.imageModifier.sepia" },
    { key: "invert", min: 0, max: 100, step: 1, default: 0, cssFn: "invert", unit: "%", labelKey: "canvas.imageModifier.invert" },
    { key: "opacity", min: 0, max: 100, step: 1, default: 100, cssFn: "opacity", unit: "%", labelKey: "canvas.imageModifier.opacity" },
];

export const IMAGE_MODIFIER_TONE_PARAMS: ImageModifierToneParamSpec[] = [
    { key: "blackPoint", min: 0, max: 255, step: 1, default: 0, unit: "", labelKey: "canvas.imageModifier.blackPoint" },
    { key: "whitePoint", min: 0, max: 255, step: 1, default: 255, unit: "", labelKey: "canvas.imageModifier.whitePoint" },
    { key: "gamma", min: 0.1, max: 3, step: 0.01, default: 1, unit: "", labelKey: "canvas.imageModifier.gamma" },
    { key: "exposure", min: -2, max: 2, step: 0.05, default: 0, unit: "EV", labelKey: "canvas.imageModifier.exposure" },
    { key: "highlights", min: -100, max: 100, step: 1, default: 0, unit: "", labelKey: "canvas.imageModifier.highlights" },
    { key: "shadows", min: -100, max: 100, step: 1, default: 0, unit: "", labelKey: "canvas.imageModifier.shadows" },
];

const IMAGE_MODIFIER_ALL_PARAMS: ImageModifierToneParamSpec[] = [...IMAGE_MODIFIER_TONE_PARAMS, ...IMAGE_MODIFIER_PARAMS];

export const DEFAULT_IMAGE_MODIFIER_PARAMS: CanvasImageModifierParams = IMAGE_MODIFIER_ALL_PARAMS.reduce((acc, spec) => ({ ...acc, [spec.key]: spec.default }), {} as CanvasImageModifierParams);

export const DEFAULT_IMAGE_MODIFIER_CURVE: CanvasImageModifierCurvePoint[] = [
    { x: 0, y: 0 },
    { x: 0.25, y: 0.25 },
    { x: 0.5, y: 0.5 },
    { x: 0.75, y: 0.75 },
    { x: 1, y: 1 },
];

export const IMAGE_MODIFIER_CURVE_GAP = 0.02;

const HISTOGRAM_SAMPLE_SIZE = 160;
const histogramCache = new Map<string, Uint32Array>();

export function normalizeImageModifierParams(params?: Partial<CanvasImageModifierParams> | null): CanvasImageModifierParams {
    return IMAGE_MODIFIER_ALL_PARAMS.reduce((acc, spec) => {
        const value = params?.[spec.key];
        acc[spec.key] = typeof value === "number" && Number.isFinite(value) ? Math.min(spec.max, Math.max(spec.min, value)) : spec.default;
        return acc;
    }, { ...DEFAULT_IMAGE_MODIFIER_PARAMS });
}

export function normalizeImageModifierCurve(curve?: CanvasImageModifierCurvePoint[] | null): CanvasImageModifierCurvePoint[] {
    if (!Array.isArray(curve) || curve.length !== DEFAULT_IMAGE_MODIFIER_CURVE.length) return DEFAULT_IMAGE_MODIFIER_CURVE.map((point) => ({ ...point }));
    const points = DEFAULT_IMAGE_MODIFIER_CURVE.map((fallback, index) => ({
        x: Number.isFinite(curve[index]?.x) ? curve[index].x : fallback.x,
        y: Number.isFinite(curve[index]?.y) ? curve[index].y : fallback.y,
    }));
    const last = points.length - 1;
    for (let index = 0; index <= last; index++) {
        const minX = index === 0 ? 0 : points[index - 1].x + IMAGE_MODIFIER_CURVE_GAP;
        const maxX = index === last ? 1 : 1 - (last - index) * IMAGE_MODIFIER_CURVE_GAP;
        points[index].x = Math.min(maxX, Math.max(minX, points[index].x));
        points[index].y = index === 0 ? 0 : index === last ? 1 : Math.min(1, Math.max(points[index - 1].y, points[index].y));
    }
    return points;
}

function imageModifierFilter(params?: Partial<CanvasImageModifierParams> | null): string {
    const normalized = normalizeImageModifierParams(params);
    return IMAGE_MODIFIER_PARAMS.map((spec) => `${spec.cssFn}(${normalized[spec.key]}${spec.unit})`).join(" ");
}

export function formatImageModifierValue(spec: Pick<ImageModifierParamSpec, "step" | "unit">, value: number): string {
    const digits = spec.step >= 1 ? 0 : spec.step >= 0.1 ? 1 : 2;
    return `${value.toFixed(digits)}${spec.unit}`;
}

function imageModifierLut(params?: Partial<CanvasImageModifierParams> | null, curve?: CanvasImageModifierCurvePoint[] | null): Uint8ClampedArray {
    const normalized = normalizeImageModifierParams(params);
    const points = normalizeImageModifierCurve(curve);
    const sample = curveSampler(points);
    const black = points[0].x;
    const white = points[points.length - 1].x;
    const span = white - black;
    const gamma = 1 / Math.max(0.01, normalized.gamma);
    const gain = 2 ** normalized.exposure;
    const shadows = (normalized.shadows / 100) * 0.5;
    const highlights = (normalized.highlights / 100) * 0.5;
    const lut = new Uint8ClampedArray(256);
    for (let value = 0; value < 256; value++) {
        let tone = Math.min(1, Math.max(0, (value / 255 - black) / span));
        tone = Math.min(1, Math.max(0, tone * gain));
        tone = Math.pow(tone, gamma);
        tone = Math.min(1, Math.max(0, tone + shadows * (1 - tone) ** 2 + highlights * tone ** 2));
        lut[value] = Math.round(Math.min(1, Math.max(0, sample(black + tone * span))) * 255);
    }
    return lut;
}

function applyImageModifierLut(imageData: ImageData, params?: Partial<CanvasImageModifierParams> | null, curve?: CanvasImageModifierCurvePoint[] | null): void {
    const lut = imageModifierLut(params, curve);
    const data = imageData.data;
    for (let index = 0; index < data.length; index += 4) {
        data[index] = lut[data[index]];
        data[index + 1] = lut[data[index + 1]];
        data[index + 2] = lut[data[index + 2]];
    }
}

export function drawImageModifierInto(
    context: CanvasRenderingContext2D,
    image: CanvasImageSource,
    rect: { x: number; y: number; width: number; height: number },
    params?: Partial<CanvasImageModifierParams> | null,
    curve?: CanvasImageModifierCurvePoint[] | null,
): void {
    context.filter = imageModifierFilter(params);
    context.drawImage(image, rect.x, rect.y, rect.width, rect.height);
    context.filter = "none";
    const imageData = context.getImageData(rect.x, rect.y, rect.width, rect.height);
    applyImageModifierLut(imageData, params, curve);
    context.putImageData(imageData, rect.x, rect.y);
}

export async function imageModifierHistogram(sourceUrl: string): Promise<Uint32Array> {
    const cached = histogramCache.get(sourceUrl);
    if (cached) return cached;
    const image = await loadImageElement(sourceUrl);
    const scale = Math.min(1, HISTOGRAM_SAMPLE_SIZE / Math.max(1, image.naturalWidth, image.naturalHeight));
    const width = Math.max(1, Math.round(image.naturalWidth * scale));
    const height = Math.max(1, Math.round(image.naturalHeight * scale));
    const { context } = createCanvasContext(width, height);
    const histogram = new Uint32Array(256);
    if (context) {
        context.drawImage(image, 0, 0, width, height);
        const data = context.getImageData(0, 0, width, height).data;
        for (let index = 0; index < data.length; index += 4) {
            const luma = (data[index] * 299 + data[index + 1] * 587 + data[index + 2] * 114) / 1000;
            histogram[Math.min(255, Math.floor(luma))] += 1;
        }
    }
    histogramCache.set(sourceUrl, histogram);
    return histogram;
}

export async function renderImageModifierBlob(sourceUrl: string, params?: Partial<CanvasImageModifierParams> | null, curve?: CanvasImageModifierCurvePoint[] | null): Promise<Blob> {
    const image = await loadImageElement(sourceUrl);
    const { canvas, context } = createCanvasContext(Math.max(1, image.naturalWidth), Math.max(1, image.naturalHeight));
    if (!context) throw new Error("canvas-unavailable");
    drawImageModifierInto(context, image, { x: 0, y: 0, width: canvas.width, height: canvas.height }, params, curve);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob((value) => resolve(value), "image/png"));
    if (!blob) throw new Error("blob-unavailable");
    return blob;
}

export function loadImageElement(src: string) {
    return new Promise<HTMLImageElement>((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error("image-load-failed"));
        image.src = src;
    });
}

function curveSampler(points: CanvasImageModifierCurvePoint[]) {
    const last = points.length - 1;
    const slopes = points.slice(0, last).map((point, index) => (points[index + 1].y - point.y) / (points[index + 1].x - point.x));
    const tangents = points.map((_, index) => {
        if (index === 0) return slopes[0];
        if (index === last) return slopes[last - 1];
        if (slopes[index - 1] * slopes[index] <= 0) return 0;
        const widthA = 2 * (points[index + 1].x - points[index].x) + (points[index].x - points[index - 1].x);
        const widthB = points[index + 1].x - points[index].x + 2 * (points[index].x - points[index - 1].x);
        return (widthA + widthB) / (widthA / slopes[index - 1] + widthB / slopes[index]);
    });
    return (value: number) => {
        const x = Math.min(1, Math.max(0, value));
        let index = 0;
        while (index < last - 1 && x > points[index + 1].x) index += 1;
        const width = points[index + 1].x - points[index].x;
        const t = width > 0 ? (x - points[index].x) / width : 0;
        const t2 = t * t;
        const t3 = t2 * t;
        return (2 * t3 - 3 * t2 + 1) * points[index].y + (t3 - 2 * t2 + t) * width * tangents[index] + (-2 * t3 + 3 * t2) * points[index + 1].y + (t3 - t2) * width * tangents[index + 1];
    };
}
