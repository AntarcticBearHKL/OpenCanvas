import { create } from "zustand";

import type { WriteEntityKind } from "@/types/writing";

export type WriteTab = { id: string; kind: "prose" | "entity" | "graph"; canvasId?: string; entityId?: string };

const PROSE_TAB: WriteTab = { id: "prose", kind: "prose" };

type WriteUiStore = {
    projectId: string | null;
    selectedOutlineId: string | null;
    outlineQuery: string;
    focusMode: boolean;
    editorCommand: string | null;
    selectedEntityId: string | null;
    selectedEntityKind: WriteEntityKind | null;
    selectedGroupId: string | null;
    selectedWorkIds: string[];
    openTabs: WriteTab[];
    activeTabId: string;
    setProject: (id: string | null) => void;
    selectOutline: (id: string | null) => void;
    setOutlineQuery: (value: string) => void;
    setFocusMode: (value: boolean) => void;
    setEditorCommand: (command: string | null) => void;
    setSelectedEntity: (id: string | null, kind: WriteEntityKind | null) => void;
    openTab: (tab: WriteTab) => void;
    closeTab: (id: string) => void;
    setActiveTab: (id: string) => void;
    setSelectedGroupId: (id: string | null) => void;
    toggleWorkSelected: (id: string, selected: boolean) => void;
    setWorksSelected: (ids: string[]) => void;
    clearWorkSelection: () => void;
    reset: () => void;
};

export const useWriteUiStore = create<WriteUiStore>()((set) => ({
    projectId: null,
    selectedOutlineId: null,
    outlineQuery: "",
    focusMode: false,
    editorCommand: null,
    selectedEntityId: null,
    selectedEntityKind: null,
    selectedGroupId: null,
    selectedWorkIds: [],
    openTabs: [PROSE_TAB],
    activeTabId: "prose",
    setProject: (id) => set({ projectId: id, selectedOutlineId: null, outlineQuery: "", focusMode: false, editorCommand: null, selectedEntityId: null, selectedEntityKind: null, openTabs: [PROSE_TAB], activeTabId: "prose" }),
    selectOutline: (id) => set({ selectedOutlineId: id }),
    setOutlineQuery: (value) => set({ outlineQuery: value }),
    setFocusMode: (value) => set({ focusMode: value }),
    setEditorCommand: (command) => set({ editorCommand: command }),
    setSelectedEntity: (selectedEntityId, selectedEntityKind) => set({ selectedEntityId, selectedEntityKind }),
    openTab: (tab) => set((state) => ({ openTabs: state.openTabs.some((item) => item.id === tab.id) ? state.openTabs : [...state.openTabs, tab], activeTabId: tab.id })),
    closeTab: (id) => set((state) => (id === "prose" ? state : { openTabs: state.openTabs.filter((item) => item.id !== id), activeTabId: state.activeTabId === id ? "prose" : state.activeTabId })),
    setActiveTab: (id) => set({ activeTabId: id }),
    setSelectedGroupId: (selectedGroupId) => set({ selectedGroupId }),
    toggleWorkSelected: (id, selected) => set((state) => ({ selectedWorkIds: selected ? [...new Set([...state.selectedWorkIds, id])] : state.selectedWorkIds.filter((item) => item !== id) })),
    setWorksSelected: (ids) => set({ selectedWorkIds: ids }),
    clearWorkSelection: () => set({ selectedWorkIds: [] }),
    reset: () => set({ selectedOutlineId: null, outlineQuery: "", focusMode: false, editorCommand: null, selectedEntityId: null, selectedEntityKind: null, openTabs: [PROSE_TAB], activeTabId: "prose" }),
}));
