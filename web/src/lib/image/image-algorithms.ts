import { createCanvasContext } from "@/lib/canvas/canvas-2d";

type SmartCropArea = { x: number; y: number; width: number; height: number };

export function resolveSmartCropArea(width: number, height: number, aspect: number, topCrop: SmartCropArea): SmartCropArea {
    const fullWidth = Math.max(1, Math.round(width));
    const fullHeight = Math.max(1, Math.round(height));
    if (!Number.isFinite(aspect) || aspect <= 0) return { x: 0, y: 0, width: fullWidth, height: fullHeight };
    const x = Math.min(Math.max(0, Math.round(topCrop.x)), fullWidth - 1);
    const y = Math.min(Math.max(0, Math.round(topCrop.y)), fullHeight - 1);
    return {
        x,
        y,
        width: Math.min(Math.max(1, Math.round(topCrop.width)), fullWidth - x),
        height: Math.min(Math.max(1, Math.round(topCrop.height)), fullHeight - y),
    };
}

export async function extractImagePalette(dataUrl: string, count = 6): Promise<string[]> {
    const [{ getPaletteSync }, image] = await Promise.all([import("colorthief"), loadImage(dataUrl)]);
    const palette = getPaletteSync(image, { colorCount: count });
    return Array.from(new Set((palette || []).map((color) => color.hex().toLowerCase())));
}

export async function readImageExif(source: string | Blob): Promise<Record<string, unknown> | null> {
    try {
        const exifr = (await import("exifr")).default;
        const data = await exifr.parse(source, { tiff: true, gps: true, exif: true });
        if (!data || typeof data !== "object") return null;
        const record: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(data)) record[key] = value;
        return Object.keys(record).length ? record : null;
    } catch {
        return null;
    }
}

export async function computePerceptualHash(dataUrl: string): Promise<string> {
    const image = await loadImage(dataUrl);
    const { canvas, context } = createCanvasContext(image.width, image.height);
    if (!context) return "";
    context.drawImage(image, 0, 0);
    const { default: imghash } = await import("imghash");
    const raw = imghash.hashRaw(context.getImageData(0, 0, canvas.width, canvas.height), 8);
    return /^[0-9a-f]+$/i.test(raw) ? raw.padStart(16, "0") : raw;
}

export async function suggestSmartCrop(dataUrl: string, aspect: number): Promise<SmartCropArea> {
    const image = await loadImage(dataUrl);
    const width = Math.max(1, Math.round(image.naturalWidth || image.width));
    const height = Math.max(1, Math.round(image.naturalHeight || image.height));
    const target = cropBoxForAspect(width, height, aspect);
    const { default: smartcrop } = await import("smartcrop");
    const result = await smartcrop.crop(image, { width: target.width, height: target.height });
    return resolveSmartCropArea(width, height, aspect, result.topCrop);
}

function cropBoxForAspect(width: number, height: number, aspect: number) {
    if (!Number.isFinite(aspect) || aspect <= 0) return { width, height };
    const byWidth = { width, height: Math.round(width / aspect) };
    const byHeight = { width: Math.round(height * aspect), height };
    const box = byWidth.height <= height ? byWidth : byHeight;
    return { width: Math.min(width, Math.max(1, box.width)), height: Math.min(height, Math.max(1, box.height)) };
}

function loadImage(dataUrl: string) {
    return new Promise<HTMLImageElement>((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error("Image failed to load"));
        image.src = dataUrl;
    });
}
