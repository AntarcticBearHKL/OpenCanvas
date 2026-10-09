import { create } from "zustand";

import { ASSET_FOLDER_FILE_LIMIT, classifyAssetFolderFile, type AssetFolderFileKind } from "@/lib/canvas/asset-folder";
import { clearDirectoryHandle, loadDirectoryHandle, saveDirectoryHandle } from "@/lib/workspace/directory-handle";

type AssetFolderFile = {
    id: string;
    name: string;
    kind: AssetFolderFileKind;
    file: File;
};

type AssetFolderFolder = {
    id: string;
    name: string;
};

type AssetCollectStatus = "idle" | "saving" | "saved" | "failed";

type AssetFolderBinding = {
    folderName: string;
    path: string[];
    folders: AssetFolderFolder[];
    files: AssetFolderFile[];
    capped: boolean;
    failed: boolean;
    collectStatus: AssetCollectStatus;
};

type AssetFolderStore = {
    supported: boolean;
    folders: Record<string, AssetFolderBinding>;
    bindFolder: (nodeId: string) => Promise<boolean>;
    refresh: (nodeId: string) => Promise<void>;
    restore: (nodeId: string) => Promise<void>;
    clear: (nodeId: string) => Promise<void>;
    enterFolder: (nodeId: string, name: string) => Promise<void>;
    goToDepth: (nodeId: string, depth: number) => Promise<void>;
    requestWriteAccess: (nodeId: string) => Promise<boolean>;
    writeAsset: (nodeId: string, fileName: string, blob: Blob) => Promise<boolean>;
    setCollectStatus: (nodeId: string, collectStatus: AssetCollectStatus) => void;
};

const EMPTY_BINDING: AssetFolderBinding = { folderName: "", path: [], folders: [], files: [], capped: false, failed: false, collectStatus: "idle" };
const directoryHandles = new Map<string, FileSystemDirectoryHandle>();
const folderStacks = new Map<string, FileSystemDirectoryHandle[]>();

function handleKey(nodeId: string) {
    return `asset-folder:${nodeId}`;
}

function currentHandle(nodeId: string) {
    const stack = folderStacks.get(nodeId);
    return stack?.[stack.length - 1] ?? directoryHandles.get(nodeId);
}

function folderStack(nodeId: string) {
    const stack = folderStacks.get(nodeId);
    if (stack) return stack;
    const root = directoryHandles.get(nodeId);
    if (!root) return null;
    const next = [root];
    folderStacks.set(nodeId, next);
    return next;
}

function supportsDirectoryPicker() {
    return typeof window !== "undefined" && typeof window.showDirectoryPicker === "function";
}

async function scanFolder(handle: FileSystemDirectoryHandle) {
    const folders: AssetFolderFolder[] = [];
    const files: AssetFolderFile[] = [];
    let capped = false;
    for await (const entry of handle.values()) {
        if (entry.kind === "directory") {
            folders.push({ id: entry.name, name: entry.name });
            continue;
        }
        const file = await (entry as FileSystemFileHandle).getFile();
        const kind = classifyAssetFolderFile(file);
        if (!kind) continue;
        if (files.length >= ASSET_FOLDER_FILE_LIMIT) {
            capped = true;
            break;
        }
        files.push({ id: `${files.length}-${file.name}`, name: file.name, kind, file });
    }
    folders.sort((a, b) => a.name.localeCompare(b.name));
    files.sort((a, b) => a.name.localeCompare(b.name));
    files.forEach((file, index) => {
        file.id = `${index}-${file.name}`;
    });
    return { folders, files, capped };
}

async function ensureReadPermission(handle: FileSystemDirectoryHandle) {
    if ((await handle.queryPermission({ mode: "read" })) === "granted") return true;
    try {
        return (await handle.requestPermission({ mode: "read" })) === "granted";
    } catch {
        return false;
    }
}

async function ensureWritePermission(handle: FileSystemDirectoryHandle) {
    if ((await handle.queryPermission({ mode: "readwrite" })) === "granted") return true;
    try {
        return (await handle.requestPermission({ mode: "readwrite" })) === "granted";
    } catch {
        return false;
    }
}

