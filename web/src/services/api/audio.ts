import axios from "axios";

import { audioMimeType, isOpenRouterMusicModel, musicAudioFormat, normalizeAudioFormatValue, normalizeAudioSpeedValue, normalizeAudioVoiceValue, speechAudioFormat, speechModelOf, speechVoiceOptions } from "@/lib/audio-generation";
import type { GenerationCost } from "@/lib/canvas/generation-cost";
import { recordRuntimeLog, truncateLogText } from "@/lib/runtime-log";
import { getMediaBlob, uploadMediaFile, type UploadedFile } from "@/services/file-storage";
import { buildApiUrl, resolveModelRequestConfig, resolveModelScript, type AiConfig, type ModelRequestConfig } from "@/stores/use-config-store";
import type { ReferenceAudio } from "@/types/media";
import { apiText, readAxiosError } from "./api-error";
import { fetchGenerationCost, readGenerationId } from "./image";
import { runModelPlugin } from "./model-plugin";

type RequestOptions = { signal?: AbortSignal };
type ChatAudio = { base64: string; cost?: number; error?: string };
type GeneratedAudio = { blob: Blob; cost?: GenerationCost };
function aiApiUrl(config: ModelRequestConfig, path: string) {
    return buildApiUrl(config.baseUrl, path);
}

function aiHeaders(config: ModelRequestConfig) {
    return {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
    };
}

export async function requestAudioGeneration(config: AiConfig, prompt: string, options?: RequestOptions, referenceAudios: ReferenceAudio[] = []): Promise<GeneratedAudio> {
    const requestConfig = resolveModelRequestConfig(config, config.model || config.audioModel || config.speechModel);
    const model = requestConfig.model.trim();
    const format = normalizeAudioFormatValue(config.audioFormat);
    const script = resolveModelScript(config, config.model || config.audioModel || config.speechModel);
    const endpoint = script ? "plugin" : isOpenRouterMusicModel(model) ? "music" : "speech";
    logAudioRequest(model, endpoint, format, prompt, config, referenceAudios);
    if (script) {
        if (!model) throw new Error(apiText("audioModelRequired"));
        if (!requestConfig.baseUrl.trim()) throw new Error(apiText("baseUrlRequired"));
        if (!requestConfig.apiKey.trim()) throw new Error(apiText("apiKeyRequired"));
        try {
            const result = await runModelPlugin({
                capability: "audio",
                script,
                config: requestConfig,
                prompt,
                params: { voice: normalizeAudioVoiceValue(config.audioVoice), format, speed: normalizeAudioSpeedValue(config.audioSpeed), instructions: config.audioInstructions.trim() },
                signal: options?.signal,
            });
            const blob = await audioPluginBlob(result, format);
            logAudioSuccess(blob);
            return { blob };
        } catch (error) {
            const message = readAxiosError(error, apiText("audioGenerationFailed"));
            logAudioError(message, error);
            throw new Error(message);
        }
    }
    assertAudioConfig(requestConfig, model);
    if (isOpenRouterMusicModel(model)) {
        return requestMusicGeneration(requestConfig, model, prompt, format, options?.signal);
    }
    const instructions = config.audioInstructions.trim();
    const speechModel = speechModelOf(model);
    const speechVoices = speechVoiceOptions(model);
    const voice = speechModel ? speechVoices.find((item) => item.value === config.audioVoice)?.value || speechVoices[0]?.value : normalizeAudioVoiceValue(config.audioVoice);
    const responseFormat = speechModel ? speechAudioFormat(format) : format;
    const inputReferences = speechModel ? await speechInputReferences(referenceAudios, options?.signal) : [];

    try {
        const response = await axios.post<Blob>(
            aiApiUrl(requestConfig, "/audio/speech"),
            {
                model,
                input: prompt,
                response_format: responseFormat,
                speed: Number(normalizeAudioSpeedValue(config.audioSpeed)),
                ...(voice ? { voice } : {}),
                ...(!speechModel && instructions ? { instructions } : {}),
                ...(inputReferences.length ? { input_references: inputReferences } : {}),
            },
            { headers: aiHeaders(requestConfig), responseType: "blob", signal: options?.signal },
        );
        await assertAudioBlob(response.data);
        const blob = response.data.type.startsWith("audio/") ? response.data : new Blob([response.data], { type: audioMimeType(responseFormat) });
        const cost = await lookupAudioCost(requestConfig, response.headers);
        logAudioSuccess(blob, cost?.usd);
        return { blob, cost };
    } catch (error) {
        const message = readAxiosError(error, apiText("audioGenerationFailed"));
        logAudioError(message, error);
        throw new Error(message);
    }
}

