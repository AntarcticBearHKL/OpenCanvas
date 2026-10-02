import { extractRegion, resizeNearest } from "@/lib/canvas/pixel/raster";

function canvasContext(canvas: HTMLCanvasElement) {
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("2D canvas context unavailable");
    return context;
}

export function bufferToCanvas(buf: Uint8ClampedArray, w: number, h: number): HTMLCanvasElement {
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    canvasContext(canvas).putImageData(new ImageData(new Uint8ClampedArray(buf), w, h), 0, 0);
    return canvas;
}

export function canvasToBuffer(canvas: HTMLCanvasElement): Uint8ClampedArray {
    return new Uint8ClampedArray(canvasContext(canvas).getImageData(0, 0, canvas.width, canvas.height).data);
}

export function bufferToPngBlob(buf: Uint8ClampedArray, w: number, h: number): Promise<Blob> {
    return new Promise((resolve, reject) => {
        bufferToCanvas(buf, w, h).toBlob((blob) => (blob ? resolve(blob) : reject(new Error("PNG encoding failed"))), "image/png");
    });
}

async function decode(source: Blob | string): Promise<{ image: CanvasImageSource; width: number; height: number }> {
    if (typeof source === "string") {
        const image = new Image();
        image.src = source;
        await image.decode();
        return { image, width: image.naturalWidth, height: image.naturalHeight };
    }
    const bitmap = await createImageBitmap(source);
    return { image: bitmap, width: bitmap.width, height: bitmap.height };
}

function drawInto(image: CanvasImageSource, iw: number, ih: number, w: number, h: number, fit: "stretch" | "contain" | "nearest") {
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const context = canvasContext(canvas);
    context.imageSmoothingEnabled = false;
    let dw = w;
    let dh = h;
    let dx = 0;
    let dy = 0;
    if (fit === "contain") {
        const scale = Math.min(w / iw, h / ih);
        dw = Math.max(1, Math.round(iw * scale));
        dh = Math.max(1, Math.round(ih * scale));
        dx = Math.floor((w - dw) / 2);
        dy = Math.floor((h - dh) / 2);
    }
    if (fit === "nearest") {
        dw = iw;
        dh = ih;
        dx = Math.floor((w - dw) / 2);
        dy = Math.floor((h - dh) / 2);
    }
    context.drawImage(image, dx, dy, dw, dh);
    return canvasToBuffer(canvas);
}

export async function blobToBuffer(blob: Blob, w: number, h: number): Promise<Uint8ClampedArray> {
    const { image, width, height } = await decode(blob);
    return drawInto(image, width, height, w, h, "stretch");
}

export async function importImageToBuffer(source: Blob | string, w: number, h: number, fit: "stretch" | "contain" | "nearest"): Promise<Uint8ClampedArray> {
    const { image, width, height } = await decode(source);
    return drawInto(image, width, height, w, h, fit);
}

function scaledDataUrl(buf: Uint8ClampedArray, w: number, h: number, scale: number): string {
    const zoom = Math.max(1, Math.round(scale));
    if (zoom === 1) return bufferToCanvas(buf, w, h).toDataURL("image/png");
    return bufferToCanvas(resizeNearest(buf, w, h, w * zoom, h * zoom), w * zoom, h * zoom).toDataURL("image/png");
}

export function regionToPngDataUrl(buf: Uint8ClampedArray, w: number, h: number, x: number, y: number, rw: number, rh: number, scale = 1): string {
    return scaledDataUrl(extractRegion(buf, w, h, x, y, rw, rh), rw, rh, scale);
}

export function bufferToDataUrl(buf: Uint8ClampedArray, w: number, h: number, scale = 1): string {
    return scaledDataUrl(buf, w, h, scale);
}
