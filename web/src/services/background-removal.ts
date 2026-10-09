type BackgroundRemovalMessage =
    | { id: number; kind: "progress"; key: string; current: number; total: number }
    | { id: number; kind: "done"; blob: Blob }
    | { id: number; kind: "error"; message: string };

type PendingRequest = {
    resolve: (blob: Blob) => void;
    reject: (error: Error) => void;
    onProgress?: (key: string, current: number, total: number) => void;
};

let worker: Worker | null = null;
let nextRequestId = 1;
const pendingRequests = new Map<number, PendingRequest>();

function getWorker() {
    if (!worker) {
        worker = new Worker(new URL("./background-removal.worker.ts", import.meta.url), { type: "module" });
        worker.onmessage = (event: MessageEvent<BackgroundRemovalMessage>) => {
            const message = event.data;
            const request = pendingRequests.get(message.id);
            if (!request) return;
            if (message.kind === "progress") {
                request.onProgress?.(message.key, message.current, message.total);
                return;
            }
            pendingRequests.delete(message.id);
            if (message.kind === "done") request.resolve(message.blob);
            else request.reject(new Error(message.message));
        };
        worker.onerror = () => {
            const failed = [...pendingRequests.values()];
            pendingRequests.clear();
            worker?.terminate();
            worker = null;
            failed.forEach((request) => request.reject(new Error("Background removal worker failed")));
        };
    }
    return worker;
}

export function removeImageBackground(source: string | Blob, onProgress?: (key: string, current: number, total: number) => void) {
    const id = nextRequestId++;
    return new Promise<Blob>((resolve, reject) => {
        pendingRequests.set(id, { resolve, reject, onProgress });
        getWorker().postMessage({ id, source });
    });
}
