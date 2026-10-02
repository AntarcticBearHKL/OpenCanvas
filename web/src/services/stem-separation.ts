import type { SeparatedStem, StereoPcm } from "@/lib/audio/demucs";

export type { StemName, SeparatedStem, StereoPcm } from "@/lib/audio/demucs";

type WorkerMessage =
    | { id: number; kind: "progress"; value: number }
    | { id: number; kind: "done"; stems: { name: SeparatedStem["name"]; left: ArrayBuffer; right: ArrayBuffer }[] }
    | { id: number; kind: "error"; message: string };

type PendingRequest = {
    resolve: (stems: SeparatedStem[]) => void;
    reject: (error: Error) => void;
    onProgress?: (p: number) => void;
};

let worker: Worker | null = null;
let nextRequestId = 1;
const pendingRequests = new Map<number, PendingRequest>();

function terminateWorker() {
    worker?.terminate();
    worker = null;
}

function getWorker() {
    if (!worker) {
        worker = new Worker(new URL("./stem-separation.worker.ts", import.meta.url), { type: "module" });
        worker.onmessage = (event: MessageEvent<WorkerMessage>) => {
            const message = event.data;
            const request = pendingRequests.get(message.id);
            if (!request) return;
            if (message.kind === "progress") {
                request.onProgress?.(message.value);
                return;
            }
            pendingRequests.delete(message.id);
            if (message.kind === "done") {
                request.resolve(message.stems.map((stem) => ({ name: stem.name, left: new Float32Array(stem.left), right: new Float32Array(stem.right) })));
            } else {
                request.reject(new Error(message.message));
            }
        };
        worker.onerror = () => {
            const failed = [...pendingRequests.values()];
            pendingRequests.clear();
            terminateWorker();
            failed.forEach((request) => request.reject(new Error("分轨 worker 运行失败")));
        };
    }
    return worker;
}

// onProgress reports 0-100, matching the other local-model warm-up APIs.
export function separateStems(pcm: StereoPcm, onProgress?: (p: number) => void, signal?: AbortSignal) {
    const id = nextRequestId++;
    return new Promise<SeparatedStem[]>((resolve, reject) => {
        if (signal?.aborted) {
            reject(new DOMException("Aborted", "AbortError"));
            return;
        }
        const onAbort = () => {
            terminateWorker();
            const aborted = [...pendingRequests.values()];
            pendingRequests.clear();
            aborted.forEach((request) => request.reject(new DOMException("Aborted", "AbortError")));
        };
        signal?.addEventListener("abort", onAbort, { once: true });
        const done = (stems: SeparatedStem[]) => {
            signal?.removeEventListener("abort", onAbort);
            resolve(stems);
        };
        const fail = (error: Error) => {
            signal?.removeEventListener("abort", onAbort);
            reject(error);
        };
        pendingRequests.set(id, { resolve: done, reject: fail, onProgress });
        // Copy so transferring does not detach the caller's buffers.
        const left = pcm.left.slice();
        const right = pcm.right.slice();
        getWorker().postMessage({ id, left: left.buffer, right: right.buffer, sampleRate: pcm.sampleRate }, [left.buffer, right.buffer] as Transferable[]);
    });
}
