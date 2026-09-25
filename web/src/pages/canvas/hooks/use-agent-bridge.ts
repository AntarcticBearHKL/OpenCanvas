import { useCallback, useEffect, useMemo, useRef, type Dispatch, type MutableRefObject, type SetStateAction } from "react";

import i18n from "@/i18n";
import { applyAgentOps as applyRegisteredAgentOps, registerAgentNamespace, replayAgentEntry } from "@/lib/agent/action-registry";
import { applyCanvasAgentOps, type CanvasAgentOp } from "@/lib/canvas/canvas-agent-ops";
import type { AgentOp } from "@/lib/agent/agent-ops";
import { useAgentStore } from "@/stores/use-agent-store";
import type { CanvasNodeGenerationMode } from "@/components/canvas/canvas-node-prompt-panel";
import type { CanvasConnection, CanvasNodeData, CanvasWorkspace, ViewportTransform } from "@/types/canvas";

type GenerateNodeRef = MutableRefObject<((nodeId: string, mode: CanvasNodeGenerationMode, prompt: string) => Promise<void>) | null>;

/** Async canvas ops (crop / split / upscale / generation ...) are executed by the page's own handlers, fired fire-and-forget. */
export type CanvasAgentHandlers = Partial<Record<CanvasAgentOp["type"], (op: CanvasAgentOp) => void | Promise<void>>>;

type AgentBridgeParams = {
    projectId: string;
    title: string | undefined;
    workspace: CanvasWorkspace;
    nodes: CanvasNodeData[];
    connections: CanvasConnection[];
    selectedNodeIds: Set<string>;
    viewport: ViewportTransform;
    nodesRef: MutableRefObject<CanvasNodeData[]>;
    connectionsRef: MutableRefObject<CanvasConnection[]>;
    selectedNodeIdsRef: MutableRefObject<Set<string>>;
    viewportRef: MutableRefObject<ViewportTransform>;
    generateNodeRef: GenerateNodeRef;
    agentHandlers?: CanvasAgentHandlers;
    setNodes: Dispatch<SetStateAction<CanvasNodeData[]>>;
    setConnections: Dispatch<SetStateAction<CanvasConnection[]>>;
    setSelectedNodeIds: Dispatch<SetStateAction<Set<string>>>;
    setSelectedConnectionId: Dispatch<SetStateAction<string | null>>;
    setViewport: Dispatch<SetStateAction<ViewportTransform>>;
};

// JSON Schema discriminated union on `type` for the canvas ops; each variant pins `ns` to "canvas".
function canvasOpVariant(type: string, properties: Record<string, unknown>, required: string[] = []) {
    return {
        type: "object",
        properties: { ns: { const: "canvas" }, type: { const: type }, ...properties },
        required: ["ns", "type", ...required],
        additionalProperties: true,
    };
}

