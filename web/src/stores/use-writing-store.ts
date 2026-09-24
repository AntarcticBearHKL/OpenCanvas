import { nanoid } from "nanoid";
import { create } from "zustand";
import { persist, type PersistStorage, type StorageValue } from "zustand/middleware";

import i18n from "@/i18n";
import { localForageStorage } from "@/lib/localforage-storage";
import { descendantIds, removeSubtree, siblingNodes } from "@/lib/write/outline";
import { WRITE_TEMPLATES } from "@/lib/write/presets";
import { htmlToPlain } from "@/lib/write/text";
import { MAX_DOC_REVISIONS, type CodexEntry, type CodexKind, type DocRevision, type OutlineKind, type OutlineNode, type ProseDoc, type WriteMeta, type WriteTemplate, type WritingProject } from "@/types/writing";

const WRITING_STORE_KEY = "infinite-canvas:writing_store";

export const defaultWriteMeta = (): WriteMeta => ({ logline: "", synopsis: "", pov: "", tense: "", styleSheet: "", targetWords: 0 });

export const writeProjectWordCount = (project: WritingProject) => Object.values(project.docs).reduce((sum, doc) => sum + (doc.wordCount || 0), 0);

export type WriteGroup = { id: string; name: string; createdAt: string };
export type WriteProject = WritingProject & { groupId?: string | null };

