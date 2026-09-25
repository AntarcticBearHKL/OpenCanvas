import { nanoid } from "nanoid";

import { AUDIO_DEFAULT_INSTRUMENT_PRESET, AUDIO_DEFAULT_PPQN, clampPpqn, midiRegionEnd } from "@/lib/canvas/audio-midi";
import { resolveMediaUrl } from "@/services/file-storage";
import {
    CanvasNodeType,
    type CanvasAudioCapture,
    type CanvasAudioClip,
    type CanvasAudioInstrument,
    type CanvasAudioMarker,
    type CanvasAudioMidiRegion,
    type CanvasAudioSend,
    type CanvasAudioSnap,
    type CanvasAudioTrack,
    type CanvasAudioTrackType,
    type CanvasAudioVst3Instrument,
    type CanvasNodeData,
} from "@/types/canvas";

export const AUDIO_DEFAULT_TEMPO = 120;
export const AUDIO_DEFAULT_METER = { numerator: 4, denominator: 4 };
export const AUDIO_DEFAULT_GRID: { enabled: boolean; snap: CanvasAudioSnap } = { enabled: true, snap: "beat" };
export const AUDIO_DEFAULT_CYCLE = { enabled: false, start: 0, end: 0 };
export const AUDIO_DEFAULT_PUNCH = { enabled: false, in: 0, out: 0 };
export const AUDIO_DEFAULT_METRONOME = { enabled: false, volumeDb: -6 };
export const AUDIO_DEFAULT_CAPTURE: CanvasAudioCapture = { mode: "normal", channels: 2, gainDb: 0, inputLatencyMs: 0 };
const AUDIO_CLIP_FALLBACK_SECONDS = 5;
export function audioProjectTracks(node: CanvasNodeData) {
    return node.metadata?.audioTracks ?? [];
}

export function audioProjectClips(node: CanvasNodeData) {
    return node.metadata?.audioClips ?? [];
}

export function audioProjectMasterGain(node: CanvasNodeData) {
    return clampGain(node.metadata?.audioMasterGain ?? 1);
}

export function audioProjectTempo(node: CanvasNodeData) {
    const tempo = node.metadata?.audioTempo;
    return tempo && tempo > 0 ? tempo : AUDIO_DEFAULT_TEMPO;
}

export function audioProjectTimeSignature(node: CanvasNodeData) {
    return node.metadata?.audioTimeSignature ?? AUDIO_DEFAULT_METER;
}

export function audioProjectGrid(node: CanvasNodeData) {
    return node.metadata?.audioGrid ?? AUDIO_DEFAULT_GRID;
}

export function audioProjectCycle(node: CanvasNodeData) {
    return node.metadata?.audioCycle ?? AUDIO_DEFAULT_CYCLE;
}

export function audioProjectPunch(node: CanvasNodeData) {
    return node.metadata?.audioPunch ?? AUDIO_DEFAULT_PUNCH;
}

export function audioProjectMarkers(node: CanvasNodeData) {
    return node.metadata?.audioMarkers ?? [];
}

export function audioProjectMetronome(node: CanvasNodeData) {
    return node.metadata?.audioMetronome ?? AUDIO_DEFAULT_METRONOME;
}

export function audioProjectAutomation(node: CanvasNodeData) {
    return node.metadata?.audioAutomation ?? [];
}

export function audioProjectMidiRegions(node: CanvasNodeData) {
    return node.metadata?.audioMidiRegions ?? [];
}

export function audioProjectPpqn(node: CanvasNodeData) {
    return clampPpqn(node.metadata?.audioPpqn);
}

/** Capture settings are clamped on read: the document is user-editable metadata, so a stray value never reaches the recorder. */
export function audioProjectCapture(node: CanvasNodeData) {
    const capture = { ...AUDIO_DEFAULT_CAPTURE, ...node.metadata?.audioCapture };
    return {
        mode: capture.mode === "punch" ? ("punch" as const) : ("normal" as const),
        channels: capture.channels === 1 ? 1 : 2,
        gainDb: Math.min(24, Math.max(-24, Number.isFinite(capture.gainDb) ? capture.gainDb : 0)),
        inputLatencyMs: Math.min(500, Math.max(0, Number.isFinite(capture.inputLatencyMs) ? capture.inputLatencyMs : 0)),
    };
}

