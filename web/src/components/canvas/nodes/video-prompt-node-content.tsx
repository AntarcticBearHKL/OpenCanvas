import { useState } from "react";
import { Music2, Plus, Video, X } from "lucide-react";
import { useTranslation } from "react-i18next";

import { useCanvasTheme } from "@/hooks/use-canvas-theme";
import { videoReferenceKind } from "@/lib/canvas/canvas-drop-bindings";
import type { CanvasResourceReference } from "@/lib/canvas/canvas-resource-references";
import { VIDEO_REFERENCE_TOTAL_LIMIT, normalizeVideoMode, type VideoReferenceKind } from "@/lib/video-generation";
import type { CanvasNodeData, CanvasVideoMode, CanvasVideoSlot, CanvasVideoSlots } from "@/types/canvas";
import { selectionBlue } from "../canvas-node";
import { CanvasPromptChipInput } from "../canvas-prompt-chip-input";

const videoModeOptions: CanvasVideoMode[] = ["frames", "reference"];
const frameSlotOptions: Array<"firstFrame" | "lastFrame"> = ["firstFrame", "lastFrame"];

type VideoPromptNodeContentProps = {
    node: CanvasNodeData;
    nodes: CanvasNodeData[];
    references: CanvasResourceReference[];
    maxFrameImages: number;
    dropSlot?: CanvasVideoSlot | null;
    onContentChange: (nodeId: string, content: string) => void;
    onVideoModeChange: (nodeId: string, mode: CanvasVideoMode) => void;
    onVideoSlotsChange: (nodeId: string, slots: CanvasVideoSlots) => void;
};

