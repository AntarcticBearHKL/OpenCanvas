import { nanoid } from "nanoid";

import { clampLayerOpacity, DEFAULT_BLEND_MODE, resolveBlendMode } from "@/lib/canvas/blend-modes";
import { createCanvasContext } from "@/lib/canvas/canvas-2d";
import { nodeSizeFromRatio } from "@/lib/canvas/canvas-node-size";
import { applyPsAdjustment, PS_ADJUSTMENT_DEFAULTS, psCopyParams } from "@/lib/canvas/ps-adjustments";
import { psDrawTextLines, psDrawTextOnPath, psLayoutText, psTextFontSize, psTextLineHeight, psTextNeedsRaster, psTextWarpMesh } from "@/lib/canvas/ps-text";
import { drawPsWarpedContent, psHasTransform, psTransformMesh } from "@/lib/canvas/ps-transform";
import { psComposeLayerStyles, psStylePadding } from "@/lib/canvas/ps-layer-styles";
import { readMediaDimensions } from "@/lib/media-size";
import { resolveImageUrl } from "@/services/image-storage";
import { CanvasNodeType, type CanvasNodeData, type CanvasPsAdjustmentType, type CanvasPsLayer, type CanvasPsLayerStyle, type CanvasPsPath, type CanvasPsShapeKind } from "@/types/canvas";

export type SmartCanvasResolution = "1k" | "2k" | "4k";

export const PS_SHAPE_KINDS: CanvasPsShapeKind[] = ["rectangle", "rounded-rectangle", "ellipse", "polygon", "line"];

const SMART_CANVAS_DEFAULT_RATIO = "16:9";
const SMART_CANVAS_DEFAULT_RESOLUTION: SmartCanvasResolution = "2k";
const SMART_CANVAS_DEFAULT_BACKGROUND = "transparent";
const SMART_CANVAS_BASE_WIDTH = 640;
const SMART_CANVAS_BASE_HEIGHT = 360;
const BOARD_LAYOUT_GAP = 16;
const BOARD_TEXT_FONT_SIZE = 32;
const BOARD_TEXT_COLOR = "#000000";
const EMPTY_LAYERS: CanvasPsLayer[] = [];
const EMPTY_PATHS: CanvasPsPath[] = [];

export type BoardLayoutTemplate = "grid" | "row" | "column" | "feature";

export const BOARD_LAYOUT_TEMPLATES: BoardLayoutTemplate[] = ["grid", "row", "column", "feature"];

type BoardCell = { x: number; y: number; width: number; height: number };

type SmartCanvasComposite = {
    dataUrl: string;
    width: number;
    height: number;
};

export function smartCanvasRatio(board: CanvasNodeData) {
    return board.metadata?.boardRatio || SMART_CANVAS_DEFAULT_RATIO;
}

export function smartCanvasResolution(board: CanvasNodeData) {
    return board.metadata?.boardResolution || SMART_CANVAS_DEFAULT_RESOLUTION;
}

export function smartCanvasBackground(board: CanvasNodeData) {
    return board.metadata?.boardBackground || SMART_CANVAS_DEFAULT_BACKGROUND;
}

export function smartCanvasBackgroundOpacity(board: CanvasNodeData) {
    return clampLayerOpacity(board.metadata?.boardBackgroundOpacity);
}

export function smartCanvasFill(color: string, opacity: number) {
    return opacity >= 1 ? color : `color-mix(in srgb, ${color} ${Math.round(opacity * 100)}%, transparent)`;
}

export function smartCanvasSizeForRatio(ratio: string) {
    return nodeSizeFromRatio(ratio, SMART_CANVAS_BASE_WIDTH, SMART_CANVAS_BASE_HEIGHT) || { width: SMART_CANVAS_BASE_WIDTH, height: SMART_CANVAS_BASE_HEIGHT };
}

function smartCanvasTargetSize(board: CanvasNodeData) {
    return readMediaDimensions("", smartCanvasResolution(board), smartCanvasRatio(board));
}

export function smartCanvasLayers(board: CanvasNodeData) {
    return board.metadata?.boardLayers ?? EMPTY_LAYERS;
}

