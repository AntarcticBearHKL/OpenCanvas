// `canvas-vst-source` AudioWorkletProcessor.
//
// A jitter buffer that turns transferred planar Float32 blocks into the worklet's output. It prefills
// VST_LOOKAHEAD_BLOCKS blocks before it starts (silence until then), never buffers more than
// VST_MAX_BUFFERED_BLOCKS, and on an empty queue outputs silence and counts the underrun.
//
// Loading (studio, next milestone): `audioWorklet.addModule(VST_WORKLET_URL)`.
// Ports: the node's own port carries `attach`/`config`/`reset` and stats; the attached MessagePort
// carries `block` messages from the worker and returns consumed buffers with `recycle` (transfer).
//
// No allocation happens in `process()`: the received-block ring and the recycle list are
// pre-allocated, and stats are posted periodically rather than every render quantum.

import {
    VST_BUFFER_POOL_SIZE,
    VST_CHANNELS,
    VST_FRAMES_PER_BLOCK,
    VST_INPUT_POOL_SIZE,
    VST_LOOKAHEAD_BLOCKS,
    VST_MAX_BUFFERED_BLOCKS,
    VST_WORKLET_PROCESSOR,
} from "./audio-vst-protocol";

declare const sampleRate: number;
declare function registerProcessor(name: string, processor: new (options: unknown) => AudioWorkletProcessor): void;
declare class AudioWorkletProcessor {
    readonly port: MessagePort;
    constructor(options?: unknown);
}

const CAPACITY = VST_BUFFER_POOL_SIZE;
const STATS_EVERY = 250;

type Block = { channels: number; framesPerChannel: number; seq: number; buffer: Float32Array };
type BlockMessage = { type: "block"; channels: number; framesPerChannel: number; seq: number; buffer: Float32Array };
type InputRecycleMessage = { type: "input-recycle"; buffers: Float32Array[] };
type BufferInbound = BlockMessage | InputRecycleMessage | { type: "reset" };
type ControlInbound =
    | { type: "attach"; port: MessagePort }
    | { type: "config"; channels?: number; framesPerBlock?: number; lookaheadBlocks?: number; maxBufferedBlocks?: number; effect?: boolean }
    | { type: "reset" };

class VstSourceProcessor extends AudioWorkletProcessor {
    private bufferPort: MessagePort | null = null;
    private readonly queue: (Block | null)[] = new Array(CAPACITY).fill(null);
    private head = 0;
    private count = 0;
    private cursor = 0;
    private started = false;
    private channels = VST_CHANNELS;
    private framesPerBlock = VST_FRAMES_PER_BLOCK;
    private lookahead = VST_LOOKAHEAD_BLOCKS;
    private maxBuffered = VST_MAX_BUFFERED_BLOCKS;
    private readonly recycle: (Float32Array | null)[] = new Array(CAPACITY).fill(null);
    private recycleCount = 0;
    private underruns = 0;
    private dropped = 0;
    private processed = 0;
    private captureInput = false;
    private inputPool: Float32Array[] = [];
    private captureBuffer: Float32Array | null = null;
    private captureFrames = 0;
    private inputCaptured = 0;
    private inputDropped = 0;

    constructor() {
        super();
        this.port.onmessage = (event: MessageEvent<ControlInbound>) => this.onControl(event.data);
    }

    private onControl(message: ControlInbound) {
        if (message.type === "attach") {
            this.bufferPort = message.port;
            this.bufferPort.onmessage = (event: MessageEvent<BufferInbound>) => this.onBuffer(event.data);
            return;
        }
        if (message.type === "config") {
            if (message.channels && message.channels > 0) this.channels = message.channels;
            if (message.framesPerBlock && message.framesPerBlock > 0) this.framesPerBlock = message.framesPerBlock;
            if (message.lookaheadBlocks && message.lookaheadBlocks > 0) this.lookahead = Math.min(CAPACITY, message.lookaheadBlocks);
            if (message.maxBufferedBlocks && message.maxBufferedBlocks > 0) this.maxBuffered = Math.min(CAPACITY, message.maxBufferedBlocks);
            if (typeof message.effect === "boolean") this.configureInput(message.effect);
            return;
        }
        if (message.type === "reset") this.resetQueue();
    }

    /** Input capture is only armed for effect instances; the pool is allocated here, never in `process()`. */
    private configureInput(effect: boolean) {
        this.captureInput = effect;
        this.captureBuffer = null;
        this.captureFrames = 0;
        this.inputPool = [];
        if (!effect) return;
        for (let i = 0; i < VST_INPUT_POOL_SIZE; i++) this.inputPool.push(new Float32Array(this.framesPerBlock * this.channels));
    }

