import type { OutlineNode, WritingProject } from "@/types/writing";

export function findNode(nodes: OutlineNode[], id: string | null | undefined) {
    return id ? nodes.find((node) => node.id === id) ?? null : null;
}

export function flattenOutline(nodes: OutlineNode[]): OutlineNode[] {
    return [...nodes].sort((a, b) => a.order - b.order);
}

export function previousDocUnits(project: WritingProject, outlineId: string, limit: number): OutlineNode[] {
    const units = flattenOutline(project.outline);
    const index = units.findIndex((node) => node.id === outlineId);
    return index <= 0 ? [] : units.slice(Math.max(0, index - limit), index);
}

export function outlineStats(project: WritingProject) {
    const words = Object.values(project.docs).reduce((sum, doc) => sum + (doc.wordCount || 0), 0);
    return { words, units: project.outline.length };
}
