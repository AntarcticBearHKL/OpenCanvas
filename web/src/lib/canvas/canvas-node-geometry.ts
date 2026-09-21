import { CanvasNodeType, type CanvasNodeData, type CanvasNodeTypeId, type ConnectionHandle } from "@/types/canvas";
import { resolveCanvasDropBinding } from "@/lib/canvas/canvas-drop-bindings";

export function nodeBounds(nodes: CanvasNodeData[]) {
    return nodes.reduce(
        (acc, node) => ({
            left: Math.min(acc.left, node.position.x),
            top: Math.min(acc.top, node.position.y),
            right: Math.max(acc.right, node.position.x + node.width),
            bottom: Math.max(acc.bottom, node.position.y + node.height),
        }),
        { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity },
    );
}

export const CANVAS_GRID_SIZE = 16;

export function snapDragToGuides(initialNodes: { id: string; x: number; y: number }[], nodes: CanvasNodeData[], dx: number, dy: number, threshold: number, gridSize = 0) {
    const movedIds = new Set(initialNodes.map((item) => item.id));
    const moved = nodes.filter((node) => movedIds.has(node.id));
    if (!moved.length) return { dx, dy, guides: { x: [], y: [] } };
    const bounds = moved.reduce(
        (acc, node) => {
            const start = initialNodes.find((item) => item.id === node.id)!;
            return {
                left: Math.min(acc.left, start.x + dx),
                top: Math.min(acc.top, start.y + dy),
                right: Math.max(acc.right, start.x + dx + node.width),
                bottom: Math.max(acc.bottom, start.y + dy + node.height),
            };
        },
        { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity },
    );
    const draggedX = [bounds.left, (bounds.left + bounds.right) / 2, bounds.right];
    const draggedY = [bounds.top, (bounds.top + bounds.bottom) / 2, bounds.bottom];
    let snapX: { diff: number; line: number } | null = null;
    let snapY: { diff: number; line: number } | null = null;
    for (const node of nodes) {
        if (movedIds.has(node.id)) continue;
        for (const line of [node.position.x, node.position.x + node.width / 2, node.position.x + node.width]) {
            for (const value of draggedX) {
                const diff = line - value;
                if (Math.abs(diff) <= threshold && (!snapX || Math.abs(diff) < Math.abs(snapX.diff))) snapX = { diff, line };
            }
        }
        for (const line of [node.position.y, node.position.y + node.height / 2, node.position.y + node.height]) {
            for (const value of draggedY) {
                const diff = line - value;
                if (Math.abs(diff) <= threshold && (!snapY || Math.abs(diff) < Math.abs(snapY.diff))) snapY = { diff, line };
            }
        }
    }
    const applyAxis = (delta: number, edge: number, snap: { diff: number } | null) => (snap ? delta + snap.diff : gridSize > 0 ? delta + (Math.round(edge / gridSize) * gridSize - edge) : delta);
    return { dx: applyAxis(dx, bounds.left, snapX), dy: applyAxis(dy, bounds.top, snapY), guides: { x: snapX ? [snapX.line] : [], y: snapY ? [snapY.line] : [] } };
}

export function nodeCenterInside(node: CanvasNodeData, rect: CanvasNodeData) {
    const centerX = node.position.x + node.width / 2;
    const centerY = node.position.y + node.height / 2;
    return centerX >= rect.position.x && centerX <= rect.position.x + rect.width && centerY >= rect.position.y && centerY <= rect.position.y + rect.height;
}

export function isNodeLocked(node: CanvasNodeData) {
    return Boolean(node.metadata?.locked);
}

export function isNodeHidden(node: CanvasNodeData) {
    return Boolean(node.metadata?.hidden);
}

export function filterNodesByType(nodes: CanvasNodeData[], type: string) {
    return type === "all" ? nodes : nodes.filter((node) => node.type === type);
}

export function bulkRenameTitles(ids: string[], title: string) {
    const name = title.trim();
    if (!name || !ids.length) return new Map<string, string>();
    return new Map(ids.map((id, index) => [id, ids.length > 1 ? `${name} ${index + 1}` : name]));
}

export function isBoardDescendant(candidateId: string, ancestorId: string, nodes: CanvasNodeData[]) {
    const visited = new Set<string>();
    const pending = [ancestorId];
    while (pending.length) {
        const boardId = pending.pop()!;
        if (visited.has(boardId)) continue;
        visited.add(boardId);
        const layers = nodes.find((node) => node.id === boardId)?.metadata?.boardLayers ?? [];
        for (const layer of layers) {
            if (layer.sourceNodeId === candidateId) return true;
            if (layer.sourceNodeId) pending.push(layer.sourceNodeId);
        }
    }
    return false;
}

