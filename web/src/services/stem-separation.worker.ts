import { loadDemucsSession, separateStemsCore } from "@/lib/audio/demucs";

type SeparateRequest = { id: number; left: ArrayBuffer; right: ArrayBuffer; sampleRate: number };
type AbortRequest = { kind: "abort"; id: number };

const post = (message: unknown, transfer?: Transferable[]) =>
    (self as unknown as { postMessage: (message: unknown, transfer?: Transferable[]) => void }).postMessage(message, transfer);

let aborted = false;

// The model session is stateful and heavy, so run one request at a time.
let queue: Promise<unknown> = Promise.resolve();

self.onmessage = (event: MessageEvent<SeparateRequest | AbortRequest>) => {
    const data = event.data;
    if ("kind" in data) {
        aborted = true;
        return;
    }
    const { id, left, right, sampleRate } = data;
    queue = queue.then(async () => {
        if (aborted) return;
        try {
            // Download + session init take the first 20%, separation the rest.
            const session = await loadDemucsSession((fraction) => post({ id, kind: "progress", value: Math.round(fraction * 20) }));
            if (aborted) return;
            const stems = await separateStemsCore(
                session,
                { left: new Float32Array(left), right: new Float32Array(right), sampleRate },
                (fraction) => post({ id, kind: "progress", value: 20 + Math.round(fraction * 80) }),
                () => aborted,
            );
            post(
                { id, kind: "done", stems: stems.map((stem) => ({ name: stem.name, left: stem.left.buffer, right: stem.right.buffer })) },
                stems.flatMap((stem) => [stem.left.buffer, stem.right.buffer]) as Transferable[],
            );
        } catch (error) {
            if ((error as { name?: string }).name === "AbortError") return;
            post({ id, kind: "error", message: error instanceof Error ? error.message : "分轨失败" });
        }
    });
};
