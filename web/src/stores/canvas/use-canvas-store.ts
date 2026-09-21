import { create } from "zustand";
import { persist, type PersistStorage, type StorageValue } from "zustand/middleware";

import { nanoid } from "nanoid";
import i18n from "@/i18n";
import { localForageStorage } from "@/lib/localforage-storage";
import type { CanvasConnection, CanvasNodeData, ViewportTransform } from "@/types/canvas";

export type CanvasProject = {
    id: string;
    title: string;
    createdAt: string;
    updatedAt: string;
    groupId?: string | null;
    nodes: CanvasNodeData[];
    connections: CanvasConnection[];
    viewport: ViewportTransform;
};

type CanvasGroup = {
    id: string;
    name: string;
    createdAt: string;
};

type CanvasDeletedProject = {
    id: string;
    deletedAt: string;
};

type CanvasStore = {
    hydrated: boolean;
    projects: CanvasProject[];
    groups: CanvasGroup[];
    deletedProjects: CanvasDeletedProject[];
    createProject: (title?: string, groupId?: string | null) => string;
    importProject: (project: Partial<CanvasProject>) => string;
    openProject: (id: string) => CanvasProject | null;
    renameProject: (id: string, title: string) => void;
    deleteProjects: (ids: string[]) => void;
    replaceProjects: (projects: CanvasProject[], deletedProjects?: CanvasDeletedProject[]) => void;
    reorderProjects: (orderedIds: string[]) => void;
    updateProject: (id: string, patch: Partial<Pick<CanvasProject, "nodes" | "connections" | "viewport" | "groupId">>) => void;
    createGroup: (name?: string) => string;
    renameGroup: (id: string, name: string) => void;
    deleteGroup: (id: string) => void;
    setProjectGroup: (projectId: string, groupId: string | null) => void;
};

const initialViewport: ViewportTransform = { x: 0, y: 0, k: 1 };
const CANVAS_STORE_KEY = "infinite-canvas:canvas_store";
type PersistedCanvasState = Pick<CanvasStore, "projects" | "groups" | "deletedProjects">;
let saveTimer: ReturnType<typeof setTimeout> | null = null;
let queuedPersistState: PersistedCanvasState | null = null;

const canvasStorage: PersistStorage<CanvasStore> = {
    getItem: async (name) => {
        const value = await localForageStorage.getItem(name);
        if (!value) return null;
        const parsed = JSON.parse(value) as StorageValue<CanvasStore>;
        queuedPersistState = parsed.state as PersistedCanvasState;
        return parsed;
    },
    setItem: (name, value) => {
        const nextState = value.state as PersistedCanvasState;
        if (queuedPersistState && queuedPersistState.projects === nextState.projects && queuedPersistState.groups === nextState.groups && queuedPersistState.deletedProjects === nextState.deletedProjects) return;
        queuedPersistState = nextState;
        if (saveTimer) clearTimeout(saveTimer);
        saveTimer = setTimeout(() => {
            saveTimer = null;
            void localForageStorage.setItem(name, JSON.stringify(value));
        }, 400);
    },
    removeItem: (name) => localForageStorage.removeItem(name),
};

