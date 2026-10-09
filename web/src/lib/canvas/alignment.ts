import type { CanvasNodeData, Position } from "@/types/canvas";

export type AlignAxis = "left" | "center-x" | "right" | "top" | "center-y" | "bottom" | "distribute-x" | "distribute-y";

function selectionBounds(nodes: CanvasNodeData[]) {
    const left = Math.min(...nodes.map((node) => node.position.x));
    const top = Math.min(...nodes.map((node) => node.position.y));
    const right = Math.max(...nodes.map((node) => node.position.x + node.width));
    const bottom = Math.max(...nodes.map((node) => node.position.y + node.height));
    return { left, top, right, bottom, width: right - left, height: bottom - top };
}

function distribute(nodes: CanvasNodeData[], horizontal: boolean) {
    const sorted = [...nodes].sort((a, b) => (horizontal ? a.position.x - b.position.x : a.position.y - b.position.y));
    const positions = new Map<string, Position>();
    if (sorted.length < 3) return positions;
    const bounds = selectionBounds(sorted);
    const sizeKey = horizontal ? "width" : "height";
    const used = sorted.reduce((total, node) => total + node[sizeKey], 0);
    const gap = ((horizontal ? bounds.width : bounds.height) - used) / (sorted.length - 1);
    let cursor = horizontal ? bounds.left : bounds.top;
    for (const node of sorted) {
        positions.set(node.id, { x: horizontal ? Math.round(cursor) : node.position.x, y: horizontal ? node.position.y : Math.round(cursor) });
        cursor += node[sizeKey] + gap;
    }
    return positions;
}

export function alignNodes(nodes: CanvasNodeData[], selectedIds: Set<string>, axis: AlignAxis) {
    const selected = nodes.filter((node) => selectedIds.has(node.id));
    const positions = new Map<string, Position>();
    if (selected.length < 2) return positions;

    if (axis === "distribute-x") return distribute(selected, true);
    if (axis === "distribute-y") return distribute(selected, false);

    const bounds = selectionBounds(selected);
    for (const node of selected) {
        const x = axis === "left" ? bounds.left : axis === "center-x" ? bounds.left + (bounds.width - node.width) / 2 : axis === "right" ? bounds.right - node.width : node.position.x;
        const y = axis === "top" ? bounds.top : axis === "center-y" ? bounds.top + (bounds.height - node.height) / 2 : axis === "bottom" ? bounds.bottom - node.height : node.position.y;
        positions.set(node.id, { x: Math.round(x), y: Math.round(y) });
    }
    return positions;
}
