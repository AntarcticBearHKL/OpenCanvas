import { flattenOutline } from "@/lib/write/outline";
import type { WritingProject } from "@/types/writing";

export function toFountain(project: WritingProject) {
    const lines: string[] = [`Title: ${project.title}`, "Credit: Written with OpenCanvas", `Draft date: ${new Date().toISOString().slice(0, 10)}`, "", "===", ""];
    flattenOutline(project.outline).forEach((node) => {
        lines.push(`# ${node.title}`, "");
        const plain = project.docs[node.id]?.plain?.trim();
        if (plain) lines.push(plain, "");
    });
    return `${lines.join("\n").replace(/\n{3,}/g, "\n\n").trim()}\n`;
}

export function fountainFileName(project: WritingProject) {
    const safe = project.title.replace(/[\\/:*?"<>|]+/g, "_").trim() || "untitled";
    return `${safe}.fountain`;
}
