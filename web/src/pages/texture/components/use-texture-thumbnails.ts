import { useEffect, useState } from "react";

import { TYPE_ORDER } from "@/lib/texture/registry";
import { TextureRenderer } from "@/lib/texture/renderer";
import { createDefaultLayer, createDefaultState, type Resolution } from "@/lib/texture/types";

const THUMB_RESOLUTION: Resolution = 64;

/** In-memory cache so reopening the browser does not re-render every type. */
const thumbnailCache = new Map<string, string>();

/**
 * Renders one 64px thumbnail per texture type, lazily and sequentially,
 * reusing a single offscreen canvas + TextureRenderer (one WebGL context).
 */
export function useTextureThumbnails(enabled: boolean): { thumbnails: Map<string, string>; ready: boolean } {
    const [thumbnails, setThumbnails] = useState<Map<string, string>>(() => new Map(thumbnailCache));
    const [ready, setReady] = useState(false);

    useEffect(() => {
        if (!enabled) return;
        let cancelled = false;

        const missing = TYPE_ORDER.filter((type) => !thumbnailCache.has(type));
        if (missing.length === 0) {
            setThumbnails(new Map(thumbnailCache));
            setReady(true);
            return;
        }

        const canvas = document.createElement("canvas");
        canvas.width = THUMB_RESOLUTION;
        canvas.height = THUMB_RESOLUTION;
        const renderer = new TextureRenderer(canvas);
        if (!renderer.ready) {
            renderer.dispose();
            setReady(true);
            return;
        }

        const run = async () => {
            for (const type of TYPE_ORDER) {
                if (cancelled) return;
                if (thumbnailCache.has(type)) continue;

                const layer = createDefaultLayer(1, type);
                renderer.render({ ...createDefaultState(), resolution: THUMB_RESOLUTION, layers: [layer] }, [layer]);
                thumbnailCache.set(type, canvas.toDataURL("image/png"));

                if (cancelled) return;
                setThumbnails(new Map(thumbnailCache));

                // Yield to the browser so the modal stays responsive between types.
                await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
            }
            if (!cancelled) setReady(true);
        };
        void run();

        return () => {
            cancelled = true;
            renderer.dispose();
        };
    }, [enabled]);

    return { thumbnails, ready };
}
