import * as Tone from "tone";

import { buildAudioGraph } from "@/lib/canvas/audio-graph";
import { preloadSamplerBuffers } from "@/lib/canvas/audio-instruments";
import { AUDIO_DEFAULT_PPQN, instrumentPreset, ticksToSeconds } from "@/lib/canvas/audio-midi";
import { AUDIO_DEFAULT_TEMPO, canHostMidi, isVst3Instrument } from "@/lib/canvas/audio-project";
import { toMono } from "@/lib/canvas/audio-spectrum";
import { buildAudioPeaks, type AudioPeaks } from "@/lib/canvas/audio-waveform";
import type { CanvasAudioMidiRegion, CanvasAudioTrack } from "@/types/canvas";

/** One track's offline render: its waveform pyramid and mono PCM, keyed by the audio-affecting state. */
export type TrackAudio = { key: string; peaks: AudioPeaks; mono: Float32Array; sampleRate: number; duration: number };

const AUDIO_RENDER_DEBOUNCE_MS = 300;
const AUDIO_RENDER_TAIL_SECONDS = 1.5;
const MAX_TRACK_AUDIO_ENTRIES = 16;

const audioCache = new Map<string, TrackAudio>();
const inFlight = new Map<string, Promise<TrackAudio | null>>();
const latestKey = new Map<string, string>();
const quietWaiters = new Map<string, Promise<void>>();
const quietResolvers = new Map<string, () => void>();
const quietTimers = new Map<string, number>();
let renderChain: Promise<void> = Promise.resolve();

/** True for tracks the offline renderer can bounce: an instrument track with a built-in (non-VST3) synth. */
export function isRenderableTrack(track: CanvasAudioTrack): boolean {
    return canHostMidi(track) && !isVst3Instrument(track.instrument);
}

/** A zero or missing ppqn would divide by zero; both fall back to the project defaults so keys and timing stay finite. */
function normalizeTiming(ppqn: number, tempo: number) {
    return { ppqn: ppqn > 0 ? ppqn : AUDIO_DEFAULT_PPQN, tempo: tempo > 0 ? tempo : AUDIO_DEFAULT_TEMPO };
}

/**
 * Stable render signature: the track id and instrument, the timing, and only the audio-affecting region
 * fields (start, duration, and each note's tick/duration/pitch/velocity, order-independent). Region ids,
 * names and mixer state are deliberately absent, so UI-only edits never invalidate a render.
 */
export function trackAudioKey(track: CanvasAudioTrack, regions: CanvasAudioMidiRegion[], ppqn: number, tempo: number): string {
    const timing = normalizeTiming(ppqn, tempo);
    const instrument = track.instrument;
    const instrumentId = isVst3Instrument(instrument) ? instrument.pluginId : instrumentPreset(instrument?.preset).id;
    const parts = regions
        .filter((region) => region.trackId === track.id)
        .map((region) => {
            const notes = region.notes
                .map((note) => ({ tick: note.tick, durationTicks: note.durationTicks, pitch: note.pitch, velocity: note.velocity }))
                .sort((a, b) => a.tick - b.tick || a.durationTicks - b.durationTicks || a.pitch - b.pitch || a.velocity - b.velocity)
                .map((note) => `${note.tick},${note.durationTicks},${note.pitch},${note.velocity}`)
                .join(";");
            return `${region.startTicks}:${region.durationTicks}:${notes}`;
        })
        .sort();
    return `${track.id}~${instrumentId}~${timing.ppqn}~${timing.tempo}~${parts.join("|")}`;
}

/** Latest completed render for a track, refreshed to most-recent-use so a visible track survives eviction. */
export function getCachedTrackAudio(trackId: string): TrackAudio | null {
    const entry = audioCache.get(trackId);
    if (!entry) return null;
    audioCache.delete(trackId);
    audioCache.set(trackId, entry);
    return entry;
}

function cacheTrackAudio(trackId: string, audio: TrackAudio) {
    audioCache.delete(trackId);
    audioCache.set(trackId, audio);
    while (audioCache.size > MAX_TRACK_AUDIO_ENTRIES) {
        const oldest = audioCache.keys().next().value;
        if (oldest === undefined) return;
        audioCache.delete(oldest);
    }
}

