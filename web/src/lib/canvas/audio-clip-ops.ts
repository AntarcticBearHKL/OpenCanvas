import { nanoid } from "nanoid";

import type { CanvasAudioClip } from "@/types/canvas";

export const AUDIO_MIN_CLIP_SECONDS = 0.01;

const EPSILON = 0.001;

export const clipEnd = (clip: CanvasAudioClip) => clip.start + clip.duration;

export function patchClip(clips: CanvasAudioClip[], clipId: string, patch: Partial<CanvasAudioClip>) {
    return clips.map((clip) => (clip.id === clipId ? { ...clip, ...patch } : clip));
}

export function moveClip(clips: CanvasAudioClip[], clipId: string, start: number, trackId: string) {
    return patchClip(clips, clipId, { start: Math.max(0, start), trackId });
}

/** A copy of the clip with a fresh id; used by duplicate and Alt+drag. */
export function duplicateClip(clip: CanvasAudioClip, start: number): CanvasAudioClip {
    return { ...clip, id: nanoid(), start: Math.max(0, start) };
}

/** Non-destructive trim of the left edge: start, offset and duration move together. */
export function trimClipIn(clips: CanvasAudioClip[], clipId: string, delta: number) {
    const clip = clips.find((item) => item.id === clipId);
    if (!clip) return clips;
    const applied = Math.min(clip.duration - AUDIO_MIN_CLIP_SECONDS, Math.max(Math.max(-clip.offset, -clip.start), delta));
    return patchClip(clips, clipId, { start: clip.start + applied, offset: clip.offset + applied, duration: clip.duration - applied });
}

export function trimClipOut(clips: CanvasAudioClip[], clipId: string, delta: number) {
    const clip = clips.find((item) => item.id === clipId);
    if (!clip) return clips;
    return patchClip(clips, clipId, { duration: Math.max(AUDIO_MIN_CLIP_SECONDS, clip.duration + delta) });
}

export function setClipFade(clips: CanvasAudioClip[], clipId: string, edge: "in" | "out", seconds: number) {
    const clip = clips.find((item) => item.id === clipId);
    if (!clip) return clips;
    const value = Math.min(clip.duration, Math.max(0, seconds));
    return patchClip(clips, clipId, edge === "in" ? { fadeIn: value } : { fadeOut: value });
}

/** Split at an absolute timeline position; the right half keeps reading the same source window. */
export function splitClip(clips: CanvasAudioClip[], clipId: string, time: number) {
    const clip = clips.find((item) => item.id === clipId);
    if (!clip) return null;
    const left = time - clip.start;
    const right = clip.duration - left;
    if (left <= AUDIO_MIN_CLIP_SECONDS || right <= AUDIO_MIN_CLIP_SECONDS) return null;
    const first: CanvasAudioClip = { ...clip, duration: left, fadeOut: Math.min(clip.fadeOut ?? 0, left) };
    const second: CanvasAudioClip = { ...clip, id: nanoid(), start: time, offset: clip.offset + left, duration: right, fadeIn: Math.min(clip.fadeIn ?? 0, right) };
    return clips.flatMap((item) => (item.id === clipId ? [first, second] : [item]));
}

export function clipsIntersecting(clips: CanvasAudioClip[], trackIds: string[] | null, from: number, to: number) {
    return clips.filter((clip) => (!trackIds || trackIds.includes(clip.trackId)) && clip.start < to && clipEnd(clip) > from);
}

export function shiftClips(clips: CanvasAudioClip[], clipIds: string[], deltaSeconds: number) {
    const ids = new Set(clipIds);
    return clips.map((clip) => (ids.has(clip.id) ? { ...clip, start: Math.max(0, clip.start + deltaSeconds) } : clip));
}

export function moveClipsToTrack(clips: CanvasAudioClip[], clipIds: string[], trackId: string) {
    const ids = new Set(clipIds);
    return clips.map((clip) => (ids.has(clip.id) ? { ...clip, trackId } : clip));
}

/** Auto-crossfade: complementary fades for every overlap on a lane. */
export function applyOverlap(clips: CanvasAudioClip[]) {
    const lanes = new Map<string, CanvasAudioClip[]>();
    clips.forEach((clip) => lanes.set(clip.trackId, [...(lanes.get(clip.trackId) ?? []), clip]));
    const fades = new Map<string, Partial<CanvasAudioClip>>();
    const fade = (id: string, patch: Partial<CanvasAudioClip>) => fades.set(id, { ...(fades.get(id) ?? {}), ...patch });
    lanes.forEach((lane) => {
        const sorted = [...lane].sort((a, b) => a.start - b.start);
        sorted.forEach((clip, index) => {
            const next = sorted[index + 1];
            if (!next) return;
            const overlap = clipEnd(clip) - next.start;
            if (overlap <= 0) return;
            fade(clip.id, { fadeOut: Math.min(overlap, clip.duration) });
            fade(next.id, { fadeIn: Math.min(overlap, next.duration) });
        });
    });
    if (!fades.size) return clips;
    return clips.map((clip) => (fades.has(clip.id) ? { ...clip, ...fades.get(clip.id) } : clip));
}

/** A recorded take replaces what covers its range: overlapped clips are trimmed to the take's edges and the covered middle is dropped. */
export function replaceClipRange(clips: CanvasAudioClip[], trackId: string, start: number, end: number) {
    let next = clips;
    next
        .filter((clip) => clip.trackId === trackId && clip.start < start && clipEnd(clip) > start)
        .forEach((clip) => {
            next = trimClipOut(next, clip.id, start - clipEnd(clip));
        });
    next
        .filter((clip) => clip.trackId === trackId && clip.start < end && clipEnd(clip) > end)
        .forEach((clip) => {
            next = trimClipIn(next, clip.id, end - clip.start);
        });
    return next.filter((clip) => !(clip.trackId === trackId && clip.start >= start - EPSILON && clipEnd(clip) <= end + EPSILON));
}

/** Merge a clip with the next clip on its lane when both are the same source read back-to-back. */
export function glueClip(clips: CanvasAudioClip[], clipId: string) {
    const clip = clips.find((item) => item.id === clipId);
    if (!clip) return null;
    const next = clips
        .filter((item) => item.trackId === clip.trackId && item.id !== clip.id && item.start > clip.start && Math.abs(item.start - clipEnd(clip)) < EPSILON && item.sourceNodeId === clip.sourceNodeId && Math.abs(item.offset - (clip.offset + clip.duration)) < EPSILON)
        .sort((a, b) => a.start - b.start)[0];
    if (!next) return null;
    return clips.flatMap((item) => (item.id === clip.id ? [{ ...clip, duration: clip.duration + next.duration, fadeOut: next.fadeOut ?? clip.fadeOut }] : item.id === next.id ? [] : [item]));
}

/** Force a crossfade across the join of the selected clip and the next clip on its lane. */
export function crossfadeClip(clips: CanvasAudioClip[], clipId: string) {
    const clip = clips.find((item) => item.id === clipId);
    if (!clip) return null;
    const next = clips
        .filter((item) => item.trackId === clip.trackId && item.id !== clip.id && item.start >= clip.start)
        .sort((a, b) => a.start - b.start)[0];
    if (!next) return null;
    const overlap = clipEnd(clip) - next.start;
    if (overlap <= 0) return null;
    const fades = new Map<string, Partial<CanvasAudioClip>>([
        [clip.id, { fadeOut: Math.min(overlap, clip.duration) }],
        [next.id, { fadeIn: Math.min(overlap, next.duration) }],
    ]);
    return clips.map((item) => (fades.has(item.id) ? { ...item, ...fades.get(item.id) } : item));
}
