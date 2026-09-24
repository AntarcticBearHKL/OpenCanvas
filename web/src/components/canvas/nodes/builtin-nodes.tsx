import { AlignLeft, AudioLines, AudioWaveform, Clapperboard, FileText, FolderInput, Image as ImageIcon, LayoutDashboard, MessageSquareText, Mic, Music2, Settings2, SlidersHorizontal, SlidersVertical, Sparkles, Video } from "lucide-react";
import { useTranslation } from "react-i18next";

import i18n from "@/i18n";

import { NODE_SPECS } from "@/constant/canvas";
import type { CanvasTheme } from "@/lib/canvas-theme";
import { formatAudioTime } from "@/lib/canvas/audio-waveform";
import { audioProjectClips, audioProjectDuration, audioProjectTracks } from "@/lib/canvas/audio-project";
import { registerNodeDefinitions } from "@/lib/canvas/node-registry";
import { CanvasNodeType, type CanvasNodeData } from "@/types/canvas";
import type { CanvasNodeDefinition, CanvasNodeResource } from "@/types/canvas-plugin";

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

const BUILTIN_DEFINITIONS: CanvasNodeDefinition[] = [
    { type: CanvasNodeType.Text, title: i18n.t("canvas.nodeTypes.text"), icon: <FileText className={iconClass} />, minimapColor: undefined, resource: builtinResource },
    { type: CanvasNodeType.Prompt, title: i18n.t("canvas.nodeTypes.prompt"), icon: <MessageSquareText className={iconClass} />, minimapColor: "#eab308", resource: builtinResource },
    { type: CanvasNodeType.MusicPrompt, title: i18n.t("canvas.nodeTypes.musicPrompt"), icon: <Music2 className={iconClass} />, minimapColor: "#f59e0b", resource: builtinResource },
    { type: CanvasNodeType.SpeechPrompt, title: i18n.t("canvas.nodeTypes.speechPrompt"), icon: <AlignLeft className={iconClass} />, minimapColor: "#22d3ee", resource: builtinResource },
    { type: CanvasNodeType.VideoPrompt, title: i18n.t("canvas.nodeTypes.videoPrompt"), icon: <Clapperboard className={iconClass} />, minimapColor: "#fb923c", resource: builtinResource },
    { type: CanvasNodeType.Image, title: i18n.t("canvas.nodeTypes.image"), icon: <ImageIcon className={iconClass} />, minimapColor: "#10b981", keepAspectRatio: (node: CanvasNodeData) => !node.metadata?.freeResize, resource: builtinResource },
    { type: CanvasNodeType.Video, title: i18n.t("canvas.nodeTypes.video"), icon: <Video className={iconClass} />, minimapColor: "#f97316", keepAspectRatio: () => true, resource: builtinResource },
    { type: CanvasNodeType.Audio, title: i18n.t("canvas.nodeTypes.audio"), icon: <Music2 className={iconClass} />, minimapColor: "#a855f7", resource: builtinResource },
    { type: CanvasNodeType.AudioProject, title: i18n.t("canvas.nodeTypes.audioProject"), icon: <SlidersVertical className={iconClass} />, minimapColor: "#8b5cf6" },
    { type: CanvasNodeType.Config, title: i18n.t("canvas.configNode.title"), icon: <Settings2 className={iconClass} />, minimapColor: "#60a5fa", hasSourceHandle: false },
    { type: CanvasNodeType.ImageGeneration, title: i18n.t("canvas.nodeTypes.imageGeneration"), icon: <Sparkles className={iconClass} />, minimapColor: "#f472b6", hasSourceHandle: false, useBuiltinPanel: { mode: "image" } as const, keepAspectRatio: () => true },
    { type: CanvasNodeType.SpeechGeneration, title: i18n.t("canvas.nodeTypes.speechGeneration"), icon: <Mic className={iconClass} />, minimapColor: "#0ea5e9", hasSourceHandle: false, useBuiltinPanel: { mode: "audio" } as const, keepAspectRatio: () => true },
    { type: CanvasNodeType.MusicGeneration, title: i18n.t("canvas.nodeTypes.musicGeneration"), icon: <AudioLines className={iconClass} />, minimapColor: "#c026d3", hasSourceHandle: false, useBuiltinPanel: { mode: "audio" } as const, keepAspectRatio: () => true },
    { type: CanvasNodeType.VideoGeneration, title: i18n.t("canvas.nodeTypes.videoGeneration"), icon: <Video className={iconClass} />, minimapColor: "#fb7185", hasSourceHandle: false, useBuiltinPanel: { mode: "video" } as const, keepAspectRatio: () => true },
    { type: CanvasNodeType.SmartCanvas, title: i18n.t("canvas.nodeTypes.smartCanvas"), icon: <LayoutDashboard className={iconClass} />, minimapColor: "#14b8a6", keepAspectRatio: () => true },
    { type: CanvasNodeType.Assets, title: i18n.t("canvas.nodeTypes.assets"), icon: <FolderInput className={iconClass} />, minimapColor: "#64748b", hasSourceHandle: false, hidePanel: true },
    { type: CanvasNodeType.Recording, title: i18n.t("canvas.nodeTypes.recording"), icon: <Mic className={iconClass} />, minimapColor: "#ef4444", hasSourceHandle: false, hidePanel: true },
    { type: CanvasNodeType.ImageModifier, title: i18n.t("canvas.nodeTypes.imageModifier"), icon: <SlidersHorizontal className={iconClass} />, minimapColor: "#8b5cf6", hasSourceHandle: false, keepAspectRatio: () => true, hidePanel: true },
].map((def) => {
    const spec = NODE_SPECS[def.type];
    return { ...def, title: spec.title, defaultSize: { width: spec.width, height: spec.height }, defaultMetadata: spec.metadata };
});

export function AudioProjectNodeContent({ node, theme }: { node: CanvasNodeData; theme: CanvasTheme }) {
    const { t } = useTranslation();
    const tracks = audioProjectTracks(node);
    const clips = audioProjectClips(node);

    return (
        <div className="flex h-full w-full flex-col items-center justify-center gap-2 px-5 text-center" style={{ color: theme.node.muted }}>
            <AudioWaveform className="size-7" />
            <span className="text-sm" style={{ color: theme.node.label }}>{t("canvas.audioStudio.summary", { tracks: tracks.length, clips: clips.length })}</span>
            <span className="text-xs tabular-nums" style={{ color: theme.node.muted }}>{formatAudioTime(audioProjectDuration(clips))}</span>
        </div>
    );
}

let registered = false;
export function registerBuiltinNodes() {
    if (registered) return;
    registered = true;
    registerNodeDefinitions(BUILTIN_DEFINITIONS, "builtin");
}
