import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { ChevronRight, ClipboardCopy, Copy, Download, Image as ImageIcon, Info, Lock, Puzzle, RefreshCw, Sparkles, Star, Trash2, Video } from "lucide-react";

import { App } from "antd";

import { canvasThemes, type CanvasTheme } from "@/lib/canvas-theme";
import { isCanvasOverlayTarget } from "@/lib/canvas/canvas-overlays";
import { useCanvasTheme } from "@/hooks/use-canvas-theme";
import { formatBytes } from "@/lib/image-utils";
import { copyImageToClipboard } from "@/lib/clipboard-image";
import { formatAudioTime } from "@/lib/canvas/audio-waveform";
import { formatUsd } from "@/lib/canvas/generation-cost";
import { useGenerationCostStore } from "@/stores/use-generation-cost-store";
import { ensureThumbnailUrl } from "@/services/image-storage";
import { getNodeDefinition } from "@/lib/canvas/node-registry";
import { resolveTextStyle, textStyleToCss } from "@/lib/canvas/text-style";
import { buildNodeContext } from "@/lib/canvas/plugin-node-context";
import { CanvasResourceMentionTextarea } from "./canvas-resource-mention-textarea";
import { AudioProjectNodeContent } from "./nodes/builtin-nodes";
import { SmartCanvasNodeContent } from "./smart-canvas-node";
import { AudioNodeContent } from "./nodes/audio-node-content";
import { PromptContent } from "./nodes/prompt-node-content";
import { CanvasNodeType, type CanvasNodeData, type CanvasNodeImage, type CanvasNodeText, type CanvasVideoSlot, type Position } from "@/types/canvas";
import type { CanvasNodeContext, CanvasPluginHost } from "@/types/canvas-plugin";
import type { CanvasResourceReference } from "@/lib/canvas/canvas-resource-references";
import { useTranslation } from "react-i18next";

type ResizeCorner = "top-left" | "top-right" | "bottom-left" | "bottom-right";
export const selectionBlue = "#2f80ff";

const panelButtonStyle = (theme: CanvasTheme, color: string) => ({ background: theme.toolbar.panel, borderColor: theme.toolbar.border, color });
const EMPTY_NODES: CanvasNodeData[] = [];
const batchToggleButtonClass = "absolute right-2.5 top-2.5 z-30 flex h-8 items-center justify-center gap-1.5 rounded-md border px-3 text-sm font-semibold backdrop-blur-md transition hover:scale-[1.02]";
const expandedImageActionClass = "flex h-8 min-w-0 flex-1 items-center justify-center gap-1 rounded-md border px-1.5 text-sm font-medium backdrop-blur-md transition hover:scale-[1.02]";
const expandedImageIconClass = "grid h-8 w-8 shrink-0 place-items-center rounded-md border backdrop-blur-md transition hover:scale-[1.02]";

type CanvasNodeProps = {
    data: CanvasNodeData;
    scale: number;
    previewPosition?: Position;
    dragDimmed?: boolean;
    isSelected: boolean;
    isRelated: boolean;
    isFocusRelated: boolean;
    isConnectionTarget: boolean;
    isConnecting: boolean;
    showPanel: boolean;
    mentionReferences?: CanvasResourceReference[];
    pluginHost?: CanvasPluginHost;
    registryVersion?: number;
    renderPanel?: (node: CanvasNodeData) => ReactNode;
    renderNodeContent?: (node: CanvasNodeData, dropSlot?: CanvasVideoSlot | null) => ReactNode;
    isBoardDropTarget?: boolean;
    isAssetsDropTarget?: boolean;
    videoSlotDropTarget?: { nodeId: string; slot: CanvasVideoSlot } | null;
    returnFrom?: Position | null;
    nodes?: CanvasNodeData[];
    batchExpanded?: boolean;
    onMouseDown: (event: React.MouseEvent, nodeId: string) => void;
    onSelectCapture?: (event: React.MouseEvent, nodeId: string) => void;
    onHoverStart: (nodeId: string) => void;
    onHoverEnd: (nodeId: string) => void;
    onConnectStart: (event: React.MouseEvent, nodeId: string, handleType: "source" | "target") => void;
    onResizeStart: (nodeId: string) => void;
    onResize: (nodeId: string, width: number, height: number, position?: Position) => void;
    onResizeEnd: (nodeId: string) => void;
    onContentChange: (nodeId: string, content: string) => void;
    onTitleChange: (nodeId: string, title: string) => void;
    onToggleBatch?: (nodeId: string) => void;
    onSetBatchPrimary?: (nodeId: string, itemId: string) => void;
    onDuplicateBatchImage?: (node: CanvasNodeData, imageId: string) => void;
    onDownloadBatchImage?: (node: CanvasNodeData, imageId: string) => void;
    onRetryBatchImage?: (node: CanvasNodeData, imageId: string) => void;
    onDeleteBatchImage?: (nodeId: string, imageId: string) => void;
    onRetry?: (node: CanvasNodeData) => void;
    onViewImage?: (node: CanvasNodeData, imageId?: string) => void;
    onInfo?: (node: CanvasNodeData) => void;
    onBoardPreview?: (node: CanvasNodeData) => void;
};

type NodeContentRendererProps = {
    node: CanvasNodeData;
    theme: (typeof canvasThemes)[keyof typeof canvasThemes];
    isEditingContent: boolean;
    textareaRef: React.RefObject<HTMLTextAreaElement | null>;
    isBatchRoot: boolean;
    batchCount: number;
    batchExpanded: boolean;
    renderNodeContent?: (node: CanvasNodeData, dropSlot?: CanvasVideoSlot | null) => ReactNode;
    videoSlotDropTarget?: { nodeId: string; slot: CanvasVideoSlot } | null;
    pluginContext?: CanvasNodeContext | null;
    onContentChange: (nodeId: string, content: string) => void;
    onStopEditing: () => void;
    mentionReferences: CanvasResourceReference[];
    onRetry?: (node: CanvasNodeData) => void;
    onToggleBatch?: () => void;
    onSetBatchPrimary?: (itemId: string) => void;
    onDuplicateBatchImage?: (imageId: string) => void;
    onDownloadBatchImage?: (imageId: string) => void;
    onRetryBatchImage?: (imageId: string) => void;
    onDeleteBatchImage?: (imageId: string) => void;
    onViewBatchImage?: (imageId: string) => void;
    nodes?: CanvasNodeData[];
};

