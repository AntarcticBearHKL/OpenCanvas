import assert from "node:assert/strict";
import { test } from "node:test";

import { buildCanvasToolRequest } from "./operations";
import { toolInputSchemas } from "./schemas";
import type { CanvasNode, CanvasSnapshot } from "./types";

type CanvasOp = {
    type: string;
    nodeType?: string;
    id?: string;
    ids?: string[];
    title?: string;
    position?: { x: number; y: number };
    width?: number;
    height?: number;
    patch?: { title?: string; position?: { x: number; y: number } };
    metadata?: Record<string, unknown>;
    fromNodeId?: string;
    toNodeId?: string;
};

function opsOf(name: Parameters<typeof buildCanvasToolRequest>[0], input: Record<string, unknown>) {
    return opsWithState(name, input, null);
}

function opsWithState(name: Parameters<typeof buildCanvasToolRequest>[0], input: Record<string, unknown>, state: CanvasSnapshot | null) {
    const request = buildCanvasToolRequest(name, input, state);
    return (request.input as { ops: CanvasOp[] }).ops;
}

function canvas(nodes: CanvasNode[]): CanvasSnapshot {
    return { projectId: "p", title: "p", nodes, connections: [], selectedNodeIds: [], viewport: { x: 0, y: 0, k: 1 } };
}

function node(id: string, type: CanvasNode["type"], x: number, y: number, width = 100, height = 100, metadata: Record<string, unknown> = {}): CanvasNode {
    return { id, type, title: id, position: { x, y }, width, height, metadata };
}

test("generation flow reuses referenced nodes when the prompt only mentions them", () => {
    const ops = opsOf("canvas_generate_image", { prompt: "@[node:text-1]", referenceNodeIds: ["text-1"], title: "Flow", autoRun: true });
    const addedTextNodes = ops.filter((op) => op.type === "add_node" && op.nodeType === "text");
    const config = ops.find((op) => op.type === "add_node" && op.nodeType === "config");
    const runs = ops.filter((op) => op.type === "run_generation");
    assert.equal(addedTextNodes.length, 0);
    assert.equal(ops.filter((op) => op.type === "connect_nodes" && op.fromNodeId === "text-1" && String(op.toNodeId).startsWith("config-")).length, 1);
    assert.match(String(config?.metadata?.prompt), /^@\[node:text-1\]$/);
    assert.equal(runs.length, 1);
});

