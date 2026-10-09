// Streaming worker for the VST bridge: owns the `GET /audio` chunked stream and the `POST /rpc`
// calls it needs, decodes frames with `audio-vst-protocol.ts`, and pushes pooled Float32Array
// blocks to the AudioWorklet over a MessagePort with transfer (zero-copy). No PCM work on the main
// thread and nothing is copied between worker and worklet.
//
// Wiring (done by the studio in the next milestone):
//   const worker = createVstStreamWorker();
//   const node = new AudioWorkletNode(ctx, VST_WORKLET_PROCESSOR);
//   const channel = new MessageChannel();
//   node.port.postMessage({ type: "attach", port: channel.port1 }, [channel.port1]);
//   worker.postMessage({ type: "attach", port: channel.port2 }, [channel.port2]);
//   worker.postMessage({ type: "config", baseUrl, token, instanceId });
//   worker.postMessage({ type: "start" });

import {
    VST_BUFFER_POOL_SIZE,
    VST_CHANNELS,
    VST_FRAMES_PER_BLOCK,
    VST_INPUT_BATCH_BLOCKS,
    decodeRpc,
    encodeFrames,
    encodeRpc,
    hashInstanceId,
    readFrame,
    VstError,
    type VstCommand,
    type VstFrame,
    type VstPluginRole,
    type VstRpcError,
    type VstRpcRequest,
    type VstRpcResponse,
    type VstRpcSuccess,
} from "./audio-vst-protocol";

export type VstWorkerConfig = {
    baseUrl: string;
    token: string;
    instanceId: string;
    role?: VstPluginRole;
    sampleRate?: number;
    framesPerBlock?: number;
    channels?: number;
};

export type VstWorkerInbound =
    | ({ type: "config" } & VstWorkerConfig)
    | { type: "attach"; port: MessagePort }
    | { type: "start" }
    | { type: "stop" }
    | { type: "rpc"; id: number; request: VstRpcRequest };

export type VstWorkerOutbound =
    | { type: "started"; instanceId: string }
    | { type: "stopped"; instanceId: string }
    | { type: "ended"; instanceId: string }
    | {
          type: "stats";
          framesReceived: number;
          framesDropped: number;
          bytesReceived: number;
          streamErrors: number;
          poolFree: number;
          framesUploaded: number;
          uploadErrors: number;
      }
    | { type: "error"; code: string; message: string }
    | { type: "rpc"; id: number; response: VstRpcResponse };

const post = (message: VstWorkerOutbound) => (self as unknown as { postMessage: (message: VstWorkerOutbound) => void }).postMessage(message);

type InputBlock = { channels: number; framesPerChannel: number; buffer: Float32Array };
type WorkletPortMessage = { type: "recycle"; buffers?: Float32Array[] } | { type: "input"; channels: number; framesPerChannel: number; buffer: Float32Array };

let baseUrl = "";
let token = "";
let instanceId = "";
let role: VstPluginRole = "instrument";
let channels = VST_CHANNELS;
let framesPerBlock = VST_FRAMES_PER_BLOCK;
let pool: Float32Array[] = [];
let pending: Uint8Array | null = null;
let workletPort: MessagePort | null = null;
let streaming = false;
let abort: AbortController | null = null;
let statsTimer: ReturnType<typeof setInterval> | null = null;
let nextRpcId = 1;
let inputQueue: InputBlock[] = [];
let uploading = false;
let nextInputSeq = 0;
let inputHash = 0;
const stats = { framesReceived: 0, framesDropped: 0, bytesReceived: 0, streamErrors: 0, framesUploaded: 0, uploadErrors: 0 };

function toRpcError(error: unknown): VstRpcError {
    return { code: error instanceof VstError ? error.code : "worker-error", message: error instanceof Error ? error.message : String(error) };
}