export const useCanvasStore = create<CanvasStore>()(
    persist(
        (set, get) => ({
            hydrated: false,
            projects: [],
            groups: [],
            deletedProjects: [],
            createProject: (title = i18n.t("canvas.project.untitled"), groupId = get().groups[0]?.id ?? null) => {
                const now = new Date().toISOString();
                const id = nanoid();
                const project: CanvasProject = {
                    id,
                    title,
                    createdAt: now,
                    updatedAt: now,
                    groupId,
                    nodes: [],
                    connections: [],
                    viewport: initialViewport,
                };
                set((state) => ({ projects: [...state.projects, project] }));
                return id;
            },
            importProject: (source) => {
                const now = new Date().toISOString();
                const groupId = source.groupId && get().groups.some((group) => group.id === source.groupId) ? source.groupId : get().groups[0]?.id ?? null;
                const project: CanvasProject = {
                    id: nanoid(),
                    title: source.title || i18n.t("canvas.project.imported"),
                    createdAt: source.createdAt || now,
                    updatedAt: now,
                    groupId,
                    nodes: source.nodes || [],
                    connections: source.connections || [],
                    viewport: source.viewport || initialViewport,
                };
                set((state) => ({ projects: [...state.projects, project] }));
                return project.id;
            },
            openProject: (id) => {
                return get().projects.find((item) => item.id === id) || null;
            },
            renameProject: (id, title) =>
                set((state) => ({
                    projects: state.projects.map((project) => (project.id === id ? { ...project, title: title.trim() || project.title, updatedAt: new Date().toISOString() } : project)),
                })),
            deleteProjects: (ids) =>
                set((state) => {
                    const now = new Date().toISOString();
                    const removing = new Set(ids);
                    const projects = state.projects.filter((project) => !removing.has(project.id));
                    const deletedProjects = [...state.deletedProjects.filter((item) => !removing.has(item.id)), ...ids.map((id) => ({ id, deletedAt: now }))];
                    return { projects, deletedProjects };
                }),
            replaceProjects: (projects, deletedProjects = []) => set({ projects, deletedProjects }),
            reorderProjects: (orderedIds) =>
                set((state) => {
                    const byId = new Map(state.projects.map((project) => [project.id, project]));
                    const moving = new Set(orderedIds);
                    const ordered = orderedIds.map((id) => byId.get(id)).filter((project): project is CanvasProject => Boolean(project));
                    let cursor = 0;
                    return { projects: state.projects.map((project) => (moving.has(project.id) ? ordered[cursor++] : project)) };
                }),
            updateProject: (id, patch) =>
                set((state) => ({
                    projects: state.projects.map((project) => (project.id === id ? { ...project, ...patch, updatedAt: new Date().toISOString() } : project)),
                })),
            createGroup: (name) => {
                const id = nanoid();
                const group: CanvasGroup = { id, name: name?.trim() || i18n.t("canvas.group.defaultName", { count: get().groups.length + 1 }), createdAt: new Date().toISOString() };
                set((state) => ({ groups: [...state.groups, group] }));
                return id;
            },
            renameGroup: (id, name) =>
                set((state) => ({
                    groups: state.groups.map((group) => (group.id === id ? { ...group, name: name.trim() || group.name } : group)),
                })),
            deleteGroup: (id) =>
                set((state) => {
                    const now = new Date().toISOString();
                    const removed = state.projects.filter((project) => project.groupId === id);
                    const removedIds = new Set(removed.map((project) => project.id));
                    return {
                        groups: state.groups.filter((group) => group.id !== id),
                        projects: state.projects.filter((project) => !removedIds.has(project.id)),
                        deletedProjects: [...state.deletedProjects.filter((item) => !removedIds.has(item.id)), ...removed.map((project) => ({ id: project.id, deletedAt: now }))],
                    };
                }),
            setProjectGroup: (projectId, groupId) =>
                set((state) => ({
                    projects: state.projects.map((project) => (project.id === projectId ? { ...project, groupId, updatedAt: new Date().toISOString() } : project)),
                })),
        }),
        {
            name: CANVAS_STORE_KEY,
            storage: canvasStorage,
            partialize: (state) =>
                ({
                    projects: state.projects,
                    groups: state.groups,
                    deletedProjects: state.deletedProjects,
                }) as StorageValue<CanvasStore>["state"],
            merge: (persisted, current) => {
                const saved = persisted as Partial<CanvasStore> | undefined;
                return { ...current, ...saved, groups: saved?.groups ?? [] };
            },
            onRehydrateStorage: () => () => {
                useCanvasStore.setState({ hydrated: true });
                const { projects, groups } = useCanvasStore.getState();
                const hasGroup = (project: CanvasProject) => Boolean(project.groupId && groups.some((group) => group.id === project.groupId));
                if (!projects.some((project) => !hasGroup(project))) return;
                if (groups.length) {
                    const groupId = groups[0].id;
                    useCanvasStore.setState({ projects: projects.map((project) => (hasGroup(project) ? project : { ...project, groupId })) });
                    return;
                }
                const group: CanvasGroup = { id: nanoid(), name: i18n.t("canvas.group.defaultName", { count: 1 }), createdAt: new Date().toISOString() };
                useCanvasStore.setState({ groups: [group], projects: projects.map((project) => ({ ...project, groupId: group.id })) });
            },
        },
    ),
);
