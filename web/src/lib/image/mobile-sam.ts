import * as ort from "onnxruntime-web";

import { createCanvasContext } from "@/lib/canvas/canvas-2d";
import { binarizeMaskLogits, clampSamScore, MOBILE_SAM_INPUT_SIZE, pickBestMaskIndex, samModelPoint, samResizeScale, type SamPoint } from "./mobile-sam-math";

export { binarizeMaskLogits, clampSamScore, MOBILE_SAM_INPUT_SIZE, pickBestMaskIndex, samModelPoint, samResizeScale };
export type { SamPoint };

const MOBILE_SAM_ENCODER_URL = "https://huggingface.co/PulpCut/mobilesam-onnx/resolve/main/mobilesam.encoder.onnx";
const MOBILE_SAM_DECODER_URL = "https://huggingface.co/PulpCut/mobilesam-onnx/resolve/main/mobilesam.decoder.onnx";
const MOBILE_SAM_CACHE_NAME = "mobilesam-onnx-v1";

const PAD_COLOR = [124, 116, 104];

ort.env.wasm.numThreads = 1;
ort.env.wasm.wasmPaths = `https://cdn.jsdelivr.net/npm/onnxruntime-web@${ort.env.versions.web}/dist/`;

let encoder: ort.InferenceSession | null = null;
let decoder: ort.InferenceSession | null = null;
let loading: Promise<void> | null = null;
let embedding: { key: string; tensor: ort.Tensor; scale: number } | null = null;

function loadImage(dataUrl: string) {
    return new Promise<HTMLImageElement>((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error("Image failed to load"));
        image.src = dataUrl;
    });
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

async function fetchModel(url: string, onProgress: (fraction: number) => void) {
    const cache = await caches.open(MOBILE_SAM_CACHE_NAME);
    const cached = await cache.match(url);
    if (cached) {
        onProgress(1);
        return cached.arrayBuffer();
    }
    const response = await fetch(url);
    if (!response.ok) throw new Error(`MobileSAM download failed (${response.status})`);
    const buffer = await readWithProgress(response, Number(response.headers.get("content-length")) || 0, onProgress);
    await cache.put(url, new Response(buffer));
    return buffer;
}

export async function loadMobileSam(onProgress?: (percent: number) => void) {
    if (encoder && decoder) return;
    if (loading) return loading;
    loading = (async () => {
        let index = 0;
        const track = (fraction: number) => onProgress?.(Math.min(99, Math.round(((index + fraction) / 2) * 100)));
        const encoderBuffer = await fetchModel(MOBILE_SAM_ENCODER_URL, track);
        index = 1;
        const decoderBuffer = await fetchModel(MOBILE_SAM_DECODER_URL, track);
        encoder = await ort.InferenceSession.create(encoderBuffer, { executionProviders: ["wasm"] });
        decoder = await ort.InferenceSession.create(decoderBuffer, { executionProviders: ["wasm"] });
        onProgress?.(100);
    })().finally(() => {
        loading = null;
    });
    return loading;
}

export function isMobileSamLoaded() {
    return Boolean(encoder && decoder);
}

export function resetMobileSam() {
    void encoder?.release();
    void decoder?.release();
    encoder = null;
    decoder = null;
    loading = null;
    embedding = null;
    if (typeof caches !== "undefined") void caches.delete(MOBILE_SAM_CACHE_NAME);
}

function preprocess(image: HTMLImageElement) {
    const width = Math.max(1, Math.round(image.naturalWidth || image.width));
    const height = Math.max(1, Math.round(image.naturalHeight || image.height));
    const scale = samResizeScale(width, height);
    const resizedWidth = Math.max(1, Math.round(width * scale));
    const resizedHeight = Math.max(1, Math.round(height * scale));
    const { context } = createCanvasContext(MOBILE_SAM_INPUT_SIZE, MOBILE_SAM_INPUT_SIZE);
    if (!context) throw new Error("Canvas 2D context is unavailable");
    context.fillStyle = `rgb(${PAD_COLOR[0]}, ${PAD_COLOR[1]}, ${PAD_COLOR[2]})`;
    context.fillRect(0, 0, MOBILE_SAM_INPUT_SIZE, MOBILE_SAM_INPUT_SIZE);
    context.drawImage(image, 0, 0, resizedWidth, resizedHeight);
    const pixels = context.getImageData(0, 0, MOBILE_SAM_INPUT_SIZE, MOBILE_SAM_INPUT_SIZE).data;
    const total = MOBILE_SAM_INPUT_SIZE * MOBILE_SAM_INPUT_SIZE;
    const values = new Float32Array(total * 3);
    for (let index = 0; index < total; index += 1) {
        values[index * 3] = pixels[index * 4];
        values[index * 3 + 1] = pixels[index * 4 + 1];
        values[index * 3 + 2] = pixels[index * 4 + 2];
    }
    return { width, height, scale, tensor: new ort.Tensor("float32", values, [MOBILE_SAM_INPUT_SIZE, MOBILE_SAM_INPUT_SIZE, 3]) };
}

