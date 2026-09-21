import type { CanvasAgentOp } from "@/lib/canvas/canvas-agent-ops";

export type AgentPermissionPolicy = Record<CanvasAgentOp["type"], boolean>;

export const AGENT_OP_TYPES: Array<CanvasAgentOp["type"]> = ["add_node", "update_node", "delete_node", "delete_connections", "connect_nodes", "set_viewport", "select_nodes", "run_generation", "arrange_board", "place_on_board"];

export const DEFAULT_AGENT_PERMISSIONS: AgentPermissionPolicy = {
    add_node: true,
    update_node: true,
    delete_node: true,
    delete_connections: true,
    connect_nodes: true,
    set_viewport: true,
    select_nodes: true,
    run_generation: true,
    arrange_board: true,
    place_on_board: true,
};

export function filterPermittedOps(ops: CanvasAgentOp[] | undefined, policy: AgentPermissionPolicy): { permitted: CanvasAgentOp[]; blocked: CanvasAgentOp[] } {
    const permitted: CanvasAgentOp[] = [];
    const blocked: CanvasAgentOp[] = [];
    (Array.isArray(ops) ? ops : []).forEach((op) => {
        if (policy[op.type] === false) blocked.push(op);
        else permitted.push(op);
    });
    return { permitted, blocked };
}

export function describeAgentOp(op: CanvasAgentOp): string {
    if (op.type === "add_node") return `add_node ${op.id || op.nodeType || "node"}`;
    if (op.type === "update_node") return `update_node ${op.id}`;
    if (op.type === "delete_node") return `delete_node ${op.ids?.join(",") || op.id || op.nodeType || "all"}`;
    if (op.type === "delete_connections") return `delete_connections ${op.all ? "all" : op.ids?.join(",") || op.id || "none"}`;
    if (op.type === "connect_nodes") return `connect_nodes ${op.fromNodeId}->${op.toNodeId}`;
    if (op.type === "set_viewport") return `set_viewport ${op.viewport.x},${op.viewport.y},${op.viewport.k}`;
    if (op.type === "select_nodes") return `select_nodes ${op.ids.join(",")}`;
    if (op.type === "run_generation") return `run_generation ${op.nodeId} ${op.mode || "image"}`;
    if (op.type === "arrange_board") return `arrange_board ${op.id}`;
    return `place_on_board ${op.nodeId}${op.boardId ? ` ${op.boardId}` : ""}`;
}

export function mergeAgentPermissions(persisted: Partial<AgentPermissionPolicy> | undefined): AgentPermissionPolicy {
    return { ...DEFAULT_AGENT_PERMISSIONS, ...persisted };
}
