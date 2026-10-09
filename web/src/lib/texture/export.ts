// Export / encoding helpers for the Texture Studio.
// Ported from texture-create (index.clean.js): class G (3516-3661), Sobel normal map (3527-3585),
// channel packing (3470-3515 + 3599-3608) and sheet layout/metadata (6626-6724).
import { nanoid } from "nanoid";

import { NODE_DEFAULT_SIZE } from "@/constant/canvas";
import { fitNodeSize } from "@/lib/canvas/canvas-node-size";
import { imageMetadata } from "@/lib/canvas/canvas-node-factory";
import { uploadImage } from "@/services/image-storage";
import { useCanvasStore } from "@/stores/canvas/use-canvas-store";
import { CanvasNodeType } from "@/types/canvas";
import type { CanvasNodeData } from "@/types/canvas";

import { TextureRenderer } from "./renderer";
import { CHANNEL_SOURCES } from "./types";
import type { ChannelConfig, ChannelSource, EditorState, LayerState, Resolution } from "./types";

/** Sheet exports are rejected above this edge (both width and height). */
const MAX_SHEET_EDGE = 8192;

// The WebGL renderer uses `preserveDrawingBuffer`, so a returned canvas keeps its pixels after
// `renderStateToCanvas` returns. The renderer is parked on a WeakMap keyed by the canvas so callers
// can free the GPU context via `disposeRenderer` once they are done reading/encoding.
const renderers = new WeakMap<HTMLCanvasElement, TextureRenderer>();

function createRendererCanvas(size: number): { canvas: HTMLCanvasElement; renderer: TextureRenderer } {
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    return { canvas, renderer: new TextureRenderer(canvas) };
}

/** Download a canvas as a PNG via an `<a download>` + `toDataURL("image/png")` click. */
export function downloadPng(canvas: HTMLCanvasElement, filename: string): void {
    const link = document.createElement("a");
    link.download = filename;
    link.href = canvas.toDataURL("image/png");
    link.click();
}

/**
 * Render `state` + `layers` into an offscreen canvas at `size ?? state.resolution`.
 *
 * The returned canvas is safe to pass to `readPixels` / `toDataURL` / `toBlob` immediately: the
 * renderer was created with `preserveDrawingBuffer: true` and is intentionally not disposed (see
 * `disposeRenderer`). Call `disposeRenderer(canvas)` when finished to release the WebGL context.
 */
export function renderStateToCanvas(state: EditorState, layers: LayerState[], size?: number): HTMLCanvasElement {
    const target = size ?? state.resolution;
    const frameState: EditorState = target === state.resolution ? state : { ...state, resolution: target as Resolution };
    const { canvas, renderer } = createRendererCanvas(target);
    renderer.render(frameState, layers);
    renderers.set(canvas, renderer);
    return canvas;
}

/** Dispose the renderer attached to a canvas returned by `renderStateToCanvas`. */
export function disposeRenderer(canvas: HTMLCanvasElement): void {
    renderers.get(canvas)?.dispose();
    renderers.delete(canvas);
}

/**
 * Exact Sobel normal map from base pixels' red channel.
 * Samples are `red / 255`; coordinates are clamped to the image bounds.
 */
export function generateNormalMap(pixels: { data: Uint8Array; width: number; height: number }, strength = 2): HTMLCanvasElement {
    const width = pixels.width;
    const height = pixels.height;
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) return canvas;

    const image = context.createImageData(width, height);
    const out = image.data;
    const sample = (x: number, y: number): number => {
        const cx = Math.max(0, Math.min(width - 1, x));
        const cy = Math.max(0, Math.min(height - 1, y));
        return pixels.data[(cy * width + cx) * 4] / 255;
    };

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const tl = sample(x - 1, y - 1);
            const tc = sample(x, y - 1);
            const tr = sample(x + 1, y - 1);
            const ml = sample(x - 1, y);
            const mr = sample(x + 1, y);
            const bl = sample(x - 1, y + 1);
            const bc = sample(x, y + 1);
            const br = sample(x + 1, y + 1);

            const gx = (tr + 2 * mr + br - (tl + 2 * ml + bl)) * strength;
            const gy = (bl + 2 * bc + br - (tl + 2 * tc + tr)) * strength;
            const z = 1;
            const w = Math.sqrt(gx * gx + gy * gy + z * z);
            const offset = (y * width + x) * 4;
            out[offset] = (gx / w) * 0.5 * 255 + 0.5 * 255;
            out[offset + 1] = (gy / w) * 0.5 * 255 + 0.5 * 255;
            out[offset + 2] = Math.max(0, z / w) * 255;
            out[offset + 3] = 255;
        }
    }

    context.putImageData(image, 0, 0);
    return canvas;
}

