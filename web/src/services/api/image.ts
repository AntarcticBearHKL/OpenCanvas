import axios from "axios";

import { IMAGE_MODEL, buildApiUrl, resolveModelRequestConfig, resolveModelScript, type AiConfig, type ModelRequestConfig } from "@/stores/use-config-store";
import { estimateGenerationCost, estimateTokenCost, type GenerationCost } from "@/lib/canvas/generation-cost";
import { apiText, readApiErrorMessage, readAxiosError, statusMessage } from "./api-error";
import { normalizePluginImages, runModelPlugin } from "./model-plugin";
import { nanoid } from "nanoid";
import { buildImageReferencePromptText } from "@/lib/image-reference-prompt";
import { imageToDataUrl } from "@/services/image-storage";
import { imageSizePresets } from "@/lib/media-size";
import { recordRuntimeLog, truncateLogText } from "@/lib/runtime-log";
import type { ReferenceImage } from "@/types/image";

export type AiTextMessage = {
    role: "system" | "user" | "assistant";
    content: string | Array<{ type: "text"; text: string } | { type: "image_url"; image_url: { url: string } }>;
};

type ResponseToolCall = {
    id: string;
    type: "function";
    function: { name: string; arguments: string };
    thoughtSignature?: string;
};

type ResponseInputMessage =
    | AiTextMessage
    | { type: "function_call"; call_id: string; name: string; arguments: string; thoughtSignature?: string }
    | { role: "tool"; tool_call_id: string; content: string };

type ToolResponseResult = {
    content: string;
    toolCalls: ResponseToolCall[];
};

type ResponseMessageContent = AiTextMessage["content"] | string;
type ResponseInputContent = { type: "input_text"; text: string } | { type: "input_image"; image_url: string };
type ResponseInputItem =
    | { role: "system" | "user" | "assistant"; content: string | ResponseInputContent[] }
    | { type: "function_call"; call_id: string; name: string; arguments: string }
    | { type: "function_call_output"; call_id: string; output: string };
type ResponseApiOutputItem =
    | { type?: "message"; content?: Array<{ type?: string; text?: string }> }
    | { type?: "function_call"; id?: string; call_id?: string; name?: string; arguments?: string };
type ResponseApiPayload = {
    id?: string;
    output?: ResponseApiOutputItem[];
    output_text?: string;
    error?: { message?: string };
    code?: number;
    msg?: string;
};
type ResponseStreamState = { buffer: string; text: string; payload?: ResponseApiPayload; error?: string };

type ImageUsage = { cost?: number | null; prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };

type ImageApiResponse = {
    data?: Array<Record<string, unknown>>;
    usage?: ImageUsage;
    error?: { message?: string };
    code?: number;
    msg?: string;
};
type RequestOptions = { signal?: AbortSignal };

type GeneratedImage = { id: string; dataUrl: string };
type ImageRequestResult = { images: GeneratedImage[]; cost?: GenerationCost };

function logImageRequest(action: string, model: string, prompt: string, detail?: string) {
    recordRuntimeLog({
        category: "generation",
        action,
        message: `model=${model || "(none)"}`,
        detail: `prompt: ${truncateLogText(prompt, 300)}${detail ? `\n${detail}` : ""}`,
    });
}

function logImageSuccess(action: string, message: string) {
    recordRuntimeLog({ category: "generation", action: `${action}.success`, message });
}

function logImageError(action: string, message: string, error: unknown) {
    recordRuntimeLog({
        level: "error",
        category: "generation",
        action: `${action}.error`,
        message: truncateLogText(message, 300),
        detail: truncateLogText(rawResponseOf(error)),
    });
}

function rawResponseOf(error: unknown) {
    const raw = (error as { rawResponse?: string } | null)?.rawResponse;
    if (typeof raw === "string" && raw) return raw;
    if (axios.isAxiosError(error) && error.response?.data != null) {
        const data = error.response.data;
        if (typeof data === "string") return data;
        try {
            return JSON.stringify(data);
        } catch {
            return "";
        }
    }
    return "";
}

function attachRawResponse<T extends Error>(error: T, raw: string): T {
    (error as T & { rawResponse?: string }).rawResponse = raw;
    return error;
}

