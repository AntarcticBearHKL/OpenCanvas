import type { AiTextMessage } from "@/services/api/image";
import i18n from "@/i18n";
import { imageReferenceLabel } from "@/lib/image-reference-prompt";
import { normalizeVideoMode, type VideoFrameReference } from "@/lib/video-generation";
import type { ReferenceImage } from "@/types/image";
import type { ReferenceAudio, ReferenceVideo } from "@/types/media";
import { CanvasNodeType, type CanvasConnection, type CanvasNodeData, type CanvasVideoMode } from "@/types/canvas";
import { getGenerationResourceNodes } from "@/lib/canvas/canvas-resource-references";
import { getNodeDefinition } from "@/lib/canvas/node-registry";

type NodeGenerationContext = {
    prompt: string;
    referenceImages: ReferenceImage[];
    referenceVideos: ReferenceVideo[];
    referenceAudios: ReferenceAudio[];
    textCount: number;
    imageCount: number;
    videoCount: number;
    audioCount: number;
    videoMode?: CanvasVideoMode;
    videoFrameSlots?: VideoFrameReference[];
};

type NodeGenerationResourceInput = {
    nodeId: string;
    type: "text" | "image" | "video" | "audio";
    title: string;
    text?: string;
    image?: ReferenceImage;
    video?: ReferenceVideo;
    audio?: ReferenceAudio;
};

export type NodeGenerationInput = NodeGenerationResourceInput;

export function buildNodeGenerationContext(nodeId: string, nodes: CanvasNodeData[], connections: CanvasConnection[], prompt: string): NodeGenerationContext {
    const sourceNode = nodes.find((node) => node.id === nodeId);
    if (sourceNode?.type === CanvasNodeType.ImageGeneration || sourceNode?.type === CanvasNodeType.VideoGeneration) {
        const isVideoGeneration = sourceNode.type === CanvasNodeType.VideoGeneration;
        const promptNode = connectedPromptNode(sourceNode.id, nodes, connections, isVideoGeneration ? [CanvasNodeType.VideoPrompt] : [CanvasNodeType.Prompt]);
        const promptText = promptNode?.metadata?.prompt?.trim() || "";
        const resourceInputs = promptNode ? flattenGenerationInputs(buildNodeGenerationInputs(promptNode.id, nodes, connections)) : [];
        let textIndex = 0;
        const upstreamText = resourceInputs.flatMap((input) => (input.text ? [textBlock(generationLabel("text", textIndex++), input.text)] : [])).join("\n\n");
        const resourceImages = resourceInputs.map((input) => input.image).filter((image): image is ReferenceImage => Boolean(image));
        const resourceVideos = resourceInputs.map((input) => input.video).filter((video): video is ReferenceVideo => Boolean(video));
        const resourceAudios = resourceInputs.map((input) => input.audio).filter((audio): audio is ReferenceAudio => Boolean(audio));
        const videoMode = isVideoGeneration ? normalizeVideoMode(promptNode?.metadata?.videoMode) : undefined;
        const slotReferences = isVideoGeneration ? readVideoSlotReferences(promptNode, nodes) : EMPTY_VIDEO_SLOT_REFERENCES;
        const slotImageIds = new Set(slotReferences.images.map((image) => image.id));
        const slotVideoIds = new Set(slotReferences.videos.map((video) => video.id));
        const slotAudioIds = new Set(slotReferences.audios.map((audio) => audio.id));
        const referenceImages = [...slotReferences.images, ...resourceImages.filter((image) => !slotImageIds.has(image.id))];
        // First/last frame mode is image-only: connected videos and audio never join a frame request.
        const referenceVideos = videoMode === "frames" ? [] : [...slotReferences.videos, ...resourceVideos.filter((video) => !slotVideoIds.has(video.id))];
        const referenceAudios = videoMode === "frames" ? [] : [...slotReferences.audios, ...resourceAudios.filter((audio) => !slotAudioIds.has(audio.id))];
        return {
            prompt: [prompt, promptText, upstreamText].filter(Boolean).join("\n\n"),
            referenceImages,
            referenceVideos,
            referenceAudios,
            textCount: promptNode ? 1 : 0,
            imageCount: referenceImages.length,
            videoCount: referenceVideos.length,
            audioCount: referenceAudios.length,
            ...(isVideoGeneration ? { videoMode, videoFrameSlots: videoMode === "frames" ? slotReferences.frames : [] } : {}),
        };
    }
    if (sourceNode?.type === CanvasNodeType.SpeechGeneration || sourceNode?.type === CanvasNodeType.MusicGeneration) {
        const isSpeech = sourceNode.type === CanvasNodeType.SpeechGeneration;
        const promptNode = connectedPromptNode(sourceNode.id, nodes, connections, [isSpeech ? CanvasNodeType.SpeechPrompt : CanvasNodeType.MusicPrompt]);
        const promptText = promptNode?.metadata?.prompt?.trim() || "";
        const resourceInputs = promptNode && isSpeech ? flattenGenerationInputs(buildNodeGenerationInputs(promptNode.id, nodes, connections)) : [];
        const referenceAudios = resourceInputs.map((input) => input.audio).filter((audio): audio is ReferenceAudio => Boolean(audio));
        return {
            prompt: [prompt, promptText].filter(Boolean).join("\n\n"),
            referenceImages: [],
            referenceVideos: [],
            referenceAudios,
            textCount: promptNode ? 1 : 0,
            imageCount: 0,
            videoCount: 0,
            audioCount: referenceAudios.length,
        };
    }
    const inputs = buildNodeGenerationInputs(nodeId, nodes, connections);
    if (sourceNode?.type === CanvasNodeType.Config && Boolean(sourceNode.metadata?.composerContent?.trim())) {
        return buildComposerGenerationContext(inputs, prompt);
    }

    const resourceInputs = flattenGenerationInputs(inputs);
    let textIndex = 0;
    const upstreamText = resourceInputs.flatMap((input) => (input.text ? [textBlock(generationLabel("text", textIndex++), input.text)] : [])).join("\n\n");
    const referenceImages = resourceInputs.map((input) => input.image).filter((image): image is ReferenceImage => Boolean(image));
    const referenceVideos = resourceInputs.map((input) => input.video).filter((video): video is ReferenceVideo => Boolean(video));
    const referenceAudios = resourceInputs.map((input) => input.audio).filter((audio): audio is ReferenceAudio => Boolean(audio));

    return {
        prompt: upstreamText ? `${prompt}\n\n${upstreamText}` : prompt,
        referenceImages,
        referenceVideos,
        referenceAudios,
        textCount: resourceInputs.filter((input) => input.type === "text").length,
        imageCount: referenceImages.length,
        videoCount: referenceVideos.length,
        audioCount: referenceAudios.length,
    };
}

