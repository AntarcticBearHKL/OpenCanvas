import { createCanvasContext } from "@/lib/canvas/canvas-2d";
import { psBoxUnion, psRotatePoint } from "@/lib/canvas/smart-canvas";
import { psBitmapSize, psCanvasToBlob, psLoadLayerBitmap } from "@/components/canvas/workspace/ps-paint";
import { uploadImage } from "@/services/image-storage";
import type { CanvasPsLayer } from "@/types/canvas";

export type PsDocBox = { x: number; y: number; width: number; height: number };
export type PsCanvasAnchor = "top-left" | "top" | "top-right" | "left" | "center" | "right" | "bottom-left" | "bottom" | "bottom-right";

export function psScaleLayers(layers: CanvasPsLayer[], sx: number, sy: number) {
    const textScale = (sx + sy) / 2;
    return layers.map((layer) => ({
        ...layer,
        x: layer.x * sx,
        y: layer.y * sy,
        width: Math.max(1, layer.width * sx),
        height: Math.max(1, layer.height * sy),
        fontSize: layer.fontSize ? Math.max(1, Math.round(layer.fontSize * textScale)) : layer.fontSize,
    }));
}

export function psOffsetLayers(layers: CanvasPsLayer[], dx: number, dy: number) {
    return layers.map((layer) => ({ ...layer, x: layer.x + dx, y: layer.y + dy }));
}

/** Rotates every layer around the document centre and grows the canvas to the rotated document's bounding box. */
export function psRotateLayers(layers: CanvasPsLayer[], degrees: number, width: number, height: number) {
    const centre = { x: width / 2, y: height / 2 };
    const corners = [[0, 0], [width, 0], [width, height], [0, height]].map(([x, y]) => psRotatePoint(x, y, centre, degrees));
    const box = psBoxUnion(corners.map((point) => ({ x: point.x, y: point.y, width: 0, height: 0 })))!;
    const rotated = layers.map((layer) => {
        const next = psRotatePoint(layer.x + layer.width / 2, layer.y + layer.height / 2, centre, degrees);
        return { ...layer, x: next.x - layer.width / 2 - box.x, y: next.y - layer.height / 2 - box.y, rotation: layer.rotation + degrees };
    });
    return { layers: rotated, width: Math.max(1, Math.round(box.width)), height: Math.max(1, Math.round(box.height)) };
}

/** Trim keeps the union of the visible layers' boxes (the uniform empty border), clamped to the document; adjustment layers have no pixels of their own. */
export function psTrimBox(layers: CanvasPsLayer[], width: number, height: number): PsDocBox {
    const box = psBoxUnion(layers.filter((layer) => !layer.hidden && layer.kind !== "adjustment").map((layer) => ({ x: layer.x, y: layer.y, width: layer.width, height: layer.height })));
    if (!box) return { x: 0, y: 0, width, height };
    const x = Math.max(0, Math.floor(box.x));
    const y = Math.max(0, Math.floor(box.y));
    const right = Math.min(width, Math.ceil(box.x + box.width));
    const bottom = Math.min(height, Math.ceil(box.y + box.height));
    return right <= x || bottom <= y ? { x: 0, y: 0, width, height } : { x, y, width: right - x, height: bottom - y };
}

export function psAnchorOffset(anchor: PsCanvasAnchor, width: number, height: number, nextWidth: number, nextHeight: number) {
    const dx = width - nextWidth;
    const dy = height - nextHeight;
    return {
        dx: anchor.includes("left") ? 0 : anchor.includes("right") ? dx : dx / 2,
        dy: anchor.startsWith("top") ? 0 : anchor.startsWith("bottom") ? dy : dy / 2,
    };
}

export async function psResampleLayerBitmaps(layers: CanvasPsLayer[]) {
    return Promise.all(
        layers.map(async (layer) => {
            if (!layer.storageKey && !layer.maskStorageKey) return layer;
            const next = { ...layer };
            if (layer.storageKey) next.storageKey = (await psResampleBitmap(layer.storageKey, layer.width, layer.height)) || layer.storageKey;
            if (layer.maskStorageKey) next.maskStorageKey = (await psResampleBitmap(layer.maskStorageKey, layer.width, layer.height)) || layer.maskStorageKey;
            return next;
        }),
    );
}

async function psResampleBitmap(storageKey: string, width: number, height: number) {
    const image = await psLoadLayerBitmap(storageKey);
    if (!image) return "";
    const { canvas, context } = createCanvasContext(psBitmapSize(width), psBitmapSize(height));
    if (!context) return "";
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const blob = await psCanvasToBlob(canvas);
    if (!blob) return "";
    return (await uploadImage(blob)).storageKey || "";
}
