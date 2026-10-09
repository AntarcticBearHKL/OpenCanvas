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
    [CanvasNodeType.ImageStack]: { width: 420, height: 320, get title() { return i18n.t("canvas.nodeTypes.imageStack"); } },
    [CanvasNodeType.Text]: { width: 340, height: 240, get title() { return i18n.t("canvas.nodeTypes.text"); } },
    [CanvasNodeType.Prompt]: { width: 340, height: 240, get title() { return i18n.t("canvas.nodeTypes.prompt"); } },
    [CanvasNodeType.MusicPrompt]: { width: 340, height: 220, get title() { return i18n.t("canvas.nodeTypes.musicPrompt"); } },
    [CanvasNodeType.SpeechPrompt]: { width: 360, height: 260, get title() { return i18n.t("canvas.nodeTypes.speechPrompt"); } },
    [CanvasNodeType.VideoPrompt]: { width: 340, height: 300, get title() { return i18n.t("canvas.nodeTypes.videoPrompt"); } },
    [CanvasNodeType.ImageGeneration]: { width: 412, height: 576, get title() { return i18n.t("canvas.nodeTypes.imageGeneration"); } },
    [CanvasNodeType.SpeechGeneration]: { width: 412, height: 312, get title() { return i18n.t("canvas.nodeTypes.speechGeneration"); } },
    [CanvasNodeType.MusicGeneration]: { width: 412, height: 244, get title() { return i18n.t("canvas.nodeTypes.musicGeneration"); } },
    [CanvasNodeType.VideoGeneration]: { width: 412, height: 576, get title() { return i18n.t("canvas.nodeTypes.videoGeneration"); } },
    [CanvasNodeType.Video]: { width: 420, height: 236, get title() { return i18n.t("canvas.nodeTypes.video"); } },
    [CanvasNodeType.Audio]: { width: 340, height: 120, get title() { return i18n.t("canvas.nodeTypes.audio"); } },
    [CanvasNodeType.Midi]: { width: 320, height: 140, get title() { return i18n.t("canvas.nodeTypes.midi"); } },
    [CanvasNodeType.Assets]: { width: 360, height: 320, get title() { return i18n.t("canvas.nodeTypes.assets"); } },
    [CanvasNodeType.Recording]: { width: 300, height: 220, get title() { return i18n.t("canvas.nodeTypes.recording"); } },
    [CanvasNodeType.EntityRef]: { width: 260, height: 104, get title() { return i18n.t("canvas.nodeTypes.entityRef"); } },
    [CanvasNodeType.PlotBeat]: { width: 300, height: 180, get title() { return i18n.t("canvas.nodeTypes.plotBeat"); } },
} satisfies Record<CanvasNodeType, { width: number; height: number; title: string }>;

const spec = (type: CanvasNodeType, metadata: CanvasNodeMetadata): CanvasNodeSpec => ({
    width: NODE_DEFAULT_SIZE[type].width,
    height: NODE_DEFAULT_SIZE[type].height,
    get title() { return NODE_DEFAULT_SIZE[type].title; },
    metadata,
});

export const NODE_SPECS = {
    [CanvasNodeType.Image]: spec(CanvasNodeType.Image, { content: "", status: "idle" }),
    [CanvasNodeType.ImageStack]: spec(CanvasNodeType.ImageStack, { status: "idle", images: [] }),
    [CanvasNodeType.Text]: spec(CanvasNodeType.Text, { content: "", status: "idle", fontSize: 14 }),
    [CanvasNodeType.Prompt]: spec(CanvasNodeType.Prompt, { prompt: "", status: "idle" }),
    [CanvasNodeType.MusicPrompt]: spec(CanvasNodeType.MusicPrompt, { prompt: "", status: "idle" }),
    [CanvasNodeType.SpeechPrompt]: spec(CanvasNodeType.SpeechPrompt, { prompt: "", status: "idle" }),
    [CanvasNodeType.VideoPrompt]: spec(CanvasNodeType.VideoPrompt, { prompt: "", status: "idle", videoMode: "frames" }),
    [CanvasNodeType.ImageGeneration]: spec(CanvasNodeType.ImageGeneration, { status: "idle", generationMode: "image" }),
    [CanvasNodeType.SpeechGeneration]: spec(CanvasNodeType.SpeechGeneration, { status: "idle", generationMode: "audio", model: "fish-audio/s2.1-pro", audioFormat: "mp3" }),
    [CanvasNodeType.MusicGeneration]: spec(CanvasNodeType.MusicGeneration, { status: "idle", generationMode: "audio", model: "google/lyria-3-pro-preview", audioFormat: "mp3" }),
    [CanvasNodeType.VideoGeneration]: spec(CanvasNodeType.VideoGeneration, { status: "idle", generationMode: "video", model: openRouterVideoModels[0].value }),
    [CanvasNodeType.Video]: spec(CanvasNodeType.Video, { content: "", status: "idle" }),
    [CanvasNodeType.Audio]: spec(CanvasNodeType.Audio, { content: "", status: "idle" }),
    [CanvasNodeType.Midi]: spec(CanvasNodeType.Midi, { content: "", status: "idle" }),
    [CanvasNodeType.Assets]: spec(CanvasNodeType.Assets, {}),
    [CanvasNodeType.Recording]: spec(CanvasNodeType.Recording, {}),
    [CanvasNodeType.EntityRef]: spec(CanvasNodeType.EntityRef, { entityRefId: "", entityRefKind: "character", entityRefName: "" }),
    [CanvasNodeType.PlotBeat]: spec(CanvasNodeType.PlotBeat, { content: "", status: "idle", fontSize: 14 }),
} satisfies Record<CanvasNodeType, CanvasNodeSpec>;

// Return built-in specs directly and resolve plugin types from the registry.
export function getNodeSpec(type: string) {
    if ((Object.values(CanvasNodeType) as string[]).includes(type)) return NODE_SPECS[type as CanvasNodeType];
    const spec = getRegistryNodeSpec(type);
    return { width: spec.width, height: spec.height, title: spec.title, metadata: spec.metadata };
}