export function audioProjectCountIn(node: CanvasNodeData) {
    return Math.min(4, Math.max(0, Math.round(node.metadata?.audioCountIn ?? 0)));
}

/** Duration is defined by the last clip or MIDI region end. */
export function audioProjectDuration(clips: CanvasAudioClip[], regions: CanvasAudioMidiRegion[] = [], ppqn = AUDIO_DEFAULT_PPQN, tempo = AUDIO_DEFAULT_TEMPO) {
    const clipEnd = clips.reduce((end, clip) => Math.max(end, clip.start + clip.duration), 0);
    return regions.reduce((end, region) => Math.max(end, midiRegionEnd(region, ppqn, tempo)), clipEnd);
}

export function audioTrackClips(clips: CanvasAudioClip[], trackId: string) {
    return clips.filter((clip) => clip.trackId === trackId);
}

/** Where a new clip lands: right after the last clip on that track. */
export function nextClipStart(clips: CanvasAudioClip[], trackId: string) {
    const last = audioTrackClips(clips, trackId).sort((a, b) => a.start - b.start).at(-1);
    return last ? last.start + last.duration : 0;
}

export function createAudioTrack(type: CanvasAudioTrackType = "audio"): CanvasAudioTrack {
    const track: CanvasAudioTrack = { id: nanoid(), name: "", type, gain: 1, pan: 0, mute: false, solo: false };
    if (type === "instrument") track.instrument = { kind: "synth", preset: AUDIO_DEFAULT_INSTRUMENT_PRESET };
    return track;
}

export function createAudioSend(targetTrackId: string): CanvasAudioSend {
    return { id: nanoid(), targetTrackId, gain: 1, pre: true, enabled: true };
}

export function audioTrackType(track: CanvasAudioTrack): CanvasAudioTrackType {
    return track.type ?? "audio";
}

/** Only plain audio lanes carry clips; group, return and master strips are routing only. */
export function canHostClips(track: CanvasAudioTrack) {
    return audioTrackType(track) === "audio";
}

/** Instrument and MIDI tracks carry MIDI regions; each plays through its built-in synth or, for the vst3 variant, the native bridge. */
export function canHostMidi(track: CanvasAudioTrack) {
    const type = audioTrackType(track);
    return type === "instrument" || type === "midi";
}

/** True when the instrument is the native VST3 variant, which the shared graph builder hosts over the bridge instead of a synth. */
export function isVst3Instrument(instrument?: CanvasAudioInstrument): instrument is CanvasAudioVst3Instrument {
    return instrument?.kind === "vst3";
}

export function audioMasterTrackId(tracks: CanvasAudioTrack[]) {
    return tracks.find((track) => audioTrackType(track) === "master")?.id ?? "";
}

export function audioReturnTracks(tracks: CanvasAudioTrack[]) {
    return tracks.filter((track) => audioTrackType(track) === "return");
}

/** Resolved output target: the track's own `output` when it still exists, otherwise the master track. */
export function audioTrackOutputId(tracks: CanvasAudioTrack[], track: CanvasAudioTrack) {
    const target = track.output && track.output !== track.id && tracks.some((item) => item.id === track.output) ? track.output : audioMasterTrackId(tracks);
    return target && target !== track.id ? target : "";
}

/** True when feeding `toId` back into `fromId` would close a routing cycle (a track into itself counts). */
export function audioRoutingCycle(tracks: CanvasAudioTrack[], fromId: string, toId: string) {
    if (!toId || fromId === toId) return true;
    const seen = new Set<string>();
    let current = tracks.find((track) => track.id === toId);
    while (current && !seen.has(current.id)) {
        seen.add(current.id);
        const next = audioTrackOutputId(tracks, current);
        if (!next) return false;
        if (next === fromId) return true;
        current = tracks.find((track) => track.id === next);
    }
    return false;
}

