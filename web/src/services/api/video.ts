import axios from "axios";
import { nanoid } from "nanoid";

import i18n from "@/i18n";
import { dataUrlToFile } from "@/lib/image-utils";
import { clampVideoSeconds, computeVideoSize, inferVideoRatio } from "@/lib/media-size";
import { isOpenRouterVideoModel, supportedVideoResolution, videoModelCapability, videoModelDuration, VIDEO_REFERENCE_SECONDS_MAX, VIDEO_REFERENCE_SECONDS_MIN, type VideoFrameReference, type VideoModelCapability } from "@/lib/video-generation";
import { getMediaBlob, resolveMediaUrl, uploadMediaFile, type UploadedFile } from "@/services/file-storage";
import { imageToDataUrl } from "@/services/image-storage";
import { boolConfig, buildApiUrl, modelOptionName, resolveModelRequestConfig, resolveModelScript, type AiConfig, type ModelRequestConfig } from "@/stores/use-config-store";
import { runModelPlugin } from "./model-plugin";
import type { ReferenceImage } from "@/types/image";
import type { ReferenceAudio, ReferenceVideo } from "@/types/media";

type VideoResponse = { id: string; status?: string; error?: { message?: string }; url?: string; result_url?: string; video_url?: string; content?: { video_url?: string; url?: string } | null };
type ApiVideoResponse = VideoResponse | { code?: number | string; data?: VideoResponse | null; msg?: string; message?: string; error?: { message?: string } };
type ApiEnvelope<T> = T | { code?: number | string; data?: T | null; msg?: string; message?: string; error?: { message?: string } };
type RequestOptions = { signal?: AbortSignal };
type VideoMediaOptions = RequestOptions & { videos?: ReferenceVideo[]; audios?: ReferenceAudio[]; frames?: VideoFrameReference[] };
type OpenRouterReferencePart = { type: "image_url"; image_url: { url: string } } | { type: "video_url"; video_url: { url: string } } | { type: "audio_url"; audio_url: { url: string } };
const apiText = (key: string, options?: Record<string, unknown>) => i18n.t(`apiErrors.${key}`, options);

const VIDEO_REFERENCE_MAX_BYTES = 50 * 1024 * 1024;
const AUDIO_REFERENCE_MAX_BYTES = 15 * 1024 * 1024;
const VIDEO_REFERENCE_REQUEST_MAX_BYTES = 64 * 1024 * 1024;

type VideoGenerationResult = { blob?: Blob; url?: string; mimeType?: string; cost?: number };
type VideoGenerationTask = { id: string; provider: "openai" | "plugin" | "openrouter"; model: string };
type VideoGenerationTaskState = { status: "pending" } | { status: "completed"; result: VideoGenerationResult } | { status: "failed"; error: string };
type OpenRouterVideoTaskResponse = { id?: string; polling_url?: string; error?: { message?: string } | string; message?: string };
type OpenRouterVideoPollResponse = { status?: string; unsigned_urls?: string[]; usage?: { cost?: number }; error?: { message?: string } | string; message?: string };

/** Results for scripted (plugin) video models, which run their own create+poll in one shot at task creation. */
const pluginVideoResults = new Map<string, VideoGenerationResult>();

/** OpenRouter returns a per-job polling URL; keep it until the job reaches a terminal state. */
const openRouterVideoPollUrls = new Map<string, string>();

function aiApiUrl(config: ModelRequestConfig, path: string) {
    return buildApiUrl(config.baseUrl, path);
}

function aiHeaders(config: ModelRequestConfig, contentType?: string) {
    return {
        Authorization: `Bearer ${config.apiKey}`,
        ...(contentType ? { "Content-Type": contentType } : {}),
    };
}

export async function requestVideoGeneration(config: AiConfig, prompt: string, references: ReferenceImage[] = [], options?: VideoMediaOptions): Promise<VideoGenerationResult> {
    return waitForVideoGenerationTask(config, await createVideoGenerationTask(config, prompt, references, options), options);
}

export async function waitForVideoGenerationTask(config: AiConfig, task: VideoGenerationTask, options?: RequestOptions): Promise<VideoGenerationResult> {
    for (let attempt = 0; attempt < 120; attempt += 1) {
        if (options?.signal?.aborted) throw new DOMException("Aborted", "AbortError");
        const state = await pollVideoGenerationTask(config, task, options);
        if (state.status === "completed") return state.result;
        if (state.status === "failed") throw videoTaskFailed(state.error);
        if (attempt === 119) throw new Error(apiText("videoTimeout", { provider: "" }));
        await delay(2500, options?.signal);
    }
    throw new Error(apiText("videoTimeout", { provider: "" }));
}

