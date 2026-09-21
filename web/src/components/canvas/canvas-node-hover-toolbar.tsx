import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Modal, Segmented } from "antd";
import { BetweenHorizontalStart, Copy, Download, FolderPlus, GalleryHorizontal, GalleryHorizontalEnd, Image as ImageIcon, ImagePlus, Info, Layers, MessageSquare, Minus, Music2, Plus, RefreshCw, Settings2, Tags, Trash2, Upload, Video } from "lucide-react";
import { useTranslation } from "react-i18next";

import { useCanvasTheme } from "@/hooks/use-canvas-theme";
import { getNodeDefinition } from "@/lib/canvas/node-registry";
import { formatBytes, getDataUrlByteSize } from "@/lib/image-utils";
import type { VideoFramePosition } from "@/lib/canvas/canvas-video-frame";
import { CanvasNodeType, type CanvasNodeData, type CanvasNodeMetadata, type ViewportTransform } from "@/types/canvas";
import type { CanvasNodeToolbarItem } from "@/types/canvas-plugin";
import { canvasFloatingBarClass, canvasFloatingBarStyle, CanvasFloatingToolbarAction } from "./canvas-floating-toolbar";
import { CanvasNodeLayerPopover } from "./canvas-node-layer-popover";
import { CanvasTextStylePopover } from "./canvas-text-style-popover";
import { IMAGE_QUICK_TOOLS_STORAGE_KEY, buildImageToolbarTools, defaultImageQuickToolIds, readImageQuickToolsConfig, type ImageQuickToolId } from "./canvas-image-toolbar-tools";

type CanvasNodeHoverToolbarProps = {
    node: CanvasNodeData | null;
    nodes: CanvasNodeData[];
    viewport: ViewportTransform;
    onKeep: (nodeId: string) => void;
    onLeave: () => void;
    onInfo: (node: CanvasNodeData) => void;
    onDecreaseFont: (node: CanvasNodeData) => void;
    onIncreaseFont: (node: CanvasNodeData) => void;
    onToggleDialog: (node: CanvasNodeData) => void;
    onGenerateImage: (node: CanvasNodeData) => void;
    onUpload: (node: CanvasNodeData) => void;
    onDownload: (node: CanvasNodeData) => void;
    onSaveAsset: (node: CanvasNodeData) => void;
    onMaskEdit: (node: CanvasNodeData) => void;
    onCrop: (node: CanvasNodeData) => void;
    onRemoveBackground: (node: CanvasNodeData) => void;
    onSplit: (node: CanvasNodeData) => void;
    onResolution: (node: CanvasNodeData) => void;
    onAnalyze: (node: CanvasNodeData) => void;
    onOcr: (node: CanvasNodeData) => void;
    onSegment: (node: CanvasNodeData) => void;
    onAngle: (node: CanvasNodeData) => void;
    onRetry: (node: CanvasNodeData) => void;
    onToggleFreeResize: (node: CanvasNodeData) => void;
    onDelete: (node: CanvasNodeData) => void;
    onDuplicate: (node: CanvasNodeData) => void;
    onMoveLayer: (nodeId: string, direction: "up" | "down") => void;
    onToggleFlag: (nodeId: string, flag: "locked" | "hidden") => void;
    onBulkRename: (ids: string[], title: string) => void;
    onCaptureVideoFrame: (node: CanvasNodeData, position: VideoFramePosition) => void;
    onTextStyleChange?: (nodeId: string, patch: Partial<CanvasNodeMetadata>) => void;
    onSaveBoardAsNode?: (node: CanvasNodeData) => void;
    extraTools?: CanvasNodeToolbarItem[];
};

type ToolbarTool = {
    id: string;
    title: string;
    label: string;
    icon: ReactNode;
    onClick: () => void;
    active?: boolean;
    danger?: boolean;
};

