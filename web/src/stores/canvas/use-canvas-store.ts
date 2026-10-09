import { create } from "zustand";
import { persist } from "zustand/middleware";

import { nanoid } from "nanoid";
import i18n from "@/i18n";
import { createDebouncedPersist } from "@/lib/localforage-storage";
import type { CanvasConnection, CanvasNodeData, CanvasScope, ViewportTransform } from "@/types/canvas";

export type CanvasProject = {
    id: string;
    title: string;
    createdAt: string;
    updatedAt: string;
    groupId?: string | null;
    nodes: CanvasNodeData[];
    connections: CanvasConnection[];
    viewport: ViewportTransform;
    scope?: CanvasScope;
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

type CanvasRemoteSync = { projectId: string; nonce: number };

type CanvasStore = {
    hydrated: boolean;
    projects: CanvasProject[];
    groups: CanvasGroup[];
    deletedProjects: CanvasDeletedProject[];
    remoteSync: CanvasRemoteSync | null;
    createProject: (title?: string, groupId?: string | null) => string;
    importProject: (project: Partial<CanvasProject>) => string;
    openProject: (id: string) => CanvasProject | null;
    renameProject: (id: string, title: string) => void;
    deleteProjects: (ids: string[]) => void;
    replaceProjects: (projects: CanvasProject[], deletedProjects?: CanvasDeletedProject[]) => void;
    reorderProjects: (orderedIds: string[]) => void;
    updateProject: (id: string, patch: Partial<Pick<CanvasProject, "nodes" | "connections" | "viewport" | "groupId" | "scope">>) => void;
    createGroup: (name?: string) => string;
    renameGroup: (id: string, name: string) => void;
    deleteGroup: (id: string) => void;
    setProjectGroup: (projectId: string, groupId: string | null) => void;
    applyRemote: (message: CanvasBroadcastMessage) => void;
};

type CanvasBroadcastMessage = { senderId: string; entity: "project"; project: CanvasProject } | { senderId: string; entity: "delete"; ids: string[] };

const initialViewport: ViewportTransform = { x: 0, y: 0, k: 1 };
const CANVAS_STORE_KEY = "open-canvas:canvas_store";
const CANVAS_CHANNEL_NAME = "open-canvas:canvas-store";
const SENDER_ID = nanoid();

const canvasChannel: BroadcastChannel | null = typeof BroadcastChannel === "undefined" ? null : new BroadcastChannel(CANVAS_CHANNEL_NAME);

const broadcast = (message: CanvasBroadcastMessage) => {
    canvasChannel?.postMessage(message);
};

const canvasStorage = createDebouncedPersist<Pick<CanvasStore, "projects" | "groups" | "deletedProjects">>(["projects", "groups", "deletedProjects"]);

const resolveGroupId = (preferred?: string | null) => {
    const { groups } = useCanvasStore.getState();
    if (preferred && groups.some((group) => group.id === preferred)) return preferred;
    if (groups.length) return groups[0].id;
    const group: CanvasGroup = { id: nanoid(), name: i18n.t("canvas.group.defaultName", { count: 1 }), createdAt: new Date().toISOString() };
    useCanvasStore.setState((state) => ({ groups: [...state.groups, group] }));
    return group.id;
};

export const useCanvasStore = create<CanvasStore>()(
    persist(
        (set, get) => ({
            hydrated: false,
            projects: [],
            groups: [],
            deletedProjects: [],
            remoteSync: null,
            createProject: (title = i18n.t("canvas.project.untitled"), groupId) => {
                const now = new Date().toISOString();
                const id = nanoid();
                const project: CanvasProject = {
                    id,
                    title,
                    createdAt: now,
                    updatedAt: now,
                    groupId: resolveGroupId(groupId),
                    nodes: [],
                    connections: [],
                    viewport: initialViewport,
                };
                set((state) => ({ projects: [...state.projects, project] }));
                return id;
            },
            importProject: (source) => {
                const now = new Date().toISOString();
                const groupId = resolveGroupId(source.groupId);
                const project: CanvasProject = {
                    id: nanoid(),
                    title: source.title || i18n.t("canvas.project.imported"),
                    createdAt: source.createdAt || now,
                    updatedAt: now,
                    groupId,
                    nodes: source.nodes || [],
                    connections: source.connections || [],
                    viewport: source.viewport || initialViewport,
                    scope: source.scope,
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
            deleteProjects: (ids) => {
                set((state) => {
                    const now = new Date().toISOString();
                    const removing = new Set(ids);
                    const projects = state.projects.filter((project) => !removing.has(project.id));
                    const deletedProjects = [...state.deletedProjects.filter((item) => !removing.has(item.id)), ...ids.map((id) => ({ id, deletedAt: now }))];
                    return { projects, deletedProjects };
                });
                broadcast({ senderId: SENDER_ID, entity: "delete", ids });
            },
            replaceProjects: (projects, deletedProjects = []) => {
                set({ projects, deletedProjects });
                projects.forEach((project) => broadcast({ senderId: SENDER_ID, entity: "project", project }));
            },
            reorderProjects: (orderedIds) =>
                set((state) => {
                    const byId = new Map(state.projects.map((project) => [project.id, project]));
                    const moving = new Set(orderedIds);
                    const ordered = orderedIds.map((id) => byId.get(id)).filter((project): project is CanvasProject => Boolean(project));
                    let cursor = 0;
                    return { projects: state.projects.map((project) => (moving.has(project.id) ? ordered[cursor++] : project)) };
                }),
            updateProject: (id, patch) => {
                set((state) => ({
                    projects: state.projects.map((project) => (project.id === id ? { ...project, ...patch, updatedAt: new Date().toISOString() } : project)),
                }));
                const project = get().projects.find((item) => item.id === id);
                if (project) broadcast({ senderId: SENDER_ID, entity: "project", project });
            },
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
            setProjectGroup: (projectId, groupId) => {
                const before = get().projects.find((project) => project.id === projectId);
                if (!before || before.groupId === groupId) return;
                set((state) => ({
                    projects: state.projects.map((project) => (project.id === projectId ? { ...project, groupId, updatedAt: new Date().toISOString() } : project)),
                }));
                const project = get().projects.find((item) => item.id === projectId);
                if (project) broadcast({ senderId: SENDER_ID, entity: "project", project });
            },
            applyRemote: (message) => {
                if (message.senderId === SENDER_ID) return;
                if (message.entity === "delete") {
                    const removing = new Set(message.ids);
                    set((state) => ({ projects: state.projects.filter((project) => !removing.has(project.id)) }));
                    return;
                }
                const incoming = message.project;
                set((state) => {
                    const index = state.projects.findIndex((project) => project.id === incoming.id);
                    const projects = index === -1 ? [...state.projects, incoming] : state.projects.map((project) => (project.id === incoming.id ? incoming : project));
                    return { projects, remoteSync: { projectId: incoming.id, nonce: (state.remoteSync?.nonce ?? 0) + 1 } };
                });
            },
        }),
        {
            name: CANVAS_STORE_KEY,
            storage: canvasStorage,
            partialize: (state) => ({
                projects: state.projects,
                groups: state.groups,
                deletedProjects: state.deletedProjects,
            }),
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

canvasChannel?.addEventListener("message", (event: MessageEvent<CanvasBroadcastMessage>) => {
    useCanvasStore.getState().applyRemote(event.data);
});