/** Ids of layers that live inside a group; those layers are composited by the group, never at document level. */
export function psLayerChildIds(layers: CanvasPsLayer[]) {
    const ids = new Set<string>();
    layers.forEach((layer) => (layer.children || []).forEach((id) => ids.add(id)));
    return ids;
}

export function psTopLayers(layers: CanvasPsLayer[]) {
    const childIds = psLayerChildIds(layers);
    return layers.filter((layer) => !childIds.has(layer.id));
}

export function psGroupChildren(layers: CanvasPsLayer[], group: CanvasPsLayer) {
    const byId = new Map(layers.map((layer) => [layer.id, layer]));
    return (group.children || []).map((id) => byId.get(id)).filter((child): child is CanvasPsLayer => Boolean(child));
}

/** True when the document uses something CSS cannot express, so previews must render through the shared raster compositor. */
export function psDocumentNeedsRaster(board: CanvasNodeData) {
    const channels = board.metadata?.boardChannelVisibility;
    if (channels && (!channels.r || !channels.g || !channels.b)) return true;
    return smartCanvasLayers(board).some((layer) => !layer.hidden && (layer.kind === "adjustment" || psHasTransform(layer) || (layer.kind === "text" && psTextNeedsRaster(layer)) || Boolean(layer.styles?.some((style) => style.enabled))));
}

export function psRotatePoint(x: number, y: number, centre: { x: number; y: number }, degrees: number) {
    const angle = (degrees * Math.PI) / 180;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const dx = x - centre.x;
    const dy = y - centre.y;
    return { x: centre.x + dx * cos - dy * sin, y: centre.y + dx * sin + dy * cos };
}

function psLayerCorners(layer: CanvasPsLayer) {
    const centre = { x: layer.x + layer.width / 2, y: layer.y + layer.height / 2 };
    return ([[-1, -1], [1, -1], [1, 1], [-1, 1]] as const).map(([sx, sy]) => psRotatePoint(layer.x + (sx < 0 ? 0 : layer.width), layer.y + (sy < 0 ? 0 : layer.height), centre, layer.rotation));
}

export function psBoxUnion(boxes: { x: number; y: number; width: number; height: number }[]) {
    if (!boxes.length) return null;
    return boxes.reduce((box, item) => ({ x: Math.min(box.x, item.x), y: Math.min(box.y, item.y), width: Math.max(box.x + box.width, item.x + item.width) - Math.min(box.x, item.x), height: Math.max(box.y + box.height, item.y + item.height) - Math.min(box.y, item.y) }), { ...boxes[0] });
}

/** A group's box always derives from its children; its own stored x/y/width/height is only an editor-side cache. */
export function psLayerBox(layers: CanvasPsLayer[], layer: CanvasPsLayer) {
    if (layer.kind !== "group") return { x: layer.x, y: layer.y, width: layer.width, height: layer.height };
    const corners = psGroupChildren(layers, layer).flatMap((child) => psLayerCorners(child));
    if (!corners.length) return { x: layer.x, y: layer.y, width: layer.width, height: layer.height };
    const x = Math.min(...corners.map((point) => point.x));
    const y = Math.min(...corners.map((point) => point.y));
    return { x, y, width: Math.max(...corners.map((point) => point.x)) - x, height: Math.max(...corners.map((point) => point.y)) - y };
}

export function createPsPixelLayer(board: CanvasNodeData, name: string): CanvasPsLayer {
    return { id: nanoid(), name, kind: "pixel", x: 0, y: 0, width: Math.max(1, Math.round(board.width)), height: Math.max(1, Math.round(board.height)), rotation: 0, opacity: 1, blendMode: DEFAULT_BLEND_MODE, hidden: false, locked: false };
}

export function createPsTextLayer(board: CanvasNodeData, text: string, name: string): CanvasPsLayer {
    const fontSize = BOARD_TEXT_FONT_SIZE;
    const width = Math.max(1, Math.round(board.width * 0.6));
    const height = Math.max(1, Math.round(fontSize * 1.2));
    return {
        id: nanoid(),
        name,
        kind: "text",
        text,
        x: Math.round((board.width - width) / 2),
        y: Math.round((board.height - height) / 2),
        width,
        height,
        rotation: 0,
        opacity: 1,
        blendMode: DEFAULT_BLEND_MODE,
        hidden: false,
        locked: false,
        fontSize,
        color: BOARD_TEXT_COLOR,
    };
}

