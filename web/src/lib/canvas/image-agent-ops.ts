import { nanoid } from "nanoid";

import i18n from "@/i18n";
import type { PsFilterParams, PsFilterType } from "@/components/canvas/workspace/ps-filters";
import { psAnchorOffset, psOffsetLayers, psRotateLayers, psScaleLayers, psTrimBox, type PsCanvasAnchor } from "@/components/canvas/workspace/ps-image-ops";
import { addPsLayer, addPsLayerAbove, duplicatePsLayer, ensurePsLayerStyle, findPsLayer, groupPsLayers, movePsLayerStep, movePsLayerTo, patchPsLayer, patchPsLayerStyle, psLayerCentre, rasterizePsLayer, removePsLayer, rotatePsLayer, scalePsLayer, translatePsLayer, ungroupPsLayer } from "@/components/canvas/workspace/ps-layer-ops";
import { clampLayerOpacity } from "@/lib/canvas/blend-modes";
import { PS_ADJUSTMENT_NAME_KEYS, PS_ADJUSTMENT_TYPES } from "@/lib/canvas/ps-adjustments";
import { PS_LAYER_STYLE_TYPES } from "@/lib/canvas/ps-layer-styles";
import { BOARD_LAYOUT_TEMPLATES, PS_SHAPE_KINDS, arrangePsLayers, createPsAdjustmentLayer, createPsImageLayer, createPsPixelLayer, createPsShapeLayer, createPsTextLayer, smartCanvasLayers, smartCanvasSizeForRatio, type BoardLayoutTemplate, type SmartCanvasResolution } from "@/lib/canvas/smart-canvas";
import type { CanvasNodeData, CanvasNodeMetadata, CanvasPsAdjustmentType, CanvasPsLayer, CanvasPsLayerStyleType, CanvasPsParamValue, CanvasPsShapeKind } from "@/types/canvas";

// Flat `{ ns: "image", type, ...fields }` ops for the Smart Canvas layer document; ids / names are optional so
// callers can drive the pure reducer deterministically (the nanoid fallback only runs when they are omitted).
export type ImageAgentOp =
    | { type: "layer.add"; layer: CanvasPsLayer; groupId?: string }
    | { type: "layer.addAbove"; layer: CanvasPsLayer; targetId?: string }
    | { type: "layer.remove"; id: string }
    | { type: "layer.duplicate"; id: string; copyId?: string; suffix?: string }
    | { type: "layer.group"; ids: string[]; groupId?: string; name?: string }
    | { type: "layer.ungroup"; id: string }
    | { type: "layer.moveTo"; id: string; targetId: string; position?: "before" | "after" | "into" }
    | { type: "layer.moveStep"; id: string; direction: "forward" | "backward" }
    | { type: "layer.translate"; id: string; dx: number; dy: number }
    | { type: "layer.rotate"; id: string; degrees: number; centre?: { x: number; y: number } }
    | { type: "layer.scale"; id: string; sx: number; sy: number; anchor?: { x: number; y: number } }
    | { type: "layer.patch"; id: string; patch: Partial<CanvasPsLayer> }
    | { type: "layer.patchStyle"; id: string; styleId: string; patch: { enabled?: boolean; params?: Record<string, CanvasPsParamValue> } }
    | { type: "layer.ensureStyle"; id: string; style: CanvasPsLayerStyleType }
    | { type: "layer.rasterize"; id: string; storageKey: string }
    | { type: "layer.create.pixel"; id?: string; name?: string }
    | { type: "layer.create.text"; text: string; id?: string; name?: string }
    | { type: "layer.create.shape"; shape: CanvasPsShapeKind; box: { x: number; y: number; width: number; height: number }; id?: string; name?: string; fill?: string; stroke?: string; strokeWidth?: number }
    | { type: "layer.create.adjustment"; adjustment: CanvasPsAdjustmentType; id?: string; name?: string }
    | { type: "layer.create.image"; nodeId: string; id?: string; name?: string }
    | { type: "board.arrange"; template?: BoardLayoutTemplate }
    | { type: "image.scaleLayers"; sx: number; sy: number }
    | { type: "image.offsetLayers"; dx: number; dy: number }
    | { type: "image.rotateLayers"; degrees: number }
    | { type: "image.trimBox"; width?: number; height?: number }
    | { type: "image.anchorOffset"; anchor: PsCanvasAnchor; width: number; height: number; nextWidth: number; nextHeight: number }
    | { type: "document.imageSize"; width: number; height: number }
    | { type: "document.canvasSize"; width: number; height: number; anchor: PsCanvasAnchor }
    | { type: "document.rotate"; degrees: number }
    | { type: "document.trim" }
    | { type: "document.setRatio"; ratio: string }
    | { type: "document.setResolution"; resolution: SmartCanvasResolution }
    | { type: "document.setBackground"; background: string; opacity?: number }
    | { type: "filter.apply"; filter: PsFilterType; params?: PsFilterParams }
    | { type: "document.compose" }
    | { type: "document.export" };

