import { nanoid } from "nanoid";
import { create } from "zustand";
import { persist } from "zustand/middleware";

import { createDebouncedPersist } from "@/lib/localforage-storage";
import type { CanvasPsAlphaChannel, CanvasPsLayer, CanvasPsPath } from "@/types/canvas";

export type ImageProject = {
    id: string;
    title: string;
    createdAt: string;
    updatedAt: string;
    groupId: string;
    width: number;
    height: number;
    boardRatio: string;
    boardResolution: "1k" | "2k" | "4k";
    boardBackground: string;
    boardBackgroundOpacity: number;
    boardLayers: CanvasPsLayer[];
    boardPaths?: CanvasPsPath[];
    boardAlphaChannels?: CanvasPsAlphaChannel[];
    boardChannelVisibility?: { r: boolean; g: boolean; b: boolean };
};

export type ImageGroup = {
    id: string;
    name: string;
    createdAt: string;
};

export type ImagePreset = {
    id: string;
    name: string;
    width: number;
    height: number;
    ratio: string;
};

export const IMAGE_PRESETS: ImagePreset[] = [
    { id: "16:9", name: "16:9 Widescreen (1920 × 1080)", width: 1920, height: 1080, ratio: "16:9" },
    { id: "1:1", name: "1:1 Square (1024 × 1024)", width: 1024, height: 1024, ratio: "1:1" },
    { id: "9:16", name: "9:16 Portrait (1080 × 1920)", width: 1080, height: 1920, ratio: "9:16" },
    { id: "4:3", name: "4:3 Standard (1600 × 1200)", width: 1600, height: 1200, ratio: "4:3" },
    { id: "3:4", name: "3:4 Portrait (1200 × 1600)", width: 1200, height: 1600, ratio: "3:4" },
    { id: "21:9", name: "21:9 Ultra-Wide (2560 × 1080)", width: 2560, height: 1080, ratio: "21:9" },
];

type ImageStore = {
    hydrated: boolean;
    projects: ImageProject[];
    groups: ImageGroup[];
    createProject: (
        title?: string,
        preset?: Partial<Pick<ImageProject, "width" | "height" | "boardRatio" | "boardBackground" | "boardResolution">>,
        groupId?: string | null,
    ) => string;
    renameProject: (id: string, title: string) => void;
    deleteProject: (id: string) => void;
    updateProject: (id: string, patch: Partial<ImageProject>) => void;
    createGroup: (name?: string) => string;
    renameGroup: (id: string, name: string) => void;
    deleteGroup: (id: string) => void;
    setProjectGroup: (projectId: string, groupId: string) => void;
};

const stamp = () => new Date().toISOString();

const imageStorage = createDebouncedPersist<ImageStore>(["projects", "groups"]);

export const useImageStore = create<ImageStore>()(
    persist(
        (set, get) => ({
            hydrated: false,
            projects: [],
            groups: [],
            createProject: (title, preset, groupId) => {
                const state = get();
                let targetGroupId = groupId;
                if (!targetGroupId || !state.groups.some((g) => g.id === targetGroupId)) {
                    if (state.groups.length === 0) {
                        const newGId = nanoid();
                        const defaultGroup: ImageGroup = { id: newGId, name: "Default Group", createdAt: stamp() };
                        set((s) => ({ groups: [defaultGroup] }));
                        targetGroupId = newGId;
                    } else {
                        targetGroupId = state.groups[0].id;
                    }
                }
                const id = nanoid();
                const now = stamp();
                const width = preset?.width || 1920;
                const height = preset?.height || 1080;
                const project: ImageProject = {
                    id,
                    title: title?.trim() || `Image Project ${get().projects.length + 1}`,
                    createdAt: now,
                    updatedAt: now,
                    groupId: targetGroupId,
                    width,
                    height,
                    boardRatio: preset?.boardRatio || "16:9",
                    boardResolution: preset?.boardResolution || "2k",
                    boardBackground: preset?.boardBackground ?? "#ffffff",
                    boardBackgroundOpacity: 1,
                    boardLayers: [],
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
                        const defaultGroup: ImageGroup = { id: nanoid(), name: "Default Group", createdAt: stamp() };
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
            name: "open-canvas:image_projects",
            storage: imageStorage,
            onRehydrateStorage: () => () => {
                useImageStore.setState({ hydrated: true });
                const { projects, groups } = useImageStore.getState();
                const hasGroup = (project: ImageProject) => Boolean(project.groupId && groups.some((group) => group.id === project.groupId));
                if (groups.length === 0) {
                    const defaultGroup: ImageGroup = { id: nanoid(), name: "Default Group", createdAt: stamp() };
                    useImageStore.setState({
                        groups: [defaultGroup],
                        projects: projects.map((p) => ({ ...p, groupId: defaultGroup.id })),
                    });
                    return;
                }
                if (projects.some((project) => !hasGroup(project))) {
                    const groupId = groups[0].id;
                    useImageStore.setState({
                        projects: projects.map((project) => (hasGroup(project) ? project : { ...project, groupId })),
                    });
                }
            },
        },
    ),
);

