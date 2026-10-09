import {
    addPixelFrame,
    addPixelLayer,
    createPixelDoc,
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
    setPalette,
} from "@/lib/canvas/pixel/document";
import type { CanvasPixelBlend, CanvasPixelDoc } from "@/types/canvas";

// Flat `{ ns: "pixel", type, ...fields }` ops for the pixel-art document; ids / durations are optional so callers can
// drive the pure reducer deterministically (the nanoid fallback only runs when they are omitted).
export type PixelAgentOp =
    | { type: "doc.create"; width: number; height: number; palette?: string[] }
    | { type: "doc.setSize"; width: number; height: number }
    | { type: "doc.setFps"; fps: number }
    | { type: "doc.setBackground"; background: string }
    | { type: "palette.set"; colors: string[] }
    | { type: "layer.add"; id?: string; name?: string }
    | { type: "layer.remove"; id: string }
    | { type: "layer.move"; id: string; direction: "forward" | "backward" }
    | { type: "layer.patch"; id: string; patch: { name?: string; visible?: boolean; opacity?: number; blend?: CanvasPixelBlend } }
    | { type: "frame.add"; id?: string; durationMs?: number }
    | { type: "frame.remove"; id: string }
    | { type: "frame.duplicate"; id: string; newId?: string }
    | { type: "frame.move"; id: string; direction: "forward" | "backward" }
    | { type: "frame.patch"; id: string; patch: { durationMs?: number } };

/**
 * Ops the pixel studio runs through its own async handlers (bitmap work / blob storage); the reducer keeps them out of
 * the document fold. Their shapes:
 * - `pixels.set`  { points: { x, y, color }[], layerId?, frameId? }
 * - `region.set`  { x, y, width, height, data: base64 PNG, layerId?, frameId? }
 * - `region.get`  { x, y, width, height, layerId?, frameId? }
 * - `fill`        { x, y, color, tolerance?, layerId?, frameId? }
 * - `shape`       { shape: "line" | "rect" | "ellipse", color, x?, y?, x2?, y2?, width?, height?, rx?, ry?, filled?, layerId?, frameId? }
 * - `image.load`  { dataUrl, fit?: "stretch" | "contain" | "nearest", layerId?, frameId? }
 * - `export`      { format: "png" | "spritesheet", scale? }
 */
export const PIXEL_AGENT_ASYNC_TYPES: string[] = ["pixels.set", "region.set", "region.get", "fill", "shape", "image.load", "export"];

const BLEND_ENUM: CanvasPixelBlend[] = ["normal", "multiply", "screen", "overlay", "add"];
const DIRECTION_ENUM = ["forward", "backward"];

const LAYER_PATCH_SCHEMA = { type: "object", properties: { name: { type: "string" }, visible: { type: "boolean" }, opacity: { type: "number" }, blend: { type: "string", enum: BLEND_ENUM } } };

const POINT_SCHEMA = { type: "object", properties: { x: { type: "number" }, y: { type: "number" } }, required: ["x", "y"] };

// JSON Schema discriminated union on `type`; each variant pins `ns` to "pixel".
function pixelOpVariant(type: string, properties: Record<string, unknown>, required: string[] = []) {
    return {
        type: "object",
        properties: { ns: { const: "pixel" }, type: { const: type }, ...properties },
        required: ["ns", "type", ...required],
        additionalProperties: true,
    };
}

const PIXEL_OP_SPECS: { type: string; required?: string[]; properties: Record<string, unknown> }[] = [
    { type: "doc.create", required: ["width", "height"], properties: { width: { type: "number" }, height: { type: "number" }, palette: { type: "array", items: { type: "string" } } } },
    { type: "doc.setSize", required: ["width", "height"], properties: { width: { type: "number" }, height: { type: "number" } } },
    { type: "doc.setFps", required: ["fps"], properties: { fps: { type: "number" } } },
    { type: "doc.setBackground", required: ["background"], properties: { background: { type: "string" } } },
    { type: "palette.set", required: ["colors"], properties: { colors: { type: "array", items: { type: "string" } } } },
    { type: "layer.add", properties: { id: { type: "string" }, name: { type: "string" } } },
    { type: "layer.remove", required: ["id"], properties: { id: { type: "string" } } },
    { type: "layer.move", required: ["id", "direction"], properties: { id: { type: "string" }, direction: { type: "string", enum: DIRECTION_ENUM } } },
    { type: "layer.patch", required: ["id", "patch"], properties: { id: { type: "string" }, patch: LAYER_PATCH_SCHEMA } },
    { type: "frame.add", properties: { id: { type: "string" }, durationMs: { type: "number" } } },
    { type: "frame.remove", required: ["id"], properties: { id: { type: "string" } } },
    { type: "frame.duplicate", required: ["id"], properties: { id: { type: "string" }, newId: { type: "string" } } },
    { type: "frame.move", required: ["id", "direction"], properties: { id: { type: "string" }, direction: { type: "string", enum: DIRECTION_ENUM } } },
    { type: "frame.patch", required: ["id", "patch"], properties: { id: { type: "string" }, patch: { type: "object", properties: { durationMs: { type: "number" } } } } },
];

