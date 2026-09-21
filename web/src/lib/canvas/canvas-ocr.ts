import i18n from "@/i18n";
import type { AiConfig } from "@/stores/use-config-store";
import { requestImageQuestion } from "@/services/api/image";
import { imageToDataUrl } from "@/services/image-storage";
import { buildNodeResponseMessages } from "@/components/canvas/canvas-node-generation";

export function ocrPrompt() {
    return i18n.t("canvas.projectPage.ocrPrompt");
}

export function normaliseOcrText(value: string) {
    const fenced = value.trim().match(/^```[^\n]*\n([\s\S]*?)\n?```$/);
    const body = fenced ? fenced[1] : value;
    return body
        .split("\n")
        .map((line) => line.replace(/\s+$/g, ""))
        .join("\n")
        .trim();
}

export async function extractImageText(config: AiConfig, image: { id: string; name: string; type: string; dataUrl: string; storageKey?: string }, options?: { signal?: AbortSignal }) {
    const dataUrl = await imageToDataUrl(image, options);
    const messages = buildNodeResponseMessages({
        prompt: ocrPrompt(),
        referenceImages: [{ id: image.id, name: image.name, type: image.type, dataUrl, storageKey: image.storageKey }],
        referenceVideos: [],
        referenceAudios: [],
        textCount: 0,
        imageCount: 1,
        videoCount: 0,
        audioCount: 0,
    });
    const text = normaliseOcrText(await requestImageQuestion(config, messages, () => {}, options));
    if (!text) throw new Error(i18n.t("canvas.imageTools.ocrEmpty"));
    return text;
}
