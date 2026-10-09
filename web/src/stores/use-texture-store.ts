import { nanoid } from "nanoid";
import { create } from "zustand";
import { persist } from "zustand/middleware";

import { createDebouncedPersist } from "@/lib/localforage-storage";
import { createDefaultState, type EditorState } from "@/lib/texture/types";

export type TextureProject = {
    id: string;
    title: string;
    state: EditorState;
    createdAt: string;
    updatedAt: string;
    groupId: string;
};

export type TextureGroup = {
    id: string;
    name: string;
    createdAt: string;
};

type TextureStore = {
    hydrated: boolean;
    projects: TextureProject[];
    groups: TextureGroup[];
    createProject: (title?: string, groupId?: string) => string;
    updateProject: (id: string, patch: Partial<TextureProject>) => void;
    renameProject: (id: string, title: string) => void;
    deleteProject: (id: string) => void;
    createGroup: (name?: string) => string;
    renameGroup: (id: string, name: string) => void;
    deleteGroup: (id: string) => void;
    setProjectGroup: (projectId: string, groupId: string) => void;
};

const stamp = () => new Date().toISOString();

const textureStorage = createDebouncedPersist<TextureStore>(["projects", "groups"]);

export const useTextureStore = create<TextureStore>()(
    persist(
        (set, get) => ({
            hydrated: false,
            projects: [],
            groups: [],
            createProject: (title, groupId) => {
                const state = get();
                let targetGroupId = groupId;
                if (!targetGroupId || !state.groups.some((group) => group.id === targetGroupId)) {
                    if (state.groups.length === 0) {
                        const defaultGroupId = nanoid();
                        const defaultGroup: TextureGroup = { id: defaultGroupId, name: "Default Group", createdAt: stamp() };
                        set((s) => ({ groups: [defaultGroup] }));
                        targetGroupId = defaultGroupId;
                    } else {
                        targetGroupId = state.groups[0].id;
                    }
                }
                const id = nanoid();
                const now = stamp();
                const project: TextureProject = {
                    id,
                    title: title?.trim() || `Texture ${get().projects.length + 1}`,
                    state: createDefaultState(),
                    createdAt: now,
                    updatedAt: now,
                    groupId: targetGroupId,
                };
                set((s) => ({ projects: [project, ...s.projects] }));
                return id;
            },
            updateProject: (id, patch) =>
                set((state) => ({
                    projects: state.projects.map((project) => (project.id === id ? { ...project, ...patch, updatedAt: stamp() } : project)),
                })),
            renameProject: (id, title) =>
                set((state) => ({
                    projects: state.projects.map((project) => (project.id === id ? { ...project, title, updatedAt: stamp() } : project)),
                })),
            deleteProject: (id) =>
                set((state) => ({
                    projects: state.projects.filter((project) => project.id !== id),
                })),
            createGroup: (name = "Untitled Group") => {
                const id = nanoid();
                set((state) => ({ groups: [...state.groups, { id, name, createdAt: stamp() }] }));
                return id;
            },
            renameGroup: (id, name) =>
                set((state) => ({
                    groups: state.groups.map((group) => (group.id === id ? { ...group, name } : group)),
                })),
            deleteGroup: (id) =>
                set((state) => {
                    const remainingGroups = state.groups.filter((group) => group.id !== id);
                    const remainingProjects = state.projects.filter((project) => project.groupId !== id);
                    if (remainingGroups.length === 0) {
                        const defaultGroup: TextureGroup = { id: nanoid(), name: "Default Group", createdAt: stamp() };
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
                    if (!state.groups.some((group) => group.id === groupId)) return state;
                    return {
                        projects: state.projects.map((project) => (project.id === projectId ? { ...project, groupId, updatedAt: stamp() } : project)),
                    };
                }),
        }),
        {
            name: "open-canvas:texture_projects",
            storage: textureStorage,
            onRehydrateStorage: () => () => {
                useTextureStore.setState({ hydrated: true });
                const { projects, groups } = useTextureStore.getState();
                const hasGroup = (project: TextureProject) => Boolean(project.groupId && groups.some((group) => group.id === project.groupId));
                if (groups.length === 0) {
                    const defaultGroup: TextureGroup = { id: nanoid(), name: "Default Group", createdAt: stamp() };
                    useTextureStore.setState({
                        groups: [defaultGroup],
                        projects: (projects || []).map((project) => ({ ...project, groupId: defaultGroup.id })),
                    });
                    return;
                }
                if ((projects || []).some((project) => !hasGroup(project))) {
                    const groupId = groups[0].id;
                    useTextureStore.setState({
                        projects: projects.map((project) => (hasGroup(project) ? project : { ...project, groupId })),
                    });
                }
            },
        },
    ),
);