/** Ops the image studio runs through its own async handlers (bitmap work / upload); the reducer keeps them out of the layer fold. */
export const IMAGE_AGENT_ASYNC_TYPES: string[] = ["filter.apply", "document.compose", "document.export"];

const POINT_SCHEMA = { type: "object", properties: { x: { type: "number" }, y: { type: "number" } }, required: ["x", "y"] };

const BOX_SCHEMA = { type: "object", properties: { x: { type: "number" }, y: { type: "number" }, width: { type: "number" }, height: { type: "number" } }, required: ["x", "y", "width", "height"] };

const LAYER_SCHEMA: Record<string, unknown> = {
    type: "object",
    properties: {
        id: { type: "string" },
        name: { type: "string" },
        kind: { type: "string", enum: ["image", "text", "group", "pixel", "shape", "adjustment"] },
        sourceNodeId: { type: "string" },
        storageKey: { type: "string" },
        maskStorageKey: { type: "string" },
        adjustment: { type: "string", enum: PS_ADJUSTMENT_TYPES },
        adjustmentParams: { type: "object", additionalProperties: true },
        styles: { type: "array", items: { type: "object", additionalProperties: true } },
        text: { type: "string" },
        shape: { type: "string", enum: PS_SHAPE_KINDS },
        shapeRadius: { type: "number" },
        shapeSides: { type: "number" },
        shapeFill: { type: "string" },
        shapeStroke: { type: "string" },
        shapeStrokeWidth: { type: "number" },
        x: { type: "number" },
        y: { type: "number" },
        width: { type: "number" },
        height: { type: "number" },
        rotation: { type: "number" },
        opacity: { type: "number" },
        blendMode: { type: "string" },
        hidden: { type: "boolean" },
        locked: { type: "boolean" },
        fontSize: { type: "number" },
        color: { type: "string" },
        fontFamily: { type: "string" },
        children: { type: "array", items: { type: "string" } },
    },
    required: ["id", "name", "kind", "x", "y", "width", "height"],
};

const CANVAS_ANCHORS: PsCanvasAnchor[] = ["top-left", "top", "top-right", "left", "center", "right", "bottom-left", "bottom", "bottom-right"];

// JSON Schema discriminated union on `type`; each variant pins `ns` to "image".
function imageOpVariant(type: string, properties: Record<string, unknown>, required: string[] = []) {
    return {
        type: "object",
        properties: { ns: { const: "image" }, type: { const: type }, ...properties },
        required: ["ns", "type", ...required],
        additionalProperties: true,
    };
}

