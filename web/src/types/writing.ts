export type OutlineNode = {
    id: string;
    order: number;
    title: string;
    summary: string;
    tags: string[];
};

export type WriteEntityKind = "character" | "location" | "plot";

export type WriteEntity = {
    id: string;
    kind: WriteEntityKind;
    name: string;
    summary: string;
    /** Kind-specific fields, e.g. character: appearance/personality/relationship. */
    fields: Record<string, string>;
    tags: string[];
    createdAt: string;
    updatedAt: string;
    canvasId?: string;
};

export type ProseDoc = {
    outlineId: string;
    html: string;
    plain: string;
    wordCount: number;
    updatedAt: string;
};

export type WritingProject = {
    id: string;
    title: string;
    createdAt: string;
    updatedAt: string;
    outline: OutlineNode[];
    docs: Record<string, ProseDoc>;
    entities: WriteEntity[];
    graphCanvasId?: string;
};