export function createPsShapeLayer(kind: CanvasPsShapeKind, box: { x: number; y: number; width: number; height: number }, name: string, fill: string, stroke: string, strokeWidth: number): CanvasPsLayer {
    return { id: nanoid(), name, kind: "shape", shape: kind, shapeRadius: 24, shapeSides: 6, shapeFill: fill, shapeStroke: stroke, shapeStrokeWidth: strokeWidth, ...box, rotation: 0, opacity: 1, blendMode: DEFAULT_BLEND_MODE, hidden: false, locked: false };
}

export function createPsAdjustmentLayer(board: CanvasNodeData, type: CanvasPsAdjustmentType, name: string): CanvasPsLayer {
    return { id: nanoid(), name, kind: "adjustment", adjustment: type, adjustmentParams: psCopyParams(PS_ADJUSTMENT_DEFAULTS[type]), x: 0, y: 0, width: Math.max(1, Math.round(board.width)), height: Math.max(1, Math.round(board.height)), rotation: 0, opacity: 1, blendMode: DEFAULT_BLEND_MODE, hidden: false, locked: false };
}

export function createPsImageLayer(board: CanvasNodeData, source: CanvasNodeData): CanvasPsLayer {
    const sourceWidth = source.metadata?.naturalWidth || source.width;
    const sourceHeight = source.metadata?.naturalHeight || source.height;
    const scale = sourceWidth > 0 && sourceHeight > 0 ? Math.min(board.width / sourceWidth, board.height / sourceHeight) : 0;
    const width = Math.max(1, Math.round(scale ? sourceWidth * scale : board.width));
    const height = Math.max(1, Math.round(scale ? sourceHeight * scale : board.height));
    return {
        id: nanoid(),
        name: source.title,
        kind: "image",
        sourceNodeId: source.id,
        x: Math.round((board.width - width) / 2),
        y: Math.round((board.height - height) / 2),
        width,
        height,
        rotation: 0,
        opacity: 1,
        blendMode: DEFAULT_BLEND_MODE,
        hidden: false,
        locked: false,
    };
}

export function movePsLayer(board: CanvasNodeData, layerId: string, direction: "forward" | "backward") {
    const layers = smartCanvasLayers(board);
    const index = layers.findIndex((layer) => layer.id === layerId);
    const target = index + (direction === "forward" ? 1 : -1);
    if (index < 0 || target < 0 || target >= layers.length) return layers;
    const next = [...layers];
    [next[index], next[target]] = [next[target], next[index]];
    return next;
}

export function psTextRenderStyle(layer: CanvasPsLayer) {
    const fontSize = psTextFontSize(layer);
    return { fontSize, color: layer.color || BOARD_TEXT_COLOR, fontFamily: layer.fontFamily || "sans-serif", lineHeight: psTextLineHeight(layer) / fontSize };
}

/** SVG path data shared by the DOM preview and the Path2D composite, so a shape can never render differently in the two paths. */
export function psShapePathData(layer: CanvasPsLayer, width: number, height: number) {
    const w = Math.max(1, width);
    const h = Math.max(1, height);
    if (layer.shape === "ellipse") return `M 0 ${h / 2} A ${w / 2} ${h / 2} 0 1 0 ${w} ${h / 2} A ${w / 2} ${h / 2} 0 1 0 0 ${h / 2} Z`;
    if (layer.shape === "line") return `M 0 0 L ${w} ${h}`;
    if (layer.shape === "polygon") {
        const sides = Math.max(3, Math.min(24, Math.round(layer.shapeSides || 6)));
        const points = Array.from({ length: sides }, (_, index) => {
            const angle = (index / sides) * Math.PI * 2 - Math.PI / 2;
            return `${w / 2 + (w / 2) * Math.cos(angle)} ${h / 2 + (h / 2) * Math.sin(angle)}`;
        });
        return `M ${points.join(" L ")} Z`;
    }
    if (layer.shape === "rounded-rectangle") {
        const radius = Math.max(0, Math.min(layer.shapeRadius ?? 24, w / 2, h / 2));
        if (!radius) return `M 0 0 H ${w} V ${h} H 0 Z`;
        return `M ${radius} 0 H ${w - radius} A ${radius} ${radius} 0 0 1 ${w} ${radius} V ${h - radius} A ${radius} ${radius} 0 0 1 ${w - radius} ${h} H ${radius} A ${radius} ${radius} 0 0 1 0 ${h - radius} V ${radius} A ${radius} ${radius} 0 0 1 ${radius} 0 Z`;
    }
    return `M 0 0 H ${w} V ${h} H 0 Z`;
}