function buildMaskDataUrl(image: HTMLImageElement, binary: Uint8Array, maskWidth: number, maskHeight: number, width: number, height: number, scale: number) {
    const mask = createCanvasContext(maskWidth, maskHeight);
    const output = createCanvasContext(width, height);
    if (!mask.context || !output.context) throw new Error("Canvas 2D context is unavailable");
    const pixels = mask.context.createImageData(maskWidth, maskHeight);
    for (let index = 0; index < binary.length; index += 1) {
        if (binary[index]) pixels.data[index * 4 + 3] = 255;
    }
    mask.context.putImageData(pixels, 0, 0);
    const modelSpace = maskWidth === MOBILE_SAM_INPUT_SIZE && maskHeight === MOBILE_SAM_INPUT_SIZE;
    const sourceWidth = modelSpace ? Math.max(1, Math.round(width * scale)) : maskWidth;
    const sourceHeight = modelSpace ? Math.max(1, Math.round(height * scale)) : maskHeight;
    output.context.drawImage(image, 0, 0, width, height);
    output.context.globalCompositeOperation = "destination-in";
    output.context.drawImage(mask.canvas, 0, 0, sourceWidth, sourceHeight, 0, 0, width, height);
    return output.canvas.toDataURL("image/png");
}

export async function segmentImageWithPoints(dataUrl: string, points: SamPoint[]) {
    const activeEncoder = encoder;
    const activeDecoder = decoder;
    if (!activeEncoder || !activeDecoder) throw new Error("MobileSAM is not loaded");
    if (!dataUrl) throw new Error("Image data is empty");
    if (!points.length) throw new Error("At least one point is required");
    const image = await loadImage(dataUrl);
    const { width, height, scale, tensor } = preprocess(image);
    let active = embedding && embedding.key === dataUrl ? embedding : null;
    if (!active) {
        const encoded = await activeEncoder.run({ input_image: tensor });
        active = { key: dataUrl, tensor: encoded.image_embeddings, scale };
        embedding = active;
    }
    const coordinates = new Float32Array(points.length * 2);
    const labels = new Float32Array(points.length);
    points.forEach((point, index) => {
        const [x, y] = samModelPoint(point.x, point.y, scale);
        coordinates[index * 2] = x;
        coordinates[index * 2 + 1] = y;
        labels[index] = point.positive === false ? 0 : 1;
    });
    const decoded = await activeDecoder.run({
        image_embeddings: active.tensor,
        point_coords: new ort.Tensor("float32", coordinates, [1, points.length, 2]),
        point_labels: new ort.Tensor("float32", labels, [1, points.length]),
        mask_input: new ort.Tensor("float32", new Float32Array(256 * 256), [1, 1, 256, 256]),
        has_mask_input: new ort.Tensor("float32", Float32Array.from([0]), [1]),
        orig_im_size: new ort.Tensor("float32", Float32Array.from([MOBILE_SAM_INPUT_SIZE, MOBILE_SAM_INPUT_SIZE]), [2]),
    });
    const scores = Array.from(decoded.iou_predictions.data as Float32Array);
    const index = pickBestMaskIndex(scores);
    const maskHeight = decoded.masks.dims[2];
    const maskWidth = decoded.masks.dims[3];
    const plane = maskWidth * maskHeight;
    const logits = (decoded.masks.data as Float32Array).subarray(index * plane, (index + 1) * plane);
    return { maskDataUrl: buildMaskDataUrl(image, binarizeMaskLogits(logits), maskWidth, maskHeight, width, height, scale), score: clampSamScore(scores[index] ?? 0), width, height };
}