const CANVAS_OP_SPECS: { type: string; required?: string[]; properties: Record<string, unknown> }[] = [
    {
        type: "add_node",
        properties: {
            id: { type: "string" },
            nodeType: { type: "string" },
            title: { type: "string" },
            position: { type: "object", properties: { x: { type: "number" }, y: { type: "number" } }, required: ["x", "y"] },
            x: { type: "number" },
            y: { type: "number" },
            width: { type: "number" },
            height: { type: "number" },
            metadata: { type: "object", additionalProperties: true },
        },
    },
    {
        type: "update_node",
        required: ["id"],
        properties: { id: { type: "string" }, patch: { type: "object", additionalProperties: true }, metadata: { type: "object", additionalProperties: true } },
    },
    { type: "delete_node", properties: { id: { type: "string" }, ids: { type: "array", items: { type: "string" } }, nodeType: { type: "string" } } },
    { type: "delete_connections", properties: { id: { type: "string" }, ids: { type: "array", items: { type: "string" } }, all: { type: "boolean" } } },
    {
        type: "connect_nodes",
        required: ["fromNodeId", "toNodeId"],
        properties: { id: { type: "string" }, fromNodeId: { type: "string" }, toNodeId: { type: "string" }, relation: { type: "string" } },
    },
    {
        type: "set_viewport",
        required: ["viewport"],
        properties: { viewport: { type: "object", properties: { x: { type: "number" }, y: { type: "number" }, k: { type: "number" } }, required: ["x", "y", "k"] } },
    },
    { type: "select_nodes", required: ["ids"], properties: { ids: { type: "array", items: { type: "string" } } } },
    {
        type: "run_generation",
        required: ["nodeId"],
        properties: { nodeId: { type: "string" }, mode: { type: "string", enum: ["text", "image", "video", "audio"] }, prompt: { type: "string" } },
    },
    { type: "arrange_board", required: ["id"], properties: { id: { type: "string" }, template: { type: "string", enum: ["grid", "row", "column", "feature"] } } },
    { type: "place_on_board", required: ["nodeId"], properties: { nodeId: { type: "string" }, boardId: { type: "string" } } },
    { type: "duplicate_node", required: ["id"], properties: { id: { type: "string" } } },
    { type: "move_node_layer", required: ["nodeId", "direction"], properties: { nodeId: { type: "string" }, direction: { type: "string", enum: ["up", "down"] } } },
    { type: "toggle_node_flag", required: ["nodeId", "flag"], properties: { nodeId: { type: "string" }, flag: { type: "string", enum: ["locked", "hidden"] } } },
    { type: "rename_nodes", required: ["ids", "title"], properties: { ids: { type: "array", items: { type: "string" } }, title: { type: "string" } } },
    { type: "set_font_size", required: ["nodeId", "fontSize"], properties: { nodeId: { type: "string" }, fontSize: { type: "number" } } },
    { type: "set_free_resize", required: ["nodeId"], properties: { nodeId: { type: "string" }, freeResize: { type: "boolean" } } },
    {
        type: "resize_node",
        required: ["nodeId", "width", "height"],
        properties: { nodeId: { type: "string" }, width: { type: "number" }, height: { type: "number" }, position: { type: "object", properties: { x: { type: "number" }, y: { type: "number" } }, required: ["x", "y"] } },
    },
    { type: "set_node_content", required: ["nodeId", "content"], properties: { nodeId: { type: "string" }, content: { type: "string" } } },
    { type: "set_node_prompt", required: ["nodeId", "prompt"], properties: { nodeId: { type: "string" }, prompt: { type: "string" } } },
    { type: "set_node_title", required: ["nodeId", "title"], properties: { nodeId: { type: "string" }, title: { type: "string" } } },
    { type: "apply_node_metadata", required: ["nodeId", "patch"], properties: { nodeId: { type: "string" }, patch: { type: "object", additionalProperties: true } } },
    { type: "set_batch_primary", required: ["nodeId", "itemId"], properties: { nodeId: { type: "string" }, itemId: { type: "string" } } },
    { type: "duplicate_batch_image", required: ["nodeId", "imageId"], properties: { nodeId: { type: "string" }, imageId: { type: "string" } } },
    { type: "delete_batch_image", required: ["nodeId", "imageId"], properties: { nodeId: { type: "string" }, imageId: { type: "string" } } },
    {
        type: "align_nodes",
        required: ["axis"],
        properties: { ids: { type: "array", items: { type: "string" } }, axis: { type: "string", enum: ["left", "center-x", "right", "top", "center-y", "bottom", "distribute-x", "distribute-y"] } },
    },
    { type: "deselect_all", properties: {} },
    { type: "set_zoom", required: ["scale"], properties: { scale: { type: "number" } } },
    {
        type: "bind_video_slot",
        required: ["nodeId", "slot", "sourceNodeId"],
        properties: { nodeId: { type: "string" }, slot: { type: "string", enum: ["firstFrame", "lastFrame", "reference"] }, sourceNodeId: { type: "string" } },
    },
    {
        type: "clear_video_slot",
        required: ["nodeId", "slot"],
        properties: { nodeId: { type: "string" }, slot: { type: "string", enum: ["firstFrame", "lastFrame", "reference"] }, sourceNodeId: { type: "string" } },
    },
    { type: "switch_video_frame_slot", required: ["nodeId", "slot"], properties: { nodeId: { type: "string" }, slot: { type: "string", enum: ["firstFrame", "lastFrame"] } } },
    { type: "set_video_mode", required: ["nodeId", "mode"], properties: { nodeId: { type: "string" }, mode: { type: "string", enum: ["frames", "reference"] } } },
    { type: "set_asset_source", required: ["nodeId", "source"], properties: { nodeId: { type: "string" }, source: { type: "string", enum: ["folder", "cache"] } } },
    { type: "set_board_ratio", required: ["id", "ratio"], properties: { id: { type: "string" }, ratio: { type: "string" } } },
    { type: "set_board_resolution", required: ["id", "resolution"], properties: { id: { type: "string" }, resolution: { type: "string", enum: ["1k", "2k", "4k"] } } },
    { type: "set_board_background", required: ["id", "background"], properties: { id: { type: "string" }, background: { type: "string" }, opacity: { type: "number" } } },
    { type: "update_board_layers", required: ["id", "layers"], properties: { id: { type: "string" }, layers: { type: "array", items: { type: "object", additionalProperties: true } } } },
    { type: "move_board_layer", required: ["id", "layerId", "direction"], properties: { id: { type: "string" }, layerId: { type: "string" }, direction: { type: "string", enum: ["forward", "backward"] } } },
    {
        type: "crop_image",
        required: ["nodeId", "crop"],
        properties: { nodeId: { type: "string" }, crop: { type: "object", properties: { x: { type: "number" }, y: { type: "number" }, width: { type: "number" }, height: { type: "number" } }, required: ["x", "y", "width", "height"] } },
    },
    {
        type: "split_image",
        required: ["nodeId", "rows", "columns"],
        properties: { nodeId: { type: "string" }, rows: { type: "number" }, columns: { type: "number" }, horizontalLines: { type: "array", items: { type: "number" } }, verticalLines: { type: "array", items: { type: "number" } } },
    },
    {
        type: "upscale_image",
        required: ["nodeId", "kind"],
        properties: { nodeId: { type: "string" }, kind: { type: "string", enum: ["algorithm", "ai"] }, targetLongEdge: { type: "number" }, algorithm: { type: "string", enum: ["nearest", "bilinear", "high"] }, prompt: { type: "string" } },
    },
    { type: "ocr_image", required: ["nodeId"], properties: { nodeId: { type: "string" } } },
    { type: "remove_background", required: ["nodeId"], properties: { nodeId: { type: "string" } } },
    {
        type: "generate_angle",
        required: ["nodeId", "horizontalAngle", "pitchAngle", "cameraDistance", "wideAngle"],
        properties: { nodeId: { type: "string" }, horizontalAngle: { type: "number" }, pitchAngle: { type: "number" }, cameraDistance: { type: "number" }, wideAngle: { type: "boolean" } },
    },
    { type: "generate_image_from_text", required: ["nodeId"], properties: { nodeId: { type: "string" } } },
    { type: "retry_generation", required: ["nodeId"], properties: { nodeId: { type: "string" } } },
    { type: "bake_image_modifier", required: ["nodeId"], properties: { nodeId: { type: "string" } } },
    { type: "capture_video_frame", required: ["nodeId", "position"], properties: { nodeId: { type: "string" }, position: { type: "string", enum: ["first", "last", "current"] } } },
    { type: "compose_board", required: ["id"], properties: { id: { type: "string" } } },
    { type: "save_board_as_node", required: ["id"], properties: { id: { type: "string" } } },
];