function isChannelSource(value: unknown): value is ChannelSource {
    return typeof value === "string" && (CHANNEL_SOURCES as readonly string[]).includes(value);
}

function resolveChannel(value: ChannelSource | undefined, fallback: ChannelSource): ChannelSource {
    return isChannelSource(value) ? value : fallback;
}

function channelValue(source: ChannelSource, base: Uint8Array | Uint8ClampedArray, normal: Uint8Array | null, offset: number): number {
    switch (source) {
        case "baseR":
            return base[offset];
        case "baseG":
            return base[offset + 1];
        case "baseB":
            return base[offset + 2];
        case "baseA":
            return base[offset + 3];
        case "baseLuma":
            return Math.round(base[offset] * 0.2126 + base[offset + 1] * 0.7152 + base[offset + 2] * 0.0722);
        case "normalX":
            return normal?.[offset] ?? 128;
        case "normalY":
            return normal?.[offset + 1] ?? 128;
        case "normalZ":
            return normal?.[offset + 2] ?? 255;
        case "white":
            return 255;
        case "black":
        default:
            return 0;
    }
}

/**
 * Pack base + (optional) normal pixels into RGBA by channel source.
 * Invalid channel entries fall back to base R / G / B / A respectively.
 */
export function packChannels(base: { data: Uint8Array | Uint8ClampedArray; width: number; height: number }, normal: { data: Uint8Array; width: number; height: number } | null, config: ChannelConfig): HTMLCanvasElement {
    if (!base || base.data.length % 4 !== 0) throw new TypeError("Invalid base pixels");
    if (normal && normal.data.length !== base.data.length) throw new TypeError("Pixel size mismatch");

    const width = base.width;
    const height = base.height;
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) return canvas;

    const sources: [ChannelSource, ChannelSource, ChannelSource, ChannelSource] = [resolveChannel(config.r, "baseR"), resolveChannel(config.g, "baseG"), resolveChannel(config.b, "baseB"), resolveChannel(config.a, "baseA")];
    const normalData = normal ? normal.data : null;
    const image = context.createImageData(width, height);
    const out = image.data;
    for (let i = 0; i < out.length; i += 4) {
        for (let c = 0; c < 4; c++) out[i + c] = channelValue(sources[c], base.data, normalData, i);
    }
    context.putImageData(image, 0, 0);
    return canvas;
}

// ---------- sheet export ----------

export type SheetMode = "animation" | "colors";

export interface SheetExportConfig {
    mode: SheetMode;
    frameCount: number;
    cellSize: number;
    columns: number;
    padding: number;
}

export interface SheetFrameMetadata {
    index: number;
    x: number;
    y: number;
    width: number;
    height: number;
    time?: number;
    hue?: number;
}

export interface SheetMetadata {
    textureCreateSheet: 1;
    mode: SheetMode;
    image: { width: number; height: number };
    cell: { width: number; height: number };
    count: number;
    columns: number;
    rows: number;
    padding: number;
    frames: SheetFrameMetadata[];
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
    const rn = r / 255;
    const gn = g / 255;
    const bn = b / 255;
    const max = Math.max(rn, gn, bn);
    const min = Math.min(rn, gn, bn);
    const l = (max + min) / 2;
    if (max === min) return [0, 0, l];
    const d = max - min;
    const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    let h: number;
    if (max === rn) h = (gn - bn) / d + (gn < bn ? 6 : 0);
    else if (max === gn) h = (bn - rn) / d + 2;
    else h = (rn - gn) / d + 4;
    return [h / 6, s, l];
}

function hueToRgb(n: number, e: number, t: number): number {
    let h = t;
    if (h < 0) h += 1;
    if (h > 1) h -= 1;
    if (h < 1 / 6) return n + (e - n) * 6 * h;
    if (h < 1 / 2) return e;
    if (h < 2 / 3) return n + (e - n) * (2 / 3 - h) * 6;
    return n;
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
    if (s === 0) {
        const v = Math.round(l * 255);
        return [v, v, v];
    }
    const a = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const i = 2 * l - a;
    return [Math.round(hueToRgb(i, a, h + 1 / 3) * 255), Math.round(hueToRgb(i, a, h) * 255), Math.round(hueToRgb(i, a, h - 1 / 3) * 255)];
}