function boardGridCells(x: number, y: number, width: number, height: number, count: number, cols: number): BoardCell[] {
    const rows = Math.ceil(count / cols);
    const cellWidth = (width - BOARD_LAYOUT_GAP * (cols + 1)) / cols;
    const cellHeight = (height - BOARD_LAYOUT_GAP * (rows + 1)) / rows;
    return Array.from({ length: count }, (_, index) => ({ x: x + BOARD_LAYOUT_GAP + (index % cols) * (cellWidth + BOARD_LAYOUT_GAP), y: y + BOARD_LAYOUT_GAP + Math.floor(index / cols) * (cellHeight + BOARD_LAYOUT_GAP), width: cellWidth, height: cellHeight }));
}

function featureBoardCells(board: CanvasNodeData, count: number): BoardCell[] {
    const half = (board.width - BOARD_LAYOUT_GAP * 3) / 2;
    const first: BoardCell = { x: BOARD_LAYOUT_GAP, y: BOARD_LAYOUT_GAP, width: half, height: board.height - BOARD_LAYOUT_GAP * 2 };
    const rest = count - 1;
    return rest ? [first, ...boardGridCells(BOARD_LAYOUT_GAP * 2 + half, 0, half, board.height, rest, Math.ceil(Math.sqrt(rest)))] : [first];
}

function fitPsLayerCell(layer: CanvasPsLayer, cell: BoardCell) {
    const scale = layer.width > 0 && layer.height > 0 ? Math.min(cell.width / layer.width, cell.height / layer.height) : 0;
    const width = Math.round(scale ? Math.max(1, layer.width * scale) : Math.max(1, cell.width));
    const height = Math.round(scale ? Math.max(1, layer.height * scale) : Math.max(1, cell.height));
    return { x: Math.round(cell.x + (cell.width - width) / 2), y: Math.round(cell.y + (cell.height - height) / 2), width, height };
}

export function arrangePsLayers(board: CanvasNodeData, template: BoardLayoutTemplate = "grid") {
    const layers = smartCanvasLayers(board);
    const images = psTopLayers(layers).filter((layer) => layer.kind === "image");
    const count = images.length;
    if (!count) return layers;
    const cols = template === "row" ? count : template === "column" ? 1 : Math.ceil(Math.sqrt(count));
    const cells = template === "feature" ? featureBoardCells(board, count) : boardGridCells(0, 0, board.width, board.height, count, cols);
    const boxes = new Map(images.map((layer, index) => [layer.id, fitPsLayerCell(layer, cells[index])]));
    return layers.map((layer) => {
        const box = boxes.get(layer.id);
        return box ? { ...layer, ...box } : layer;
    });
}

const SMART_CANVAS_COMPOSITE_CACHE_LIMIT = 2;

const compositeCache = new Map<string, SmartCanvasComposite>();

function compositeSignature(board: CanvasNodeData, nodes: CanvasNodeData[], visited: Set<string>): string {
    const parts = [board.id, board.position.x, board.position.y, board.width, board.height, smartCanvasRatio(board), smartCanvasResolution(board), smartCanvasBackground(board), String(smartCanvasBackgroundOpacity(board))];
    smartCanvasLayers(board).forEach((layer) => {
        parts.push(JSON.stringify(layer));
        const source = layer.sourceNodeId ? nodes.find((node) => node.id === layer.sourceNodeId) : undefined;
        if (!source) return;
        parts.push(`${source.id}:${source.metadata?.storageKey || source.metadata?.content || ""}`);
        if (source.type === CanvasNodeType.SmartCanvas && !visited.has(source.id)) parts.push(compositeSignature(source, nodes, new Set(visited).add(source.id)));
    });
    return parts.join("|");
}

