import type { AgentOp } from "@/lib/agent/agent-ops";
import { applyCanvasAgentOps, type CanvasAgentOp } from "@/lib/canvas/canvas-agent-ops";
import type { CanvasNodeData } from "@/types/canvas";
import { useCanvasStore } from "@/stores/canvas/use-canvas-store";

// Route-independent canvas execution: the open canvas page registers a live executor keyed by
// projectId; everything else is applied headless to the Zustand store so MCP calls no longer
// depend on which project the frontend has focused.
export type CanvasAgentExecutor = (ops: CanvasAgentOp[]) => unknown;

const executors = new Map<string, CanvasAgentExecutor>();
let openProjectId: string | null = null;

// Ops that need the target canvas open in a live workspace (async handlers / IO / generation).
// Headless batches cannot run them and must report an error instead of silently doing nothing.
export const RUNTIME_CANVAS_OPS = new Set<string>([
    "crop_image",
    "split_image",
    "upscale_image",
    "ocr_image",
    "remove_background",
    "generate_angle",
    "generate_image_from_text",
    "retry_generation",
    "capture_video_frame",
    "transcribe_midi",
    "import_midi_to_audio",
    "run_generation",
]);

export function registerOpenCanvasExecutor(projectId: string, executor: CanvasAgentExecutor) {
    executors.set(projectId, executor);
    openProjectId = projectId;
    return () => {
        if (executors.get(projectId) !== executor) return;
        executors.delete(projectId);
        if (openProjectId === projectId) openProjectId = null;
    };
}

function bareOps(ops: AgentOp[]): CanvasAgentOp[] {
    return ops.map(({ ns, projectId, ...op }) => op as CanvasAgentOp);
}

function opProjectId(op: AgentOp): string {
    return typeof op.projectId === "string" ? op.projectId : "";
}

function nextCanvasX(nodes: CanvasNodeData[]) {
    if (!nodes.length) return 0;
    return Math.max(...nodes.map((node) => node.position.x + node.width)) + 80;
}

/**
 * Fill in geometry the server-side compiler used to derive from the page snapshot, using the
 * target project's own nodes: default positions for `add_node` ops without coordinates.
 * `move_node` deltas are resolved by the reducer itself. Only canvas geometry fields are touched.
 */
export function resolveCanvasGeometry(project: { nodes: CanvasNodeData[] }, ops: CanvasAgentOp[]): CanvasAgentOp[] {
    let nodes = project.nodes;
    return ops.map((op) => {
        if (op.type === "add_node" && !op.position && op.x === undefined && op.y === undefined) {
            const resolved = { ...op, position: { x: nextCanvasX(nodes), y: 0 } };
            if (op.nodeType) nodes = [...nodes, { id: op.id || "", type: op.nodeType, title: "", position: resolved.position, width: op.width || 0, height: op.height || 0, metadata: {} } as CanvasNodeData];
            return resolved;
        }
        return op;
    });
}

/**
 * Apply a canvas op batch to one project. When the project is the open route in this tab the
 * live page executor runs (UI + async handlers preserved); otherwise the pure reducer runs over
 * the stored project and only nodes/connections are written back.
 */
export function runCanvasAgentOps(projectId: string | null | undefined, ops: AgentOp[]): Record<string, unknown> {
    let resolved = projectId || "";
    for (const op of ops) {
        const current = opProjectId(op);
        if (!current) continue;
        if (resolved && current !== resolved) throw new Error("同一批操作只能针对一个画布");
        resolved = current;
    }
    const targetProjectId = resolved || openProjectId || "";
    const store = useCanvasStore.getState();
    const project = targetProjectId ? store.projects.find((item) => item.id === targetProjectId) : undefined;
    const cleanOps = resolveCanvasGeometry({ nodes: project?.nodes || [] }, bareOps(ops));
    const executor = targetProjectId ? executors.get(targetProjectId) : undefined;
    if (executor) {
        const result = executor(cleanOps);
        return (result && typeof result === "object" ? result : { ok: true }) as Record<string, unknown>;
    }
    if (!targetProjectId) throw new Error("该画布不在任何已连接网页中");
    if (!store.hydrated) throw new Error("画布数据尚未加载");
    if (!project) throw new Error("该画布不存在");
    const snapshot = { projectId: targetProjectId, title: project.title, nodes: project.nodes, connections: project.connections, selectedNodeIds: [], viewport: project.viewport };
    const runtimeOps = cleanOps.filter((op) => RUNTIME_CANVAS_OPS.has(op.type));
    if (runtimeOps.length) {
        const dataOps = cleanOps.filter((op) => !RUNTIME_CANVAS_OPS.has(op.type));
        const next = applyCanvasAgentOps(snapshot, dataOps);
        store.updateProject(targetProjectId, { nodes: next.nodes, connections: next.connections });
        const errors = cleanOps.flatMap((op, index) => (RUNTIME_CANVAS_OPS.has(op.type) ? [{ index, error: `该操作需要打开画布 ${targetProjectId}` }] : []));
        return { applied: dataOps.length, blocked: 0, errors };
    }
    const next = applyCanvasAgentOps(snapshot, cleanOps);
    store.updateProject(targetProjectId, { nodes: next.nodes, connections: next.connections });
    return { ...next, projectId: targetProjectId, title: project.title, workspace: "canvas" };
}