export const CanvasNode = React.memo(function CanvasNode({
    data,
    scale,
    previewPosition,
    dragDimmed = false,
    isSelected,
    isRelated,
    isFocusRelated,
    isConnectionTarget,
    isConnecting,
    showPanel,
    mentionReferences = [],
    pluginHost,
    renderPanel,
    renderNodeContent,
    isBoardDropTarget = false,
    isAssetsDropTarget = false,
    videoSlotDropTarget = null,
    returnFrom,
    nodes = EMPTY_NODES,
    batchExpanded = false,
    onMouseDown,
    onSelectCapture,
    onHoverStart,
    onHoverEnd,
    onConnectStart,
    onResizeStart,
    onResize,
    onResizeEnd,
    onContentChange,
    onTitleChange,
    onToggleBatch,
    onSetBatchPrimary,
    onDuplicateBatchImage,
    onDownloadBatchImage,
    onRetryBatchImage,
    onDeleteBatchImage,
    onRetry,
    onViewImage,
    onInfo,
    onBoardPreview,
}: CanvasNodeProps) {
    const theme = useCanvasTheme();
    const { t } = useTranslation();
    const [hovered, setHovered] = useState(false);
    const definition = getNodeDefinition(data.type);
    const pluginContext = useMemo<CanvasNodeContext | null>(() => (pluginHost ? buildNodeContext(pluginHost, data, theme, scale, isSelected) : null), [pluginHost, data, theme, scale, isSelected]);
    const [isEditingContent, setIsEditingContent] = useState(false);
    const [isEditingTitle, setIsEditingTitle] = useState(false);
    const [titleDraft, setTitleDraft] = useState(data.title || "");
    const hasImageContent = data.type === CanvasNodeType.Image && Boolean(data.metadata?.content);
    const hasVideoContent = data.type === CanvasNodeType.Video && Boolean(data.metadata?.content);
    const hasAudioContent = data.type === CanvasNodeType.Audio && Boolean(data.metadata?.content);
    const isBoard = data.type === CanvasNodeType.SmartCanvas;
    const isVideoSlotDropTarget = data.type === CanvasNodeType.VideoPrompt && videoSlotDropTarget?.nodeId === data.id;
    const isNodeDropTarget = ((data.type === CanvasNodeType.Assets || data.type === CanvasNodeType.ImageModifier || data.type === CanvasNodeType.AudioProject) && isAssetsDropTarget) || isVideoSlotDropTarget;
    const locked = Boolean(data.metadata?.locked);
    const [enteredImage, setEnteredImage] = useState(false);
    const previousStatusRef = useRef(data.metadata?.status);
    useEffect(() => {
        const previous = previousStatusRef.current;
        previousStatusRef.current = data.metadata?.status;
        if (!data.metadata?.generationType || previous !== "loading" || data.metadata?.status !== "success") return;
        setEnteredImage(true);
        const timer = window.setTimeout(() => setEnteredImage(false), 460);
        return () => window.clearTimeout(timer);
    }, [data.metadata?.generationType, data.metadata?.status]);
    const batchCount = data.type === CanvasNodeType.Image ? data.metadata?.images?.length || 0 : data.type === CanvasNodeType.Text ? data.metadata?.texts?.length || 0 : 0;
    const isBatchRoot = batchCount > 1;
    // Nodes with the interaction/move toggle ignore content pointer events in move mode and allow interaction in interactive mode.
    // forceInteractive states such as editing stay interactive, as do empty nodes so their upload and generation actions remain usable.
    const supportsInteractionToggle = Boolean(definition?.interactionToggle);
    const forceInteractive = supportsInteractionToggle ? Boolean(definition?.forceInteractive?.(data)) : false;
    const contentInteractive = locked ? false : !supportsInteractionToggle || forceInteractive || !data.metadata?.content ? true : Boolean(data.metadata?.interactive);
    // Transparent nodes such as SVGs blend into the canvas while retaining outlines for selected or related states.
    const transparentBg = Boolean(definition?.transparentBackground);
    const frostedCard = !hasImageContent && !hasVideoContent && !transparentBg;
    const isActive = isConnectionTarget || isSelected || isFocusRelated;
    const imageBorderColor = isActive ? selectionBlue : isRelated ? theme.node.muted : "transparent";
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const titleInputRef = useRef<HTMLInputElement>(null);
    const resizeRef = useRef({
        isResizing: false,
        corner: "bottom-right" as ResizeCorner,
        startX: 0,
        startY: 0,
        startLeft: 0,
        startTop: 0,
        startWidth: 0,
        startHeight: 0,
        keepRatio: false,
        ratio: 1,
    });

    useEffect(() => {
        setTitleDraft(data.title || "");
    }, [data.title]);

    useEffect(() => {
        if (!isEditingTitle) return;
        titleInputRef.current?.focus();
        titleInputRef.current?.select();
    }, [isEditingTitle]);

    const finishTitleEditing = useCallback(() => {
        const title = titleDraft.trim() || data.title || t("canvas.node.untitled");
        setTitleDraft(title);
        setIsEditingTitle(false);
        if (title !== data.title) onTitleChange(data.id, title);
    }, [data.id, data.title, onTitleChange, t, titleDraft]);

    useEffect(() => {
        if (!isEditingTitle) return;
        const handleOutsidePointerDown = (event: PointerEvent) => {
            const target = event.target;
            if (target instanceof Node && titleInputRef.current?.contains(target)) return;
            finishTitleEditing();
        };
        window.addEventListener("pointerdown", handleOutsidePointerDown, true);
        return () => window.removeEventListener("pointerdown", handleOutsidePointerDown, true);
    }, [finishTitleEditing, isEditingTitle]);

    useEffect(() => {
        const textarea = textareaRef.current;
        if (!textarea) return;

        const handleWheel = (event: WheelEvent) => event.stopPropagation();
        textarea.addEventListener("wheel", handleWheel, { passive: false });
        return () => textarea.removeEventListener("wheel", handleWheel);
    }, [data.type, isEditingContent]);

    useEffect(() => {
        if (!isEditingContent) return;
        const textarea = textareaRef.current;
        textarea?.focus();
        textarea?.setSelectionRange(textarea.value.length, textarea.value.length);
    }, [isEditingContent]);

    useEffect(() => {
        if (!isEditingContent) return;

        const handleOutsidePointerDown = (event: PointerEvent) => {
            const target = event.target;
            if (!(target instanceof Node)) return;
            if (isEditingContent && textareaRef.current?.contains(target)) return;

            setIsEditingContent(false);
        };

        window.addEventListener("pointerdown", handleOutsidePointerDown, true);
        return () => window.removeEventListener("pointerdown", handleOutsidePointerDown, true);
    }, [isEditingContent]);

    const handleResizeMove = useCallback(
        (event: MouseEvent) => {
            if (!resizeRef.current.isResizing) return;

            const dx = (event.clientX - resizeRef.current.startX) / scale;
            const dy = (event.clientY - resizeRef.current.startY) / scale;
            const minWidth = 220;
            const minHeight = 160;
            const startRight = resizeRef.current.startLeft + resizeRef.current.startWidth;
            const startBottom = resizeRef.current.startTop + resizeRef.current.startHeight;
            const fromLeft = resizeRef.current.corner.includes("left");
            const fromTop = resizeRef.current.corner.includes("top");
            const rawWidth = Math.max(minWidth, resizeRef.current.startWidth + (fromLeft ? -dx : dx));
            const rawHeight = Math.max(minHeight, resizeRef.current.startHeight + (fromTop ? -dy : dy));
            let width = rawWidth;
            let height = rawHeight;
            if (resizeRef.current.keepRatio) {
                const ratio = resizeRef.current.ratio;
                if (Math.abs(dx) >= Math.abs(dy)) {
                    height = width / ratio;
                } else {
                    width = height * ratio;
                }
                if (height < minHeight) {
                    height = minHeight;
                    width = height * ratio;
                }
                if (width < minWidth) {
                    width = minWidth;
                    height = width / ratio;
                }
            }

            onResize(data.id, width, height, {
                x: fromLeft ? startRight - width : resizeRef.current.startLeft,
                y: fromTop ? startBottom - height : resizeRef.current.startTop,
            });
        },
        [data.id, onResize, scale],
    );

    const handleResizeUp = useCallback(() => {
        resizeRef.current.isResizing = false;
        window.removeEventListener("mousemove", handleResizeMove);
        window.removeEventListener("mouseup", handleResizeUp);
        onResizeEnd(data.id);
    }, [data.id, handleResizeMove, onResizeEnd]);

    const handleResizeMouseDown = (event: React.MouseEvent, corner: ResizeCorner) => {
        if (locked) return;
        event.stopPropagation();
        event.preventDefault();
        onResizeStart(data.id);
        resizeRef.current = {
            isResizing: true,
            corner,
            startX: event.clientX,
            startY: event.clientY,
            startLeft: data.position.x,
            startTop: data.position.y,
            startWidth: data.width,
            startHeight: data.height,
            keepRatio: (data.type === CanvasNodeType.Image && !data.metadata?.freeResize) || data.type === CanvasNodeType.Video || Boolean(definition?.keepAspectRatio?.(data)),
            ratio: (data.metadata?.naturalWidth || data.width) / (data.metadata?.naturalHeight || data.height || 1),
        };
        window.addEventListener("mousemove", handleResizeMove);
        window.addEventListener("mouseup", handleResizeUp);
    };

    useEffect(() => {
        return () => {
            window.removeEventListener("mousemove", handleResizeMove);
            window.removeEventListener("mouseup", handleResizeUp);
        };
    }, [handleResizeMove, handleResizeUp]);

    const renderedPosition = previewPosition ?? data.position;

    return (
        <div
            data-node-id={data.id}
            className={`node-element absolute flex select-none flex-col transition-shadow duration-200 ${dragDimmed ? "opacity-25" : ""} ${isBoard || data.type === CanvasNodeType.Config ? "z-[5]" : isSelected ? "z-50" : "z-10"} ${returnFrom ? "canvas-node-return" : ""}`}
            style={
                {
                    transform: `translate(${renderedPosition.x}px, ${renderedPosition.y}px)`,
                    width: data.width,
                    height: data.height,
                    transition: "box-shadow 200ms ease, opacity 160ms ease",
                    contain: "layout style",
                    "--node-return-from-x": returnFrom ? `${returnFrom.x}px` : undefined,
                    "--node-return-from-y": returnFrom ? `${returnFrom.y}px` : undefined,
                    "--node-return-to-x": `${renderedPosition.x}px`,
                    "--node-return-to-y": `${renderedPosition.y}px`,
                } as React.CSSProperties
            }
            onMouseEnter={() => {
                setHovered(true);
                onHoverStart(data.id);
            }}
            onMouseLeave={() => {
                setHovered(false);
                onHoverEnd(data.id);
            }}
            onMouseDownCapture={(event) => {
                if (isCanvasOverlayTarget(event.target)) return;
                onSelectCapture?.(event, data.id);
            }}
        >
            {!hasImageContent && !hasAudioContent && (
                <div className="absolute left-3 top-[-28px] z-[65] max-w-[calc(100%-24px)]" onMouseDown={(event) => event.stopPropagation()} onPointerDown={(event) => event.stopPropagation()}>
                    {isEditingTitle ? (
                        <input
                            ref={titleInputRef}
                            value={titleDraft}
                            maxLength={64}
                            className="h-6 max-w-full border-0 border-b border-dashed bg-transparent px-0 text-left text-sm font-medium outline-none"
                            style={{ borderColor: theme.node.muted, color: theme.node.text }}
                            onChange={(event) => setTitleDraft(event.target.value)}
                            onBlur={finishTitleEditing}
                            onKeyDown={(event) => {
                                if (event.key === "Enter") finishTitleEditing();
                                if (event.key === "Escape") {
                                    setTitleDraft(data.title || "");
                                    setIsEditingTitle(false);
                                }
                            }}
                        />
                    ) : (
                        <button
                            type="button"
                            className="block max-w-full truncate border-b border-dashed border-transparent px-0 py-0.5 text-left text-sm font-medium transition hover:border-current hover:opacity-100"
                            style={{ color: theme.node.text }}
                            title={t("canvas.node.renameHint")}
                            onDoubleClick={(event) => {
                                event.stopPropagation();
                                if (!locked) setIsEditingTitle(true);
                            }}
                        >
                            {data.title || t("canvas.node.untitled")}
                        </button>
                    )}
                </div>
            )}

            <div
                className={`relative h-full w-full overflow-visible rounded-3xl ${isBoard ? "border-0" : "border-2"} ${frostedCard ? "canvas-glass-card glass-card" : ""} ${enteredImage ? "canvas-node-enter" : ""}`}
                style={{
                    borderColor: hasImageContent ? imageBorderColor : isNodeDropTarget ? selectionBlue : isActive ? selectionBlue : isRelated ? theme.node.muted : "transparent",
                    borderStyle: "solid",
                    outline: isBoard ? (isBoardDropTarget ? `2px solid ${selectionBlue}66` : isActive ? `2px solid ${selectionBlue}` : undefined) : isNodeDropTarget ? `2px solid ${selectionBlue}66` : undefined,
                    outlineOffset: (isBoard && isBoardDropTarget) || isNodeDropTarget ? 2 : undefined,
                    boxShadow: isActive ? `0 0 0 1px ${selectionBlue}55` : isRelated ? `0 0 0 1px ${theme.node.muted}55` : undefined,
                }}
                onMouseDown={(event) => {
                    if (isCanvasOverlayTarget(event.target)) return;
                    onMouseDown(event, data.id);
                }}
                onDoubleClick={(event) => {
                    if (isCanvasOverlayTarget(event.target)) return;
                    if (locked) return;
                    if (isBoard && onBoardPreview) {
                        event.stopPropagation();
                        onBoardPreview(data);
                        return;
                    }
                    if (definition?.onDoubleClick && pluginContext) {
                        if (definition.onDoubleClick(pluginContext)) event.stopPropagation();
                        return;
                    }
                    if (data.type === CanvasNodeType.Image && hasImageContent) {
                        event.stopPropagation();
                        onViewImage?.(data);
                        return;
                    }
                    if (data.type !== CanvasNodeType.Text) return;
                    event.stopPropagation();
                    setIsEditingContent(true);
                }}
            >
                <div
                    className={`relative flex h-full w-full items-center justify-center rounded-[inherit] ${isBatchRoot ? "overflow-visible" : "overflow-hidden"}`}
                    style={
                        {
                            pointerEvents: contentInteractive ? undefined : "none",
                        } as React.CSSProperties
                    }
                >
                    <NodeContent
                        node={data}
                        theme={theme}
                        isEditingContent={isEditingContent}
                        textareaRef={textareaRef}
                        isBatchRoot={isBatchRoot}
                        batchCount={batchCount}
                        batchExpanded={batchExpanded}
                        renderNodeContent={renderNodeContent}
                        videoSlotDropTarget={videoSlotDropTarget}
                        pluginContext={pluginContext}
                        mentionReferences={mentionReferences}
                        nodes={nodes}
                        onContentChange={onContentChange}
                        onStopEditing={() => setIsEditingContent(false)}
                        onRetry={onRetry}
                        onToggleBatch={() => onToggleBatch?.(data.id)}
                        onSetBatchPrimary={(itemId) => onSetBatchPrimary?.(data.id, itemId)}
                        onDuplicateBatchImage={(imageId) => onDuplicateBatchImage?.(data, imageId)}
                        onDownloadBatchImage={(imageId) => onDownloadBatchImage?.(data, imageId)}
                        onRetryBatchImage={(imageId) => onRetryBatchImage?.(data, imageId)}
                        onDeleteBatchImage={(imageId) => onDeleteBatchImage?.(data.id, imageId)}
                        onViewBatchImage={(imageId) => onViewImage?.(data, imageId)}
                    />
                </div>

                {locked ? (
                    <div className="pointer-events-none absolute bottom-2 left-2 z-40 flex items-center rounded-md px-1.5 py-0.5 backdrop-blur-md" style={{ background: theme.toolbar.panel, color: theme.node.muted }}>
                        <Lock className="size-3" />
                    </div>
                ) : null}

                {hasImageContent || hasAudioContent ? (
                    <MediaInfoBar node={data} onInfo={onInfo} />
                ) : null}

                {!hasImageContent && !hasVideoContent && !hasAudioContent ? <div className="pointer-events-none absolute inset-x-0 bottom-0 h-12" style={{ background: `linear-gradient(to top, ${theme.canvas.background}66, transparent)` }} /> : null}

                {!locked ? <ResizeHandle corner="top-left" onMouseDown={handleResizeMouseDown} /> : null}
                {!locked ? <ResizeHandle corner="top-right" onMouseDown={handleResizeMouseDown} /> : null}
                {!locked ? <ResizeHandle corner="bottom-left" onMouseDown={handleResizeMouseDown} /> : null}
                {!locked ? <ResizeHandle corner="bottom-right" onMouseDown={handleResizeMouseDown} /> : null}
                {!locked ? <ResizeGrip active={hovered || isSelected} onMouseDown={handleResizeMouseDown} /> : null}
            </div>

            {data.type !== CanvasNodeType.Image && data.type !== CanvasNodeType.Recording ? <ConnectionHandleDot side="left" visible={hovered || isSelected || isConnecting} onMouseDown={(event) => onConnectStart(event, data.id, "target")} /> : null}
            {(definition?.hasSourceHandle ?? true) && data.type !== CanvasNodeType.Config ? <ConnectionHandleDot side="right" visible={hovered || isSelected || isConnecting} onMouseDown={(event) => onConnectStart(event, data.id, "source")} /> : null}

            {showPanel && renderPanel ? <div className="absolute left-1/2 top-full z-[70] w-[600px] -translate-x-1/2 pt-4">{renderPanel(data)}</div> : null}
        </div>
    );
});

