import { AlignLeft, AudioLines, Clapperboard, FileMusic, FileText, Flag, FolderInput, Image as ImageIcon, Images, Link2, MessageSquareText, Mic, Music2, Sparkles, Video } from "lucide-react";

import { NODE_SPECS } from "@/constant/canvas";
import i18n from "@/i18n";
import { registerNodeDefinitions } from "@/lib/canvas/node-registry";
import { ENTITY_ICONS } from "@/lib/write/entity";
import { openEntityTab } from "@/lib/write/entity-canvas";
import { useWriteUiStore } from "@/stores/use-write-ui-store";
import { useWritingStore } from "@/stores/use-writing-store";
import { CanvasNodeType, type CanvasNodeData } from "@/types/canvas";
import type { CanvasNodeContext, CanvasNodeDefinition, CanvasNodeResource } from "@/types/canvas-plugin";

// Extensible metadata for built-in nodes, reusing NODE_SPECS for size and initial metadata.
// Rendering remains in canvas-node's internal renderer, so no Content component is provided.
function builtinResource(node: CanvasNodeData): CanvasNodeResource | null {
    if (node.type === CanvasNodeType.Image && node.metadata?.content) return { kind: "image", url: node.metadata.content };
    if (node.type === CanvasNodeType.Video && node.metadata?.content) return { kind: "video", url: node.metadata.content };
    if (node.type === CanvasNodeType.Audio && node.metadata?.content) return { kind: "audio", url: node.metadata.content };
    if (node.type === CanvasNodeType.Text && (node.metadata?.content || node.metadata?.prompt)) return { kind: "text", text: node.metadata.content || node.metadata.prompt };
    if ((node.type === CanvasNodeType.Prompt || node.type === CanvasNodeType.MusicPrompt || node.type === CanvasNodeType.SpeechPrompt || node.type === CanvasNodeType.VideoPrompt) && node.metadata?.prompt) return { kind: "text", text: node.metadata.prompt };
    return null;
}

const iconClass = "size-5";

function EntityRefContent({ ctx }: { ctx: CanvasNodeContext }) {
    const meta = ctx.node.metadata;
    const kind = meta?.entityRefKind ?? "character";
    const Icon = ENTITY_ICONS[kind] ?? ENTITY_ICONS.character;
    const projectId = useWriteUiStore((state) => state.projectId);
    const entity = useWritingStore((state) => state.projects.find((project) => project.id === projectId)?.entities.find((item) => item.id === meta?.entityRefId));
    const name = entity?.name.trim() || meta?.entityRefName?.trim() || "—";
    const empty = !meta?.entityRefId;
    return (
        <div className="flex h-full w-full flex-col justify-center gap-1 rounded-[inherit] px-3" style={{ color: ctx.theme.node.text }}>
            <span className="flex min-w-0 items-center gap-1.5 text-sm font-medium">
                <Icon className="size-4 shrink-0" style={{ color: ctx.theme.node.accent }} />
                <span className="truncate">{name}</span>
            </span>
            <span className="truncate text-xs" style={{ color: ctx.theme.node.muted }}>
                {empty ? i18n.t("writing.board.pick") : i18n.t(`writing.panel.${kind}`)}
                {!empty && meta?.entityRefId && !entity ? ` · ${i18n.t("writing.entity.deleted")}` : ""}
            </span>
        </div>
    );
}

function openEntityRef(ctx: CanvasNodeContext): boolean {
    const entityId = ctx.node.metadata?.entityRefId;
    const projectId = useWriteUiStore.getState().projectId;
    if (!entityId || !projectId) {
        ctx.openPanel();
        return true;
    }
    const entity = useWritingStore.getState().projects.find((project) => project.id === projectId)?.entities.find((item) => item.id === entityId);
    if (!entity) {
        ctx.openPanel();
        return true;
    }
    openEntityTab(projectId, entity.id, entity.kind);
    return true;
}

