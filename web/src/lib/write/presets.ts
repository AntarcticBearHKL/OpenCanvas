import { BookOpen, Camera, Castle, Circle, Clapperboard, Crosshair, Layers, Package, ScrollText, Square, Triangle, UserRound, type LucideIcon } from "lucide-react";

import type { CodexKind, OutlineKind, WriteTemplate } from "@/types/writing";

export type OutlineLevel = {
    kind: OutlineKind;
    labelKey: string;
    icon: LucideIcon;
    color: string;
};

export type CodexKindMeta = {
    kind: CodexKind;
    labelKey: string;
    icon: LucideIcon;
    color: string;
};

export type TemplatePreset = {
    labelKey: string;
    /** Top to bottom; the array order doubles as the parent -> child expand chain. */
    levels: OutlineLevel[];
    /** The level that owns a prose document. */
    docUnitKind: OutlineKind;
    /** How many children an AI outline expansion should produce. */
    expandRange: { min: number; max: number };
};

export const WRITE_TEMPLATES: Record<WriteTemplate, TemplatePreset> = {
    novel: {
        labelKey: "writing.template.novel",
        levels: [
            { kind: "volume", labelKey: "writing.outlineKind.volume", icon: BookOpen, color: "#8b5cf6" },
            { kind: "chapter", labelKey: "writing.outlineKind.chapter", icon: Square, color: "#22c55e" },
            { kind: "scene", labelKey: "writing.outlineKind.scene", icon: Circle, color: "#eab308" },
            { kind: "beat", labelKey: "writing.outlineKind.beat", icon: Triangle, color: "#a855f7" },
        ],
        docUnitKind: "chapter",
        expandRange: { min: 3, max: 6 },
    },
    screenplay: {
        labelKey: "writing.template.screenplay",
        levels: [
            { kind: "act", labelKey: "writing.outlineKind.act", icon: Layers, color: "#6366f1" },
            { kind: "scene", labelKey: "writing.outlineKind.scene", icon: Clapperboard, color: "#eab308" },
            { kind: "shot", labelKey: "writing.outlineKind.shot", icon: Camera, color: "#14b8a6" },
        ],
        docUnitKind: "scene",
        expandRange: { min: 3, max: 6 },
    },
};

export const CODEX_META: Record<CodexKind, CodexKindMeta> = {
    character: { kind: "character", labelKey: "writing.codexKind.character", icon: UserRound, color: "#3b82f6" },
    location: { kind: "location", labelKey: "writing.codexKind.location", icon: Castle, color: "#14b8a6" },
    lore: { kind: "lore", labelKey: "writing.codexKind.lore", icon: ScrollText, color: "#f97316" },
    item: { kind: "item", labelKey: "writing.codexKind.item", icon: Package, color: "#a855f7" },
    thread: { kind: "thread", labelKey: "writing.codexKind.thread", icon: Crosshair, color: "#ec4899" },
};

export function levelsOf(template: WriteTemplate) {
    return WRITE_TEMPLATES[template].levels;
}

export function levelOf(template: WriteTemplate, kind: OutlineKind) {
    return levelsOf(template).find((level) => level.kind === kind) ?? null;
}

export function topKindOf(template: WriteTemplate): OutlineKind {
    return levelsOf(template)[0].kind;
}

/** The kind an expanded node should create, or null for a leaf level. */
export function childKindOf(template: WriteTemplate, kind: OutlineKind): OutlineKind | null {
    const levels = levelsOf(template);
    const index = levels.findIndex((level) => level.kind === kind);
    return index >= 0 && index < levels.length - 1 ? levels[index + 1].kind : null;
}

export function isDocUnitKind(template: WriteTemplate, kind: OutlineKind): boolean {
    return WRITE_TEMPLATES[template].docUnitKind === kind;
}

export function defaultKindFor(template: WriteTemplate): OutlineKind {
    return WRITE_TEMPLATES[template].docUnitKind;
}