    private onBuffer(message: BufferInbound) {
        if (message.type === "reset") {
            this.resetQueue();
            return;
        }
        if (message.type === "input-recycle") {
            for (const buffer of message.buffers ?? []) {
                if (buffer instanceof Float32Array && this.inputPool.length < VST_INPUT_POOL_SIZE) this.inputPool.push(buffer);
            }
            return;
        }
        if (this.count >= this.maxBuffered) {
            // Hard ceiling reached: drop the incoming block and hand its buffer straight back.
            this.queueRecycle(message.buffer);
            this.dropped++;
            this.flushRecycle();
            return;
        }
        this.queue[(this.head + this.count) % CAPACITY] = { channels: message.channels, framesPerChannel: message.framesPerChannel, seq: message.seq, buffer: message.buffer };
        this.count++;
        this.flushRecycle();
    }

    private queueRecycle(buffer: Float32Array) {
        if (this.recycleCount < CAPACITY) this.recycle[this.recycleCount++] = buffer;
    }

    private resetQueue() {
        for (let i = 0; i < this.count; i++) {
            const block = this.queue[(this.head + i) % CAPACITY];
            if (block) this.queueRecycle(block.buffer);
        }
        this.queue.fill(null);
        this.head = 0;
        this.count = 0;
        this.cursor = 0;
        this.started = false;
        if (this.captureBuffer) {
            this.queueRecycle(this.captureBuffer);
            this.captureBuffer = null;
            this.captureFrames = 0;
        }
        this.flushRecycle();
    }

    private flushRecycle() {
        if (!this.bufferPort || this.recycleCount === 0) return;
        const buffers: Float32Array[] = [];
        for (let i = 0; i < this.recycleCount; i++) {
            const buffer = this.recycle[i];
            if (buffer) buffers.push(buffer);
            this.recycle[i] = null;
        }
        this.recycleCount = 0;
        this.bufferPort.postMessage({ type: "recycle", buffers }, buffers.map((buffer) => buffer.buffer));
    }

    process(inputs: Float32Array[][], outputs: Float32Array[][], _parameters: Record<string, Float32Array>): boolean {
        const output = outputs[0];
        if (!output || output.length === 0) return true;
        const left = output[0];
        const right = output.length > 1 ? output[1] : output[0];
        const frames = left.length;

        for (let i = 0; i < frames; i++) {
            if (!this.started) {
                if (this.count >= this.lookahead) {
                    this.started = true;
                } else {
                    left[i] = 0;
                    if (right !== left) right[i] = 0;
                    continue;
                }
            }
            if (this.count === 0) {
                this.underruns++;
                this.started = false;
                left[i] = 0;
                if (right !== left) right[i] = 0;
                continue;
            }
            const block = this.queue[this.head];
            if (!block) {
                this.queue[this.head] = null;
                this.head = (this.head + 1) % CAPACITY;
                this.count--;
                this.cursor = 0;
                i--;
                continue;
            }
            if (this.cursor >= block.framesPerChannel) {
                this.queueRecycle(block.buffer);
                this.queue[this.head] = null;
                this.head = (this.head + 1) % CAPACITY;
                this.count--;
                this.cursor = 0;
                i--;
                continue;
            }
            const index = this.cursor;
            const base = block.framesPerChannel;
            const l = block.buffer[index];
            const r = block.channels > 1 ? block.buffer[base + index] : l;
            left[i] = l;
            if (right !== left) right[i] = r;
            this.cursor++;
        }

        if (this.captureInput) this.capture(inputs[0], frames);

        this.processed++;
        if (this.processed >= STATS_EVERY) {
            this.processed = 0;
            this.port.postMessage({
                type: "stats",
                sampleRate,
                underruns: this.underruns,
                dropped: this.dropped,
                queuedBlocks: this.count,
                framesPerBlock: this.framesPerBlock,
                channels: this.channels,
                inputCaptured: this.inputCaptured,
                inputDropped: this.inputDropped,
            });
        }
        return true;
    }

    /** Copy the live input block into a pooled input buffer and ship each full block to the worker. */
    private capture(input: Float32Array[] | undefined, frames: number) {
        if (!this.bufferPort || !input || input.length === 0) return;
        if (!this.captureBuffer) {
            const buffer = this.inputPool.pop();
            if (!buffer) {
                this.inputDropped++;
                return;
            }
            this.captureBuffer = buffer;
            this.captureFrames = 0;
        }
        const buffer = this.captureBuffer;
        const stride = this.framesPerBlock;
        const take = Math.min(frames, stride - this.captureFrames);
        for (let channel = 0; channel < this.channels; channel++) {
            const source = input[Math.min(channel, input.length - 1)];
            const target = channel * stride + this.captureFrames;
            for (let i = 0; i < take; i++) buffer[target + i] = source ? source[i] : 0;
        }
        this.captureFrames += take;
        if (this.captureFrames >= stride) {
            this.captureBuffer = null;
            this.captureFrames = 0;
            this.inputCaptured++;
            this.bufferPort.postMessage({ type: "input", channels: this.channels, framesPerChannel: stride, buffer }, [buffer.buffer]);
        }
    }
}

registerProcessor(VST_WORKLET_PROCESSOR, VstSourceProcessor);
