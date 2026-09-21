const BROWSER_CACHE_SOURCE = "opencanvas-browser-cache";
const BROWSER_CACHE_APP_SOURCE = "opencanvas-app";
export const BROWSER_CACHE_DRAG_MIME = "application/x-infinite-canvas-browser-cache";

const READY_TIMEOUT_MS = 800;

export type BrowserCacheStatus = "unavailable" | "connecting" | "ready";

export type BrowserCacheItem = {
    id: string;
    name: string;
    mime: string;
    size: number;
    width: number;
    height: number;
    addedAt: number;
};

type BrowserCacheMessage = {
    source?: string;
    type?: string;
    version?: number;
    requestId?: string;
    ok?: boolean;
    error?: string;
    data?: unknown;
};

let status: BrowserCacheStatus = "connecting";
let listening = false;
let readyTimer: number | undefined;
let requestSeq = 0;
const pending = new Map<string, { resolve: (data: unknown) => void; reject: (error: Error) => void }>();
const statusListeners = new Set<(status: BrowserCacheStatus) => void>();

function nextRequestId() {
    requestSeq += 1;
    return `browser-cache-${Date.now()}-${requestSeq}`;
}

function setStatus(next: BrowserCacheStatus) {
    if (status === next) return;
    status = next;
    statusListeners.forEach((listener) => listener(next));
}

function handleMessage(event: MessageEvent) {
    if (event.origin !== window.location.origin) return;
    const message = event.data as BrowserCacheMessage | null;
    if (!message || message.source !== BROWSER_CACHE_SOURCE) return;

    if (message.type === "ready") {
        if (message.version !== 1) return;
        if (readyTimer !== undefined) {
            window.clearTimeout(readyTimer);
            readyTimer = undefined;
        }
        setStatus("ready");
        return;
    }

    if (message.type !== "response" || !message.requestId) return;
    const entry = pending.get(message.requestId);
    if (!entry) return;
    pending.delete(message.requestId);
    if (message.ok) entry.resolve(message.data);
    else entry.reject(new Error(message.error || "browser-cache-request-failed"));
}

function request<T>(action: "list" | "get" | "clear", id?: string): Promise<T> {
    if (status !== "ready") return Promise.reject(new Error("browser-cache-unavailable"));
    const requestId = nextRequestId();
    return new Promise<T>((resolve, reject) => {
        pending.set(requestId, { resolve: (data) => resolve(data as T), reject });
        window.postMessage({ source: BROWSER_CACHE_APP_SOURCE, type: "request", requestId, action, ...(id ? { id } : {}) }, window.location.origin);
    });
}

/** Attach the bridge listener once, then probe the extension; no `ready` within the timeout marks the bridge unavailable. */
export function initBrowserCacheBridge() {
    if (!listening) {
        window.addEventListener("message", handleMessage);
        listening = true;
    }
    if (readyTimer !== undefined) window.clearTimeout(readyTimer);
    if (status !== "ready") setStatus("connecting");
    window.postMessage({ source: BROWSER_CACHE_APP_SOURCE, type: "request", requestId: nextRequestId(), action: "hello" }, window.location.origin);
    readyTimer = window.setTimeout(() => {
        readyTimer = undefined;
        if (status !== "ready") setStatus("unavailable");
    }, READY_TIMEOUT_MS);
}

export function getBrowserCacheStatus(): BrowserCacheStatus {
    return status;
}

export function subscribeBrowserCacheStatus(listener: (status: BrowserCacheStatus) => void) {
    statusListeners.add(listener);
    return () => {
        statusListeners.delete(listener);
    };
}

export async function listBrowserCache(): Promise<BrowserCacheItem[]> {
    const data = await request<{ items?: BrowserCacheItem[] }>("list");
    return data?.items || [];
}

export async function getBrowserCacheFile(id: string): Promise<File | null> {
    try {
        const data = await request<{ name?: string; mime?: string; dataUrl?: string }>("get", id);
        if (!data?.dataUrl) return null;
        const blob = await (await fetch(data.dataUrl)).blob();
        return new File([blob], data.name || id, { type: data.mime || blob.type });
    } catch {
        return null;
    }
}
