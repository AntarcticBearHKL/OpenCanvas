import { create } from "zustand";

type WriteUiStore = {
    projectId: string | null;
    selectedOutlineId: string | null;
    outlineQuery: string;
    focusMode: boolean;
    editorCommand: string | null;
    selectedGroupId: string | null;
    selectedWorkIds: string[];
    setProject: (id: string | null) => void;
    selectOutline: (id: string | null) => void;
    setOutlineQuery: (value: string) => void;
    setFocusMode: (value: boolean) => void;
    setEditorCommand: (command: string | null) => void;
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
    selectedGroupId: null,
    selectedWorkIds: [],
    setProject: (id) => set({ projectId: id, selectedOutlineId: null, outlineQuery: "", focusMode: false, editorCommand: null }),
    selectOutline: (id) => set({ selectedOutlineId: id }),
    setOutlineQuery: (value) => set({ outlineQuery: value }),
    setFocusMode: (value) => set({ focusMode: value }),
    setEditorCommand: (command) => set({ editorCommand: command }),
    setSelectedGroupId: (selectedGroupId) => set({ selectedGroupId }),
    toggleWorkSelected: (id, selected) => set((state) => ({ selectedWorkIds: selected ? [...new Set([...state.selectedWorkIds, id])] : state.selectedWorkIds.filter((item) => item !== id) })),
    setWorksSelected: (ids) => set({ selectedWorkIds: ids }),
    clearWorkSelection: () => set({ selectedWorkIds: [] }),
    reset: () => set({ selectedOutlineId: null, outlineQuery: "", focusMode: false, editorCommand: null }),
}));
