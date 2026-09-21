import { createCanvasContext } from "@/lib/canvas/canvas-2d";
import { resolveBlendMode } from "@/lib/canvas/blend-modes";
import { composeSmartCanvas, psRotatePoint } from "@/lib/canvas/smart-canvas";
import { psSelectionToLayerSpace, type PsSelection } from "@/components/canvas/workspace/ps-selection";
import { resolveImageUrl } from "@/services/image-storage";
import type { CanvasNodeData, CanvasPsLayer } from "@/types/canvas";

export type PsPaintPoint = { x: number; y: number };
export type PsBrushOptions = { size: number; hardness: number; opacity: number; tolerance: number; color: string; spacing?: number; scatter?: number; angle?: number; roundness?: number; dynamics?: number; texture?: number };

export type PsPaintSource = { storageKey?: string; selection?: PsSelection | null };

export type PsGradientStop = { color: string; position: number };
export type PsGradientOptions = { type: "linear" | "radial"; from: PsPaintPoint; to: PsPaintPoint; stops: PsGradientStop[]; opacity: number; mode: string; reverse: boolean };

export type PsStroke = {
    width: number;
    height: number;
    stroke: HTMLCanvasElement;
    context: CanvasRenderingContext2D;
    base: HTMLImageElement | null;
    ready: Promise<void>;
    last: PsPaintPoint | null;
    clip: HTMLCanvasElement | null;
    scratch: HTMLCanvasElement | null;
};

export type PsBoardSampler = { data: ImageData; width: number; height: number };

const DAB_SPACING = 0.15;
const MAX_DABS_PER_SEGMENT = 256;
const TAU = Math.PI * 2;
const GRAIN_TILE = 64;
let grainTile: HTMLCanvasElement | null = null;

export function psBitmapSize(value: number) {
    return Math.max(1, Math.round(value));
}

/** A layer bitmap is sized to the layer box, so board-local geometry maps to layer pixels without scaling. */
export function psDocToLayer(layer: CanvasPsLayer, point: PsPaintPoint): PsPaintPoint {
    const centre = { x: layer.x + layer.width / 2, y: layer.y + layer.height / 2 };
    const local = psRotatePoint(point.x, point.y, centre, -layer.rotation);
    return { x: local.x - layer.x, y: local.y - layer.y };
}

/** The soft edge of a dab fades the same colour out, which needs a 6-digit hex to append alpha to. */
function psColorWithAlpha(color: string, alpha: string) {
    return /^#[0-9a-f]{6}$/i.test(color) ? `${color}${alpha}` : color;
}

/** The whole drag accumulates on the scratch canvas; the layer bitmap is written once when the stroke ends. */
export function psBeginStroke(layer: CanvasPsLayer, brush: PsBrushOptions, source: PsPaintSource = {}): PsStroke | null {
    const width = psBitmapSize(layer.width);
    const height = psBitmapSize(layer.height);
    const { canvas, context } = createCanvasContext(width, height);
    if (!context) return null;
    context.fillStyle = brush.color;
    const stroke: PsStroke = { width, height, stroke: canvas, context, base: null, ready: Promise.resolve(), last: null, clip: source.selection ? psSelectionToLayerSpace(source.selection, layer, width, height) : null, scratch: null };
    stroke.ready = psLoadLayerBitmap(source.storageKey ?? layer.storageKey).then((image) => {
        stroke.base = image;
    });
    return stroke;
}

export async function psLoadLayerBitmap(storageKey?: string) {
    if (!storageKey) return null;
    return psLoadImage(await resolveImageUrl(storageKey));
}

export function psLoadImage(source: string) {
    return new Promise<HTMLImageElement | null>((resolve) => {
        if (!source) return resolve(null);
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => resolve(null);
        image.src = source;
    });
}

function psGrainTile() {
    if (grainTile) return grainTile;
    const { canvas, context } = createCanvasContext(GRAIN_TILE, GRAIN_TILE);
    if (context) {
        const image = context.createImageData(GRAIN_TILE, GRAIN_TILE);
        for (let index = 0; index < image.data.length; index += 4) {
            image.data[index] = 255;
            image.data[index + 1] = 255;
            image.data[index + 2] = 255;
            image.data[index + 3] = 40 + Math.random() * 215;
        }
        context.putImageData(image, 0, 0);
    }
    grainTile = canvas;
    return canvas;
}