export function isVideoTaskFailed(error: unknown) {
    return error instanceof Error && error.name === "VideoTaskFailed";
}

function videoTaskFailed(message: string) {
    const error = new Error(message);
    error.name = "VideoTaskFailed";
    return error;
}

export async function createVideoGenerationTask(config: AiConfig, prompt: string, references: ReferenceImage[] = [], options?: VideoMediaOptions): Promise<VideoGenerationTask> {
    const selectedModel = (config.model || config.videoModel).trim();
    const requestConfig = resolveModelRequestConfig(config, selectedModel);
    const script = resolveModelScript(config, selectedModel);
    if (script) return createPluginVideoTask(requestConfig, selectedModel, script, prompt, references, options);
    if (isOpenRouterVideoModel(requestConfig.model)) return createOpenRouterVideoTask(requestConfig, selectedModel, prompt, references, options);
    assertVideoConfig(requestConfig, requestConfig.model);
    return createOpenAIVideoTask(requestConfig, selectedModel, prompt, references, options);
}

async function pollVideoGenerationTask(config: AiConfig, task: VideoGenerationTask, options?: RequestOptions): Promise<VideoGenerationTaskState> {
    if (task.provider === "plugin") {
        const result = pluginVideoResults.get(task.id);
        return result ? { status: "completed", result } : { status: "failed", error: apiText("pluginVideoExpired") };
    }
    const requestConfig = resolveModelRequestConfig(config, task.model);
    assertVideoConfig(requestConfig, requestConfig.model);
    if (task.provider === "openrouter") return pollOpenRouterVideoTask(requestConfig, task, options);
    return pollOpenAIVideoTask(requestConfig, task, options);
}

async function createPluginVideoTask(config: ModelRequestConfig, model: string, script: string, prompt: string, references: ReferenceImage[], options?: VideoMediaOptions): Promise<VideoGenerationTask> {
    if (!config.baseUrl.trim()) throw new Error(apiText("baseUrlRequired"));
    if (!config.apiKey.trim()) throw new Error(apiText("apiKeyRequired"));
    const refs = await Promise.all(references.map((image) => imageToDataUrl(image)));
    const videos = await Promise.all((options?.videos || []).map((video) => referenceMediaToFile(video, "ref.mp4", "invalidReferenceVideo", options)));
    const audios = await Promise.all((options?.audios || []).map((audio) => referenceMediaToFile(audio, "ref.mp3", "invalidReferenceAudio", options)));
    const result = videoPluginResult(
        await runModelPlugin({
            capability: "video",
            script,
            config,
            prompt,
            images: refs,
            videos,
            audios,
            params: {
                seconds: normalizeVideoSeconds(config.videoSeconds),
                size: normalizeVideoSize(config.size, config.vquality),
                resolution: normalizeVideoResolution(config.vquality),
                ratio: videoAspectRatio(config.size),
                generateAudio: boolConfig(config.videoGenerateAudio, true),
                watermark: boolConfig(config.videoWatermark, false),
                mode: resolveVideoMode(config.videoMode, refs.length),
            },
            signal: options?.signal,
        }),
    );
    const id = nanoid();
    pluginVideoResults.set(id, result);
    return { id, provider: "plugin", model };
}

function videoPluginResult(result: unknown): VideoGenerationResult {
    if (result instanceof Blob) return { blob: result };
    if (typeof result === "string") return { url: result, mimeType: "video/mp4" };
    if (result && typeof result === "object") {
        const record = result as Record<string, unknown>;
        if (record.blob instanceof Blob) return { blob: record.blob };
        const url = [record.url, record.video_url, record.result_url].find((value) => typeof value === "string" && value) as string | undefined;
        if (url) return { url, mimeType: "video/mp4" };
    }
    throw new Error(apiText("scriptNoVideo"));
}

export async function storeGeneratedVideo(result: VideoGenerationResult): Promise<UploadedFile> {
    if (result.blob) return uploadMediaFile(result.blob, "video");
    if (result.url) {
        try {
            return await uploadMediaFile(result.url, "video");
        } catch {
            return { url: result.url, storageKey: "", bytes: 0, mimeType: result.mimeType || "video/mp4" };
        }
    }
    throw new Error(apiText("noPlayableVideo"));
}

