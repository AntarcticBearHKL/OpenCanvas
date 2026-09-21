import axios from "axios";

import i18n from "@/i18n";
import { audioMimeType, isOpenRouterMusicModel, musicAudioFormat, normalizeAudioFormatValue, normalizeAudioSpeedValue, normalizeAudioVoiceValue, speechAudioFormat, speechModelOf, speechVoiceOptions } from "@/lib/audio-generation";
import type { GenerationCost } from "@/lib/canvas/generation-cost";
import { getMediaBlob, uploadMediaFile, type UploadedFile } from "@/services/file-storage";
import { buildApiUrl, resolveModelRequestConfig, resolveModelScript, type AiConfig } from "@/stores/use-config-store";
import type { ReferenceAudio } from "@/types/media";
import { fetchGenerationCost, readGenerationId } from "./image";
import { runModelPlugin } from "./model-plugin";

type RequestOptions = { signal?: AbortSignal };
type ChatAudio = { base64: string; cost?: number };
type GeneratedAudio = { blob: Blob; cost?: GenerationCost };
const apiText = (key: string, options?: Record<string, unknown>) => i18n.t(`apiErrors.${key}`, options);

function aiApiUrl(config: AiConfig, path: string) {
    return buildApiUrl(config.baseUrl, path);
}

function aiHeaders(config: AiConfig) {
    return {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
    };
}

export async function requestAudioGeneration(config: AiConfig, prompt: string, options?: RequestOptions, referenceAudios: ReferenceAudio[] = []): Promise<GeneratedAudio> {
    const requestConfig = resolveModelRequestConfig(config, config.model || config.audioModel);
    const model = requestConfig.model.trim();
    const format = normalizeAudioFormatValue(config.audioFormat);
    const script = resolveModelScript(config, config.model || config.audioModel);
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
            return { blob: await audioPluginBlob(result, format) };
        } catch (error) {
            throw new Error(readAxiosError(error, apiText("audioGenerationFailed")));
        }
    }
    assertAudioConfig(requestConfig, model);
    if (isOpenRouterMusicModel(model)) {
        try {
            return await requestMusicGeneration(requestConfig, model, prompt, format, options?.signal);
        } catch (error) {
            throw new Error(readAxiosError(error, apiText("audioGenerationFailed")));
        }
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
        return { blob, cost: await lookupAudioCost(requestConfig, response.headers) };
    } catch (error) {
        throw new Error(readAxiosError(error, apiText("audioGenerationFailed")));
    }
}

async function lookupAudioCost(config: AiConfig, headers: unknown): Promise<GenerationCost | undefined> {
    const generationId = readGenerationId(headers);
    if (!generationId) return undefined;
    const usd = await fetchGenerationCost(config, generationId);
    return usd === undefined ? undefined : { usd: Number(usd.toFixed(6)), priced: true, source: "lookup" };
}

async function requestMusicGeneration(config: AiConfig, model: string, prompt: string, format: string, signal?: AbortSignal): Promise<GeneratedAudio> {
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
    const { base64, cost } = readChatAudio(response.data);
    if (!base64) throw new Error(apiText("audioGenerationFailed"));
    return { blob: new Blob([base64AudioBytes(base64)], { type: audioMimeType(format) }), cost: cost != null && Number.isFinite(cost) ? { usd: Number(cost.toFixed(6)), priced: true, source: "api" } : undefined };
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
    return streamed.base64 ? streamed : readMessageAudio(payload);
}

function readStreamedAudio(payload: string): ChatAudio {
    const chunks: string[] = [];
    let cost: number | undefined;
    for (const line of payload.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;
        const body = trimmed.slice(5).trim();
        if (!body || body === "[DONE]") continue;
        let parsed: { error?: { message?: string }; choices?: Array<{ delta?: { audio?: { data?: string } } }>; usage?: { cost?: number } };
        try {
            parsed = JSON.parse(body);
        } catch {
            continue;
        }
        if (parsed.error?.message) throw new Error(parsed.error.message);
        if (parsed.usage?.cost != null && Number.isFinite(Number(parsed.usage.cost))) cost = Number(parsed.usage.cost);
        const chunk = parsed.choices?.[0]?.delta?.audio?.data;
        if (chunk) chunks.push(chunk);
    }
    return { base64: chunks.join(""), cost };
}

