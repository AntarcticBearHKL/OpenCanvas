import { nanoid } from "nanoid";

import { alignNodes, type AlignAxis } from "@/lib/canvas/alignment";
import type { ImageUpscaleAlgorithm } from "@/lib/canvas/canvas-image-data";
import { NODE_STATUS_SUCCESS } from "@/lib/canvas/canvas-node-constants";
import { bulkRenameTitles, normalizeConnection } from "@/lib/canvas/canvas-node-geometry";
import { fitNodeSize } from "@/lib/canvas/canvas-node-size";
import type { VideoFramePosition } from "@/lib/canvas/canvas-video-frame";
import { bindVideoSlot } from "@/lib/canvas/canvas-video-slots";
import { getNodeSpec, isRegisteredNodeType } from "@/lib/canvas/node-registry";
import { CanvasNodeType, type CanvasConnection, type CanvasNodeData, type CanvasNodeImage, type CanvasNodeMetadata, type CanvasNodeTypeId, type CanvasVideoSlot, type CanvasVideoSlots, type ViewportTransform } from "@/types/canvas";

const PROMPT_NODE_TYPES: CanvasNodeTypeId[] = [CanvasNodeType.Prompt, CanvasNodeType.MusicPrompt, CanvasNodeType.SpeechPrompt, CanvasNodeType.VideoPrompt];
const GENERATOR_NODE_TYPES: CanvasNodeTypeId[] = [CanvasNodeType.ImageGeneration, CanvasNodeType.SpeechGeneration, CanvasNodeType.MusicGeneration, CanvasNodeType.VideoGeneration];

function isPromptNode(type: CanvasNodeTypeId) {
    return PROMPT_NODE_TYPES.includes(type);
}

export function isGeneratorNode(type: CanvasNodeTypeId) {
    return GENERATOR_NODE_TYPES.includes(type);
}

export type CanvasAgentOp =
    | { type: "add_node"; id?: string; nodeType?: CanvasNodeTypeId; title?: string; position?: { x: number; y: number }; x?: number; y?: number; width?: number; height?: number; metadata?: CanvasNodeMetadata }
    | { type: "update_node"; id: string; patch?: Partial<CanvasNodeData>; metadata?: CanvasNodeMetadata }
    | { type: "move_node"; id: string; dx?: number; dy?: number }
    | { type: "delete_node"; id?: string; ids?: string[]; nodeType?: CanvasNodeTypeId }
    | { type: "delete_connections"; id?: string; ids?: string[]; all?: boolean }
    | { type: "connect_nodes"; id?: string; fromNodeId: string; toNodeId: string; relation?: string }
    | { type: "set_viewport"; viewport: ViewportTransform }
    | { type: "select_nodes"; ids: string[] }
    | { type: "run_generation"; nodeId: string; mode?: "text" | "image" | "video" | "audio"; prompt?: string }
    | { type: "duplicate_node"; id: string }
    | { type: "move_node_layer"; nodeId: string; direction: "up" | "down" }
    | { type: "toggle_node_flag"; nodeId: string; flag: "locked" | "hidden" }
    | { type: "rename_nodes"; ids: string[]; title: string }
    | { type: "set_font_size"; nodeId: string; fontSize: number }
    | { type: "set_free_resize"; nodeId: string; freeResize?: boolean }
    | { type: "resize_node"; nodeId: string; width: number; height: number; position?: { x: number; y: number } }
    | { type: "set_node_content"; nodeId: string; content: string }
    | { type: "set_node_prompt"; nodeId: string; prompt: string }
    | { type: "set_node_title"; nodeId: string; title: string }
    | { type: "apply_node_metadata"; nodeId: string; patch?: Partial<CanvasNodeMetadata> }
    | { type: "set_batch_primary"; nodeId: string; itemId: string }
    | { type: "duplicate_batch_image"; nodeId: string; imageId: string }
    | { type: "delete_batch_image"; nodeId: string; imageId: string }
    | { type: "align_nodes"; ids?: string[]; axis: AlignAxis }
    | { type: "deselect_all" }
    | { type: "set_zoom"; scale: number }
    | { type: "bind_video_slot"; nodeId: string; slot: CanvasVideoSlot; sourceNodeId: string }
    | { type: "clear_video_slot"; nodeId: string; slot: CanvasVideoSlot; sourceNodeId?: string }
    | { type: "switch_video_frame_slot"; nodeId: string; slot: "firstFrame" | "lastFrame" }
    | { type: "set_video_mode"; nodeId: string; mode: "frames" | "reference" }
    | { type: "set_asset_source"; nodeId: string; source: "folder" | "cache" | "studio" }
    | { type: "crop_image"; nodeId: string; crop: { x: number; y: number; width: number; height: number } }
    | { type: "split_image"; nodeId: string; rows: number; columns: number; horizontalLines?: number[]; verticalLines?: number[] }
    | { type: "upscale_image"; nodeId: string; kind: "algorithm" | "ai"; targetLongEdge?: number; algorithm?: ImageUpscaleAlgorithm; prompt?: string }
    | { type: "ocr_image"; nodeId: string }
    | { type: "remove_background"; nodeId: string }
    | { type: "generate_angle"; nodeId: string; horizontalAngle: number; pitchAngle: number; cameraDistance: number; wideAngle: boolean }
    | { type: "generate_image_from_text"; nodeId: string }
    | { type: "retry_generation"; nodeId: string }
    | { type: "capture_video_frame"; nodeId: string; position: VideoFramePosition }
    | { type: "transcribe_midi"; nodeId: string; highQuality?: boolean }
    | { type: "import_midi_to_audio"; nodeId: string; title?: string; preset?: string }
    | { type: "pack_images_into_group"; nodeIds: string[]; id?: string; title?: string; position?: { x: number; y: number }; removeSources?: boolean }
    | { type: "unpack_image_group"; nodeId: string; gap?: number; columns?: number; keepGroup?: boolean };