function messageLogText(messages: AiTextMessage[]) {
    return messages
        .map((message) => (typeof message.content === "string" ? message.content : message.content.map((part) => (part.type === "text" ? part.text : "")).join(" ")))
        .join("\n");
}

const QUALITY_BASE: Record<string, number> = {
    low: 1024,
    medium: 2048,
    high: 2880,
    standard: 1024,
    hd: 2048,
};
const QUALITY_ALIASES: Record<string, string> = {
    "1k": "low",
    "2k": "medium",
    "4k": "high",
};
const DEFAULT_IMAGE_SHORT_SIDE = 1024;
const IMAGE_SIZE_STEP = 16;
const IMAGE_MIN_PIXELS = 655360;
const IMAGE_MAX_PIXELS = 8294400;
const IMAGE_MAX_EDGE = 3840;
const IMAGE_MAX_RATIO = 3;
const IMAGE_OUTPUT_FORMAT = "png";

function normalizeQuality(quality: string) {
    const value = quality.trim().toLowerCase();
    const normalized = QUALITY_ALIASES[value] || value;
    return QUALITY_BASE[normalized] ? normalized : undefined;
}

/** Only "transparent" is forwarded; any other value (incl. empty) means keep the default opaque background. */
function normalizeBackground(background: string | undefined) {
    return background?.trim().toLowerCase() === "transparent" ? "transparent" : undefined;
}

/** Map "quality + ratio" to an explicit pixel dimension like "3840x2160". */
function resolveSize(quality: string | undefined, ratio: string): string {
    const parsedRatio = parseImageRatio(ratio);
    const scale = quality === "high" ? "4k" : quality === "medium" || quality === "hd" ? "2k" : "1k";
    const preset = imageSizePresets[scale][ratio];
    if (preset) return preset;
    const basePixels = quality ? QUALITY_BASE[quality] : undefined;
    const isLandscape = parsedRatio.width >= parsedRatio.height;
    const longRatio = isLandscape ? parsedRatio.width / parsedRatio.height : parsedRatio.height / parsedRatio.width;
    let longSide: number;
    let shortSide: number;

    if (basePixels) {
        const targetPixels = basePixels * basePixels;
        const longSideRaw = Math.sqrt(targetPixels * longRatio);
        longSide = Math.floor(longSideRaw / IMAGE_SIZE_STEP) * IMAGE_SIZE_STEP;
        shortSide = Math.round(longSide / longRatio / IMAGE_SIZE_STEP) * IMAGE_SIZE_STEP;
    } else {
        shortSide = DEFAULT_IMAGE_SHORT_SIDE;
        longSide = Math.round((shortSide * longRatio) / IMAGE_SIZE_STEP) * IMAGE_SIZE_STEP;
    }

    const width = isLandscape ? longSide : shortSide;
    const height = isLandscape ? shortSide : longSide;
    validateImageSize(width, height);
    return `${width}x${height}`;
}

function parseRatioValue(value: string) {
    const parts = value.split(":");
    if (parts.length !== 2) throw new Error(apiText("invalidImageSizeFormat"));
    const w = Number(parts[0]);
    const h = Number(parts[1]);
    if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) throw new Error(apiText("positiveImageRatio"));
    return { width: w, height: h };
}

function parseImageRatio(value: string) {
    const ratio = parseRatioValue(value);
    if (Math.max(ratio.width, ratio.height) / Math.min(ratio.width, ratio.height) > IMAGE_MAX_RATIO) throw new Error(apiText("imageRatioLimit"));
    return ratio;
}

function parseImageDimensions(value: string) {
    const match = value.match(/^(\d+)x(\d+)$/i);
    if (!match) return null;
    return { width: Number(match[1]), height: Number(match[2]) };
}

function validateImageSize(width: number, height: number) {
    if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) throw new Error(apiText("positiveImageDimensions"));
    if (width % IMAGE_SIZE_STEP !== 0 || height % IMAGE_SIZE_STEP !== 0) throw new Error(apiText("imageDimensionStep"));
    if (Math.max(width, height) > IMAGE_MAX_EDGE) throw new Error(apiText("imageEdgeLimit"));
    if (Math.max(width, height) / Math.min(width, height) > IMAGE_MAX_RATIO) throw new Error(apiText("imageRatioLimit"));
    const pixels = width * height;
    if (pixels < IMAGE_MIN_PIXELS || pixels > IMAGE_MAX_PIXELS) throw new Error(apiText("imagePixelLimit"));
}

