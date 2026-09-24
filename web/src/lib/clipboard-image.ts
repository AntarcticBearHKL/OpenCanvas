import { createCanvasContext } from "@/lib/canvas/canvas-2d";

export async function copyImageToClipboard(source: string | Blob | null | undefined): Promise<boolean> {
    if (!source || typeof ClipboardItem === "undefined" || !navigator.clipboard?.write) return false;
    try {
        const blob = source instanceof Blob ? source : await fetch(source).then((response) => response.blob());
        const png = blob.type === "image/png" ? blob : await toPngBlob(blob);
        if (!png) return false;
        await navigator.clipboard.write([new ClipboardItem({ "image/png": png })]);
        return true;
    } catch {
        return false;
    }
}

async function toPngBlob(blob: Blob) {
    const bitmap = await createImageBitmap(blob).catch(() => null);
    if (!bitmap) return null;
    const { canvas, context } = createCanvasContext(bitmap.width, bitmap.height);
    if (!context) {
        bitmap.close();
        return null;
    }
    context.drawImage(bitmap, 0, 0);
    bitmap.close();
    return new Promise<Blob | null>((resolve) => canvas.toBlob((result) => resolve(result), "image/png"));
}