const PIXEL_ASYNC_OP_SPECS: { type: string; required?: string[]; properties: Record<string, unknown> }[] = [
    { type: "pixels.set", required: ["points"], properties: { points: { type: "array", items: { type: "object", properties: { x: { type: "number" }, y: { type: "number" }, color: { type: "string" } }, required: ["x", "y", "color"] } }, layerId: { type: "string" }, frameId: { type: "string" } } },
    { type: "region.set", required: ["x", "y", "width", "height", "data"], properties: { x: { type: "number" }, y: { type: "number" }, width: { type: "number" }, height: { type: "number" }, data: { type: "string" }, layerId: { type: "string" }, frameId: { type: "string" } } },
    { type: "region.get", required: ["x", "y", "width", "height"], properties: { x: { type: "number" }, y: { type: "number" }, width: { type: "number" }, height: { type: "number" }, layerId: { type: "string" }, frameId: { type: "string" } } },
    { type: "fill", required: ["x", "y", "color"], properties: { x: { type: "number" }, y: { type: "number" }, color: { type: "string" }, tolerance: { type: "number" }, layerId: { type: "string" }, frameId: { type: "string" } } },
    { type: "shape", required: ["shape", "color"], properties: { shape: { type: "string", enum: ["line", "rect", "ellipse"] }, color: { type: "string" }, x: { type: "number" }, y: { type: "number" }, x2: { type: "number" }, y2: { type: "number" }, width: { type: "number" }, height: { type: "number" }, rx: { type: "number" }, ry: { type: "number" }, filled: { type: "boolean" }, layerId: { type: "string" }, frameId: { type: "string" } } },
    { type: "image.load", required: ["dataUrl"], properties: { dataUrl: { type: "string" }, fit: { type: "string", enum: ["stretch", "contain", "nearest"] }, layerId: { type: "string" }, frameId: { type: "string" } } },
    { type: "export", required: ["format"], properties: { format: { type: "string", enum: ["png", "spritesheet"] }, scale: { type: "number" } } },
];

export const PIXEL_AGENT_OP_TYPES = PIXEL_OP_SPECS.map((spec) => spec.type);

export const PIXEL_AGENT_SCHEMA: Record<string, unknown> = {
    type: "object",
    oneOf: [...PIXEL_OP_SPECS, ...PIXEL_ASYNC_OP_SPECS].map((spec) => pixelOpVariant(spec.type, spec.properties, spec.required)),
};

export type PixelAgentInput = { doc: CanvasPixelDoc };

export type PixelAgentResult = { doc: CanvasPixelDoc };

/** Pure fold of `pixel` ops over one pixel document; the studio owns commit, async bitmap ops and persistence. */
export function applyPixelAgentOps(input: PixelAgentInput, ops?: PixelAgentOp[]): PixelAgentResult {
    let doc = input.doc;
    (Array.isArray(ops) ? ops : []).forEach((op) => {
        if (!op?.type) return;
        if (op.type === "doc.create") doc = createPixelDoc(op.width, op.height, op.palette);
        if (op.type === "doc.setSize") doc = setDocSize(doc, op.width, op.height);
        if (op.type === "doc.setFps") doc = setDocFps(doc, op.fps);
        if (op.type === "doc.setBackground") doc = setDocBackground(doc, op.background);
        if (op.type === "palette.set") doc = setPalette(doc, op.colors);
        if (op.type === "layer.add") doc = addPixelLayer(doc, op.id, op.name);
        if (op.type === "layer.remove") doc = removePixelLayer(doc, op.id);
        if (op.type === "layer.move") doc = movePixelLayer(doc, op.id, op.direction);
        if (op.type === "layer.patch") doc = patchPixelLayer(doc, op.id, op.patch);
        if (op.type === "frame.add") doc = addPixelFrame(doc, op.id, op.durationMs);
        if (op.type === "frame.remove") doc = removePixelFrame(doc, op.id);
        if (op.type === "frame.duplicate") doc = duplicatePixelFrame(doc, op.id, op.newId);
        if (op.type === "frame.move") doc = movePixelFrame(doc, op.id, op.direction);
        if (op.type === "frame.patch") doc = patchPixelFrame(doc, op.id, op.patch);
    });
    return { doc };
}