function psDabShape(context: CanvasRenderingContext2D, point: PsPaintPoint, brush: PsBrushOptions, radius: number, roundness: number, angle: number) {
    const inner = Math.min(radius, radius * brush.hardness);
    context.beginPath();
    context.ellipse(point.x, point.y, radius, radius * roundness, angle, 0, TAU);
    if (inner >= radius) {
        context.fill();
        return;
    }
    const gradient = context.createRadialGradient(point.x, point.y, inner, point.x, point.y, radius);
    gradient.addColorStop(0, brush.color);
    gradient.addColorStop(1, psColorWithAlpha(brush.color, "00"));
    context.fillStyle = gradient;
    context.fill();
    context.fillStyle = brush.color;
}

/** One dab of the brush; roundness, angle, per-dab dynamics and the grain texture all land here, so the panel preview and the stroke agree. */
export function psPaintDab(context: CanvasRenderingContext2D, point: PsPaintPoint, brush: PsBrushOptions, jitter: { size: number; alpha: number } = { size: 1, alpha: 1 }) {
    const radius = Math.max(0.5, (brush.size * jitter.size) / 2);
    const roundness = Math.max(0.05, brush.roundness ?? 1);
    const angle = ((brush.angle ?? 0) * Math.PI) / 180;
    const texture = Math.max(0, Math.min(1, brush.texture ?? 0));
    context.save();
    context.globalAlpha = Math.max(0, Math.min(1, jitter.alpha));
    if (!texture) {
        psDabShape(context, point, brush, radius, roundness, angle);
        context.restore();
        return;
    }
    const size = Math.ceil(radius * 2) + 2;
    const scratch = createCanvasContext(size, size);
    if (!scratch.context) {
        psDabShape(context, point, brush, radius, roundness, angle);
        context.restore();
        return;
    }
    scratch.context.fillStyle = brush.color;
    psDabShape(scratch.context, { x: size / 2, y: size / 2 }, brush, radius, roundness, angle);
    scratch.context.globalAlpha = texture;
    scratch.context.globalCompositeOperation = "destination-in";
    scratch.context.fillStyle = scratch.context.createPattern(psGrainTile(), "repeat") || "#ffffff";
    scratch.context.fillRect(0, 0, size, size);
    scratch.context.globalAlpha = 1;
    scratch.context.globalCompositeOperation = "source-over";
    context.drawImage(scratch.canvas, point.x - size / 2, point.y - size / 2);
    context.restore();
}

/** Dabs are spread evenly along the segment so a fast drag stays a continuous stroke, with a per-move cap so one long segment cannot stall the drag. */
export function psStrokeTo(stroke: PsStroke, point: PsPaintPoint, brush: PsBrushOptions) {
    const from = stroke.last;
    stroke.last = point;
    if (!from) {
        psPaintDab(stroke.context, point, brush);
        return;
    }
    const dx = point.x - from.x;
    const dy = point.y - from.y;
    const distance = Math.hypot(dx, dy);
    const spacing = Math.max(0.05, brush.spacing ?? DAB_SPACING);
    const step = Math.max(0.5, brush.size * spacing, distance / MAX_DABS_PER_SEGMENT);
    const count = Math.max(1, Math.ceil(distance / step));
    const dynamics = Math.max(0, Math.min(1, brush.dynamics ?? 0));
    const scatter = Math.max(0, Math.min(1, brush.scatter ?? 0)) * brush.size * 0.5;
    for (let index = 1; index <= count; index += 1) {
        const ratio = index / count;
        const offset = scatter ? { x: (Math.random() - 0.5) * scatter, y: (Math.random() - 0.5) * scatter } : { x: 0, y: 0 };
        psPaintDab(stroke.context, { x: from.x + dx * ratio + offset.x, y: from.y + dy * ratio + offset.y }, brush, { size: 1 - dynamics * Math.random() * 0.7, alpha: 1 - dynamics * Math.random() * 0.6 });
    }
}