async function createOpenAIVideoTask(config: ModelRequestConfig, model: string, prompt: string, references: ReferenceImage[], options?: VideoMediaOptions): Promise<VideoGenerationTask> {
    const images = await Promise.all(references.map(async (image) => dataUrlToFile({ ...image, dataUrl: await imageToDataUrl(image) })));
    const videos = await Promise.all((options?.videos || []).map((video) => referenceMediaToFile(video, "ref.mp4", "invalidReferenceVideo", options)));
    const audios = await Promise.all((options?.audios || []).map((audio) => referenceMediaToFile(audio, "ref.mp3", "invalidReferenceAudio", options)));
    const mode = resolveVideoMode(config.videoMode, images.length);
    const body = new FormData();
    body.append("model", modelOptionName(model));
    body.append("prompt", prompt);
    body.append("seconds", normalizeVideoSeconds(config.videoSeconds));
    body.append("size", normalizeVideoSize(config.size, config.vquality) || "1280x720");
    body.append("resolution_name", normalizeVideoResolution(config.vquality));
    body.append("generate_audio", String(boolConfig(config.videoGenerateAudio, true)));
    body.append("watermark", String(boolConfig(config.videoWatermark, false)));
    body.append("mode", mode);
    if (mode === "frames") {
        if (images[0]) body.append("first_frame", images[0], "first.png");
        if (images[1]) body.append("last_frame", images[1], "last.png");
    } else {
        images.forEach((file) => body.append("image[]", file, "ref.png"));
    }
    videos.forEach((file) => body.append("video[]", file));
    audios.forEach((file) => body.append("audio[]", file));
    try {
        const created = unwrapVideoResponse((await axios.post<ApiVideoResponse>(aiApiUrl(config, "/videos"), body, { headers: aiHeaders(config), signal: options?.signal })).data);
        if (!created.id) throw new Error(apiText("noVideoTaskId"));
        return { id: created.id, provider: "openai", model };
    } catch (error) {
        throw new Error(readAxiosError(error, apiText("videoTaskCreateFailed")));
    }
}

async function pollOpenAIVideoTask(config: ModelRequestConfig, task: VideoGenerationTask, options?: RequestOptions): Promise<VideoGenerationTaskState> {
    try {
        const video = unwrapVideoResponse((await axios.get<ApiVideoResponse>(aiApiUrl(config, `/videos/${task.id}`), { headers: aiHeaders(config), signal: options?.signal })).data);
        const url = videoResultUrl(video);
        if (url) return { status: "completed", result: await videoResultFromUrl(url, options) };
        if (video.status === "completed") {
            const content = await axios.get<Blob>(aiApiUrl(config, `/videos/${task.id}/content`), { headers: aiHeaders(config), responseType: "blob", signal: options?.signal });
            await assertVideoBlob(content.data);
            return { status: "completed", result: { blob: content.data } };
        }
        if (video.status === "failed" || video.status === "cancelled") return { status: "failed", error: readApiErrorMessage(video.error?.message) || apiText("videoGenerationFailed") };
        return { status: "pending" };
    } catch (error) {
        throw new Error(readAxiosError(error, apiText("videoTaskQueryFailed")));
    }
}

async function videoResultFromUrl(url: string, options?: RequestOptions): Promise<VideoGenerationResult> {
    try {
        const response = await axios.get<Blob>(url, { responseType: "blob", signal: options?.signal });
        await assertVideoBlob(response.data);
        return { blob: response.data };
    } catch (error) {
        if (axios.isCancel(error) || options?.signal?.aborted) throw error;
        return { url, mimeType: "video/mp4" };
    }
}

