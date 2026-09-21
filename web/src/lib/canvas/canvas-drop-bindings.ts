import { CanvasNodeType, type CanvasNodeTypeId } from "@/types/canvas";
import type { VideoReferenceKind } from "@/lib/video-generation";

type CanvasDropBinding = "collect" | "modify" | "slot" | "track";

type CanvasDropRule = { sourceType: CanvasNodeTypeId; targetType: CanvasNodeTypeId; binding: CanvasDropBinding };

const CANVAS_DROP_RULES: CanvasDropRule[] = [
    { sourceType: CanvasNodeType.Image, targetType: CanvasNodeType.Assets, binding: "collect" },
    { sourceType: CanvasNodeType.Image, targetType: CanvasNodeType.ImageModifier, binding: "modify" },
    { sourceType: CanvasNodeType.Image, targetType: CanvasNodeType.VideoPrompt, binding: "slot" },
    { sourceType: CanvasNodeType.Video, targetType: CanvasNodeType.VideoPrompt, binding: "slot" },
    { sourceType: CanvasNodeType.Audio, targetType: CanvasNodeType.VideoPrompt, binding: "slot" },
    { sourceType: CanvasNodeType.Audio, targetType: CanvasNodeType.AudioProject, binding: "track" },
];

export function resolveCanvasDropBinding(sourceType: CanvasNodeTypeId, targetType: CanvasNodeTypeId): CanvasDropBinding | null {
    return CANVAS_DROP_RULES.find((rule) => rule.sourceType === sourceType && rule.targetType === targetType)?.binding ?? null;
}

/** Node types that can be dragged onto a drop target; these drag with a small cursor ghost. */
export function isCanvasDropSourceType(nodeType: CanvasNodeTypeId) {
    return CANVAS_DROP_RULES.some((rule) => rule.sourceType === nodeType);
}

/** Kind of a canvas node when it is attached to a video reference slot. */
export function videoReferenceKind(nodeType: CanvasNodeTypeId): VideoReferenceKind | null {
    if (nodeType === CanvasNodeType.Image) return "image";
    if (nodeType === CanvasNodeType.Video) return "video";
    if (nodeType === CanvasNodeType.Audio) return "audio";
    return null;
}
