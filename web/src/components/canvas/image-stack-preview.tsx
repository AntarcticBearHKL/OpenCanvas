import { ClipboardCopy, CornerUpRight, Download, Loader2, RefreshCw, Scissors, Star, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";

import { useCanvasTheme } from "@/hooks/use-canvas-theme";
import type { CanvasNodeImage } from "@/types/canvas";

// Waterfall gallery for an image stack: natural-ratio columns, per-image management, themed chrome.
export function ImageStackPreview({ images, coverId, activeId, onSetCover, onTakeOut, onRemove, onRetry, onDownload, onCopy, onSplitAll }: {
    images: CanvasNodeImage[];
    coverId?: string | null;
    activeId?: string | null;
    onSetCover: (image: CanvasNodeImage) => void;
    onTakeOut: (image: CanvasNodeImage) => void;
    onRemove: (image: CanvasNodeImage) => void;
    onRetry: (image: CanvasNodeImage) => void;
    onDownload: (image: CanvasNodeImage) => void;
    onCopy: (image: CanvasNodeImage) => void;
    onSplitAll: () => void;
}) {
    const theme = useCanvasTheme();
    const { t } = useTranslation();
    const isCover = (image: CanvasNodeImage) => image.id === coverId;

    return (
        <div className="thin-scrollbar max-h-[78vh] w-full overflow-y-auto">
            {images.length > 1 ? (
                <div className="mb-2 flex justify-end">
                    <button type="button" className="flex items-center gap-1 rounded-md px-1.5 py-1 text-xs transition-colors hover:bg-hover" style={{ color: theme.node.muted }} onClick={onSplitAll}>
                        <Scissors className="size-3.5" />
                        {t("canvas.node.stackSplitAll")}
                    </button>
                </div>
            ) : null}
            <div className="columns-2 gap-3 sm:columns-3 xl:columns-4">
                {images.map((image, index) => (
                    <div
                        key={image.id}
                        className="group relative mb-3 break-inside-avoid overflow-hidden rounded-xl border"
                        style={{ background: theme.node.fill, borderColor: isCover(image) || image.id === activeId ? theme.node.accent : theme.node.stroke }}
                    >
                        {image.content ? (
                            <>
                                <img src={image.thumbnail || image.content} alt={t("imageReferences.label", { index: index + 1 })} draggable={false} className="block w-full select-none" />
                                {isCover(image) ? (
                                    <span className="absolute left-2 top-2 rounded-md px-1.5 py-0.5 text-[11px] font-medium" style={{ background: theme.node.accentSoft, color: theme.node.accent }}>{t("canvas.node.stackCover")}</span>
                                ) : null}
                                <div className="pointer-events-none absolute right-2 top-2 flex items-center gap-0.5 rounded-lg bg-black/55 p-0.5 opacity-0 backdrop-blur-sm transition-opacity group-hover:pointer-events-auto group-hover:opacity-100 focus-within:pointer-events-auto focus-within:opacity-100">
                                    {isCover(image) ? null : (
                                        <button type="button" className="rounded-md p-1.5 text-white/90 transition-colors hover:bg-white/15" aria-label={t("canvas.node.stackSetCover")} title={t("canvas.node.stackSetCover")} onClick={() => onSetCover(image)}>
                                            <Star className="size-3.5" />
                                        </button>
                                    )}
                                    <button type="button" className="rounded-md p-1.5 text-white/90 transition-colors hover:bg-white/15" aria-label={t("canvas.node.stackTakeOut")} title={t("canvas.node.stackTakeOut")} onClick={() => onTakeOut(image)}>
                                        <CornerUpRight className="size-3.5" />
                                    </button>
                                    <button type="button" className="rounded-md p-1.5 text-white/90 transition-colors hover:bg-white/15" aria-label={t("common.download")} title={t("common.download")} onClick={() => onDownload(image)}>
                                        <Download className="size-3.5" />
                                    </button>
                                    <button type="button" className="rounded-md p-1.5 text-white/90 transition-colors hover:bg-white/15" aria-label={t("canvas.imageTools.copyTitle")} title={t("canvas.imageTools.copyTitle")} onClick={() => onCopy(image)}>
                                        <ClipboardCopy className="size-3.5" />
                                    </button>
                                    <button type="button" className="rounded-md p-1.5 text-white/90 transition-colors hover:bg-white/15" aria-label={t("common.delete")} title={t("common.delete")} onClick={() => onRemove(image)}>
                                        <Trash2 className="size-3.5" />
                                    </button>
                                </div>
                            </>
                        ) : image.status === "error" ? (
                            <div className="flex min-h-24 flex-col items-center justify-center gap-2 px-3 py-6 text-center text-xs leading-4" style={{ color: theme.node.muted }}>
                                <span className="line-clamp-3">{image.errorDetails || t("canvas.node.failed")}</span>
                                <div className="flex items-center gap-1">
                                    <button type="button" className="flex items-center gap-1 rounded-md px-1.5 py-1 text-xs transition-colors hover:bg-hover" onClick={() => onRetry(image)}>
                                        <RefreshCw className="size-3.5" />
                                        {t("canvas.node.retry")}
                                    </button>
                                    <button type="button" className="rounded-md p-1 transition-colors hover:bg-hover" aria-label={t("common.delete")} title={t("common.delete")} onClick={() => onRemove(image)}>
                                        <Trash2 className="size-3.5" />
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <div className="flex min-h-24 items-center justify-center py-8">
                                <Loader2 className="size-5 animate-spin" style={{ color: theme.node.muted }} />
                            </div>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
}
