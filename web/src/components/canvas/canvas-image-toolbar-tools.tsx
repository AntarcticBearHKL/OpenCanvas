import type { ReactNode } from "react";
import { Brush, Camera, Copy, Eraser, Grid2x2, Lock, LockOpen, MousePointer2, ScanSearch, ScanText, Scissors, ZoomIn } from "lucide-react";

import type { CanvasNodeData } from "@/types/canvas";
import i18n from "@/i18n";

type ImageNodeActionToolId = "resize" | "maskEdit" | "crop" | "removeBackground" | "split" | "resolution" | "analyze" | "ocr" | "segment" | "angle" | "duplicate";
export type ImageQuickToolId = "info" | "delete" | "saveAsset" | "download" | ImageNodeActionToolId;

type ImageToolHandlers = {
    onUpload: (node: CanvasNodeData) => void;
    onToggleFreeResize: (node: CanvasNodeData) => void;
    onMaskEdit: (node: CanvasNodeData) => void;
    onCrop: (node: CanvasNodeData) => void;
    onRemoveBackground: (node: CanvasNodeData) => void;
    onSplit: (node: CanvasNodeData) => void;
    onResolution: (node: CanvasNodeData) => void;
    onAnalyze: (node: CanvasNodeData) => void;
    onOcr: (node: CanvasNodeData) => void;
    onSegment: (node: CanvasNodeData) => void;
    onAngle: (node: CanvasNodeData) => void;
    onDuplicate: (node: CanvasNodeData) => void;
};

type ImageToolDefinition = {
    id: ImageNodeActionToolId;
    defaultVisible: boolean;
    label: string | ((node: CanvasNodeData) => string);
    title: string | ((node: CanvasNodeData) => string);
    icon: (node: CanvasNodeData) => ReactNode;
    active?: (node: CanvasNodeData) => boolean;
    run: (node: CanvasNodeData, handlers: ImageToolHandlers) => void;
};

type ImageQuickToolsConfig = {
    ids: ImageQuickToolId[];
    showLabels: boolean;
};

export const IMAGE_QUICK_TOOLS_STORAGE_KEY = "canvas-image-quick-tools-v14";

const defaultBaseToolIds: ImageQuickToolId[] = ["info", "delete", "saveAsset", "download"];