function NodeContent(props: NodeContentRendererProps) {
    const dropSlot = props.videoSlotDropTarget && props.videoSlotDropTarget.nodeId === props.node.id ? props.videoSlotDropTarget.slot : null;
    if ((props.node.type === CanvasNodeType.Config || props.node.type === CanvasNodeType.ImageGeneration || props.node.type === CanvasNodeType.SpeechGeneration || props.node.type === CanvasNodeType.MusicGeneration || props.node.type === CanvasNodeType.VideoGeneration || props.node.type === CanvasNodeType.Prompt || props.node.type === CanvasNodeType.MusicPrompt || props.node.type === CanvasNodeType.SpeechPrompt || props.node.type === CanvasNodeType.VideoPrompt || props.node.type === CanvasNodeType.Assets || props.node.type === CanvasNodeType.Recording || props.node.type === CanvasNodeType.ImageModifier) && props.renderNodeContent) return props.renderNodeContent(props.node, dropSlot);
    if (props.isBatchRoot && props.node.type === CanvasNodeType.Image) return <ImageNodeContent {...props} />;
    if (props.node.type === CanvasNodeType.Text && props.node.metadata?.texts?.length && (props.node.metadata.status !== "error" || props.node.metadata.texts.some((text) => text.content))) return <TextContent {...props} />;
    if (props.node.metadata?.status === "loading") return <LoadingContent theme={props.theme} />;
    if (props.node.metadata?.status === "error") return <ErrorContent node={props.node} theme={props.theme} onRetry={props.onRetry} />;

    const Renderer = nodeContentRenderers[props.node.type as CanvasNodeType];
    if (Renderer) return <Renderer {...props} />;

    // Render plugin nodes with their registered renderer, or show the missing-plugin placeholder.
    const definition = getNodeDefinition(props.node.type);
    if (definition?.Content && props.pluginContext) {
        const PluginContent = definition.Content;
        return <PluginContent ctx={props.pluginContext} />;
    }
    return <MissingPluginContent theme={props.theme} type={props.node.type} />;
}

