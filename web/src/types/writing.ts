export type OutlineNode = {
    id: string;
    order: number;
    title: string;
    summary: string;
    tags: string[];
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
};
