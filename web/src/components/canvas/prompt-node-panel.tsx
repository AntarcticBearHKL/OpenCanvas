import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { useCanvasTheme } from "@/hooks/use-canvas-theme";
import { CANVAS_REFERENCE_DRAG_TYPE, type CanvasResourceReference } from "@/lib/canvas/canvas-resource-references";
import { CanvasNodeType, type CanvasNodeData } from "@/types/canvas";
import { CanvasPromptChipInput, type CanvasPromptChipInputHandle } from "./canvas-prompt-chip-input";

export function PromptNodePanel({
    node,
    references = [],
    tags = [],
    onContentChange,
}: {
    node: CanvasNodeData;
    references?: CanvasResourceReference[];
    tags?: string[];
    onContentChange: (nodeId: string, content: string) => void;
}) {
    const { t } = useTranslation();
    const theme = useCanvasTheme();
    const inputRef = useRef<CanvasPromptChipInputHandle>(null);
    const [editing, setEditing] = useState(false);
    const titleKey = node.type === CanvasNodeType.MusicPrompt ? "canvas.nodeTypes.musicPrompt" : node.type === CanvasNodeType.SpeechPrompt ? "canvas.nodeTypes.speechPrompt" : "canvas.nodeTypes.prompt";
    const placeholderKey = node.type === CanvasNodeType.MusicPrompt ? "canvas.promptPanel.music" : node.type === CanvasNodeType.SpeechPrompt ? "canvas.promptPanel.speech" : "canvas.promptNode.placeholder";

    return (
        <div className="flex h-full w-full cursor-move flex-col px-3 pb-3 pt-7 text-sm" style={{ color: theme.node.text }}>
            <div className="mb-2 flex items-center justify-between gap-2">
                <div className="shrink-0 text-sm font-semibold">{t(titleKey)}</div>
            </div>
            <PromptReferenceChips references={references} />
            {tags.length ? (
                <div className="mb-2 flex max-w-full shrink-0 flex-wrap items-center gap-1" title={t("canvas.promptNode.tagHint")} onMouseDown={(event) => event.stopPropagation()} onPointerDown={(event) => event.stopPropagation()}>
                    {tags.map((tag) => (
                        <button
                            key={tag}
                            type="button"
                            className="inline-flex h-7 shrink-0 cursor-pointer items-center rounded-md px-2 text-[11px] transition hover:bg-black/5 dark:hover:bg-white/10"
                            style={{ color: theme.node.text }}
                            onMouseDown={(event) => event.preventDefault()}
                            onClick={() => inputRef.current?.insertText(tag)}
                        >
                            {tag}
                        </button>
                    ))}
                </div>
            ) : null}
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
                    ref={inputRef}
                    value={node.metadata?.prompt || ""}
                    references={references}
                    onChange={(value) => onContentChange(node.id, value)}
                    containerClassName="min-h-0 flex-1"
                    className="thin-scrollbar h-full min-h-0 w-full cursor-text rounded-xl px-2 py-1.5 text-sm leading-6"
                    style={{ background: "transparent", color: theme.node.text }}
                    placeholder={t(placeholderKey)}
                />
            </div>
        </div>
    );
}

function PromptReferenceChips({ references }: { references: CanvasResourceReference[] }) {
    const theme = useCanvasTheme();
    const { t } = useTranslation();
    const images = references.filter((reference) => reference.kind === "image");
    if (!images.length) return null;

    return (
        <div
            className="mb-2 flex max-w-full shrink-0 flex-wrap items-center gap-1"
            title={t("canvas.promptNode.dragHint")}
            onMouseDown={(event) => event.stopPropagation()}
            onPointerDown={(event) => event.stopPropagation()}
        >
            {images.map((reference) => (
                <div
                    key={reference.id}
                    draggable
                    className="canvas-prompt-ref-chip flex h-7 max-w-32 cursor-grab items-center gap-1 overflow-hidden rounded-md border px-1 text-[11px] leading-none"
                    style={{ background: theme.toolbar.panel, borderColor: theme.node.stroke, color: theme.node.text }}
                    title={reference.title || reference.label}
                    onDragStart={(event) => {
                        event.dataTransfer.setData(CANVAS_REFERENCE_DRAG_TYPE, reference.id);
                        event.dataTransfer.effectAllowed = "copy";
                        event.currentTarget.classList.add("canvas-prompt-ref-chip-dragging");
                    }}
                    onDragEnd={(event) => event.currentTarget.classList.remove("canvas-prompt-ref-chip-dragging")}
                >
                    {reference.previewUrl ? <img src={reference.previewUrl} alt="" draggable={false} className="size-5 shrink-0 rounded object-cover" /> : null}
                    <span className="truncate">{reference.label}</span>
                </div>
            ))}
        </div>
    );
}