function resolveRequestSize(quality: string | undefined, size: string) {
    const value = size.trim();
    if (!value || value.toLowerCase() === "auto") return undefined;
    const dimensions = parseImageDimensions(value);
    if (dimensions) {
        validateImageSize(dimensions.width, dimensions.height);
        return `${dimensions.width}x${dimensions.height}`;
    }
    if (value.includes(":")) return resolveSize(quality, value);
    throw new Error(apiText("invalidImageSizeFormat"));
}

/** Map app quality/size settings to the OpenRouter image request fields. */
function resolveImageRequestOptions(config: AiConfig) {
    const quality = config.quality.trim().toLowerCase();
    const size = config.size.trim();
    const dimensions = parseImageDimensions(size);
    const ratio = size === "auto" || /^\d+:\d+$/.test(size);
    const background = normalizeBackground(config.background);
    return {
        ...(quality && quality !== "auto" ? { quality } : {}),
        ...(dimensions ? { size } : ratio ? { aspect_ratio: size } : {}),
        ...(background ? { background } : {}),
    };
}

function resolveImageSource(item: Record<string, unknown>) {
    if (typeof item.b64_json === "string" && item.b64_json) {
        const mediaType = typeof item.media_type === "string" && item.media_type ? item.media_type : "image/png";
        return `data:${mediaType};base64,${item.b64_json}`;
    }
    if (typeof item.url === "string" && item.url) {
        return item.url;
    }
    return null;
}

function parseImagePayload(payload: ImageApiResponse) {
    if (typeof payload.code === "number" && payload.code !== 0) {
        throw new Error(payload.msg || apiText("requestFailed"));
    }
    // Support data, images, and results response fields used by different APIs.
    const imageList = payload.data
        || (payload as Record<string, unknown>).images as Array<Record<string, unknown>> | undefined
        || (payload as Record<string, unknown>).results as Array<Record<string, unknown>> | undefined
        || [];
    const images = imageList
        .map((item) => {
            const dataUrl = resolveImageSource(item);
            return dataUrl ? { id: nanoid(), dataUrl } : null;
        })
        .filter((value): value is { id: string; dataUrl: string } => Boolean(value));

    if (images.length === 0) {
        // Check whether the response contains data in an unrecognized format.
        const rawKeys = Object.keys(payload).filter((k) => k !== "code" && k !== "msg" && k !== "error");
        throw new Error(rawKeys.length > 0
            ? apiText("unknownImageResponse", { fields: rawKeys.join(", ") })
            : apiText("noImageReturned"));
    }

    return images;
}

export function readGenerationId(headers: unknown) {
    if (!headers || typeof headers !== "object") return undefined;
    const value = (headers as Record<string, unknown>)["x-generation-id"];
    return typeof value === "string" && value ? value : undefined;
}

export async function fetchGenerationCost(config: ModelRequestConfig, generationId: string) {
    try {
        const response = await axios.get<{ data?: { total_cost?: number | null; usage?: number | null } | null; total_cost?: number | null; usage?: number | null }>(aiApiUrl(config, "/generation"), {
            params: { id: generationId },
            headers: aiHeaders(config),
        });
        const payload = response.data?.data || response.data;
        const totalCost = payload?.total_cost;
        if (totalCost != null && Number.isFinite(Number(totalCost))) return Number(totalCost);
        const usage = payload?.usage;
        if (usage != null && Number.isFinite(Number(usage))) return Number(usage);
    } catch {
        return undefined;
    }
    return undefined;
}

async function resolveImageCost(config: ModelRequestConfig, usage: ImageUsage | undefined, generationId: string | undefined, hasReference: boolean): Promise<GenerationCost> {
    const billed = usage?.cost == null ? Number.NaN : Number(usage.cost);
    if (Number.isFinite(billed)) return { usd: Number(billed.toFixed(6)), priced: true, source: "api" };
    if (generationId) {
        const looked = await fetchGenerationCost(config, generationId);
        if (looked !== undefined) return { usd: Number(looked.toFixed(6)), priced: true, source: "lookup" };
    }
    const estimated = estimateTokenCost(IMAGE_MODEL, { promptTokens: usage?.prompt_tokens, completionTokens: usage?.completion_tokens, totalTokens: usage?.total_tokens, hasReference });
    return estimated || estimateGenerationCost(IMAGE_MODEL, "image", 1);
}