function configure(config: VstWorkerConfig) {
    baseUrl = (config.baseUrl || "").trim().replace(/\/+$/, "");
    token = (config.token || "").trim();
    instanceId = config.instanceId;
    role = config.role === "effect" ? "effect" : "instrument";
    channels = config.channels && config.channels > 0 ? config.channels : VST_CHANNELS;
    framesPerBlock = config.framesPerBlock && config.framesPerBlock > 0 ? config.framesPerBlock : VST_FRAMES_PER_BLOCK;
    inputHash = hashInstanceId(instanceId);
    nextInputSeq = 0;
    inputQueue = [];
    pool = [];
    for (let i = 0; i < VST_BUFFER_POOL_SIZE; i++) pool.push(new Float32Array(framesPerBlock * channels));
    pending = null;
    stats.framesReceived = 0;
    stats.framesDropped = 0;
    stats.bytesReceived = 0;
    stats.streamErrors = 0;
    stats.framesUploaded = 0;
    stats.uploadErrors = 0;
}

function audioUrl(): string {
    const params = new URLSearchParams({ instance: instanceId });
    if (token) params.set("token", token);
    return `${baseUrl}/audio?${params.toString()}`;
}

function audioInUrl(): string {
    const params = new URLSearchParams({ instance: instanceId });
    if (token) params.set("token", token);
    return `${baseUrl}/audio-in?${params.toString()}`;
}

async function postRpc(command: VstCommand, params: Record<string, unknown>, signal?: AbortSignal): Promise<VstRpcSuccess> {
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (token) headers.authorization = `Bearer ${token}`;
    const response = await fetch(`${baseUrl}/rpc`, { method: "POST", headers, body: encodeRpc({ id: nextRpcId++, type: command, ...params }), signal });
    const decoded = decodeRpc(await response.text());
    if (!decoded.ok) throw new VstError(decoded.error.code, decoded.error.message, response.status);
    return decoded;
}

/** Decode one complete frame into a pooled buffer and hand it to the worklet with transfer. */
function forwardFrame(view: DataView, frame: VstFrame) {
    if (!workletPort || frame.channels !== channels || frame.framesPerChannel !== framesPerBlock) {
        stats.framesDropped++;
        return;
    }
    const buffer = pool.pop();
    if (!buffer) {
        // No free transferable: the worklet is behind, so drop this block rather than block the stream.
        stats.framesDropped++;
        return;
    }
    const frames = frame.framesPerChannel;
    for (let channel = 0; channel < frame.channels; channel++) {
        const source = frame.dataOffset + channel * frames * 4;
        const target = channel * frames;
        for (let i = 0; i < frames; i++) buffer[target + i] = view.getFloat32(source + i * 4, true);
    }
    workletPort.postMessage({ type: "block", channels: frame.channels, framesPerChannel: frames, seq: frame.seq, buffer }, [buffer.buffer]);
}

function consume(chunk: Uint8Array) {
    stats.bytesReceived += chunk.byteLength;
    let merged = chunk;
    if (pending && pending.byteLength) {
        merged = new Uint8Array(pending.byteLength + chunk.byteLength);
        merged.set(pending);
        merged.set(chunk, pending.byteLength);
    }
    const view = new DataView(merged.buffer, merged.byteOffset, merged.byteLength);
    let cursor = 0;
    for (;;) {
        const frame = readFrame(view, cursor);
        if (!frame) break;
        stats.framesReceived++;
        forwardFrame(view, frame);
        cursor = frame.nextOffset;
    }
    pending = cursor < merged.byteLength ? merged.slice(cursor) : null;
}

/** Hand captured input buffers back to the worklet so its pool stays stable. */
function recycleInput(buffers: Float32Array[]) {
    if (!workletPort || !buffers.length) return;
    workletPort.postMessage({ type: "input-recycle", buffers }, buffers.map((buffer) => buffer.buffer));
}

/**
 * Queue one captured input block. Effect instances only: an instrument never uploads, and its block is
 * returned straight away. At most `8 * VST_INPUT_BATCH_BLOCKS` blocks wait for a flight; the oldest is
 * dropped (and recycled) beyond that, mirroring the worklet's output-side ceiling.
 */
function enqueueInput(block: InputBlock) {
    if (role !== "effect") {
        recycleInput([block.buffer]);
        return;
    }
    inputQueue.push(block);
    if (inputQueue.length > VST_INPUT_BATCH_BLOCKS * 8) {
        const dropped = inputQueue.shift();
        if (dropped) {
            stats.framesDropped++;
            recycleInput([dropped.buffer]);
        }
    }
    void flushInput();
}

