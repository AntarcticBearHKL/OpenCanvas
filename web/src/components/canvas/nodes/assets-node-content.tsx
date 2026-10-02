import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, Eye, Folder, FolderInput, Grid3x3, Image as ImageIcon, Loader2, Music2, PenLine, PlugZap, RefreshCw, TriangleAlert } from "lucide-react";
import { Select, TreeSelect } from "antd";
import { useTranslation } from "react-i18next";

import { AssetFilePreview } from "@/components/canvas/nodes/asset-file-preview";
import { BROWSER_CACHE_DRAG_MIME, getBrowserCacheFile } from "@/services/api/browser-cache";
import { ASSET_FOLDER_DRAG_MIME, ASSET_FOLDER_FILE_LIMIT, STUDIO_ASSET_DRAG_MIME } from "@/lib/canvas/asset-folder";
import { renderStudioAssetOutput, type StudioAssetKind } from "@/lib/canvas/studio-asset-output";
import { useCanvasTheme } from "@/hooks/use-canvas-theme";
import { useAssetFolderStore } from "@/stores/use-asset-folder-store";
import { useBrowserCacheStore } from "@/stores/use-browser-cache-store";
import { useImageStore } from "@/stores/use-image-store";
import { useAudioStore } from "@/stores/use-audio-store";
import { usePixelStore } from "@/stores/use-pixel-store";
import { useWritingStore } from "@/stores/use-writing-store";
import type { CanvasAssetSource, CanvasAssetStudioProjects, CanvasNodeData } from "@/types/canvas";

type StudioItemStatus = "idle" | "rendering" | "ready" | "error";

type StudioItem = { kind: StudioAssetKind; projectId: string; groupName: string; title: string; status: StudioItemStatus; file?: File };

const STUDIO_KINDS: StudioAssetKind[] = ["image", "audio", "pixel", "write"];

const STUDIO_ICONS: Record<StudioAssetKind, typeof ImageIcon> = { image: ImageIcon, audio: Music2, pixel: Grid3x3, write: PenLine };