function buildComposerGenerationContext(inputs: NodeGenerationInput[], prompt: string): NodeGenerationContext {
    const inputByNodeId = new Map(inputs.map((input) => [input.nodeId, input]));
    const selectedInputs: NodeGenerationResourceInput[] = [];
    const labelByNodeId = new Map<string, string>();
    const textBlocks: string[] = [];
    const counts = { image: 0, video: 0, audio: 0, text: 0 };
    let hasToken = false;
    let lastIndex = 0;
    let nextPrompt = "";

    for (const match of prompt.matchAll(/@\[node:([^\]]+)\]/g)) {
        if (match.index === undefined) continue;
        hasToken = true;
        nextPrompt += prompt.slice(lastIndex, match.index);
        const input = inputByNodeId.get(match[1]);
        if (input) {
            const labels = [input].map((resource) => {
                let label = labelByNodeId.get(resource.nodeId);
                if (!label) {
                    label = generationLabel(resource.type, counts[resource.type]++);
                    labelByNodeId.set(resource.nodeId, label);
                    if (resource.type === "text") textBlocks.push(textBlock(label, resource.text || ""));
                    else selectedInputs.push(resource);
                }
                return resource.type === "text" ? `【${label}】` : label;
            });
            nextPrompt += labels.join("、");
        }
        lastIndex = match.index + match[0].length;
    }

    nextPrompt += prompt.slice(lastIndex);
    if (textBlocks.length) nextPrompt = `${nextPrompt.trim()}\n\n${textBlocks.join("\n\n")}`;
    const referenceImages = selectedInputs.map((input) => input.image).filter((image): image is ReferenceImage => Boolean(image));
    const referenceVideos = selectedInputs.map((input) => input.video).filter((video): video is ReferenceVideo => Boolean(video));
    const referenceAudios = selectedInputs.map((input) => input.audio).filter((audio): audio is ReferenceAudio => Boolean(audio));

    if (!hasToken) {
        return {
            prompt,
            referenceImages: [],
            referenceVideos: [],
            referenceAudios: [],
            textCount: 0,
            imageCount: 0,
            videoCount: 0,
            audioCount: 0,
        };
    }

    return {
        prompt: nextPrompt,
        referenceImages,
        referenceVideos,
        referenceAudios,
        textCount: counts.text,
        imageCount: referenceImages.length,
        videoCount: referenceVideos.length,
        audioCount: referenceAudios.length,
    };
}

