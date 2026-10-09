import i18n from "@/i18n";
import { resolveNodeContent } from "@/lib/agent/node-content";
import { runHeadlessPixelOps } from "@/lib/canvas/pixel/headless";
import { cleanupUnusedCanvasImages } from "@/services/image-storage";
import { useCanvasStore } from "@/stores/canvas/use-canvas-store";
import { useCanvasUiStore } from "@/stores/canvas/use-canvas-ui-store";
import { usePixelStore } from "@/stores/use-pixel-store";
import { CanvasNodeType } from "@/types/canvas";
import type { CanvasNodeData } from "@/types/canvas";

// Execute site-level Agent tools in the browser, including canvas lists and generation status.
// Their data lives locally in the browser through localforage and Zustand, so this module accesses the relevant stores directly.

const SITE_TOOL_NAMES = [
    "canvas_list_projects",
    "generation_get_status",
    "canvas_get_node_content",
    "canvas_get_image_group",
    "canvas_create_project",
    "canvas_rename_project",
    "canvas_delete_projects",
    "canvas_move_project_to_library",
    "canvas_create_library",
    "canvas_rename_library",
    "canvas_delete_library",
    "canvas_create_pixel_project",
    "canvas_apply_pixel_ops",
    "canvas_list_pixel_projects",
    "canvas_rename_pixel_project",
    "canvas_delete_pixel_projects",
] as const;

type SiteToolName = (typeof SITE_TOOL_NAMES)[number];

export function isSiteTool(name: string): name is SiteToolName {
    return (SITE_TOOL_NAMES as readonly string[]).includes(name);
}

function siteText(key: string, options?: Record<string, unknown>) {
    return i18n.t(`agent.siteTools.${key}`, options);
}

type SiteToolInput = Record<string, unknown>;
type SiteToolContext = { state?: Record<string, unknown> | null };
type GenerationStatus = "idle" | "queued" | "running" | "succeeded" | "failed";
type GenerationStatusItem = { id: string; source: "canvas" | "image" | "video"; status: GenerationStatus; kind?: string; title?: string; prompt?: string; projectId?: string; createdAt?: string; updatedAt?: string; successCount?: number; failCount?: number; error?: string };

export async function runSiteTool(name: SiteToolName, input: SiteToolInput, context: SiteToolContext = {}): Promise<unknown> {
    switch (name) {
        case "canvas_list_projects":
            return listCanvasProjects(input);
        case "generation_get_status":
            return getGenerationStatus(input, context.state);
        case "canvas_get_node_content":
            return getNodeContent(input);
        case "canvas_get_image_group":
            return getImageGroup(input);
        case "canvas_create_project":
            return createProject(input);
        case "canvas_rename_project":
            return renameProject(input);
        case "canvas_delete_projects":
            return deleteProjects(input);
        case "canvas_move_project_to_library":
            return moveProjectToLibrary(input);
        case "canvas_create_library":
            return createLibrary(input);
        case "canvas_rename_library":
            return renameLibrary(input);
        case "canvas_delete_library":
            return deleteLibrary(input);
        case "canvas_create_pixel_project":
            return createPixelProject(input);
        case "canvas_apply_pixel_ops":
            return applyPixelOps(input);
        case "canvas_list_pixel_projects":
            return listPixelProjects(input);
        case "canvas_rename_pixel_project":
            return renamePixelProject(input);
        case "canvas_delete_pixel_projects":
            return deletePixelProjects(input);
        default:
            throw new Error(siteText("unknownTool", { name }));
    }
}

function getGenerationStatus(input: SiteToolInput, state?: Record<string, unknown> | null) {
    const nodeIds = new Set(Array.isArray(input.nodeIds) ? input.nodeIds.filter((id): id is string => typeof id === "string") : []);
    const limit = Math.max(1, Math.min(100, Math.floor(Number(input.limit)) || 20));
    const tasks: GenerationStatusItem[] = [];
    const rawNodes = state?.nodes;
    const nodes = Array.isArray(rawNodes) ? (rawNodes as CanvasNodeData[]) : [];
    const projectId = typeof state?.projectId === "string" ? state.projectId : "";

    nodes.forEach((node) => {
        const status = normalizeCanvasGenerationStatus(node.metadata?.status);
        if (!status || (nodeIds.size && !nodeIds.has(node.id))) return;
        const metadata = node.metadata || {};
        if (!nodeIds.size && status !== "running" && status !== "failed" && !metadata.generationMode && !metadata.generationType && !metadata.model) return;
        tasks.push({ id: node.id, source: "canvas", status, kind: metadata.generationMode || node.type, title: node.title, projectId, error: metadata.errorDetails });
    });

    tasks.sort((a, b) => generationStatusOrder(a.status) - generationStatusOrder(b.status) || (b.updatedAt || "").localeCompare(a.updatedAt || ""));
    const summary: Record<GenerationStatus, number> = { idle: 0, queued: 0, running: 0, succeeded: 0, failed: 0 };
    tasks.forEach((task) => (summary[task.status] += 1));
    return { total: tasks.length, summary, tasks: tasks.slice(0, limit) };
}