const nodeContentRenderers: Partial<Record<CanvasNodeType, (props: NodeContentRendererProps) => ReactNode>> = {
    [CanvasNodeType.Text]: TextContent,
    [CanvasNodeType.Prompt]: PromptContent,
    [CanvasNodeType.Image]: ImageNodeContent,
    [CanvasNodeType.Config]: EmptyImageContent,
    [CanvasNodeType.ImageGeneration]: ImageGenerationContent,
    [CanvasNodeType.Video]: VideoNodeContent,
    [CanvasNodeType.Audio]: AudioNodeContent,
    [CanvasNodeType.AudioProject]: AudioProjectNodeContent,
    [CanvasNodeType.SmartCanvas]: SmartCanvasNodeContent,
};

function LoadingContent({ theme }: Pick<NodeContentRendererProps, "theme">) {
    const { t } = useTranslation();
    return (
        <div className="flex h-full w-full flex-col items-center justify-center gap-3" style={{ color: theme.node.accent }}>
            <div className="size-10 animate-spin rounded-full border-2" style={{ borderColor: theme.node.stroke, borderTopColor: theme.node.accent }} />
            <span className="text-sm font-medium tracking-[0.2em]">{t("canvas.node.generating")}</span>
        </div>
    );
}

function ErrorContent({ node, theme, onRetry }: Pick<NodeContentRendererProps, "node" | "theme" | "onRetry">) {
    const { t } = useTranslation();
    return (
        <div className="flex max-w-[260px] flex-col items-center gap-3 px-5 text-center">
            <div className="text-sm leading-5" style={{ color: theme.node.danger }}>{node.metadata?.errorDetails || t("canvas.node.failed")}</div>
            <button
                type="button"
                className="inline-flex h-8 items-center gap-1.5 rounded-md border px-3 text-sm font-medium transition hover:scale-[1.02]"
                style={panelButtonStyle(theme, theme.node.text)}
                onClick={(event) => {
                    event.stopPropagation();
                    onRetry?.(node);
                }}
                onMouseDown={(event) => event.stopPropagation()}
            >
                <RefreshCw className="size-3.5" />
                {t("canvas.node.retry")}
            </button>
        </div>
    );
}

