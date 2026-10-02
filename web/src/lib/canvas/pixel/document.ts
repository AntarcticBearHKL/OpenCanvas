import { nanoid } from "nanoid";

import { DEFAULT_PIXEL_PALETTE, type CanvasPixelDoc, type CanvasPixelFrame, type CanvasPixelLayer } from "@/types/canvas";

const DEFAULT_FRAME_MS = 100;
const MIN_SIZE = 1;

function patchDoc(doc: CanvasPixelDoc, patch: Partial<CanvasPixelDoc>): CanvasPixelDoc {
    return { ...doc, ...patch };
}

function patchLayer(layers: CanvasPixelLayer[], id: string, patch: Partial<CanvasPixelLayer>): CanvasPixelLayer[] {
    return layers.map((layer) => (layer.id === id ? { ...layer, ...patch } : layer));
}

function swap<T>(items: T[], id: string, direction: "forward" | "backward", idOf: (item: T) => string): T[] {
    const index = items.findIndex((item) => idOf(item) === id);
    const target = index + (direction === "forward" ? 1 : -1);
    if (index < 0 || target < 0 || target >= items.length) return items;
    const next = [...items];
    [next[index], next[target]] = [next[target], next[index]];
    return next;
}

export function createPixelDoc(width: number, height: number, palette?: string[]): CanvasPixelDoc {
    const layerId = "layer-1";
    const layer: CanvasPixelLayer = { id: layerId, name: layerId, visible: true, opacity: 1, blend: "normal" };
    const frame: CanvasPixelFrame = { id: "frame-1", durationMs: DEFAULT_FRAME_MS, cels: { [layerId]: {} } };
    return { width: Math.max(MIN_SIZE, Math.round(width)), height: Math.max(MIN_SIZE, Math.round(height)), palette: palette ? [...palette] : [...DEFAULT_PIXEL_PALETTE], layers: [layer], frames: [frame], fps: 10, background: "transparent" };
}

export function findPixelLayer(doc: CanvasPixelDoc, id: string): CanvasPixelLayer | undefined {
    return doc.layers.find((layer) => layer.id === id);
}

export function addPixelLayer(doc: CanvasPixelDoc, id = nanoid(), name?: string): CanvasPixelDoc {
    const layer: CanvasPixelLayer = { id, name: name ?? id, visible: true, opacity: 1, blend: "normal" };
    return patchDoc(doc, { layers: [...doc.layers, layer], frames: doc.frames.map((frame) => ({ ...frame, cels: { ...frame.cels, [id]: {} } })) });
}

export function removePixelLayer(doc: CanvasPixelDoc, id: string): CanvasPixelDoc {
    if (doc.layers.length <= 1 || !findPixelLayer(doc, id)) return doc;
    return patchDoc(doc, {
        layers: doc.layers.filter((layer) => layer.id !== id),
        frames: doc.frames.map((frame) => {
            const cels = { ...frame.cels };
            delete cels[id];
            return { ...frame, cels };
        }),
    });
}

export function movePixelLayer(doc: CanvasPixelDoc, id: string, direction: "forward" | "backward"): CanvasPixelDoc {
    const layers = swap(doc.layers, id, direction, (layer) => layer.id);
    return layers === doc.layers ? doc : patchDoc(doc, { layers });
}

export function patchPixelLayer(doc: CanvasPixelDoc, id: string, patch: Partial<CanvasPixelLayer>): CanvasPixelDoc {
    if (!findPixelLayer(doc, id)) return doc;
    return patchDoc(doc, { layers: patchLayer(doc.layers, id, patch) });
}

export function addPixelFrame(doc: CanvasPixelDoc, id = nanoid(), durationMs = DEFAULT_FRAME_MS): CanvasPixelDoc {
    const frame: CanvasPixelFrame = { id, durationMs, cels: Object.fromEntries(doc.layers.map((layer) => [layer.id, {}])) };
    return patchDoc(doc, { frames: [...doc.frames, frame] });
}

export function removePixelFrame(doc: CanvasPixelDoc, id: string): CanvasPixelDoc {
    if (doc.frames.length <= 1 || !doc.frames.some((frame) => frame.id === id)) return doc;
    return patchDoc(doc, { frames: doc.frames.filter((frame) => frame.id !== id) });
}

export function duplicatePixelFrame(doc: CanvasPixelDoc, id: string, newId = nanoid()): CanvasPixelDoc {
    const index = doc.frames.findIndex((frame) => frame.id === id);
    if (index < 0) return doc;
    const source = doc.frames[index];
    const copy: CanvasPixelFrame = { ...source, id: newId, cels: Object.fromEntries(Object.entries(source.cels).map(([layerId, cel]) => [layerId, { ...cel }])) };
    return patchDoc(doc, { frames: [...doc.frames.slice(0, index + 1), copy, ...doc.frames.slice(index + 1)] });
}

export function movePixelFrame(doc: CanvasPixelDoc, id: string, direction: "forward" | "backward"): CanvasPixelDoc {
    const frames = swap(doc.frames, id, direction, (frame) => frame.id);
    return frames === doc.frames ? doc : patchDoc(doc, { frames });
}

export function patchPixelFrame(doc: CanvasPixelDoc, id: string, patch: { durationMs?: number }): CanvasPixelDoc {
    if (!doc.frames.some((frame) => frame.id === id)) return doc;
    return patchDoc(doc, { frames: doc.frames.map((frame) => (frame.id === id ? { ...frame, ...patch } : frame)) });
}

export function setFrameCel(doc: CanvasPixelDoc, frameId: string, layerId: string, storageKey?: string): CanvasPixelDoc {
    if (!doc.frames.some((frame) => frame.id === frameId) || !findPixelLayer(doc, layerId)) return doc;
    const cel = storageKey ? { storageKey } : {};
    return patchDoc(doc, { frames: doc.frames.map((frame) => (frame.id === frameId ? { ...frame, cels: { ...frame.cels, [layerId]: cel } } : frame)) });
}

export function setPalette(doc: CanvasPixelDoc, palette: string[]): CanvasPixelDoc {
    return patchDoc(doc, { palette: [...palette] });
}

export function setDocSize(doc: CanvasPixelDoc, width: number, height: number): CanvasPixelDoc {
    return patchDoc(doc, { width: Math.max(MIN_SIZE, Math.round(width)), height: Math.max(MIN_SIZE, Math.round(height)) });
}

export function setDocFps(doc: CanvasPixelDoc, fps: number): CanvasPixelDoc {
    return patchDoc(doc, { fps: Math.max(1, Math.round(fps)) });
}

export function setDocBackground(doc: CanvasPixelDoc, background: string): CanvasPixelDoc {
    return patchDoc(doc, { background });
}
