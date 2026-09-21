import { decodeChannelModel } from "@/stores/use-config-store";

export type GenerationCostUnit = "image" | "video-second" | "call" | "audio-clip" | "audio-byte";

export type GenerationCostSource = "api" | "lookup" | "estimate";

export type GenerationCost = { usd: number; priced: boolean; source: GenerationCostSource; reason?: "unpriced-model" | "unpriced-unit" };

type ModelPrice = { unit: GenerationCostUnit; usd: number };

type ModelTokenPrice = { inputText: number; inputImage: number; outputImage: number };

export const MODEL_PRICES: Record<string, ModelPrice> = {
    "gpt-image-1": { unit: "image", usd: 0.04 },
    "dall-e-3": { unit: "image", usd: 0.04 },
    "gpt-4o": { unit: "call", usd: 0.005 },
    "gpt-4o-mini": { unit: "call", usd: 0.0006 },
    sora: { unit: "video-second", usd: 0.1 },
    "tts-1": { unit: "call", usd: 0.015 },
    "google/lyria-3-pro-preview": { unit: "audio-clip", usd: 0.08 },
    "google/lyria-3-clip-preview": { unit: "audio-clip", usd: 0.04 },
    "fish-audio/s2.1-pro": { unit: "audio-byte", usd: 0.000015 },
};

export const MODEL_TOKEN_PRICES: Record<string, ModelTokenPrice> = {
    "openai/gpt-image-2.5-sunburst": { inputText: 0.000005, inputImage: 0.000008, outputImage: 0.00003 },
};

export const GENERATION_COST_RECORD_LIMIT = 200;

export function priceModelId(model: string): string {
    return (decodeChannelModel(model)?.model || model).trim().toLowerCase();
}

function modelPrice(model: string): ModelPrice | undefined {
    return MODEL_PRICES[priceModelId(model)];
}

export function estimateGenerationCost(model: string, unit: GenerationCostUnit, quantity: number): GenerationCost {
    const price = modelPrice(model);
    if (!price) return { usd: 0, priced: false, source: "estimate", reason: "unpriced-model" };
    if (price.unit !== unit || !Number.isFinite(quantity) || quantity <= 0) return { usd: 0, priced: false, source: "estimate", reason: "unpriced-unit" };
    return { usd: Number((price.usd * quantity).toFixed(6)), priced: true, source: "estimate" };
}

export function estimateTokenCost(model: string, usage: { promptTokens?: number; completionTokens?: number; totalTokens?: number; hasReference?: boolean }): GenerationCost | null {
    const price = MODEL_TOKEN_PRICES[priceModelId(model)];
    const completionTokens = Math.max(0, Number(usage.completionTokens) || 0);
    const promptTokens = Math.max(0, Number(usage.promptTokens) || (Number(usage.totalTokens) || 0) - completionTokens);
    if (!price || (!promptTokens && !completionTokens)) return null;
    const inputRate = usage.hasReference ? price.inputImage : price.inputText;
    return { usd: Number((promptTokens * inputRate + completionTokens * price.outputImage).toFixed(6)), priced: true, source: "estimate" };
}

export function audioGenerationCharge(model: string, prompt: string): { unit: GenerationCostUnit; quantity: number } {
    const unit = modelPrice(model)?.unit;
    if (unit === "audio-byte") return { unit, quantity: new TextEncoder().encode(prompt).length };
    if (unit === "audio-clip") return { unit, quantity: 1 };
    return { unit: unit || "call", quantity: 1 };
}

export function formatUsd(usd: number): string {
    if (usd > 0 && usd < 0.001) return `$${usd.toFixed(4)}`;
    if (usd > 0 && usd < 0.01) return `$${usd.toFixed(3)}`;
    return `$${usd.toFixed(2)}`;
}