/** Live preview stroke for the Brushes panel; it draws through the same dab so a preset preview cannot drift from the painted result. */
export function psBrushPreview(canvas: HTMLCanvasElement, brush: PsBrushOptions, color: string) {
    const context = canvas.getContext("2d");
    if (!context) return;
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = color;
    const stroke: PsStroke = { width: canvas.width, height: canvas.height, stroke: canvas, context, base: null, ready: Promise.resolve(), last: null, clip: null, scratch: null };
    for (let index = 0; index <= 36; index += 1) psStrokeTo(stroke, { x: 8 + (index / 36) * (canvas.width - 16), y: canvas.height / 2 + Math.sin(index / 5) * canvas.height * 0.22 }, { ...brush, color });
}

/**
 * SELECTION HOOK (stage 3b): a selection mask clips an edit here. Both the live preview and the bitmap committed on
 * pointer-up go through this one composite step, so drawing the scratch stroke through the mask is the only change.
 */
export function psDrawStroke(target: HTMLCanvasElement, stroke: PsStroke, opacity: number, erase: boolean) {
    const context = target.getContext("2d");
    if (!context) return;
    context.globalAlpha = 1;
    context.globalCompositeOperation = "source-over";
    context.clearRect(0, 0, target.width, target.height);
    if (stroke.base) context.drawImage(stroke.base, 0, 0, target.width, target.height);
    context.globalAlpha = Math.min(1, Math.max(0, opacity));
    context.globalCompositeOperation = erase ? "destination-out" : "source-over";
    context.drawImage(psClippedStroke(stroke), 0, 0, target.width, target.height);
    context.globalAlpha = 1;
    context.globalCompositeOperation = "source-over";
}

function psClippedStroke(stroke: PsStroke) {
    if (!stroke.clip) return stroke.stroke;
    if (!stroke.scratch) {
        const created = createCanvasContext(stroke.width, stroke.height);
        if (!created.context) return stroke.stroke;
        stroke.scratch = created.canvas;
    }
    const context = stroke.scratch.getContext("2d");
    if (!context) return stroke.stroke;
    context.globalAlpha = 1;
    context.globalCompositeOperation = "source-over";
    context.clearRect(0, 0, stroke.width, stroke.height);
    context.drawImage(stroke.stroke, 0, 0);
    context.globalCompositeOperation = "destination-in";
    context.drawImage(stroke.clip, 0, 0);
    context.globalCompositeOperation = "source-over";
    return stroke.scratch;
}

export async function psCommitStroke(stroke: PsStroke, opacity: number, erase: boolean) {
    await stroke.ready;
    const { canvas } = createCanvasContext(stroke.width, stroke.height);
    psDrawStroke(canvas, stroke, opacity, erase);
    return psCanvasToBlob(canvas);
}

export async function psBucketFill(layer: CanvasPsLayer, point: PsPaintPoint, color: string, tolerance: number, source: PsPaintSource & { mask?: boolean } = {}) {
    const width = psBitmapSize(layer.width);
    const height = psBitmapSize(layer.height);
    const { canvas, context } = createCanvasContext(width, height);
    if (!context) return null;
    const base = await psLoadLayerBitmap(source.storageKey ?? layer.storageKey);
    if (base) context.drawImage(base, 0, 0, width, height);
    const x = Math.floor(point.x);
    const y = Math.floor(point.y);
    if (x < 0 || y < 0 || x >= width || y >= height) return null;
    const image = context.getImageData(0, 0, width, height);
    const fillColor = source.mask ? "#ffffff" : color;
    const targetAlpha = source.mask ? Math.round(psColorLuminance(color) * 255) : 255;
    if (!psFloodFill(image, x, y, fillColor, tolerance, targetAlpha)) return null;
    context.putImageData(image, 0, 0);
    if (source.selection) {
        const clip = psSelectionToLayerSpace(source.selection, layer, width, height);
        if (clip) {
            context.globalCompositeOperation = "destination-in";
            context.drawImage(clip, 0, 0);
            context.globalCompositeOperation = "source-over";
        }
    }
    return psCanvasToBlob(canvas);
}

