import * as ort from "onnxruntime-web";

export type StemName = "vocals" | "drums" | "bass" | "other" | "guitar" | "piano";
export type SeparatedStem = { name: StemName; left: Float32Array; right: Float32Array };
export type StereoPcm = { left: Float32Array; right: Float32Array; sampleRate: number };

const MODEL_URL = "https://huggingface.co/StemSplitio/htdemucs-onnx/resolve/main/htdemucs_fp16weights.onnx";
const CACHE_NAME = "demucs-htdemucs-fp16-v1";
const INPUT_NAME = "mix";
const OUTPUT_NAME = "stems";
const MODEL_STEM_ORDER: StemName[] = ["drums", "bass", "other", "vocals"];

// Monolithic htdemucs: the whole STFT / ISTFT lives inside the graph, so the
// only boundary is a fixed 44100 Hz stereo window of 343980 samples (~7.8 s).
const SAMPLE_RATE = 44100;
const CHUNK = 343980;
const OVERLAP = Math.floor(CHUNK / 4);
const STRIDE = CHUNK - OVERLAP;

ort.env.wasm.numThreads = navigator.hardwareConcurrency ?? 4;
ort.env.wasm.wasmPaths = `https://cdn.jsdelivr.net/npm/onnxruntime-web@${ort.env.versions.web}/dist/`;

// Demucs transition window: a triangle rising from 1/peak to 1 and back. Its
// value is never zero, so overlap-add never needs a bare divide-by-zero; the
// weight sum still gets normalized to undo the cross-fade.
export function createDemucsWindow(size = CHUNK) {
    const window = new Float32Array(size);
    const half = size >> 1;
    for (let i = 0; i < half; i += 1) window[i] = (i + 1) / half;
    for (let i = half; i < size; i += 1) window[i] = (size - i) / half;
    return window;
}

export function demucsChunkCount(totalSamples: number) {
    return totalSamples <= CHUNK ? 1 : Math.ceil((totalSamples - CHUNK) / STRIDE) + 1;
}

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

async function fetchModel(onProgress: (fraction: number) => void) {
    const cache = typeof caches !== "undefined" ? await caches.open(CACHE_NAME) : null;
    const cached = await cache?.match(MODEL_URL);
    if (cached) {
        onProgress(1);
        return cached.arrayBuffer();
    }
    let response: Response;
    try {
        response = await fetch(MODEL_URL);
    } catch {
        throw new Error("分轨模型下载失败，请检查网络连接后重试");
    }
    if (!response.ok) throw new Error(`分轨模型下载失败（HTTP ${response.status}）`);
    const buffer = await readWithProgress(response, Number(response.headers.get("content-length")) || 0, onProgress);
    try {
        await cache?.put(MODEL_URL, new Response(buffer));
    } catch {
        // Cache Storage may be unavailable or full; the model still works in-memory.
    }
    onProgress(1);
    return buffer;
}

async function pickExecutionProviders(): Promise<string[]> {
    if ("gpu" in navigator) {
        try {
            const gpu = (navigator as Navigator & { gpu?: { requestAdapter(): Promise<unknown> } }).gpu;
            if (gpu && (await gpu.requestAdapter())) return ["webgpu"];
        } catch {
            // Fall through to wasm when WebGPU is present but unusable.
        }
    }
    return ["wasm"];
}

let session: ort.InferenceSession | null = null;
let loading: Promise<ort.InferenceSession> | null = null;

export async function loadDemucsSession(onProgress?: (fraction: number) => void) {
    if (session) return session;
    if (loading) return loading;
    loading = (async () => {
        const buffer = await fetchModel(onProgress ?? (() => {}));
        const providers = await pickExecutionProviders();
        let created: ort.InferenceSession;
        try {
            created = await ort.InferenceSession.create(buffer, { executionProviders: providers });
        } catch (error) {
            if (providers[0] !== "webgpu") throw error;
            created = await ort.InferenceSession.create(buffer, { executionProviders: ["wasm"] });
        }
        session = created;
        return created;
    })().finally(() => {
        loading = null;
    });
    return loading;
}

function resample(input: Float32Array, from: number, to: number) {
    if (from === to || input.length === 0) return input;
    const length = Math.max(1, Math.round((input.length * to) / from));
    const output = new Float32Array(length);
    const step = (input.length - 1) / Math.max(1, length - 1);
    for (let i = 0; i < length; i += 1) {
        const position = i * step;
        const lower = Math.floor(position);
        const upper = Math.min(lower + 1, input.length - 1);
        const t = position - lower;
        output[i] = input[lower] * (1 - t) + input[upper] * t;
    }
    return output;
}

function allocateBuffers(total: number) {
    try {
        return {
            channels: Array.from({ length: MODEL_STEM_ORDER.length * 2 }, () => new Float32Array(total)),
            weight: new Float32Array(total),
        };
    } catch {
        throw new Error("内存不足，无法为分轨结果分配缓冲区，请尝试更短的音频");
    }
}

export async function separateStemsCore(
    activeSession: ort.InferenceSession,
    pcm: StereoPcm,
    onProgress: (fraction: number) => void,
    isAborted: () => boolean,
): Promise<SeparatedStem[]> {
    const left = resample(pcm.left, pcm.sampleRate, SAMPLE_RATE);
    const right = resample(pcm.right, pcm.sampleRate, SAMPLE_RATE);
    const total = Math.min(left.length, right.length);
    if (total === 0) return MODEL_STEM_ORDER.map((name) => ({ name, left: new Float32Array(0), right: new Float32Array(0) }));

    const { channels, weight } = allocateBuffers(total);
    const window = createDemucsWindow();
    const chunkInput = new Float32Array(2 * CHUNK);
    const chunks = demucsChunkCount(total);

    for (let index = 0; index < chunks; index += 1) {
        if (isAborted()) throw new DOMException("Aborted", "AbortError");
        const start = index * STRIDE;
        const length = Math.min(CHUNK, total - start);
        chunkInput.fill(0);
        chunkInput.set(left.subarray(start, start + length), 0);
        chunkInput.set(right.subarray(start, start + length), CHUNK);
        const output = await activeSession.run({ [INPUT_NAME]: new ort.Tensor("float32", chunkInput, [1, 2, CHUNK]) });
        // output.stems is [1, 4, 2, 343980]; flatten to stem * 2 + channel.
        const stems = output[OUTPUT_NAME].data as Float32Array;
        for (let channel = 0; channel < channels.length; channel += 1) {
            const source = channel * CHUNK;
            const target = channels[channel];
            for (let i = 0; i < length; i += 1) target[start + i] += stems[source + i] * window[i];
        }
        for (let i = 0; i < length; i += 1) weight[start + i] += window[i];
        onProgress((index + 1) / chunks);
    }

    for (const buffer of channels) {
        for (let i = 0; i < total; i += 1) {
            const accumulated = weight[i];
            buffer[i] = accumulated > 1e-8 ? buffer[i] / accumulated : 0;
        }
    }

    return MODEL_STEM_ORDER.map((name, stem) => ({
        name,
        left: resample(channels[stem * 2], SAMPLE_RATE, pcm.sampleRate),
        right: resample(channels[stem * 2 + 1], SAMPLE_RATE, pcm.sampleRate),
    }));
}
