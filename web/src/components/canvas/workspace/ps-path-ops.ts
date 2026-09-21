import { createCanvasContext } from "@/lib/canvas/canvas-2d";
import { psPathData } from "@/lib/canvas/ps-path";
import { psSelectionCombine, psSelectionShape, psSelectionToLayerSpace, type PsSelection, type PsSelectionMode } from "@/components/canvas/workspace/ps-selection";
import { psCanvasToBlob, psLoadLayerBitmap, type PsPaintSource } from "@/components/canvas/workspace/ps-paint";
import type { CanvasPsLayer, CanvasPsPath } from "@/types/canvas";

export function psPathToSelection(path: CanvasPsPath, target: HTMLCanvasElement, feather: number, antiAlias: boolean, mode: PsSelectionMode) {
    const shape = psSelectionShape(
        { canvas: target },
        (context) => {
            context.fill(new Path2D(psPathData(path)));
        },
        feather,
        antiAlias,
    );
    if (shape) psSelectionCombine({ canvas: target }, shape, mode);
}

/** Path geometry is board-local, so the layer-space transform is the same one the selection mask uses. */
function psApplyLayerSpace(context: CanvasRenderingContext2D, layer: CanvasPsLayer) {
    const centre = { x: layer.x + layer.width / 2, y: layer.y + layer.height / 2 };
    context.translate(centre.x - layer.x, centre.y - layer.y);
    context.rotate((-layer.rotation * Math.PI) / 180);
    context.translate(-centre.x, -centre.y);
}

export async function psPaintPath(layer: CanvasPsLayer, path: CanvasPsPath, color: string, strokeWidth: number, source: PsPaintSource = {}) {
    const width = Math.max(1, Math.round(layer.width));
    const height = Math.max(1, Math.round(layer.height));
    const { canvas, context } = createCanvasContext(width, height);
    if (!context) return null;
    const base = await psLoadLayerBitmap(source.storageKey ?? layer.storageKey);
    if (base) context.drawImage(base, 0, 0, width, height);
    context.save();
    psApplyLayerSpace(context, layer);
    const shape = new Path2D(psPathData(path));
    if (strokeWidth > 0) {
        context.strokeStyle = color;
        context.lineWidth = strokeWidth;
        context.lineJoin = "round";
        context.lineCap = "round";
        context.stroke(shape);
    } else {
        context.fillStyle = color;
        context.fill(shape);
    }
    context.restore();
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

export function psPathPaintSource(storageKey?: string, selection?: PsSelection | null): PsPaintSource {
    return { storageKey, selection: selection ?? null };
}
