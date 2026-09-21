import { nanoid } from "nanoid";

import { normalizeConnection } from "@/lib/canvas/canvas-node-geometry";
import { getNodeSpec, isRegisteredNodeType } from "@/lib/canvas/node-registry";
import { arrangePsLayers, createPsImageLayer, smartCanvasLayers } from "@/lib/canvas/smart-canvas";
import { CanvasNodeType, type CanvasConnection, type CanvasNodeData, type CanvasNodeMetadata, type CanvasNodeTypeId, type ViewportTransform } from "@/types/canvas";

export type CanvasAgentOp =
    | { type: "add_node"; id?: string; nodeType?: CanvasNodeTypeId; title?: string; position?: { x: number; y: number }; x?: number; y?: number; width?: number; height?: number; metadata?: CanvasNodeMetadata }
    | { type: "update_node"; id: string; patch?: Partial<CanvasNodeData>; metadata?: CanvasNodeMetadata }
    | { type: "delete_node"; id?: string; ids?: string[]; nodeType?: CanvasNodeTypeId }
    | { type: "delete_connections"; id?: string; ids?: string[]; all?: boolean }
    | { type: "connect_nodes"; id?: string; fromNodeId: string; toNodeId: string }
    | { type: "set_viewport"; viewport: ViewportTransform }
    | { type: "select_nodes"; ids: string[] }
    | { type: "run_generation"; nodeId: string; mode?: "text" | "image" | "video" | "audio"; prompt?: string }
    | { type: "arrange_board"; id: string }
    | { type: "place_on_board"; nodeId: string; boardId?: string };

export type CanvasAgentSnapshot = {
    projectId: string;
    title: string;
    nodes: CanvasNodeData[];
    connections: CanvasConnection[];
    selectedNodeIds: string[];
    viewport: ViewportTransform;
};

export function applyCanvasAgentOps(snapshot: CanvasAgentSnapshot, ops?: CanvasAgentOp[]) {
    let nodes = snapshot.nodes;
    let connections = snapshot.connections;
    let selectedNodeIds = snapshot.selectedNodeIds;
    let viewport = snapshot.viewport;

    (Array.isArray(ops) ? ops : []).forEach((op, index) => {
        if (!op?.type) return;
        if (op.type === "add_node") {
            const nodeType = op.nodeType && isRegisteredNodeType(op.nodeType) ? op.nodeType : CanvasNodeType.Text;
            const spec = getNodeSpec(nodeType);
            const node: CanvasNodeData = {
                id: op.id || `${nodeType}-${Date.now()}-${index}`,
                type: nodeType,
                title: op.title || spec.title,
                position: op.position || { x: op.x ?? index * 36, y: op.y ?? index * 36 },
                width: op.width || spec.width,
                height: op.height || spec.height,
                metadata: { ...spec.metadata, ...op.metadata },
            };
            nodes = [...nodes, node];
            selectedNodeIds = [node.id];
        }
        if (op.type === "update_node") {
            if (!op.id) return;
            nodes = nodes.map((node) => {
                if (node.id !== op.id) return node;
                const metadata = { ...node.metadata, ...op.patch?.metadata, ...op.metadata };
                for (const key of Object.keys(op.metadata || {})) {
                    if ((op.metadata as Record<string, unknown>)[key] === null) delete metadata[key as keyof CanvasNodeMetadata];
                }
                return { ...node, ...op.patch, metadata };
            });
        }
        if (op.type === "delete_node") {
            const ids = new Set(op.ids || (op.id ? [op.id] : op.nodeType ? nodes.filter((node) => node.type === op.nodeType).map((node) => node.id) : []));
            nodes = nodes.filter((node) => !ids.has(node.id));
            connections = connections.filter((conn) => !ids.has(conn.fromNodeId) && !ids.has(conn.toNodeId));
            selectedNodeIds = selectedNodeIds.filter((id) => !ids.has(id));
        }
        if (op.type === "delete_connections") {
            const ids = new Set(op.ids || (op.id ? [op.id] : []));
            connections = op.all ? [] : connections.filter((conn) => !ids.has(conn.id));
        }
        if (op.type === "connect_nodes") {
            if (!op.fromNodeId || !op.toNodeId) return;
            const exists = connections.some((conn) => conn.fromNodeId === op.fromNodeId && conn.toNodeId === op.toNodeId);
            const fromNode = nodes.find((node) => node.id === op.fromNodeId);
            const toNode = nodes.find((node) => node.id === op.toNodeId);
            if (!exists && fromNode && toNode && fromNode.type !== CanvasNodeType.ImageGeneration) {
                const connection = normalizeConnection(op.fromNodeId, op.toNodeId, nodes, "source");
                if (connection && connection.fromNodeId === op.fromNodeId && connection.toNodeId === op.toNodeId) connections = [...connections, { id: op.id || nanoid(), ...connection }];
            }
        }
        if (op.type === "set_viewport" && op.viewport) viewport = op.viewport;
        if (op.type === "select_nodes") selectedNodeIds = (op.ids || []).filter((id) => nodes.some((node) => node.id === id));
        if (op.type === "arrange_board") {
            const board = nodes.find((node) => node.id === op.id);
            if (!board || board.type !== CanvasNodeType.SmartCanvas) return;
            const layers = arrangePsLayers(board);
            if (layers === smartCanvasLayers(board)) return;
            nodes = nodes.map((node) => (node.id === board.id ? { ...node, metadata: { ...node.metadata, boardLayers: layers } } : node));
        }
        if (op.type === "place_on_board") {
            const node = nodes.find((item) => item.id === op.nodeId);
            if (!node || (node.type !== CanvasNodeType.Image && node.type !== CanvasNodeType.SmartCanvas)) return;
            const board = op.boardId ? nodes.find((item) => item.id === op.boardId && item.type === CanvasNodeType.SmartCanvas) : undefined;
            if (op.boardId && !board) return;
            nodes = nodes.map((item) => {
                if (item.type !== CanvasNodeType.SmartCanvas) return item;
                const layers = smartCanvasLayers(item);
                if (item.id !== board?.id) {
                    const next = layers.filter((layer) => layer.sourceNodeId !== node.id);
                    return next.length === layers.length ? item : { ...item, metadata: { ...item.metadata, boardLayers: next } };
                }
                if (layers.some((layer) => layer.sourceNodeId === node.id)) return item;
                return { ...item, metadata: { ...item.metadata, boardLayers: [...layers, createPsImageLayer(item, node)] } };
            });
        }
    });

    return { ...snapshot, nodes, connections, selectedNodeIds, viewport };
}