/** Rotate hue by `degrees`, forcing saturation to 0.78 when the pixel is near-grayscale. */
function rotateHue(source: Uint8ClampedArray, degrees: number): Uint8ClampedArray {
    const out = new Uint8ClampedArray(source);
    const shift = ((((Number(degrees) || 0) % 360) + 360) % 360) / 360;
    for (let i = 0; i < out.length; i += 4) {
        const [h, s, l] = rgbToHsl(out[i], out[i + 1], out[i + 2]);
        const saturation = s < 0.05 ? 0.78 : s;
        const [r, g, b] = hslToRgb((h + shift) % 1, saturation, l);
        out[i] = r;
        out[i + 1] = g;
        out[i + 2] = b;
    }
    return out;
}

/**
 * Build a sprite sheet.
 * Animation mode samples `time_i = state.time + (2 * state.animSpeed) * i / frameCount` (duration 2).
 * Colors mode renders once and hue-rotates each copy by `360 * i / frameCount`.
 */
export function exportSheet(state: EditorState, layers: LayerState[], config: SheetExportConfig): { canvas: HTMLCanvasElement; metadata: SheetMetadata } {
    const frameCount = Math.max(1, Math.round(Number(config.frameCount) || 1));
    const columns = Math.max(1, Math.min(frameCount, Math.round(Number(config.columns) || 1)));
    const cellSize = Math.max(1, Math.round(Number(config.cellSize) || 1));
    const padding = Math.max(0, Math.round(Number(config.padding) || 0));
    const rows = Math.ceil(frameCount / columns);
    const width = columns * cellSize + Math.max(0, columns - 1) * padding;
    const height = rows * cellSize + Math.max(0, rows - 1) * padding;
    if (width > MAX_SHEET_EDGE || height > MAX_SHEET_EDGE) throw new Error("SHEET_TOO_LARGE");

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { willReadFrequently: config.mode === "colors" });
    if (!context) throw new Error("SHEET_CONTEXT_UNAVAILABLE");
    context.clearRect(0, 0, width, height);

    const frames: SheetFrameMetadata[] = [];
    const samples: number[] = [];
    const duration = 2;

    if (config.mode === "colors") {
        const source = renderStateToCanvas(state, layers, cellSize);
        const sourceContext = source.getContext("2d", { willReadFrequently: true });
        if (!sourceContext) {
            disposeRenderer(source);
            throw new Error("SHEET_CONTEXT_UNAVAILABLE");
        }
        const sourceData = sourceContext.getImageData(0, 0, cellSize, cellSize);
        disposeRenderer(source);
        for (let i = 0; i < frameCount; i++) {
            const hue = (360 * i) / frameCount;
            const x = (i % columns) * (cellSize + padding);
            const y = Math.floor(i / columns) * (cellSize + padding);
            const frameImage = context.createImageData(cellSize, cellSize);
            frameImage.data.set(rotateHue(sourceData.data, hue));
            context.putImageData(frameImage, x, y);
            frames.push({ index: i, x, y, width: cellSize, height: cellSize });
            samples.push(hue);
        }
    } else {
        for (let i = 0; i < frameCount; i++) {
            const time = state.time + (duration * state.animSpeed * i) / frameCount;
            const x = (i % columns) * (cellSize + padding);
            const y = Math.floor(i / columns) * (cellSize + padding);
            const frame = renderStateToCanvas({ ...state, time }, layers, cellSize);
            context.drawImage(frame, x, y, cellSize, cellSize);
            disposeRenderer(frame);
            frames.push({ index: i, x, y, width: cellSize, height: cellSize });
            samples.push(time);
        }
    }

    const metadata: SheetMetadata = {
        textureCreateSheet: 1,
        mode: config.mode,
        image: { width, height },
        cell: { width: cellSize, height: cellSize },
        count: frameCount,
        columns,
        rows,
        padding,
        frames: frames.map((frame, i) => ({ ...frame, ...(config.mode === "animation" ? { time: samples[i] } : { hue: samples[i] }) })),
    };
    return { canvas, metadata };
}

// ---------- GIF export ----------

interface GifInstance {
    addFrame(canvas: HTMLCanvasElement, options: { delay: number; copy: boolean }): void;
    on(event: "progress", handler: (progress: number) => void): void;
    on(event: "finished", handler: (blob: Blob) => void): void;
    render(): void;
}

interface GifCtor {
    new (options: { workers: number; quality: number; width: number; height: number; workerScript: string }): GifInstance;
}

function loadGifScript(): Promise<void> {
    return new Promise((resolve, reject) => {
        const existing = document.querySelector<HTMLScriptElement>("script[data-texture-gif]");
        if (existing) {
            existing.addEventListener("load", () => resolve());
            existing.addEventListener("error", () => reject(new Error("GIF_SCRIPT_LOAD_FAILED")));
            return;
        }
        const script = document.createElement("script");
        script.src = "/gif/gif.js";
        script.async = true;
        script.dataset.textureGif = "true";
        script.onload = () => resolve();
        script.onerror = () => reject(new Error("GIF_SCRIPT_LOAD_FAILED"));
        document.head.appendChild(script);
    });
}