function MissingPluginContent({ theme, type }: Pick<NodeContentRendererProps, "theme"> & { type: string }) {
    const { t } = useTranslation();
    return (
        <div className="flex h-full w-full flex-col items-center justify-center gap-2 px-4 text-center" style={{ color: theme.node.muted }}>
            <Puzzle className="size-7" />
            <span className="text-sm font-medium" style={{ color: theme.node.text }}>{t("canvas.node.missingPlugin")}</span>
            <span className="text-sm" style={{ color: theme.node.muted }}>{t("canvas.node.missingPluginDescription", { type })}</span>
        </div>
    );
}

function TextContent({ node, theme, isEditingContent, textareaRef, mentionReferences, batchExpanded, onContentChange, onStopEditing, onToggleBatch, onSetBatchPrimary }: NodeContentRendererProps) {
    const { t } = useTranslation();
    const resolvedTextStyle = resolveTextStyle(node.metadata);
    const textStyle = { ...textStyleToCss(resolvedTextStyle), color: resolvedTextStyle.color || theme.node.text, boxSizing: "border-box" } as React.CSSProperties;
    const texts = node.metadata?.texts || [];
    const batchCount = texts.length;
    const isBatchRoot = batchCount > 1;
    const primaryTextId = node.metadata?.primaryTextId || texts[0]?.id;
    const primaryText = texts.find((text) => text.id === primaryTextId);
    const content = primaryText?.content || node.metadata?.content || "";
    const paddingClass = isBatchRoot ? "px-4 pb-4 pt-14" : "p-4";

    return (
        <BatchFrame batchCount={batchCount} batchExpanded={batchExpanded}>
            {batchExpanded
                ? texts
                      .filter((text) => text.id !== primaryTextId)
                      .map((text, index) => <ExpandedTextCard key={text.id} node={node} text={text} index={index} onSetPrimary={() => onSetBatchPrimary?.(text.id)} />)
                : null}
            <div className="flex h-full w-full flex-col overflow-hidden">
                {isEditingContent ? (
                    <CanvasResourceMentionTextarea
                        ref={textareaRef}
                        className={`thin-scrollbar block h-full w-full resize-none overflow-y-auto whitespace-pre-wrap break-words border-none bg-transparent m-0 font-mono outline-none select-text appearance-none ${paddingClass}`}
                        style={textStyle}
                        value={content}
                        references={mentionReferences}
                        highlightLabels={false}
                        onChange={(value) => onContentChange(node.id, value)}
                        onBlur={onStopEditing}
                        onKeyDown={(event) => {
                            if (event.key === "Escape") onStopEditing();
                        }}
                        onMouseDown={(event) => event.stopPropagation()}
                        onPointerDown={(event) => event.stopPropagation()}
                        onWheel={(event) => event.stopPropagation()}
                    />
                ) : content ? (
                    <div className={`thin-scrollbar block h-full w-full overflow-y-auto whitespace-pre-wrap break-words bg-transparent font-mono ${paddingClass}`} style={textStyle} onWheel={(event) => event.stopPropagation()}>
                        {content}
                    </div>
                ) : primaryText ? (
                    <TextSlotStatus text={primaryText} />
                ) : (
                    <div className="p-4 font-mono" style={{ color: theme.node.placeholder }}>
                        {t("canvas.node.editText")}
                    </div>
                )}
            </div>
            {isBatchRoot ? (
                <button
                    type="button"
                    className={batchToggleButtonClass}
                    style={panelButtonStyle(theme, theme.toolbar.activeText)}
                    aria-label={batchExpanded ? t("canvas.node.textBatchExpanded") : t("canvas.node.textBatchCollapsed")}
                    onClick={(event) => {
                        event.stopPropagation();
                        onToggleBatch?.();
                    }}
                    onMouseDown={(event) => event.stopPropagation()}
                    onPointerDown={(event) => event.stopPropagation()}
                >
                    <span className="leading-none">{t("canvas.controls.texts", { count: batchCount })}</span>
                    <ChevronRight className={`size-3.5 opacity-80 transition-transform ${batchExpanded ? "rotate-90" : ""}`} />
                </button>
            ) : null}
        </BatchFrame>
    );
}