export function AssetsNodeContent({
    node,
    onInsert,
    onSourceChange,
    onStudioProjectsChange,
}: {
    node: CanvasNodeData;
    onInsert: (file: File) => void;
    onSourceChange: (source: CanvasAssetSource) => void;
    onStudioProjectsChange: (next: CanvasAssetStudioProjects) => void;
}) {
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
    const imageProjects = useImageStore((state) => state.projects);
    const imageGroups = useImageStore((state) => state.groups);
    const audioProjects = useAudioStore((state) => state.projects);
    const audioGroups = useAudioStore((state) => state.groups);
    const pixelProjects = usePixelStore((state) => state.projects);
    const pixelGroups = usePixelStore((state) => state.groups);
    const writeProjects = useWritingStore((state) => state.projects);
    const writeGroups = useWritingStore((state) => state.groups);
    const [previewFile, setPreviewFile] = useState<File | null>(null);
    const [items, setItems] = useState<StudioItem[]>([]);
    const renderTokenRef = useRef(0);
    const source: CanvasAssetSource = node.metadata?.assetSource === "cache" ? "cache" : node.metadata?.assetSource === "studio" ? "studio" : "folder";
    const studioSelection = useMemo(() => node.metadata?.assetStudioProjects ?? {}, [node.metadata?.assetStudioProjects]);
    const files = binding?.files || [];
    const folders = binding?.folders || [];
    const path = binding?.path || [];
    const crumbs = [binding?.folderName || "", ...path];
    const bound = Boolean(binding?.folderName);
    const collectLabel = binding?.collectStatus === "saving" ? t("canvas.assets.collectSaving") : binding?.collectStatus === "saved" ? t("canvas.assets.collectSaved") : binding?.collectStatus === "failed" ? t("canvas.assets.collectFailed") : "";
    const statusLabel = collectLabel || (binding?.failed ? t("canvas.assets.scanFailed") : binding?.capped ? t("canvas.assets.capped", { count: ASSET_FOLDER_FILE_LIMIT }) : files.length ? t("canvas.assets.dropHint") : "");
    const cachedItems = cacheItems.slice(0, ASSET_FOLDER_FILE_LIMIT);
    const cacheStatusLabel = cacheItems.length > ASSET_FOLDER_FILE_LIMIT ? t("canvas.assets.capped", { count: ASSET_FOLDER_FILE_LIMIT }) : "";

    const studioSources = useMemo(
        () => ({
            image: { projects: imageProjects, groups: imageGroups },
            audio: { projects: audioProjects, groups: audioGroups },
            pixel: { projects: pixelProjects, groups: pixelGroups },
            write: { projects: writeProjects, groups: writeGroups },
        }),
        [imageProjects, imageGroups, audioProjects, audioGroups, pixelProjects, pixelGroups, writeProjects, writeGroups],
    );

    const studioTrees = useMemo(() => {
        const trees: Record<StudioAssetKind, { value: string; title: string; selectable: boolean; children: { value: string; title: string }[] }[]> = { image: [], audio: [], pixel: [], write: [] };
        for (const kind of STUDIO_KINDS) {
            const { projects, groups } = studioSources[kind];
            const byGroup = new Map<string, { value: string; title: string; selectable: boolean; children: { value: string; title: string }[] }>();
            for (const group of groups) byGroup.set(group.id, { value: `group:${group.id}`, title: group.name, selectable: false, children: [] });
            for (const project of projects) {
                const groupId = project.groupId ?? "";
                if (!byGroup.has(groupId)) byGroup.set(groupId, { value: `group:${groupId}`, title: t("canvas.assets.studioUngrouped"), selectable: false, children: [] });
                byGroup.get(groupId)?.children.push({ value: project.id, title: project.title });
            }
            trees[kind] = Array.from(byGroup.values()).filter((group) => group.children.length);
        }
        return trees;
    }, [studioSources, t]);

    const selectedStudioItems = useMemo(() => {
        const list: { kind: StudioAssetKind; projectId: string; groupName: string; title: string }[] = [];
        for (const kind of STUDIO_KINDS) {
            const ids = studioSelection[kind] ?? [];
            if (!ids.length) continue;
            const { projects, groups } = studioSources[kind];
            for (const id of ids) {
                const project = projects.find((item) => item.id === id);
                if (!project) continue;
                const groupName = groups.find((group) => group.id === project.groupId)?.name ?? t("canvas.assets.studioUngrouped");
                list.push({ kind, projectId: id, groupName, title: project.title });
            }
        }
        return list;
    }, [studioSelection, studioSources, t]);

    useEffect(() => {
        void useAssetFolderStore.getState().restore(node.id);
    }, [node.id]);

    useEffect(() => {
        if (binding?.collectStatus !== "saved") return;
        const timer = window.setTimeout(() => useAssetFolderStore.getState().setCollectStatus(node.id, "idle"), 2000);
        return () => window.clearTimeout(timer);
    }, [binding?.collectStatus, node.id]);

    useEffect(() => {
        if (source !== "studio") {
            setItems([]);
            return;
        }
        const token = ++renderTokenRef.current;
        setItems(selectedStudioItems.map((item) => ({ ...item, status: "rendering" })));
        for (const item of selectedStudioItems) {
            const sourceProject = studioSources[item.kind].projects.find((project) => project.id === item.projectId);
            void renderStudioAssetOutput(item.kind, { id: item.projectId, title: item.title, groupId: sourceProject?.groupId }, { [item.kind]: sourceProject })
                .then((output) => {
                    if (renderTokenRef.current !== token) return;
                    setItems((prev) => prev.map((entry) => (entry.kind === item.kind && entry.projectId === item.projectId ? { ...entry, status: "ready", file: output.file } : entry)));
                })
                .catch(() => {
                    if (renderTokenRef.current !== token) return;
                    setItems((prev) => prev.map((entry) => (entry.kind === item.kind && entry.projectId === item.projectId ? { ...entry, status: "error" } : entry)));
                });
        }
    }, [source, selectedStudioItems, studioSources]);

    const insertCached = async (itemId: string) => {
        const file = await getBrowserCacheFile(itemId);
        if (file) onInsert(file);
    };

    const previewCached = async (itemId: string) => {
        const file = await getBrowserCacheFile(itemId);
        if (file) setPreviewFile(file);
    };

    const updateStudioSelection = (kind: StudioAssetKind, values: string[]) => {
        const projectIds = values.filter((value) => !value.startsWith("group:"));
        onStudioProjectsChange({ ...studioSelection, [kind]: projectIds });
    };

    const studioCount = items.length;
    const studioStatusLabel = items.some((item) => item.status === "rendering") ? t("canvas.assets.studioRendering") : items.some((item) => item.status === "error") ? t("canvas.assets.studioRenderFailed") : items.length ? t("canvas.assets.studioReady") : "";

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
                        { value: "studio", label: t("canvas.assets.sourceStudio") },
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
                    <button type="button" className="flex h-7 shrink-0 items-center gap-1 rounded-md px-2 text-sm font-medium transition hover:bg-hover" style={{ color: theme.node.text }} onClick={() => void bindFolder(node.id)} onMouseDown={(event) => event.stopPropagation()}>
                        <FolderInput className="size-3.5" />
                        {bound ? t("canvas.assets.rebind") : t("canvas.assets.bind")}
                    </button>
                )}
                <button
                    type="button"
                    className="grid size-7 shrink-0 place-items-center rounded-md transition hover:bg-hover"
                    style={{ color: theme.node.text }}
                    aria-label={t("canvas.assets.refresh")}
                    title={t("canvas.assets.refresh")}
                    onClick={() => void (source === "cache" ? initCache() : source === "folder" ? refresh(node.id) : undefined)}
                    onMouseDown={(event) => event.stopPropagation()}
                >
                    <RefreshCw className="size-3.5" />
                </button>
            </div>

            {source === "studio" ? (
                <>
                    <div className="flex flex-col gap-1" onMouseDown={(event) => event.stopPropagation()}>
                        {STUDIO_KINDS.map((kind) => {
                            const Icon = STUDIO_ICONS[kind];
                            return (
                                <div key={kind} className="flex items-center gap-1">
                                    <Icon className="size-3.5 shrink-0" style={{ color: theme.node.muted }} />
                                    <TreeSelect
                                        size="small"
                                        variant="borderless"
                                        className="min-w-0 flex-1"
                                        treeCheckable
                                        showCheckedStrategy={TreeSelect.SHOW_CHILD}
                                        treeDefaultExpandAll
                                        allowClear
                                        maxTagCount="responsive"
                                        placeholder={t(`canvas.assets.studioKind.${kind}`)}
                                        value={studioSelection[kind] ?? []}
                                        treeData={studioTrees[kind]}
                                        popupMatchSelectWidth={false}
                                        styles={{ popup: { root: { zIndex: 1300 } } }}
                                        aria-label={t(`canvas.assets.studioKind.${kind}`)}
                                        onChange={(values: string[]) => updateStudioSelection(kind, values)}
                                    />
                                </div>
                            );
                        })}
                    </div>
                    <div className="thin-scrollbar min-h-0 flex-1 overflow-y-auto" onWheel={(event) => event.stopPropagation()}>
                        {items.length ? (
                            <div className="flex flex-col gap-0.5">
                                {items.map((item) => {
                                    const Icon = STUDIO_ICONS[item.kind];
                                    const ready = item.status === "ready" && item.file;
                                    return (
                                        <div key={`${item.kind}:${item.projectId}`} className="group/row flex w-full items-center gap-0.5 border-b transition hover:bg-hover" style={{ borderColor: theme.toolbar.border }} onMouseDown={(event) => event.stopPropagation()}>
                                            <button
                                                type="button"
                                                draggable={Boolean(ready)}
                                                disabled={!ready}
                                                onDragStart={(event) => {
                                                    if (!item.file) return;
                                                    event.dataTransfer.effectAllowed = "copy";
                                                    event.dataTransfer.setData(STUDIO_ASSET_DRAG_MIME, JSON.stringify({ nodeId: node.id, kind: item.kind, projectId: item.projectId }));
                                                    event.dataTransfer.setData("text/plain", item.title);
                                                }}
                                                onClick={() => item.file && onInsert(item.file)}
                                                onMouseDown={(event) => event.stopPropagation()}
                                                className="flex min-w-0 flex-1 cursor-grab items-center gap-1.5 px-1.5 py-1 text-left text-sm transition active:cursor-grabbing disabled:cursor-default"
                                                style={{ color: theme.node.text }}
                                                title={`${item.groupName} / ${item.title}`}
                                            >
                                                <Icon className="size-3 shrink-0" style={{ color: theme.node.muted }} />
                                                <span className="min-w-0 flex-1 truncate">
                                                    <span style={{ color: theme.node.muted }}>{item.groupName} / </span>
                                                    {item.title}
                                                </span>
                                                {item.status === "rendering" && <Loader2 className="size-3 shrink-0 animate-spin" style={{ color: theme.node.muted }} />}
                                                {item.status === "error" && <TriangleAlert className="size-3 shrink-0" style={{ color: theme.node.muted }} />}
                                            </button>
                                            {ready && (
                                                <button
                                                    type="button"
                                                    className="grid size-5 shrink-0 place-items-center rounded-md opacity-0 transition group-hover/row:opacity-100 hover:bg-hover"
                                                    style={{ color: theme.node.text }}
                                                    aria-label={t("canvas.assets.preview")}
                                                    title={t("canvas.assets.preview")}
                                                    onMouseDown={(event) => event.stopPropagation()}
                                                    onClick={(event) => {
                                                        event.stopPropagation();
                                                        if (item.file) setPreviewFile(item.file);
                                                    }}
                                                >
                                                    <Eye className="size-3.5" />
                                                </button>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        ) : (
                            <div className="grid h-full place-items-center px-4 text-center text-sm" style={{ color: theme.node.placeholder }}>
                                {t("canvas.assets.studioEmpty")}
                            </div>
                        )}
                    </div>
                </>
            ) : source === "cache" ? (
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
                                            className="grid size-5 shrink-0 place-items-center rounded-md opacity-0 transition group-hover/row:opacity-100 hover:bg-hover"
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
                            className="grid size-5 shrink-0 place-items-center rounded-md transition hover:bg-hover disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent hover:bg-hover dark:disabled:hover:bg-transparent"
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
                                        <button type="button" className="min-w-0 truncate rounded-md px-0.5 transition hover:bg-hover" onClick={() => void goToDepth(node.id, index)} onMouseDown={(event) => event.stopPropagation()}>
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
                                            className="grid size-5 shrink-0 place-items-center rounded-md opacity-0 transition group-hover/row:opacity-100 hover:bg-hover"
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
                <span>{source === "cache" ? t("canvas.assets.cacheCount", { count: cacheItems.length }) : source === "studio" ? t("canvas.assets.studioCount", { count: studioCount }) : t("canvas.assets.count", { count: files.length })}</span>
                <span className="truncate">{source === "cache" ? cacheStatusLabel : source === "studio" ? studioStatusLabel : statusLabel}</span>
            </div>

            <AssetFilePreview file={previewFile} open={Boolean(previewFile)} onClose={() => setPreviewFile(null)} />
        </div>
    );
}