function logAudioRequest(model: string, endpoint: string, format: string, prompt: string, config: AiConfig, referenceAudios: ReferenceAudio[]) {
    recordRuntimeLog({
        category: "generation",
        action: "audio.generate",
        message: `model=${model || "(none)"} endpoint=${endpoint} format=${format}`,
        detail: `prompt: ${truncateLogText(prompt, 300)}\nconfig: ${JSON.stringify({ voice: config.audioVoice, speed: config.audioSpeed, instructions: config.audioInstructions, references: referenceAudios.length })}`,
    });
}

function logAudioSuccess(blob: Blob, cost?: number) {
    recordRuntimeLog({
        category: "generation",
        action: "audio.generate.success",
        message: `bytes=${blob.size}${cost != null && Number.isFinite(cost) ? ` cost=$${Number(cost).toFixed(6)}` : ""}`,
    });
}

function logAudioError(message: string, error: unknown, raw?: string) {
    recordRuntimeLog({
        level: "error",
        category: "generation",
        action: "audio.generate.error",
        message: truncateLogText(message, 300),
        detail: truncateLogText(redactBase64(raw || rawResponseOf(error))),
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

function redactBase64(text: string) {
    return text.replace(/[A-Za-z0-9+/]{120,}={0,2}/g, "…[base64 已省略]…");
}

function musicNoAudioMessage(raw: string, upstream: string) {
    const snippet = redactBase64(raw).slice(0, 300);
    if (!snippet && !upstream) return apiText("audioGenerationFailed");
    const reason = upstream || "未返回音频数据";
    return `${apiText("audioGenerationFailed")}：${reason}${snippet ? `。原始响应：${snippet}` : ""}`;
}

async function lookupAudioCost(config: ModelRequestConfig, headers: unknown): Promise<GenerationCost | undefined> {
    const generationId = readGenerationId(headers);
    if (!generationId) return undefined;
    const usd = await fetchGenerationCost(config, generationId);
    return usd === undefined ? undefined : { usd: Number(usd.toFixed(6)), priced: true, source: "lookup" };
}

async function requestMusicGeneration(config: ModelRequestConfig, model: string, prompt: string, format: string, signal?: AbortSignal): Promise<GeneratedAudio> {
    let raw = "";
    try {
        const response = await axios.post<string>(
            aiApiUrl(config, "/chat/completions"),
            {
                model,
                messages: [{ role: "user", content: prompt }],
                modalities: ["text", "audio"],
                audio: { format: musicAudioFormat(format) },
                stream: true,
            },
            { headers: aiHeaders(config), responseType: "text", transformResponse: [(data) => data], signal },
        );
        raw = typeof response.data === "string" ? response.data : "";
        const { base64, cost, error: upstream } = readChatAudio(raw);
        if (!base64) throw attachRawResponse(new Error(musicNoAudioMessage(raw, upstream || "")), raw);
        const blob = new Blob([base64AudioBytes(base64)], { type: audioMimeType(format) });
        logAudioSuccess(blob, cost);
        return { blob, cost: cost != null && Number.isFinite(cost) ? { usd: Number(cost.toFixed(6)), priced: true, source: "api" } : undefined };
    } catch (error) {
        const message = readAxiosError(error, apiText("audioGenerationFailed"));
        logAudioError(message, error, raw);
        throw new Error(message);
    }
}

async function speechInputReferences(audios: ReferenceAudio[], signal?: AbortSignal) {
    const audio = audios[0];
    if (!audio) return [];
    const stored = audio.storageKey ? await getMediaBlob(audio.storageKey) : null;
    const blob = stored || (audio.url ? await (await fetch(audio.url, { signal })).blob() : null);
    if (!blob || !blob.size) throw new Error(apiText("invalidReferenceAudio"));
    return [{ type: "input_audio" as const, input_audio: { data: await blobToDataUrl(blob), format: audioFormatFromMime(audio.type || blob.type) } }];
}

function blobToDataUrl(blob: Blob) {
    return new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = () => reject(new Error(apiText("invalidReferenceAudio")));
        reader.readAsDataURL(blob);
    });
}

function audioFormatFromMime(mimeType: string) {
    if (mimeType.includes("wav")) return "wav";
    if (mimeType.includes("flac")) return "flac";
    if (mimeType.includes("ogg")) return "ogg";
    if (mimeType.includes("m4a")) return "m4a";
    if (mimeType.includes("pcm")) return "pcm16";
    return "mp3";
}

function readChatAudio(payload: unknown): ChatAudio {
    if (typeof payload !== "string") return { base64: "" };
    const streamed = readStreamedAudio(payload);
    if (streamed.base64) return streamed;
    const message = readMessageAudio(payload);
    return { ...message, error: message.error || streamed.error };
}

function readStreamedAudio(payload: string): ChatAudio {
    const chunks: string[] = [];
    let cost: number | undefined;
    let error: string | undefined;
    for (const line of payload.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;
        const body = trimmed.slice(5).trim();
        if (!body || body === "[DONE]") continue;
        let parsed: {
            error?: { message?: string };
            choices?: Array<{ delta?: { audio?: { data?: string } }; error?: { message?: string }; finish_reason?: string }>;
            usage?: { cost?: number };
        };
        try {
            parsed = JSON.parse(body);
        } catch {
            continue;
        }
        if (parsed.error?.message) throw new Error(parsed.error.message);
        const choice = parsed.choices?.[0];
        if (choice?.error?.message) throw new Error(choice.error.message);
        if (choice?.finish_reason === "error" && !error) error = choice.error?.message || "finish_reason=error";
        if (parsed.usage?.cost != null && Number.isFinite(Number(parsed.usage.cost))) cost = Number(parsed.usage.cost);
        const chunk = choice?.delta?.audio?.data;
        if (chunk) chunks.push(chunk);
    }
    return { base64: chunks.join(""), cost, error };
}

function readMessageAudio(payload: string): ChatAudio {
    let parsed: {
        error?: { message?: string };
        choices?: Array<{ message?: { audio?: { data?: string } }; error?: { message?: string }; finish_reason?: string }>;
        usage?: { cost?: number };
        data?: string;
    };
    try {
        parsed = JSON.parse(payload);
    } catch {
        return { base64: "" };
    }
    if (parsed.error?.message) throw new Error(parsed.error.message);
    const choice = parsed.choices?.[0];
    if (choice?.error?.message) throw new Error(choice.error.message);
    const cost = Number(parsed.usage?.cost);
    return {
        base64: choice?.message?.audio?.data || (typeof parsed.data === "string" ? parsed.data : ""),
        cost: Number.isFinite(cost) ? cost : undefined,
        error: choice?.finish_reason === "error" ? "finish_reason=error" : undefined,
    };
}

function base64AudioBytes(base64: string) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return bytes;
}

