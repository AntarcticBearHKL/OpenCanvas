import { nanoid } from "nanoid";
import { create } from "zustand";
import { persist, type PersistStorage, type StorageValue } from "zustand/middleware";

import i18n from "@/i18n";
import { localForageStorage } from "@/lib/localforage-storage";
import { createAudioTrack } from "@/lib/canvas/audio-project";
import type {
    CanvasAudioAutomationLane,
    CanvasAudioCapture,
    CanvasAudioClip,
    CanvasAudioMarker,
    CanvasAudioMidiRegion,
    CanvasAudioSnap,
    CanvasAudioTrack,
} from "@/types/canvas";

export type AudioProject = {
    id: string;
    title: string;
    createdAt: string;
    updatedAt: string;
    groupId: string;
    tracks: CanvasAudioTrack[];
    clips: CanvasAudioClip[];
    tempo: number;
    timeSignature: { numerator: number; denominator: number };
    grid: { enabled: boolean; snap: CanvasAudioSnap };
    cycle: { enabled: boolean; start: number; end: number };
    punch: { enabled: boolean; in: number; out: number };
    markers: CanvasAudioMarker[];
    metronome: { enabled: boolean; volumeDb: number };
    automation: CanvasAudioAutomationLane[];
    midiRegions: CanvasAudioMidiRegion[];
    ppqn: number;
    masterGain: number;
    capture?: CanvasAudioCapture;
    countIn?: number;
};

export type AudioGroup = {
    id: string;
    name: string;
    createdAt: string;
};

type AudioStore = {
    hydrated: boolean;
    projects: AudioProject[];
    groups: AudioGroup[];
    createProject: (title?: string, groupId?: string | null) => string;
    renameProject: (id: string, title: string) => void;
    deleteProject: (id: string) => void;
    deleteProjects: (ids: string[]) => void;
    reorderProjects: (orderedIds: string[]) => void;
    updateProject: (id: string, patch: Partial<AudioProject>) => void;
    createGroup: (name?: string) => string;
    renameGroup: (id: string, name: string) => void;
    deleteGroup: (id: string) => void;
    setProjectGroup: (projectId: string, groupId: string) => void;
};

const stamp = () => new Date().toISOString();

type PersistedAudioState = { projects: AudioProject[]; groups: AudioGroup[] };

let saveTimer: ReturnType<typeof setTimeout> | null = null;
let queuedPersistState: PersistedAudioState | null = null;

const audioStorage: PersistStorage<AudioStore> = {
    getItem: async (name) => {
        const value = await localForageStorage.getItem(name);
        if (!value) return null;
        const parsed = JSON.parse(value) as StorageValue<AudioStore>;
        queuedPersistState = parsed.state as unknown as PersistedAudioState;
        return parsed;
    },
    setItem: (name, value) => {
        const next = value.state as unknown as PersistedAudioState;
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

export const useAudioStore = create<AudioStore>()(
    persist(
        (set, get) => ({
            hydrated: false,
            projects: [],
            groups: [],
            createProject: (title, groupId) => {
                const state = get();
                let targetGroupId = groupId;
                if (!targetGroupId || !state.groups.some((g) => g.id === targetGroupId)) {
                    if (state.groups.length === 0) {
                        const newGId = nanoid();
                        const defaultGroup: AudioGroup = { id: newGId, name: "Default Group", createdAt: stamp() };
                        set((s) => ({ groups: [defaultGroup] }));
                        targetGroupId = newGId;
                    } else {
                        targetGroupId = state.groups[0].id;
                    }
                }
                const id = nanoid();
                const now = stamp();
                const track1 = createAudioTrack("audio");
                track1.name = "Audio Track 1";
                const masterTrack: CanvasAudioTrack = {
                    id: "master",
                    name: "Master",
                    type: "master",
                    gain: 1,
                    pan: 0,
                    mute: false,
                    solo: false,
                };
                const project: AudioProject = {
                    id,
                    title: title?.trim() || `Audio Project ${get().projects.length + 1}`,
                    createdAt: now,
                    updatedAt: now,
                    groupId: targetGroupId,
                    tracks: [track1, masterTrack],
                    clips: [],
                    tempo: 120,
                    timeSignature: { numerator: 4, denominator: 4 },
                    grid: { enabled: true, snap: "beat" },
                    cycle: { enabled: false, start: 0, end: 0 },
                    punch: { enabled: false, in: 0, out: 0 },
                    markers: [],
                    metronome: { enabled: false, volumeDb: -6 },
                    automation: [],
                    midiRegions: [],
                    ppqn: 960,
                    masterGain: 1,
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
            reorderProjects: (orderedIds) =>
                set((state) => {
                    const map = new Map(state.projects.map((p) => [p.id, p]));
                    const next = orderedIds.map((id) => map.get(id)).filter((p): p is AudioProject => Boolean(p));
                    const remaining = state.projects.filter((p) => !orderedIds.includes(p.id));
                    return { projects: [...next, ...remaining] };
                }),
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
                        const defaultGroup: AudioGroup = { id: nanoid(), name: "Default Group", createdAt: stamp() };
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
            name: "infinite-canvas:audio_projects",
            storage: audioStorage,
            onRehydrateStorage: () => () => {
                useAudioStore.setState({ hydrated: true });
                const { projects, groups } = useAudioStore.getState();
                const hasGroup = (project: AudioProject) => Boolean(project.groupId && groups.some((group) => group.id === project.groupId));
                if (groups.length === 0) {
                    const defaultGroup: AudioGroup = { id: nanoid(), name: "Default Group", createdAt: stamp() };
                    useAudioStore.setState({
                        groups: [defaultGroup],
                        projects: projects.map((p) => ({ ...p, groupId: defaultGroup.id })),
                    });
                    return;
                }
                if (projects.some((project) => !hasGroup(project))) {
                    const groupId = groups[0].id;
                    useAudioStore.setState({
                        projects: projects.map((project) => (hasGroup(project) ? project : { ...project, groupId })),
                    });
                }
            },
        },
    ),
);

export function useAudioProject(id: string | undefined) {
    return useAudioStore((state) => (id ? state.projects.find((p) => p.id === id) || null : null));
}