const CANVAS_AGENT_OP_TYPES = CANVAS_OP_SPECS.map((spec) => spec.type);
const CANVAS_AGENT_SCHEMA: Record<string, unknown> = {
    type: "object",
    oneOf: CANVAS_OP_SPECS.map((spec) => canvasOpVariant(spec.type, spec.properties, spec.required)),
};

/**
 * Bridge between the canvas and the local MCP service: register the `canvas` action namespace (apply logic,
 * permissions are enforced centrally by the registry) and publish the page snapshot to the Agent store.
 * applyAgentOps stays exported for plugin hosts and replayAgentEntry for the audit UI.
 */
export function useAgentBridge(params: AgentBridgeParams) {
    const { projectId, title, workspace, nodes, connections, selectedNodeIds, viewport, nodesRef, connectionsRef, selectedNodeIdsRef, viewportRef, generateNodeRef, agentHandlers, setNodes, setConnections, setSelectedNodeIds, setSelectedConnectionId, setViewport } =
        params;
    const setPageContext = useAgentStore((state) => state.setPageContext);
    const projectTitle = title || i18n.t("canvas.project.untitled");
    const agentHandlersRef = useRef<CanvasAgentHandlers>({});

    useEffect(() => {
        agentHandlersRef.current = agentHandlers || {};
    }, [agentHandlers]);

    const pageState = useMemo(
        () => ({ projectId, title: projectTitle, nodes, connections, selectedNodeIds: Array.from(selectedNodeIds), viewport, workspace }),
        [connections, nodes, projectId, projectTitle, selectedNodeIds, viewport, workspace],
    );

    const applyCanvasOps = useCallback(
        (ops: CanvasAgentOp[]) => {
            const safeOps = ops.filter((op) => op?.type);
            const before = { projectId, title: projectTitle, nodes: nodesRef.current, connections: connectionsRef.current, selectedNodeIds: Array.from(selectedNodeIdsRef.current), viewport: viewportRef.current };
            const generationOps = safeOps.filter((op): op is Extract<CanvasAgentOp, { type: "run_generation" }> => op.type === "run_generation" && Boolean(op.nodeId));
            const handlerOps = safeOps.filter((op) => agentHandlersRef.current[op.type]);
            const next = applyCanvasAgentOps(
                before,
                safeOps.filter((op) => op.type !== "run_generation"),
            );
            nodesRef.current = next.nodes;
            connectionsRef.current = next.connections;
            selectedNodeIdsRef.current = new Set(next.selectedNodeIds);
            viewportRef.current = next.viewport;
            setNodes(next.nodes);
            setConnections(next.connections);
            setSelectedNodeIds(new Set(next.selectedNodeIds));
            setSelectedConnectionId(null);
            setViewport(next.viewport);
            if (generationOps.length) {
                queueMicrotask(() =>
                    generationOps.forEach((op) => {
                        const target = nodesRef.current.find((node) => node.id === op.nodeId);
                        const prompt = op.prompt?.trim() ? op.prompt : (target?.metadata?.composerContent ?? target?.metadata?.prompt ?? "");
                        void generateNodeRef.current?.(op.nodeId, op.mode || target?.metadata?.generationMode || "image", prompt);
                    }),
                );
            }
            if (handlerOps.length) {
                queueMicrotask(() =>
                    handlerOps.forEach((op) => {
                        void Promise.resolve()
                            .then(() => agentHandlersRef.current[op.type]?.(op))
                            .catch(() => {});
                    }),
                );
            }
            return { ...next, projectId, title: projectTitle, workspace };
        },
        [generateNodeRef, projectId, projectTitle, setConnections, setNodes, setSelectedConnectionId, setSelectedNodeIds, setViewport, workspace],
    );

    useEffect(() => {
        const unregister = registerAgentNamespace({
            ns: "canvas",
            title: i18n.t("agent.namespace.canvas.title"),
            description: i18n.t("agent.namespace.canvas.description"),
            ops: CANVAS_AGENT_OP_TYPES,
            schema: CANVAS_AGENT_SCHEMA,
            applyOps: (ops: AgentOp[]) => applyCanvasOps(ops.map(({ ns, ...op }) => op as CanvasAgentOp)),
        });
        return unregister;
    }, [applyCanvasOps]);

    useEffect(() => {
        setPageContext({ page: "canvas", title: projectTitle, state: pageState });
        return () => setPageContext(null);
    }, [pageState, projectTitle, setPageContext]);

    // Plugin hosts call this with bare CanvasAgentOp[]; wrap them in the canvas namespace so the registry
    // still applies central permissions and audit.
    const applyAgentOps = useCallback((ops?: CanvasAgentOp[]) => {
        const result = applyRegisteredAgentOps((ops || []).map((op) => ({ ns: "canvas", ...op })));
        return result.state ?? null;
    }, []);

    return { applyAgentOps, replayAgentEntry };
}