export function findBoardDropTarget(movedIds: Set<string>, nodes: CanvasNodeData[]) {
    const movingNodes = nodes.filter((node) => movedIds.has(node.id) && (node.type === CanvasNodeType.Image || node.type === CanvasNodeType.SmartCanvas));
    if (!movingNodes.length) return null;
    const movedBoardIds = movingNodes.filter((node) => node.type === CanvasNodeType.SmartCanvas).map((node) => node.id);
    return (
        [...nodes].reverse().find((board) => {
            if (board.type !== CanvasNodeType.SmartCanvas || movedIds.has(board.id)) return false;
            if (movedBoardIds.some((movedId) => isBoardDescendant(board.id, movedId, nodes))) return false;
            return movingNodes.some((node) => nodeCenterInside(node, board));
        }) || null
    );
}

function findDropTargetForSource(movedIds: Set<string>, nodes: CanvasNodeData[], sourceType: CanvasNodeTypeId, targetType?: CanvasNodeTypeId) {
    const movingNodes = nodes.filter((node) => movedIds.has(node.id) && node.type === sourceType);
    if (!movingNodes.length) return null;
    return [...nodes].reverse().find((target) => !movedIds.has(target.id) && (!targetType || target.type === targetType) && resolveCanvasDropBinding(sourceType, target.type) !== null && movingNodes.some((node) => nodeCenterInside(node, target))) || null;
}

export function findAssetsDropTarget(movedIds: Set<string>, nodes: CanvasNodeData[]) {
    return findDropTargetForSource(movedIds, nodes, CanvasNodeType.Image, CanvasNodeType.Assets);
}

export function findImageModifierDropTarget(movedIds: Set<string>, nodes: CanvasNodeData[]) {
    return findDropTargetForSource(movedIds, nodes, CanvasNodeType.Image, CanvasNodeType.ImageModifier);
}

export function findAudioProjectDropTarget(movedIds: Set<string>, nodes: CanvasNodeData[]) {
    return findDropTargetForSource(movedIds, nodes, CanvasNodeType.Audio, CanvasNodeType.AudioProject);
}

export function getConnectionTargetAnchor(node: CanvasNodeData, current: ConnectionHandle) {
    return {
        x: current.handleType === "source" ? node.position.x : node.position.x + node.width,
        y: node.position.y + node.height / 2,
    };
}

const PROMPT_TARGETS: Partial<Record<CanvasNodeTypeId, CanvasNodeTypeId>> = {
    [CanvasNodeType.Prompt]: CanvasNodeType.ImageGeneration,
    [CanvasNodeType.MusicPrompt]: CanvasNodeType.MusicGeneration,
    [CanvasNodeType.SpeechPrompt]: CanvasNodeType.SpeechGeneration,
    [CanvasNodeType.VideoPrompt]: CanvasNodeType.VideoGeneration,
};

const GENERATOR_PROMPTS: Partial<Record<CanvasNodeTypeId, CanvasNodeTypeId>> = {
    [CanvasNodeType.ImageGeneration]: CanvasNodeType.Prompt,
    [CanvasNodeType.MusicGeneration]: CanvasNodeType.MusicPrompt,
    [CanvasNodeType.SpeechGeneration]: CanvasNodeType.SpeechPrompt,
    [CanvasNodeType.VideoGeneration]: CanvasNodeType.VideoPrompt,
};

function isPromptConnectionAllowed(fromType: CanvasNodeTypeId, toType: CanvasNodeTypeId) {
    const fromPrompt = PROMPT_TARGETS[fromType];
    if (fromPrompt) return GENERATOR_PROMPTS[toType] ? fromPrompt === toType : !PROMPT_TARGETS[toType];
    const toPrompt = PROMPT_TARGETS[toType];
    if (toPrompt) return !GENERATOR_PROMPTS[fromType] || GENERATOR_PROMPTS[fromType] === toType;
    return true;
}

export function normalizeConnection(firstNodeId: string, secondNodeId: string, nodes: CanvasNodeData[], firstHandleType: "source" | "target") {
    const first = nodes.find((node) => node.id === firstNodeId);
    const second = nodes.find((node) => node.id === secondNodeId);
    if (!first || !second || first.id === second.id) return null;
    if (first.type === CanvasNodeType.Recording || second.type === CanvasNodeType.Recording) return null;
    const isGenerationSink = (type: CanvasNodeTypeId) => type === CanvasNodeType.Config || type === CanvasNodeType.ImageGeneration || type === CanvasNodeType.SpeechGeneration || type === CanvasNodeType.MusicGeneration || type === CanvasNodeType.VideoGeneration;
    if (isGenerationSink(first.type) && isGenerationSink(second.type)) return null;
    const toSecond = isGenerationSink(second.type) || !isGenerationSink(first.type) || firstHandleType === "source";
    const fromNode = toSecond ? first : second;
    const toNode = toSecond ? second : first;
    if (toNode.type === CanvasNodeType.Image) return null;
    if (!isPromptConnectionAllowed(fromNode.type, toNode.type)) return null;
    return { fromNodeId: fromNode.id, toNodeId: toNode.id };
}