export function CanvasNodeHoverToolbar({
    node,
    nodes,
    viewport,
    onKeep,
    onLeave,
    onInfo,
    onDecreaseFont,
    onIncreaseFont,
    onToggleDialog,
    onGenerateImage,
    onUpload,
    onDownload,
    onSaveAsset,
    onMaskEdit,
    onCrop,
    onRemoveBackground,
    onSplit,
    onResolution,
    onAnalyze,
    onOcr,
    onSegment,
    onAngle,
    onRetry,
    onToggleFreeResize,
    onDelete,
    onDuplicate,
    onMoveLayer,
    onToggleFlag,
    onBulkRename,
    onCaptureVideoFrame,
    onTextStyleChange,
    onSaveBoardAsNode,
    extraTools = [],
}: CanvasNodeHoverToolbarProps) {
    const [quickImageToolIds, setQuickImageToolIds] = useState<ImageQuickToolId[]>(defaultImageQuickToolIds);
    const [showImageToolLabels, setShowImageToolLabels] = useState(false);
    const [layerOpen, setLayerOpen] = useState(false);
    const { t } = useTranslation();
    const theme = useCanvasTheme();

    useEffect(() => {
        try {
            const stored = window.localStorage.getItem(IMAGE_QUICK_TOOLS_STORAGE_KEY);
            if (!stored) return;
            const parsed = JSON.parse(stored) as unknown;
            const config = readImageQuickToolsConfig(parsed);
            setQuickImageToolIds(config.ids);
            setShowImageToolLabels(config.showLabels);
        } catch {
            window.localStorage.removeItem(IMAGE_QUICK_TOOLS_STORAGE_KEY);
        }
    }, []);

    useEffect(() => {
        setLayerOpen(false);
    }, [node?.id]);

    if (!node) return null;

    const left = viewport.x + (node.position.x + node.width / 2) * viewport.k;
    const top = viewport.y + node.position.y * viewport.k - 14;
    const isImage = node.type === CanvasNodeType.Image;
    const isVideo = node.type === CanvasNodeType.Video;
    const isAudio = node.type === CanvasNodeType.Audio;
    const hasImage = isImage && Boolean(node.metadata?.content);
    const hasVideo = isVideo && Boolean(node.metadata?.content);
    const hasAudio = isAudio && Boolean(node.metadata?.content);
    const isText = node.type === CanvasNodeType.Text;
    const isConfig = node.type === CanvasNodeType.Config;
    const isBoard = node.type === CanvasNodeType.SmartCanvas;
    const canRetry = node.metadata?.status === "error" && !(isVideo && Boolean(node.metadata?.videoTaskId) && !hasVideo);
    const canQueryVideoTask = isVideo && Boolean(node.metadata?.videoTaskId) && !hasVideo && node.metadata?.status !== "loading";
    const quickImageToolIdSet = new Set(quickImageToolIds);
    const imageTools = buildImageToolbarTools(node, { onUpload, onToggleFreeResize, onMaskEdit, onCrop, onRemoveBackground, onSplit, onResolution, onAnalyze, onOcr, onSegment, onAngle, onDuplicate });

    function toggleImageToolLabels() {
        const showLabels = !showImageToolLabels;
        setShowImageToolLabels(showLabels);
        window.localStorage.setItem(IMAGE_QUICK_TOOLS_STORAGE_KEY, JSON.stringify({ ids: quickImageToolIds, showLabels }));
    }

    const baseToolbarTools: ToolbarTool[] = [
        ...(hasImage || isConfig ? [] : [{ id: "info", title: t("canvas.nodeToolbar.infoTitle"), label: t("canvas.nodeToolbar.info"), icon: <Info className="size-4" />, onClick: () => onInfo(node) }]),
        ...(hasImage ? [] : [{ id: "duplicate", title: t("canvas.nodeToolbar.duplicateTitle"), label: t("canvas.controls.duplicate"), icon: <Copy className="size-4" />, onClick: () => onDuplicate(node) }]),
    ];
    const deleteTool: ToolbarTool = { id: "delete", title: t("canvas.nodeToolbar.removeTitle"), label: t("common.delete"), icon: <Trash2 className="size-4" />, onClick: () => onDelete(node), danger: true };
    const nodeToolbarTools: ToolbarTool[] = [
        ...(canQueryVideoTask ? [{ id: "queryVideoTask", title: t("canvas.nodeToolbar.queryVideoTaskTitle"), label: t("canvas.nodeToolbar.queryVideoTask"), icon: <RefreshCw className="size-4" />, onClick: () => onRetry(node) }] : []),
        ...(canRetry && !isConfig ? [{ id: "retry", title: t("canvas.nodeToolbar.retryTitle"), label: t("canvas.node.retry"), icon: <RefreshCw className="size-4" />, onClick: () => onRetry(node) }] : []),
        ...(isVideo && hasVideo
            ? [
                  { id: "captureFirst", title: t("canvas.videoFrames.first"), label: t("canvas.videoFrames.first"), icon: <BetweenHorizontalStart className="size-4" />, onClick: () => onCaptureVideoFrame(node, "first") },
                  { id: "captureLast", title: t("canvas.videoFrames.last"), label: t("canvas.videoFrames.last"), icon: <GalleryHorizontalEnd className="size-4" />, onClick: () => onCaptureVideoFrame(node, "last") },
                  { id: "captureCurrent", title: t("canvas.videoFrames.current"), label: t("canvas.videoFrames.current"), icon: <GalleryHorizontal className="size-4" />, onClick: () => onCaptureVideoFrame(node, "current") },
              ]
            : []),
        ...(hasVideo || isText ? [{ id: "saveAsset", title: t("common.addToAssets"), label: t("canvas.nodeToolbar.saveAsset"), icon: <FolderPlus className="size-4" />, onClick: () => onSaveAsset(node) }] : []),
        ...(hasVideo || hasAudio ? [{ id: "download", title: t(hasAudio ? "canvas.nodeToolbar.downloadAudio" : "canvas.nodeToolbar.downloadVideo"), label: t("common.download"), icon: <Download className="size-4" />, onClick: () => onDownload(node) }] : []),
        ...(isVideo ? [{ id: "edit", title: t("common.edit"), label: t("common.edit"), icon: <MessageSquare className="size-4" />, onClick: () => onToggleDialog(node) }] : []),
        ...(isText ? [{ id: "generateImage", title: t("canvas.node.generateImage"), label: t("canvas.node.generate"), icon: <ImageIcon className="size-4" />, onClick: () => onGenerateImage(node) }] : []),
        ...(isConfig ? [{ id: "config", title: t("canvas.configNode.title"), label: t("canvas.configNode.title"), icon: <Settings2 className="size-4" />, onClick: () => onToggleDialog(node) }] : []),
        ...(isBoard && onSaveBoardAsNode ? [{ id: "saveBoardAsNode", title: t("canvas.smartCanvas.saveAsNode"), label: t("canvas.smartCanvas.saveAsNode"), icon: <ImagePlus className="size-4" />, onClick: () => onSaveBoardAsNode(node) }] : []),
        ...(isText ? [{ id: "decreaseFont", title: t("canvas.nodeToolbar.decreaseFont"), label: t("canvas.nodeToolbar.zoomOut"), icon: <Minus className="size-4" />, onClick: () => onDecreaseFont(node) }] : []),
        ...(isText ? [{ id: "increaseFont", title: t("canvas.nodeToolbar.increaseFont"), label: t("canvas.nodeToolbar.zoomIn"), icon: <Plus className="size-4" />, onClick: () => onIncreaseFont(node) }] : []),
        ...(isImage && !hasImage ? [{ id: "uploadImage", title: t("canvas.nodeToolbar.uploadImage"), label: t("canvas.nodeToolbar.uploadImage"), icon: <Upload className="size-4" />, onClick: () => onUpload(node) }] : []),
        ...(isVideo ? [{ id: "uploadVideo", title: t(hasVideo ? "canvas.nodeToolbar.replaceVideo" : "canvas.nodeToolbar.uploadVideo"), label: t(hasVideo ? "canvas.nodeToolbar.replaceVideo" : "canvas.nodeToolbar.uploadVideo"), icon: <Video className="size-4" />, onClick: () => onUpload(node) }] : []),
        ...(isAudio ? [{ id: "uploadAudio", title: t(hasAudio ? "canvas.nodeToolbar.replaceAudio" : "canvas.nodeToolbar.uploadAudio"), label: t(hasAudio ? "canvas.nodeToolbar.replaceAudio" : "canvas.nodeToolbar.uploadAudio"), icon: <Music2 className="size-4" />, onClick: () => onUpload(node) }] : []),
        ...(hasImage ? imageTools.map((tool) => ({ id: tool.id, title: tool.title, label: tool.label, icon: tool.icon, active: tool.active, onClick: tool.onClick })) : []),
    ];
    const toolbarTools: ToolbarTool[] = hasImage ? [...baseToolbarTools, ...nodeToolbarTools].filter((tool) => quickImageToolIdSet.has(tool.id as ImageQuickToolId)) : [...baseToolbarTools, ...nodeToolbarTools, ...extraTools];

    return (
        <div
            className={canvasFloatingBarClass}
            style={{ ...canvasFloatingBarStyle(theme), left, top }}
            onMouseEnter={() => onKeep(node.id)}
            onMouseLeave={() => {
                setLayerOpen(false);
                onLeave();
            }}
            onMouseDown={(event) => event.stopPropagation()}
            onPointerDown={(event) => event.stopPropagation()}
        >
            {toolbarTools.map((tool) => (
                <CanvasFloatingToolbarAction key={tool.id} {...tool} showLabel={showImageToolLabels} />
            ))}
            {isText && onTextStyleChange ? <CanvasTextStylePopover metadata={node.metadata} onChange={(patch) => onTextStyleChange(node.id, patch)} /> : null}
            <CanvasFloatingToolbarAction title={t("canvas.imageTools.showLabels")} label={t("canvas.imageTools.showLabels")} icon={<Tags className="size-4" />} active={showImageToolLabels} onClick={toggleImageToolLabels} showLabel={showImageToolLabels} />
            {!isBoard && !isConfig ? (
                <CanvasFloatingToolbarAction title={t("canvas.nodeToolbar.layers")} label={t("canvas.nodeToolbar.layers")} icon={<Layers className="size-4" />} active={layerOpen} onClick={() => setLayerOpen((value) => !value)} showLabel={showImageToolLabels} />
            ) : null}
            {layerOpen ? <CanvasNodeLayerPopover node={node} nodes={nodes} onMove={(direction) => onMoveLayer(node.id, direction)} onToggleFlag={onToggleFlag} onBulkRename={onBulkRename} /> : null}
            <CanvasFloatingToolbarAction {...deleteTool} showLabel={showImageToolLabels} />
        </div>
    );
}

