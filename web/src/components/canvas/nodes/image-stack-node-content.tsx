import { Images, Layers, Loader2, Scissors } from "lucide-react";
import { useTranslation } from "react-i18next";

import { useCanvasTheme } from "@/hooks/use-canvas-theme";
import type { CanvasNodeData, CanvasNodeImage } from "@/types/canvas";

// Node drag must not start from a pile control: swallow every input event on the buttons.
const stop = (event: { stopPropagation: () => void }) => event.stopPropagation();

// Image stack on the canvas: a transparent heap of the stack's real photos (cover on top, offset cards behind).
// Per-image management lives in the waterfall popup, opened by double-click or the count chip.
export function ImageStackNodeContent({ node, onViewAll, onSplitAll }: {
    node: CanvasNodeData;
    onViewAll: () => void;
    onSplitAll: () => void;
}) {
    const theme = useCanvasTheme();
    const { t } = useTranslation();
    const images = node.metadata?.images ?? [];
    const coverId = node.metadata?.primaryImageId || images[0]?.id;
    const cover = images.find((image) => image.id === coverId) ?? images[0];
    const ordered: CanvasNodeImage[] = cover ? [cover, ...images.filter((image) => image.id !== cover.id)] : [];
    const backing = ordered.slice(1, 5);

    return (
        <div
            className="group relative h-full w-full"
            onDoubleClick={(event) => {
                if (!cover?.content) return;
                stop(event);
                onViewAll();
            }}
        >
            {ordered.length ? (
                <>
                    {backing.map((image, index) => (
                        <div
                            key={image.id}
                            className="absolute inset-0 overflow-hidden rounded-2xl shadow-md"
                            style={{
                                background: theme.node.fill,
                                transform: `translate(${(index + 1) * 7 * (index % 2 ? -1 : 1)}px, ${(index + 1) * 5}px) rotate(${(2 + index * 1.4) * (index % 2 ? -1 : 1)}deg)`,
                                zIndex: 20 + index,
                            }}
                        >
                            {image.content ? <img src={image.thumbnail || image.content} alt="" draggable={false} className="h-full w-full select-none object-cover" /> : null}
                        </div>
                    ))}
                    <div className="absolute inset-0 z-30 overflow-hidden rounded-2xl border shadow-lg" style={{ background: theme.node.fill, borderColor: theme.node.stroke }}>
                        {cover?.content ? (
                            <img src={cover.thumbnail || cover.content} alt={node.title} draggable={false} className={`h-full w-full select-none ${ordered.length > 1 ? "object-cover" : "object-contain"}`} />
                        ) : cover?.status === "error" ? (
                            <div className="flex h-full w-full items-center justify-center px-3 text-center">
                                <span className="line-clamp-3 text-xs leading-4" style={{ color: theme.node.muted }}>{cover.errorDetails || t("canvas.node.failed")}</span>
                            </div>
                        ) : (
                            <div className="flex h-full w-full items-center justify-center">
                                <Loader2 className="size-5 animate-spin" style={{ color: theme.node.muted }} />
                            </div>
                        )}
                    </div>
                    <button
                        type="button"
                        className="absolute right-2 top-2 z-40 flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium backdrop-blur-md transition-opacity hover:opacity-90"
                        style={{ background: theme.toolbar.panel, color: theme.node.text }}
                        aria-label={t("canvas.controls.images", { count: images.length })}
                        title={t("canvas.controls.images", { count: images.length })}
                        onMouseDown={stop}
                        onPointerDown={stop}
                        onClick={(event) => {
                            stop(event);
                            onViewAll();
                        }}
                    >
                        <Layers className="size-3" />
                        {t("canvas.controls.images", { count: images.length })}
                    </button>
                    {images.length > 1 ? (
                        <button
                            type="button"
                            className="absolute left-2 top-2 z-40 flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium opacity-0 backdrop-blur-md transition-opacity group-hover:opacity-100 focus-within:opacity-100"
                            style={{ background: theme.toolbar.panel, color: theme.node.text }}
                            aria-label={t("canvas.node.stackSplitAll")}
                            title={t("canvas.node.stackSplitAll")}
                            onMouseDown={stop}
                            onPointerDown={stop}
                            onClick={(event) => {
                                stop(event);
                                onSplitAll();
                            }}
                        >
                            <Scissors className="size-3" />
                            {t("canvas.node.stackSplitAll")}
                        </button>
                    ) : null}
                </>
            ) : (
                <div className="absolute inset-2 flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed px-4 text-center" style={{ borderColor: theme.node.stroke, color: theme.node.muted }}>
                    <Images className="size-6" />
                    <span className="text-sm">{t("canvas.node.stackEmpty")}</span>
                </div>
            )}
        </div>
    );
}
