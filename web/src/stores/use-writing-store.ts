import { nanoid } from "nanoid";
import { create } from "zustand";
import { persist } from "zustand/middleware";

import i18n from "@/i18n";
import { createDebouncedPersist } from "@/lib/localforage-storage";
import { flattenOutline } from "@/lib/write/outline";
import { htmlToPlain } from "@/lib/write/text";
import { type OutlineNode, type ProseDoc, type WriteEntity, type WriteEntityKind, type WritingProject } from "@/types/writing";

const WRITING_STORE_KEY = "open-canvas:writing_store";

export const writeProjectWordCount = (project: WritingProject) => Object.values(project.docs).reduce((sum, doc) => sum + (doc.wordCount || 0), 0);

export type WriteGroup = { id: string; name: string; createdAt: string };
export type WriteProject = WritingProject & { groupId?: string | null };

type WritingStore = {
    hydrated: boolean;
    projects: WriteProject[];
    groups: WriteGroup[];
    createProject: (title?: string, groupId?: string | null) => string;
    renameProject: (id: string, title: string) => void;
    deleteProject: (id: string) => void;
    deleteProjects: (ids: string[]) => void;
    addOutlineNode: (projectId: string) => string;
    updateOutlineNode: (projectId: string, nodeId: string, patch: Partial<OutlineNode>) => void;
    removeOutlineNode: (projectId: string, nodeId: string) => void;
    moveOutlineNode: (projectId: string, nodeId: string, index: number) => void;
    setDoc: (projectId: string, outlineId: string, patch: Pick<ProseDoc, "html" | "plain" | "wordCount">) => void;
    addEntity: (projectId: string, kind: WriteEntityKind) => string;
    updateEntity: (projectId: string, entityId: string, patch: Partial<Pick<WriteEntity, "name" | "summary" | "fields" | "tags">>) => void;
    removeEntity: (projectId: string, entityId: string) => void;
    setEntityCanvas: (projectId: string, entityId: string, canvasId: string) => void;
    setGraphCanvas: (projectId: string, canvasId: string) => void;
    createGroup: (name?: string) => string;
    renameGroup: (id: string, name: string) => void;
    deleteGroup: (id: string) => void;
    setProjectGroup: (projectId: string, groupId: string | null) => void;
};

const stamp = () => new Date().toISOString();

const writingStorage = createDebouncedPersist<WritingStore>(["projects", "groups"]);

