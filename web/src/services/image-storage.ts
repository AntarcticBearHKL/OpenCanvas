import localforage from "localforage";

import { nanoid } from "nanoid";
import i18n from "@/i18n";
import { cleanupUnusedMedia } from "@/services/file-storage";

export type UploadedImage = {
    url: string;
    storageKey?: string;
    thumbnail?: string;
    thumbnailKey?: string;
    width: number;
    height: number;
    bytes: number;
    mimeType: string;
};

const store = localforage.createInstance({ name: "infinite-canvas", storeName: "image_files" });
const imageLogStore = localforage.createInstance({ name: "infinite-canvas", storeName: "image_generation_logs" });
const videoLogStore = localforage.createInstance({ name: "infinite-canvas", storeName: "video_generation_logs" });
const objectUrls = new Map<string, string>();
const IMAGE_DOWNLOAD_TIMEOUT_MS = 10 * 60_000;
const IMAGE_REMOTE_LOAD_TIMEOUT_MS = 10 * 60_000;
const IMAGE_DECODE_TIMEOUT_MS = 10_000;
const IMAGE_RESPONSE_ERROR = "ImageResponseError";
const IMAGE_TIMEOUT_ERROR = "ImageTimeoutError";
const THUMBNAIL_MAX_EDGE = 512;
const THUMBNAIL_QUALITY = 0.82;

type ImageReadOptions = { signal?: AbortSignal };

export async function uploadImage(input: string | Blob, options?: ImageReadOptions): Promise<UploadedImage> {
    if (typeof input !== "string") return storeImage(input, options);

    let blob: Blob;
    try {
        blob = await fetchImageBlob(input, options);
    } catch (error) {
        if (options?.signal?.aborted || isNamedError(error, IMAGE_RESPONSE_ERROR) || isNamedError(error, IMAGE_TIMEOUT_ERROR) || !/^https?:\/\//i.test(input)) throw error;
        const meta = await loadImageMeta(input, options, IMAGE_REMOTE_LOAD_TIMEOUT_MS);
        if (!meta) throw error;
        return { url: input, width: meta.width, height: meta.height, bytes: 0, mimeType: "" };
    }
    return storeImage(blob, options);
}

async function storeImage(blob: Blob, options?: ImageReadOptions): Promise<UploadedImage> {
    const storageKey = `image:${nanoid()}`;
    const url = URL.createObjectURL(blob);
    try {
        const meta = await loadImageMeta(url, options);
        if (!meta) throw new Error(i18n.t("common.imageReadFailed"));
        throwIfAborted(options?.signal);
        await store.setItem(storageKey, blob);
        throwIfAborted(options?.signal);
        objectUrls.set(storageKey, url);
        const thumbnail = await storeThumbnail(storageKey, blob);
        return { url, storageKey, thumbnail: thumbnail?.url, thumbnailKey: thumbnail?.key, width: meta.width, height: meta.height, bytes: blob.size, mimeType: blob.type.startsWith("image/") ? blob.type : "" };
    } catch (error) {
        URL.revokeObjectURL(url);
        await store.removeItem(storageKey).catch(() => undefined);
        throw error;
    }
}

function thumbnailStorageKey(storageKey: string) {
    return `thumb:${storageKey.replace(/^image:/, "")}`;
}

async function storeThumbnail(storageKey: string, source: Blob) {
    const key = thumbnailStorageKey(storageKey);
    const thumbnail = await createThumbnail(source);
    if (!thumbnail) return null;
    await store.setItem(key, thumbnail);
    const url = URL.createObjectURL(thumbnail);
    objectUrls.set(key, url);
    return { key, url };
}

async function createThumbnail(source: Blob) {
    const bitmap = await createImageBitmap(source).catch(() => null);
    if (!bitmap) return null;
    const longEdge = Math.max(bitmap.width, bitmap.height);
    const scale = longEdge > THUMBNAIL_MAX_EDGE ? THUMBNAIL_MAX_EDGE / longEdge : 1;
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) {
        bitmap.close();
        return null;
    }
    context.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();
    return (await canvasToBlob(canvas, "image/webp", THUMBNAIL_QUALITY)) || (await canvasToBlob(canvas, "image/jpeg", 0.85));
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number) {
    return new Promise<Blob | null>((resolve) => canvas.toBlob((blob) => resolve(blob), type, quality));
}

async function fetchImageBlob(url: string, options?: ImageReadOptions) {
    const controller = new AbortController();
    let timedOut = false;
    const abort = () => controller.abort();
    if (options?.signal?.aborted) abort();
    else options?.signal?.addEventListener("abort", abort, { once: true });
    const timer = window.setTimeout(() => {
        timedOut = true;
        controller.abort();
    }, IMAGE_DOWNLOAD_TIMEOUT_MS);
    try {
        const response = await fetch(url, { signal: controller.signal });
        if (!response.ok) throw namedError(IMAGE_RESPONSE_ERROR);
        return await response.blob();
    } catch (error) {
        if (timedOut) throw namedError(IMAGE_TIMEOUT_ERROR);
        if (options?.signal?.aborted) throw abortReason(options.signal);
        throw error;
    } finally {
        window.clearTimeout(timer);
        options?.signal?.removeEventListener("abort", abort);
    }
}

