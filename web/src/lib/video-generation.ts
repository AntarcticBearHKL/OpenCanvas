import { clampVideoSeconds, parseVideoResolution, VIDEO_SECONDS_MAX, VIDEO_SECONDS_MIN } from "@/lib/media-size";

type VideoMode = "frames" | "reference";

export type VideoReferenceKind = "image" | "video" | "audio";

/** Frame slot binding carried with its explicit identity so an empty slot never shifts the other frame. */
export type VideoFrameReference = { nodeId: string; frameType: "first_frame" | "last_frame" };

export function normalizeVideoMode(value: string | undefined): VideoMode {
    return value === "reference" ? "reference" : "frames";
}

export type VideoModelCapability = {
    resolutions: string[];
    durationMin: number;
    durationMax: number;
    aspectRatios: string[];
    supportsSize: boolean;
    supportsAudio: boolean;
    supportsWatermark: boolean;
    supportsSeed: boolean;
    frameImages: Array<"first_frame" | "last_frame">;
    maxFrameImages: number;
    inputReferences: boolean;
    referenceKinds: VideoReferenceKind[];
};

type VideoModelOption = { value: string; label: string; capability: VideoModelCapability };

/** Native MiniMax reference limits: at most 9 images, 3 videos, 3 audio clips and 12 mixed. */
export const VIDEO_REFERENCE_LIMITS: Record<VideoReferenceKind, number> = { image: 9, video: 3, audio: 3 };
export const VIDEO_REFERENCE_TOTAL_LIMIT = 12;
export const VIDEO_REFERENCE_SECONDS_MIN = 2;
export const VIDEO_REFERENCE_SECONDS_MAX = 15;

export const openRouterVideoModels: VideoModelOption[] = [
    {
        value: "minimax/hailuo-3-max",
        label: "MiniMax: H3 Max",
        capability: {
            resolutions: ["480p", "768p"],
            durationMin: 5,
            durationMax: 15,
            aspectRatios: ["21:9", "16:9", "4:3", "1:1", "3:4", "9:16"],
            supportsSize: false,
            supportsAudio: false,
            supportsWatermark: false,
            supportsSeed: false,
            frameImages: ["first_frame", "last_frame"],
            maxFrameImages: 1,
            inputReferences: true,
            referenceKinds: ["image", "video", "audio"],
        },
    },
    {
        value: "minimax/hailuo-3",
        label: "MiniMax: H3",
        capability: {
            resolutions: ["2K"],
            durationMin: 5,
            durationMax: 15,
            aspectRatios: ["21:9", "16:9", "4:3", "1:1", "3:4", "9:16"],
            supportsSize: false,
            supportsAudio: true,
            supportsWatermark: false,
            supportsSeed: false,
            frameImages: ["first_frame", "last_frame"],
            maxFrameImages: 1,
            inputReferences: true,
            referenceKinds: ["image", "video", "audio"],
        },
    },
];

/** Permissive fallback that keeps plugin and legacy video models behaving as before. */
const fallbackVideoModelCapability: VideoModelCapability = {
    resolutions: [],
    durationMin: VIDEO_SECONDS_MIN,
    durationMax: VIDEO_SECONDS_MAX,
    aspectRatios: [],
    supportsSize: true,
    supportsAudio: true,
    supportsWatermark: true,
    supportsSeed: true,
    frameImages: ["first_frame", "last_frame"],
    maxFrameImages: 2,
    inputReferences: true,
    referenceKinds: ["image", "video", "audio"],
};

function openRouterVideoModelOf(value: string | undefined) {
    return openRouterVideoModels.find((model) => model.value === value);
}

export function isOpenRouterVideoModel(value: string | undefined): value is string {
    return openRouterVideoModels.some((model) => model.value === value);
}

export function openRouterVideoModelCapability(value: string | undefined): VideoModelCapability | undefined {
    return openRouterVideoModelOf(value)?.capability;
}

export function videoModelCapability(value: string | undefined): VideoModelCapability {
    return openRouterVideoModelCapability(value) || fallbackVideoModelCapability;
}

export function videoFrameImageLimit(value: string | undefined): number {
    return videoModelCapability(value).maxFrameImages;
}

/** Compare resolutions by their pixel tier so letter tiers such as 2K match and round-trip exactly. */
function videoResolutionRank(value: string | undefined) {
    return Number(parseVideoResolution(value)) || 720;
}

/** Map a stored resolution to one the capability accepts, falling back to the closest supported value. */
export function supportedVideoResolution(value: string | undefined, capability: VideoModelCapability): string | undefined {
    if (!capability.resolutions.length) return undefined;
    const current = videoResolutionRank(value);
    const exact = capability.resolutions.find((item) => videoResolutionRank(item) === current);
    if (exact) return exact;
    return capability.resolutions.reduce((best, item) => (Math.abs(videoResolutionRank(item) - current) < Math.abs(videoResolutionRank(best) - current) ? item : best), capability.resolutions[0]);
}

export function videoModelDuration(value: string | undefined, capability: VideoModelCapability) {
    return Number(clampVideoSeconds(value || "6", capability.durationMin, capability.durationMax));
}