/** Upload full batches sequentially, so a slow host bounds the in-flight memory instead of piling up fetches. */
async function flushInput() {
    if (uploading || role !== "effect" || !instanceId || !baseUrl) return;
    uploading = true;
    try {
        while (streaming && inputQueue.length >= VST_INPUT_BATCH_BLOCKS) {
            const blocks = inputQueue.splice(0, VST_INPUT_BATCH_BLOCKS);
            const body = encodeFrames(
                blocks.map((block) => ({
                    header: { instanceHash: inputHash, seq: nextInputSeq++, channels: block.channels, framesPerChannel: block.framesPerChannel },
                    planes: Array.from({ length: block.channels }, (_, channel) => block.buffer.subarray(channel * block.framesPerChannel, (channel + 1) * block.framesPerChannel)),
                })),
            );
            recycleInput(blocks.map((block) => block.buffer));
            let response: Response;
            try {
                response = await fetch(audioInUrl(), { method: "POST", headers: { "content-type": "application/octet-stream" }, body, signal: abort ? abort.signal : undefined });
            } catch (error) {
                if (!(error instanceof DOMException && error.name === "AbortError")) stats.uploadErrors++;
                break;
            }
            if (response.ok) stats.framesUploaded += blocks.length;
            else stats.uploadErrors++;
        }
    } finally {
        uploading = false;
    }
}

async function startStreaming() {
    if (streaming || !instanceId || !baseUrl) return;
    abort = new AbortController();
    streaming = true;
    statsTimer = setInterval(() => {
        post({ type: "stats", ...stats, poolFree: pool.length });
    }, 500);
    post({ type: "started", instanceId });
    try {
        await postRpc("audioStart", { instanceId }, abort.signal);
        const response = await fetch(audioUrl(), { signal: abort.signal });
        if (!response.ok || !response.body) throw new VstError(`http-${response.status}`, `VST audio stream failed (${response.status})`, response.status);
        const reader = response.body.getReader();
        for (;;) {
            const { value, done } = await reader.read();
            if (done) break;
            if (!streaming) break;
            if (value) consume(value);
        }
        if (streaming) post({ type: "ended", instanceId });
    } catch (error) {
        if (streaming && !(error instanceof DOMException && error.name === "AbortError")) {
            stats.streamErrors++;
            post({ type: "error", ...toRpcError(error) });
        }
    } finally {
        if (streaming) stopStreaming(false);
    }
}

/** Abort the stream; `rpc` also tells the host to stop when the worker initiated the stop. */
function stopStreaming(notifyHost = true) {
    streaming = false;
    if (statsTimer) {
        clearInterval(statsTimer);
        statsTimer = null;
    }
    if (abort) {
        abort.abort();
        abort = null;
    }
    workletPort?.postMessage({ type: "reset" });
    pending = null;
    const queued = inputQueue;
    inputQueue = [];
    recycleInput(queued.map((block) => block.buffer));
    post({ type: "stopped", instanceId });
    if (notifyHost && instanceId) void postRpc("audioStop", { instanceId }).catch(() => undefined);
}

self.onmessage = (event: MessageEvent<VstWorkerInbound>) => {
    const message = event.data;
    switch (message.type) {
        case "config":
            configure(message);
            break;
        case "attach":
            workletPort = message.port;
            workletPort.onmessage = (workletEvent: MessageEvent<WorkletPortMessage>) => {
                const data = workletEvent.data;
                if (data?.type === "recycle" && data.buffers) {
                    for (const buffer of data.buffers) {
                        if (buffer instanceof Float32Array && pool.length < VST_BUFFER_POOL_SIZE) pool.push(buffer);
                    }
                } else if (data?.type === "input" && data.buffer instanceof Float32Array) {
                    enqueueInput({ channels: data.channels, framesPerChannel: data.framesPerChannel, buffer: data.buffer });
                }
            };
            break;
        case "start":
            void startStreaming();
            break;
        case "stop":
            stopStreaming();
            break;
        case "rpc": {
            const { id, request } = message;
            const { id: _requestId, type, ...params } = request;
            postRpc(type, params)
                .then((response) => post({ type: "rpc", id, response }))
                .catch((error) => post({ type: "rpc", id, response: { id, ok: false, error: toRpcError(error) } }));
            break;
        }
    }
};
