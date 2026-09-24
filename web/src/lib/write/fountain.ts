import { docUnitNodes, flattenOutline } from "@/lib/write/outline";
import { childKindOf, isDocUnitKind } from "@/lib/write/presets";
import type { OutlineNode, WritingProject } from "@/types/writing";

const SLUG_PATTERN = /^\s*(INT|EXT|EST|INT\.\/EXT|I\/E)\b/i;
const SPEAKER_PATTERN = /^(.{1,16}?)[：:]\s*(.+)$/;
const DIALOGUE_PARENTHETICAL = /^[（(].+[）)]$/;

function slugLine(node: OutlineNode) {
    const title = node.title.trim();
    return SLUG_PATTERN.test(title) ? title.toUpperCase() : `INT. ${title.toUpperCase()}`;
}

/** Turns prose paragraphs into Fountain action lines, promoting "名字：台词" paragraphs to dialogue. */
function proseToFountain(plain: string) {
    const paragraphs = plain
        .split(/\n{2,}/)
        .map((part) => part.trim())
        .filter(Boolean);
    const blocks: string[] = [];
    paragraphs.forEach((paragraph) => {
        if (paragraph.startsWith("#") || paragraph.startsWith("=")) {
            blocks.push(paragraph);
            return;
        }
        const lines = paragraph.split("\n").map((line) => line.trim()).filter(Boolean);
        const speaker = lines.length === 1 ? paragraph.match(SPEAKER_PATTERN) : null;
        if (speaker && !DIALOGUE_PARENTHETICAL.test(speaker[1].trim())) {
            blocks.push(`${speaker[1].trim().toUpperCase()}\n${speaker[2].trim()}`);
            return;
        }
        if (lines.length > 1 && lines.slice(1).every((line) => DIALOGUE_PARENTHETICAL.test(line) || line.length > 0)) {
            const first = lines[0].match(SPEAKER_PATTERN);
            if (first) {
                blocks.push(`${first[1].trim().toUpperCase()}\n${first[2].trim()}\n${lines.slice(1).join("\n")}`);
                return;
            }
        }
        blocks.push(lines.join(" "));
    });
    return blocks.join("\n\n");
}

/**
 * Fountain export. Screenplay projects emit slug lines + dialogue; novel projects emit markdown-ish
 * section headings with action paragraphs, which every Fountain reader can still open.
 */
export function toFountain(project: WritingProject) {
    const lines: string[] = [`Title: ${project.title}`, "Credit: Written with OpenCanvas", `Draft date: ${new Date().toISOString().slice(0, 10)}`, "", "===", ""];
    const screenplay = project.template === "screenplay";
    flattenOutline(project.outline).forEach(({ node, depth }) => {
        const doc = project.docs[node.id];
        const hasProse = Boolean(doc?.plain?.trim());
        if (isDocUnitKind(project.template, node.kind)) {
            if (screenplay) {
                lines.push(slugLine(node), "");
            } else {
                lines.push(`${"#".repeat(Math.min(6, depth + 1))} ${node.title}`, "");
            }
            if (hasProse) lines.push(proseToFountain(doc.plain), "");
            return;
        }
        const childKind = childKindOf(project.template, node.kind);
        if (!childKind) {
            lines.push(`${screenplay ? "= " : ""}${node.title}`, "");
            if (node.summary.trim()) lines.push(node.summary.trim(), "");
            return;
        }
        lines.push(`${screenplay ? "#" : "#".repeat(Math.min(6, depth + 1))} ${node.title}`, "");
        if (node.summary.trim()) lines.push(node.summary.trim(), "");
    });
    return `${lines.join("\n").replace(/\n{3,}/g, "\n\n").trim()}\n`;
}

export function fountainFileName(project: WritingProject) {
    const safe = project.title.replace(/[\\/:*?"<>|]+/g, "_").trim() || "untitled";
    return `${safe}.fountain`;
}

export function projectWordCount(project: WritingProject) {
    return Object.values(project.docs).reduce((sum, doc) => sum + (doc.wordCount || 0), 0);
}

export function unitCount(project: WritingProject) {
    return docUnitNodes(project).length;
}