function cacheComposite(signature: string, composite: SmartCanvasComposite) {
    if (signature && composite.dataUrl) {
        compositeCache.set(signature, composite);
        if (compositeCache.size > SMART_CANVAS_COMPOSITE_CACHE_LIMIT) {
            const oldest = compositeCache.keys().next().value;
            if (oldest) compositeCache.delete(oldest);
        }
    }
    return composite;
}

export function psCompositeSignature(board: CanvasNodeData, nodes: CanvasNodeData[]) {
    return compositeSignature(board, nodes, new Set([board.id]));
}

export type PsDocumentRender = { canvas: HTMLCanvasElement | null; width: number; height: number };

/** Shared raster renderer: the export path, the editor surface and the board preview all draw through this one function. */
export async function renderPsDocument(board: CanvasNodeData, nodes: CanvasNodeData[], options: { width?: number; height?: number; visited?: Set<string> } = {}): Promise<PsDocumentRender> {
    const target = options.width && options.height ? { width: options.width, height: options.height } : smartCanvasTargetSize(board);
    const width = Math.max(1, Math.round(target.width));
    const height = Math.max(1, Math.round(target.height));
    const { canvas, context } = createCanvasContext(width, height);
    if (!context) return { canvas: null, width, height };
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";

    const scaleX = width / Math.max(1, board.width);
    const scaleY = height / Math.max(1, board.height);
    const nextVisited = new Set(options.visited);
    nextVisited.add(board.id);

    context.beginPath();
    context.rect(0, 0, width, height);
    context.clip();

    const background = smartCanvasBackground(board);
    if (background !== "transparent") {
        context.fillStyle = background;
        context.globalAlpha = smartCanvasBackgroundOpacity(board);
        context.fillRect(0, 0, width, height);
        context.globalAlpha = 1;
    }

    const layers = smartCanvasLayers(board);
    const paths = board.metadata?.boardPaths ?? EMPTY_PATHS;
    for (const layer of psTopLayers(layers)) {
        if (layer.hidden) continue;
        if (layer.kind === "group") {
            await drawPsGroup(context, layer, layers, nodes, nextVisited, width, height, scaleX, scaleY, paths);
            continue;
        }
        await drawPsLayer(context, layer, nodes, nextVisited, scaleX, scaleY, paths);
    }
    psApplyChannelVisibility(context, board);
    return { canvas, width, height };
}

/** Hidden channels drop out of the finished composite, so the preview and the export agree on what a hidden channel means. */
function psApplyChannelVisibility(context: CanvasRenderingContext2D, board: CanvasNodeData) {
    const channels = board.metadata?.boardChannelVisibility;
    if (!channels || (channels.r && channels.g && channels.b)) return;
    const width = context.canvas.width;
    const height = context.canvas.height;
    const image = context.getImageData(0, 0, width, height);
    for (let index = 0; index < image.data.length; index += 4) {
        if (!channels.r) image.data[index] = 0;
        if (!channels.g) image.data[index + 1] = 0;
        if (!channels.b) image.data[index + 2] = 0;
    }
    context.putImageData(image, 0, 0);
}

export async function composeSmartCanvas(board: CanvasNodeData, nodes: CanvasNodeData[], visited: Set<string> = new Set()): Promise<SmartCanvasComposite> {
    const signature = visited.size ? "" : psCompositeSignature(board, nodes);
    const cached = signature ? compositeCache.get(signature) : undefined;
    if (cached) return cached;
    const { canvas, width, height } = await renderPsDocument(board, nodes, { visited });
    if (!canvas) return { dataUrl: "", width, height };
    try {
        return cacheComposite(signature, { dataUrl: canvas.toDataURL("image/png"), width, height });
    } catch {
        return { dataUrl: "", width, height };
    }
}