function generationStatusOrder(status: GenerationStatus) {
    return status === "running" ? 0 : status === "queued" ? 1 : 2;
}

function normalizeCanvasGenerationStatus(status: unknown): GenerationStatus | null {
    if (status === "idle") return "idle";
    if (status === "loading") return "running";
    if (status === "success") return "succeeded";
    if (status === "error") return "failed";
    return null;
}

async function getNodeContent(input: SiteToolInput) {
    const projectId = String(input.projectId || "");
    const nodeId = String(input.nodeId || "");
    if (!projectId) throw new Error(siteText("projectIdRequired"));
    if (!nodeId) throw new Error(siteText("nodeIdRequired"));
    const itemId = typeof input.itemId === "string" && input.itemId ? input.itemId : undefined;
    const maxBytes = Number.isFinite(Number(input.maxBytes)) && Number(input.maxBytes) > 0 ? Number(input.maxBytes) : undefined;
    const result = await resolveNodeContent(projectId, nodeId, itemId, maxBytes);
    if (!result.ok) throw new Error(result.error);
    return result;
}

function getImageGroup(input: SiteToolInput) {
    const projectId = String(input.projectId || "");
    const nodeId = String(input.nodeId || "");
    if (!projectId) throw new Error(siteText("projectIdRequired"));
    if (!nodeId) throw new Error(siteText("nodeIdRequired"));
    const project = useCanvasStore.getState().projects.find((entry) => entry.id === projectId);
    if (!project) throw new Error(siteText("canvasNotFound"));
    const node = project.nodes.find((entry) => entry.id === nodeId);
    if (!node) throw new Error(siteText("nodeNotFound"));
    const images = node.metadata?.images || [];
    if (node.type !== CanvasNodeType.ImageStack && !images.length) throw new Error(siteText("notImageGroup"));
    const primaryImageId = node.metadata?.primaryImageId || images[0]?.id;
    return {
        ok: true,
        nodeId,
        title: node.title,
        count: images.length,
        primaryImageId,
        images: images.map((image) => ({ id: image.id, status: image.status, primary: image.id === primaryImageId, naturalWidth: image.naturalWidth, naturalHeight: image.naturalHeight, bytes: image.bytes, mimeType: image.mimeType, hasContent: Boolean(image.content) })),
    };
}

function listCanvasProjects(input: SiteToolInput) {
    const { projects, hydrated } = useCanvasStore.getState();
    if (!hydrated) throw new Error(siteText("canvasLoading"));
    const keyword = String(input.keyword || "").trim().toLowerCase();
    const filtered = keyword ? projects.filter((project) => project.title.toLowerCase().includes(keyword)) : projects;
    const { page, pageSize, start, end } = paginate(input, filtered.length, 20);
    const items = filtered.slice(start, end).map((project) => ({
        id: project.id,
        title: project.title,
        createdAt: project.createdAt,
        updatedAt: project.updatedAt,
        nodeCount: project.nodes.length,
        connectionCount: project.connections.length,
    }));
    return { total: filtered.length, page, pageSize, items, hint: siteText("canvasHint") };
}

function requireHydrated() {
    const store = useCanvasStore.getState();
    if (!store.hydrated) throw new Error(siteText("canvasLoading"));
    return store;
}

function createProject(input: SiteToolInput) {
    const store = requireHydrated();
    const title = typeof input.title === "string" && input.title.trim() ? input.title.trim() : undefined;
    const libraryId = typeof input.libraryId === "string" && input.libraryId ? input.libraryId : null;
    return { ok: true, id: store.createProject(title, libraryId) };
}

function renameProject(input: SiteToolInput) {
    const store = requireHydrated();
    const id = String(input.id || "");
    if (!id) throw new Error(siteText("projectIdRequired"));
    store.renameProject(id, String(input.title || ""));
    return { ok: true, id };
}