async function createOpenRouterVideoTask(config: ModelRequestConfig, model: string, prompt: string, references: ReferenceImage[], options?: VideoMediaOptions): Promise<VideoGenerationTask> {
    assertVideoConfig(config, config.model);
    const capability = videoModelCapability(config.model);
    const images = await Promise.all(references.map((image) => imageToDataUrl(image)));
    const frames = options?.frames?.length ? options.frames : null;
    const mode = frames ? "frames" : resolveVideoMode(config.videoMode, images.length);
    const frameImages = mode === "frames" ? openRouterFrameImages(capability, frames, references, images) : [];
    const inputReferences = mode === "reference" ? await openRouterInputReferences(capability, references, images, options) : [];
    const body = {
        model: modelOptionName(model),
        prompt,
        duration: videoModelDuration(config.videoSeconds, capability),
        resolution: supportedVideoResolution(config.vquality, capability) || normalizeVideoResolution(config.vquality),
        aspect_ratio: videoAspectRatio(config.size),
        ...(frameImages.length ? { frame_images: frameImages } : {}),
        ...(inputReferences.length ? { input_references: inputReferences } : {}),
        ...(capability.supportsAudio ? { generate_audio: boolConfig(config.videoGenerateAudio, true) } : {}),
    };
    try {
        const created = (await axios.post<OpenRouterVideoTaskResponse>(aiApiUrl(config, "/videos"), body, { headers: aiHeaders(config, "application/json"), signal: options?.signal })).data;
        if (!created.id) throw new Error(apiText("noVideoTaskId"));
        if (created.polling_url) openRouterVideoPollUrls.set(created.id, created.polling_url);
        return { id: created.id, provider: "openrouter", model };
    } catch (error) {
        throw new Error(readAxiosError(error, apiText("videoTaskCreateFailed")));
    }
}

/** Frames keep the identity bound to their slot, so a lone last frame is never sent as the first frame. */
function openRouterFrameImages(capability: VideoModelCapability, frames: VideoFrameReference[] | null, references: ReferenceImage[], images: string[]) {
    if (!capability.frameImages.length) return [];
    const urlByNodeId = new Map(references.map((image, index) => [image.id, images[index]]));
    const entries = frames
        ? frames.flatMap((frame) => {
              const url = urlByNodeId.get(frame.nodeId);
              return url && capability.frameImages.includes(frame.frameType) ? [{ type: "image_url" as const, image_url: { url }, frame_type: frame.frameType }] : [];
          })
        : // Config-node video mode has no slot list, so keep the previous positional fallback.
          images.slice(0, 2).flatMap((url, index) => (capability.frameImages[index] ? [{ type: "image_url" as const, image_url: { url }, frame_type: capability.frameImages[index] }] : []));
    // Stale slot metadata may still hold both frames; a model that accepts one keyframe must never receive two.
    return entries.slice(0, capability.maxFrameImages);
}

async function openRouterInputReferences(capability: VideoModelCapability, references: ReferenceImage[], images: string[], options?: VideoMediaOptions): Promise<OpenRouterReferencePart[]> {
    const videos = options?.videos || [];
    const audios = options?.audios || [];
    const counts = { image: references.length, video: videos.length, audio: audios.length };
    for (const kind of ["image", "video", "audio"] as const) {
        if (counts[kind] && !capability.referenceKinds.includes(kind)) throw new Error(apiText("videoReferenceKindUnsupported", { kind: referenceKindLabel(kind) }));
    }
    if (counts.audio && !counts.image && !counts.video) throw new Error(apiText("audioReferenceNeedsVisual"));
    videos.forEach((video) => assertReferenceSeconds(video, "video"));
    audios.forEach((audio) => assertReferenceSeconds(audio, "audio"));
    const videoUrls = await Promise.all(videos.map((video) => referenceMediaDataUrl(video, VIDEO_REFERENCE_MAX_BYTES, "video", "invalidReferenceVideo")));
    const audioUrls = await Promise.all(audios.map((audio) => referenceMediaDataUrl(audio, AUDIO_REFERENCE_MAX_BYTES, "audio", "invalidReferenceAudio")));
    const parts: OpenRouterReferencePart[] = [];
    let requestBytes = 0;
    const append = (part: OpenRouterReferencePart, url: string) => {
        parts.push(part);
        requestBytes += url.length;
    };
    images.filter(Boolean).forEach((url) => append({ type: "image_url", image_url: { url } }, url));
    videoUrls.forEach((url) => append({ type: "video_url", video_url: { url } }, url));
    audioUrls.forEach((url) => append({ type: "audio_url", audio_url: { url } }, url));
    if (requestBytes > VIDEO_REFERENCE_REQUEST_MAX_BYTES) throw new Error(apiText("videoReferencesTooLarge"));
    return parts;
}

function referenceKindLabel(kind: "image" | "video" | "audio") {
    return i18n.t(`canvas.videoPrompt.kinds.${kind}`);
}

