import { nanoid } from "nanoid";
import { create } from "zustand";
import { persist } from "zustand/middleware";

import { createPixelDoc } from "@/lib/canvas/pixel/document";
import { createDebouncedPersist } from "@/lib/localforage-storage";
import type { CanvasPixelDoc } from "@/types/canvas";

export type PixelProject = {
    id: string;
    title: string;
    createdAt: string;
    updatedAt: string;
    groupId: string;
    doc: CanvasPixelDoc;
};

export type PixelGroup = {
    id: string;
    name: string;
    createdAt: string;
};

type PixelStore = {
    hydrated: boolean;
    projects: PixelProject[];
    groups: PixelGroup[];
    createProject: (title?: string, size?: { width: number; height: number }, groupId?: string | null) => string;
    renameProject: (id: string, title: string) => void;
    deleteProject: (id: string) => void;
    deleteProjects: (ids: string[]) => void;
    updateProject: (id: string, patch: Partial<PixelProject>) => void;
    createGroup: (name?: string) => string;
    renameGroup: (id: string, name: string) => void;
    deleteGroup: (id: string) => void;
    setProjectGroup: (projectId: string, groupId: string) => void;
};

const stamp = () => new Date().toISOString();

const pixelStorage = createDebouncedPersist<PixelStore>(["projects", "groups"]);

export const usePixelStore = create<PixelStore>()(
    persist(
        (set, get) => ({
            hydrated: false,
            projects: [],
            groups: [],
            createProject: (title, size, groupId) => {
                const state = get();
                let targetGroupId = groupId;
                if (!targetGroupId || !state.groups.some((g) => g.id === targetGroupId)) {
                    if (state.groups.length === 0) {
                        const newGId = nanoid();
                        const defaultGroup: PixelGroup = { id: newGId, name: "Default Group", createdAt: stamp() };
                        set((s) => ({ groups: [defaultGroup] }));
                        targetGroupId = newGId;
                    } else {
                        targetGroupId = state.groups[0].id;
                    }
                }
                const id = nanoid();
                const now = stamp();
                const project: PixelProject = {
                    id,
                    title: title?.trim() || `Pixel Canvas ${get().projects.length + 1}`,
                    createdAt: now,
                    updatedAt: now,
                    groupId: targetGroupId,
                    doc: createPixelDoc(size?.width ?? 64, size?.height ?? 64),
                };
                set((s) => ({ projects: [project, ...s.projects] }));
                return id;
            },
            renameProject: (id, title) =>
                set((state) => ({
                    projects: state.projects.map((p) => (p.id === id ? { ...p, title, updatedAt: stamp() } : p)),
                })),
            deleteProject: (id) =>
                set((state) => ({
                    projects: state.projects.filter((p) => p.id !== id),
                })),
            deleteProjects: (ids) =>
                set((state) => ({
                    projects: state.projects.filter((p) => !ids.includes(p.id)),
                })),
            updateProject: (id, patch) =>
                set((state) => ({
                    projects: state.projects.map((p) => (p.id === id ? { ...p, ...patch, updatedAt: stamp() } : p)),
                })),
            createGroup: (name = "Untitled Group") => {
                const id = nanoid();
                set((state) => ({ groups: [...state.groups, { id, name, createdAt: stamp() }] }));
                return id;
            },
            renameGroup: (id, name) =>
                set((state) => ({
                    groups: state.groups.map((g) => (g.id === id ? { ...g, name } : g)),
                })),
            deleteGroup: (id) =>
                set((state) => {
                    const remainingGroups = state.groups.filter((g) => g.id !== id);
                    const remainingProjects = state.projects.filter((p) => p.groupId !== id);
                    if (remainingGroups.length === 0) {
                        const defaultGroup: PixelGroup = { id: nanoid(), name: "Default Group", createdAt: stamp() };
                        return {
                            groups: [defaultGroup],
                            projects: remainingProjects,
                        };
                    }
                    return {
                        groups: remainingGroups,
                        projects: remainingProjects,
                    };
                }),
            setProjectGroup: (projectId, groupId) =>
                set((state) => {
                    if (!state.groups.some((g) => g.id === groupId)) return state;
                    return {
                        projects: state.projects.map((p) => (p.id === projectId ? { ...p, groupId, updatedAt: stamp() } : p)),
                    };
                }),
        }),
        {
            name: "open-canvas:pixel_projects",
            storage: pixelStorage,
            onRehydrateStorage: () => () => {
                usePixelStore.setState({ hydrated: true });
                const { projects, groups } = usePixelStore.getState();
                const hasGroup = (project: PixelProject) => Boolean(project.groupId && groups.some((group) => group.id === project.groupId));
                if (groups.length === 0) {
                    const defaultGroup: PixelGroup = { id: nanoid(), name: "Default Group", createdAt: stamp() };
                    usePixelStore.setState({
                        groups: [defaultGroup],
                        projects: (projects || []).map((p) => ({ ...p, groupId: defaultGroup.id })),
                    });
                    return;
                }
                if ((projects || []).some((project) => !hasGroup(project))) {
                    const groupId = groups[0].id;
                    usePixelStore.setState({
                        projects: projects.map((project) => (hasGroup(project) ? project : { ...project, groupId })),
                    });
                }
            },
        },
    ),
);