/** Trailing debounce shared per track id: every waiter resolves after one quiet window, so rapid edits coalesce. */
function waitForQuiet(trackId: string): Promise<void> {
    let waiter = quietWaiters.get(trackId);
    if (!waiter) {
        waiter = new Promise<void>((resolve) => quietResolvers.set(trackId, () => resolve(undefined)));
        quietWaiters.set(trackId, waiter);
    }
    const timer = quietTimers.get(trackId);
    if (timer !== undefined) window.clearTimeout(timer);
    quietTimers.set(
        trackId,
        window.setTimeout(() => {
            quietTimers.delete(trackId);
            quietWaiters.delete(trackId);
            const resolve = quietResolvers.get(trackId);
            quietResolvers.delete(trackId);
            resolve?.();
        }, AUDIO_RENDER_DEBOUNCE_MS),
    );
    return waiter;
}

/** Single-file render queue: only one OfflineAudioContext is ever in flight, so tracks never stack. */
function enqueueRender(track: CanvasAudioTrack, trackRegions: CanvasAudioMidiRegion[], ppqn: number, tempo: number, key: string): Promise<TrackAudio | null> {
    const task = renderChain.then(() => {
        const cached = getCachedTrackAudio(track.id);
        // A newer request for this track superseded this key while it waited; drop the stale render.
        if (latestKey.get(track.id) !== key) return cached && cached.key === key ? cached : null;
        if (cached?.key === key) return cached;
        return renderTrack(track, trackRegions, ppqn, tempo, key);
    });
    renderChain = task.then(
        () => undefined,
        () => undefined,
    );
    return task;
}

async function renderTrack(track: CanvasAudioTrack, trackRegions: CanvasAudioMidiRegion[], ppqn: number, tempo: number, key: string): Promise<TrackAudio | null> {
    try {
        await preloadSamplerBuffers([instrumentPreset(track.instrument?.preset).id]);
        const end = trackRegions.reduce((max, region) => Math.max(max, ticksToSeconds(region.startTicks + region.durationTicks, ppqn, tempo)), 0);
        const masterTrack: CanvasAudioTrack = { id: "__render_master__", name: "", type: "master", gain: 1, mute: false, solo: false };
        // A dry, unrouted copy: unity gain and pan, no mute/solo/sends/output, so the bounce is the raw instrument.
        const dryTrack: CanvasAudioTrack = { ...track, gain: 1, pan: 0, mute: false, solo: false, output: undefined, sends: [] };
        const rendered = await Tone.Offline(() => {
            buildAudioGraph({ tracks: [dryTrack, masterTrack], clips: [], regions: trackRegions, ppqn, tempo, masterGain: 1, automation: [] }, new Map(), { mode: "offline" });
        }, end + AUDIO_RENDER_TAIL_SECONDS);
        const buffer = rendered.get();
        if (!buffer) return null;
        const audio: TrackAudio = { key, peaks: buildAudioPeaks(buffer), mono: toMono(buffer), sampleRate: buffer.sampleRate, duration: buffer.duration };
        cacheTrackAudio(track.id, audio);
        return audio;
    } catch {
        return null;
    }
}

/**
 * The arrangement's one entry point for a track's visualization data: rejects nothing, so a failed render
 * just leaves the previous visualization on screen. In-flight renders dedupe by key and run one at a time.
 */
export function requestTrackAudio(track: CanvasAudioTrack, regions: CanvasAudioMidiRegion[], ppqn: number, tempo: number): Promise<TrackAudio | null> {
    if (!isRenderableTrack(track)) return Promise.resolve(null);
    const timing = normalizeTiming(ppqn, tempo);
    const trackRegions = regions.filter((region) => region.trackId === track.id);
    const end = trackRegions.reduce((max, region) => Math.max(max, ticksToSeconds(region.startTicks + region.durationTicks, timing.ppqn, timing.tempo)), 0);
    if (!trackRegions.length || end <= 0) return Promise.resolve(null);
    const key = trackAudioKey(track, trackRegions, timing.ppqn, timing.tempo);
    latestKey.set(track.id, key);
    const cached = getCachedTrackAudio(track.id);
    if (cached?.key === key) return Promise.resolve(cached);
    const pending = inFlight.get(key);
    if (pending) return pending;
    const task = waitForQuiet(track.id)
        .then(() => enqueueRender(track, trackRegions, timing.ppqn, timing.tempo, key))
        .finally(() => {
            inFlight.delete(key);
        });
    inFlight.set(key, task);
    return task;
}