function assertReferenceSeconds(item: { name: string; durationMs?: number }, kind: "video" | "audio") {
    if (!item.durationMs) return;
    const seconds = item.durationMs / 1000;
    if (seconds < VIDEO_REFERENCE_SECONDS_MIN || seconds > VIDEO_REFERENCE_SECONDS_MAX) throw new Error(apiText("videoReferenceSeconds", { kind: referenceKindLabel(kind), name: item.name }));
}

async function referenceMediaDataUrl(item: ReferenceVideo | ReferenceAudio, maxBytes: number, kind: "video" | "audio", errorKey: "invalidReferenceVideo" | "invalidReferenceAudio") {
    let blob = item.storageKey ? await getMediaBlob(item.storageKey) : null;
    if (!blob && item.url) {
        try {
            blob = await (await fetch(item.url)).blob();
        } catch {
            blob = null;
        }
    }
    if (!blob?.size) throw new Error(apiText(errorKey));
    if (blob.size > maxBytes) throw new Error(apiText("videoReferenceTooLarge", { kind: referenceKindLabel(kind), name: item.name, limit: maxBytes / (1024 * 1024) }));
    return blobToDataUrl(blob, errorKey);
}

function blobToDataUrl(blob: Blob, errorKey: "invalidReferenceVideo" | "invalidReferenceAudio") {
    return new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = () => reject(new Error(apiText(errorKey)));
        reader.readAsDataURL(blob);
    });
}

async function pollOpenRouterVideoTask(config: ModelRequestConfig, task: VideoGenerationTask, options?: RequestOptions): Promise<VideoGenerationTaskState> {
    try {
        const video = (await axios.get<OpenRouterVideoPollResponse>(openRouterVideoPollUrl(config, task.id), { headers: aiHeaders(config), signal: options?.signal })).data;
        if (video.status === "completed") {
            openRouterVideoPollUrls.delete(task.id);
            return { status: "completed", result: await downloadOpenRouterVideo(config, task.id, video.unsigned_urls?.[0], video.usage?.cost, options) };
        }
        if (video.status === "failed" || video.status === "cancelled" || video.status === "expired") {
            openRouterVideoPollUrls.delete(task.id);
            return { status: "failed", error: readApiErrorMessage(video.error) || readApiErrorMessage(video.message) || apiText("videoGenerationFailed") };
        }
        return { status: "pending" };
    } catch (error) {
        throw new Error(readAxiosError(error, apiText("videoTaskQueryFailed")));
    }
}

async function downloadOpenRouterVideo(config: ModelRequestConfig, id: string, fallbackUrl: string | undefined, cost: number | undefined, options?: RequestOptions): Promise<VideoGenerationResult> {
    const result: VideoGenerationResult = {};
    if (Number.isFinite(cost)) result.cost = cost;
    let content: Blob;
    try {
        content = (await axios.get<Blob>(aiApiUrl(config, `/videos/${id}/content?index=0`), { headers: aiHeaders(config), responseType: "blob", signal: options?.signal })).data;
    } catch (error) {
        if (axios.isCancel(error) || options?.signal?.aborted) throw error;
        if (fallbackUrl) return { ...result, url: fallbackUrl, mimeType: "video/mp4" };
        throw new Error(readAxiosError(error, apiText("videoDownloadFailed")));
    }
    await assertVideoBlob(content);
    return { ...result, blob: content, mimeType: content.type || "video/mp4" };
}

