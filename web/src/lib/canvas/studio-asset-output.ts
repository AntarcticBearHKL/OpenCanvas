import { audioProjectAutomation, audioProjectClips, audioProjectMasterGain, audioProjectMidiRegions, audioProjectPpqn, audioProjectTempo } from "@/lib/canvas/audio-project";
import { encodeWavBlob, renderAudioMixdown } from "@/lib/canvas/audio-mixdown";
import { compositePixelFrameFile } from "@/lib/canvas/pixel/export";
import { composeSmartCanvas } from "@/lib/canvas/smart-canvas";
import { toFountain } from "@/lib/write/fountain";
import type { AudioProject } from "@/stores/use-audio-store";
import type { ImageProject } from "@/stores/use-image-store";
import type { PixelProject } from "@/stores/use-pixel-store";
import type { WriteProject } from "@/stores/use-writing-store";

export type StudioAssetKind = "image" | "audio" | "pixel" | "write";

export type StudioAssetProject = { id: string; title: string; groupId?: string | null };

export type StudioAssetOutput = { file: File; title: string };

const safeName = (title: string, fallback: string) => title.replace(/[\\/:*?"<>|]+/g, "_").trim() || fallback;

/** Renders one studio project's output into a File so the assets node can reuse the canvas insertion path. */
export async function renderStudioAssetOutput(kind: StudioAssetKind, project: StudioAssetProject, source: { image?: ImageProject; audio?: AudioProject; pixel?: PixelProject; write?: WriteProject }): Promise<StudioAssetOutput> {
    if (kind === "image") {
        if (!source.image) throw new Error("Image project not found");
        const composite = await composeSmartCanvas(source.image);
        if (!composite.dataUrl) throw new Error("Image render failed");
        const blob = await (await fetch(composite.dataUrl)).blob();
        const title = source.image.title || "Image Artwork";
        return { file: new File([blob], `${safeName(title, "image")}.png`, { type: "image/png" }), title };
    }
    if (kind === "audio") {
        if (!source.audio) throw new Error("Audio project not found");
        const audio = source.audio;
        const { audio: buffer } = await renderAudioMixdown({
            tracks: audio.tracks,
            clips: audioProjectClips(audio),
            regions: audioProjectMidiRegions(audio),
            ppqn: audioProjectPpqn(audio),
            tempo: audioProjectTempo(audio),
            masterGain: audioProjectMasterGain(audio),
            automation: audioProjectAutomation(audio),
        });
        const title = audio.title || "Audio Artwork";
        return { file: new File([encodeWavBlob(buffer)], `${safeName(title, "audio")}.wav`, { type: "audio/wav" }), title };
    }
    if (kind === "pixel") {
        if (!source.pixel) throw new Error("Pixel project not found");
        const title = source.pixel.title || "Pixel Artwork";
        const file = await compositePixelFrameFile(source.pixel.doc, source.pixel.doc.frames[0]?.id ?? "", `${safeName(title, "pixel")}.png`);
        return { file, title };
    }
    if (!source.write) throw new Error("Writing project not found");
    const title = source.write.title || "Writing Artwork";
    return { file: new File([toFountain(source.write)], `${safeName(title, "writing")}.fountain`, { type: "text/plain" }), title };
}
