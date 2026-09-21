import i18n from "@/i18n";
import { CanvasNodeType } from "@/types/canvas";
import type { CanvasNodeMetadata } from "@/types/canvas";
import { getNodeSpec as getRegistryNodeSpec } from "@/lib/canvas/node-registry";
import { openRouterVideoModels } from "@/lib/video-generation";

type CanvasNodeSpec = {
    width: number;
    height: number;
    title: string;
    metadata?: CanvasNodeMetadata;
};

export const NODE_DEFAULT_SIZE = {
    [CanvasNodeType.Image]: { width: 340, height: 240, get title() { return i18n.t("canvas.nodeTypes.image"); } },
    [CanvasNodeType.Text]: { width: 340, height: 240, get title() { return i18n.t("canvas.nodeTypes.text"); } },
    [CanvasNodeType.Prompt]: { width: 340, height: 240, get title() { return i18n.t("canvas.nodeTypes.prompt"); } },
    [CanvasNodeType.MusicPrompt]: { width: 340, height: 220, get title() { return i18n.t("canvas.nodeTypes.musicPrompt"); } },
    [CanvasNodeType.SpeechPrompt]: { width: 360, height: 260, get title() { return i18n.t("canvas.nodeTypes.speechPrompt"); } },
    [CanvasNodeType.VideoPrompt]: { width: 340, height: 300, get title() { return i18n.t("canvas.nodeTypes.videoPrompt"); } },
    [CanvasNodeType.Config]: { width: 340, height: 240, get title() { return i18n.t("canvas.nodeTypes.config"); } },
    [CanvasNodeType.ImageGeneration]: { width: 412, height: 576, get title() { return i18n.t("canvas.nodeTypes.imageGeneration"); } },
    [CanvasNodeType.SpeechGeneration]: { width: 412, height: 312, get title() { return i18n.t("canvas.nodeTypes.speechGeneration"); } },
    [CanvasNodeType.MusicGeneration]: { width: 412, height: 244, get title() { return i18n.t("canvas.nodeTypes.musicGeneration"); } },
    [CanvasNodeType.VideoGeneration]: { width: 412, height: 576, get title() { return i18n.t("canvas.nodeTypes.videoGeneration"); } },
    [CanvasNodeType.Video]: { width: 420, height: 236, get title() { return i18n.t("canvas.nodeTypes.video"); } },
    [CanvasNodeType.Audio]: { width: 340, height: 120, get title() { return i18n.t("canvas.nodeTypes.audio"); } },
    [CanvasNodeType.AudioProject]: { width: 360, height: 200, get title() { return i18n.t("canvas.nodeTypes.audioProject"); } },
    [CanvasNodeType.SmartCanvas]: { width: 640, height: 360, get title() { return i18n.t("canvas.nodeTypes.smartCanvas"); } },
    [CanvasNodeType.Assets]: { width: 360, height: 320, get title() { return i18n.t("canvas.nodeTypes.assets"); } },
    [CanvasNodeType.Recording]: { width: 300, height: 220, get title() { return i18n.t("canvas.nodeTypes.recording"); } },
    [CanvasNodeType.ImageModifier]: { width: 464, height: 648, get title() { return i18n.t("canvas.nodeTypes.imageModifier"); } },
} satisfies Record<CanvasNodeType, { width: number; height: number; title: string }>;