function withSystemPrompt(config: AiConfig, prompt: string) {
    const systemPrompt = config.systemPrompt.trim();
    return systemPrompt ? `${systemPrompt}\n\n${prompt}` : prompt;
}

function aiApiUrl(config: ModelRequestConfig, path: string) {
    return buildApiUrl(config.baseUrl, path);
}

function aiHeaders(config: ModelRequestConfig, contentType?: string) {
    return {
        Authorization: `Bearer ${config.apiKey}`,
        ...(contentType ? { "Content-Type": contentType } : {}),
    };
}

function withSystemMessage<T extends ResponseInputMessage>(config: AiConfig, messages: T[]): ResponseInputMessage[] {
    const systemPrompt = config.systemPrompt.trim();
    return systemPrompt ? [{ role: "system" as const, content: systemPrompt }, ...messages] : messages;
}

function toResponseInput(messages: ResponseInputMessage[]): ResponseInputItem[] {
    return messages.flatMap((message): ResponseInputItem[] => {
        if ("type" in message) return [message];
        if (message.role === "tool") return [{ type: "function_call_output", call_id: message.tool_call_id, output: message.content }];
        return [{ role: message.role, content: toResponseContent(message.content || "") }];
    });
}

function toResponseContent(content: ResponseMessageContent): string | ResponseInputContent[] {
    if (!Array.isArray(content)) return String(content || "");
    return content.map((item) => (item.type === "text" ? { type: "input_text" as const, text: item.text } : { type: "input_image" as const, image_url: item.image_url.url }));
}

function parseToolResponse(payload: ResponseApiPayload): ToolResponseResult {
    const output = payload.output || [];
    const content =
        payload.output_text ||
        output
            .flatMap((item) => (item.type === "message" ? item.content || [] : []))
            .map((item) => item.text || "")
            .join("");
    const toolCalls = output
        .filter((item): item is Extract<ResponseApiOutputItem, { type?: "function_call" }> => item.type === "function_call")
        .map((item) => ({
            id: item.call_id || item.id || "",
            type: "function" as const,
            function: { name: item.name || "", arguments: item.arguments || "{}" },
        }))
        .filter((item) => item.id && item.function.name);
    return { content, toolCalls };
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function responseErrorMessage(value: unknown) {
    if (!isRecord(value)) return "";
    const error = isRecord(value.error) ? value.error : undefined;
    const response = isRecord(value.response) ? value.response : undefined;
    const responseError = response && isRecord(response.error) ? response.error : undefined;
    return stringValue(value.msg) || stringValue(error?.message) || stringValue(responseError?.message);
}

function stringValue(value: unknown) {
    return typeof value === "string" ? value : "";
}

function validateResponsePayload(payload: ResponseApiPayload) {
    if (typeof payload.code === "number" && payload.code !== 0) throw new Error(payload.msg || apiText("requestFailed"));
    if (payload.error?.message) throw new Error(payload.error.message);
}

async function readFetchError(response: Response, fallback: string) {
    const text = await response.text();
    if (!text) return statusMessage(response.status, fallback);
    try {
        return responseErrorMessage(JSON.parse(text)) || statusMessage(response.status, fallback);
    } catch {
        return text.slice(0, 300) || statusMessage(response.status, fallback);
    }
}

function consumeResponseStreamBlock(block: string, state: ResponseStreamState, onDelta?: (text: string) => void) {
    const data = block
        .split(/\r?\n/)
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).replace(/^ /, ""))
        .join("\n")
        .trim();
    if (!data || data === "[DONE]") return;
    const event = JSON.parse(data) as Record<string, unknown>;
    const type = stringValue(event.type);
    const errorMessage = responseErrorMessage(event);
    if (errorMessage) state.error = errorMessage;
    if (type === "response.output_text.delta" && typeof event.delta === "string") {
        state.text += event.delta;
        onDelta?.(state.text);
    }
    if (type === "response.output_text.done" && !state.text && typeof event.text === "string") {
        state.text = event.text;
        onDelta?.(state.text);
    }
    if (type === "response.completed" && isRecord(event.response)) {
        state.payload = event.response as ResponseApiPayload;
    } else if (Array.isArray(event.output)) {
        state.payload = event as ResponseApiPayload;
    }
}

