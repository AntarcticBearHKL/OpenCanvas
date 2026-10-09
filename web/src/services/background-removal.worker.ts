import { removeBackground } from "@imgly/background-removal";

const post = (message: unknown) => (self as unknown as { postMessage: (message: unknown) => void }).postMessage(message);

self.onmessage = async (event: MessageEvent<{ id: number; source: string | Blob }>) => {
    const { id, source } = event.data;
    try {
        const blob = await removeBackground(source, {
            model: "isnet_quint8",
            progress: (key, current, total) => post({ id, kind: "progress", key, current, total }),
        });
        post({ id, kind: "done", blob });
    } catch (error) {
        post({ id, kind: "error", message: error instanceof Error ? error.message : String(error) });
    }
};
