import i18n from "@/i18n";
import { blobToDataUrl, getMediaBlob } from "@/services/file-storage";
import { getImageBlob } from "@/services/image-storage";
import { useCanvasStore } from "@/stores/canvas/use-canvas-store";
import { CanvasNodeType, type CanvasNodeData, type CanvasNodeImage } from "@/types/canvas";

// Read the REAL bytes of a canvas resource node for an external agent. A node's `metadata.content` is
// often a session-only `blob:` URL, so durable bytes always come from the localforage stores keyed by
// `metadata.storageKey`; only inline (`data:`) or remote (`http(s):`) URLs are a valid fallback.

/** Decoded-byte ceiling for one node payload; callers may override per call with `maxBytes`. */
export const MAX_NODE_CONTENT_BYTES = 16 * 1024 * 1024;

export type NodeContentKind = "image" | "video" | "audio" | "midi" | "text";

export type NodeContentResult =
    | { ok: true; kind: NodeContentKind; mimeType: string; filename: string; bytes?: number; dataUrl?: string; text?: string }
    | { ok: false; error: string };

type BinaryKind = Exclude<NodeContentKind, "text">;

const DEFAULT_MIME: Record<NodeContentKind, string> = {
    image: "image/png",
    video: "video/mp4",
    audio: "audio/mpeg",
    midi: "audio/midi",
    text: "text/plain",
};

const MIME_EXTENSIONS: Record<string, string> = {
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/webp": ".webp",
    "image/gif": ".gif",
    "image/svg+xml": ".svg",
    "video/mp4": ".mp4",
    "video/webm": ".webm",
    "video/quicktime": ".mov",
    "audio/mpeg": ".mp3",
    "audio/wav": ".wav",
    "audio/ogg": ".ogg",
    "audio/midi": ".mid",
    "audio/x-midi": ".mid",
};

const FALLBACK_EXTENSIONS: Record<NodeContentKind, string> = {
    image: ".png",
    video: ".mp4",
    audio: ".mp3",
    midi: ".mid",
    text: ".txt",
};

export async function resolveNodeContent(projectId: string, nodeId: string, itemId?: string, maxBytes: number = MAX_NODE_CONTENT_BYTES): Promise<NodeContentResult> {
    const project = useCanvasStore.getState().projects.find((entry) => entry.id === projectId);
    if (!project) return { ok: false, error: i18n.t("agent.siteTools.canvasNotFound") };
    const node = project.nodes.find((entry) => entry.id === nodeId);
    if (!node) return { ok: false, error: i18n.t("agent.siteTools.nodeNotFound") };
    const kind = kindForNode(node);
    return kind === "text" ? resolveText(node, maxBytes) : resolveBinary(node, kind, itemId, maxBytes);
}

function kindForNode(node: CanvasNodeData): NodeContentKind {
    if (node.type === CanvasNodeType.Video) return "video";
    if (node.type === CanvasNodeType.Audio) return "audio";
    if (node.type === CanvasNodeType.Midi) return "midi";
    if (node.type === CanvasNodeType.Image || node.type === CanvasNodeType.ImageStack) return "image";
    return "text";
}

function resolveText(node: CanvasNodeData, maxBytes: number): NodeContentResult {
    const metadata = node.metadata || {};
    const content = typeof metadata.content === "string" ? metadata.content : "";
    const prompt = typeof metadata.prompt === "string" ? metadata.prompt : "";
    const text = content || prompt;
    if (!text) return { ok: false, error: i18n.t("agent.siteTools.nodeContentUnavailable") };
    const bytes = new TextEncoder().encode(text).length;
    if (bytes > maxBytes) return { ok: false, error: tooLarge(maxBytes) };
    return { ok: true, kind: "text", mimeType: DEFAULT_MIME.text, filename: filenameFor(node, DEFAULT_MIME.text, "text"), bytes, text };
}

async function resolveBinary(node: CanvasNodeData, kind: BinaryKind, itemId: string | undefined, maxBytes: number): Promise<NodeContentResult> {
    const metadata = node.metadata || {};
    let storageKey = typeof metadata.storageKey === "string" ? metadata.storageKey : "";
    let content = typeof metadata.content === "string" ? metadata.content : "";
    let declaredMime = typeof metadata.mimeType === "string" ? metadata.mimeType : "";
    if (kind === "image" && metadata.images?.length) {
        const chosen = pickImage(metadata.images, itemId, metadata.primaryImageId);
        if (!chosen) return { ok: false, error: i18n.t("agent.siteTools.nodeImageNotFound") };
        storageKey = chosen.storageKey || "";
        content = chosen.content || "";
        declaredMime = chosen.mimeType || declaredMime;
    }
    const blob = await readBlob(kind, storageKey, content);
    if (!blob) return { ok: false, error: i18n.t("agent.siteTools.nodeContentUnavailable") };
    if (blob.size > maxBytes) return { ok: false, error: tooLarge(maxBytes) };
    const mimeType = blob.type || declaredMime || DEFAULT_MIME[kind];
    return { ok: true, kind, mimeType, filename: filenameFor(node, mimeType, kind), bytes: blob.size, dataUrl: await blobToDataUrl(blob) };
}

function pickImage(images: CanvasNodeImage[], itemId: string | undefined, primaryImageId: string | undefined) {
    if (itemId) return images.find((image) => image.id === itemId) ?? null;
    return images.find((image) => image.id === primaryImageId) ?? images[0];
}

async function readBlob(kind: BinaryKind, storageKey: string, content: string): Promise<Blob | null> {
    if (storageKey) {
        const stored = kind === "image" ? await getImageBlob(storageKey) : await getMediaBlob(storageKey);
        if (stored) return stored;
    }
    if (/^(data:|https?:)/i.test(content)) {
        const response = await fetch(content).catch(() => null);
        if (response?.ok) return response.blob();
    }
    return null;
}

function filenameFor(node: CanvasNodeData, mimeType: string, kind: NodeContentKind) {
    const base = (node.title || node.id || kind).trim().replace(/[\\/:*?"<>|]+/g, "_").slice(0, 80) || kind;
    const bare = mimeType.split(";")[0]?.trim() || "";
    return `${base}${MIME_EXTENSIONS[bare] || FALLBACK_EXTENSIONS[kind]}`;
}

function tooLarge(maxBytes: number) {
    return i18n.t("agent.siteTools.nodeContentTooLarge", { max: `${Math.round(maxBytes / (1024 * 1024))} MB` });
}