function consumeResponseStreamText(state: ResponseStreamState, text: string, onDelta?: (text: string) => void, flush = false) {
    state.buffer += text;
    for (;;) {
        const match = state.buffer.match(/\r?\n\r?\n/);
        if (!match) break;
        const index = match.index ?? 0;
        consumeResponseStreamBlock(state.buffer.slice(0, index), state, onDelta);
        state.buffer = state.buffer.slice(index + match[0].length);
    }
    if (flush && state.buffer.trim()) {
        consumeResponseStreamBlock(state.buffer, state, onDelta);
        state.buffer = "";
    }
}

async function requestStreamingResponse(config: ModelRequestConfig, body: Record<string, unknown>, onDelta?: (text: string) => void, options?: RequestOptions): Promise<ToolResponseResult> {
    const response = await fetch(aiApiUrl(config, "/responses"), {
        method: "POST",
        headers: { ...aiHeaders(config, "application/json"), Accept: "text/event-stream" },
        body: JSON.stringify({ ...body, stream: true }),
        signal: options?.signal,
    });
    if (!response.ok) {
        const message = await readFetchError(response, apiText("requestFailed"));
        throw attachRawResponse(new Error(message), message);
    }
    if (!response.body) {
        const payload = (await response.json()) as ResponseApiPayload;
        validateResponsePayload(payload);
        return parseToolResponse(payload);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    const state: ResponseStreamState = { buffer: "", text: "" };
    for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        consumeResponseStreamText(state, decoder.decode(value, { stream: true }), onDelta);
        if (state.error) throw attachRawResponse(new Error(state.error), state.error);
    }
    consumeResponseStreamText(state, decoder.decode(), onDelta, true);
    if (state.error) throw attachRawResponse(new Error(state.error), state.error);
    if (!state.payload) return { content: state.text, toolCalls: [] };
    validateResponsePayload(state.payload);
    const result = parseToolResponse(state.payload);
    return { ...result, content: state.text || result.content };
}

export async function requestGeneration(config: AiConfig, prompt: string, options?: RequestOptions): Promise<ImageRequestResult> {
    const requestConfig = { ...resolveModelRequestConfig(config, config.model || config.imageModel), model: IMAGE_MODEL };
    const n = Math.max(1, Math.min(10, Math.floor(Math.abs(Number(config.count)) || 1)));
    const script = resolveModelScript(config, config.model || config.imageModel);
    logImageRequest("image.generate", requestConfig.model, prompt, `count=${n}`);
    if (script) {
        const quality = normalizeQuality(config.quality);
        const requestSize = resolveRequestSize(quality, config.size);
        const background = normalizeBackground(config.background);
        try {
            const result = await runModelPlugin({
                capability: "image",
                script,
                config: requestConfig,
                prompt: withSystemPrompt(requestConfig, prompt),
                images: [],
                params: { size: requestSize, quality, count: n, ...(background ? { background } : {}) },
                signal: options?.signal,
            });
            const images = normalizePluginImages(result).map((dataUrl) => ({ id: nanoid(), dataUrl }));
            logImageSuccess("image.generate", `images=${images.length}`);
            return { images };
        } catch (error) {
            const message = readAxiosError(error, apiText("requestFailed"));
            logImageError("image.generate", message, error);
            throw new Error(message);
        }
    }
    try {
        const response = await axios.post<ImageApiResponse>(
            aiApiUrl(requestConfig, "/images"),
            {
                model: requestConfig.model,
                prompt: withSystemPrompt(requestConfig, prompt),
                n,
                ...resolveImageRequestOptions(config),
                output_format: IMAGE_OUTPUT_FORMAT,
            },
            { headers: aiHeaders(requestConfig, "application/json"), signal: options?.signal },
        );
        const images = await parseImagePayload(response.data);
        const cost = await resolveImageCost(requestConfig, response.data.usage, readGenerationId(response.headers), false);
        logImageSuccess("image.generate", `images=${images.length}${cost?.usd != null ? ` cost=$${cost.usd}` : ""}`);
        return { images, cost };
    } catch (error) {
        const message = readAxiosError(error, apiText("requestFailed"));
        logImageError("image.generate", message, error);
        throw new Error(message);
    }
}