export function VideoPromptNodeContent({ node, nodes, references, maxFrameImages, dropSlot, onContentChange, onVideoModeChange, onVideoSlotsChange }: VideoPromptNodeContentProps) {
    const { t } = useTranslation();
    const theme = useCanvasTheme();
    const [editing, setEditing] = useState(false);
    const [singleFrameSlot, setSingleFrameSlot] = useState<"firstFrame" | "lastFrame">("firstFrame");
    const slots = node.metadata?.videoSlots || {};
    const mode = normalizeVideoMode(node.metadata?.videoMode);
    const nodeById = new Map(nodes.map((item) => [item.id, item]));
    const referenceIds = (slots.references || []).filter((id) => nodeById.has(id));
    const singleKeyframe = maxFrameImages <= 1;
    const frameSlot = slots.firstFrame ? "firstFrame" : slots.lastFrame ? "lastFrame" : singleFrameSlot;
    const clearSlot = (patch: CanvasVideoSlots) => onVideoSlotsChange(node.id, { ...slots, ...patch });
    const switchFrameSlot = (slot: "firstFrame" | "lastFrame") => {
        setSingleFrameSlot(slot);
        if (!slots.firstFrame && !slots.lastFrame) return;
        clearSlot(slot === "firstFrame" ? { firstFrame: slots.firstFrame || slots.lastFrame, lastFrame: undefined } : { lastFrame: slots.lastFrame || slots.firstFrame, firstFrame: undefined });
    };
    const thumbnailOf = (id: string | undefined) => {
        const item = id ? nodeById.get(id) : undefined;
        return item?.metadata?.thumbnail || item?.metadata?.content;
    };

    return (
        <div className="flex h-full w-full cursor-move flex-col px-3 pb-3 pt-7 text-sm" style={{ color: theme.node.text }}>
            <div className="mb-2 flex items-center justify-between gap-2">
                <div className="shrink-0 text-sm font-semibold">{t("canvas.nodeTypes.videoPrompt")}</div>
                <div className="flex shrink-0 items-center gap-0.5" onMouseDown={(event) => event.stopPropagation()} onPointerDown={(event) => event.stopPropagation()}>
                    {videoModeOptions.map((item) => (
                        <button
                            key={item}
                            type="button"
                            className="h-6 cursor-pointer rounded-[2px] px-2 text-sm transition hover:bg-hover"
                            style={mode === item ? { background: theme.toolbar.activeBg, color: theme.toolbar.activeText } : { color: theme.node.muted }}
                            onMouseDown={(event) => event.stopPropagation()}
                            onPointerDown={(event) => event.stopPropagation()}
                            onClick={() => onVideoModeChange(node.id, item)}
                        >
                            {t(item === "frames" ? "canvas.videoPrompt.modeFrames" : "canvas.videoPrompt.modeReference")}
                        </button>
                    ))}
                </div>
            </div>
            <div
                className="flex min-h-0 flex-1 flex-col"
                onFocus={() => setEditing(true)}
                onBlur={() => setEditing(false)}
                onMouseDown={(event) => {
                    if (editing) event.stopPropagation();
                }}
                onPointerDown={(event) => {
                    if (editing) event.stopPropagation();
                }}
                onWheel={(event) => event.stopPropagation()}
            >
                <CanvasPromptChipInput
                    value={node.metadata?.prompt || ""}
                    references={references}
                    onChange={(value) => onContentChange(node.id, value)}
                    containerClassName="min-h-0 flex-1"
                    className="thin-scrollbar h-full min-h-0 w-full cursor-text rounded-[2px] px-2 py-1.5 text-sm leading-6"
                    style={{ background: "transparent", color: theme.node.text }}
                    placeholder={t("canvas.promptPanel.video")}
                />
            </div>
            <div className="mt-2 shrink-0">
                <div className="mb-1 text-sm font-medium" style={{ color: theme.node.muted }}>
                    {mode === "frames" ? t("canvas.videoPrompt.slots") : `${t("canvas.videoPrompt.reference")} ${referenceIds.length}/${VIDEO_REFERENCE_TOTAL_LIMIT}`}
                </div>
                {mode === "frames" ? (
                    singleKeyframe ? (
                        <div>
                            <VideoFrameSlot
                                label={t("canvas.videoPrompt.keyframe")}
                                nodeId={node.id}
                                slot={frameSlot}
                                thumbnail={thumbnailOf(slots[frameSlot])}
                                active={dropSlot === frameSlot}
                                onClear={() => clearSlot({ firstFrame: undefined, lastFrame: undefined })}
                            />
                            <div className="mt-1 flex items-center justify-between gap-2">
                                <div className="flex shrink-0 items-center gap-0.5" onMouseDown={(event) => event.stopPropagation()} onPointerDown={(event) => event.stopPropagation()}>
                                    {frameSlotOptions.map((item) => (
                                        <button
                                            key={item}
                                            type="button"
                                            className="h-6 cursor-pointer rounded-[2px] px-2 text-sm transition hover:bg-hover"
                                            style={frameSlot === item ? { background: theme.toolbar.activeBg, color: theme.toolbar.activeText } : { color: theme.node.muted }}
                                            onMouseDown={(event) => event.stopPropagation()}
                                            onPointerDown={(event) => event.stopPropagation()}
                                            onClick={() => switchFrameSlot(item)}
                                        >
                                            {t(item === "firstFrame" ? "canvas.videoPrompt.firstFrame" : "canvas.videoPrompt.lastFrame")}
                                        </button>
                                    ))}
                                </div>
                                <div className="min-w-0 truncate text-sm" style={{ color: theme.node.muted }}>
                                    {t("canvas.videoPrompt.singleKeyframeHint")}
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="grid grid-cols-2 gap-2">
                            <VideoFrameSlot
                                label={t("canvas.videoPrompt.firstFrame")}
                                nodeId={node.id}
                                slot="firstFrame"
                                thumbnail={thumbnailOf(slots.firstFrame)}
                                active={dropSlot === "firstFrame"}
                                onClear={() => clearSlot({ firstFrame: undefined })}
                            />
                            <VideoFrameSlot
                                label={t("canvas.videoPrompt.lastFrame")}
                                nodeId={node.id}
                                slot="lastFrame"
                                thumbnail={thumbnailOf(slots.lastFrame)}
                                active={dropSlot === "lastFrame"}
                                onClear={() => clearSlot({ lastFrame: undefined })}
                            />
                        </div>
                    )
                ) : (
                    <div className="thin-scrollbar flex max-h-36 flex-wrap gap-2 overflow-y-auto">
                        {referenceIds.map((id) => {
                            const item = nodeById.get(id);
                            const kind = item ? videoReferenceKind(item.type) : null;
                            return kind && item ? <VideoReferenceSlot key={id} nodeId={node.id} node={item} kind={kind} onClear={() => clearSlot({ references: referenceIds.filter((itemId) => itemId !== id) })} /> : null;
                        })}
                        {referenceIds.length < VIDEO_REFERENCE_TOTAL_LIMIT ? <VideoReferenceAddSlot nodeId={node.id} active={dropSlot === "reference"} /> : null}
                    </div>
                )}
            </div>
        </div>
    );
}

