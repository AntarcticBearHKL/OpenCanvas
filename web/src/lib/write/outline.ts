import { childKindOf, isDocUnitKind } from "@/lib/write/presets";
import type { OutlineNode, OutlineStatus, WritingProject } from "@/types/writing";

export type FlatOutlineRow = { node: OutlineNode; depth: number };

export function findNode(nodes: OutlineNode[], id: string | null | undefined) {
    return id ? nodes.find((node) => node.id === id) ?? null : null;
}

export function siblingNodes(nodes: OutlineNode[], parentId: string | null) {
    return nodes.filter((node) => node.parentId === parentId).sort((a, b) => a.order - b.order);
}

export function descendantIds(nodes: OutlineNode[], id: string): Set<string> {
    const ids = new Set<string>();
    const walk = (parentId: string) => {
        nodes.forEach((node) => {
            if (node.parentId === parentId && !ids.has(node.id)) {
                ids.add(node.id);
                walk(node.id);
            }
        });
    };
    walk(id);
    return ids;
}

export function ancestorsOf(nodes: OutlineNode[], id: string): OutlineNode[] {
    const chain: OutlineNode[] = [];
    let current = findNode(nodes, id)?.parentId ?? null;
    while (current) {
        const node = findNode(nodes, current);
        if (!node) break;
        chain.push(node);
        current = node.parentId;
    }
    return chain.reverse();
}

/** Depth-first rows in display order; a collapsed set hides a subtree. */
export function flattenOutline(nodes: OutlineNode[], collapsed: Set<string> = new Set()): FlatOutlineRow[] {
    const rows: FlatOutlineRow[] = [];
    const walk = (parentId: string | null, depth: number) => {
        siblingNodes(nodes, parentId).forEach((node) => {
            rows.push({ node, depth });
            if (!collapsed.has(node.id)) walk(node.id, depth + 1);
        });
    };
    walk(null, 0);
    return rows;
}

export function nextOrder(nodes: OutlineNode[], parentId: string | null): number {
    const siblings = siblingNodes(nodes, parentId);
    return siblings.length ? siblings[siblings.length - 1].order + 1 : 0;
}

export function removeSubtree(nodes: OutlineNode[], id: string): OutlineNode[] {
    const doomed = descendantIds(nodes, id);
    doomed.add(id);
    return nodes.filter((node) => !doomed.has(node.id));
}

/** Reorders a node inside its new parent; orders are renumbered to stay dense. */
export function moveNode(nodes: OutlineNode[], id: string, parentId: string | null, index: number): OutlineNode[] {
    const moving = findNode(nodes, id);
    if (!moving) return nodes;
    if (parentId && (parentId === id || descendantIds(nodes, id).has(parentId))) return nodes;
    const rest = nodes.filter((node) => node.id !== id);
    const siblings = siblingNodes(rest, parentId);
    const clamped = Math.max(0, Math.min(index, siblings.length));
    siblings.splice(clamped, 0, { ...moving, parentId });
    const orderById = new Map(siblings.map((node, order) => [node.id, order]));
    return rest
        .map((node) => (orderById.has(node.id) ? { ...node, parentId, order: orderById.get(node.id) as number } : node))
        .concat({ ...moving, parentId, order: orderById.get(id) as number });
}

/** Every writing unit in narrative order, which is also reading order. */
export function docUnitNodes(project: WritingProject): OutlineNode[] {
    return flattenOutline(project.outline)
        .map((row) => row.node)
        .filter((node) => isDocUnitKind(project.template, node.kind));
}

export function previousDocUnits(project: WritingProject, outlineId: string, limit: number): OutlineNode[] {
    const units = docUnitNodes(project);
    const index = units.findIndex((node) => node.id === outlineId);
    return index <= 0 ? [] : units.slice(Math.max(0, index - limit), index);
}

export function isExpandable(project: WritingProject, node: OutlineNode): boolean {
    return childKindOf(project.template, node.kind) !== null;
}

export function docUnitFor(project: WritingProject, outlineId: string | null): OutlineNode | null {
    let current = findNode(project.outline, outlineId);
    while (current) {
        if (isDocUnitKind(project.template, current.kind)) return current;
        current = findNode(project.outline, current.parentId);
    }
    return null;
}

export function outlineStats(project: WritingProject) {
    const units = docUnitNodes(project);
    const words = Object.values(project.docs).reduce((sum, doc) => sum + (doc.wordCount || 0), 0);
    const byStatus = (status: OutlineStatus) => project.outline.filter((node) => node.status === status).length;
    return { words, units: units.length, done: byStatus("done"), draft: byStatus("draft"), idea: byStatus("idea"), revised: byStatus("revised") };
}