async function drawPsLayer(context: CanvasRenderingContext2D, layer: CanvasPsLayer, nodes: CanvasNodeData[], visited: Set<string>, scaleX: number, scaleY: number, paths: CanvasPsPath[]) {
    if (layer.kind === "adjustment") {
        await drawPsAdjustment(context, layer, scaleX, scaleY);
        return;
    }
    const scale = (scaleX + scaleY) / 2;
    const layerWidth = Math.max(1, layer.width * scaleX);
    const layerHeight = Math.max(1, layer.height * scaleY);
    const mask = layer.maskStorageKey ? await resolvePsMaskBitmap(layer.maskStorageKey) : null;
    const styles = (layer.styles || []).filter((style) => style.enabled);
    const mesh = psTransformMesh(layer.transform);
    context.save();
    context.translate((layer.x + layer.width / 2) * scaleX, (layer.y + layer.height / 2) * scaleY);
    context.rotate((layer.rotation * Math.PI) / 180);
    context.globalAlpha = clampLayerOpacity(layer.opacity);
    context.globalCompositeOperation = resolveBlendMode(layer.blendMode).canvas;
    if (mask || styles.length || mesh) {
        const pad = styles.length ? psStylePadding(styles, scale) : 0;
        const scratch = createCanvasContext(Math.max(1, Math.round(layerWidth)) + pad * 2, Math.max(1, Math.round(layerHeight)) + pad * 2);
        if (scratch.context) {
            await drawPsLayerContent(scratch.context, layer, nodes, visited, layerWidth, layerHeight, scaleY, { x: pad, y: pad }, paths);
            let content = styles.length ? psComposeLayerStyles(scratch.canvas, styles, scale, await psStylePatterns(styles)) : scratch.canvas;
            if (mask) {
                const masked = createCanvasContext(content.width, content.height);
                if (masked.context) {
                    masked.context.drawImage(content, 0, 0);
                    masked.context.globalCompositeOperation = "destination-in";
                    masked.context.drawImage(mask, pad, pad, layerWidth, layerHeight);
                    content = masked.canvas;
                }
            }
            if (mesh) drawPsWarpedContent(context, content, psPaddedMesh(mesh, pad, layerWidth, layerHeight, content.width, content.height), { x: -content.width / 2, y: -content.height / 2 });
            else context.drawImage(content, -layerWidth / 2 - pad, -layerHeight / 2 - pad, content.width, content.height);
        }
    } else {
        await drawPsLayerContent(context, layer, nodes, visited, layerWidth, layerHeight, scaleY, { x: -layerWidth / 2, y: -layerHeight / 2 }, paths);
    }
    context.restore();
}

/** Style padding grows the bitmap beyond the layer box, so the transform mesh is remapped to the padded bitmap before it is drawn. */
function psPaddedMesh(mesh: { x: number; y: number }[], pad: number, width: number, height: number, canvasWidth: number, canvasHeight: number) {
    if (!pad) return mesh;
    return mesh.map((point) => ({ x: (point.x * width + pad) / Math.max(1, canvasWidth), y: (point.y * height + pad) / Math.max(1, canvasHeight) }));
}

/** Adjustment layers read back everything already drawn below them in their container, adjust it and draw the result on top. */
async function drawPsAdjustment(context: CanvasRenderingContext2D, layer: CanvasPsLayer, scaleX: number, scaleY: number) {
    if (!layer.adjustment) return;
    const width = context.canvas.width;
    const height = context.canvas.height;
    const below = context.getImageData(0, 0, width, height);
    const adjusted = new ImageData(new Uint8ClampedArray(below.data), width, height);
    applyPsAdjustment(adjusted, layer.adjustment, layer.adjustmentParams || {});
    const scratch = createCanvasContext(width, height);
    if (!scratch.context) return;
    scratch.context.putImageData(adjusted, 0, 0);
    const mask = layer.maskStorageKey ? await resolvePsMaskBitmap(layer.maskStorageKey) : null;
    if (mask) {
        scratch.context.globalCompositeOperation = "destination-in";
        scratch.context.save();
        scratch.context.translate((layer.x + layer.width / 2) * scaleX, (layer.y + layer.height / 2) * scaleY);
        scratch.context.rotate((layer.rotation * Math.PI) / 180);
        scratch.context.drawImage(mask, (-layer.width * scaleX) / 2, (-layer.height * scaleY) / 2, Math.max(1, layer.width * scaleX), Math.max(1, layer.height * scaleY));
        scratch.context.restore();
        scratch.context.globalCompositeOperation = "source-over";
    }
    context.save();
    context.globalAlpha = clampLayerOpacity(layer.opacity);
    context.globalCompositeOperation = resolveBlendMode(layer.blendMode).canvas;
    context.drawImage(scratch.canvas, 0, 0);
    context.restore();
}

