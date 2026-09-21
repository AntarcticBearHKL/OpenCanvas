import type { CanvasNode, CanvasSnapshot } from "../types";
import { applyOps, findNode, type CanvasToolRequest } from "./shared";

type AlignMode = "left" | "center-x" | "right" | "top" | "center-y" | "bottom" | "distribute-x" | "distribute-y";

function alignOps(data: { ids: string[]; mode: AlignMode }, state: CanvasSnapshot | null) {
    const nodes = data.ids.map((id) => findNode(state, id)).filter((node): node is CanvasNode => node !== undefined);
    if (nodes.length < 2) return [];
    const left = Math.min(...nodes.map((node) => node.position.x));
    const top = Math.min(...nodes.map((node) => node.position.y));
    const right = Math.max(...nodes.map((node) => node.position.x + node.width));
    const bottom = Math.max(...nodes.map((node) => node.position.y + node.height));
    if (data.mode === "distribute-x" || data.mode === "distribute-y") {
        if (nodes.length < 3) return [];
        const horizontal = data.mode === "distribute-x";
        const sorted = [...nodes].sort((a, b) => (horizontal ? a.position.x - b.position.x : a.position.y - b.position.y));
        const used = sorted.reduce((total, node) => total + (horizontal ? node.width : node.height), 0);
        const gap = ((horizontal ? right - left : bottom - top) - used) / (sorted.length - 1);
        let cursor = horizontal ? left : top;
        return sorted.map((node) => {
            const position = { x: horizontal ? Math.round(cursor) : node.position.x, y: horizontal ? node.position.y : Math.round(cursor) };
            cursor += (horizontal ? node.width : node.height) + gap;
            return { type: "update_node", id: node.id, patch: { position } };
        });
    }
    return nodes.map((node) => {
        const x = data.mode === "left" ? left : data.mode === "center-x" ? left + (right - left - node.width) / 2 : data.mode === "right" ? right - node.width : node.position.x;
        const y = data.mode === "top" ? top : data.mode === "center-y" ? top + (bottom - top - node.height) / 2 : data.mode === "bottom" ? bottom - node.height : node.position.y;
        return { type: "update_node", id: node.id, patch: { position: { x: Math.round(x), y: Math.round(y) } } };
    });
}

export function alignNodes(input: Record<string, unknown>, state: CanvasSnapshot | null): CanvasToolRequest {
    return applyOps(alignOps(input as { ids: string[]; mode: AlignMode }, state));
}