async function audioPluginBlob(result: unknown, format: string): Promise<Blob> {
    if (result instanceof Blob) return result.type.startsWith("audio/") ? result : new Blob([result], { type: audioMimeType(format) });
    let source = "";
    if (typeof result === "string") source = result;
    else if (result && typeof result === "object") {
        const record = result as Record<string, unknown>;
        source = typeof record.b64_json === "string" ? record.b64_json : typeof record.data === "string" ? record.data : typeof record.url === "string" ? record.url : "";
    }
    if (!source) throw new Error(apiText("scriptNoAudio"));
    const url = source.startsWith("data:") || /^https?:/i.test(source) ? source : `data:${audioMimeType(format)};base64,${source}`;
    const blob = await (await fetch(url)).blob();
    return blob.type.startsWith("audio/") ? blob : new Blob([blob], { type: audioMimeType(format) });
}

export async function storeGeneratedAudio(blob: Blob, format = "mp3"): Promise<UploadedFile> {
    const audio = blob.type.startsWith("audio/") ? blob : new Blob([blob], { type: audioMimeType(format) });
    return uploadMediaFile(audio, "audio");
}

function assertAudioConfig(config: ModelRequestConfig, model: string) {
    if (!model) throw new Error(apiText("audioModelRequired"));
    if (!config.baseUrl.trim()) throw new Error(apiText("baseUrlRequired"));
    if (!config.apiKey.trim()) throw new Error(apiText("apiKeyRequired"));
}

async function assertAudioBlob(blob: Blob) {
    if (!blob.type.includes("json")) return;
    let text: string;
    try {
        text = await blob.text();
    } catch {
        return;
    }
    let payload: { code?: number; msg?: string; error?: { message?: string } };
    try {
        payload = JSON.parse(text) as { code?: number; msg?: string; error?: { message?: string } };
    } catch {
        return;
    }
    if (typeof payload.code === "number" && payload.code !== 0) throw attachRawResponse(new Error(payload.msg || apiText("audioGenerationFailed")), text);
    if (payload.error?.message) throw attachRawResponse(new Error(payload.error.message), text);
}
