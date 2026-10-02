import * as ort from "onnxruntime-web";

import {
    BASIC_PITCH_BINS,
    BASIC_PITCH_CONTOUR_BINS,
    BASIC_PITCH_DEFAULT_FRAME_THRESHOLD,
    BASIC_PITCH_DEFAULT_MIN_NOTE_LENGTH_FRAMES,
    BASIC_PITCH_DEFAULT_ONSET_THRESHOLD,
    BASIC_PITCH_FRAMES_PER_WINDOW,
    BASIC_PITCH_INPUT_NAME,
    BASIC_PITCH_INPUT_SHAPE,
    BASIC_PITCH_SAMPLE_RATE,
    buildMidiTranscriptionWindow,
    decodeBasicPitchOutput,
    downmixAndResample,
    midiTranscriptionWindowCount,
    unwrapBasicPitchOutput,
} from "@/lib/audio/basic-pitch";
import { separateStems } from "@/services/stem-separation";

import type { MidiNoteEvent, MidiTranscriptionRequest, MidiTranscriptionResponse, TranscribedTrack } from "./midi-transcription";

const MODEL_URLS = [
    "https://huggingface.co/daserge/basic-pitch-onnx/resolve/main/nmp.onnx",
    "https://raw.githubusercontent.com/spotify/basic-pitch/main/basic_pitch/saved_models/icassp_2022/nmp.onnx",
];
const MODEL_CACHE_NAME = "basic-pitch-onnx-v1";
const MODEL_CACHE_KEY = "https://basic-pitch-onnx.local/nmp.onnx";

ort.env.wasm.numThreads = 1;
ort.env.wasm.wasmPaths = `https://cdn.jsdelivr.net/npm/onnxruntime-web@${ort.env.versions.web}/dist/`;

const post = (message: MidiTranscriptionResponse) => (self as unknown as { postMessage: (message: unknown) => void }).postMessage(message);

type OutputNames = { note: string; onset: string; contour: string };

let session: ort.InferenceSession | null = null;
let outputNames: OutputNames | null = null;
let loading: Promise<ort.InferenceSession> | null = null;

async function readWithProgress(response: Response, total: number, onProgress: (fraction: number) => void) {
    if (!response.body) return response.arrayBuffer();
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let loaded = 0;
    for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        loaded += value.length;
        if (total > 0) onProgress(loaded / total);
    }
    const bytes = new Uint8Array(loaded);
    let offset = 0;
    for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.length;
    }
    return bytes.buffer as ArrayBuffer;
}

async function fetchModel(onProgress: (fraction: number, cached: boolean) => void) {
    const cache = await caches.open(MODEL_CACHE_NAME);
    const cached = await cache.match(MODEL_CACHE_KEY);
    if (cached) {
        onProgress(1, true);
        return cached.arrayBuffer();
    }
    let lastError: unknown = null;
    for (const url of MODEL_URLS) {
        try {
            const response = await fetch(url);
            if (!response.ok) throw new Error(`Basic Pitch download failed (${response.status})`);
            const buffer = await readWithProgress(response, Number(response.headers.get("content-length")) || 0, (fraction) => onProgress(fraction, false));
            try {
                await cache.put(MODEL_CACHE_KEY, new Response(buffer));
            } catch {
                // Cache Storage may be unavailable (private mode / quota); the model still works.
            }
            return buffer;
        } catch (error) {
            lastError = error;
        }
    }
    throw lastError instanceof Error ? lastError : new Error("Basic Pitch model download failed");
}

async function getSession(onProgress: (fraction: number, cached: boolean) => void) {
    if (session) {
        onProgress(1, true);
        return session;
    }
    if (!loading) {
        loading = (async () => {
            const buffer = await fetchModel(onProgress);
            session = await ort.InferenceSession.create(buffer, { executionProviders: ["wasm"] });
            return session;
        })().finally(() => {
            loading = null;
        });
    }
    return loading;
}

function classifyOutputs(active: ort.InferenceSession, results: ort.InferenceSession.ReturnType): OutputNames {
    const order = active.outputNames.filter((name) => name in results);
    const contour = order.find((name) => results[name].dims[results[name].dims.length - 1] === BASIC_PITCH_CONTOUR_BINS);
    const eights = order.filter((name) => results[name].dims[results[name].dims.length - 1] === BASIC_PITCH_BINS);
    if (!contour || eights.length < 2) throw new Error("Basic Pitch model output shape mismatch");
    return { note: eights[0], onset: eights[1], contour };
}

function appendRows(target: number[][], rows: number[][]) {
    for (const row of rows) target.push(row);
}

