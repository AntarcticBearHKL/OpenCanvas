import { useEffect, useMemo, useState, type CSSProperties } from "react";

import { clampLayerOpacity, resolveBlendMode } from "@/lib/canvas/blend-modes";
import { psCompositeSignature, psDocumentNeedsRaster, psGroupChildren, psLayerBox, psShapePathData, psTextRenderStyle, psTopLayers, renderPsDocument, smartCanvasLayers, type SmartCanvasBoard } from "@/lib/canvas/smart-canvas";
import { resolveImageUrl } from "@/services/image-storage";
import type { CanvasPsLayer } from "@/types/canvas";

export function layerBlendStyle(layer: Pick<CanvasPsLayer, "blendMode" | "opacity">): CSSProperties {
    return { mixBlendMode: resolveBlendMode(layer.blendMode).css as CSSProperties["mixBlendMode"], opacity: clampLayerOpacity(layer.opacity) };
}

export function psLayerFrame(layer: CanvasPsLayer, offset: { x: number; y: number } = { x: 0, y: 0 }): CSSProperties {
    return { left: layer.x - offset.x, top: layer.y - offset.y, width: layer.width, height: layer.height, transform: layer.rotation ? `rotate(${layer.rotation}deg)` : undefined };
}

export function BoardLayersView({ board }: { board: SmartCanvasBoard }) {
    const layers = smartCanvasLayers(board);
    const needsRaster = useMemo(() => psDocumentNeedsRaster(board), [board]);
    const { urls, masks } = useResolvedPsLayerUrls(layers);
    if (needsRaster) return <PsRasterBoard board={board} />;

    const renderLayer = (layer: CanvasPsLayer, offset: { x: number; y: number }) => {
        const frame = { ...psLayerFrame(layer, offset), ...layerBlendStyle(layer) };
        const maskUrl = masks[layer.id];
        const maskStyle: CSSProperties | undefined = maskUrl ? { maskImage: `url(${maskUrl})`, WebkitMaskImage: `url(${maskUrl})`, maskSize: "100% 100%", WebkitMaskSize: "100% 100%" } : undefined;
        if (layer.kind === "text") {
            const textStyle = psTextRenderStyle(layer);
            return (
                <div key={layer.id} className="pointer-events-none absolute whitespace-pre" style={{ ...frame, ...maskStyle, fontSize: textStyle.fontSize, lineHeight: textStyle.lineHeight, fontFamily: textStyle.fontFamily, color: textStyle.color }}>
                    {layer.text}
                </div>
            );
        }
        if (layer.kind === "shape") {
            const width = Math.max(1, layer.width);
            const height = Math.max(1, layer.height);
            const strokeWidth = Math.max(0, layer.shapeStrokeWidth || 0);
            const line = layer.shape === "line";
            return (
                <svg key={layer.id} className="pointer-events-none absolute" style={{ ...frame, ...maskStyle, overflow: "visible" }} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
                    <path
                        d={psShapePathData(layer, width, height)}
                        fill={line ? "none" : layer.shapeFill || "#000000"}
                        stroke={line ? layer.shapeStroke || layer.shapeFill || "#000000" : layer.shapeStroke && strokeWidth > 0 ? layer.shapeStroke : "none"}
                        strokeWidth={line ? Math.max(1, strokeWidth || 1) : strokeWidth}
                    />
                </svg>
            );
        }
        const url = urls[layer.id];
        if (!url) return null;
        return <img key={layer.id} src={url} alt="" draggable={false} className="pointer-events-none absolute select-none object-fill" style={{ ...frame, ...maskStyle }} />;
    };

    return (
        <>
            {psTopLayers(layers).map((layer) => {
                if (layer.hidden) return null;
                if (layer.kind !== "group") return renderLayer(layer, { x: 0, y: 0 });
                const box = psLayerBox(layers, layer);
                const maskUrl = masks[layer.id];
                return (
                    <div key={layer.id} className="pointer-events-none absolute" style={{ left: box.x, top: box.y, width: box.width, height: box.height, isolation: "isolate", ...layerBlendStyle(layer), ...(maskUrl ? { maskImage: `url(${maskUrl})`, WebkitMaskImage: `url(${maskUrl})`, maskSize: "100% 100%", WebkitMaskSize: "100% 100%" } : null) }}>
                        {psGroupChildren(layers, layer).map((child) => (child.hidden ? null : renderLayer(child, { x: box.x, y: box.y })))}
                    </div>
                );
            })}
        </>
    );
}

function PsRasterBoard({ board }: { board: SmartCanvasBoard }) {
    const [url, setUrl] = useState("");
    const signature = psCompositeSignature(board);
    useEffect(() => {
        let active = true;
        const timer = window.setTimeout(() => {
            void renderPsDocument(board, { width: Math.max(1, Math.round(board.width)), height: Math.max(1, Math.round(board.height)) }).then(({ canvas }) => {
                if (active) setUrl(canvas ? canvas.toDataURL("image/png") : "");
            });
        }, 60);
        return () => {
            active = false;
            window.clearTimeout(timer);
        };
    }, [signature]);
    if (!url) return null;
    return <img src={url} alt="" draggable={false} className="pointer-events-none absolute inset-0 h-full w-full select-none object-fill" />;
}

export function useResolvedPsLayerUrls(layers: CanvasPsLayer[]) {
    const [urls, setUrls] = useState<{ urls: Record<string, string>; masks: Record<string, string> }>({ urls: {}, masks: {} });

    useEffect(() => {
        let active = true;
        void Promise.all([
            Promise.all(layers.filter((layer) => (layer.kind === "pixel" || layer.kind === "image") && (layer.storageKey || layer.content)).map(async (layer) => [layer.id, await resolveImageUrl(layer.storageKey, layer.content || "")] as const)),
            Promise.all(layers.filter((layer) => layer.maskStorageKey).map(async (layer) => [layer.id, await resolveImageUrl(layer.maskStorageKey)] as const)),
        ]).then(([urlEntries, maskEntries]) => {
            if (active) setUrls({ urls: Object.fromEntries(urlEntries), masks: Object.fromEntries(maskEntries) });
        });
        return () => {
            active = false;
        };
    }, [layers]);

    return urls;
}
