export type WriteTemplate = "novel" | "screenplay";

/** Fixed preset outline levels: novel uses volume/chapter/scene/beat, screenplay uses act/scene/shot. */
export type OutlineKind = "volume" | "chapter" | "scene" | "beat" | "act" | "shot";

export type OutlineStatus = "idea" | "draft" | "revised" | "done";

export type CodexKind = "character" | "location" | "lore" | "item" | "thread";

export type OutlineNode = {
    id: string;
    parentId: string | null;
    order: number;
    kind: OutlineKind;
    title: string;
    summary: string;
    status: OutlineStatus;
    characterIds: string[];
    locationId: string | null;
    threadIds: string[];
    tags: string[];
};

/** One prose document per writing unit (novel: chapter, screenplay: scene). */
export type ProseDoc = {
    outlineId: string;
    /** TipTap HTML. */
    html: string;
    /** Derived plain text, used for word count and AI context. */
    plain: string;
    wordCount: number;
    updatedAt: string;
};

export type DocRevision = {
    id: string;
    outlineId: string;
    label: string;
    createdAt: string;
    html: string;
    plain: string;
    wordCount: number;
};

export type CodexEntry = {
    id: string;
    kind: CodexKind;
    name: string;
    aliases: string[];
    summary: string;
    fields: Record<string, string>;
    tags: string[];
};

export type WriteMeta = {
    logline: string;
    synopsis: string;
    pov: string;
    tense: string;
    styleSheet: string;
    targetWords: number;
};

export type WritingProject = {
    id: string;
    title: string;
    template: WriteTemplate;
    createdAt: string;
    updatedAt: string;
    meta: WriteMeta;
    outline: OutlineNode[];
    docs: Record<string, ProseDoc>;
    codex: CodexEntry[];
    revisions: DocRevision[];
};

export const OUTLINE_STATUSES: OutlineStatus[] = ["idea", "draft", "revised", "done"];
export const CODEX_KINDS: CodexKind[] = ["character", "location", "lore", "item", "thread"];
/** Per-document revision cap; older snapshots are dropped on commit. */
export const MAX_DOC_REVISIONS = 20;