function psFloodRegion(image: ImageData, startX: number, startY: number, tolerance: number) {
    const { data, width, height } = image;
    const seed = (startY * width + startX) * 4;
    const origin = [data[seed], data[seed + 1], data[seed + 2], data[seed + 3]];
    const region = new Uint8Array(width * height);
    const stack = [startY * width + startX];
    while (stack.length) {
        const pixel = stack.pop()!;
        if (region[pixel]) continue;
        const index = pixel * 4;
        if (Math.abs(data[index] - origin[0]) > tolerance || Math.abs(data[index + 1] - origin[1]) > tolerance || Math.abs(data[index + 2] - origin[2]) > tolerance || Math.abs(data[index + 3] - origin[3]) > tolerance) continue;
        region[pixel] = 1;
        const x = pixel % width;
        const y = (pixel - x) / width;
        if (x > 0) stack.push(pixel - 1);
        if (x < width - 1) stack.push(pixel + 1);
        if (y > 0) stack.push(pixel - width);
        if (y < height - 1) stack.push(pixel + width);
    }
    return { region, origin };
}

function psRegionCanvas(region: Uint8Array, width: number, height: number) {
    const { canvas, context } = createCanvasContext(width, height);
    if (!context) return null;
    const mask = context.createImageData(width, height);
    for (let pixel = 0; pixel < region.length; pixel += 1) {
        if (!region[pixel]) continue;
        const index = pixel * 4;
        mask.data[index] = 255;
        mask.data[index + 1] = 255;
        mask.data[index + 2] = 255;
        mask.data[index + 3] = 255;
    }
    context.putImageData(mask, 0, 0);
    return canvas;
}

function psFloodFill(image: ImageData, startX: number, startY: number, color: string, tolerance: number, targetAlpha = 255) {
    const { data } = image;
    const [r, g, b] = psHexToRgb(color);
    const { region, origin } = psFloodRegion(image, startX, startY, tolerance);
    if (origin[0] === r && origin[1] === g && origin[2] === b && origin[3] === targetAlpha) return false;
    let filled = false;
    for (let pixel = 0; pixel < region.length; pixel += 1) {
        if (!region[pixel]) continue;
        const index = pixel * 4;
        data[index] = r;
        data[index + 1] = g;
        data[index + 2] = b;
        data[index + 3] = targetAlpha;
        filled = true;
    }
    return filled;
}

/** Pattern fill: the same tolerance region as the bucket, painted with a tiled pattern instead of a flat colour. */
export async function psBucketPattern(layer: CanvasPsLayer, point: PsPaintPoint, patternUrl: string, tolerance: number, source: PsPaintSource & { mask?: boolean } = {}) {
    const width = psBitmapSize(layer.width);
    const height = psBitmapSize(layer.height);
    const x = Math.floor(point.x);
    const y = Math.floor(point.y);
    if (x < 0 || y < 0 || x >= width || y >= height) return null;
    const probe = createCanvasContext(width, height);
    if (!probe.context) return null;
    const base = await psLoadLayerBitmap(source.storageKey ?? layer.storageKey);
    if (base) probe.context.drawImage(base, 0, 0, width, height);
    const { region } = psFloodRegion(probe.context.getImageData(0, 0, width, height), x, y, tolerance);
    const mask = psRegionCanvas(region, width, height);
    const tile = await psLoadImage(patternUrl);
    if (!mask || !tile) return null;
    const { canvas, context } = createCanvasContext(width, height);
    if (!context) return null;
    if (base) context.drawImage(base, 0, 0, width, height);
    const paint = createCanvasContext(width, height);
    if (!paint.context) return null;
    const pattern = paint.context.createPattern(tile, "repeat");
    if (!pattern) return null;
    paint.context.fillStyle = pattern;
    paint.context.fillRect(0, 0, width, height);
    paint.context.globalCompositeOperation = "destination-in";
    paint.context.drawImage(mask, 0, 0);
    paint.context.globalCompositeOperation = "source-over";
    if (source.selection) {
        const clip = psSelectionToLayerSpace(source.selection, layer, width, height);
        if (clip) {
            paint.context.globalCompositeOperation = "destination-in";
            paint.context.drawImage(clip, 0, 0);
            paint.context.globalCompositeOperation = "source-over";
        }
    }
    context.drawImage(paint.canvas, 0, 0);
    return psCanvasToBlob(canvas);
}