function deleteProjects(input: SiteToolInput) {
    const store = requireHydrated();
    const ids = Array.isArray(input.ids) ? input.ids.filter((value): value is string => typeof value === "string") : [];
    if (!ids.length) throw new Error(siteText("projectIdRequired"));
    store.deleteProjects(ids);
    cleanupUnusedCanvasImages();
    useCanvasUiStore.getState().removeSelectedProjectIds(ids);
    return { ok: true, deleted: ids };
}

function moveProjectToLibrary(input: SiteToolInput) {
    const store = requireHydrated();
    const id = String(input.id || "");
    if (!id) throw new Error(siteText("projectIdRequired"));
    const libraryId = typeof input.libraryId === "string" && input.libraryId ? input.libraryId : null;
    store.setProjectGroup(id, libraryId);
    return { ok: true, id, libraryId };
}

function createLibrary(input: SiteToolInput) {
    const store = requireHydrated();
    const name = typeof input.name === "string" && input.name.trim() ? input.name.trim() : undefined;
    return { ok: true, id: store.createGroup(name) };
}

function renameLibrary(input: SiteToolInput) {
    const store = requireHydrated();
    const id = String(input.id || "");
    if (!id) throw new Error(siteText("libraryIdRequired"));
    store.renameGroup(id, String(input.name || ""));
    return { ok: true, id };
}

function deleteLibrary(input: SiteToolInput) {
    const store = requireHydrated();
    const id = String(input.id || "");
    if (!id) throw new Error(siteText("libraryIdRequired"));
    store.deleteGroup(id);
    cleanupUnusedCanvasImages();
    return { ok: true, deleted: id };
}

async function createPixelProject(input: SiteToolInput) {
    const palette = Array.isArray(input.palette) ? input.palette.filter((color): color is string => typeof color === "string") : undefined;
    const result = await runHeadlessPixelOps(undefined, [{ type: "doc.create", width: Number(input.width) || 64, height: Number(input.height) || 64, ...(palette ? { palette } : {}) }]);
    if (typeof input.title === "string" && input.title.trim()) usePixelStore.getState().renameProject(result.projectId, input.title.trim());
    return { ok: true, id: result.projectId };
}

async function applyPixelOps(input: SiteToolInput) {
    const ops = Array.isArray(input.ops) ? (input.ops.filter((op): op is Record<string, unknown> => Boolean(op) && typeof op === "object")) : [];
    if (!ops.length) throw new Error(siteText("pixelOpsRequired"));
    const result = await runHeadlessPixelOps(typeof input.projectId === "string" && input.projectId ? input.projectId : undefined, ops);
    return { ok: true, projectId: result.projectId, applied: result.applied };
}

function listPixelProjects(input: SiteToolInput) {
    const { projects, hydrated } = usePixelStore.getState();
    if (!hydrated) throw new Error(siteText("canvasLoading"));
    const keyword = String(input.keyword || "").trim().toLowerCase();
    const filtered = keyword ? projects.filter((project) => project.title.toLowerCase().includes(keyword)) : projects;
    return {
        total: filtered.length,
        items: filtered.map((project) => ({ id: project.id, title: project.title, createdAt: project.createdAt, updatedAt: project.updatedAt, groupId: project.groupId, width: project.doc.width, height: project.doc.height, frames: project.doc.frames.length, layers: project.doc.layers.length })),
    };
}

function renamePixelProject(input: SiteToolInput) {
    const store = usePixelStore.getState();
    if (!store.hydrated) throw new Error(siteText("canvasLoading"));
    const id = String(input.id || "");
    if (!id) throw new Error(siteText("projectIdRequired"));
    store.renameProject(id, String(input.title || ""));
    return { ok: true, id };
}

function deletePixelProjects(input: SiteToolInput) {
    const store = usePixelStore.getState();
    if (!store.hydrated) throw new Error(siteText("canvasLoading"));
    const ids = Array.isArray(input.ids) ? input.ids.filter((value): value is string => typeof value === "string") : [];
    if (!ids.length) throw new Error(siteText("projectIdRequired"));
    store.deleteProjects(ids);
    cleanupUnusedCanvasImages();
    return { ok: true, deleted: ids };
}

function paginate(input: SiteToolInput, total: number, defaultSize: number) {
    const pageSize = Math.max(1, Math.min(100, Math.floor(Number(input.pageSize)) || defaultSize));
    const maxPage = Math.max(1, Math.ceil(total / pageSize));
    const page = Math.min(maxPage, Math.max(1, Math.floor(Number(input.page)) || 1));
    const start = (page - 1) * pageSize;
    return { page, pageSize, start, end: start + pageSize };
}