async function drawPsLayerContent(context: CanvasRenderingContext2D, layer: CanvasPsLayer, nodes: CanvasNodeData[], visited: Set<string>, width: number, height: number, scaleY: number, origin: { x: number; y: number }, paths: CanvasPsPath[]) {
    if (layer.kind === "text") {
        drawPsTextLayer(context, layer, width, height, scaleY, origin.x, origin.y, paths);
        return;
    }
    if (layer.kind === "shape") {
        context.save();
        context.translate(origin.x, origin.y);
        drawPsShapeLayer(context, layer, width, height);
        context.restore();
        return;
    }
    const element = await resolvePsLayerBitmap(layer, nodes, visited);
    if (element) context.drawImage(element, origin.x, origin.y, width, height);
}

function drawPsShapeLayer(context: CanvasRenderingContext2D, layer: CanvasPsLayer, width: number, height: number) {
    const path = new Path2D(psShapePathData(layer, width, height));
    const strokeWidth = Math.max(0, layer.shapeStrokeWidth || 0);
    if (layer.shape === "line") {
        context.strokeStyle = layer.shapeStroke || layer.shapeFill || "#000000";
        context.lineWidth = Math.max(1, strokeWidth || 1);
        context.stroke(path);
        return;
    }
    context.fillStyle = layer.shapeFill || "#000000";
    context.fill(path);
    if (layer.shapeStroke && strokeWidth > 0) {
        context.strokeStyle = layer.shapeStroke;
        context.lineWidth = strokeWidth;
        context.stroke(path);
    }
}

async function resolvePsMaskBitmap(storageKey: string) {
    const url = await resolveImageUrl(storageKey);
    return url ? loadCompositeImage(url) : null;
}

// Children composite into an isolated layer first so the group's own opacity and blend mode apply to the flattened child result once.
async function drawPsGroup(context: CanvasRenderingContext2D, group: CanvasPsLayer, layers: CanvasPsLayer[], nodes: CanvasNodeData[], visited: Set<string>, width: number, height: number, scaleX: number, scaleY: number, paths: CanvasPsPath[]) {
    const { canvas, context: groupContext } = createCanvasContext(width, height);
    if (!groupContext) return;
    groupContext.imageSmoothingEnabled = true;
    groupContext.imageSmoothingQuality = "high";
    for (const child of psGroupChildren(layers, group)) {
        if (child.hidden) continue;
        await drawPsLayer(groupContext, child, nodes, visited, scaleX, scaleY, paths);
    }
    const scale = (scaleX + scaleY) / 2;
    const styles = (group.styles || []).filter((style) => style.enabled);
    const pad = styles.length ? psStylePadding(styles, scale) : 0;
    let content: HTMLCanvasElement = canvas;
    if (styles.length) {
        const styled = createCanvasContext(width + pad * 2, height + pad * 2);
        if (styled.context) {
            styled.context.drawImage(canvas, pad, pad);
            content = psComposeLayerStyles(styled.canvas, styles, scale, await psStylePatterns(styles));
        }
    }
    if (group.maskStorageKey) {
        const mask = await resolvePsMaskBitmap(group.maskStorageKey);
        const box = psLayerBox(layers, group);
        const masked = createCanvasContext(content.width, content.height);
        if (mask && masked.context) {
            masked.context.drawImage(content, 0, 0);
            masked.context.globalCompositeOperation = "destination-in";
            masked.context.drawImage(mask, box.x * scaleX + pad, box.y * scaleY + pad, Math.max(1, box.width * scaleX), Math.max(1, box.height * scaleY));
            content = masked.canvas;
        }
    }
    context.save();
    context.globalAlpha = clampLayerOpacity(group.opacity);
    context.globalCompositeOperation = resolveBlendMode(group.blendMode).canvas;
    context.drawImage(content, -pad, -pad, content.width, content.height);
    context.restore();
}