const IMAGE_OP_SPECS: { type: string; required?: string[]; properties: Record<string, unknown> }[] = [
    { type: "layer.add", required: ["layer"], properties: { layer: LAYER_SCHEMA, groupId: { type: "string" } } },
    { type: "layer.addAbove", required: ["layer"], properties: { layer: LAYER_SCHEMA, targetId: { type: "string" } } },
    { type: "layer.remove", required: ["id"], properties: { id: { type: "string" } } },
    { type: "layer.duplicate", required: ["id"], properties: { id: { type: "string" }, copyId: { type: "string" }, suffix: { type: "string" } } },
    { type: "layer.group", required: ["ids"], properties: { ids: { type: "array", items: { type: "string" } }, groupId: { type: "string" }, name: { type: "string" } } },
    { type: "layer.ungroup", required: ["id"], properties: { id: { type: "string" } } },
    { type: "layer.moveTo", required: ["id", "targetId"], properties: { id: { type: "string" }, targetId: { type: "string" }, position: { type: "string", enum: ["before", "after", "into"] } } },
    { type: "layer.moveStep", required: ["id", "direction"], properties: { id: { type: "string" }, direction: { type: "string", enum: ["forward", "backward"] } } },
    { type: "layer.translate", required: ["id", "dx", "dy"], properties: { id: { type: "string" }, dx: { type: "number" }, dy: { type: "number" } } },
    { type: "layer.rotate", required: ["id", "degrees"], properties: { id: { type: "string" }, degrees: { type: "number" }, centre: POINT_SCHEMA } },
    { type: "layer.scale", required: ["id", "sx", "sy"], properties: { id: { type: "string" }, sx: { type: "number" }, sy: { type: "number" }, anchor: POINT_SCHEMA } },
    { type: "layer.patch", required: ["id", "patch"], properties: { id: { type: "string" }, patch: { type: "object", additionalProperties: true } } },
    { type: "layer.patchStyle", required: ["id", "styleId", "patch"], properties: { id: { type: "string" }, styleId: { type: "string" }, patch: { type: "object", properties: { enabled: { type: "boolean" }, params: { type: "object", additionalProperties: true } } } } },
    { type: "layer.ensureStyle", required: ["id", "style"], properties: { id: { type: "string" }, style: { type: "string", enum: PS_LAYER_STYLE_TYPES } } },
    { type: "layer.rasterize", required: ["id", "storageKey"], properties: { id: { type: "string" }, storageKey: { type: "string" } } },
    { type: "layer.create.pixel", properties: { id: { type: "string" }, name: { type: "string" } } },
    { type: "layer.create.text", required: ["text"], properties: { text: { type: "string" }, id: { type: "string" }, name: { type: "string" } } },
    { type: "layer.create.shape", required: ["shape", "box"], properties: { shape: { type: "string", enum: PS_SHAPE_KINDS }, box: BOX_SCHEMA, id: { type: "string" }, name: { type: "string" }, fill: { type: "string" }, stroke: { type: "string" }, strokeWidth: { type: "number" } } },
    { type: "layer.create.adjustment", required: ["adjustment"], properties: { adjustment: { type: "string", enum: PS_ADJUSTMENT_TYPES }, id: { type: "string" }, name: { type: "string" } } },
    { type: "layer.create.image", required: ["nodeId"], properties: { nodeId: { type: "string" }, id: { type: "string" }, name: { type: "string" } } },
    { type: "board.arrange", properties: { template: { type: "string", enum: BOARD_LAYOUT_TEMPLATES } } },
    { type: "image.scaleLayers", required: ["sx", "sy"], properties: { sx: { type: "number" }, sy: { type: "number" } } },
    { type: "image.offsetLayers", required: ["dx", "dy"], properties: { dx: { type: "number" }, dy: { type: "number" } } },
    { type: "image.rotateLayers", required: ["degrees"], properties: { degrees: { type: "number" } } },
    { type: "image.trimBox", properties: { width: { type: "number" }, height: { type: "number" } } },
    { type: "image.anchorOffset", required: ["anchor", "width", "height", "nextWidth", "nextHeight"], properties: { anchor: { type: "string", enum: CANVAS_ANCHORS }, width: { type: "number" }, height: { type: "number" }, nextWidth: { type: "number" }, nextHeight: { type: "number" } } },
    { type: "document.imageSize", required: ["width", "height"], properties: { width: { type: "number" }, height: { type: "number" } } },
    { type: "document.canvasSize", required: ["width", "height", "anchor"], properties: { width: { type: "number" }, height: { type: "number" }, anchor: { type: "string", enum: CANVAS_ANCHORS } } },
    { type: "document.rotate", required: ["degrees"], properties: { degrees: { type: "number" } } },
    { type: "document.trim", properties: {} },
    { type: "document.setRatio", required: ["ratio"], properties: { ratio: { type: "string" } } },
    { type: "document.setResolution", required: ["resolution"], properties: { resolution: { type: "string", enum: ["1k", "2k", "4k"] } } },
    { type: "document.setBackground", required: ["background"], properties: { background: { type: "string" }, opacity: { type: "number" } } },
    { type: "filter.apply", required: ["filter"], properties: { filter: { type: "string" }, params: { type: "object", additionalProperties: true } } },
    { type: "document.compose", properties: {} },
    { type: "document.export", properties: {} },
];

