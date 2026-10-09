import { useEffect, useState, type CSSProperties } from "react";
import { message, Modal } from "antd";

import { BUILTIN_SAMPLES } from "@/lib/texture/presets";
import { TextureRenderer } from "@/lib/texture/renderer";
import type { EditorState, Resolution } from "@/lib/texture/types";

const THUMB_RESOLUTION: Resolution = 128;

/** Renders each sample once per session; reopening the modal reuses the cached data URLs. */
const thumbnailCache = new Map<string, string>();

const CHECKERBOARD: CSSProperties = {
    backgroundColor: "#ffffff",
    backgroundImage:
        "linear-gradient(45deg, #cccccc 25%, transparent 25%), linear-gradient(-45deg, #cccccc 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #cccccc 75%), linear-gradient(-45deg, transparent 75%, #cccccc 75%)",
    backgroundSize: "16px 16px",
    backgroundPosition: "0 0, 0 8px, 8px -8px, -8px 0px",
};

export function SamplesModal({ open, onClose, onApply }: { open: boolean; onClose: () => void; onApply: (state: EditorState) => void }) {
    const [thumbnails, setThumbnails] = useState<Map<string, string>>(() => new Map(thumbnailCache));

    useEffect(() => {
        if (!open) return;
        const missing = BUILTIN_SAMPLES.filter((sample) => !thumbnailCache.has(sample.id));
        if (missing.length === 0) {
            setThumbnails(new Map(thumbnailCache));
            return;
        }

        // One shared offscreen canvas + WebGL2 context renders every missing sample in turn.
        const canvas = document.createElement("canvas");
        canvas.width = THUMB_RESOLUTION;
        canvas.height = THUMB_RESOLUTION;
        const renderer = new TextureRenderer(canvas);
        if (!renderer.ready) {
            renderer.dispose();
            return;
        }

        let cancelled = false;
        const run = async () => {
            for (const sample of missing) {
                if (cancelled) return;
                renderer.render({ ...sample.state, resolution: THUMB_RESOLUTION }, sample.state.layers);
                thumbnailCache.set(sample.id, canvas.toDataURL("image/png"));
                setThumbnails(new Map(thumbnailCache));
                await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
            }
        };
        void run();

        return () => {
            cancelled = true;
            renderer.dispose();
        };
    }, [open]);

    return (
        <Modal title="Built-in Samples" width={880} footer={null} open={open} onCancel={onClose}>
            <div
                className="thin-scrollbar grid max-h-[62vh] gap-3 overflow-y-auto pr-1"
                style={{ gridTemplateColumns: "repeat(auto-fill, minmax(148px, 1fr))" }}
            >
                {BUILTIN_SAMPLES.map((sample) => (
                    <div key={sample.id} className="flex flex-col gap-2 rounded-lg border border-border p-2 transition hover:border-brand">
                        <span className="grid aspect-square w-full place-items-center overflow-hidden rounded" style={CHECKERBOARD}>
                            {thumbnails.has(sample.id) ? (
                                <img src={thumbnails.get(sample.id)} alt={sample.name} className="size-full object-contain" draggable={false} />
                            ) : (
                                <span className="text-[10px] text-muted-foreground">…</span>
                            )}
                        </span>
                        <div className="min-w-0">
                            <div className="truncate text-xs font-medium text-foreground">{sample.name}</div>
                            <div className="line-clamp-2 text-[11px] text-muted-foreground">{sample.description}</div>
                        </div>
                        <button
                            type="button"
                            onClick={() => {
                                onApply(sample.state);
                                message.success("Sample applied");
                                onClose();
                            }}
                            className="mt-auto h-7 rounded-md bg-brand-soft text-xs font-medium text-brand transition hover:bg-hover"
                        >
                            Apply
                        </button>
                    </div>
                ))}
            </div>
        </Modal>
    );
}
