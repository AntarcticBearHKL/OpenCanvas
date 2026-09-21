import { applyOps, type CanvasToolRequest } from "./shared";

export function connectNodes(input: Record<string, unknown>): CanvasToolRequest {
    const data = input as { connections: Array<{ fromNodeId: string; toNodeId: string }> };
    return applyOps(data.connections.map((connection) => ({ type: "connect_nodes", ...connection })));
}

export function selectNodes(input: Record<string, unknown>): CanvasToolRequest {
    return applyOps([{ type: "select_nodes", ids: (input as { ids: string[] }).ids }]);
}

export function setViewport(input: Record<string, unknown>): CanvasToolRequest {
    return applyOps([{ type: "set_viewport", viewport: (input as { viewport: unknown }).viewport }]);
}
