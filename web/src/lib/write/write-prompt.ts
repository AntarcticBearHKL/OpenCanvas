import i18n from "@/i18n";
import { ancestorsOf, findNode, previousDocUnits } from "@/lib/write/outline";
import { CODEX_META, WRITE_TEMPLATES, childKindOf, levelOf } from "@/lib/write/presets";
import { head, tail } from "@/lib/write/text";
import type { CodexEntry, CodexKind, OutlineNode, WritingProject } from "@/types/writing";

const SUMMARY_LIMIT = 300;
const PREDECESSOR_LIMIT = 1200;
const EXISTING_LIMIT = 2000;
const INSTRUCTION_LIMIT = 1000;
const MAX_PREDECESSORS = 3;
const MAX_ANCESTOR_DEPTH = 3;

export type WriteMode = "continue" | "rewrite" | "expand" | "condense" | "polish" | "dialogue";

function kindLabel(template: WritingProject["template"], node: OutlineNode) {
    const level = levelOf(template, node.kind);
    return level ? i18n.t(level.labelKey) : node.kind;
}

function codexLines(entries: CodexEntry[]) {
    return entries.map((entry) => {
        const alias = entry.aliases.length ? ` (${entry.aliases.join(" / ")})` : "";
        const summary = head(entry.summary.trim(), SUMMARY_LIMIT);
        return summary ? `- ${entry.name}${alias} — ${summary}` : `- ${entry.name}${alias}`;
    });
}

function collectLinked(project: WritingProject, node: OutlineNode, kind: CodexKind) {
    const ids = kind === "character" ? node.characterIds : kind === "location" ? [node.locationId] : kind === "thread" ? node.threadIds : [];
    return project.codex.filter((entry) => entry.kind === kind && ids.includes(entry.id));
}

function contextSections(project: WritingProject, node: OutlineNode, includeProse: boolean) {
    const t = i18n.t;
    const sections: string[] = [];
    const preset = WRITE_TEMPLATES[project.template];
    const work: string[] = [`${project.title} — ${t(preset.labelKey)}`];
    if (project.meta.logline.trim()) work.push(project.meta.logline.trim());
    if (project.meta.synopsis.trim()) work.push(head(project.meta.synopsis.trim(), SUMMARY_LIMIT * 2));
    sections.push(`【${t("writing.prompt.work")}】\n${work.join("\n")}`);

    const ancestors = ancestorsOf(project.outline, node.id).slice(-MAX_ANCESTOR_DEPTH);
    if (ancestors.length) {
        sections.push(
            `【${t("writing.prompt.ancestors")}】\n${ancestors
                .map((item) => {
                    const summary = head(item.summary.trim(), SUMMARY_LIMIT);
                    return summary ? `- ${kindLabel(project.template, item)}：${item.title} — ${summary}` : `- ${kindLabel(project.template, item)}：${item.title}`;
                })
                .join("\n")}`,
        );
    }

    const groups: Array<[CodexKind, string]> = [
        ["character", "writing.prompt.characters"],
        ["location", "writing.prompt.locations"],
        ["lore", "writing.prompt.lore"],
        ["item", "writing.prompt.items"],
        ["thread", "writing.prompt.threads"],
    ];
    groups.forEach(([kind, key]) => {
        const lines = codexLines(collectLinked(project, node, kind));
        if (lines.length) sections.push(`【${t(key)}】\n${lines.join("\n")}`);
    });

    if (includeProse) {
        const previous = previousDocUnits(project, node.id, MAX_PREDECESSORS).map((unit) => {
            const plain = unit.id ? project.docs[unit.id]?.plain?.trim() : "";
            return plain ? `${unit.title}\n${tail(plain, PREDECESSOR_LIMIT)}` : unit.title;
        });
        if (previous.length) sections.push(`【${t("writing.prompt.before")}】\n\n${previous.join("\n\n")}`);
        const existing = project.docs[node.id]?.plain?.trim();
        if (existing) sections.push(`【${t("writing.prompt.existing")}】${t("writing.prompt.continueHint")}\n${tail(existing, EXISTING_LIMIT)}`);
    }
    return sections;
}

