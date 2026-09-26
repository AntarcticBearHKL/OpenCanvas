// Frozen VST bridge protocol v1 — pure, dependency-free helpers.
//
// This module is intentionally free of DOM and browser APIs so it can be imported by:
//   - the browser worker / AudioWorklet (bundled by Vite),
//   - the main-thread client,
//   - the Node mock host and protocol test (Node >= 23 strips the types on import).
//
// Frame wire format (little-endian):
//   [u32 instanceHash][u32 seq][u32 channels][u32 framesPerChannel] + planar (channel-first) Float32 body
// 48000 Hz, 256 frames per block, 2 channels.

/** Every tunable number of the bridge lives here and only here. */
export const VST_BRIDGE_DEFAULT_URL = "http://127.0.0.1:3211";
export const VST_SAMPLE_RATE = 48000;
export const VST_FRAMES_PER_BLOCK = 256;
export const VST_CHANNELS = 2;
export const VST_FRAME_HEADER_BYTES = 16;
/** Response header of `POST /render` carrying the plug-in's reported latency in samples. */
export const VST_LATENCY_HEADER = "x-vst-latency-samples";
/** Pre-allocated block buffers owned by the streaming worker (8 x 256 x 2 floats). */
export const VST_BUFFER_POOL_SIZE = 8;
/** Jitter-buffer prefill before playback starts (~10.7 ms at 256/48000). */
export const VST_LOOKAHEAD_BLOCKS = 2;
/** Hard ceiling on buffered blocks; anything above is dropped by the worklet. */
export const VST_MAX_BUFFERED_BLOCKS = 4;
/** Input blocks the worklet captures before it ships one upload batch to the worker (effect role only).
 *  Must exceed VST_INPUT_BATCH_BLOCKS, or a full batch keeps every pooled buffer in flight and capture starves. */
export const VST_INPUT_POOL_SIZE = 8;
/** Input blocks a single `POST /audio-in` carries; the host re-blocks them to its own block size. */
export const VST_INPUT_BATCH_BLOCKS = 4;
export const VST_WORKLET_PROCESSOR = "canvas-vst-source";

/** Role of a loaded instance: `instrument` keeps the zero-input instrument path, `effect` opens the input bus. */
export type VstPluginRole = "instrument" | "effect";

/** RPC commands of the frozen v1 surface. */
export type VstCommand =
    | "hello"
    | "scan"
    | "load"
    | "unload"
    | "noteOn"
    | "noteOff"
    | "paramList"
    | "paramSet"
    | "editorOpen"
    | "editorClose"
    | "getState"
    | "setState"
    | "audioStart"
    | "audioStop";

/** One `POST /rpc` message: `{"id":<int>,"type":"<cmd>", ...params}`. */
export type VstRpcRequest = { id: number; type: VstCommand } & Record<string, unknown>;
export type VstRpcError = { code: string; message: string };
export type VstRpcSuccess = { id: number; ok: true } & Record<string, unknown>;
export type VstRpcFailure = { id: number; ok: false; error: VstRpcError };
export type VstRpcResponse = VstRpcSuccess | VstRpcFailure;

/** Typed error raised for transport failures, host-side errors and malformed responses. */
export class VstError extends Error {
    readonly code: string;
    readonly status: number;

    constructor(code: string, message: string, status = 0) {
        super(message);
        this.name = "VstError";
        this.code = code;
        this.status = status;
    }
}

/** Serialize an RPC request into the request body. */
export function encodeRpc(request: VstRpcRequest): string {
    return JSON.stringify(request);
}

/** Parse and validate an RPC response body; throws `VstError` when it is malformed. */
export function decodeRpc(raw: string): VstRpcResponse {
    let value: unknown;
    try {
        value = JSON.parse(raw);
    } catch {
        throw new VstError("bad-json", "VST host returned invalid JSON");
    }
    if (!value || typeof value !== "object") throw new VstError("bad-response", "VST host returned a non-object response");
    const record = value as Record<string, unknown>;
    if (typeof record.id !== "number" || typeof record.ok !== "boolean") throw new VstError("bad-response", "VST host response is missing id/ok");
    if (record.ok) return record as VstRpcSuccess;
    const error = record.error as Record<string, unknown> | undefined;
    if (!error || typeof error.code !== "string" || typeof error.message !== "string") throw new VstError("bad-response", "VST host error response is missing code/message");
    return { id: record.id, ok: false, error: { code: error.code, message: error.message } };
}

// ---------------------------------------------------------------------------
// Domain payloads
// ---------------------------------------------------------------------------

export type VstPlugin = {
    id: string;
    name: string;
    vendor: string;
    version: string;
    category: string;
    subCategories: string[];
    path: string;
    packaging: "bundle" | "single";
    isInstrument: boolean;
};