/** Gradient fill into the active pixel layer or mask bitmap, clipped to the selection exactly like a stroke. */
export async function psGradientFill(layer: CanvasPsLayer, gradient: PsGradientOptions, source: PsPaintSource = {}) {
    const width = psBitmapSize(layer.width);
    const height = psBitmapSize(layer.height);
    const paint = createCanvasContext(width, height);
    if (!paint.context) return null;
    const stops = gradient.reverse ? gradient.stops.map((stop) => ({ color: stop.color, position: 1 - stop.position })).reverse() : gradient.stops;
    const ramp =
        gradient.type === "radial"
            ? paint.context.createRadialGradient(gradient.from.x, gradient.from.y, 0, gradient.from.x, gradient.from.y, Math.max(1, Math.hypot(gradient.to.x - gradient.from.x, gradient.to.y - gradient.from.y)))
            : paint.context.createLinearGradient(gradient.from.x, gradient.from.y, gradient.to.x, gradient.to.y);
    stops.forEach((stop) => ramp.addColorStop(Math.min(1, Math.max(0, stop.position)), stop.color));
    paint.context.fillStyle = ramp;
    paint.context.fillRect(0, 0, width, height);
    if (source.selection) {
        const clip = psSelectionToLayerSpace(source.selection, layer, width, height);
        if (clip) {
            paint.context.globalCompositeOperation = "destination-in";
            paint.context.drawImage(clip, 0, 0);
            paint.context.globalCompositeOperation = "source-over";
        }
    }
    const { canvas, context } = createCanvasContext(width, height);
    if (!context) return null;
    const base = await psLoadLayerBitmap(source.storageKey ?? layer.storageKey);
    if (base) context.drawImage(base, 0, 0, width, height);
    context.globalAlpha = Math.min(1, Math.max(0, gradient.opacity));
    context.globalCompositeOperation = resolveBlendMode(gradient.mode).canvas;
    context.drawImage(paint.canvas, 0, 0);
    context.globalAlpha = 1;
    context.globalCompositeOperation = "source-over";
    return psCanvasToBlob(canvas);
}

/** Fills the whole layer with a tiled pattern, clipped to the selection exactly like a stroke. */
export async function psPatternFillLayer(layer: CanvasPsLayer, patternUrl: string, source: PsPaintSource = {}) {
    const width = psBitmapSize(layer.width);
    const height = psBitmapSize(layer.height);
    const tile = await psLoadImage(patternUrl);
    if (!tile) return null;
    const { canvas, context } = createCanvasContext(width, height);
    if (!context) return null;
    const base = await psLoadLayerBitmap(source.storageKey ?? layer.storageKey);
    if (base) context.drawImage(base, 0, 0, width, height);
    const paint = createCanvasContext(width, height);
    if (!paint.context) return null;
    const pattern = paint.context.createPattern(tile, "repeat");
    if (!pattern) return null;
    paint.context.fillStyle = pattern;
    paint.context.fillRect(0, 0, width, height);
    if (source.selection) {
        const clip = psSelectionToLayerSpace(source.selection, layer, width, height);
        if (clip) {
            paint.context.globalCompositeOperation = "destination-in";
            paint.context.drawImage(clip, 0, 0);
            paint.context.globalCompositeOperation = "source-over";
        }
    }
    context.drawImage(paint.canvas, 0, 0);
    return psCanvasToBlob(canvas);
}

