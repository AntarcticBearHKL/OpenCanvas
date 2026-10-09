import { BASIC_PITCH_SAMPLE_RATE } from "@/lib/audio/basic-pitch";

export type TranscriptionStage = "decode" | "separate" | "transcribe" | "build";

export type TranscriptionProgress = { stage: TranscriptionStage; progress: number; detail?: string };

export type MidiNoteEvent = { pitch: number; startTimeSeconds: number; durationSeconds: number; velocity: number; pitchBends?: number[] };

export type TranscribedTrack = { name: string; notes: MidiNoteEvent[] };

export type TranscribeResult = { tracks: TranscribedTrack[]; durationMs: number; tempo: number };

export type TranscribeOptions = { highQuality?: boolean; onProgress?: (p: TranscriptionProgress) => void; signal?: AbortSignal };

/** Wire format sent to the worker (exported for the worker's type-only import). */
export type MidiTranscriptionRequest = {
    id: number;
    mono: Float32Array;
    stereo?: { left: Float32Array; right: Float32Array; sampleRate: number };
    highQuality: boolean;
};

/** Wire format returned by the worker. */
export type MidiTranscriptionResponse =
    | { id: number; kind: "progress"; stage: TranscriptionStage; progress: number; detail?: string }
    | { id: number; kind: "done"; tracks: TranscribedTrack[] }
    | { id: number; kind: "error"; message: string };

const STEREO_SAMPLE_RATE = 44100;

type PendingRequest = {
    resolve: (tracks: TranscribedTrack[]) => void;
    reject: (error: Error) => void;
    onProgress?: (progress: TranscriptionProgress) => void;
};

let worker: Worker | null = null;
let nextRequestId = 1;
const pendingRequests = new Map<number, PendingRequest>();

function createAbortError() {
    return typeof DOMException !== "undefined" ? new DOMException("MIDI transcription aborted", "AbortError") : new Error("MIDI transcription aborted");
}

function failAll(error: Error) {
    const failed = [...pendingRequests.values()];
    pendingRequests.clear();
    worker?.terminate();
    worker = null;
    failed.forEach((request) => request.reject(error));
}

function getWorker() {
    if (!worker) {
        worker = new Worker(new URL("./midi-transcription.worker.ts", import.meta.url), { type: "module" });
        worker.onmessage = (event: MessageEvent<MidiTranscriptionResponse>) => {
            const message = event.data;
            const request = pendingRequests.get(message.id);
            if (!request) return;
            if (message.kind === "progress") {
                request.onProgress?.({ stage: message.stage, progress: message.progress, detail: message.detail });
                return;
            }
            pendingRequests.delete(message.id);
            if (message.kind === "done") request.resolve(message.tracks);
            else request.reject(new Error(message.message));
        };
        worker.onerror = () => failAll(new Error("MIDI transcription worker failed"));
    }
    return worker;
}

async function decodeAudioBuffer(source: Blob, numberOfChannels: number, sampleRate: number) {
    const data = await source.arrayBuffer();
    const context = new OfflineAudioContext(numberOfChannels, 1, sampleRate);
    return context.decodeAudioData(data);
}

function runWorker(request: Omit<MidiTranscriptionRequest, "id">, onProgress?: (progress: TranscriptionProgress) => void, signal?: AbortSignal): Promise<TranscribedTrack[]> {
    return new Promise((resolve, reject) => {
        if (signal?.aborted) {
            reject(createAbortError());
            return;
        }
        const id = nextRequestId++;
        const onAbort = () => failAll(createAbortError());
        const cleanup = () => signal?.removeEventListener("abort", onAbort);
        pendingRequests.set(id, {
            resolve: (tracks) => {
                cleanup();
                resolve(tracks);
            },
            reject: (error) => {
                cleanup();
                reject(error);
            },
            onProgress,
        });
        signal?.addEventListener("abort", onAbort, { once: true });
        const transfer: Transferable[] = [request.mono.buffer as ArrayBuffer];
        if (request.stereo) {
            transfer.push(request.stereo.left.buffer as ArrayBuffer);
            if (request.stereo.right.buffer !== request.stereo.left.buffer) transfer.push(request.stereo.right.buffer as ArrayBuffer);
        }
        getWorker().postMessage({ id, ...request }, transfer);
    });
}

export async function transcribeAudioToMidi(source: Blob, options: TranscribeOptions = {}): Promise<TranscribeResult> {
    const { highQuality = false, onProgress, signal } = options;
    if (signal?.aborted) throw createAbortError();

    onProgress?.({ stage: "decode", progress: 0, detail: "解码音频" });
    const decoded = await decodeAudioBuffer(source, 1, BASIC_PITCH_SAMPLE_RATE);
    if (signal?.aborted) throw createAbortError();
    const mono = decoded.getChannelData(0);
    const durationMs = decoded.duration * 1000;
    onProgress?.({ stage: "decode", progress: 1 });

    let stereo: MidiTranscriptionRequest["stereo"];
    if (highQuality) {
        const stereoBuffer = await decodeAudioBuffer(source, 2, STEREO_SAMPLE_RATE);
        if (signal?.aborted) throw createAbortError();
        const left = stereoBuffer.getChannelData(0);
        const right = stereoBuffer.numberOfChannels > 1 ? stereoBuffer.getChannelData(1) : left;
        stereo = { left, right, sampleRate: stereoBuffer.sampleRate };
    }

    const tracks = await runWorker({ mono, stereo, highQuality }, onProgress, signal);
    return { tracks, durationMs, tempo: 120 };
}