function renderGif(Gif: GifCtor, state: EditorState, layers: LayerState[], onProgress: (pct: number) => void, done: (blob?: Blob) => void): void {
    const fps = state.gifFps || 30;
    const duration = state.gifDuration || 2;
    const frameCount = Math.floor(fps * duration);
    if (frameCount < 1) {
        done();
        return;
    }
    const delay = Math.max(1, Math.floor(1000 / fps));
    const resolution = state.resolution;
    const { canvas: glCanvas, renderer } = createRendererCanvas(resolution);
    const step = (state.animSpeed || 1) / fps;
    const seamless = state.gifSeamless === true;
    const tail = Math.floor(frameCount * 0.2);
    const tailStart = frameCount - tail;

    let gif: GifInstance;
    try {
        gif = new Gif({ workers: 2, quality: 10, width: resolution, height: resolution, workerScript: "/gif/gif.worker.js" });
    } catch {
        renderer.dispose();
        done();
        return;
    }

    let time = state.time;
    for (let i = 0; i < frameCount; i++) {
        const frameCanvas = document.createElement("canvas");
        frameCanvas.width = resolution;
        frameCanvas.height = resolution;
        const context = frameCanvas.getContext("2d");
        if (!context) {
            renderer.dispose();
            done();
            return;
        }
        context.translate(0, resolution);
        context.scale(1, -1);
        context.globalCompositeOperation = "source-over";

        if (seamless && tail > 0 && i >= tailStart) {
            const alpha = (i - tailStart) / tail;
            renderer.render({ ...state, time }, layers);
            context.globalAlpha = 1;
            context.drawImage(glCanvas, 0, 0);
            renderer.render({ ...state, time: time - duration * (state.animSpeed || 1) }, layers);
            context.globalAlpha = alpha;
            context.drawImage(glCanvas, 0, 0);
        } else {
            renderer.render({ ...state, time }, layers);
            context.globalAlpha = 1;
            context.drawImage(glCanvas, 0, 0);
        }

        gif.addFrame(frameCanvas, { delay, copy: true });
        time += step;
    }
    renderer.dispose();

    try {
        gif.on("progress", (progress) => onProgress(Math.round(progress * 100)));
        gif.on("finished", (blob) => done(blob));
        gif.render();
    } catch {
        done();
    }
}

/**
 * Build an animated GIF via the globally-loaded gif.js (`window.GIF`), injecting `/gif/gif.js` on
 * demand. `onProgress` receives a 0-100 percentage; `done` receives the blob or `undefined` when
 * the script or render fails.
 */
export function exportGif(state: EditorState, layers: LayerState[], onProgress: (pct: number) => void, done: (blob?: Blob) => void): void {
    const win = window as unknown as { GIF?: GifCtor };
    if (win.GIF) {
        renderGif(win.GIF, state, layers, onProgress, done);
        return;
    }
    loadGifScript()
        .then(() => {
            const ctor = (window as unknown as { GIF?: GifCtor }).GIF;
            if (!ctor) {
                done();
                return;
            }
            renderGif(ctor, state, layers, onProgress, done);
        })
        .catch(() => done());
}

// ---------- canvas node export ----------

function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
    return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), "image/png"));
}

/** Render the current state and drop it onto a canvas as a new image node. */
export async function exportToCanvasNode(state: EditorState, layers: LayerState[], targetCanvasId: string, nodeTitle: string): Promise<void> {
    const canvas = renderStateToCanvas(state, layers);
    try {
        const blob = await canvasToPngBlob(canvas);
        if (!blob) throw new Error("EXPORT_BLOB_FAILED");
        const file = new File([blob], "texture.png", { type: "image/png" });
        const uploaded = await uploadImage(file);
        const spec = NODE_DEFAULT_SIZE[CanvasNodeType.Image];
        const size = fitNodeSize(uploaded.width, uploaded.height, spec.width, spec.height);
        const node: CanvasNodeData = {
            id: nanoid(),
            type: CanvasNodeType.Image,
            title: nodeTitle,
            position: { x: 80, y: 80 },
            width: size.width,
            height: size.height,
            metadata: { ...imageMetadata(uploaded), naturalWidth: uploaded.width, naturalHeight: uploaded.height, mimeType: uploaded.mimeType },
        };
        const project = useCanvasStore.getState().openProject(targetCanvasId);
        const nodes = project?.nodes ?? [];
        useCanvasStore.getState().updateProject(targetCanvasId, { nodes: [...nodes, node] });
    } finally {
        disposeRenderer(canvas);
    }
}
