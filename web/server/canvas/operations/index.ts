import type { ToolName } from "../schemas";
import type { CanvasSnapshot } from "../types";
import { autoGenerate, createConfigNode, createGenerationFlow, createImagePromptFlow, runGeneration } from "./flows";
import { bulkRename, createNode, createTextNode, createTextNodes, deleteNodes, duplicateNode, moveNodes, resizeNode, setNodeFlags, updateNode, updateNodeText } from "./nodes";
import type { CanvasToolHandler, CanvasToolRequest } from "./shared";
import { alignNodes } from "./transform";
import { connectNodes, selectNodes, setViewport } from "./view";

const handlers: Partial<Record<ToolName, CanvasToolHandler>> = {
    canvas_create_node: createNode,
    canvas_create_text_node: createTextNode,
    canvas_create_text_nodes: createTextNodes,
    canvas_create_image_prompt_flow: createImagePromptFlow,
    canvas_create_config_node: createConfigNode,
    canvas_create_generation_flow: createGenerationFlow,
    canvas_generate_text: autoGenerate("text"),
    canvas_generate_image: autoGenerate("image"),
    canvas_generate_video: autoGenerate("video"),
    canvas_generate_audio: autoGenerate("audio"),
    canvas_update_node: updateNode,
    canvas_update_node_text: updateNodeText,
    canvas_move_nodes: moveNodes,
    canvas_resize_node: resizeNode,
    canvas_set_node_flags: setNodeFlags,
    canvas_bulk_rename: bulkRename,
    canvas_align_nodes: alignNodes,
    canvas_duplicate_node: duplicateNode,
    canvas_delete_nodes: deleteNodes,
    canvas_connect_nodes: connectNodes,
    canvas_select_nodes: selectNodes,
    canvas_set_viewport: setViewport,
    canvas_run_generation: runGeneration,
};

/** 将上层画布工具调用转换为前端可执行的批量操作。 */
export function buildCanvasToolRequest(name: ToolName, input: Record<string, unknown>, state: CanvasSnapshot | null): CanvasToolRequest {
    if (name === "canvas_apply_ops") return { name, input };
    const handler = handlers[name];
    if (handler) return handler(input, state);
    throw new Error(`未知工具：${name}`);
}
