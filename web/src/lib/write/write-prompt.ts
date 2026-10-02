import i18n from "@/i18n";
import { previousDocUnits } from "@/lib/write/outline";
import { tail } from "@/lib/write/text";
import type { OutlineNode, WritingProject } from "@/types/writing";

const PREDECESSOR_LIMIT = 1200;
const EXISTING_LIMIT = 2000;
const INSTRUCTION_LIMIT = 1000;
const MAX_PREDECESSORS = 3;

export type WriteMode = "continue" | "rewrite" | "expand" | "condense" | "polish" | "dialogue";

function contextSections(project: WritingProject, node: OutlineNode) {
    const t = i18n.t;
    const sections: string[] = [`【${t("writing.prompt.work")}】\n${project.title}`];
    const previous = previousDocUnits(project, node.id, MAX_PREDECESSORS).map((unit) => {
        const plain = project.docs[unit.id]?.plain?.trim();
        return plain ? `${unit.title}\n${tail(plain, PREDECESSOR_LIMIT)}` : unit.title;
    });
    if (previous.length) sections.push(`【${t("writing.prompt.before")}】\n\n${previous.join("\n\n")}`);
    const existing = project.docs[node.id]?.plain?.trim();
    if (existing) sections.push(`【${t("writing.prompt.existing")}】${t("writing.prompt.continueHint")}\n${tail(existing, EXISTING_LIMIT)}`);
    return sections;
}

function requirementSection(node: OutlineNode, instruction: string) {
    const t = i18n.t;
    const parts: string[] = [];
    if (node.summary.trim()) parts.push(node.summary.trim());
    if (instruction.trim()) parts.push(instruction.trim().slice(0, INSTRUCTION_LIMIT));
    return parts.length ? `【${t("writing.prompt.instructions")}】\n${parts.join("\n\n")}` : "";
}

export function buildWritePrompt(project: WritingProject, node: OutlineNode, instruction: string, mode: WriteMode = "continue") {
    const t = i18n.t;
    const sections = [`【${t("writing.prompt.unit")}】${node.title}`, ...contextSections(project, node)];
    const requirement = requirementSection(node, instruction);
    if (requirement) sections.push(requirement);
    sections.push(t(`writing.prompt.mode.${mode}`));
    return sections.join("\n\n");
}