export async function requestEdit(config: AiConfig, prompt: string, references: ReferenceImage[], options?: RequestOptions): Promise<ImageRequestResult> {
    const requestConfig = { ...resolveModelRequestConfig(config, config.model || config.imageModel), model: IMAGE_MODEL };
    const n = Math.max(1, Math.min(10, Math.floor(Math.abs(Number(config.count)) || 1)));
    const requestPrompt = buildImageReferencePromptText(prompt, references);
    const script = resolveModelScript(config, config.model || config.imageModel);
    logImageRequest("image.edit", requestConfig.model, prompt, `references=${references.length}`);
    if (script) {
        const quality = normalizeQuality(config.quality);
        const requestSize = resolveRequestSize(quality, config.size);
        const background = normalizeBackground(config.background);
        const refs = await Promise.all(references.map((image) => imageToDataUrl(image)));
        try {
            const result = await runModelPlugin({
                capability: "image",
                script,
                config: requestConfig,
                prompt: withSystemPrompt(requestConfig, requestPrompt),
                images: refs,
                params: { size: requestSize, quality, count: n, ...(background ? { background } : {}) },
                signal: options?.signal,
            });
            const images = normalizePluginImages(result).map((dataUrl) => ({ id: nanoid(), dataUrl }));
            logImageSuccess("image.edit", `images=${images.length}`);
            return { images };
        } catch (error) {
            const message = readAxiosError(error, apiText("requestFailed"));
            logImageError("image.edit", message, error);
            throw new Error(message);
        }
    }
    try {
        const inputReferences = await Promise.all(references.map(async (image) => ({ type: "image_url" as const, image_url: { url: await imageToDataUrl(image) } })));
        const response = await axios.post<ImageApiResponse>(
            aiApiUrl(requestConfig, "/images"),
            {
                model: requestConfig.model,
                prompt: withSystemPrompt(requestConfig, requestPrompt),
                n: 1,
                ...resolveImageRequestOptions(config),
                input_references: inputReferences,
                output_format: IMAGE_OUTPUT_FORMAT,
            },
            { headers: aiHeaders(requestConfig, "application/json"), signal: options?.signal },
        );
        const images = await parseImagePayload(response.data);
        const cost = await resolveImageCost(requestConfig, response.data.usage, readGenerationId(response.headers), true);
        logImageSuccess("image.edit", `images=${images.length}${cost?.usd != null ? ` cost=$${cost.usd}` : ""}`);
        return { images, cost };
    } catch (error) {
        const message = readAxiosError(error, apiText("requestFailed"));
        logImageError("image.edit", message, error);
        throw new Error(message);
    }
}

export async function requestImageQuestion(config: AiConfig, messages: AiTextMessage[], onDelta: (text: string) => void, options?: RequestOptions) {
    const requestConfig = resolveModelRequestConfig(config, config.model || config.textModel);
    const script = resolveModelScript(config, config.model || config.textModel);
    logImageRequest("text.chat", requestConfig.model, messageLogText(messages));
    if (script) {
        try {
            const answer = await runModelPlugin<string>({
                capability: "text",
                script,
                config: requestConfig,
                messages: withSystemMessage(requestConfig, messages),
                signal: options?.signal,
                onDelta,
            });
            const text = String(answer ?? "").trim() || apiText("noContent");
            if (text === apiText("noContent")) onDelta(text);
            logImageSuccess("text.chat", `chars=${text.length}`);
            return text;
        } catch (error) {
            const message = readAxiosError(error, apiText("requestFailed"));
            logImageError("text.chat", message, error);
            throw new Error(message);
        }
    }
    try {
        const answer = (await requestStreamingResponse(requestConfig, {
            model: requestConfig.model,
            input: toResponseInput(withSystemMessage(requestConfig, messages)),
            ...(requestConfig.reasoningEffort === "auto" ? {} : { reasoning: { effort: requestConfig.reasoningEffort } }),
        }, onDelta, options)).content || apiText("noContent");
        if (answer === apiText("noContent")) onDelta(answer);
        logImageSuccess("text.chat", `chars=${answer.length}`);
        return answer;
    } catch (error) {
        const message = readAxiosError(error, apiText("requestFailed"));
        logImageError("text.chat", message, error);
        throw new Error(message);
    }
}