function VideoFrameSlot({ label, nodeId, slot, thumbnail, active, onClear }: { label: string; nodeId: string; slot: CanvasVideoSlot; thumbnail?: string; active: boolean; onClear: () => void }) {
    const { t } = useTranslation();
    const theme = useCanvasTheme();
    const highlight = active ? { outline: `2px solid ${selectionBlue}`, outlineOffset: 1 } : undefined;

    return (
        <div className="min-w-0 cursor-default" onMouseDown={(event) => event.stopPropagation()} onPointerDown={(event) => event.stopPropagation()}>
            <div className="mb-1 truncate text-sm" style={{ color: theme.node.muted }}>
                {label}
            </div>
            {thumbnail ? (
                <div className="relative h-14 overflow-hidden border" data-video-slot={slot} data-video-slot-node={nodeId} data-video-slot-kind="image" style={{ borderColor: theme.node.stroke, ...highlight }}>
                    <img src={thumbnail} alt="" draggable={false} className="size-full object-cover" />
                    <SlotClearButton label={t("canvas.videoPrompt.clearSlot")} onClear={onClear} />
                </div>
            ) : (
                <div
                    className="flex h-14 items-center justify-center border border-dashed"
                    data-video-slot={slot}
                    data-video-slot-node={nodeId}
                    data-video-slot-kind="image"
                    style={{ borderColor: theme.node.stroke, color: theme.node.placeholder, ...highlight }}
                    title={t("canvas.videoPrompt.emptySlot")}
                >
                    <Plus className="size-4" />
                </div>
            )}
        </div>
    );
}

function VideoReferenceSlot({ nodeId, node, kind, onClear }: { nodeId: string; node: CanvasNodeData; kind: VideoReferenceKind; onClear: () => void }) {
    const { t } = useTranslation();
    const theme = useCanvasTheme();
    const thumbnail = kind === "image" ? node.metadata?.thumbnail || node.metadata?.content : undefined;

    return (
        <div
            className="relative h-14 w-[76px] cursor-default overflow-hidden border"
            data-video-slot="reference"
            data-video-slot-node={nodeId}
            data-video-slot-kind={kind}
            style={{ borderColor: theme.node.stroke }}
            title={node.title || t(`canvas.videoPrompt.kinds.${kind}`)}
            onMouseDown={(event) => event.stopPropagation()}
            onPointerDown={(event) => event.stopPropagation()}
        >
            {thumbnail ? (
                <img src={thumbnail} alt="" draggable={false} className="size-full object-cover" />
            ) : (
                <div className="flex size-full flex-col items-center justify-center gap-0.5 px-1">
                    {kind === "video" ? <Video className="size-4" style={{ color: theme.node.text }} /> : <Music2 className="size-4" style={{ color: theme.node.text }} />}
                    <span className="w-full truncate text-center text-sm" style={{ color: theme.node.muted }}>
                        {node.title || t(`canvas.videoPrompt.kinds.${kind}`)}
                    </span>
                </div>
            )}
            <SlotClearButton label={t("canvas.videoPrompt.clearSlot")} onClear={onClear} />
        </div>
    );
}

function VideoReferenceAddSlot({ nodeId, active }: { nodeId: string; active: boolean }) {
    const { t } = useTranslation();
    const theme = useCanvasTheme();
    const highlight = active ? { outline: `2px solid ${selectionBlue}`, outlineOffset: 1 } : undefined;

    return (
        <div
            className="flex h-14 w-[76px] cursor-default items-center justify-center border border-dashed"
            data-video-slot="reference"
            data-video-slot-node={nodeId}
            data-video-slot-kind="any"
            style={{ borderColor: theme.node.stroke, color: theme.node.placeholder, ...highlight }}
            title={t("canvas.videoPrompt.addReference")}
            onMouseDown={(event) => event.stopPropagation()}
            onPointerDown={(event) => event.stopPropagation()}
        >
            <Plus className="size-4" />
        </div>
    );
}

function SlotClearButton({ label, onClear }: { label: string; onClear: () => void }) {
    return (
        <button
            type="button"
            className="absolute right-0.5 top-0.5 grid size-5 cursor-pointer place-items-center rounded-[2px]"
            style={{ background: "rgba(0,0,0,0.55)", color: "#fff" }}
            title={label}
            aria-label={label}
            onMouseDown={(event) => event.stopPropagation()}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={onClear}
        >
            <X className="size-3" />
        </button>
    );
}
