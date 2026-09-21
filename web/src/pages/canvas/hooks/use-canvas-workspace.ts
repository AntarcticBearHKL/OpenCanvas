import { useMemo } from "react";

import { CanvasNodeType, type CanvasNodeData } from "@/types/canvas";

export function useCanvasWorkspace(nodes: CanvasNodeData[], selectedNodeIds: Set<string>) {
    const boards = useMemo(() => nodes.filter((node) => node.type === CanvasNodeType.SmartCanvas), [nodes]);
    const audioProjects = useMemo(() => nodes.filter((node) => node.type === CanvasNodeType.AudioProject), [nodes]);
    const selectedId = selectedNodeIds.size === 1 ? Array.from(selectedNodeIds)[0] : "";
    const board = boards.find((item) => item.id === selectedId) || null;
    const audioProject = audioProjects.find((item) => item.id === selectedId) || null;
    return { board, boards, audioProject, audioProjects };
}
