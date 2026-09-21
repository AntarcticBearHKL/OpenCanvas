import crypto from "node:crypto";

import { nextCanvasX } from "../tools";
import type { CanvasSnapshot } from "../types";
import { applyOps, configNodeOp, generationMode, runGenerationOp, textNodeOp, type CanvasToolHandler, type CanvasToolRequest } from "./shared";

/** 创建包含提示词、配置节点和引用连线的生成流程。 */
function generationFlowOps(input: Record<string, unknown>, state: CanvasSnapshot | null) {
    const mode = generationMode(input.mode);
    const prompt = String(input.prompt || "");
    const x = Number(input.x ?? nextCanvasX(state));
    const y = Number(input.y ?? 0);
    const textId = `text-${crypto.randomUUID()}`;
    const configId = `config-${crypto.randomUUID()}`;
    const referenceNodeIds = Array.isArray(input.referenceNodeIds) ? input.referenceNodeIds.filter((id): id is string => typeof id === "string") : [];
    // When the prompt only @-mentions nodes already passed as references, reuse them instead of minting a duplicate text node.
    const mentionedIds = [...prompt.matchAll(/@\[node:([\w-]+)\]/g)].map((match) => match[1]);
    const reuseReferences = referenceNodeIds.length > 0 && mentionedIds.length > 0
        && mentionedIds.every((id) => referenceNodeIds.includes(id))
        && prompt.replace(/@\[node:[\w-]+\]/g, "").trim() === "";
    const tokens = reuseReferences ? referenceNodeIds.map((id) => `@[node:${id}]`) : [`@[node:${textId}]`, ...referenceNodeIds.map((id) => `@[node:${id}]`)];
    return [
        ...(reuseReferences ? [] : [textNodeOp({ id: textId, text: prompt, title: String(input.title || "提示词") }, x, y)]),
        configNodeOp(configId, { ...input, prompt: tokens.join("\n") }, x + 420, y),
        ...(reuseReferences ? [] : [{ type: "connect_nodes", fromNodeId: textId, toNodeId: configId }]),
        ...referenceNodeIds.map((fromNodeId) => ({ type: "connect_nodes", fromNodeId, toNodeId: configId })),
        { type: "select_nodes", ids: [configId] },
        ...(input.autoRun ? [runGenerationOp(configId, mode, tokens.join("\n"))] : []),
    ];
}

export function createImagePromptFlow(input: Record<string, unknown>, state: CanvasSnapshot | null): CanvasToolRequest {
    return applyOps(generationFlowOps({ ...input, mode: "image" }, state));
}

export function createConfigNode(input: Record<string, unknown>, state: CanvasSnapshot | null): CanvasToolRequest {
    const x = Number(input.x ?? nextCanvasX(state));
    const y = Number(input.y ?? 0);
    const configId = `config-${crypto.randomUUID()}`;
    const mode = generationMode(input.mode);
    const prompt = String(input.prompt || "");
    return applyOps([configNodeOp(configId, input, x, y), ...(input.autoRun ? [runGenerationOp(configId, mode, prompt)] : [])]);
}

export function createGenerationFlow(input: Record<string, unknown>, state: CanvasSnapshot | null): CanvasToolRequest {
    return applyOps(generationFlowOps(input, state));
}

export function autoGenerate(mode: "text" | "image" | "video" | "audio"): CanvasToolHandler {
    return (input, state) => applyOps(generationFlowOps({ ...input, mode, autoRun: true }, state));
}

export function runGeneration(input: Record<string, unknown>): CanvasToolRequest {
    const data = input as { nodeId: string; mode?: string; prompt?: string };
    return applyOps([runGenerationOp(data.nodeId, generationMode(data.mode), data.prompt)]);
}