function ExpandedTextCard({ node, text, index, onSetPrimary }: { node: CanvasNodeData; text: CanvasNodeText; index: number; onSetPrimary: () => void }) {
    const theme = useCanvasTheme();
    const { t } = useTranslation();
    const count = node.metadata?.texts?.length || 0;
    const columns = Math.min(count, 4);
    const rows = Math.ceil(count / columns);
    const rootSlot = (rows - 1) * columns;
    const slot = index >= rootSlot ? index + 1 : index;
    const x = (slot % columns) * (node.width + 18);
    const y = (Math.floor(slot / columns) - rows + 1) * (node.height + 18);

    return (
        <div
            className="absolute z-20 overflow-hidden border"
            style={
                {
                    left: x,
                    top: y,
                    width: node.width,
                    height: node.height,
                    background: theme.toolbar.panel,
                    borderColor: theme.node.stroke,
                    "--batch-from-x": `${-x}px`,
                    "--batch-from-y": `${-y}px`,
                    "--batch-from-rotate": `${4 + index * 2}deg`,
                    animation: `canvas-batch-child-in 320ms ${index * 35}ms cubic-bezier(.2,.85,.18,1) both`,
                } as React.CSSProperties
            }
            onMouseDown={(event) => event.stopPropagation()}
            onPointerDown={(event) => event.stopPropagation()}
        >
            {text.content ? (
                <>
                    <div className="thin-scrollbar h-full overflow-y-auto whitespace-pre-wrap break-words px-4 pb-4 pt-14 font-mono text-sm leading-6" style={{ color: theme.node.text }} onWheel={(event) => event.stopPropagation()}>
                        {text.content}
                    </div>
                    <button type="button" className="absolute right-2.5 top-2.5 flex h-8 items-center gap-1.5 rounded-md px-2.5 text-sm font-medium transition hover:bg-hover" style={{ color: theme.node.text }} onClick={(event) => (event.stopPropagation(), onSetPrimary())}>
                        <Star className="size-3.5" style={{ color: selectionBlue }} />
                        {t("canvas.node.setPrimaryText")}
                    </button>
                </>
            ) : (
                <TextSlotStatus text={text} />
            )}
        </div>
    );
}

function TextSlotStatus({ text }: { text: CanvasNodeText }) {
    const theme = useCanvasTheme();
    const { t } = useTranslation();
    const failed = text.status === "error";
    const loading = text.status === "loading";
    return (
        <div className="flex h-full w-full flex-col items-center justify-center gap-3 px-6 text-center" style={{ color: failed ? theme.node.text : theme.node.accent }}>
            {failed ? <span className="text-sm leading-5">{text.errorDetails || t("canvas.node.failed")}</span> : loading ? <div className="size-10 animate-spin rounded-full border-2" style={{ borderColor: theme.node.stroke, borderTopColor: theme.node.accent }} /> : <span className="text-sm">{t("apiErrors.noContent")}</span>}
            {loading ? <span className="text-sm font-medium tracking-[0.2em]">{t("canvas.node.generating")}</span> : null}
        </div>
    );
}

function ImageNodeContent(props: NodeContentRendererProps) {
    if (!props.node.metadata?.content && !props.isBatchRoot) return <EmptyImageContent {...props} />;

    return (
        <ImageContent
            node={props.node}
            batchExpanded={props.batchExpanded}
            onToggleBatch={props.onToggleBatch}
            onSetBatchPrimary={props.onSetBatchPrimary}
            onDuplicateBatchImage={props.onDuplicateBatchImage}
            onDownloadBatchImage={props.onDownloadBatchImage}
            onRetryBatchImage={props.onRetryBatchImage}
            onDeleteBatchImage={props.onDeleteBatchImage}
            onViewBatchImage={props.onViewBatchImage}
        />
    );
}

function EmptyImageContent({ theme }: NodeContentRendererProps) {
    const { t } = useTranslation();
    return (
        <div className="flex h-full w-full flex-col items-center justify-center gap-3" style={{ color: theme.node.placeholder }}>
            <div className="flex size-14 items-center justify-center">
                <ImageIcon className="size-6" style={{ color: theme.node.muted }} />
            </div>
            <span className="text-sm tracking-[0.18em]">{t("canvas.node.emptyImage")}</span>
        </div>
    );
}

function ImageGenerationContent({ theme }: NodeContentRendererProps) {
    const { t } = useTranslation();
    return (
        <div className="flex h-full w-full flex-col items-center justify-center gap-2.5 rounded-[inherit] border border-dashed px-6 text-center" style={{ borderColor: theme.node.stroke }}>
            <Sparkles className="size-6" style={{ color: theme.node.activeStroke }} />
            <span className="text-sm font-medium" style={{ color: theme.node.text }}>{t("canvas.nodeTypes.imageGeneration")}</span>
            <span className="text-sm" style={{ color: theme.node.muted }}>{t("canvas.node.imageGenerationHint")}</span>
        </div>
    );
}

function CanvasImage({ content, storageKey, thumbnail, alt, className, onDragStart }: { content: string; storageKey?: string; thumbnail?: string; alt: string; className: string; onDragStart?: (event: React.DragEvent<HTMLImageElement>) => void }) {
    const [src, setSrc] = useState(thumbnail || content);
    useEffect(() => {
        if (thumbnail) {
            setSrc(thumbnail);
            return;
        }
        setSrc(content);
        if (!storageKey) return;
        let active = true;
        void ensureThumbnailUrl(storageKey, content).then((url) => {
            if (active && url) setSrc(url);
        });
        return () => {
            active = false;
        };
    }, [content, storageKey, thumbnail]);
    return <img src={src} alt={alt} draggable={false} onDragStart={onDragStart} className={className} />;
}

function VideoNodeContent({ node, theme }: NodeContentRendererProps) {
    const { t } = useTranslation();
    if (!node.metadata?.content)
        return (
            <div className="flex h-full w-full flex-col items-center justify-center gap-3" style={{ color: theme.node.placeholder }}>
                <Video className="size-7" />
                <span className="text-sm">{t("canvas.node.emptyVideo")}</span>
            </div>
        );
    return <video src={node.metadata.content} controls className="h-full w-full bg-black object-contain" data-canvas-video={node.id} data-canvas-no-zoom />;
}