export type VstHelloResult = { protocol: number; host: string; version: string };
export type VstLoadParams = { pluginId: string; role?: VstPluginRole; sampleRate?: number; blockSize?: number; channels?: number };
export type VstNoteOnParams = { instanceId: string; pitch: number; velocity: number; channel?: number };
export type VstNoteOffParams = { instanceId: string; pitch: number; channel?: number };
export type VstParam = { id: string | number; name: string; value: number; min?: number; max?: number; unit?: string };
export type VstParamSetParams = { instanceId: string; paramId: string | number; value: number };
export type VstEditorResult = { opened: boolean };

/** One note of an offline render; times are seconds from the render start, matching the graph's note schedule. */
export type VstOfflineNote = { pitch: number; velocity: number; start: number; length: number };
export type VstRenderParams = { instanceId: string; seconds: number; notes: VstOfflineNote[]; sampleRate?: number; blockSize?: number; channels?: number };
/** Planar PCM returned by `renderOffline`, already aligned by the plug-in's reported latency. */
export type VstRenderedAudio = { channels: Float32Array[]; frames: number; latencySamples: number };

// ---------------------------------------------------------------------------
// Frame helpers
// ---------------------------------------------------------------------------

export type VstFrameHeader = { instanceHash: number; seq: number; channels: number; framesPerChannel: number };
export type VstFrame = VstFrameHeader & {
    /** Byte offset of the first Float32 sample (frame start + header). */
    dataOffset: number;
    /** Byte length of the planar PCM body. */
    dataBytes: number;
    /** Total frame byte length including the 16-byte header. */
    byteLength: number;
    /** Byte offset just past this frame. */
    nextOffset: number;
};

/** Total frame size for the given block shape. */
export function frameByteLength(channels: number, framesPerChannel: number): number {
    return VST_FRAME_HEADER_BYTES + channels * framesPerChannel * 4;
}

/**
 * Read the frame starting at `offset`.
 * Returns `null` when the buffer does not yet hold a complete frame, and throws `VstError`
 * when a complete 16-byte header is present but carries impossible dimensions.
 */
export function readFrame(view: DataView, offset: number): VstFrame | null {
    if (offset < 0 || offset + VST_FRAME_HEADER_BYTES > view.byteLength) return null;
    const instanceHash = view.getUint32(offset, true);
    const seq = view.getUint32(offset + 4, true);
    const channels = view.getUint32(offset + 8, true);
    const framesPerChannel = view.getUint32(offset + 12, true);
    if (channels < 1 || channels > 32 || framesPerChannel < 1 || framesPerChannel > 8192) {
        throw new VstError("bad-frame", `Malformed VST frame header (channels=${channels}, frames=${framesPerChannel})`);
    }
    const byteLength = frameByteLength(channels, framesPerChannel);
    if (offset + byteLength > view.byteLength) return null;
    const dataOffset = offset + VST_FRAME_HEADER_BYTES;
    return { instanceHash, seq, channels, framesPerChannel, dataOffset, dataBytes: channels * framesPerChannel * 4, byteLength, nextOffset: offset + byteLength };
}

/** Write just the 16-byte little-endian header; returns the data offset. */
export function writeFrameHeader(view: DataView, offset: number, header: VstFrameHeader): number {
    view.setUint32(offset, header.instanceHash >>> 0, true);
    view.setUint32(offset + 4, header.seq >>> 0, true);
    view.setUint32(offset + 8, header.channels >>> 0, true);
    view.setUint32(offset + 12, header.framesPerChannel >>> 0, true);
    return offset + VST_FRAME_HEADER_BYTES;
}

/** Write a full frame (header + planar body); returns the next write offset. Missing planes are written as silence. */
export function writeFrame(view: DataView, offset: number, header: VstFrameHeader, planes: readonly Float32Array[]): number {
    const cursor = writeFrameHeader(view, offset, header);
    const frames = header.framesPerChannel;
    for (let channel = 0; channel < header.channels; channel++) {
        const plane = planes[channel];
        for (let i = 0; i < frames; i++) {
            view.setFloat32(cursor + (channel * frames + i) * 4, plane ? plane[i] : 0, true);
        }
    }
    return cursor + header.channels * frames * 4;
}

/** Allocate the exact body of one `POST /audio-in` (or `/render`-style file) for one or more planar blocks. */
export function encodeFrames(frames: readonly { header: VstFrameHeader; planes: readonly Float32Array[] }[]): Uint8Array<ArrayBuffer> {
    let total = 0;
    for (const frame of frames) total += frameByteLength(frame.header.channels, frame.header.framesPerChannel);
    const bytes = new Uint8Array(total);
    const view = new DataView(bytes.buffer);
    let offset = 0;
    for (const frame of frames) offset = writeFrame(view, offset, frame.header, frame.planes);
    return bytes;
}

/** Stable u32 fingerprint of an instance id, mirrored by host, worker and tests. */
export function hashInstanceId(id: string): number {
    let hash = 2166136261;
    for (let i = 0; i < id.length; i++) {
        hash ^= id.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
}