/**
 * Source tracks a stem render of `stem` has to include: a track that hosts clips or MIDI is its own stem,
 * a group sums every track whose output chain lands on it, and the routing itself is kept intact so the stem
 * plays through the same strips it plays through. Returns null for the master (it is the mixdown), and for a
 * return, whose wet signal cannot be isolated from the dry path of the tracks sending into it.
 */
export function audioStemSourceIds(tracks: CanvasAudioTrack[], stem: CanvasAudioTrack) {
    const type = audioTrackType(stem);
    if (type === "master" || type === "return") return null;
    if (canHostClips(stem) || canHostMidi(stem)) return new Set([stem.id]);
    const reaches = (track: CanvasAudioTrack) => {
        const seen = new Set<string>();
        let current: CanvasAudioTrack | undefined = track;
        while (current && !seen.has(current.id)) {
            if (current.id === stem.id) return true;
            seen.add(current.id);
            const next = audioTrackOutputId(tracks, current);
            current = next ? tracks.find((item) => item.id === next) : undefined;
        }
        return (track.sends ?? []).some((send) => send.enabled && send.targetTrackId === stem.id);
    };
    return new Set(tracks.filter((track) => track.id !== stem.id && reaches(track)).map((track) => track.id));
}



export function createAudioMarker(time: number, name = ""): CanvasAudioMarker {
    return { id: nanoid(), time: Math.max(0, time), name };
}

function resolveAudioNodeUrl(node: CanvasNodeData | undefined) {
    return resolveMediaUrl(node?.metadata?.storageKey, node?.metadata?.content || "");
}

/** Resolve every clip source to a playable URL; a missing or unreadable node yields an empty string. */
export async function resolveAudioClipUrls(clips: CanvasAudioClip[], nodes: CanvasNodeData[]) {
    const ids = Array.from(new Set(clips.map((clip) => clip.sourceNodeId)));
    const entries = await Promise.all(
        ids.map(async (id) => {
            const node = nodes.find((item) => item.id === id);
            return [id, node?.type === CanvasNodeType.Audio ? await resolveAudioNodeUrl(node) : ""] as const;
        }),
    );
    return Object.fromEntries(entries) as Record<string, string>;
}

const durationCache = new Map<string, Promise<number>>();

/** Source duration in seconds; the metadata duration is trusted and the <audio> probe is cached per node. */
export function resolveAudioNodeDuration(node: CanvasNodeData) {
    if (node.metadata?.durationMs) return Promise.resolve(node.metadata.durationMs / 1000);
    const cached = durationCache.get(node.id);
    if (cached) return cached;
    const task = resolveAudioNodeUrl(node).then((url) => {
        if (!url) return AUDIO_CLIP_FALLBACK_SECONDS;
        return new Promise<number>((resolve) => {
            const audio = document.createElement("audio");
            const done = () => resolve(Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : AUDIO_CLIP_FALLBACK_SECONDS);
            audio.onloadedmetadata = done;
            audio.onerror = done;
            audio.src = url;
        });
    });
    durationCache.set(node.id, task);
    return task;
}

export function clampGain(value: number) {
    return Math.min(AUDIO_GAIN_MAX, Math.max(0, Number.isFinite(value) ? value : 1));
}

/** Fader scale: -60 dB … +6 dB, where the bottom stands for true silence and 1.0 (0.0 dB) is unity. */
export const AUDIO_FADER_MIN_DB = -60;
export const AUDIO_FADER_MAX_DB = 6;
export const AUDIO_GAIN_MAX = 10 ** (AUDIO_FADER_MAX_DB / 20);

/** Fader position of a linear gain; a silent gain reads as the bottom of the scale. */
export function gainFaderDb(gain: number) {
    const db = 20 * Math.log10(Math.max(1e-6, clampGain(gain)));
    return Math.max(AUDIO_FADER_MIN_DB, Math.min(AUDIO_FADER_MAX_DB, db));
}