function ImageContent({
    node,
    batchExpanded,
    onToggleBatch,
    onSetBatchPrimary,
    onDuplicateBatchImage,
    onDownloadBatchImage,
    onRetryBatchImage,
    onDeleteBatchImage,
    onViewBatchImage,
}: {
    node: CanvasNodeData;
    batchExpanded: boolean;
    onToggleBatch?: () => void;
    onSetBatchPrimary?: (imageId: string) => void;
    onDuplicateBatchImage?: (imageId: string) => void;
    onDownloadBatchImage?: (imageId: string) => void;
    onRetryBatchImage?: (imageId: string) => void;
    onDeleteBatchImage?: (imageId: string) => void;
    onViewBatchImage?: (imageId: string) => void;
}) {
    const theme = useCanvasTheme();
    const { t } = useTranslation();
    const images = node.metadata?.images || [];
    const batchCount = images.length;
    const isBatchRoot = batchCount > 1;
    const primaryImageId = node.metadata?.primaryImageId || images[0]?.id;
    const primaryImage = images.find((image) => image.id === primaryImageId);
    const primaryContent = primaryImage?.content || node.metadata?.content;

    return (
        <BatchFrame batchCount={batchCount} batchExpanded={batchExpanded}>
            {batchExpanded
                ? images
                      .filter((image) => image.id !== primaryImageId)
                      .map((image, index) => <ExpandedImageCard key={image.id} node={node} image={image} index={index} onView={() => onViewBatchImage?.(image.id)} onSetPrimary={() => onSetBatchPrimary?.(image.id)} onDuplicate={() => onDuplicateBatchImage?.(image.id)} onDownload={() => onDownloadBatchImage?.(image.id)} onRetry={() => onRetryBatchImage?.(image.id)} onDelete={() => onDeleteBatchImage?.(image.id)} />)
                : null}
            <div className="h-full w-full overflow-hidden">
                {primaryContent ? (
                    <CanvasImage
                        content={primaryContent}
                        storageKey={node.metadata?.storageKey}
                        thumbnail={node.metadata?.thumbnail}
                        alt={node.title}
                        className={`pointer-events-none block h-full w-full select-none ${node.metadata?.freeResize ? "object-fill" : "object-contain"}`}
                        onDragStart={(event) => event.preventDefault()}
                    />
                ) : (
                    <ImageSlotStatus image={primaryImage} />
                )}
            </div>
            {primaryImage?.status === "error" ? <BatchImageFailureActions placement="left" onRetry={() => onRetryBatchImage?.(primaryImage.id)} onDelete={() => onDeleteBatchImage?.(primaryImage.id)} /> : null}
            {isBatchRoot ? (
                <button
                    type="button"
                    className={batchToggleButtonClass}
                    style={panelButtonStyle(theme, theme.toolbar.activeText)}
                    aria-label={batchExpanded ? t("canvas.node.batchExpanded") : t("canvas.node.batchCollapsed")}
                    onClick={(event) => {
                        event.stopPropagation();
                        onToggleBatch?.();
                    }}
                    onMouseDown={(event) => event.stopPropagation()}
                    onPointerDown={(event) => event.stopPropagation()}
                >
                    <span className="leading-none">{t("canvas.controls.images", { count: batchCount })}</span>
                    <ChevronRight className={`size-3.5 opacity-80 transition-transform ${batchExpanded ? "rotate-90" : ""}`} />
                </button>
            ) : null}
        </BatchFrame>
    );
}

function ExpandedImageCard({ node, image, index, onView, onSetPrimary, onDuplicate, onDownload, onRetry, onDelete }: { node: CanvasNodeData; image: CanvasNodeImage; index: number; onView: () => void; onSetPrimary: () => void; onDuplicate: () => void; onDownload: () => void; onRetry: () => void; onDelete: () => void }) {
    const { message } = App.useApp();
    const theme = useCanvasTheme();
    const { t } = useTranslation();
    const count = node.metadata?.images?.length || 0;
    const columns = Math.min(count, 4);
    const rows = Math.ceil(count / columns);
    const rootSlot = (rows - 1) * columns;
    const slot = index >= rootSlot ? index + 1 : index;
    const column = slot % columns;
    const row = Math.floor(slot / columns);
    const x = column * (node.width + 18);
    const y = (row - rows + 1) * (node.height + 18);

    return (
        <div
                className={`absolute z-20 overflow-hidden ${image.content ? "" : "border"}`}
            style={
                {
                    left: x,
                    top: y,
                    width: node.width,
                    height: node.height,
                    background: "transparent",
                    borderColor: theme.node.stroke,
                    "--batch-from-x": `${-x}px`,
                    "--batch-from-y": `${-y}px`,
                    "--batch-from-rotate": `${4 + index * 2}deg`,
                    animation: `canvas-batch-child-in 320ms ${index * 35}ms cubic-bezier(.2,.85,.18,1) both`,
                } as React.CSSProperties
            }
            onMouseDown={(event) => event.stopPropagation()}
            onPointerDown={(event) => event.stopPropagation()}
            onDoubleClick={(event) => {
                if (!image.content || (event.target instanceof Element && event.target.closest("button"))) return;
                event.stopPropagation();
                onView();
            }}
        >
            {image.content ? <CanvasImage content={image.content} storageKey={image.storageKey} thumbnail={image.thumbnail} alt={node.title} className="pointer-events-none h-full w-full select-none object-contain" /> : <ImageSlotStatus image={image} />}
            {image.content ? (
                <div className="absolute inset-x-2 top-2 flex items-center gap-1">
                    <button
                        type="button"
                        className={expandedImageIconClass}
                        style={panelButtonStyle(theme, theme.toolbar.activeText)}
                        aria-label={t("common.download")}
                        title={t("common.download")}
                        onClick={(event) => (event.stopPropagation(), onDownload())}
                    >
                        <Download className="size-3.5" />
                    </button>
                    <button
                        type="button"
                        className={expandedImageIconClass}
                        style={panelButtonStyle(theme, theme.toolbar.activeText)}
                        aria-label={t("canvas.imageTools.copyTitle")}
                        title={t("canvas.imageTools.copyTitle")}
                        onClick={(event) => {
                            event.stopPropagation();
                            void copyImageToClipboard(image.content).then((ok) => (ok ? message.success(t("canvas.imageTools.copied")) : message.error(t("canvas.imageTools.copyFailed"))));
                        }}
                    >
                        <ClipboardCopy className="size-3.5" />
                    </button>
                    <button type="button" className={expandedImageActionClass} style={panelButtonStyle(theme, theme.toolbar.activeText)} title={t("canvas.node.createCopy")} onClick={(event) => (event.stopPropagation(), onDuplicate())}>
                        <Copy className="size-3 shrink-0" />
                        <span className="truncate">{t("canvas.node.createCopy")}</span>
                    </button>
                    <button type="button" className={expandedImageActionClass} style={panelButtonStyle(theme, theme.toolbar.activeText)} title={t("canvas.node.setPrimary")} onClick={(event) => (event.stopPropagation(), onSetPrimary())}>
                        <Star className="size-3 shrink-0" style={{ color: selectionBlue }} />
                        <span className="truncate">{t("canvas.node.setPrimary")}</span>
                    </button>
                </div>
            ) : null}
            {image.status === "error" ? <BatchImageFailureActions placement="right" onRetry={onRetry} onDelete={onDelete} /> : null}
        </div>
    );
}

