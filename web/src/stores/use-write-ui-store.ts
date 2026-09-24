import { create } from "zustand";

import type { CodexKind } from "@/types/writing";

type WriteUiStore = {
    projectId: string | null;
    selectedOutlineId: string | null;
    collapsedIds: string[];
    outlineQuery: string;
    codexKind: CodexKind | "all";
    selectedCodexId: string | null;
    focusMode: boolean;
    editorCommand: string | null;
    selectedGroupId: string | null;
    selectedWorkIds: string[];
    setProject: (id: string | null) => void;
    selectOutline: (id: string | null) => void;
    toggleCollapsed: (id: string) => void;
    setOutlineQuery: (value: string) => void;
    setCodexKind: (kind: CodexKind | "all") => void;
    selectCodex: (id: string | null) => void;
    setFocusMode: (value: boolean) => void;
    setEditorCommand: (command: string | null) => void;
    setCollapsed: (ids: string[]) => void;
    setSelectedGroupId: (id: string | null) => void;
    toggleWorkSelected: (id: string, selected: boolean) => void;
    setWorksSelected: (ids: string[]) => void;
    clearWorkSelection: () => void;
    reset: () => void;
};

export const useWriteUiStore = create<WriteUiStore>()((set) => ({
    projectId: null,
    selectedOutlineId: null,
    collapsedIds: [],
    outlineQuery: "",
    codexKind: "all",
    selectedCodexId: null,
    focusMode: false,
    editorCommand: null,
    selectedGroupId: null,
    selectedWorkIds: [],
    setProject: (id) => set({ projectId: id, selectedOutlineId: null, selectedCodexId: null, outlineQuery: "", collapsedIds: [], focusMode: false, editorCommand: null }),
    selectOutline: (id) => set({ selectedOutlineId: id }),
    toggleCollapsed: (id) => set((state) => ({ collapsedIds: state.collapsedIds.includes(id) ? state.collapsedIds.filter((item) => item !== id) : [...state.collapsedIds, id] })),
    setOutlineQuery: (value) => set({ outlineQuery: value }),
    setCodexKind: (kind) => set({ codexKind: kind }),
    selectCodex: (id) => set({ selectedCodexId: id }),
    setFocusMode: (value) => set({ focusMode: value }),
    setEditorCommand: (command) => set({ editorCommand: command }),
    setCollapsed: (ids) => set({ collapsedIds: ids }),
    setSelectedGroupId: (selectedGroupId) => set({ selectedGroupId }),
    toggleWorkSelected: (id, selected) => set((state) => ({ selectedWorkIds: selected ? [...new Set([...state.selectedWorkIds, id])] : state.selectedWorkIds.filter((item) => item !== id) })),
    setWorksSelected: (ids) => set({ selectedWorkIds: ids }),
    clearWorkSelection: () => set({ selectedWorkIds: [] }),
    reset: () => set({ selectedOutlineId: null, collapsedIds: [], outlineQuery: "", codexKind: "all", selectedCodexId: null, focusMode: false, editorCommand: null }),
}));