export type CanvasAgentSnapshot = {
    projectId: string;
    title: string;
    nodes: CanvasNodeData[];
    connections: CanvasConnection[];
    selectedNodeIds: string[];
    viewport: ViewportTransform;
};

function nextCanvasX(nodes: CanvasNodeData[]) {
    if (!nodes.length) return 0;
    return Math.max(...nodes.map((node) => node.position.x + node.width)) + 80;
}

export function applyCanvasAgentOps(snapshot: CanvasAgentSnapshot, ops?: CanvasAgentOp[]) {
    let nodes = snapshot.nodes;
    let connections = snapshot.connections;
    let selectedNodeIds = snapshot.selectedNodeIds;
    let viewport = snapshot.viewport;

    (Array.isArray(ops) ? ops : []).forEach((op, index) => {
        if (!op?.type) return;
        if (op.type === "add_node") {
            if (!op.nodeType || !isRegisteredNodeType(op.nodeType)) return;
            const nodeType = op.nodeType;
            const spec = getNodeSpec(nodeType);
            const node: CanvasNodeData = {
                id: op.id || `${nodeType}-${Date.now()}-${index}`,
                type: nodeType,
                title: op.title || spec.title,
                position: op.position || { x: op.x ?? nextCanvasX(nodes), y: op.y ?? 0 },
                width: op.width || spec.width,
                height: op.height || spec.height,
                metadata: { ...spec.metadata, ...op.metadata },
            };
            nodes = [...nodes, node];
            selectedNodeIds = [node.id];
        }
        if (op.type === "move_node") {
            nodes = nodes.map((node) => (node.id === op.id ? { ...node, position: { x: node.position.x + (op.dx ?? 0), y: node.position.y + (op.dy ?? 0) } } : node));
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
                if (connection && connection.fromNodeId === op.fromNodeId && connection.toNodeId === op.toNodeId) connections = [...connections, { id: op.id || nanoid(), ...connection, ...(op.relation ? { relation: op.relation } : {}) }];
            }
        }
        if (op.type === "set_viewport" && op.viewport) viewport = op.viewport;
        if (op.type === "select_nodes") selectedNodeIds = (op.ids || []).filter((id) => nodes.some((node) => node.id === id));
        if (op.type === "duplicate_node") {
            const source = nodes.find((node) => node.id === op.id);
            if (!source) return;
            const id = `${source.type}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
            nodes = [...nodes, { ...source, id, title: `${source.title} Copy`, position: { x: source.position.x + 36, y: source.position.y + 36 } }];
            selectedNodeIds = [id];
        }
        if (op.type === "move_node_layer") {
            const index = nodes.findIndex((node) => node.id === op.nodeId);
            if (index < 0) return;
            const target = index + (op.direction === "up" ? 1 : -1);
            if (target < 0 || target >= nodes.length) return;
            const next = [...nodes];
            const [node] = next.splice(index, 1);
            next.splice(target, 0, node);
            nodes = next;
        }
        if (op.type === "toggle_node_flag") {
            nodes = nodes.map((node) => (node.id === op.nodeId ? { ...node, metadata: { ...node.metadata, [op.flag]: !node.metadata?.[op.flag] } } : node));
        }
        if (op.type === "rename_nodes") {
            const titles = bulkRenameTitles(op.ids || [], op.title);
            if (titles.size) {
                nodes = nodes.map((node) => {
                    const title = titles.get(node.id);
                    return title ? { ...node, title } : node;
                });
            }
        }
        if (op.type === "set_font_size") {
            nodes = nodes.map((node) => (node.id === op.nodeId ? { ...node, metadata: { ...node.metadata, fontSize: op.fontSize } } : node));
        }
        if (op.type === "set_free_resize") {
            nodes = nodes.map((node) => {
                if (node.id !== op.nodeId) return node;
                const freeResize = op.freeResize ?? !node.metadata?.freeResize;
                if (freeResize || node.type !== CanvasNodeType.Image) return { ...node, metadata: { ...node.metadata, freeResize } };
                const ratio = (node.metadata?.naturalWidth || node.width) / (node.metadata?.naturalHeight || node.height || 1);
                const height = node.width / ratio;
                return { ...node, height, position: { x: node.position.x, y: node.position.y + node.height / 2 - height / 2 }, metadata: { ...node.metadata, freeResize } };
            });
        }
        if (op.type === "resize_node") {
            nodes = nodes.map((node) => (node.id === op.nodeId ? { ...node, width: op.width, height: op.height, position: op.position || node.position } : node));
        }
        if (op.type === "set_node_content") {
            nodes = nodes.map((node) => {
                if (node.id !== op.nodeId) return node;
                if (isPromptNode(node.type)) {
                    return { ...node, metadata: { ...node.metadata, prompt: op.content } };
                }
                if (isGeneratorNode(node.type)) return node;
                return { ...node, metadata: { ...node.metadata, content: op.content, texts: node.metadata?.texts?.map((text) => (text.id === node.metadata?.primaryTextId ? { ...text, content: op.content } : text)) } };
            });
        }
        if (op.type === "set_node_prompt") {
            nodes = nodes.map((node) => (node.id === op.nodeId && isPromptNode(node.type) ? { ...node, metadata: { ...node.metadata, prompt: op.prompt } } : node));
        }
        if (op.type === "set_node_title") {
            nodes = nodes.map((node) => (node.id === op.nodeId ? { ...node, title: op.title } : node));
        }
        if (op.type === "apply_node_metadata") {
            const patch = (op.patch || {}) as Record<string, unknown>;
            nodes = nodes.map((node) => {
                if (node.id !== op.nodeId) return node;
                const metadata = { ...node.metadata, ...op.patch };
                for (const key of Object.keys(patch)) {
                    if (patch[key] === null) delete metadata[key as keyof CanvasNodeMetadata];
                }
                return { ...node, metadata };
            });
        }
        if (op.type === "set_batch_primary") {
            nodes = nodes.map((node) => {
                if (node.id !== op.nodeId) return node;
                if (node.type === CanvasNodeType.Text) {
                    const text = node.metadata?.texts?.find((item) => item.id === op.itemId);
                    return text?.content ? { ...node, metadata: { ...node.metadata, content: text.content, primaryTextId: text.id } } : node;
                }
                if (node.type === CanvasNodeType.ImageStack) return { ...node, metadata: { ...node.metadata, primaryImageId: op.itemId } };
                return node;
            });
        }
        if (op.type === "duplicate_batch_image") {
            const source = nodes.find((node) => node.id === op.nodeId);
            const image = source?.metadata?.images?.find((item) => item.id === op.imageId);
            if (!source || !image?.content) return;
            const id = nanoid();
            const edge = Math.max(source.width, source.height);
            const size = fitNodeSize(image.naturalWidth, image.naturalHeight, edge, edge);
            nodes = [
                ...nodes,
                {
                    id,
                    type: CanvasNodeType.Image,
                    title: source.title,
                    position: { x: source.position.x + source.width * 2 + 96, y: source.position.y + source.height / 2 - size.height / 2 },
                    ...size,
                    metadata: {
                        content: image.content,
                        storageKey: image.storageKey,
                        thumbnail: image.thumbnail,
                        thumbnailKey: image.thumbnailKey,
                        naturalWidth: image.naturalWidth,
                        naturalHeight: image.naturalHeight,
                        bytes: image.bytes,
                        mimeType: image.mimeType,
                        status: NODE_STATUS_SUCCESS,
                        prompt: source.metadata?.prompt,
                        generationType: source.metadata?.generationType,
                        model: source.metadata?.model,
                        size: source.metadata?.size,
                        quality: source.metadata?.quality,
                        background: source.metadata?.background,
                        references: source.metadata?.references,
                    },
                },
            ];
            selectedNodeIds = [id];
        }
        if (op.type === "delete_batch_image") {
            nodes = nodes.map((node) => {
                if (node.id !== op.nodeId) return node;
                const images = node.metadata?.images?.filter((image) => image.id !== op.imageId) || [];
                return { ...node, metadata: { ...node.metadata, images, count: images.length, primaryImageId: node.metadata?.primaryImageId === op.imageId ? images[0]?.id : node.metadata?.primaryImageId } };
            });
        }
        if (op.type === "align_nodes") {
            const positions = alignNodes(nodes, new Set(op.ids?.length ? op.ids : selectedNodeIds), op.axis);
            if (positions.size) {
                nodes = nodes.map((node) => {
                    const position = positions.get(node.id);
                    return position ? { ...node, position } : node;
                });
            }
        }
        if (op.type === "deselect_all") selectedNodeIds = [];
        if (op.type === "set_zoom") viewport = { ...viewport, k: Math.min(Math.max(op.scale, 0.05), 5) };
        if (op.type === "bind_video_slot") {
            const slots = bindVideoSlot(op.nodeId, op.slot, op.sourceNodeId, nodes, connections);
            if (slots) nodes = nodes.map((node) => (node.id === op.nodeId ? { ...node, metadata: { ...node.metadata, videoSlots: slots } } : node));
        }
        if (op.type === "clear_video_slot") {
            nodes = nodes.map((node) => {
                if (node.id !== op.nodeId || node.type !== CanvasNodeType.VideoPrompt) return node;
                const slots = node.metadata?.videoSlots || {};
                const next: CanvasVideoSlots = op.slot === "reference" ? { ...slots, references: op.sourceNodeId ? (slots.references || []).filter((id) => id !== op.sourceNodeId) : [] } : op.slot === "firstFrame" ? { ...slots, firstFrame: undefined } : { ...slots, lastFrame: undefined };
                return { ...node, metadata: { ...node.metadata, videoSlots: next } };
            });
        }
        if (op.type === "switch_video_frame_slot") {
            nodes = nodes.map((node) => {
                if (node.id !== op.nodeId || node.type !== CanvasNodeType.VideoPrompt) return node;
                const slots = node.metadata?.videoSlots || {};
                if (!slots.firstFrame && !slots.lastFrame) return node;
                const next: CanvasVideoSlots = op.slot === "firstFrame" ? { ...slots, firstFrame: slots.firstFrame || slots.lastFrame, lastFrame: undefined } : { ...slots, lastFrame: slots.lastFrame || slots.firstFrame, firstFrame: undefined };
                return { ...node, metadata: { ...node.metadata, videoSlots: next } };
            });
        }
        if (op.type === "set_video_mode") {
            nodes = nodes.map((node) => (node.id === op.nodeId ? { ...node, metadata: { ...node.metadata, videoMode: op.mode } } : node));
        }
        if (op.type === "set_asset_source") {
            nodes = nodes.map((node) => (node.id === op.nodeId ? { ...node, metadata: { ...node.metadata, assetSource: op.source } } : node));
        }
        if (op.type === "pack_images_into_group") {
            const sourceIds = new Set(op.nodeIds || []);
            const sources = nodes.filter((node) => sourceIds.has(node.id));
            const collected: CanvasNodeImage[] = [];
            sources.forEach((node) => {
                if (node.type === CanvasNodeType.ImageStack) {
                    collected.push(...(node.metadata?.images || []));
                } else if (node.type === CanvasNodeType.Image && node.metadata?.content) {
                    collected.push({
                        id: nanoid(),
                        status: NODE_STATUS_SUCCESS,
                        content: node.metadata.content,
                        storageKey: node.metadata.storageKey,
                        thumbnail: node.metadata.thumbnail,
                        thumbnailKey: node.metadata.thumbnailKey,
                        naturalWidth: node.metadata.naturalWidth || node.width,
                        naturalHeight: node.metadata.naturalHeight || node.height,
                        bytes: node.metadata.bytes || 0,
                        mimeType: node.metadata.mimeType || "image/png",
                    });
                }
            });
            if (!collected.length) return;
            const spec = getNodeSpec(CanvasNodeType.ImageStack);
            const stack: CanvasNodeData = {
                id: op.id || nanoid(),
                type: CanvasNodeType.ImageStack,
                title: op.title || spec.title,
                position: op.position ? { x: op.position.x - spec.width / 2, y: op.position.y - spec.height / 2 } : { x: nextCanvasX(nodes), y: sources[0]?.position.y ?? 0 },
                width: spec.width,
                height: spec.height,
                metadata: { ...spec.metadata, images: collected, count: collected.length, primaryImageId: collected[0]?.id, status: NODE_STATUS_SUCCESS },
            };
            const ids = new Set(sources.map((node) => node.id));
            nodes = op.removeSources !== false ? [...nodes.filter((node) => !ids.has(node.id)), stack] : [...nodes, stack];
            selectedNodeIds = [stack.id];
        }
        if (op.type === "unpack_image_group") {
            const stack = nodes.find((node) => node.id === op.nodeId);
            if (!stack) return;
            const images = (stack.metadata?.images || []).filter((image) => image.content);
            if (!images.length) return;
            const edge = Math.max(stack.width, stack.height);
            const sizes = images.map((image) => fitNodeSize(image.naturalWidth, image.naturalHeight, edge, edge));
            const cellWidth = Math.max(...sizes.map((size) => size.width));
            const cellHeight = Math.max(...sizes.map((size) => size.height));
            const gap = op.gap ?? 16;
            const columns = Math.max(1, Math.floor(op.columns ?? Math.ceil(Math.sqrt(images.length))));
            const startX = stack.position.x + stack.width + 96;
            const created: CanvasNodeData[] = images.map((image, index) => {
                const size = sizes[index];
                return {
                    id: nanoid(),
                    type: CanvasNodeType.Image,
                    title: `${stack.title} ${index + 1}`,
                    position: { x: startX + (index % columns) * (cellWidth + gap), y: stack.position.y + Math.floor(index / columns) * (cellHeight + gap) },
                    width: size.width,
                    height: size.height,
                    metadata: {
                        content: image.content,
                        storageKey: image.storageKey,
                        thumbnail: image.thumbnail,
                        thumbnailKey: image.thumbnailKey,
                        naturalWidth: image.naturalWidth,
                        naturalHeight: image.naturalHeight,
                        bytes: image.bytes,
                        mimeType: image.mimeType,
                        status: NODE_STATUS_SUCCESS,
                        prompt: stack.metadata?.prompt,
                    },
                };
            });
            nodes = op.keepGroup === true ? [...nodes, ...created] : [...nodes.filter((node) => node.id !== stack.id), ...created];
            selectedNodeIds = created.map((node) => node.id);
        }
        // Async ops (crop_image, split_image, upscale_image, ...) are executed by the page handlers wired through the agent bridge, not by this pure reducer.
    });

    return { ...snapshot, nodes, connections, selectedNodeIds, viewport };
}
