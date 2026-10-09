import { videoReferenceKind } from "@/lib/canvas/canvas-drop-bindings";
import { VIDEO_REFERENCE_LIMITS, VIDEO_REFERENCE_TOTAL_LIMIT, openRouterVideoModels, videoFrameImageLimit, type VideoReferenceKind } from "@/lib/video-generation";
import { CanvasNodeType, type CanvasConnection, type CanvasNodeData, type CanvasVideoSlot, type CanvasVideoSlots } from "@/types/canvas";

/** The keyframe limit lives on the video generation node, so resolve it through the prompt node's outgoing connection. */
export function videoPromptFrameLimit(nodeId: string, nodes: CanvasNodeData[], connections: CanvasConnection[]): number {
    const generation = connections
        .filter((connection) => connection.fromNodeId === nodeId)
        .map((connection) => nodes.find((node) => node.id === connection.toNodeId))
        .find((node) => node?.type === CanvasNodeType.VideoGeneration);
    return videoFrameImageLimit(generation?.metadata?.model || openRouterVideoModels[0].value);
}

/**
 * Shared video-slot drop binding used by both the canvas page and the agent op
 * reducer: keyframe slots take images only, references respect per-kind limits,
 * and a single-keyframe model clears the paired keyframe.
 */
export function bindVideoSlot(targetId: string, slot: CanvasVideoSlot, sourceId: string, nodes: CanvasNodeData[], connections: CanvasConnection[]): CanvasVideoSlots | null {
    const target = nodes.find((node) => node.id === targetId && node.type === CanvasNodeType.VideoPrompt);
    const source = nodes.find((node) => node.id === sourceId);
    if (!target || !source || target.id === source.id) return null;
    const kind: VideoReferenceKind | null = videoReferenceKind(source.type);
    if (!kind) return null;
    const current = target.metadata?.videoSlots || {};
    const singleKeyframe = videoPromptFrameLimit(targetId, nodes, connections) <= 1 ? { firstFrame: undefined, lastFrame: undefined } : {};
    if (slot === "firstFrame") return kind === "image" ? { ...current, ...singleKeyframe, firstFrame: sourceId } : null;
    if (slot === "lastFrame") return kind === "image" ? { ...current, ...singleKeyframe, lastFrame: sourceId } : null;
    const references = current.references || [];
    if (references.includes(sourceId) || references.length >= VIDEO_REFERENCE_TOTAL_LIMIT) return null;
    const kinds = references.map((id) => {
        const node = nodes.find((item) => item.id === id);
        return node ? videoReferenceKind(node.type) : null;
    });
    if (kinds.filter((item) => item === kind).length >= VIDEO_REFERENCE_LIMITS[kind]) return null;
    // Native models reject audio-only reference sets.
    if (kind === "audio" && !kinds.some((item) => item === "image" || item === "video")) return null;
    return { ...current, references: [...references, sourceId] };
}