function requirementSection(project: WritingProject, node: OutlineNode, instruction: string) {
    const t = i18n.t;
    const parts: string[] = [];
    if (node.summary.trim()) parts.push(node.summary.trim());
    const style: string[] = [];
    if (project.meta.pov.trim()) style.push(`${t("writing.field.pov")}: ${project.meta.pov.trim()}`);
    if (project.meta.tense.trim()) style.push(`${t("writing.field.tense")}: ${project.meta.tense.trim()}`);
    if (project.meta.styleSheet.trim()) style.push(project.meta.styleSheet.trim());
    if (style.length) parts.push(style.join("\n"));
    if (instruction.trim()) parts.push(instruction.trim().slice(0, INSTRUCTION_LIMIT));
    return parts.length ? `【${t("writing.prompt.instructions")}】\n${parts.join("\n\n")}` : "";
}

/** Prompt for prose generation on a writing unit. */
export function buildWritePrompt(project: WritingProject, node: OutlineNode, instruction: string, mode: WriteMode = "continue") {
    const t = i18n.t;
    const sections = [`【${t("writing.prompt.unit")}】${kindLabel(project.template, node)}：${node.title}`, ...contextSections(project, node, true)];
    const requirement = requirementSection(project, node, instruction);
    if (requirement) sections.push(requirement);
    sections.push(t(`writing.prompt.mode.${mode}`));
    return sections.join("\n\n");
}

/** Prompt for turning one outline node into children (title + description JSON). */
export function buildOutlineExpandPrompt(project: WritingProject, node: OutlineNode, instruction: string) {
    const t = i18n.t;
    const sections = [`【${t("writing.prompt.unit")}】${kindLabel(project.template, node)}：${node.title}`];
    if (node.summary.trim()) sections.push(node.summary.trim());
    const ancestorLines = ancestorsOf(project.outline, node.id)
        .slice(-MAX_ANCESTOR_DEPTH)
        .map((item) => {
            const summary = head(item.summary.trim(), SUMMARY_LIMIT);
            return summary ? `- ${kindLabel(project.template, item)}：${item.title} — ${summary}` : `- ${kindLabel(project.template, item)}：${item.title}`;
        });
    if (ancestorLines.length) sections.push(`【${t("writing.prompt.ancestors")}】\n${ancestorLines.join("\n")}`);
    const codex = collectLinked(project, node, "character").concat(collectLinked(project, node, "location"), collectLinked(project, node, "thread"));
    const lines = codexLines(codex);
    if (lines.length) sections.push(`【${t("writing.prompt.related")}】\n${lines.join("\n")}`);
    const siblings = project.outline
        .filter((item) => item.parentId === node.parentId && item.id !== node.id)
        .map((item) => `- ${item.title}`)
        .slice(0, 8);
    if (siblings.length) sections.push(`【${t("writing.prompt.siblings")}】\n${siblings.join("\n")}`);
    const requirement = requirementSection(project, node, instruction);
    if (requirement) sections.push(requirement);
    const childKind = childKindOf(project.template, node.kind);
    const range = WRITE_TEMPLATES[project.template].expandRange;
    if (childKind) {
        sections.push(t("writing.prompt.expand", { kind: kindLabel(project.template, node), child: i18n.t(levelOf(project.template, childKind)?.labelKey ?? ""), min: range.min, max: range.max }));
    }
    return sections.join("\n\n");
}

export function parseOutlineExpansion(raw: string): { title: string; description: string }[] | null {
    const body = String(raw || "").replace(/```/g, "");
    const start = body.indexOf("[");
    const end = body.lastIndexOf("]");
    if (start < 0 || end <= start) return null;
    try {
        const parsed = JSON.parse(body.slice(start, end + 1)) as unknown;
        if (!Array.isArray(parsed) || !parsed.length) return null;
        return parsed
            .map((item) => {
                const record = item as { title?: unknown; description?: unknown };
                if (typeof record.title !== "string" || !record.title.trim()) throw new Error("invalid outline expansion item");
                return { title: record.title.trim().slice(0, 200), description: typeof record.description === "string" ? record.description.trim().slice(0, 1000) : "" };
            })
            .slice(0, 8);
    } catch {
        return null;
    }
}

export function codexKindLabel(kind: CodexKind) {
    return i18n.t(CODEX_META[kind].labelKey);
}

export function outlineNodeSummary(project: WritingProject, outlineId: string) {
    return findNode(project.outline, outlineId)?.summary ?? "";
}