test("generation flow still creates a prompt node for prose prompts", () => {
    const ops = opsOf("canvas_generate_image", { prompt: "a cat on a roof", referenceNodeIds: ["text-1"], autoRun: true });
    assert.equal(ops.filter((op) => op.type === "add_node" && op.nodeType === "text").length, 1);
    const config = ops.find((op) => op.type === "add_node" && op.nodeType === "config");
    assert.match(String(config?.metadata?.prompt), /@\[node:text-/);
});

test("smart canvas ops and node types are accepted by tool schemas", () => {
    const ops = toolInputSchemas.canvas_apply_ops.parse({ ops: [{ type: "arrange_board", id: "board-1" }, { type: "place_on_board", nodeId: "image-1", boardId: "board-1" }, { type: "place_on_board", nodeId: "image-1" }] }).ops;
    assert.deepEqual(ops, [
        { type: "arrange_board", id: "board-1" },
        { type: "place_on_board", nodeId: "image-1", boardId: "board-1" },
        { type: "place_on_board", nodeId: "image-1" },
    ]);
    assert.equal(toolInputSchemas.canvas_create_node.parse({ nodeType: "smart-canvas" }).nodeType, "smart-canvas");
    assert.equal(toolInputSchemas.canvas_create_node.parse({ nodeType: "image-generation" }).nodeType, "image-generation");
});

test("every built-in node type is accepted by create and apply schemas", () => {
    const types = [
        "image",
        "text",
        "prompt",
        "music-prompt",
        "speech-prompt",
        "video-prompt",
        "config",
        "image-generation",
        "speech-generation",
        "music-generation",
        "video-generation",
        "video",
        "audio",
        "smart-canvas",
        "assets",
        "recording",
        "image-modifier",
    ];
    types.forEach((nodeType) => {
        assert.equal(toolInputSchemas.canvas_create_node.parse({ nodeType }).nodeType, nodeType);
    });
    assert.deepEqual(toolInputSchemas.canvas_apply_ops.parse({ ops: [{ type: "delete_node", nodeType: "recording" }] }).ops, [{ type: "delete_node", nodeType: "recording" }]);
    assert.throws(() => toolInputSchemas.canvas_create_node.parse({ nodeType: "unknown-type" }));
});

test("node flags become one update per id and require a flag", () => {
    assert.deepEqual(opsOf("canvas_set_node_flags", { ids: ["a", "b"], locked: true, hidden: false }), [
        { type: "update_node", id: "a", metadata: { locked: true, hidden: false } },
        { type: "update_node", id: "b", metadata: { locked: true, hidden: false } },
    ]);
    assert.deepEqual(opsOf("canvas_set_node_flags", { ids: ["a"], hidden: true }), [{ type: "update_node", id: "a", metadata: { hidden: true } }]);
    assert.throws(() => opsOf("canvas_set_node_flags", { ids: ["a"] }), /locked/);
});

test("bulk rename numbers nodes in the given order", () => {
    assert.deepEqual(opsOf("canvas_bulk_rename", { ids: ["b", "a"], title: " 主题 " }), [
        { type: "update_node", id: "b", patch: { title: "主题 1" } },
        { type: "update_node", id: "a", patch: { title: "主题 2" } },
    ]);
    assert.deepEqual(opsOf("canvas_bulk_rename", { ids: ["a"], title: "主题" }), [{ type: "update_node", id: "a", patch: { title: "主题" } }]);
    assert.deepEqual(opsOf("canvas_bulk_rename", { ids: ["a", "b"], title: "   " }), []);
});

test("align nodes maps ids onto the selection bounds", () => {
    const state = canvas([node("a", "image", 100, 50), node("b", "image", 300, 400, 50, 50), node("c", "image", 600, 200, 200, 20)]);
    assert.deepEqual(opsWithState("canvas_align_nodes", { ids: ["a", "b", "c"], mode: "left" }, state), [
        { type: "update_node", id: "a", patch: { position: { x: 100, y: 50 } } },
        { type: "update_node", id: "b", patch: { position: { x: 100, y: 400 } } },
        { type: "update_node", id: "c", patch: { position: { x: 100, y: 200 } } },
    ]);
    assert.deepEqual(opsWithState("canvas_align_nodes", { ids: ["a", "b", "c"], mode: "top" }, state), [
        { type: "update_node", id: "a", patch: { position: { x: 100, y: 50 } } },
        { type: "update_node", id: "b", patch: { position: { x: 300, y: 50 } } },
        { type: "update_node", id: "c", patch: { position: { x: 600, y: 50 } } },
    ]);
    assert.deepEqual(opsWithState("canvas_align_nodes", { ids: ["a", "b", "missing"], mode: "left" }, state), [
        { type: "update_node", id: "a", patch: { position: { x: 100, y: 50 } } },
        { type: "update_node", id: "b", patch: { position: { x: 100, y: 400 } } },
    ]);
});

test("distribute nodes equalises gaps and stays a no-op under three", () => {
    const state = canvas([node("a", "image", 100, 50), node("b", "image", 300, 400, 50, 50), node("c", "image", 600, 200, 200, 20)]);
    assert.deepEqual(opsWithState("canvas_align_nodes", { ids: ["a", "b", "c"], mode: "distribute-x" }, state), [
        { type: "update_node", id: "a", patch: { position: { x: 100, y: 50 } } },
        { type: "update_node", id: "b", patch: { position: { x: 375, y: 400 } } },
        { type: "update_node", id: "c", patch: { position: { x: 600, y: 200 } } },
    ]);
    assert.deepEqual(opsWithState("canvas_align_nodes", { ids: ["a", "b"], mode: "distribute-y" }, state), []);
});

test("duplicate node copies the source with an offset and selects the copy", () => {
    const source = node("src", "text", 10, 20, 340, 240, { content: "hi", locked: true });
    const ops = opsWithState("canvas_duplicate_node", { id: "src" }, canvas([source]));
    const copy = ops.find((op) => op.type === "add_node");
    assert.match(String(copy?.id), /^copy-/);
    assert.equal(copy?.nodeType, "text");
    assert.equal(copy?.title, "src");
    assert.deepEqual(copy?.position, { x: 50, y: 60 });
    assert.equal(copy?.width, 340);
    assert.equal(copy?.height, 240);
    assert.deepEqual(copy?.metadata, { content: "hi", locked: true });
    assert.deepEqual(ops[1], { type: "select_nodes", ids: [String(copy?.id)] });
    assert.deepEqual(opsWithState("canvas_duplicate_node", { id: "src", dx: -10, dy: 5 }, canvas([source])).find((op) => op.type === "add_node")?.position, { x: 0, y: 25 });
    assert.deepEqual(opsWithState("canvas_duplicate_node", { id: "missing" }, canvas([source])), []);
});