const imageToolDefinitions: ImageToolDefinition[] = [
    {
        id: "resize",
        defaultVisible: false,
        label: (node) => i18n.t(node.metadata?.freeResize ? "canvas.imageTools.free" : "canvas.imageTools.locked"),
        title: (node) => i18n.t(node.metadata?.freeResize ? "canvas.imageTools.lockTitle" : "canvas.imageTools.freeTitle"),
        icon: (node) => (node.metadata?.freeResize ? <LockOpen className="size-4" /> : <Lock className="size-4" />),
        active: (node) => Boolean(node.metadata?.freeResize),
        run: (node, handlers) => handlers.onToggleFreeResize(node),
    },
    {
        id: "maskEdit",
        defaultVisible: true,
        label: () => i18n.t("canvas.imageTools.mask"),
        title: () => i18n.t("canvas.imageTools.maskTitle"),
        icon: () => <Brush className="size-4" />,
        run: (node, handlers) => handlers.onMaskEdit(node),
    },
    {
        id: "crop",
        defaultVisible: true,
        label: () => i18n.t("canvas.imageTools.crop"),
        title: () => i18n.t("canvas.imageTools.cropTitle"),
        icon: () => <Scissors className="size-4" />,
        run: (node, handlers) => handlers.onCrop(node),
    },
    {
        id: "removeBackground",
        defaultVisible: true,
        label: () => i18n.t("canvas.imageTools.removeBackground"),
        title: () => i18n.t("canvas.imageTools.removeBackgroundTitle"),
        icon: () => <Eraser className="size-4" />,
        run: (node, handlers) => handlers.onRemoveBackground(node),
    },
    {
        id: "split",
        defaultVisible: true,
        label: () => i18n.t("canvas.imageTools.split"),
        title: () => i18n.t("canvas.imageTools.splitTitle"),
        icon: () => <Grid2x2 className="size-4" />,
        run: (node, handlers) => handlers.onSplit(node),
    },
    {
        id: "resolution",
        defaultVisible: true,
        label: () => i18n.t("canvas.imageTools.resolution"),
        title: () => i18n.t("canvas.imageTools.resolutionTitle"),
        icon: () => <ZoomIn className="size-4" />,
        run: (node, handlers) => handlers.onResolution(node),
    },
    {
        id: "analyze",
        defaultVisible: true,
        label: () => i18n.t("canvas.imageTools.analyze"),
        title: () => i18n.t("canvas.imageTools.analyzeTitle"),
        icon: () => <ScanSearch className="size-4" />,
        run: (node, handlers) => handlers.onAnalyze(node),
    },
    {
        id: "ocr",
        defaultVisible: true,
        label: () => i18n.t("canvas.imageTools.ocr"),
        title: () => i18n.t("canvas.imageTools.ocrTitle"),
        icon: () => <ScanText className="size-4" />,
        run: (node, handlers) => handlers.onOcr(node),
    },
    {
        id: "segment",
        defaultVisible: true,
        label: () => i18n.t("canvas.imageTools.segment"),
        title: () => i18n.t("canvas.imageTools.segmentTitle"),
        icon: () => <MousePointer2 className="size-4" />,
        run: (node, handlers) => handlers.onSegment(node),
    },
    {
        id: "angle",
        defaultVisible: false,
        label: () => i18n.t("canvas.imageTools.angle"),
        title: () => i18n.t("canvas.imageTools.angleTitle"),
        icon: () => <Camera className="size-4" />,
        run: (node, handlers) => handlers.onAngle(node),
    },
    {
        id: "duplicate",
        defaultVisible: true,
        label: () => i18n.t("canvas.controls.duplicate"),
        title: () => i18n.t("canvas.nodeToolbar.duplicateTitle"),
        icon: () => <Copy className="size-4" />,
        run: (node, handlers) => handlers.onDuplicate(node),
    },
];

export const defaultImageQuickToolIds: ImageQuickToolId[] = [...defaultBaseToolIds, ...imageToolDefinitions.filter((tool) => tool.defaultVisible).map((tool) => tool.id)];

export function buildImageToolbarTools(node: CanvasNodeData, handlers: ImageToolHandlers) {
    return imageToolDefinitions.map((tool) => ({
        id: tool.id,
        label: resolveToolText(tool.label, node),
        title: resolveToolText(tool.title, node),
        icon: tool.icon(node),
        active: tool.active?.(node),
        onClick: () => tool.run(node, handlers),
    }));
}

function normalizeImageQuickToolIds(value: unknown[]) {
    const allIds: ImageQuickToolId[] = [...defaultBaseToolIds, ...imageToolDefinitions.map((tool) => tool.id)];
    const ids = new Set(allIds);
    return allIds.filter((id) => value.includes(id) && ids.has(id));
}

export function readImageQuickToolsConfig(value: unknown): ImageQuickToolsConfig {
    if (Array.isArray(value)) return { ids: normalizeImageQuickToolIds(value), showLabels: false };
    if (!value || typeof value !== "object") return { ids: defaultImageQuickToolIds, showLabels: false };
    const data = value as Partial<ImageQuickToolsConfig>;
    return {
        ids: Array.isArray(data.ids) ? normalizeImageQuickToolIds(data.ids) : defaultImageQuickToolIds,
        showLabels: data.showLabels === true,
    };
}

function resolveToolText(value: string | ((node: CanvasNodeData) => string), node: CanvasNodeData) {
    return typeof value === "function" ? value(node) : value;
}