function readMessageAudio(payload: string): ChatAudio {
    let parsed: { error?: { message?: string }; choices?: Array<{ message?: { audio?: { data?: string } } }>; usage?: { cost?: number }; data?: string };
    try {
        parsed = JSON.parse(payload);
    } catch {
        return { base64: "" };
    }
    if (parsed.error?.message) throw new Error(parsed.error.message);
    const cost = Number(parsed.usage?.cost);
    return { base64: parsed.choices?.[0]?.message?.audio?.data || (typeof parsed.data === "string" ? parsed.data : ""), cost: Number.isFinite(cost) ? cost : undefined };
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

function assertAudioConfig(config: AiConfig, model: string) {
    if (!model) throw new Error(apiText("audioModelRequired"));
    if (!config.baseUrl.trim()) throw new Error(apiText("baseUrlRequired"));
    if (!config.apiKey.trim()) throw new Error(apiText("apiKeyRequired"));
}

async function assertAudioBlob(blob: Blob) {
    if (!blob.type.includes("json")) return;
    let payload: { code?: number; msg?: string; error?: { message?: string } };
    try {
        payload = JSON.parse(await blob.text()) as { code?: number; msg?: string; error?: { message?: string } };
    } catch {
        return;
    }
    if (typeof payload.code === "number" && payload.code !== 0) throw new Error(payload.msg || apiText("audioGenerationFailed"));
    if (payload.error?.message) throw new Error(payload.error.message);
}

function readApiErrorMessage(value: unknown): string {
    if (!value) return "";
    if (typeof value === "string") {
        try {
            const parsed = JSON.parse(value);
            const inner = readApiErrorMessage(parsed) || value;
            if (inner === value && typeof parsed === "object" && Object.keys(parsed).length === 0) return "";
            return inner;
        } catch {
            if (/<[a-z][\s\S]*>/i.test(value)) return apiText("htmlError", { preview: `${value.slice(0, 80)}...` });
            return value;
        }
    }
    if (typeof value !== "object") return "";
    const payload = value as { msg?: unknown; message?: unknown; error?: unknown; detail?: unknown };
    const errorMsg =
        typeof payload.error === "string"
            ? payload.error
            : (payload.error as { message?: unknown })?.message;
    return (
        readApiErrorMessage(payload.msg) ||
        readApiErrorMessage(payload.message) ||
        readApiErrorMessage(errorMsg) ||
        readApiErrorMessage(payload.detail) ||
        ""
    );
}

function readAxiosError(error: unknown, fallback: string) {
    if (axios.isCancel(error)) return apiText("requestCanceled");
    if (axios.isAxiosError(error)) {
        if (!error.response && error.code === "ERR_NETWORK") return apiText("requestFailed");
        const responseData = error.response?.data;
        const apiMsg = readApiErrorMessage(responseData);
        if (apiMsg) return apiMsg;
        const statusMsg = statusMessage(error.response?.status, fallback);
        if (statusMsg) return statusMsg;
        return error.message || fallback;
    }
    if (error instanceof DOMException && error.name === "AbortError") return apiText("requestCanceled");
    return error instanceof Error ? readApiErrorMessage(error.message) || error.message : fallback;
}

function statusMessage(status: number | undefined, fallback: string) {
    if (status === 401 || status === 403) return apiText("authenticationFailed");
    if (status === 429) return apiText("rateLimited");
    if (status === 404) return apiText("notFound");
    if (status === 502) return apiText("badGateway");
    if (status === 503) return apiText("serviceBusy");
    return status ? apiText("httpFailed", { status }) : fallback;
}
