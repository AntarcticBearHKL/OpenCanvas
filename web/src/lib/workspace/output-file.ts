import { getMediaBlob, resolveMediaUrl } from "@/services/file-storage";
import { getImageBlob, resolveImageUrl } from "@/services/image-storage";
import { CanvasNodeType, type CanvasNodeData } from "@/types/canvas";

const ILLEGAL_FILE_CHARS = /[\\/:*?"<>|\u0000-\u001f]/g;
const MAX_FILE_BASE = 48;
const MIME_EXTENSIONS: [string, string][] = [
    ["png", "png"],
    ["jpeg", "jpg"],
    ["jpg", "jpg"],
    ["webp", "webp"],
    ["gif", "gif"],
    ["avif", "avif"],
    ["quicktime", "mov"],
    ["mp4", "mp4"],
    ["webm", "webm"],
    ["mpeg", "mp3"],
    ["ogg", "ogg"],
    ["wav", "wav"],
];

function sanitizeOutputBase(value: string) {
    return value
        .replace(ILLEGAL_FILE_CHARS, "")
        .replace(/\s+/g, " ")
        .replace(/^[.\s]+|[.\s]+$/g, "")
        .slice(0, MAX_FILE_BASE);
}

export function outputFileExtension(mimeType?: string, storageKey?: string) {
    const type = (mimeType || "").toLowerCase();
    const match = MIME_EXTENSIONS.find(([needle]) => type.includes(needle));
    if (match) return match[1];
    if (storageKey?.startsWith("image:")) return "png";
    if (storageKey?.startsWith("video:")) return "mp4";
    if (storageKey?.startsWith("audio:")) return "mp3";
    return "png";
}

export function outputFileName(title: string, fallbackId: string, mimeType?: string, storageKey?: string) {
    const base = sanitizeOutputBase(title) || sanitizeOutputBase(fallbackId) || "output";
    return `${base}.${outputFileExtension(mimeType, storageKey)}`;
}

export function outputSourceFingerprint(sourceId: string, storageKey?: string, content?: string) {
    const value = content || "";
    return `${sourceId}:${storageKey || `${value.length}:${value.slice(0, 64)}`}`;
}

export async function resolveOutputBlob(source: CanvasNodeData) {
    const storageKey = source.metadata?.storageKey;
    const content = source.metadata?.content || "";
    const image = source.type === CanvasNodeType.Image;
    const stored = storageKey ? await (image ? getImageBlob(storageKey) : getMediaBlob(storageKey)) : null;
    if (stored) return stored;
    const url = image ? await resolveImageUrl(storageKey, content) : await resolveMediaUrl(storageKey, content);
    if (!url) return null;
    return (await fetch(url)).blob();
}