export function buildNodeGenerationInputs(nodeId: string, nodes: CanvasNodeData[], connections: CanvasConnection[]): NodeGenerationInput[] {
    const sourceNode = nodes.find((node) => node.id === nodeId);
    if (sourceNode?.type === CanvasNodeType.ImageGeneration || sourceNode?.type === CanvasNodeType.VideoGeneration) {
        const promptNode = connectedPromptNode(sourceNode.id, nodes, connections, sourceNode.type === CanvasNodeType.VideoGeneration ? [CanvasNodeType.VideoPrompt] : [CanvasNodeType.Prompt]);
        return promptNode ? readNodeGenerationResource(promptNode) : [];
    }
    return getGenerationResourceNodes(nodeId, nodes, connections).flatMap(readNodeGenerationResource);
}

function connectedPromptNode(nodeId: string, nodes: CanvasNodeData[], connections: CanvasConnection[], types: CanvasNodeType[] = [CanvasNodeType.Prompt]) {
    return connections
        .filter((connection) => connection.toNodeId === nodeId)
        .map((connection) => nodes.find((item) => item.id === connection.fromNodeId))
        .find((item): item is CanvasNodeData => Boolean(item && types.includes(item.type as CanvasNodeType)));
}

function flattenGenerationInputs(inputs: NodeGenerationInput[]) {
    return [...new Map(inputs.map((input) => [input.nodeId, input])).values()];
}

function readNodeGenerationResource(node: CanvasNodeData): NodeGenerationResourceInput[] {
    if (node.type === CanvasNodeType.SmartCanvas) {
        return [{ nodeId: node.id, type: "image", title: node.title, image: { id: node.id, name: `${node.title || node.id}.png`, type: "image/png", dataUrl: "" } }];
    }
    const image = readReferenceImage(node);
    if (image) return [{ nodeId: node.id, type: "image", title: node.title, image }];
    const video = readReferenceVideo(node);
    if (video) return [{ nodeId: node.id, type: "video", title: node.title, video }];
    const audio = readReferenceAudio(node);
    if (audio) return [{ nodeId: node.id, type: "audio", title: node.title, audio }];
    const resource = getNodeDefinition(node.type)?.resource?.(node);
    if (resource?.kind === "image" && resource.url) return [{ nodeId: node.id, type: "image", title: node.title, image: { id: node.id, name: `${node.title || node.id}.png`, type: node.metadata?.mimeType || "image/png", dataUrl: resource.url, storageKey: node.metadata?.storageKey } }];
    if (resource?.kind === "video" && resource.url) return [{ nodeId: node.id, type: "video", title: node.title, video: { id: node.id, name: `${node.title || node.id}.mp4`, type: node.metadata?.mimeType || "video/mp4", url: resource.url, storageKey: node.metadata?.storageKey } }];
    if (resource?.kind === "audio" && resource.url) return [{ nodeId: node.id, type: "audio", title: node.title, audio: { id: node.id, name: `${node.title || node.id}.mp3`, type: node.metadata?.mimeType || "audio/mpeg", url: resource.url, storageKey: node.metadata?.storageKey } }];
    if (resource?.kind === "text" && resource.text) return [{ nodeId: node.id, type: "text", title: node.title, text: resource.text }];
    const text = readNodeTextInput(node);
    return text ? [{ nodeId: node.id, type: "text", title: node.title, text }] : [];
}

export function buildNodeResponseMessages(context: NodeGenerationContext): AiTextMessage[] {
    if (!context.referenceImages.length) {
        return [{ role: "user", content: context.prompt }];
    }

    return [
        {
            role: "user",
            content: [{ type: "text" as const, text: context.prompt }, ...context.referenceImages.map((image) => ({ type: "image_url" as const, image_url: { url: image.dataUrl } }))],
        },
    ];
}

export async function hydrateNodeGenerationContext(context: NodeGenerationContext, nodes: CanvasNodeData[] = []) {
    const { imageToDataUrl } = await import("@/services/image-storage");
    const { composeSmartCanvas } = await import("@/lib/canvas/smart-canvas");
    const referenceImages = (
        await Promise.all(
            context.referenceImages.map(async (image): Promise<ReferenceImage | null> => {
                const board = nodes.find((node) => node.id === image.id && node.type === CanvasNodeType.SmartCanvas);
                if (!board) return { ...image, dataUrl: await imageToDataUrl(image) };
                const composed = await composeSmartCanvas(board, nodes);
                return composed.dataUrl ? { ...image, dataUrl: composed.dataUrl } : null;
            }),
        )
    ).filter((image): image is ReferenceImage => Boolean(image));
    return { ...context, referenceImages };
}

