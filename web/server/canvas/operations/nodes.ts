import crypto from "node:crypto";

import { nextCanvasX } from "../tools";
import type { CanvasNodeType, CanvasSnapshot } from "../types";
import { applyOps, findNode, textNodeOp, type CanvasToolRequest } from "./shared";

export function createNode(input: Record<string, unknown>, state: CanvasSnapshot | null): CanvasToolRequest {
    const data = input as { nodeType: CanvasNodeType; title?: string; x?: number; y?: number; width?: number; height?: number; metadata?: Record<string, unknown> };
    return applyOps([{ type: "add_node", nodeType: data.nodeType, title: data.title, position: { x: data.x ?? nextCanvasX(state), y: data.y ?? 0 }, width: data.width, height: data.height, metadata: data.metadata }]);
}

export function createTextNode(input: Record<string, unknown>, state: CanvasSnapshot | null): CanvasToolRequest {
    const data = input as { text?: string; x?: number; y?: number; title?: string; width?: number; height?: number };
    return applyOps([textNodeOp(data, data.x ?? nextCanvasX(state), data.y ?? 0)]);
}

export function createTextNodes(input: Record<string, unknown>, state: CanvasSnapshot | null): CanvasToolRequest {
    const data = input as { items: Array<{ text: string; title?: string; x?: number; y?: number; width?: number; height?: number }>; x?: number; y?: number; gap?: number; direction?: "row" | "column" };
    const x = Number(data.x ?? nextCanvasX(state));
    const y = Number(data.y ?? 0);
    const gap = Number(data.gap ?? 40);
    return applyOps(data.items.map((item, index) => textNodeOp(item, item.x ?? (data.direction === "row" ? x + index * (340 + gap) : x), item.y ?? (data.direction === "row" ? y : y + index * (240 + gap)))));
}

export function updateNode(input: Record<string, unknown>): CanvasToolRequest {
    const data = input as { id: string; patch?: Record<string, unknown>; metadata?: Record<string, unknown> };
    return applyOps([{ type: "update_node", id: data.id, patch: data.patch, metadata: data.metadata }]);
}

export function updateNodeText(input: Record<string, unknown>): CanvasToolRequest {
    const data = input as { id: string; text: string; title?: string };
    return applyOps([{ type: "update_node", id: data.id, patch: { ...(data.title ? { title: data.title } : {}) }, metadata: { content: data.text, status: "success" } }]);
}

export function moveNodes(input: Record<string, unknown>, state: CanvasSnapshot | null): CanvasToolRequest {
    const data = input as { items: Array<{ id: string; x?: number; y?: number; dx?: number; dy?: number }> };
    return applyOps(data.items.map((item) => {
        const current = findNode(state, item.id);
        return { type: "update_node", id: item.id, patch: { position: { x: item.x ?? ((current?.position.x || 0) + (item.dx || 0)), y: item.y ?? ((current?.position.y || 0) + (item.dy || 0)) } } };
    }));
}

export function resizeNode(input: Record<string, unknown>): CanvasToolRequest {
    const data = input as { id: string; width: number; height: number; freeResize?: boolean };
    return applyOps([{ type: "update_node", id: data.id, patch: { width: data.width, height: data.height }, metadata: data.freeResize === undefined ? undefined : { freeResize: data.freeResize } }]);
}

export function setNodeFlags(input: Record<string, unknown>): CanvasToolRequest {
    const data = input as { ids: string[]; locked?: boolean; hidden?: boolean };
    const metadata: Record<string, unknown> = {};
    if (data.locked !== undefined) metadata.locked = data.locked;
    if (data.hidden !== undefined) metadata.hidden = data.hidden;
    if (!Object.keys(metadata).length) throw new Error("locked 与 hidden 至少需要一个");
    return applyOps(data.ids.map((id) => ({ type: "update_node", id, metadata })));
}

export function bulkRename(input: Record<string, unknown>): CanvasToolRequest {
    const data = input as { ids: string[]; title: string };
    const title = data.title.trim();
    if (!title) return applyOps([]);
    return applyOps(data.ids.map((id, index) => ({ type: "update_node", id, patch: { title: data.ids.length > 1 ? `${title} ${index + 1}` : title } })));
}

export function duplicateNode(input: Record<string, unknown>, state: CanvasSnapshot | null): CanvasToolRequest {
    const data = input as { id: string; dx?: number; dy?: number };
    const source = findNode(state, data.id);
    if (!source) return applyOps([]);
    const copyId = `copy-${crypto.randomUUID()}`;
    return applyOps([
        { type: "add_node", id: copyId, nodeType: source.type, title: source.title, position: { x: source.position.x + (data.dx ?? 40), y: source.position.y + (data.dy ?? 40) }, width: source.width, height: source.height, metadata: source.metadata },
        { type: "select_nodes", ids: [copyId] },
    ]);
}

export function deleteNodes(input: Record<string, unknown>): CanvasToolRequest {
    return applyOps([{ type: "delete_node", ids: (input as { ids: string[] }).ids }]);
}
