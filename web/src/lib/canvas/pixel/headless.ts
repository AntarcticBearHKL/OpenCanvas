import { nanoid } from "nanoid";

import {
    addPixelFrame,
    addPixelLayer,
    duplicatePixelFrame,
    movePixelFrame,
    movePixelLayer,
    patchPixelFrame,
    patchPixelLayer,
    removePixelFrame,
    removePixelLayer,
    setDocBackground,
    setDocFps,
    setDocSize,
    setFrameCel,
    setPalette,
} from "@/lib/canvas/pixel/document";
import { blobToBuffer, bufferToPngBlob } from "@/lib/canvas/pixel/io";
import { drawEllipse, drawLine, drawRect, floodFill, hexToRgba, makeBuffer, setPixel } from "@/lib/canvas/pixel/raster";
import { getImageBlob, uploadImage } from "@/services/image-storage";
import { usePixelStore } from "@/stores/use-pixel-store";
import type { CanvasPixelDoc, CanvasPixelLayer } from "@/types/canvas";

export type PixelOp = Record<string, unknown> & { type?: string };

export type HeadlessPixelResult = { projectId: string; applied: number };

const DEFAULT_FRAME_MS = 100;

const num = (value: unknown, fallback: number) => (Number.isFinite(Number(value)) ? Number(value) : fallback);

/** Apply pixel ops directly against the pixel store + image storage, without any editor mounted. */
export async function runHeadlessPixelOps(projectId: string | undefined, ops: PixelOp[]): Promise<HeadlessPixelResult> {
    const store = usePixelStore.getState();
    let id = projectId || "";
    let doc: CanvasPixelDoc;
    const existing = id ? store.projects.find((project) => project.id === id) : undefined;
    if (existing) {
        doc = existing.doc;
    } else {
        const created = (ops.find((op) => op.type === "doc.create") ?? {}) as PixelOp;
        id = store.createProject(undefined, { width: num(created.width, 64), height: num(created.height, 64) });
        doc = usePixelStore.getState().projects.find((project) => project.id === id)!.doc;
    }

    const buffers = new Map<string, Uint8ClampedArray>();
    const dirty = new Set<string>();
    const frameOf = (op: PixelOp) => String(op.frameId || "") || doc.frames[0]?.id || "";
    const layerOf = (op: PixelOp) => String(op.layerId || "") || doc.layers[0]?.id || "";
    const keyOf = (frameId: string, layerId: string) => `${frameId}:${layerId}`;
    const loadBuffer = async (frameId: string, layerId: string) => {
        const key = keyOf(frameId, layerId);
        const cached = buffers.get(key);
        if (cached) return cached;
        const cel = doc.frames.find((frame) => frame.id === frameId)?.cels[layerId];
        const blob = cel?.storageKey ? await getImageBlob(cel.storageKey) : undefined;
        const buffer = blob ? await blobToBuffer(blob, doc.width, doc.height) : makeBuffer(doc.width, doc.height);
        buffers.set(key, buffer);
        return buffer;
    };

    let applied = 0;
    for (const op of ops) {
        const type = String(op.type || "");
        const frameId = frameOf(op);
        const layerId = layerOf(op);
        switch (type) {
            case "doc.create":
            case "doc.setSize": {
                doc = setDocSize(doc, num(op.width, doc.width), num(op.height, doc.height));
                if (type === "doc.create" && Array.isArray(op.palette)) doc = setPalette(doc, op.palette as string[]);
                buffers.clear();
                dirty.clear();
                applied++;
                break;
            }
            case "doc.setFps":
                doc = setDocFps(doc, num(op.fps, doc.fps));
                applied++;
                break;
            case "doc.setBackground":
                doc = setDocBackground(doc, String(op.background ?? "transparent"));
                applied++;
                break;
            case "palette.set":
                doc = setPalette(doc, (op.colors as string[]) || []);
                applied++;
                break;
            case "layer.add":
                doc = addPixelLayer(doc, String(op.id || nanoid()), op.name ? String(op.name) : undefined);
                applied++;
                break;
            case "layer.remove":
                doc = removePixelLayer(doc, String(op.id));
                applied++;
                break;
            case "layer.move":
                doc = movePixelLayer(doc, String(op.id), op.direction === "forward" ? "forward" : "backward");
                applied++;
                break;
            case "layer.patch":
                doc = patchPixelLayer(doc, String(op.id), (op.patch as Partial<CanvasPixelLayer>) || {});
                applied++;
                break;
            case "frame.add":
                doc = addPixelFrame(doc, String(op.id || nanoid()), num(op.durationMs, DEFAULT_FRAME_MS));
                applied++;
                break;
            case "frame.remove":
                doc = removePixelFrame(doc, String(op.id));
                applied++;
                break;
            case "frame.duplicate":
                doc = duplicatePixelFrame(doc, String(op.id), String(op.newId || nanoid()));
                applied++;
                break;
            case "frame.move":
                doc = movePixelFrame(doc, String(op.id), op.direction === "forward" ? "forward" : "backward");
                applied++;
                break;
            case "frame.patch": {
                const patch = (op.patch as { durationMs?: number }) || {};
                doc = patchPixelFrame(doc, String(op.id), Number.isFinite(Number(patch.durationMs)) ? { durationMs: Number(patch.durationMs) } : {});
                applied++;
                break;
            }
            case "pixels.set": {
                const buffer = await loadBuffer(frameId, layerId);
                const points = Array.isArray(op.points) ? op.points : [];
                for (const point of points) {
                    const item = point as { x?: number; y?: number; color?: string };
                    setPixel(buffer, doc.width, doc.height, num(item.x, -1), num(item.y, -1), hexToRgba(String(item.color)));
                }
                dirty.add(keyOf(frameId, layerId));
                applied++;
                break;
            }
            case "fill": {
                const buffer = await loadBuffer(frameId, layerId);
                floodFill(buffer, doc.width, doc.height, num(op.x, -1), num(op.y, -1), hexToRgba(String(op.color)), num(op.tolerance, 0));
                dirty.add(keyOf(frameId, layerId));
                applied++;
                break;
            }
            case "shape": {
                const buffer = await loadBuffer(frameId, layerId);
                const rgba = hexToRgba(String(op.color));
                const shape = String(op.shape || "");
                if (shape === "line") drawLine(buffer, doc.width, doc.height, num(op.x, 0), num(op.y, 0), num(op.x2, 0), num(op.y2, 0), rgba);
                else if (shape === "rect") drawRect(buffer, doc.width, doc.height, num(op.x, 0), num(op.y, 0), num(op.width, 0), num(op.height, 0), rgba, op.filled !== false);
                else if (shape === "ellipse") drawEllipse(buffer, doc.width, doc.height, num(op.x, 0), num(op.y, 0), num(op.rx, 0), num(op.ry, 0), rgba, op.filled !== false);
                dirty.add(keyOf(frameId, layerId));
                applied++;
                break;
            }
            default:
                throw new Error(`未知像素操作：${type}`);
        }
    }

    let committed = doc;
    for (const key of dirty) {
        const [frameId, layerId] = key.split(":");
        const buffer = buffers.get(key);
        if (!buffer) continue;
        const uploaded = await uploadImage(await bufferToPngBlob(buffer, doc.width, doc.height));
        if (uploaded.storageKey) committed = setFrameCel(committed, frameId, layerId, uploaded.storageKey);
    }
    usePixelStore.getState().updateProject(id, { doc: committed });
    return { projectId: id, applied };
}