function loadImageMeta(url: string, options?: ImageReadOptions, timeoutMs = IMAGE_DECODE_TIMEOUT_MS) {
    return new Promise<{ width: number; height: number } | null>((resolve, reject) => {
        if (options?.signal?.aborted) return reject(abortReason(options.signal));
        const image = new Image();
        let settled = false;
        const finish = (value: { width: number; height: number } | null) => {
            if (settled) return;
            settled = true;
            window.clearTimeout(timer);
            options?.signal?.removeEventListener("abort", abort);
            image.onload = null;
            image.onerror = null;
            resolve(value);
        };
        const abort = () => {
            if (settled) return;
            settled = true;
            window.clearTimeout(timer);
            image.onload = null;
            image.onerror = null;
            reject(abortReason(options!.signal!));
        };
        const timer = window.setTimeout(() => finish(null), timeoutMs);
        options?.signal?.addEventListener("abort", abort, { once: true });
        image.onload = () => finish(image.naturalWidth && image.naturalHeight ? { width: image.naturalWidth, height: image.naturalHeight } : null);
        image.onerror = () => finish(null);
        image.src = url;
    });
}

function namedError(name: string) {
    const error = new Error(i18n.t("common.imageReadFailed"));
    error.name = name;
    return error;
}

function isNamedError(error: unknown, name: string) {
    return error instanceof Error && error.name === name;
}

function abortReason(signal: AbortSignal) {
    return signal.reason instanceof Error ? signal.reason : new DOMException("Aborted", "AbortError");
}

function throwIfAborted(signal?: AbortSignal) {
    if (signal?.aborted) throw abortReason(signal);
}

export async function resolveImageUrl(storageKey?: string, fallback = "") {
    if (!storageKey) return fallback;
    const cached = objectUrls.get(storageKey);
    if (cached) return cached;
    const blob = await store.getItem<Blob>(storageKey);
    if (!blob) return fallback;
    const url = URL.createObjectURL(blob);
    objectUrls.set(storageKey, url);
    return url;
}

const thumbnailJobs = new Map<string, Promise<string>>();

export async function ensureThumbnailUrl(storageKey?: string, fallback = "") {
    if (!storageKey) return fallback;
    const key = thumbnailStorageKey(storageKey);
    const cached = objectUrls.get(key);
    if (cached) return cached;
    const pending = thumbnailJobs.get(key);
    if (pending) return pending;
    const job = (async () => {
        const existing = await store.getItem<Blob>(key);
        if (existing) {
            const url = URL.createObjectURL(existing);
            objectUrls.set(key, url);
            return url;
        }
        const source = await store.getItem<Blob>(storageKey);
        if (!source) return fallback;
        const thumbnail = await storeThumbnail(storageKey, source);
        return thumbnail?.url || fallback;
    })();
    thumbnailJobs.set(key, job);
    try {
        return await job;
    } finally {
        thumbnailJobs.delete(key);
    }
}

export async function getImageBlob(storageKey: string) {
    return store.getItem<Blob>(storageKey);
}

export async function setImageBlob(storageKey: string, blob: Blob) {
    await store.setItem(storageKey, blob);
    const url = URL.createObjectURL(blob);
    objectUrls.set(storageKey, url);
    return url;
}

export async function imageToDataUrl(image: { url?: string; dataUrl?: string; storageKey?: string }, options?: ImageReadOptions) {
    const url = image.dataUrl || (await resolveImageUrl(image.storageKey, image.url || ""));
    if (!url || url.startsWith("data:")) return url;
    return blobToDataUrl(await fetchImageBlob(url, options));
}

async function deleteStoredImages(keys: Iterable<string>) {
    await Promise.all(
        Array.from(new Set(keys)).map(async (key) => {
            const url = objectUrls.get(key);
            if (url) URL.revokeObjectURL(url);
            objectUrls.delete(key);
            await store.removeItem(key);
        }),
    );
}

export async function cleanupUnusedImages(usedData: unknown) {
    const usedKeys = collectImageStorageKeys(usedData);
    await Promise.all([
        imageLogStore.iterate((value) => {
            collectImageStorageKeys(value, usedKeys);
        }),
        videoLogStore.iterate((value) => {
            collectImageStorageKeys(value, usedKeys);
        }),
    ]);
    const usedThumbKeys = new Set(Array.from(usedKeys, thumbnailStorageKey));
    const unused: string[] = [];
    await store.iterate((_value, key) => {
        if (!usedKeys.has(key) && !usedThumbKeys.has(key)) unused.push(key);
    });
    await deleteStoredImages(unused);
}

export function cleanupUnusedCanvasImages(extra?: unknown) {
    window.setTimeout(async () => {
        const { useCanvasStore } = await import("@/stores/canvas/use-canvas-store");
        const { psPatternCleanupExtra } = await import("@/stores/use-ps-asset-store");
        const used = { ...(extra as object | undefined), ...psPatternCleanupExtra() };
        await cleanupUnusedImages({ projects: useCanvasStore.getState().projects, extra: used });
        await cleanupUnusedMedia({ projects: useCanvasStore.getState().projects, extra: used });
    }, 0);
}

function collectImageStorageKeys(value: unknown, keys = new Set<string>()) {
    if (!value || typeof value !== "object") return keys;
    // Layer content and layer masks both use the same image-store convention, so both fields keep their bitmap alive.
    (["storageKey", "maskStorageKey"] as const).forEach((field) => {
        const key = (value as Record<string, unknown>)[field];
        if (typeof key === "string" && key.startsWith("image:")) keys.add(key);
    });
    Object.values(value).forEach((item) => (Array.isArray(item) ? item.forEach((child) => collectImageStorageKeys(child, keys)) : collectImageStorageKeys(item, keys)));
    return keys;
}

function blobToDataUrl(blob: Blob) {
    return new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = () => reject(new Error(i18n.t("common.imageReadFailed")));
        reader.readAsDataURL(blob);
    });
}