async function runBasicPitch(samples: Float32Array, report: (progress: number, detail?: string) => void) {
    const active = await getSession((fraction, cached) => report(fraction * 0.4, cached ? "模型已缓存" : "下载模型"));
    const windows = midiTranscriptionWindowCount(samples.length);
    const frames: number[][] = [];
    const onsets: number[][] = [];
    const contours: number[][] = [];
    for (let index = 0; index < windows; index += 1) {
        const input = new ort.Tensor("float32", buildMidiTranscriptionWindow(samples, index), BASIC_PITCH_INPUT_SHAPE);
        const results = await active.run({ [BASIC_PITCH_INPUT_NAME]: input });
        if (!outputNames) outputNames = classifyOutputs(active, results);
        const names = outputNames;
        appendRows(frames, unwrapBasicPitchOutput(results[names.note].data as Float32Array, BASIC_PITCH_FRAMES_PER_WINDOW, BASIC_PITCH_BINS));
        appendRows(onsets, unwrapBasicPitchOutput(results[names.onset].data as Float32Array, BASIC_PITCH_FRAMES_PER_WINDOW, BASIC_PITCH_BINS));
        appendRows(contours, unwrapBasicPitchOutput(results[names.contour].data as Float32Array, BASIC_PITCH_FRAMES_PER_WINDOW, BASIC_PITCH_CONTOUR_BINS));
        report(0.4 + (0.5 * (index + 1)) / windows);
    }
    report(1);
    return { frames, onsets, contours };
}

function toTrack(name: string, notes: ReturnType<typeof decodeBasicPitchOutput>): TranscribedTrack {
    return {
        name,
        notes: notes.map<MidiNoteEvent>((note) => ({
            pitch: note.pitchMidi,
            startTimeSeconds: note.startTimeSeconds,
            durationSeconds: note.durationSeconds,
            velocity: note.amplitude,
            pitchBends: note.pitchBends,
        })),
    };
}

function decodeTrack(name: string, matrices: Awaited<ReturnType<typeof runBasicPitch>>): TranscribedTrack {
    return toTrack(
        name,
        decodeBasicPitchOutput(matrices.frames, matrices.onsets, matrices.contours, {
            onsetThreshold: BASIC_PITCH_DEFAULT_ONSET_THRESHOLD,
            frameThreshold: BASIC_PITCH_DEFAULT_FRAME_THRESHOLD,
            minNoteLengthFrames: BASIC_PITCH_DEFAULT_MIN_NOTE_LENGTH_FRAMES,
        }),
    );
}

async function separate(stereo: { left: Float32Array; right: Float32Array; sampleRate: number }, id: number) {
    const tracks: TranscribedTrack[] = [];
    let stems: { name: string; left: Float32Array; right: Float32Array }[] | null = null;
    try {
        stems = await separateStems(stereo, (progress) => post({ id, kind: "progress", stage: "separate", progress }));
    } catch {
        post({ id, kind: "progress", stage: "separate", progress: 1, detail: "分轨失败，回退到整轨" });
    }
    const inputs = stems && stems.length > 0
        ? stems.map((stem) => ({ name: stem.name, samples: downmixAndResample(stem.left, stem.right, stereo.sampleRate, BASIC_PITCH_SAMPLE_RATE) }))
        : [];
    if (inputs.length === 0) return null;
    for (let index = 0; index < inputs.length; index += 1) {
        const { name, samples } = inputs[index];
        const matrices = await runBasicPitch(samples, (progress, detail) =>
            post({ id, kind: "progress", stage: "transcribe", progress: (index + progress) / inputs.length, detail }),
        );
        post({ id, kind: "progress", stage: "build", progress: (index + 1) / inputs.length });
        tracks.push(decodeTrack(name, matrices));
    }
    return tracks;
}

async function handle(request: MidiTranscriptionRequest) {
    let tracks: TranscribedTrack[] | null = null;
    if (request.highQuality && request.stereo) {
        tracks = await separate(request.stereo, request.id);
    }
    if (!tracks) {
        const matrices = await runBasicPitch(request.mono, (progress, detail) => post({ id: request.id, kind: "progress", stage: "transcribe", progress, detail }));
        post({ id: request.id, kind: "progress", stage: "build", progress: 0 });
        tracks = [decodeTrack("mix", matrices)];
        post({ id: request.id, kind: "progress", stage: "build", progress: 1 });
    }
    post({ id: request.id, kind: "done", tracks });
}

self.onmessage = async (event: MessageEvent<MidiTranscriptionRequest>) => {
    const { id } = event.data;
    try {
        await handle(event.data);
    } catch (error) {
        post({ id, kind: "error", message: error instanceof Error ? error.message : String(error) });
    }
};
