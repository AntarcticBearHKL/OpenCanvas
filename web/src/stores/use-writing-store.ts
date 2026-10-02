import { nanoid } from "nanoid";
import { create } from "zustand";
import { persist, type PersistStorage, type StorageValue } from "zustand/middleware";

import i18n from "@/i18n";
import { localForageStorage } from "@/lib/localforage-storage";
import { flattenOutline } from "@/lib/write/outline";
import { htmlToPlain } from "@/lib/write/text";
import { type OutlineNode, type ProseDoc, type WritingProject } from "@/types/writing";

const WRITING_STORE_KEY = "infinite-canvas:writing_store";

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
    reorderProjects: (orderedIds: string[]) => void;
    addOutlineNode: (projectId: string) => string;
    updateOutlineNode: (projectId: string, nodeId: string, patch: Partial<OutlineNode>) => void;
    removeOutlineNode: (projectId: string, nodeId: string) => void;
    moveOutlineNode: (projectId: string, nodeId: string, index: number) => void;
    setDoc: (projectId: string, outlineId: string, patch: Pick<ProseDoc, "html" | "plain" | "wordCount">) => void;
    createGroup: (name?: string) => string;
    renameGroup: (id: string, name: string) => void;
    deleteGroup: (id: string) => void;
    setProjectGroup: (projectId: string, groupId: string | null) => void;
};

const stamp = () => new Date().toISOString();

type PersistedWritingState = { projects: WriteProject[]; groups: WriteGroup[] };

let saveTimer: ReturnType<typeof setTimeout> | null = null;
let queuedPersistState: PersistedWritingState | null = null;

const writingStorage: PersistStorage<WritingStore> = {
    getItem: async (name) => {
        const value = await localForageStorage.getItem(name);
        if (!value) return null;
        const parsed = JSON.parse(value) as StorageValue<WritingStore>;
        queuedPersistState = parsed.state as unknown as PersistedWritingState;
        return parsed;
    },
    setItem: (name, value) => {
        const next = value.state as unknown as PersistedWritingState;
        if (queuedPersistState && queuedPersistState.projects === next.projects && queuedPersistState.groups === next.groups) return;
        queuedPersistState = next;
        if (saveTimer) clearTimeout(saveTimer);
        saveTimer = setTimeout(() => {
            saveTimer = null;
            void localForageStorage.setItem(name, JSON.stringify(value));
        }, 400);
    },
    removeItem: (name) => localForageStorage.removeItem(name),
};

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
                    };
                    set((state) => ({ projects: [project, ...state.projects] }));
                    return id;
                },
                renameProject: (id, title) => patchProject(id, (project) => ({ ...project, title: title.trim() || project.title })),
                deleteProject: (id) => get().deleteProjects([id]),
                deleteProjects: (ids) => set((state) => ({ projects: state.projects.filter((project) => !ids.includes(project.id)) })),
                reorderProjects: (orderedIds) =>
                    set((state) => {
                        const byId = new Map(state.projects.map((project) => [project.id, project]));
                        const moving = new Set(orderedIds);
                        const ordered = orderedIds.map((id) => byId.get(id)).filter((project): project is WriteProject => Boolean(project));
                        let cursor = 0;
                        return { projects: state.projects.map((project) => (moving.has(project.id) ? ordered[cursor++] : project)) };
                    }),
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