/** Rasterises one layer's content (a group flattens its children) into its own box, used when a filter has to bake a text / shape / image / group layer. */
export async function renderPsLayerBitmap(layer: CanvasPsLayer, layers: CanvasPsLayer[], nodes: CanvasNodeData[], paths: CanvasPsPath[] = EMPTY_PATHS): Promise<HTMLCanvasElement | null> {
    const visited = new Set<string>();
    if (layer.kind === "group") {
        const box = psLayerBox(layers, layer);
        const canvas = createCanvasContext(Math.max(1, Math.round(box.width)), Math.max(1, Math.round(box.height)));
        if (!canvas.context) return null;
        canvas.context.imageSmoothingEnabled = true;
        canvas.context.imageSmoothingQuality = "high";
        canvas.context.translate(-box.x, -box.y);
        for (const child of psGroupChildren(layers, layer)) {
            if (child.hidden) continue;
            await drawPsLayer(canvas.context, child, nodes, visited, 1, 1, paths);
        }
        return canvas.canvas;
    }
    const width = Math.max(1, Math.round(layer.width));
    const height = Math.max(1, Math.round(layer.height));
    const canvas = createCanvasContext(width, height);
    if (!canvas.context) return null;
    canvas.context.imageSmoothingEnabled = true;
    canvas.context.imageSmoothingQuality = "high";
    await drawPsLayerContent(canvas.context, layer, nodes, visited, width, height, 1, { x: 0, y: 0 }, paths);
    return canvas.canvas;
}

async function resolvePsLayerBitmap(layer: CanvasPsLayer, nodes: CanvasNodeData[], visited: Set<string>) {
    if (layer.kind === "pixel") {
        const url = await resolveImageUrl(layer.storageKey);
        return url ? loadCompositeImage(url) : null;
    }
    const source = layer.sourceNodeId ? nodes.find((node) => node.id === layer.sourceNodeId) : undefined;
    if (!source) return null;
    if (source.type === CanvasNodeType.SmartCanvas) {
        if (visited.has(source.id)) return null;
        const nested = await composeSmartCanvas(source, nodes, new Set(visited).add(source.id));
        return nested.dataUrl ? loadCompositeImage(nested.dataUrl) : null;
    }
    const url = await resolveImageUrl(source.metadata?.storageKey, source.metadata?.content || "");
    return url ? loadCompositeImage(url) : null;
}

function drawPsTextLayer(context: CanvasRenderingContext2D, layer: CanvasPsLayer, width: number, height: number, scale: number, originX = -width / 2, originY = -height / 2, paths: CanvasPsPath[] = EMPTY_PATHS) {
    const path = layer.textPathId ? paths.find((item) => item.id === layer.textPathId) : undefined;
    if (path) {
        psDrawTextOnPath(context, layer, path, scale, { x: originX, y: originY });
        return;
    }
    if (layer.textWarp) {
        const scratch = createCanvasContext(Math.max(1, Math.round(width)), Math.max(1, Math.round(height)));
        if (scratch.context) {
            psDrawTextLines(scratch.context, layer, psLayoutText(scratch.context, layer, width, scale), scale, { x: 0, y: 0 }, width);
            drawPsWarpedContent(context, scratch.canvas, psTextWarpMesh(layer.textWarp), { x: originX, y: originY });
            return;
        }
    }
    psDrawTextLines(context, layer, psLayoutText(context, layer, width, scale), scale, { x: originX, y: originY }, width);
}

function loadCompositeImage(url: string) {
    return new Promise<HTMLImageElement | null>((resolve) => {
        const image = new Image();
        image.crossOrigin = "anonymous";
        image.onload = () => resolve(image);
        image.onerror = () => resolve(null);
        image.src = url;
    });
}

/** Pattern overlays that point at a saved pattern need their bitmap loaded before the styles compose; the compose itself stays synchronous. */
async function psStylePatterns(styles: CanvasPsLayerStyle[]) {
    const map = new Map<string, HTMLImageElement | null>();
    const keys = Array.from(new Set(styles.filter((style) => style.enabled && style.type === "pattern-overlay").map((style) => String(style.params.patternKey || "")).filter(Boolean)));
    await Promise.all(
        keys.map(async (key) => {
            const url = await resolveImageUrl(key);
            map.set(key, url ? await loadCompositeImage(url) : null);
        }),
    );
    return map;
}