function EntityRefPanel({ ctx, onClose }: { ctx: CanvasNodeContext; onClose: () => void }) {
    const projectId = useWriteUiStore((state) => state.projectId);
    const project = useWritingStore((state) => state.projects.find((item) => item.id === projectId) ?? null);
    const kind = ctx.node.metadata?.entityRefKind;
    const entities = (project?.entities ?? []).filter((entity) => !kind || entity.kind === kind);
    return (
        <div className="flex max-h-64 flex-col gap-0.5 overflow-y-auto text-sm" style={{ color: ctx.theme.node.text }}>
            {entities.length ? (
                entities.map((entity) => (
                    <button
                        key={entity.id}
                        type="button"
                        className="flex items-center gap-2 rounded-md px-2 py-1 text-left transition hover:bg-hover"
                        onClick={() => {
                            ctx.updateMetadata({ entityRefId: entity.id, entityRefKind: entity.kind, entityRefName: entity.name });
                            onClose();
                        }}
                    >
                        {entity.name.trim() || i18n.t("writing.entity.untitled")}
                    </button>
                ))
            ) : (
                <span className="px-2 py-1 text-xs" style={{ color: ctx.theme.node.muted }}>
                    {i18n.t("writing.entity.empty")}
                </span>
            )}
        </div>
    );
}

const BUILTIN_DEFINITIONS: CanvasNodeDefinition[] = [
    { type: CanvasNodeType.Text, icon: <FileText className={iconClass} />, minimapColor: undefined, resource: builtinResource },
    { type: CanvasNodeType.Prompt, icon: <MessageSquareText className={iconClass} />, minimapColor: "#eab308", resource: builtinResource },
    { type: CanvasNodeType.MusicPrompt, icon: <Music2 className={iconClass} />, minimapColor: "#f59e0b", resource: builtinResource },
    { type: CanvasNodeType.SpeechPrompt, icon: <AlignLeft className={iconClass} />, minimapColor: "#22d3ee", resource: builtinResource },
    { type: CanvasNodeType.VideoPrompt, icon: <Clapperboard className={iconClass} />, minimapColor: "#fb923c", resource: builtinResource },
    { type: CanvasNodeType.Image, icon: <ImageIcon className={iconClass} />, minimapColor: "#10b981", keepAspectRatio: (node: CanvasNodeData) => !node.metadata?.freeResize, resource: builtinResource },
    { type: CanvasNodeType.ImageStack, icon: <Images className={iconClass} />, minimapColor: "#10b981", hasSourceHandle: false, transparentBackground: true },
    { type: CanvasNodeType.Video, icon: <Video className={iconClass} />, minimapColor: "#f97316", keepAspectRatio: () => true, resource: builtinResource },
    { type: CanvasNodeType.Audio, icon: <Music2 className={iconClass} />, minimapColor: "#a855f7", resource: builtinResource },
    { type: CanvasNodeType.Midi, icon: <FileMusic className={iconClass} />, minimapColor: "#f59e0b" },
    { type: CanvasNodeType.ImageGeneration, icon: <Sparkles className={iconClass} />, minimapColor: "#f472b6", hasSourceHandle: false, useBuiltinPanel: { mode: "image" } as const, keepAspectRatio: () => true },
    { type: CanvasNodeType.SpeechGeneration, icon: <Mic className={iconClass} />, minimapColor: "#0ea5e9", hasSourceHandle: false, useBuiltinPanel: { mode: "audio" } as const, keepAspectRatio: () => true },
    { type: CanvasNodeType.MusicGeneration, icon: <AudioLines className={iconClass} />, minimapColor: "#c026d3", hasSourceHandle: false, useBuiltinPanel: { mode: "audio" } as const, keepAspectRatio: () => true },
    { type: CanvasNodeType.VideoGeneration, icon: <Video className={iconClass} />, minimapColor: "#fb7185", hasSourceHandle: false, useBuiltinPanel: { mode: "video" } as const, keepAspectRatio: () => true },
    { type: CanvasNodeType.Assets, icon: <FolderInput className={iconClass} />, minimapColor: "#64748b", hasSourceHandle: false, hidePanel: true },
    { type: CanvasNodeType.Recording, icon: <Mic className={iconClass} />, minimapColor: "#ef4444", hasSourceHandle: false, hidePanel: true },
    { type: CanvasNodeType.EntityRef, icon: <Link2 className={iconClass} />, minimapColor: "#0ea5e9", Content: EntityRefContent, Panel: EntityRefPanel, autoOpenPanel: true, onDoubleClick: openEntityRef },
    { type: CanvasNodeType.PlotBeat, icon: <Flag className={iconClass} />, minimapColor: "#f59e0b" },
].map((def) => {
    const spec = NODE_SPECS[def.type];
    return { ...def, title: spec.title, defaultSize: { width: spec.width, height: spec.height }, defaultMetadata: spec.metadata };
});

let registered = false;
export function registerBuiltinNodes() {
    if (registered) return;
    registered = true;
    registerNodeDefinitions(BUILTIN_DEFINITIONS, "builtin");
}