export const useWritingStore = create<WritingStore>()(
    persist(
        (set, get) => {
            const patchProject = (id: string, update: (project: WriteProject) => WriteProject) =>
                set((state) => ({ projects: state.projects.map((project) => (project.id === id ? { ...update(project), updatedAt: stamp() } : project)) }));
            return {
                hydrated: false,
                projects: [],
                groups: [],
                createProject: (title, groupId = get().groups[0]?.id ?? null) => {
                    const id = nanoid();
                    const now = stamp();
                    const project: WriteProject = {
                        id,
                        title: title?.trim() || i18n.t("writing.untitled"),
                        createdAt: now,
                        updatedAt: now,
                        groupId,
                        outline: [{ id: nanoid(), order: 0, title: i18n.t("writing.outline.autoTitle", { n: 1 }), summary: "", tags: [] }],
                        docs: {},
                        entities: [],
                    };
                    set((state) => ({ projects: [project, ...state.projects] }));
                    return id;
                },
                renameProject: (id, title) => patchProject(id, (project) => ({ ...project, title: title.trim() || project.title })),
                deleteProject: (id) => get().deleteProjects([id]),
                deleteProjects: (ids) => set((state) => ({ projects: state.projects.filter((project) => !ids.includes(project.id)) })),
                addOutlineNode: (projectId) => {
                    const nodeId = nanoid();
                    patchProject(projectId, (project) => {
                        const order = project.outline.length;
                        return { ...project, outline: [...project.outline, { id: nodeId, order, title: i18n.t("writing.outline.autoTitle", { n: order + 1 }), summary: "", tags: [] }] };
                    });
                    return nodeId;
                },
                updateOutlineNode: (projectId, nodeId, patch) =>
                    patchProject(projectId, (project) => ({ ...project, outline: project.outline.map((node) => (node.id === nodeId ? { ...node, ...patch } : node)) })),
                removeOutlineNode: (projectId, nodeId) =>
                    patchProject(projectId, (project) => {
                        const docs = { ...project.docs };
                        delete docs[nodeId];
                        return { ...project, outline: project.outline.filter((node) => node.id !== nodeId), docs };
                    }),
                moveOutlineNode: (projectId, nodeId, index) =>
                    patchProject(projectId, (project) => {
                        const node = project.outline.find((item) => item.id === nodeId);
                        if (!node) return project;
                        const ordered = flattenOutline(project.outline.filter((item) => item.id !== nodeId));
                        ordered.splice(Math.max(0, Math.min(index, ordered.length)), 0, node);
                        return { ...project, outline: ordered.map((item, order) => ({ ...item, order })) };
                    }),
                setDoc: (projectId, outlineId, patch) =>
                    patchProject(projectId, (project) => ({
                        ...project,
                        docs: { ...project.docs, [outlineId]: { outlineId, updatedAt: stamp(), ...patch, plain: patch.plain ?? htmlToPlain(patch.html) } },
                    })),
                addEntity: (projectId, kind) => {
                    const entityId = nanoid();
                    const now = stamp();
                    patchProject(projectId, (project) => ({
                        ...project,
                        entities: [...(project.entities ?? []), { id: entityId, kind, name: "", summary: "", fields: {}, tags: [], createdAt: now, updatedAt: now }],
                    }));
                    return entityId;
                },
                updateEntity: (projectId, entityId, patch) =>
                    patchProject(projectId, (project) => ({
                        ...project,
                        entities: (project.entities ?? []).map((entity) =>
                            entity.id === entityId
                                ? { ...entity, ...patch, fields: patch.fields ? { ...entity.fields, ...patch.fields } : entity.fields, updatedAt: stamp() }
                                : entity,
                        ),
                    })),
                removeEntity: (projectId, entityId) =>
                    patchProject(projectId, (project) => ({ ...project, entities: (project.entities ?? []).filter((entity) => entity.id !== entityId) })),
                setEntityCanvas: (projectId, entityId, canvasId) =>
                    patchProject(projectId, (project) => ({
                        ...project,
                        entities: (project.entities ?? []).map((entity) => (entity.id === entityId ? { ...entity, canvasId, updatedAt: stamp() } : entity)),
                    })),
                setGraphCanvas: (projectId, canvasId) => patchProject(projectId, (project) => ({ ...project, graphCanvasId: canvasId })),
                createGroup: (name) => {
                    const id = nanoid();
                    const group: WriteGroup = {
                        id,
                        name: name?.trim() || (get().groups.length === 0 ? "Default Group" : `Group ${get().groups.length + 1}`),
                        createdAt: stamp(),
                    };
                    set((state) => ({ groups: [...state.groups, group] }));
                    return id;
                },
                renameGroup: (id, name) =>
                    set((state) => ({ groups: state.groups.map((group) => (group.id === id ? { ...group, name: name.trim() || group.name } : group)) })),
                deleteGroup: (id) =>
                    set((state) => {
                        const remainingGroups = state.groups.filter((group) => group.id !== id);
                        const remainingProjects = state.projects.filter((project) => project.groupId !== id);
                        if (remainingGroups.length === 0) {
                            const defaultGroup: WriteGroup = { id: nanoid(), name: "Default Group", createdAt: stamp() };
                            return { groups: [defaultGroup], projects: [] };
                        }
                        return { groups: remainingGroups, projects: remainingProjects };
                    }),
                setProjectGroup: (projectId, groupId) => patchProject(projectId, (project) => ({ ...project, groupId })),
            };
        },
        {
            name: WRITING_STORE_KEY,
            storage: writingStorage,
            partialize: (state) => ({ projects: state.projects, groups: state.groups }) as unknown as WritingStore,
            onRehydrateStorage: () => () => {
                useWritingStore.setState({ hydrated: true });
                const { projects, groups } = useWritingStore.getState();
                const hasGroup = (project: WriteProject) => Boolean(project.groupId && groups.some((group) => group.id === project.groupId));
                if (groups.length === 0) {
                    const defaultGroup: WriteGroup = { id: nanoid(), name: "Default Group", createdAt: stamp() };
                    useWritingStore.setState({ groups: [defaultGroup], projects: projects.map((p) => ({ ...p, groupId: defaultGroup.id })) });
                    return;
                }
                const migratedGroups = groups.map((g) => (g.name === "Library 1" || g.name === "库 1" ? { ...g, name: "Default Group" } : g));
                if (migratedGroups.some((g, i) => g.name !== groups[i].name)) {
                    useWritingStore.setState({ groups: migratedGroups });
                }
                if (projects.some((project) => !hasGroup(project))) {
                    const groupId = migratedGroups[0].id;
                    useWritingStore.setState({ projects: projects.map((project) => (hasGroup(project) ? project : { ...project, groupId })) });
                }
            },
        },
    ),
);

export function useWritingProject(id: string | undefined) {
    return useWritingStore((state) => state.projects.find((project) => project.id === id) ?? null);
}
