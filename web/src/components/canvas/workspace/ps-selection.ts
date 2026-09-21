import { createCanvasContext } from "@/lib/canvas/canvas-2d";
import type { CanvasPsLayer } from "@/types/canvas";

export type PsSelection = { canvas: HTMLCanvasElement };
export type PsSelectionMode = "replace" | "add" | "subtract" | "intersect";
export type PsPoint = { x: number; y: number };

const SELECTION_COMBINE: Record<PsSelectionMode, GlobalCompositeOperation> = { replace: "copy", add: "source-over", subtract: "destination-out", intersect: "destination-in" };

export function psSelectionCreate(width: number, height: number): PsSelection | null {
    const { canvas, context } = createCanvasContext(Math.max(1, Math.round(width)), Math.max(1, Math.round(height)));
    return context ? { canvas } : null;
}

export function psSelectionAll(selection: PsSelection) {
    const context = selection.canvas.getContext("2d");
    if (!context) return;
    context.globalCompositeOperation = "copy";
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, selection.canvas.width, selection.canvas.height);
    context.globalCompositeOperation = "source-over";
}

export function psSelectionClear(selection: PsSelection) {
    selection.canvas.getContext("2d")?.clearRect(0, 0, selection.canvas.width, selection.canvas.height);
}

export function psSelectionInvert(selection: PsSelection) {
    const context = selection.canvas.getContext("2d");
    if (!context) return;
    context.globalCompositeOperation = "destination-out";
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, selection.canvas.width, selection.canvas.height);
    context.globalCompositeOperation = "source-over";
}

export function psSelectionFeather(selection: PsSelection, px: number) {
    const context = selection.canvas.getContext("2d");
    if (!context || px <= 0) return;
    const copy = createCanvasContext(selection.canvas.width, selection.canvas.height);
    if (!copy.context) return;
    copy.context.drawImage(selection.canvas, 0, 0);
    context.clearRect(0, 0, selection.canvas.width, selection.canvas.height);
    context.filter = `blur(${px}px)`;
    context.drawImage(copy.canvas, 0, 0);
    context.filter = "none";
}

/** Empty-space tracing: a boundary pixel is any selected pixel with an unselected 4-neighbour (or the document edge). */
export function psSelectionEdges(selection: PsSelection, limit = 12000) {
    const context = selection.canvas.getContext("2d");
    if (!context) return new Int32Array(0);
    const width = selection.canvas.width;
    const height = selection.canvas.height;
    const { data } = context.getImageData(0, 0, width, height);
    const selected = (x: number, y: number) => data[(y * width + x) * 4 + 3] >= 128;
    const edges: number[] = [];
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            if (!selected(x, y)) continue;
            if (x === 0 || y === 0 || x === width - 1 || y === height - 1 || !selected(x - 1, y) || !selected(x + 1, y) || !selected(x, y - 1) || !selected(x, y + 1)) edges.push(y * width + x);
            if (edges.length >= limit) return Int32Array.from(edges);
        }
    }
    return Int32Array.from(edges);
}