function BatchImageFailureActions({ placement, onRetry, onDelete }: { placement: "left" | "right"; onRetry: () => void; onDelete: () => void }) {
    const theme = useCanvasTheme();
    const { t } = useTranslation();
    return (
        <div className={`absolute top-3 z-30 flex items-center gap-1.5 ${placement === "left" ? "left-3" : "right-3"}`}>
            <button type="button" className="flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-sm font-medium transition hover:scale-[1.02]" style={panelButtonStyle(theme, theme.node.text)} onClick={(event) => (event.stopPropagation(), onRetry())}>
                <RefreshCw className="size-3.5" />
                {t("canvas.node.retry")}
            </button>
            <button type="button" className="grid size-8 place-items-center rounded-md border transition hover:scale-[1.02]" style={panelButtonStyle(theme, theme.node.text)} onClick={(event) => (event.stopPropagation(), onDelete())} aria-label={t("common.delete")} title={t("common.delete")}>
                <Trash2 className="size-3.5" />
            </button>
        </div>
    );
}

function ImageSlotStatus({ image }: { image?: CanvasNodeImage }) {
    const theme = useCanvasTheme();
    const { t } = useTranslation();
    const failed = image?.status === "error";
    return (
        <div className="flex h-full w-full flex-col items-center justify-center gap-3 px-6 text-center" style={{ color: failed ? theme.node.text : theme.node.accent }}>
            {failed ? <span className="text-sm leading-5">{image.errorDetails || t("canvas.node.failed")}</span> : <div className="size-10 animate-spin rounded-full border-2" style={{ borderColor: theme.node.stroke, borderTopColor: theme.node.accent }} />}
            {!failed ? <span className="text-sm font-medium tracking-[0.2em]">{t("canvas.node.generating")}</span> : null}
        </div>
    );
}

function MediaInfoBar({ node, onInfo }: { node: CanvasNodeData; onInfo?: (node: CanvasNodeData) => void }) {
    const theme = useCanvasTheme();
    const { t } = useTranslation();
    const width = Math.round(node.metadata?.naturalWidth || node.width);
    const height = Math.round(node.metadata?.naturalHeight || node.height);
    const isAudio = node.type === CanvasNodeType.Audio;
    const info = isAudio ? (node.metadata?.durationMs ? formatAudioTime(node.metadata.durationMs / 1000) : "") : width && height ? `${width} x ${height}` : "";
    const size = formatBytes(node.metadata?.bytes || 0);
    const cost = useGenerationCostStore((state) => state.records.find((record) => record.nodeId === node.id));
    const costText = cost?.priced ? (cost.source === "estimate" ? `~${formatUsd(cost.usd)}` : formatUsd(cost.usd)) : "";
    const parts = [node.title?.trim() || "", info, size, costText].filter(Boolean);
    return (
        <div className="pointer-events-none absolute left-3 top-[-28px] z-40 flex max-w-[calc(100%-24px)] items-center gap-1.5">
            <span className="min-w-0 truncate text-sm font-medium" style={{ color: theme.node.text }}>
                {parts.join(" · ")}
            </span>
            <button
                type="button"
                className="pointer-events-auto grid size-5 shrink-0 place-items-center rounded-md transition hover:bg-hover"
                style={{ color: theme.node.muted }}
                aria-label={t("canvas.imageTools.info")}
                title={t("canvas.imageTools.info")}
                onClick={(event) => {
                    event.stopPropagation();
                    onInfo?.(node);
                }}
                onMouseDown={(event) => event.stopPropagation()}
                onPointerDown={(event) => event.stopPropagation()}
            >
                <Info className="size-3.5" />
            </button>
        </div>
    );
}

function BatchFrame({ batchCount, batchExpanded, children }: { batchCount: number; batchExpanded: boolean; children: ReactNode }) {
    const theme = useCanvasTheme();
    const isBatchRoot = batchCount > 1;
    return (
        <div className="group/batch relative h-full w-full overflow-visible">
            {isBatchRoot ? (
                <div className="pointer-events-none absolute inset-0 overflow-visible">
                    {Array.from({ length: Math.min(batchCount - 1, 3) }).map((_, index) => (
                        <div
                            key={index}
                            className="absolute rounded-[inherit] border transition-all duration-300 group-hover/batch:translate-x-1"
                            style={{
                                inset: 0,
                                background: `linear-gradient(135deg, ${theme.toolbar.panel}, ${theme.node.fill})`,
                                borderColor: theme.node.stroke,
                                opacity: batchExpanded ? 0 : 1,
                                transform: `translate(${10 + index * 6}px, ${4 + index * 3}px) rotate(${1.5 + index}deg)`,
                                zIndex: -index - 1,
                            }}
                        />
                    ))}
                </div>
            ) : null}
            {children}
        </div>
    );
}
function ResizeHandle({ corner, onMouseDown }: { corner: ResizeCorner; onMouseDown: (event: React.MouseEvent, corner: ResizeCorner) => void }) {
    const positionClass = {
        "top-left": "-left-[14px] -top-[14px] cursor-nwse-resize",
        "top-right": "-right-[14px] -top-[14px] cursor-nesw-resize",
        "bottom-left": "-bottom-[14px] -left-[14px] cursor-nesw-resize",
        "bottom-right": "-bottom-[14px] -right-[14px] cursor-nwse-resize",
    }[corner];

    return <div className={`absolute z-50 size-7 ${positionClass}`} onMouseDown={(event) => onMouseDown(event, corner)} />;
}

function ResizeGrip({ active, onMouseDown }: { active: boolean; onMouseDown: (event: React.MouseEvent, corner: ResizeCorner) => void }) {
    const theme = useCanvasTheme();

    return (
            <div className="absolute -bottom-7 -right-7 z-30 grid size-12 cursor-nwse-resize place-items-center" onMouseDown={(event) => onMouseDown(event, "bottom-right")}>
                <div className="size-8 rounded-br-[22px] border-b-[6px] border-r-[6px] transition-opacity duration-150" style={{ borderColor: active ? theme.node.muted : theme.node.faint, opacity: active ? 1 : 0.95 }} />
        </div>
    );
}

function ConnectionHandleDot({ side, visible, onMouseDown }: { side: "left" | "right"; visible: boolean; onMouseDown: (event: React.MouseEvent) => void }) {
    const theme = useCanvasTheme();

    return (
        <div
            className={`absolute top-1/2 z-30 flex size-12 -translate-y-1/2 cursor-crosshair items-center justify-center transition-opacity duration-150 ${
                side === "left" ? "-left-6" : "-right-6"
            } ${visible ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"}`}
            onMouseDown={onMouseDown}
        >
            <div className="size-3 rounded-full border-2 transition-all hover:scale-125" style={{ background: theme.node.panel, borderColor: theme.node.muted }} />
        </div>
    );
}

