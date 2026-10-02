import { blobToBuffer, bufferToPngBlob } from "@/lib/canvas/pixel/io";
import { compositeLayers, makeBuffer } from "@/lib/canvas/pixel/raster";
import { resolveImageUrl } from "@/services/image-storage";
import type { CanvasPixelDoc } from "@/types/canvas";

/** Composites one frame of a pixel document into a PNG File, mirroring the pixel studio's own export path. */
export async function compositePixelFrameFile(doc: CanvasPixelDoc, frameId: string, fileName: string): Promise<File> {
    const frame = doc.frames.find((item) => item.id === frameId) ?? doc.frames[0];
    const layers: { buffer: Uint8ClampedArray; opacity: number; blend: CanvasPixelDoc["layers"][number]["blend"]; visible: boolean }[] = [];
    for (const layer of doc.layers) {
        const cel = frame?.cels[layer.id];
        let buffer: Uint8ClampedArray | null = null;
        if (cel?.storageKey) {
            try {
                const url = await resolveImageUrl(cel.storageKey);
                if (url) buffer = await blobToBuffer(await (await fetch(url)).blob(), doc.width, doc.height);
            } catch {
                buffer = null;
            }
        }
        layers.push({ buffer: buffer ?? makeBuffer(doc.width, doc.height), opacity: layer.opacity, blend: layer.blend, visible: layer.visible });
    }
    const composite = compositeLayers(layers, doc.width, doc.height, doc.background);
    const blob = await bufferToPngBlob(composite, doc.width, doc.height);
    return new File([blob], fileName, { type: "image/png" });
}