export function CanvasNodeInfoModal({ node, open, onClose }: { node: CanvasNodeData | null; open: boolean; onClose: () => void }) {
    const theme = useCanvasTheme();
    const { t } = useTranslation();
    const [view, setView] = useState<"info" | "json">("info");
    const imageBytes = node?.type === CanvasNodeType.Image && node.metadata?.content ? getDataUrlByteSize(node.metadata.content) : 0;
    const batchCount = node?.type === CanvasNodeType.Image ? node.metadata?.images?.length || 0 : 0;
    const json = useMemo(() => {
        if (!node) return "";
        return JSON.stringify(
            node,
            (key, value) => {
                if (key === "content" && typeof value === "string" && value.startsWith("data:image/")) {
                    return "[base64 image]";
                }
                return value;
            },
            2,
        );
    }, [node]);

    useEffect(() => {
        if (open) setView("info");
    }, [node?.id, open]);

    const title = (
        <div className="flex items-center justify-between gap-4 pr-12">
            <span>{t("canvas.nodeToolbar.nodeInfo")}</span>
            <Segmented
                size="small"
                value={view}
                onChange={(value) => setView(value as "info" | "json")}
                options={[
                    { label: t("canvas.nodeToolbar.info"), value: "info" },
                    { label: "JSON", value: "json" },
                ]}
            />
        </div>
    );

    return (
        <Modal className="canvas-node-info-modal" title={title} open={open && Boolean(node)} centered footer={null} onCancel={onClose}>
            {node ? (
                <div className="h-[56vh] min-h-[360px] select-text text-sm" data-canvas-shortcuts-ignore>
                    {view === "info" ? (
                        <div className="thin-scrollbar h-full space-y-3 overflow-auto pr-1">
                            <InfoRow label="ID" value={node.id} />
                            <InfoRow label={t("canvas.nodeToolbar.name")} value={node.title || t("canvas.node.untitled")} />
                            <InfoRow label={t("canvas.nodeToolbar.type")} value={node.type === CanvasNodeType.Config ? t("canvas.configNode.title") : [CanvasNodeType.Image, CanvasNodeType.Video, CanvasNodeType.Audio, CanvasNodeType.Text].includes(node.type as CanvasNodeType) ? t(`assets.kinds.${node.type}`) : getNodeDefinition(node.type)?.title || node.type} />
                            <InfoRow label={t("canvas.nodeToolbar.size")} value={`${Math.round(node.width)} x ${Math.round(node.height)}`} />
                            <InfoRow label={t("canvas.nodeToolbar.position")} value={`${Math.round(node.position.x)}, ${Math.round(node.position.y)}`} />
                            <InfoRow label={t("canvas.nodeToolbar.status")} value={node.metadata?.status || "idle"} />
                            {batchCount > 1 ? <InfoRow label={t("canvas.nodeToolbar.imageGroup")} value={t("canvas.configNode.images", { count: batchCount })} /> : null}
                            {node.metadata?.prompt ? <InfoRow label={t("canvas.configNode.prompt")} value={node.metadata.prompt} /> : null}
                            {node.metadata?.videoTaskId ? <InfoRow label={t("canvas.nodeToolbar.videoTaskId")} value={node.metadata.videoTaskId} /> : null}
                            {imageBytes ? <InfoRow label={t("canvas.nodeToolbar.imageSize")} value={formatBytes(imageBytes)} /> : null}
                            {node.metadata?.errorDetails ? (
                                <div className="rounded-lg border p-3 text-red-400" style={{ borderColor: theme.node.stroke }}>
                                    {node.metadata.errorDetails}
                                </div>
                            ) : null}
                        </div>
                    ) : (
                        <pre className="thin-scrollbar h-full overflow-auto rounded-lg border p-3 text-xs leading-5" style={{ background: theme.toolbar.panel, borderColor: theme.node.stroke, color: theme.node.text }}>
                            {json}
                        </pre>
                    )}
                </div>
            ) : null}
        </Modal>
    );
}

function InfoRow({ label, value }: { label: string; value: ReactNode }) {
    return (
        <div className="grid grid-cols-[72px_minmax(0,1fr)] gap-3">
            <span className="opacity-50">{label}</span>
            <span className="min-w-0 whitespace-pre-wrap break-words">{value}</span>
        </div>
    );
}