export const IMAGE_AGENT_OP_TYPES = IMAGE_OP_SPECS.map((spec) => spec.type);

export const IMAGE_AGENT_SCHEMA: Record<string, unknown> = {
    type: "object",
    oneOf: IMAGE_OP_SPECS.map((spec) => imageOpVariant(spec.type, spec.properties, spec.required)),
};

export type ImageAgentInput = { board: CanvasNodeData; nodes: CanvasNodeData[] };

/** `size` is the document geometry after the fold, `metadata` the board-node settings patch (`document.set*`). */
export type ImageAgentResult = { layers: CanvasPsLayer[]; size?: { width: number; height: number }; metadata?: Partial<CanvasNodeMetadata> };

function psAgentLayer(layer: CanvasPsLayer, id?: string, name?: string) {
    return { ...layer, ...(id ? { id } : {}), ...(name ? { name } : {}) };
}

const SHAPE_NAME_KEYS: Record<CanvasPsShapeKind, string> = { rectangle: "canvas.ps.shapeRectangle", "rounded-rectangle": "canvas.ps.shapeRounded", ellipse: "canvas.ps.shapeEllipse", polygon: "canvas.ps.shapePolygon", line: "canvas.ps.shapeLine" };

/** Pure fold of `image` ops over one board's layer document; the studio owns commit, async ops and page state. */
export function applyImageAgentOps(input: ImageAgentInput, ops?: ImageAgentOp[]): ImageAgentResult {
    const source = input.board;
    let layers = smartCanvasLayers(source);
    let width = Math.max(1, Math.round(source.width));
    let height = Math.max(1, Math.round(source.height));
    let metadata: Partial<CanvasNodeMetadata> | undefined;

    const trimDocument = (documentWidth: number, documentHeight: number) => {
        const box = psTrimBox(layers, documentWidth, documentHeight);
        if (box.x === 0 && box.y === 0 && box.width === documentWidth && box.height === documentHeight) return;
        layers = psOffsetLayers(layers, -box.x, -box.y);
        width = box.width;
        height = box.height;
    };

    (Array.isArray(ops) ? ops : []).forEach((op) => {
        if (!op?.type) return;
        const board: CanvasNodeData = { ...source, width, height, metadata: { ...source.metadata, boardLayers: layers } };
        const target = "id" in op && typeof op.id === "string" ? findPsLayer(layers, op.id) : undefined;
        if (op.type === "layer.add") layers = addPsLayer(layers, op.layer, op.groupId);
        if (op.type === "layer.addAbove") layers = addPsLayerAbove(layers, op.layer, op.targetId);
        if (op.type === "layer.remove") layers = removePsLayer(layers, op.id);
        if (op.type === "layer.duplicate") layers = duplicatePsLayer(layers, op.id, op.suffix || i18n.t("canvas.ps.duplicateSuffix"), op.copyId || nanoid());
        if (op.type === "layer.group") layers = groupPsLayers(layers, op.ids || [], op.groupId || nanoid(), op.name || i18n.t("canvas.ps.groupLayer"));
        if (op.type === "layer.ungroup") layers = ungroupPsLayer(layers, op.id);
        if (op.type === "layer.moveTo") layers = movePsLayerTo(layers, op.id, op.targetId, op.position || "after");
        if (op.type === "layer.moveStep") layers = movePsLayerStep(layers, op.id, op.direction);
        if (op.type === "layer.translate") layers = translatePsLayer(layers, op.id, op.dx, op.dy);
        if (op.type === "layer.rotate") layers = rotatePsLayer(layers, op.id, op.degrees, op.centre || (target ? psLayerCentre(layers, target) : { x: width / 2, y: height / 2 }));
        if (op.type === "layer.scale") layers = scalePsLayer(layers, op.id, op.sx, op.sy, op.anchor || (target ? psLayerCentre(layers, target) : { x: 0, y: 0 }));
        if (op.type === "layer.patch") layers = patchPsLayer(layers, op.id, op.patch);
        if (op.type === "layer.patchStyle") layers = patchPsLayerStyle(layers, op.id, op.styleId, op.patch);
        if (op.type === "layer.ensureStyle") layers = ensurePsLayerStyle(layers, op.id, op.style);
        if (op.type === "layer.rasterize") layers = rasterizePsLayer(layers, op.id, op.storageKey);
        if (op.type === "layer.create.pixel") layers = addPsLayer(layers, psAgentLayer(createPsPixelLayer(board, op.name || i18n.t("canvas.ps.pixelLayer")), op.id));
        if (op.type === "layer.create.text") layers = addPsLayer(layers, psAgentLayer(createPsTextLayer(board, op.text, op.name || i18n.t("canvas.ps.textLayer")), op.id));
        if (op.type === "layer.create.shape") layers = addPsLayer(layers, psAgentLayer(createPsShapeLayer(op.shape, op.box, op.name || i18n.t(SHAPE_NAME_KEYS[op.shape]), op.fill || "#000000", op.stroke || "#000000", op.strokeWidth ?? 0), op.id));
        if (op.type === "layer.create.adjustment") layers = addPsLayer(layers, psAgentLayer(createPsAdjustmentLayer(board, op.adjustment, op.name || i18n.t(PS_ADJUSTMENT_NAME_KEYS[op.adjustment])), op.id));
        if (op.type === "layer.create.image") {
            const sourceNode = input.nodes.find((node) => node.id === op.nodeId);
            if (sourceNode) layers = addPsLayer(layers, psAgentLayer(createPsImageLayer(board, sourceNode), op.id, op.name));
        }
        if (op.type === "board.arrange") layers = arrangePsLayers(board, op.template || "grid");
        if (op.type === "image.scaleLayers") layers = psScaleLayers(layers, op.sx, op.sy);
        if (op.type === "image.offsetLayers") layers = psOffsetLayers(layers, op.dx, op.dy);
        if (op.type === "image.rotateLayers" || op.type === "document.rotate") {
            const rotated = psRotateLayers(layers, op.degrees, width, height);
            layers = rotated.layers;
            width = rotated.width;
            height = rotated.height;
        }
        if (op.type === "image.trimBox") trimDocument(op.width || width, op.height || height);
        if (op.type === "document.trim") trimDocument(width, height);
        if (op.type === "image.anchorOffset") {
            const offset = psAnchorOffset(op.anchor, op.width, op.height, op.nextWidth, op.nextHeight);
            layers = psOffsetLayers(layers, offset.dx, offset.dy);
            width = Math.max(1, Math.round(op.nextWidth));
            height = Math.max(1, Math.round(op.nextHeight));
        }
        if (op.type === "document.imageSize") {
            layers = psScaleLayers(layers, op.width / Math.max(1, width), op.height / Math.max(1, height));
            width = Math.max(1, Math.round(op.width));
            height = Math.max(1, Math.round(op.height));
        }
        if (op.type === "document.canvasSize") {
            const offset = psAnchorOffset(op.anchor, width, height, op.width, op.height);
            layers = psOffsetLayers(layers, offset.dx, offset.dy);
            width = Math.max(1, Math.round(op.width));
            height = Math.max(1, Math.round(op.height));
        }
        if (op.type === "document.setRatio") {
            const next = smartCanvasSizeForRatio(op.ratio);
            width = next.width;
            height = next.height;
            metadata = { ...metadata, boardRatio: op.ratio };
        }
        if (op.type === "document.setResolution") metadata = { ...metadata, boardResolution: op.resolution };
        if (op.type === "document.setBackground") metadata = { ...metadata, boardBackground: op.background, ...(op.opacity === undefined ? {} : { boardBackgroundOpacity: clampLayerOpacity(op.opacity) }) };
    });

    const size = width !== Math.max(1, Math.round(source.width)) || height !== Math.max(1, Math.round(source.height)) ? { width, height } : undefined;
    return { layers, ...(size ? { size } : {}), ...(metadata ? { metadata } : {}) };
}
