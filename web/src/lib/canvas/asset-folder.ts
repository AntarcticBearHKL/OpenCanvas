export const ASSET_FOLDER_FILE_LIMIT = 200;
export const ASSET_FOLDER_DRAG_MIME = "application/x-open-canvas-folder-file";
export const STUDIO_ASSET_DRAG_MIME = "application/x-open-canvas-studio-asset";

export type AssetFolderFileKind = "image" | "video" | "audio" | "text";

const TEXT_EXTENSIONS = [".txt", ".md", ".markdown", ".json", ".csv", ".log", ".yaml", ".yml"];

export function classifyAssetFolderFile(file: { type: string; name: string }): AssetFolderFileKind | null {
    if (file.type.startsWith("image/")) return "image";
    if (file.type.startsWith("video/")) return "video";
    if (file.type.startsWith("audio/")) return "audio";
    if (file.type.startsWith("text/")) return "text";
    const name = file.name.toLowerCase();
    return TEXT_EXTENSIONS.some((extension) => name.endsWith(extension)) ? "text" : null;
}