type WritingStore = {
    hydrated: boolean;
    projects: WriteProject[];
    groups: WriteGroup[];
    createProject: (title?: string, template?: WriteTemplate, groupId?: string | null) => string;
    renameProject: (id: string, title: string) => void;
    deleteProject: (id: string) => void;
    deleteProjects: (ids: string[]) => void;
    reorderProjects: (orderedIds: string[]) => void;
    updateMeta: (id: string, patch: Partial<WriteMeta>) => void;
    addOutlineNode: (projectId: string, parentId: string | null, kind: OutlineKind, title?: string, afterId?: string | null) => string;
    updateOutlineNode: (projectId: string, nodeId: string, patch: Partial<OutlineNode>) => void;
    removeOutlineNode: (projectId: string, nodeId: string) => void;
    moveOutlineNode: (projectId: string, nodeId: string, parentId: string | null, index: number) => void;
    setDoc: (projectId: string, outlineId: string, patch: Pick<ProseDoc, "html" | "plain" | "wordCount">) => void;
    snapshot: (projectId: string, outlineId: string, label: string) => void;
    restoreRevision: (projectId: string, revisionId: string) => void;
    deleteRevision: (projectId: string, revisionId: string) => void;
    addCodexEntry: (projectId: string, kind: CodexKind, name?: string) => string;
    updateCodexEntry: (projectId: string, entryId: string, patch: Partial<CodexEntry>) => void;
    removeCodexEntry: (projectId: string, entryId: string) => void;
    importCodex: (projectId: string, entries: CodexEntry[]) => void;
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
            const docOf = (project: WritingProject, outlineId: string): ProseDoc =>
                project.docs[outlineId] ?? { outlineId, html: "", plain: "", wordCount: 0, updatedAt: stamp() };
            return {
                hydrated: false,
                projects: [],
                groups: [],
                createProject: (title, template = "novel", groupId = get().groups[0]?.id ?? null) => {
                    const id = nanoid();
                    const now = stamp();
                    const kind = WRITE_TEMPLATES[template].docUnitKind;
                    const project: WriteProject = {
                        id,
                        title: title?.trim() || i18n.t("writing.untitled"),
                        template,
                        createdAt: now,
                        updatedAt: now,
                        groupId,
                        meta: defaultWriteMeta(),
                        outline: [{ id: nanoid(), parentId: null, order: 0, kind, title: i18n.t("writing.firstUnit"), summary: "", status: "idea", characterIds: [], locationId: null, threadIds: [], tags: [] }],
                        docs: {},
                        codex: [],
                        revisions: [],
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
                updateMeta: (id, patch) => patchProject(id, (project) => ({ ...project, meta: { ...project.meta, ...patch } })),
                addOutlineNode: (projectId, parentId, kind, title = "", afterId = null) => {
                    const current = get().projects.find((project) => project.id === projectId);
                    const nodeId = nanoid();
                    if (!current) return nodeId;
                    const siblings = siblingNodes(current.outline, parentId);
                    const insertAt = afterId ? siblings.findIndex((node) => node.id === afterId) + 1 : siblings.length;
                    const node: OutlineNode = {
                        id: nodeId,
                        parentId,
                        order: 0,
                        kind,
                        title: title.trim() || i18n.t("writing.untitledNode"),
                        summary: "",
                        status: "idea",
                        characterIds: [],
                        locationId: null,
                        threadIds: [],
                        tags: [],
                    };
                    const ordered = siblings.slice();
                    ordered.splice(Math.max(0, insertAt), 0, node);
                    patchProject(projectId, (project) => {
                        const orderById = new Map(ordered.map((item, order) => [item.id, order]));
                        return {
                            ...project,
                            outline: project.outline.map((item) => (orderById.has(item.id) ? { ...item, order: orderById.get(item.id) as number } : item)).concat({ ...node, order: orderById.get(nodeId) as number }),
                        };
                    });
                    return nodeId;
                },
                updateOutlineNode: (projectId, nodeId, patch) =>
                    patchProject(projectId, (project) => ({ ...project, outline: project.outline.map((node) => (node.id === nodeId ? { ...node, ...patch } : node)) })),
                removeOutlineNode: (projectId, nodeId) =>
                    patchProject(projectId, (project) => {
                        const doomed = descendantIds(project.outline, nodeId);
                        doomed.add(nodeId);
                        const docs = { ...project.docs };
                        doomed.forEach((id) => delete docs[id]);
                        return { ...project, outline: removeSubtree(project.outline, nodeId), docs, revisions: project.revisions.filter((revision) => !doomed.has(revision.outlineId)) };
                    }),
                moveOutlineNode: (projectId, nodeId, parentId, index) =>
                    patchProject(projectId, (project) => {
                        const node = project.outline.find((item) => item.id === nodeId);
                        if (!node) return project;
                        const moving = { ...node, parentId };
                        const rest = project.outline.filter((item) => item.id !== nodeId);
                        const siblings = siblingNodes(rest, parentId);
                        siblings.splice(Math.max(0, Math.min(index, siblings.length)), 0, moving);
                        const orderById = new Map(siblings.map((item, order) => [item.id, order]));
                        return { ...project, outline: rest.map((item) => (orderById.has(item.id) ? { ...item, parentId, order: orderById.get(item.id) as number } : item)).concat({ ...moving, order: orderById.get(nodeId) as number }) };
                    }),
                setDoc: (projectId, outlineId, patch) =>
                    patchProject(projectId, (project) => ({
                        ...project,
                        docs: { ...project.docs, [outlineId]: { outlineId, updatedAt: stamp(), ...patch, plain: patch.plain ?? htmlToPlain(patch.html) } },
                    })),
                snapshot: (projectId, outlineId, label) =>
                    patchProject(projectId, (project) => {
                        const doc = docOf(project, outlineId);
                        const revision: DocRevision = { id: nanoid(), outlineId, label: label.trim() || i18n.t("writing.history.auto"), createdAt: stamp(), html: doc.html, plain: doc.plain, wordCount: doc.wordCount };
                        const keep = [...project.revisions.filter((item) => item.outlineId === outlineId).slice(-(MAX_DOC_REVISIONS - 1)), revision];
                        return { ...project, revisions: project.revisions.filter((item) => item.outlineId !== outlineId).concat(keep) };
                    }),
                restoreRevision: (projectId, revisionId) =>
                    patchProject(projectId, (project) => {
                        const revision = project.revisions.find((item) => item.id === revisionId);
                        if (!revision) return project;
                        return { ...project, docs: { ...project.docs, [revision.outlineId]: { outlineId: revision.outlineId, html: revision.html, plain: revision.plain, wordCount: revision.wordCount, updatedAt: stamp() } } };
                    }),
                deleteRevision: (projectId, revisionId) => patchProject(projectId, (project) => ({ ...project, revisions: project.revisions.filter((item) => item.id !== revisionId) })),
                addCodexEntry: (projectId, kind, name = "") => {
                    const entryId = nanoid();
                    patchProject(projectId, (project) => ({
                        ...project,
                        codex: [
                            ...project.codex,
                            { id: entryId, kind, name: name.trim() || i18n.t("writing.codex.untitled"), aliases: [], summary: "", fields: {}, tags: [] },
                        ],
                    }));
                    return entryId;
                },
                updateCodexEntry: (projectId, entryId, patch) =>
                    patchProject(projectId, (project) => ({ ...project, codex: project.codex.map((entry) => (entry.id === entryId ? { ...entry, ...patch } : entry)) })),
                removeCodexEntry: (projectId, entryId) =>
                    patchProject(projectId, (project) => ({
                        ...project,
                        codex: project.codex.filter((entry) => entry.id !== entryId),
                        outline: project.outline.map((node) => ({
                            ...node,
                            characterIds: node.characterIds.filter((id) => id !== entryId),
                            threadIds: node.threadIds.filter((id) => id !== entryId),
                            locationId: node.locationId === entryId ? null : node.locationId,
                        })),
                    })),
                importCodex: (projectId, entries) =>
                    patchProject(projectId, (project) => {
                        const existing = new Set(project.codex.map((entry) => `${entry.kind}:${entry.name}`));
                        const fresh = entries.filter((entry) => !existing.has(`${entry.kind}:${entry.name}`)).map((entry) => ({ ...entry, id: nanoid() }));
                        return { ...project, codex: [...project.codex, ...fresh] };
                    }),
                createGroup: (name) => {
                    const id = nanoid();
                    const group: WriteGroup = { id, name: name?.trim() || i18n.t("writing.group.defaultName", { count: get().groups.length + 1 }), createdAt: stamp() };
                    set((state) => ({ groups: [...state.groups, group] }));
                    return id;
                },
                renameGroup: (id, name) =>
                    set((state) => ({ groups: state.groups.map((group) => (group.id === id ? { ...group, name: name.trim() || group.name } : group)) })),
                deleteGroup: (id) =>
                    set((state) => ({
                        groups: state.groups.filter((group) => group.id !== id),
                        projects: state.projects.filter((project) => project.groupId !== id),
                    })),
                setProjectGroup: (projectId, groupId) => patchProject(projectId, (project) => ({ ...project, groupId })),
            };
        },
        {
            name: WRITING_STORE_KEY,
            storage: writingStorage,
            partialize: (state) => ({ projects: state.projects, groups: state.groups }) as unknown as WritingStore,
            onRehydrateStorage: () => (state) => {
                if (state) state.hydrated = true;
                const { projects, groups } = useWritingStore.getState();
                const hasGroup = (project: WriteProject) => Boolean(project.groupId && groups.some((group) => group.id === project.groupId));
                if (!projects.some((project) => !hasGroup(project))) return;
                if (groups.length) {
                    const groupId = groups[0].id;
                    useWritingStore.setState({ projects: projects.map((project) => (hasGroup(project) ? project : { ...project, groupId })) });
                    return;
                }
                const group: WriteGroup = { id: nanoid(), name: i18n.t("writing.group.defaultName", { count: 1 }), createdAt: stamp() };
                useWritingStore.setState({ groups: [group], projects: projects.map((project) => ({ ...project, groupId: group.id })) });
            },
        },
    ),
);

export function useWritingProject(id: string | undefined) {
    return useWritingStore((state) => state.projects.find((project) => project.id === id) ?? null);
}