function readNodeTextInput(node: CanvasNodeData) {
    if (node.type === CanvasNodeType.Text) return node.metadata?.content || node.metadata?.prompt || "";
    return node.metadata?.prompt || "";
}

function textBlock(label: string, text: string) {
    return `【${label}】\n${text}`;
}

function generationLabel(type: NodeGenerationResourceInput["type"], index: number) {
    if (type === "image") return imageReferenceLabel(index);
    if (type === "video") return i18n.t("canvas.configNode.videoReferences") + ` ${index + 1}`;
    if (type === "audio") return i18n.t("canvas.configNode.audioReferences") + ` ${index + 1}`;
    return i18n.t("canvas.composer.resources.text", { index: index + 1 });
}

type VideoSlotReferences = {
    images: ReferenceImage[];
    videos: ReferenceVideo[];
    audios: ReferenceAudio[];
    frames: VideoFrameReference[];
};

const EMPTY_VIDEO_SLOT_REFERENCES: VideoSlotReferences = { images: [], videos: [], audios: [], frames: [] };

/** Read the bound slot nodes by their own kind; frames keep their explicit first/last identity. */
function readVideoSlotReferences(promptNode: CanvasNodeData | undefined, nodes: CanvasNodeData[]): VideoSlotReferences {
    const slots = promptNode?.metadata?.videoSlots;
    if (!promptNode || !slots) return EMPTY_VIDEO_SLOT_REFERENCES;
    const nodesById = new Map(nodes.map((node) => [node.id, node]));
    const readNode = (id: string | undefined) => (id ? nodesById.get(id) : undefined);
    if (normalizeVideoMode(promptNode.metadata?.videoMode) === "reference") {
        const items = (slots.references || []).map(readNode).filter((node): node is CanvasNodeData => Boolean(node));
        return {
            images: items.map(readReferenceImage).filter((image): image is ReferenceImage => Boolean(image)),
            videos: items.map(readReferenceVideo).filter((video): video is ReferenceVideo => Boolean(video)),
            audios: items.map(readReferenceAudio).filter((audio): audio is ReferenceAudio => Boolean(audio)),
            frames: [],
        };
    }
    const frameSlots: Array<[string | undefined, "first_frame" | "last_frame"]> = [
        [slots.firstFrame, "first_frame"],
        [slots.lastFrame, "last_frame"],
    ];
    const frames = frameSlots.flatMap(([id, frameType]) => {
        const node = readNode(id);
        const image = node ? readReferenceImage(node) : null;
        return image ? [{ nodeId: image.id, frameType, image }] : [];
    });
    return {
        images: frames.map((frame) => frame.image),
        videos: [],
        audios: [],
        frames: frames.map(({ nodeId, frameType }) => ({ nodeId, frameType })),
    };
}

function readReferenceImage(node: CanvasNodeData): ReferenceImage | null {
    if (node.type !== CanvasNodeType.Image || !node.metadata?.content) return null;
    return {
        id: node.id,
        name: `${node.title || node.id}.png`,
        type: node.metadata.mimeType || "image/png",
        dataUrl: node.metadata.content,
        storageKey: node.metadata.storageKey,
    };
}

function readReferenceVideo(node: CanvasNodeData): ReferenceVideo | null {
    if (node.type !== CanvasNodeType.Video || !node.metadata?.content) return null;
    return {
        id: node.id,
        name: `${node.title || node.id}.mp4`,
        type: node.metadata.mimeType || "video/mp4",
        url: node.metadata.content,
        storageKey: node.metadata.storageKey,
        bytes: node.metadata.bytes,
        width: node.metadata.naturalWidth,
        height: node.metadata.naturalHeight,
        durationMs: node.metadata.durationMs,
    };
}

function readReferenceAudio(node: CanvasNodeData): ReferenceAudio | null {
    if (node.type !== CanvasNodeType.Audio || !node.metadata?.content) return null;
    return {
        id: node.id,
        name: `${node.title || node.id}.mp3`,
        type: node.metadata.mimeType || "audio/mpeg",
        url: node.metadata.content,
        storageKey: node.metadata.storageKey,
        durationMs: node.metadata.durationMs,
    };
}