export function psSelectionBounds(selection: PsSelection) {
    const context = selection.canvas.getContext("2d");
    if (!context) return null;
    const width = selection.canvas.width;
    const height = selection.canvas.height;
    const { data } = context.getImageData(0, 0, width, height);
    let minX = width;
    let minY = height;
    let maxX = -1;
    let maxY = -1;
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            if (data[(y * width + x) * 4 + 3] < 128) continue;
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
        }
    }
    return maxX < 0 ? null : { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

export function psSelectionShape(selection: PsSelection, draw: (context: CanvasRenderingContext2D) => void, feather: number, antiAlias: boolean) {
    const shape = createCanvasContext(selection.canvas.width, selection.canvas.height);
    if (!shape.context) return null;
    shape.context.fillStyle = "#ffffff";
    shape.context.strokeStyle = "#ffffff";
    if (feather > 0) shape.context.filter = `blur(${feather}px)`;
    draw(shape.context);
    shape.context.filter = "none";
    if (!antiAlias) {
        const image = shape.context.getImageData(0, 0, shape.canvas.width, shape.canvas.height);
        for (let index = 3; index < image.data.length; index += 4) image.data[index] = image.data[index] >= 128 ? 255 : 0;
        shape.context.putImageData(image, 0, 0);
    }
    return shape.canvas;
}

export function psSelectionCombine(selection: PsSelection, shape: HTMLCanvasElement, mode: PsSelectionMode) {
    const context = selection.canvas.getContext("2d");
    if (!context) return;
    context.globalCompositeOperation = SELECTION_COMBINE[mode];
    context.drawImage(shape, 0, 0);
    context.globalCompositeOperation = "source-over";
}

export function psSelectionRect(selection: PsSelection, box: { x: number; y: number; width: number; height: number }, ellipse: boolean, feather: number, antiAlias: boolean, mode: PsSelectionMode) {
    const shape = psSelectionShape(selection, (context) => {
        context.beginPath();
        if (ellipse) context.ellipse(box.x + box.width / 2, box.y + box.height / 2, Math.abs(box.width) / 2, Math.abs(box.height) / 2, 0, 0, Math.PI * 2);
        else context.rect(box.x, box.y, box.width, box.height);
        context.fill();
    }, feather, antiAlias);
    if (shape) psSelectionCombine(selection, shape, mode);
}

export function psSelectionPolygon(selection: PsSelection, points: PsPoint[], feather: number, antiAlias: boolean, mode: PsSelectionMode) {
    if (points.length < 3) return;
    const shape = psSelectionShape(selection, (context) => {
        context.beginPath();
        context.moveTo(points[0].x, points[0].y);
        points.slice(1).forEach((point) => context.lineTo(point.x, point.y));
        context.closePath();
        context.fill();
    }, feather, antiAlias);
    if (shape) psSelectionCombine(selection, shape, mode);
}

function psSample(data: Uint8ClampedArray, width: number, x: number, y: number) {
    const index = (y * width + x) * 4;
    return [data[index], data[index + 1], data[index + 2], data[index + 3]];
}

function psColorNear(data: Uint8ClampedArray, width: number, x: number, y: number, origin: number[], tolerance: number) {
    const index = (y * width + x) * 4;
    if (data[index + 3] === 0 && origin[3] === 0) return true;
    return Math.abs(data[index] - origin[0]) <= tolerance && Math.abs(data[index + 1] - origin[1]) <= tolerance && Math.abs(data[index + 2] - origin[2]) <= tolerance && Math.abs(data[index + 3] - origin[3]) <= tolerance;
}

/** Wand mask in document space; the caller combines it into the selection so the mode follows the modifier keys. */
export function psSelectionWand(image: ImageData, point: PsPoint, tolerance: number, contiguous: boolean) {
    const { width, height, data } = image;
    const startX = Math.floor(point.x);
    const startY = Math.floor(point.y);
    if (startX < 0 || startY < 0 || startX >= width || startY >= height) return null;
    const origin = psSample(data, width, startX, startY);
    const picked = new Uint8Array(width * height);
    if (contiguous) {
        const stack = [startY * width + startX];
        while (stack.length) {
            const pixel = stack.pop()!;
            if (picked[pixel]) continue;
            const x = pixel % width;
            const y = (pixel - x) / width;
            if (!psColorNear(data, width, x, y, origin, tolerance)) continue;
            picked[pixel] = 1;
            if (x > 0) stack.push(pixel - 1);
            if (x < width - 1) stack.push(pixel + 1);
            if (y > 0) stack.push(pixel - width);
            if (y < height - 1) stack.push(pixel + width);
        }
    } else {
        for (let pixel = 0; pixel < picked.length; pixel++) {
            const x = pixel % width;
            const y = (pixel - x) / width;
            if (psColorNear(data, width, x, y, origin, tolerance)) picked[pixel] = 1;
        }
    }
    const { canvas, context } = createCanvasContext(width, height);
    if (!context) return null;
    const mask = context.createImageData(width, height);
    for (let pixel = 0; pixel < picked.length; pixel++) {
        if (!picked[pixel]) continue;
        const index = pixel * 4;
        mask.data[index] = 255;
        mask.data[index + 1] = 255;
        mask.data[index + 2] = 255;
        mask.data[index + 3] = 255;
    }
    context.putImageData(mask, 0, 0);
    return canvas;
}

/** Quick selection grows or shrinks the selection along the composite under a round brush, constrained to colours similar to the gesture start. */
export function psSelectionQuick(selection: PsSelection, image: ImageData | null, point: PsPoint, radius: number, tolerance: number, sample: number[] | null, erase: boolean) {
    const context = selection.canvas.getContext("2d");
    if (!context) return;
    const x0 = Math.max(0, Math.floor(point.x - radius));
    const y0 = Math.max(0, Math.floor(point.y - radius));
    const x1 = Math.min(selection.canvas.width, Math.ceil(point.x + radius));
    const y1 = Math.min(selection.canvas.height, Math.ceil(point.y + radius));
    if (x1 <= x0 || y1 <= y0) return;
    const region = context.getImageData(x0, y0, x1 - x0, y1 - y0);
    const squared = radius * radius;
    for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
            const dx = x + 0.5 - point.x;
            const dy = y + 0.5 - point.y;
            if (dx * dx + dy * dy > squared) continue;
            const index = ((y - y0) * region.width + (x - x0)) * 4;
            if (erase) {
                region.data[index + 3] = 0;
                continue;
            }
            if (image && sample && !psColorNear(image.data, image.width, x, y, sample, tolerance)) continue;
            region.data[index] = 255;
            region.data[index + 1] = 255;
            region.data[index + 2] = 255;
            region.data[index + 3] = 255;
        }
    }
    context.putImageData(region, x0, y0);
}

export function psImageColorAt(image: ImageData, x: number, y: number) {
    if (x < 0 || y < 0 || x >= image.width || y >= image.height) return null;
    const data = image.data;
    const index = (y * image.width + x) * 4;
    return [data[index], data[index + 1], data[index + 2], data[index + 3]];
}

/** Maps the document-space selection into a layer bitmap's own pixel space (the inverse of the paint transform). */
export function psSelectionToLayerSpace(selection: PsSelection, layer: CanvasPsLayer, width: number, height: number) {
    const target = createCanvasContext(Math.max(1, Math.round(width)), Math.max(1, Math.round(height)));
    if (!target.context) return null;
    const centre = { x: layer.x + layer.width / 2, y: layer.y + layer.height / 2 };
    target.context.translate(centre.x - layer.x, centre.y - layer.y);
    target.context.rotate((-layer.rotation * Math.PI) / 180);
    target.context.translate(-centre.x, -centre.y);
    target.context.drawImage(selection.canvas, 0, 0);
    return target.canvas;
}

export function psSelectionBlob(canvas: HTMLCanvasElement) {
    return new Promise<Blob | null>((resolve) => canvas.toBlob((blob) => resolve(blob), "image/png"));
}
