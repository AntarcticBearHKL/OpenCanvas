import { Clapperboard, MapPin, User, type LucideIcon } from "lucide-react";

import i18n from "@/i18n";
import { previousDocUnits } from "@/lib/write/outline";
import type { WriteEntity, WriteEntityKind, WritingProject } from "@/types/writing";

export const WRITE_ENTITY_MIME = "application/x-write-entity";

export const ENTITY_FIELDS: Record<WriteEntityKind, { key: string; labelKey: string }[]> = {
    character: [
        { key: "appearance", labelKey: "writing.entity.field.appearance" },
        { key: "personality", labelKey: "writing.entity.field.personality" },
        { key: "relationship", labelKey: "writing.entity.field.relationship" },
    ],
    location: [
        { key: "environment", labelKey: "writing.entity.field.environment" },
        { key: "atmosphere", labelKey: "writing.entity.field.atmosphere" },
        { key: "history", labelKey: "writing.entity.field.history" },
    ],
    plot: [
        { key: "conflict", labelKey: "writing.entity.field.conflict" },
        { key: "turn", labelKey: "writing.entity.field.turn" },
        { key: "outcome", labelKey: "writing.entity.field.outcome" },
    ],
};

export const ENTITY_ICONS: Record<WriteEntityKind, LucideIcon> = {
    character: User,
    location: MapPin,
    plot: Clapperboard,
};

export function projectEntities(project: WritingProject | null | undefined): WriteEntity[] {
    return project?.entities ?? [];
}

export function findEntity(project: WritingProject | null | undefined, id: string | null | undefined): WriteEntity | null {
    return id ? projectEntities(project).find((entity) => entity.id === id) ?? null : null;
}

export function entitiesByKind(project: WritingProject | null | undefined, kind: WriteEntityKind, query = ""): WriteEntity[] {
    const needle = query.trim().toLowerCase();
    return projectEntities(project).filter(
        (entity) => entity.kind === kind && (!needle || entity.name.toLowerCase().includes(needle) || entity.summary.toLowerCase().includes(needle) || entity.tags.some((tag) => tag.toLowerCase().includes(needle))),
    );
}

export function entityDisplayName(entity: WriteEntity): string {
    return entity.name.trim() || i18n.t("writing.entity.untitled");
}

export function formatEntityBlock(entity: WriteEntity): string {
    const lines: string[] = [entity.summary.trim() ? `${entityDisplayName(entity)}（${entity.summary.trim()}）` : entityDisplayName(entity)];
    ENTITY_FIELDS[entity.kind].forEach(({ key, labelKey }) => {
        const value = entity.fields[key]?.trim();
        if (value) lines.push(`- ${i18n.t(labelKey)}：${value}`);
    });
    if (entity.tags.length) lines.push(`- ${i18n.t("writing.inspector.tags")}：${entity.tags.join("、")}`);
    return lines.join("\n");
}

export function formatEntityBrief(entity: WriteEntity): string {
    return entity.summary.trim() ? `${entityDisplayName(entity)}：${entity.summary.trim()}` : entityDisplayName(entity);
}

export function collectReferencedEntities(project: WritingProject, outlineId: string, limit: number): WriteEntity[] {
    const htmls = [project.docs[outlineId]?.html ?? "", ...previousDocUnits(project, outlineId, limit).map((unit) => project.docs[unit.id]?.html ?? "")];
    const ids = new Set<string>();
    const pattern = /data-entity-id="([^"]+)"/g;
    htmls.forEach((html) => {
        pattern.lastIndex = 0;
        let match = pattern.exec(html);
        while (match) {
            ids.add(match[1]);
            match = pattern.exec(html);
        }
    });
    return projectEntities(project).filter((entity) => ids.has(entity.id));
}

export function parseEntityDraft(text: string, kind: WriteEntityKind): Partial<Pick<WriteEntity, "name" | "summary" | "fields" | "tags">> | null {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start < 0 || end <= start) return null;
    let raw: unknown;
    try {
        raw = JSON.parse(text.slice(start, end + 1));
    } catch {
        return null;
    }
    if (!raw || typeof raw !== "object") return null;
    const source = raw as Record<string, unknown>;
    const fieldSource = source.fields && typeof source.fields === "object" ? (source.fields as Record<string, unknown>) : source;
    const fields: Record<string, string> = {};
    ENTITY_FIELDS[kind].forEach(({ key }) => {
        const value = fieldSource[key];
        if (typeof value === "string" && value.trim()) fields[key] = value.trim();
    });
    const patch: Partial<Pick<WriteEntity, "name" | "summary" | "fields" | "tags">> = {};
    if (typeof source.name === "string" && source.name.trim()) patch.name = source.name.trim();
    if (typeof source.summary === "string" && source.summary.trim()) patch.summary = source.summary.trim();
    if (Object.keys(fields).length) patch.fields = fields;
    if (Array.isArray(source.tags)) {
        const tags = source.tags.filter((tag): tag is string => typeof tag === "string" && tag.trim().length > 0).map((tag) => tag.trim());
        if (tags.length) patch.tags = tags;
    }
    return Object.keys(patch).length ? patch : null;
}
