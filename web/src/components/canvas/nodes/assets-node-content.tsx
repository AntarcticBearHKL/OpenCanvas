import { useEffect, useState } from "react";
import { ChevronLeft, Eye, Folder, FolderInput, PlugZap, RefreshCw } from "lucide-react";
import { Select } from "antd";
import { useTranslation } from "react-i18next";

import { AssetFilePreview } from "@/components/canvas/nodes/asset-file-preview";
import { BROWSER_CACHE_DRAG_MIME, getBrowserCacheFile } from "@/services/api/browser-cache";
import { ASSET_FOLDER_DRAG_MIME, ASSET_FOLDER_FILE_LIMIT } from "@/lib/canvas/asset-folder";
import { useCanvasTheme } from "@/hooks/use-canvas-theme";
import { useAssetFolderStore } from "@/stores/use-asset-folder-store";
import { useBrowserCacheStore } from "@/stores/use-browser-cache-store";
import type { CanvasAssetSource, CanvasNodeData } from "@/types/canvas";

export function AssetsNodeContent({ node, onInsert, onSourceChange }: { node: CanvasNodeData; onInsert: (file: File) => void; onSourceChange: (source: CanvasAssetSource) => void }) {
    const { t } = useTranslation();
    const theme = useCanvasTheme();
    const binding = useAssetFolderStore((state) => state.folders[node.id]);
    const bindFolder = useAssetFolderStore((state) => state.bindFolder);
    const refresh = useAssetFolderStore((state) => state.refresh);
    const enterFolder = useAssetFolderStore((state) => state.enterFolder);
    const goToDepth = useAssetFolderStore((state) => state.goToDepth);
    const cacheStatus = useBrowserCacheStore((state) => state.status);
    const cacheItems = useBrowserCacheStore((state) => state.items);
    const initCache = useBrowserCacheStore((state) => state.init);
    const [previewFile, setPreviewFile] = useState<File | null>(null);
    const source: CanvasAssetSource = node.metadata?.assetSource === "cache" ? "cache" : "folder";
    const files = binding?.files || [];
    const folders = binding?.folders || [];
    const path = binding?.path || [];
    const crumbs = [binding?.folderName || "", ...path];
    const bound = Boolean(binding?.folderName);
    const collectLabel = binding?.collectStatus === "saving" ? t("canvas.assets.collectSaving") : binding?.collectStatus === "saved" ? t("canvas.assets.collectSaved") : binding?.collectStatus === "failed" ? t("canvas.assets.collectFailed") : "";
    const statusLabel = collectLabel || (binding?.failed ? t("canvas.assets.scanFailed") : binding?.capped ? t("canvas.assets.capped", { count: ASSET_FOLDER_FILE_LIMIT }) : files.length ? t("canvas.assets.dropHint") : "");
    const cachedItems = cacheItems.slice(0, ASSET_FOLDER_FILE_LIMIT);
    const cacheStatusLabel = cacheItems.length > ASSET_FOLDER_FILE_LIMIT ? t("canvas.assets.capped", { count: ASSET_FOLDER_FILE_LIMIT }) : "";

    useEffect(() => {
        void useAssetFolderStore.getState().restore(node.id);
    }, [node.id]);

    useEffect(() => {
        if (binding?.collectStatus !== "saved") return;
        const timer = window.setTimeout(() => useAssetFolderStore.getState().setCollectStatus(node.id, "idle"), 2000);
        return () => window.clearTimeout(timer);
    }, [binding?.collectStatus, node.id]);

    const insertCached = async (itemId: string) => {
        const file = await getBrowserCacheFile(itemId);
        if (file) onInsert(file);
    };

    const previewCached = async (itemId: string) => {
        const file = await getBrowserCacheFile(itemId);
        if (file) setPreviewFile(file);
    };

    return (
        <div className="flex h-full w-full flex-col gap-2 p-3 text-left">
            <div className="flex items-center gap-1" onMouseDown={(event) => event.stopPropagation()}>
                <Select
                    size="small"
                    variant="borderless"
                    className="min-w-0 flex-1"
                    value={source}
                    options={[
                        { value: "folder", label: t("canvas.assets.sourceFolder") },
                        { value: "cache", label: t("canvas.assets.sourceCache") },
                    ]}
                    popupMatchSelectWidth={false}
                    styles={{ popup: { root: { zIndex: 1300 } } }}
                    aria-label={t("canvas.assets.source")}
                    onChange={(value: CanvasAssetSource) => {
                        if (value === source) return;
                        onSourceChange(value);
                        if (value === "cache") initCache();
                    }}
                />
                {source === "folder" && (
                    <button type="button" className="flex h-7 shrink-0 items-center gap-1 rounded-[2px] px-2 text-sm font-medium transition hover:bg-hover" style={{ color: theme.node.text }} onClick={() => void bindFolder(node.id)} onMouseDown={(event) => event.stopPropagation()}>
                        <FolderInput className="size-3.5" />
                        {bound ? t("canvas.assets.rebind") : t("canvas.assets.bind")}
                    </button>
                )}
                <button
                    type="button"
                    className="grid size-7 shrink-0 place-items-center rounded-[2px] transition hover:bg-hover"
                    style={{ color: theme.node.text }}
                    aria-label={t("canvas.assets.refresh")}
                    title={t("canvas.assets.refresh")}
                    onClick={() => void (source === "cache" ? initCache() : refresh(node.id))}
                    onMouseDown={(event) => event.stopPropagation()}
                >
                    <RefreshCw className="size-3.5" />
                </button>
            </div>

            {source === "cache" ? (
                cacheStatus === "ready" ? (
                    <div className="thin-scrollbar min-h-0 flex-1 overflow-y-auto" onWheel={(event) => event.stopPropagation()}>
                        {cachedItems.length ? (
                            <div className="flex flex-col gap-0.5">
                                {cachedItems.map((item) => (
                                    <div key={item.id} className="group/row flex w-full items-center gap-0.5 border-b transition hover:bg-hover" style={{ borderColor: theme.toolbar.border }} onMouseDown={(event) => event.stopPropagation()}>
                                        <button
                                            type="button"
                                            draggable
                                            onDragStart={(event) => {
                                                event.dataTransfer.effectAllowed = "copy";
                                                event.dataTransfer.setData(BROWSER_CACHE_DRAG_MIME, JSON.stringify({ nodeId: node.id, itemId: item.id }));
                                                event.dataTransfer.setData("text/plain", item.name);
                                            }}
                                            onClick={() => void insertCached(item.id)}
                                            onMouseDown={(event) => event.stopPropagation()}
                                            className="min-w-0 flex-1 cursor-grab truncate px-1.5 py-1 text-left text-sm transition active:cursor-grabbing"
                                            style={{ color: theme.node.text }}
                                            title={item.name}
                                        >
                                            {item.name}
                                        </button>
                                        <button
                                            type="button"
                                            className="grid size-5 shrink-0 place-items-center rounded-[2px] opacity-0 transition group-hover/row:opacity-100 hover:bg-hover"
                                            style={{ color: theme.node.text }}
                                            aria-label={t("canvas.assets.preview")}
                                            title={t("canvas.assets.preview")}
                                            onMouseDown={(event) => event.stopPropagation()}
                                            onClick={(event) => {
                                                event.stopPropagation();
                                                void previewCached(item.id);
                                            }}
                                        >
                                            <Eye className="size-3.5" />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="grid h-full place-items-center px-4 text-center text-sm" style={{ color: theme.node.placeholder }}>
                                {t("canvas.assets.cacheEmpty")}
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center" style={{ color: theme.node.muted }}>
                        <PlugZap className="size-6" />
                        <span className="px-4 text-sm leading-5">{cacheStatus === "connecting" ? t("canvas.assets.cacheConnecting") : t("canvas.assets.cacheUnavailable")}</span>
                        {cacheStatus === "unavailable" && <span className="px-4 text-sm leading-4">{t("canvas.assets.cacheInstallHint")}</span>}
                    </div>
                )
            ) : bound ? (
                <>
                    <div className="flex min-w-0 items-center gap-0.5" onMouseDown={(event) => event.stopPropagation()}>
                        <button
                            type="button"
                            className="grid size-5 shrink-0 place-items-center rounded-[2px] transition hover:bg-hover disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent hover:bg-hover dark:disabled:hover:bg-transparent"
                            style={{ color: theme.node.text }}
                            aria-label={t("canvas.assets.back")}
                            title={t("canvas.assets.back")}
                            disabled={path.length === 0}
                            onClick={() => void goToDepth(node.id, path.length - 1)}
                            onMouseDown={(event) => event.stopPropagation()}
                        >
                            <ChevronLeft className="size-3.5" />
                        </button>
                        <div className="flex min-w-0 flex-1 items-center gap-0.5 truncate text-sm" style={{ color: theme.node.muted }}>
                            {crumbs.map((segment, index) => (
                                <span key={`${index}-${segment}`} className="flex min-w-0 items-center gap-0.5">
                                    {index > 0 && <span className="shrink-0">/</span>}
                                    {index === crumbs.length - 1 ? (
                                        <span className="truncate">{segment}</span>
                                    ) : (
                                        <button type="button" className="min-w-0 truncate rounded-[2px] px-0.5 transition hover:bg-hover" onClick={() => void goToDepth(node.id, index)} onMouseDown={(event) => event.stopPropagation()}>
                                            {segment}
                                        </button>
                                    )}
                                </span>
                            ))}
                        </div>
                    </div>
                    <div className="thin-scrollbar min-h-0 flex-1 overflow-y-auto" onWheel={(event) => event.stopPropagation()}>
                        {folders.length || files.length ? (
                            <div className="flex flex-col gap-0.5">
                                {folders.map((folder) => (
                                    <button
                                        key={folder.id}
                                        type="button"
                                        onClick={() => void enterFolder(node.id, folder.name)}
                                        onMouseDown={(event) => event.stopPropagation()}
                                        className="flex w-full min-w-0 items-center gap-1 border-b px-1.5 py-1 text-left text-sm transition hover:bg-hover"
                                        style={{ color: theme.node.text, borderColor: theme.toolbar.border }}
                                        aria-label={t("canvas.assets.openFolder")}
                                        title={t("canvas.assets.openFolder")}
                                    >
                                        <Folder className="size-3 shrink-0" style={{ color: theme.node.muted }} />
                                        <span className="truncate">{folder.name}</span>
                                    </button>
                                ))}
                                {files.map((item) => (
                                    <div key={item.id} className="group/row flex w-full items-center gap-0.5 border-b transition hover:bg-hover" style={{ borderColor: theme.toolbar.border }} onMouseDown={(event) => event.stopPropagation()}>
                                        <button
                                            type="button"
                                            draggable
                                            onDragStart={(event) => {
                                                event.dataTransfer.effectAllowed = "copy";
                                                event.dataTransfer.setData(ASSET_FOLDER_DRAG_MIME, JSON.stringify({ nodeId: node.id, fileId: item.id }));
                                                event.dataTransfer.setData("text/plain", item.name);
                                            }}
                                            onClick={() => onInsert(item.file)}
                                            onMouseDown={(event) => event.stopPropagation()}
                                            className="min-w-0 flex-1 cursor-grab truncate px-1.5 py-1 text-left text-sm transition active:cursor-grabbing"
                                            style={{ color: theme.node.text }}
                                            title={item.name}
                                        >
                                            {item.name}
                                        </button>
                                        <button
                                            type="button"
                                            className="grid size-5 shrink-0 place-items-center rounded-[2px] opacity-0 transition group-hover/row:opacity-100 hover:bg-hover"
                                            style={{ color: theme.node.text }}
                                            aria-label={t("canvas.assets.preview")}
                                            title={t("canvas.assets.preview")}
                                            onMouseDown={(event) => event.stopPropagation()}
                                            onClick={(event) => {
                                                event.stopPropagation();
                                                setPreviewFile(item.file);
                                            }}
                                        >
                                            <Eye className="size-3.5" />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="grid h-full place-items-center px-4 text-center text-sm" style={{ color: theme.node.placeholder }}>
                                {t("canvas.assets.empty")}
                            </div>
                        )}
                    </div>
                </>
            ) : (
                <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center" style={{ color: theme.node.muted }}>
                    <FolderInput className="size-6" />
                    <span className="px-4 text-sm leading-5">{t("canvas.assets.unbound")}</span>
                </div>
            )}

            <div className="flex shrink-0 items-center justify-between gap-2 text-sm" style={{ color: theme.node.muted }}>
                <span>{source === "cache" ? t("canvas.assets.cacheCount", { count: cacheItems.length }) : t("canvas.assets.count", { count: files.length })}</span>
                <span className="truncate">{source === "cache" ? cacheStatusLabel : statusLabel}</span>
            </div>

            <AssetFilePreview file={previewFile} open={Boolean(previewFile)} onClose={() => setPreviewFile(null)} />
        </div>
    );
}