export function psColorLuminance(color: string) {
    const [r, g, b] = psHexToRgb(color);
    return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

export async function psBakeMask(layer: CanvasPsLayer, sourceUrl: string, maskUrl: string) {
    const width = psBitmapSize(layer.width);
    const height = psBitmapSize(layer.height);
    const { canvas, context } = createCanvasContext(width, height);
    if (!context) return null;
    const [base, mask] = await Promise.all([psLoadImage(sourceUrl), psLoadImage(maskUrl)]);
    if (base) context.drawImage(base, 0, 0, width, height);
    if (mask) {
        context.globalCompositeOperation = "destination-in";
        context.drawImage(mask, 0, 0, width, height);
        context.globalCompositeOperation = "source-over";
    }
    return psCanvasToBlob(canvas);
}

/** Pixels of one source at document resolution, for the wand / quick-selection colour tests. */
export async function psLoadPixels(width: number, height: number, sourceUrl: string) {
    const image = await psLoadImage(sourceUrl);
    if (!image) return null;
    const { canvas, context } = createCanvasContext(Math.max(1, Math.round(width)), Math.max(1, Math.round(height)));
    if (!context) return null;
    context.imageSmoothingEnabled = true;
    context.drawImage(image, 0, 0);
    return context.getImageData(0, 0, canvas.width, canvas.height);
}

/** One layer rasterised into document coordinates, so its box position and rotation are honoured when sampling it alone. */
export async function psLoadLayerPixels(layer: CanvasPsLayer, width: number, height: number, sourceUrl: string) {
    const image = await psLoadImage(sourceUrl);
    if (!image) return null;
    const { canvas, context } = createCanvasContext(Math.max(1, Math.round(width)), Math.max(1, Math.round(height)));
    if (!context) return null;
    context.imageSmoothingEnabled = true;
    context.translate(layer.x + layer.width / 2, layer.y + layer.height / 2);
    context.rotate((layer.rotation * Math.PI) / 180);
    context.drawImage(image, -layer.width / 2, -layer.height / 2, layer.width, layer.height);
    return context.getImageData(0, 0, canvas.width, canvas.height);
}

/** The eyedropper reads the composited board, i.e. the same pixels the export writes. */
export async function psLoadBoardSampler(board: CanvasNodeData, nodes: CanvasNodeData[]): Promise<PsBoardSampler | null> {
    const composite = await composeSmartCanvas(board, nodes);
    if (!composite.dataUrl) return null;
    const image = await psLoadImage(composite.dataUrl);
    if (!image) return null;
    const { context } = createCanvasContext(composite.width, composite.height);
    if (!context) return null;
    context.drawImage(image, 0, 0);
    return { data: context.getImageData(0, 0, composite.width, composite.height), width: composite.width, height: composite.height };
}

/** The composite scaled into document coordinates, which is the space the selection mask lives in. */
export async function psLoadBoardPixels(board: CanvasNodeData, nodes: CanvasNodeData[], width: number, height: number) {
    const composite = await composeSmartCanvas(board, nodes);
    if (!composite.dataUrl) return null;
    return psLoadPixels(width, height, composite.dataUrl);
}

export function psSampleBoardPixel(sampler: PsBoardSampler, board: { width: number; height: number }, point: PsPaintPoint) {
    const x = Math.floor((point.x / Math.max(1, board.width)) * sampler.width);
    const y = Math.floor((point.y / Math.max(1, board.height)) * sampler.height);
    if (x < 0 || y < 0 || x >= sampler.width || y >= sampler.height) return null;
    const index = (y * sampler.width + x) * 4;
    const [r, g, b, a] = [sampler.data.data[index], sampler.data.data[index + 1], sampler.data.data[index + 2], sampler.data.data[index + 3]];
    return a > 0 ? `#${[r, g, b].map((value) => value.toString(16).padStart(2, "0")).join("")}` : null;
}

function psHexToRgb(color: string) {
    const value = /^#[0-9a-f]{6}$/i.test(color) ? color.slice(1) : "000000";
    return [parseInt(value.slice(0, 2), 16), parseInt(value.slice(2, 4), 16), parseInt(value.slice(4, 6), 16)];
}

export function psCanvasToBlob(canvas: HTMLCanvasElement) {
    return new Promise<Blob | null>((resolve) => canvas.toBlob((blob) => resolve(blob), "image/png"));
}