export const NODE_SPECS = {
    [CanvasNodeType.Image]: {
        width: 340, height: 240, get title() { return NODE_DEFAULT_SIZE[CanvasNodeType.Image].title; },
        metadata: { content: "", status: "idle" },
    },
    [CanvasNodeType.Text]: {
        width: 340, height: 240, get title() { return NODE_DEFAULT_SIZE[CanvasNodeType.Text].title; },
        metadata: { content: "", status: "idle", fontSize: 14 },
    },
    [CanvasNodeType.Prompt]: {
        width: 340, height: 240, get title() { return NODE_DEFAULT_SIZE[CanvasNodeType.Prompt].title; },
        metadata: { prompt: "", status: "idle" },
    },
    [CanvasNodeType.MusicPrompt]: {
        width: 340, height: 220, get title() { return NODE_DEFAULT_SIZE[CanvasNodeType.MusicPrompt].title; },
        metadata: { prompt: "", status: "idle" },
    },
    [CanvasNodeType.SpeechPrompt]: {
        width: 360, height: 260, get title() { return NODE_DEFAULT_SIZE[CanvasNodeType.SpeechPrompt].title; },
        metadata: { prompt: "", status: "idle" },
    },
    [CanvasNodeType.VideoPrompt]: {
        width: 340, height: 300, get title() { return NODE_DEFAULT_SIZE[CanvasNodeType.VideoPrompt].title; },
        metadata: { prompt: "", status: "idle", videoMode: "frames" },
    },
    [CanvasNodeType.Config]: {
        width: 340, height: 240, get title() { return NODE_DEFAULT_SIZE[CanvasNodeType.Config].title; },
        metadata: { content: "", status: "idle", generationMode: "image" },
    },
    [CanvasNodeType.ImageGeneration]: {
            width: 412, height: 576, get title() { return NODE_DEFAULT_SIZE[CanvasNodeType.ImageGeneration].title; },
        metadata: { status: "idle", generationMode: "image" },
    },
    [CanvasNodeType.SpeechGeneration]: {
        width: 412, height: 312, get title() { return NODE_DEFAULT_SIZE[CanvasNodeType.SpeechGeneration].title; },
        metadata: { status: "idle", generationMode: "audio", model: "fish-audio/s2.1-pro", audioFormat: "mp3" },
    },
    [CanvasNodeType.MusicGeneration]: {
        width: 412, height: 244, get title() { return NODE_DEFAULT_SIZE[CanvasNodeType.MusicGeneration].title; },
        metadata: { status: "idle", generationMode: "audio", model: "google/lyria-3-pro-preview", audioFormat: "mp3" },
    },
    [CanvasNodeType.VideoGeneration]: {
        width: 412, height: 576, get title() { return NODE_DEFAULT_SIZE[CanvasNodeType.VideoGeneration].title; },
        metadata: { status: "idle", generationMode: "video", model: openRouterVideoModels[0].value },
    },
    [CanvasNodeType.Video]: {
        width: 420, height: 236, get title() { return NODE_DEFAULT_SIZE[CanvasNodeType.Video].title; },
        metadata: { content: "", status: "idle" },
    },
    [CanvasNodeType.Audio]: {
        width: 340, height: 120, get title() { return NODE_DEFAULT_SIZE[CanvasNodeType.Audio].title; },
        metadata: { content: "", status: "idle" },
    },
    [CanvasNodeType.AudioProject]: {
        width: 360, height: 200, get title() { return NODE_DEFAULT_SIZE[CanvasNodeType.AudioProject].title; },
        metadata: {
            audioTracks: [
                { id: "track-1", name: "", type: "audio", gain: 1, pan: 0, mute: false, solo: false },
                { id: "master", name: "", type: "master", gain: 1, pan: 0, mute: false, solo: false },
            ],
            audioClips: [],
            audioMasterGain: 1,
        },
    },
    [CanvasNodeType.SmartCanvas]: {
        width: 640, height: 360, get title() { return NODE_DEFAULT_SIZE[CanvasNodeType.SmartCanvas].title; },
        metadata: { status: "idle", boardRatio: "16:9", boardResolution: "2k" },
    },
    [CanvasNodeType.Assets]: {
        width: 360, height: 320, get title() { return NODE_DEFAULT_SIZE[CanvasNodeType.Assets].title; },
        metadata: {},
    },
    [CanvasNodeType.Recording]: {
        width: 300, height: 220, get title() { return NODE_DEFAULT_SIZE[CanvasNodeType.Recording].title; },
        metadata: {},
    },
    [CanvasNodeType.ImageModifier]: {
        width: 464, height: 648, get title() { return NODE_DEFAULT_SIZE[CanvasNodeType.ImageModifier].title; },
        metadata: { modifierEmit: false },
    },
} satisfies Record<CanvasNodeType, CanvasNodeSpec>;

// Return built-in specs directly and resolve plugin types from the registry.
export function getNodeSpec(type: string) {
    if ((Object.values(CanvasNodeType) as string[]).includes(type)) return NODE_SPECS[type as CanvasNodeType];
    const spec = getRegistryNodeSpec(type);
    return { width: spec.width, height: spec.height, title: spec.title, metadata: spec.metadata };
}
