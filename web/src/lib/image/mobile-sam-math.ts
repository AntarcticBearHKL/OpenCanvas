export const MOBILE_SAM_INPUT_SIZE = 1024;

export type SamPoint = { x: number; y: number; positive?: boolean };

export function samResizeScale(width: number, height: number, size = MOBILE_SAM_INPUT_SIZE): number {
    const longest = Math.max(width, height);
    return Number.isFinite(longest) && longest > 0 ? size / longest : 1;
}

export function samModelPoint(x: number, y: number, scale: number): [number, number] {
    return [x * scale, y * scale];
}

export function pickBestMaskIndex(iouPredictions: ArrayLike<number>): number {
    let best = 0;
    for (let index = 1; index < iouPredictions.length; index += 1) {
        if (iouPredictions[index] > iouPredictions[best]) best = index;
    }
    return best;
}

export function clampSamScore(value: number): number {
    if (!Number.isFinite(value)) return 0;
    return Math.min(1, Math.max(0, value));
}

export function binarizeMaskLogits(logits: ArrayLike<number>, threshold = 0): Uint8Array {
    const mask = new Uint8Array(logits.length);
    for (let index = 0; index < logits.length; index += 1) mask[index] = logits[index] > threshold ? 1 : 0;
    return mask;
}