export const useAssetFolderStore = create<AssetFolderStore>()((set, get) => {
    const patch = (nodeId: string, value: Partial<AssetFolderBinding>) =>
        set((state) => ({ folders: { ...state.folders, [nodeId]: { ...(state.folders[nodeId] ?? EMPTY_BINDING), ...value } } }));

    return {
        supported: supportsDirectoryPicker(),
        folders: {},
        bindFolder: async (nodeId) => {
            if (!supportsDirectoryPicker()) return false;
            try {
                const handle = await window.showDirectoryPicker?.({ mode: "readwrite" });
                if (!handle) return false;
                directoryHandles.set(nodeId, handle);
                folderStacks.set(nodeId, [handle]);
                await saveDirectoryHandle(handle, handleKey(nodeId));
                patch(nodeId, { folderName: handle.name, path: [], folders: [], files: [], capped: false, failed: false });
                await get().refresh(nodeId);
                return true;
            } catch {
                return false;
            }
        },
        refresh: async (nodeId) => {
            const handle = currentHandle(nodeId);
            if (!handle) return;
            const root = directoryHandles.get(nodeId);
            try {
                const next = await scanFolder(handle);
                patch(nodeId, {
                    folderName: root?.name ?? handle.name,
                    path: (folderStacks.get(nodeId) ?? []).slice(1).map((entry) => entry.name),
                    folders: next.folders,
                    files: next.files,
                    capped: next.capped,
                    failed: false,
                });
            } catch {
                patch(nodeId, { failed: true });
            }
        },
        restore: async (nodeId) => {
            if (!supportsDirectoryPicker() || directoryHandles.has(nodeId)) return;
            try {
                const handle = await loadDirectoryHandle(handleKey(nodeId));
                if (!handle) return;
                directoryHandles.set(nodeId, handle);
                folderStacks.set(nodeId, [handle]);
                patch(nodeId, { folderName: handle.name });
                if (await ensureReadPermission(handle)) await get().refresh(nodeId);
                else patch(nodeId, { failed: true });
            } catch {
                patch(nodeId, { failed: true });
            }
        },
        clear: async (nodeId) => {
            directoryHandles.delete(nodeId);
            folderStacks.delete(nodeId);
            await clearDirectoryHandle(handleKey(nodeId));
            set((state) => {
                const folders = { ...state.folders };
                delete folders[nodeId];
                return { folders };
            });
        },
        enterFolder: async (nodeId, name) => {
            const stack = folderStack(nodeId);
            const current = stack?.[stack.length - 1];
            if (!stack || !current) return;
            try {
                const handle = await current.getDirectoryHandle(name);
                stack.push(handle);
                await get().refresh(nodeId);
            } catch {
                patch(nodeId, { failed: true });
            }
        },
        goToDepth: async (nodeId, depth) => {
            const stack = folderStacks.get(nodeId);
            if (!stack || depth < 0 || depth >= stack.length || depth === stack.length - 1) return;
            folderStacks.set(nodeId, stack.slice(0, depth + 1));
            await get().refresh(nodeId);
        },
        requestWriteAccess: async (nodeId) => {
            const handle = directoryHandles.get(nodeId);
            return handle ? ensureWritePermission(handle) : false;
        },
        writeAsset: async (nodeId, fileName, blob) => {
            const handle = directoryHandles.get(nodeId);
            if (!handle) {
                patch(nodeId, { collectStatus: "failed" });
                return false;
            }
            patch(nodeId, { collectStatus: "saving" });
            try {
                if (!(await ensureWritePermission(handle))) {
                    patch(nodeId, { collectStatus: "failed" });
                    return false;
                }
                const fileHandle = await handle.getFileHandle(fileName, { create: true });
                const writable = await fileHandle.createWritable();
                await writable.write(blob);
                await writable.close();
                patch(nodeId, { collectStatus: "saved" });
                await get().refresh(nodeId);
                return true;
            } catch {
                patch(nodeId, { collectStatus: "failed" });
                return false;
            }
        },
        setCollectStatus: (nodeId, collectStatus) => patch(nodeId, { collectStatus }),
    };
});