function openRouterVideoPollUrl(config: ModelRequestConfig, id: string) {
    const pollingUrl = openRouterVideoPollUrls.get(id);
    if (!pollingUrl) return aiApiUrl(config, `/videos/${id}`);
    if (/^https?:\/\//i.test(pollingUrl)) return pollingUrl;
    return new URL(pollingUrl, aiApiUrl(config, "/")).toString();
}

function assertVideoConfig(config: ModelRequestConfig, model: string) {
    if (!model) throw new Error(apiText("videoModelRequired"));
    if (!config.baseUrl.trim()) throw new Error(apiText("baseUrlRequired"));
    if (!config.apiKey.trim()) throw new Error(apiText("apiKeyRequired"));
}

function videoAspectRatio(size: string) {
    const ratio = inferVideoRatio(size);
    return ratio === "auto" ? "16:9" : ratio;
}

async function referenceMediaToFile(item: { name: string; type?: string; url?: string; storageKey?: string }, fallbackName: string, errorKey: "invalidReferenceVideo" | "invalidReferenceAudio", options?: RequestOptions) {
    let blob = item.storageKey ? await getMediaBlob(item.storageKey) : null;
    if (!blob) {
        const url = item.storageKey ? await resolveMediaUrl(item.storageKey, item.url || "") : item.url || "";
        if (!url) throw new Error(apiText(errorKey));
        try {
            blob = await (await fetch(url, { signal: options?.signal })).blob();
        } catch (error) {
            if (error instanceof DOMException && error.name === "AbortError") throw error;
            throw new Error(apiText(errorKey));
        }
    }
    if (!blob.size) throw new Error(apiText(errorKey));
    return new File([blob], item.name || fallbackName, { type: item.type || blob.type || "application/octet-stream" });
}

function normalizeVideoSeconds(value: string) {
    return clampVideoSeconds(value);
}

function resolveVideoMode(mode: string | undefined, imageCount: number) {
    if (mode === "reference" || imageCount > 2) return "reference";
    return "frames";
}

function normalizeVideoSize(value: string, resolution?: string) {
    if (value === "auto") return null;
    if (/^\d+x\d+$/.test(value || "")) return value;
    const ratio = inferVideoRatio(value || "16:9");
    if (ratio === "auto") return null;
    return computeVideoSize(resolution || "720", ratio);
}

function normalizeVideoResolution(value: string) {
    if (value === "low") return "480p";
    if (value === "auto" || value === "high" || value === "medium") return "720p";
    const resolution = value.replace(/p$/i, "") || "720";
    return `${resolution}p`;
}

function unwrapVideoResponse(payload: ApiVideoResponse) {
    return unwrapEnvelope(payload, apiText("noVideoTask"));
}

function unwrapEnvelope<T>(payload: ApiEnvelope<T>, emptyMessage: string): T {
    if (!payload) throw new Error(emptyMessage);
    if (typeof payload === "object" && "code" in payload && payload.code !== undefined) {
        if (payload.code !== 0 && payload.code !== "0") throw new Error(readApiErrorMessage(payload) || apiText("requestFailed"));
        if (!payload.data) throw new Error(emptyMessage);
        return payload.data;
    }
    return payload as T;
}

function videoResultUrl(payload: VideoResponse) {
    return [payload.video_url, payload.result_url, payload.url, payload.content?.video_url, payload.content?.url].find((url) => typeof url === "string" && (isPublicMediaUrl(url) || /\.mp4(\?|#|$)/i.test(url)));
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
    // error may be a string or an object containing a message.
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
    if (axios.isAxiosError<{ error?: { message?: string }; msg?: string; message?: string; code?: number | string }>(error)) {
        if (!error.response && error.code === "ERR_NETWORK") return apiText("requestFailed");
        const responseData = error.response?.data;
        return readApiErrorMessage(responseData) || statusMessage(error.response?.status, fallback);
    }
    if (error instanceof DOMException && error.name === "AbortError") return apiText("requestCanceled");
    return error instanceof Error ? readApiErrorMessage(error.message) || error.message : fallback;
}

function statusMessage(status: number | undefined, fallback: string) {
    if (status === 401 || status === 403) return apiText("authenticationFailed");
    if (status === 429) return apiText("rateLimited");
    return status ? `${fallback}（${status}）` : fallback;
}

async function assertVideoBlob(blob: Blob) {
    if (!blob.type.includes("json")) return;
    let payload: { code?: number; msg?: string; error?: { message?: string } };
    try {
        payload = JSON.parse(await blob.text()) as { code?: number; msg?: string; error?: { message?: string } };
    } catch {
        return;
    }
    if (typeof payload.code === "number" && payload.code !== 0) throw new Error(readApiErrorMessage(payload) || apiText("videoDownloadFailed"));
    if (payload.error?.message) throw new Error(readApiErrorMessage(payload.error.message) || payload.error.message);
}

function isPublicMediaUrl(value: string) {
    return /^https?:\/\//i.test(value || "");
}

function delay(ms: number, signal?: AbortSignal) {
    return new Promise<void>((resolve, reject) => {
        if (signal?.aborted) {
            reject(new DOMException("Aborted", "AbortError"));
            return;
        }
        const timer = setTimeout(resolve, ms);
        signal?.addEventListener(
            "abort",
            () => {
                clearTimeout(timer);
                reject(new DOMException("Aborted", "AbortError"));
            },
            { once: true },
        );
    });
}