/** Linear gain of a fader position; the bottom of the scale is silence rather than -60 dB. */
export function faderDbGain(db: number) {
    return db <= AUDIO_FADER_MIN_DB ? 0 : clampGain(10 ** (db / 20));
}

export function formatFaderDb(db: number) {
    return db <= AUDIO_FADER_MIN_DB ? "-∞" : `${db > 0 ? "+" : ""}${db.toFixed(1)}`;
}

/** Typed dB value clamped to a range; the "-∞" shown for silence reads as the bottom of the range. */
export function parseDbValue(text: string, min: number, max: number) {
    const clean = text.trim().replace(/db$/i, "").trim();
    if (/^[-+]?(∞|inf(inity)?)$/i.test(clean)) return min;
    const value = Number.parseFloat(clean);
    return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : null;
}

/** Typed gain percentage clamped to 0…max, with an optional trailing % sign. */
export function parseGainPercent(text: string, max: number) {
    const value = Number.parseFloat(text.trim().replace(/%$/, ""));
    return Number.isFinite(value) ? Math.min(max, Math.max(0, value)) : null;
}

export function clampPan(value: number) {
    return Math.min(1, Math.max(-1, Number.isFinite(value) ? value : 0));
}

export function clampClipGain(value: number) {
    return Math.min(2, Math.max(0, Number.isFinite(value) ? value : 1));
}

/**
 * Effective audibility of every track (its mute/solo gate), resolved over the routing graph:
 * any solo silences everything that is not on the path from a soloed track to master, soloing a
 * group implies its children, a soloed return also opens the tracks sending into it, and a mute
 * silences the track plus every track whose output chain runs through it. A track's own solo
 * overrides its own mute.
 */
export function computeAudibility(tracks: CanvasAudioTrack[]) {
    const byId = new Map(tracks.map((track) => [track.id, track]));
    const outputOf = (track: CanvasAudioTrack) => audioTrackOutputId(tracks, track);
    const feedersInto = (id: string) => tracks.filter((track) => track.id !== id && outputOf(track) === id);
    const sendTargets = (track: CanvasAudioTrack) => (track.sends ?? []).filter((send) => send.enabled && byId.has(send.targetTrackId)).map((send) => send.targetTrackId);
    const sendersInto = (id: string) => tracks.filter((track) => (track.sends ?? []).some((send) => send.enabled && send.targetTrackId === id));

    const open = new Set<string>();
    const soloed = tracks.filter((track) => track.solo);
    if (soloed.length) {
        // `summing` marks a soloed bus and every bus opened as one of its inputs, so a soloed group
        // pulls its whole subtree open; a bus opened only as an ancestor keeps its other inputs shut.
        const summing = new Set(soloed.map((track) => track.id));
        const queue = Array.from(summing);
        while (queue.length) {
            const id = queue.shift() as string;
            if (open.has(id)) continue;
            open.add(id);
            const track = byId.get(id);
            if (!track) continue;
            const output = outputOf(track);
            if (output) queue.push(output);
            sendTargets(track).forEach((target) => queue.push(target));
            if (summing.has(id)) {
                sendersInto(id).forEach((item) => queue.push(item.id));
                feedersInto(id).forEach((item) => {
                    summing.add(item.id);
                    queue.push(item.id);
                });
            }
        }
    }

    const mutedChain = (track: CanvasAudioTrack) => {
        const seen = new Set<string>();
        let current: CanvasAudioTrack | undefined = track;
        while (current && !seen.has(current.id)) {
            if (current.mute && !current.solo) return true;
            seen.add(current.id);
            const next = outputOf(current);
            current = next ? byId.get(next) : undefined;
        }
        return false;
    };

    const audible = new Map<string, boolean>();
    tracks.forEach((track) => audible.set(track.id, (!soloed.length || open.has(track.id)) && !mutedChain(track)));
    return audible;
}
