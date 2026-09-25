// The `audio` agent namespace: the op union, its JSON Schema and a PURE reducer over the
// audio-project node's metadata (tracks, clips, MIDI, mixer, transport/session, markers,
// automation). No React, no WebAudio/Tone, no DOM; ids may be pinned through the op for
// determinism and fall back to nanoid otherwise.

import { nanoid } from "nanoid";

import {
    clampAutomationValue,
    createAudioAutomationLane,
    findAutomationLane,
    moveAutomationPoint,
    pruneAutomation,
    removeAutomationPoint,
    setAutomationPointCurve,
    sortAutomationPoints,
    upsertAutomationPoint,
} from "@/lib/canvas/audio-automation";
import {
    clipEnd,
    crossfadeClip,
    duplicateClip,
    glueClip,
    moveClip,
    moveClipsToTrack,
    patchClip,
    setClipFade,
    shiftClips,
    splitClip,
    trimClipIn,
    trimClipOut,
} from "@/lib/canvas/audio-clip-ops";
import {
    addNote,
    audioTrackRegions,
    barTicks,
    clampPpqn,
    createAudioMidiRegion,
    createAudioNote,
    duplicateRegion,
    instrumentPreset,
    moveNotes,
    moveRegion,
    nextMidiRegionStart,
    removeNotes,
    resizeNotes,
    setNoteVelocity,
    splitRegionAt,
    trimRegionEnd,
    trimRegionStart,
} from "@/lib/canvas/audio-midi";
import {
    audioProjectAutomation,
    audioProjectCapture,
    audioProjectClips,
    audioProjectCycle,
    audioProjectGrid,
    audioProjectMarkers,
    audioProjectMetronome,
    audioProjectMidiRegions,
    audioProjectPpqn,
    audioProjectPunch,
    audioProjectTimeSignature,
    audioProjectTracks,
    audioRoutingCycle,
    audioTrackClips,
    audioTrackType,
    canHostClips,
    canHostMidi,
    clampClipGain,
    clampGain,
    clampPan,
    createAudioMarker,
    createAudioSend,
    createAudioTrack,
} from "@/lib/canvas/audio-project";
import type {
    CanvasAudioAutomationCurve,
    CanvasAudioAutomationLane,
    CanvasAudioAutomationPoint,
    CanvasAudioCapture,
    CanvasAudioClip,
    CanvasAudioMidiRegion,
    CanvasAudioNote,
    CanvasAudioSend,
    CanvasAudioSnap,
    CanvasAudioTrack,
    CanvasAudioTrackType,
    CanvasNodeData,
    CanvasNodeMetadata,
} from "@/types/canvas";

/** One control height of the clip fade toggles, mirroring DEFAULT_FADE_SECONDS in audio-studio.tsx. */
const AUDIO_DEFAULT_FADE_SECONDS = 0.5;

export type AudioAgentTrackPatch = Partial<Pick<CanvasAudioTrack, "name" | "gain" | "pan" | "mute" | "solo" | "color" | "armed" | "collapsed">>;
export type AudioAgentClipPatch = Partial<Pick<CanvasAudioClip, "name" | "gain" | "fadeIn" | "fadeOut" | "fadeInShape" | "fadeOutShape" | "loop" | "reversed" | "muted" | "locked" | "color">>;
export type AudioAgentSendInput = Partial<CanvasAudioSend> & { targetTrackId: string };
export type AudioAgentLanePatch = Partial<Pick<CanvasAudioAutomationLane, "enabled" | "target">>;

export type AudioAgentOp =
    // Tracks
    | { type: "audio.track.create"; trackType?: Exclude<CanvasAudioTrackType, "master">; id?: string }
    | { type: "audio.track.duplicate"; trackId: string; id?: string }
    | { type: "audio.track.remove"; trackId: string }
    | { type: "audio.track.patch"; trackId: string; patch?: AudioAgentTrackPatch }
    | { type: "audio.track.setOutput"; trackId: string; targetTrackId?: string }
    | { type: "audio.track.setSends"; trackId: string; sends?: AudioAgentSendInput[] }
    // Clips
    | { type: "audio.clip.patch"; clipId: string; patch?: AudioAgentClipPatch }
    | { type: "audio.clip.move"; clipId: string; start: number; trackId?: string }
    | { type: "audio.clip.duplicate"; clipId: string; start?: number; id?: string }
    | { type: "audio.clip.trimIn"; clipId: string; delta: number }
    | { type: "audio.clip.trimOut"; clipId: string; delta: number }
    | { type: "audio.clip.setFade"; clipId: string; edge: "in" | "out"; seconds: number }
    | { type: "audio.clip.split"; clipId: string; time: number }
    | { type: "audio.clip.shift"; clipIds: string[]; deltaSeconds: number }
    | { type: "audio.clip.moveToTrack"; clipIds: string[]; trackId: string }
    | { type: "audio.clip.glue"; clipId: string }
    | { type: "audio.clip.crossfade"; clipId: string }
    | { type: "audio.clip.delete"; clipId?: string; clipIds?: string[] }
    | { type: "audio.clip.toggleField"; clipIds: string[]; field: "loop" | "reversed" | "muted" | "locked" }
    | { type: "audio.clip.toggleFade"; clipIds: string[]; edge: "in" | "out" }
    // MIDI
    | { type: "audio.midi.region.create"; trackId: string; startTicks?: number; durationTicks?: number; name?: string; id?: string }
    | { type: "audio.midi.region.move"; regionId: string; startTicks: number; trackId?: string }
    | { type: "audio.midi.region.duplicate"; regionId: string; id?: string }
    | { type: "audio.midi.region.delete"; regionId?: string; regionIds?: string[] }
    | { type: "audio.midi.region.split"; regionId: string; cutTicks: number }
    | { type: "audio.midi.region.trimStart"; regionId: string; deltaTicks: number }
    | { type: "audio.midi.region.trimEnd"; regionId: string; durationTicks: number }
    | { type: "audio.midi.note.add"; regionId: string; tick: number; durationTicks: number; pitch: number; velocity?: number; id?: string }
    | { type: "audio.midi.note.move"; regionId: string; noteIds: string[]; tickDelta: number; pitchDelta?: number }
    | { type: "audio.midi.note.resize"; regionId: string; noteIds: string[]; durationDelta: number }
    | { type: "audio.midi.note.velocity"; regionId: string; noteIds: string[]; velocity: number }
    | { type: "audio.midi.note.remove"; regionId: string; noteIds: string[] }
    | { type: "audio.midi.track.instrument"; trackId: string; preset: string }
    // Mixer
    | { type: "audio.mixer.setMasterGain"; gain: number }
    | { type: "audio.mixer.setTrackGain"; trackId: string; gain: number }
    | { type: "audio.mixer.setTrackPan"; trackId: string; pan: number }
    | { type: "audio.mixer.setClipGain"; clipId: string; gain: number }
    | { type: "audio.mixer.setMute"; trackId: string; value: boolean }
    | { type: "audio.mixer.setSolo"; trackId: string; value: boolean }
    | { type: "audio.mixer.setSend"; trackId: string; sendId: string; gain?: number; pre?: boolean; enabled?: boolean }
    | { type: "audio.mixer.addSend"; trackId: string; targetTrackId: string; gain?: number; pre?: boolean; enabled?: boolean; id?: string }
    | { type: "audio.mixer.removeSend"; trackId: string; sendId: string }
    // Transport / session
    | { type: "audio.transport.setTempo"; tempo: number }
    | { type: "audio.transport.setTimeSignature"; numerator: number; denominator: number }
    | { type: "audio.transport.setGrid"; enabled?: boolean; snap?: CanvasAudioSnap }
    | { type: "audio.transport.setCycle"; enabled?: boolean; start?: number; end?: number }
    | { type: "audio.transport.setPunch"; enabled?: boolean; in?: number; out?: number }
    | { type: "audio.transport.setMetronome"; enabled?: boolean; volumeDb?: number }
    | { type: "audio.transport.setCountIn"; countIn: number }
    | { type: "audio.transport.setCapture"; mode?: CanvasAudioCapture["mode"]; channels?: number; gainDb?: number; inputLatencyMs?: number }
    | { type: "audio.transport.setPpqn"; ppqn: number }
    | { type: "audio.marker.create"; time: number; name?: string; id?: string }
    | { type: "audio.marker.rename"; markerId: string; name: string }
    | { type: "audio.marker.remove"; markerId: string }
    // Automation
    | { type: "audio.automation.lane.add"; trackId: string; target: string; id?: string }
    | { type: "audio.automation.lane.patch"; laneId: string; patch?: AudioAgentLanePatch }
    | { type: "audio.automation.lane.remove"; laneId: string }
    | { type: "audio.automation.lane.clearTrack"; trackId: string }
    | { type: "audio.automation.points.set"; laneId: string; points: CanvasAudioAutomationPoint[] }
    | { type: "audio.automation.point.upsert"; laneId: string; time: number; value: number }
    | { type: "audio.automation.point.move"; laneId: string; index: number; time: number; value: number }
    | { type: "audio.automation.point.remove"; laneId: string; index: number }
    | { type: "audio.automation.point.curve"; laneId: string; index: number; curve: CanvasAudioAutomationCurve }
    // Export: the studio runs these fire-and-forget, the reducer ignores them.
    | { type: "audio.export.mixdown" }
    | { type: "audio.export.stems" };

/** Export ops the studio runs through its own async handlers; the reducer keeps them out of the metadata fold. */
export const AUDIO_AGENT_EXPORT_TYPES: string[] = ["audio.export.mixdown", "audio.export.stems"];

function withId<T extends { id: string }>(item: T, id?: string): T {
    return id ? { ...item, id } : item;
}

function clampRange(value: number, min: number, max: number) {
    return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}

function clampSeconds(value: number) {
    return Math.max(0, Number.isFinite(value) ? value : 0);
}

/**
 * Pure form of audio-studio.tsx duplicateTrack: insert a copy right after the source track and carry
 * its clips/MIDI regions over with fresh ids. Returns null for an unknown or master track.
 */
export function duplicateAudioTrack(
    tracks: CanvasAudioTrack[],
    clips: CanvasAudioClip[],
    regions: CanvasAudioMidiRegion[],
    trackId: string,
    fallbackName: (track: CanvasAudioTrack) => string,
    id: string = nanoid(),
): Partial<CanvasNodeMetadata> | null {
    const source = tracks.find((track) => track.id === trackId);
    if (!source || audioTrackType(source) === "master") return null;
    const next = [...tracks];
    next.splice(tracks.findIndex((track) => track.id === trackId) + 1, 0, { ...source, id, name: source.name ? `${source.name} 2` : fallbackName(source) });
    return {
        audioTracks: next,
        audioClips: [...clips, ...audioTrackClips(clips, trackId).map((clip) => ({ ...clip, id: nanoid(), trackId: id }))],
        audioMidiRegions: [...regions, ...audioTrackRegions(regions, trackId).map((region) => ({ ...duplicateRegion(region), trackId: id }))],
    };
}

/**
 * Fold a batch of audio ops into the audio-project node's metadata patch. Invalid targets are skipped,
 * numeric fields are clamped exactly like the studio UI, and the patch only carries the fields the ops
 * actually touched (clip writes are committed through the studio's `commitClips` so `applyOverlap` runs).
 */
export function applyAudioAgentOps(project: CanvasNodeData, ops: AudioAgentOp[]): Partial<CanvasNodeMetadata> {
    const before = {
        tracks: audioProjectTracks(project),
        clips: audioProjectClips(project),
        midi: audioProjectMidiRegions(project),
        markers: audioProjectMarkers(project),
        automation: audioProjectAutomation(project),
        meter: audioProjectTimeSignature(project),
        grid: audioProjectGrid(project),
        cycle: audioProjectCycle(project),
        punch: audioProjectPunch(project),
        metronome: audioProjectMetronome(project),
        capture: audioProjectCapture(project),
        ppqn: audioProjectPpqn(project),
    };
    const patch: Partial<CanvasNodeMetadata> = {};
    const tracks = () => patch.audioTracks ?? before.tracks;
    const clips = () => patch.audioClips ?? before.clips;
    const midi = () => patch.audioMidiRegions ?? before.midi;
    const markers = () => patch.audioMarkers ?? before.markers;
    const automation = () => patch.audioAutomation ?? before.automation;
    const grid = () => patch.audioGrid ?? before.grid;
    const cycle = () => patch.audioCycle ?? before.cycle;
    const punch = () => patch.audioPunch ?? before.punch;
    const metronome = () => patch.audioMetronome ?? before.metronome;
    const capture = () => patch.audioCapture ?? before.capture;
    const ppqn = () => patch.audioPpqn ?? before.ppqn;
    const meter = () => patch.audioTimeSignature ?? before.meter;
    const track = (id?: string) => tracks().find((item) => item.id === id);
    const clip = (id?: string) => clips().find((item) => item.id === id);
    const region = (id?: string) => midi().find((item) => item.id === id);
    const lane = (id?: string) => automation().find((item) => item.id === id);
    const patchTrack = (trackId: string, next: CanvasAudioTrack) => {
        patch.audioTracks = tracks().map((item) => (item.id === trackId ? next : item));
    };
    const patchRegionNotes = (regionId: string, notes: CanvasAudioNote[]) => {
        patch.audioMidiRegions = midi().map((item) => (item.id === regionId ? { ...item, notes } : item));
    };
    const patchLanePoints = (laneId: string, points: CanvasAudioAutomationPoint[]) => {
        patch.audioAutomation = automation().map((item) => (item.id === laneId ? { ...item, points } : item));
    };
    const pruneSendAutomation = (nextTracks: CanvasAudioTrack[]) => {
        const next = pruneAutomation(automation(), nextTracks);
        if (next !== automation()) patch.audioAutomation = next;
    };

    (Array.isArray(ops) ? ops : []).forEach((op) => {
        if (!op?.type) return;

        // Tracks
        if (op.type === "audio.track.create") {
            patch.audioTracks = [...tracks(), withId(createAudioTrack(op.trackType ?? "audio"), op.id)];
            return;
        }
        if (op.type === "audio.track.duplicate") {
            const next = duplicateAudioTrack(tracks(), clips(), midi(), op.trackId, () => "", op.id);
            if (next) Object.assign(patch, next);
            return;
        }
        if (op.type === "audio.track.remove") {
            const target = track(op.trackId);
            if (!target || audioTrackType(target) === "master" || tracks().length <= 1) return;
            const nextTracks = tracks()
                .filter((item) => item.id !== target.id)
                .map((item) => ({ ...item, output: item.output === target.id ? undefined : item.output, sends: item.sends?.length ? item.sends.filter((send) => send.targetTrackId !== target.id) : item.sends }));
            const nextClips = clips().filter((item) => item.trackId !== target.id);
            const nextMidi = midi().filter((item) => item.trackId !== target.id);
            patch.audioTracks = nextTracks;
            if (nextClips.length !== clips().length) patch.audioClips = nextClips;
            if (nextMidi.length !== midi().length) patch.audioMidiRegions = nextMidi;
            pruneSendAutomation(nextTracks);
            return;
        }
        if (op.type === "audio.track.patch") {
            const target = track(op.trackId);
            if (!target || !op.patch) return;
            const next: CanvasAudioTrack = { ...target };
            if (op.patch.name !== undefined) next.name = op.patch.name;
            if (op.patch.gain !== undefined) next.gain = clampGain(op.patch.gain);
            if (op.patch.pan !== undefined) next.pan = clampPan(op.patch.pan);
            if (op.patch.mute !== undefined) next.mute = op.patch.mute;
            if (op.patch.solo !== undefined) next.solo = op.patch.solo;
            if (op.patch.color !== undefined) next.color = op.patch.color;
            if (op.patch.armed !== undefined) next.armed = op.patch.armed;
            if (op.patch.collapsed !== undefined) next.collapsed = op.patch.collapsed;
            patchTrack(target.id, next);
            return;
        }
        if (op.type === "audio.track.setOutput") {
            const target = track(op.trackId);
            if (!target || audioTrackType(target) === "master") return;
            const output = op.targetTrackId || "";
            if (output && (!track(output) || audioRoutingCycle(tracks(), target.id, output))) return;
            patchTrack(target.id, { ...target, output: output || undefined });
            return;
        }
        if (op.type === "audio.track.setSends") {
            const target = track(op.trackId);
            if (!target) return;
            const sends = (op.sends ?? [])
                .filter((send) => send?.targetTrackId && send.targetTrackId !== target.id && track(send.targetTrackId))
                .map((send) => {
                    const created = withId(createAudioSend(send.targetTrackId), send.id);
                    return { ...created, gain: clampGain(send.gain ?? created.gain), pre: send.pre ?? created.pre, enabled: send.enabled ?? created.enabled };
                });
            const nextTracks = tracks().map((item) => (item.id === target.id ? { ...item, sends: sends.length ? sends : undefined } : item));
            patch.audioTracks = nextTracks;
            pruneSendAutomation(nextTracks);
            return;
        }

        // Clips
        if (op.type === "audio.clip.patch") {
            const target = clip(op.clipId);
            if (!target || !op.patch) return;
            patch.audioClips = patchClip(clips(), target.id, op.patch);
            return;
        }
        if (op.type === "audio.clip.move") {
            const target = clip(op.clipId);
            if (!target) return;
            const trackId = op.trackId ?? target.trackId;
            const destination = track(trackId);
            if (!destination || !canHostClips(destination)) return;
            patch.audioClips = moveClip(clips(), target.id, op.start, trackId);
            return;
        }
        if (op.type === "audio.clip.duplicate") {
            const target = clip(op.clipId);
            if (!target) return;
            patch.audioClips = [...clips(), withId(duplicateClip(target, op.start ?? clipEnd(target)), op.id)];
            return;
        }
        if (op.type === "audio.clip.trimIn") {
            if (!clip(op.clipId)) return;
            patch.audioClips = trimClipIn(clips(), op.clipId, op.delta);
            return;
        }
        if (op.type === "audio.clip.trimOut") {
            if (!clip(op.clipId)) return;
            patch.audioClips = trimClipOut(clips(), op.clipId, op.delta);
            return;
        }
        if (op.type === "audio.clip.setFade") {
            if (!clip(op.clipId)) return;
            patch.audioClips = setClipFade(clips(), op.clipId, op.edge, op.seconds);
            return;
        }
        if (op.type === "audio.clip.split") {
            const next = splitClip(clips(), op.clipId, op.time);
            if (next) patch.audioClips = next;
            return;
        }
        if (op.type === "audio.clip.shift") {
            if (!(op.clipIds ?? []).some((id) => clip(id))) return;
            patch.audioClips = shiftClips(clips(), op.clipIds, op.deltaSeconds);
            return;
        }
        if (op.type === "audio.clip.moveToTrack") {
            const destination = track(op.trackId);
            if (!destination || !canHostClips(destination) || !(op.clipIds ?? []).some((id) => clip(id))) return;
            patch.audioClips = moveClipsToTrack(clips(), op.clipIds, destination.id);
            return;
        }
        if (op.type === "audio.clip.glue") {
            const next = glueClip(clips(), op.clipId);
            if (next) patch.audioClips = next;
            return;
        }
        if (op.type === "audio.clip.crossfade") {
            const next = crossfadeClip(clips(), op.clipId);
            if (next) patch.audioClips = next;
            return;
        }
        if (op.type === "audio.clip.delete") {
            const ids = new Set(op.clipIds ?? (op.clipId ? [op.clipId] : []));
            if (!ids.size) return;
            const next = clips().filter((item) => !ids.has(item.id));
            if (next.length !== clips().length) patch.audioClips = next;
            return;
        }
        if (op.type === "audio.clip.toggleField") {
            const primary = clip(op.clipIds[op.clipIds.length - 1]);
            if (!primary) return;
            const value = !primary[op.field];
            patch.audioClips = clips().map((item) => (op.clipIds.includes(item.id) ? { ...item, [op.field]: value } : item));
            return;
        }
        if (op.type === "audio.clip.toggleFade") {
            const primary = clip(op.clipIds[op.clipIds.length - 1]);
            if (!primary) return;
            const current = (op.edge === "in" ? primary.fadeIn : primary.fadeOut) ?? 0;
            const value = current > 0 ? 0 : Math.min(AUDIO_DEFAULT_FADE_SECONDS, primary.duration);
            patch.audioClips = clips().map((item) => (op.clipIds.includes(item.id) ? (op.edge === "in" ? { ...item, fadeIn: value } : { ...item, fadeOut: value }) : item));
            return;
        }

        // MIDI
        if (op.type === "audio.midi.region.create") {
            const destination = track(op.trackId);
            if (!destination || !canHostMidi(destination)) return;
            const created = createAudioMidiRegion(op.trackId, op.startTicks ?? nextMidiRegionStart(midi(), op.trackId), op.durationTicks ?? barTicks(ppqn(), meter()), op.name ?? "");
            patch.audioMidiRegions = [...midi(), withId(created, op.id)];
            return;
        }
        if (op.type === "audio.midi.region.move") {
            const target = region(op.regionId);
            if (!target) return;
            const trackId = op.trackId ?? target.trackId;
            const destination = track(trackId);
            if (!destination || !canHostMidi(destination)) return;
            patch.audioMidiRegions = moveRegion(midi(), target.id, op.startTicks, trackId);
            return;
        }
        if (op.type === "audio.midi.region.duplicate") {
            const target = region(op.regionId);
            if (!target) return;
            patch.audioMidiRegions = [...midi(), withId(duplicateRegion(target), op.id)];
            return;
        }
        if (op.type === "audio.midi.region.delete") {
            const ids = new Set(op.regionIds ?? (op.regionId ? [op.regionId] : []));
            if (!ids.size) return;
            const next = midi().filter((item) => !ids.has(item.id));
            if (next.length !== midi().length) patch.audioMidiRegions = next;
            return;
        }
        if (op.type === "audio.midi.region.split") {
            const target = region(op.regionId);
            if (!target) return;
            const halves = splitRegionAt(target, op.cutTicks);
            if (!halves) return;
            patch.audioMidiRegions = midi().flatMap((item) => (item.id === target.id ? halves : [item]));
            return;
        }
        if (op.type === "audio.midi.region.trimStart") {
            const target = region(op.regionId);
            if (!target) return;
            patch.audioMidiRegions = midi().map((item) => (item.id === target.id ? trimRegionStart(item, op.deltaTicks) : item));
            return;
        }
        if (op.type === "audio.midi.region.trimEnd") {
            const target = region(op.regionId);
            if (!target) return;
            patch.audioMidiRegions = midi().map((item) => (item.id === target.id ? trimRegionEnd(item, op.durationTicks) : item));
            return;
        }
        if (op.type === "audio.midi.note.add") {
            const target = region(op.regionId);
            if (!target) return;
            patchRegionNotes(target.id, addNote(target.notes, withId(createAudioNote(op.tick, op.durationTicks, op.pitch, op.velocity), op.id)));
            return;
        }
        if (op.type === "audio.midi.note.move") {
            const target = region(op.regionId);
            if (!target) return;
            patchRegionNotes(target.id, moveNotes(target.notes, op.noteIds, op.tickDelta, op.pitchDelta ?? 0));
            return;
        }
        if (op.type === "audio.midi.note.resize") {
            const target = region(op.regionId);
            if (!target) return;
            patchRegionNotes(target.id, resizeNotes(target.notes, op.noteIds, op.durationDelta));
            return;
        }
        if (op.type === "audio.midi.note.velocity") {
            const target = region(op.regionId);
            if (!target) return;
            patchRegionNotes(target.id, setNoteVelocity(target.notes, op.noteIds, op.velocity));
            return;
        }
        if (op.type === "audio.midi.note.remove") {
            const target = region(op.regionId);
            if (!target) return;
            patchRegionNotes(target.id, removeNotes(target.notes, op.noteIds));
            return;
        }
        if (op.type === "audio.midi.track.instrument") {
            const target = track(op.trackId);
            if (!target || !canHostMidi(target)) return;
            patchTrack(target.id, { ...target, instrument: { kind: "synth", preset: instrumentPreset(op.preset).id } });
            return;
        }

        // Mixer
        if (op.type === "audio.mixer.setMasterGain") {
            patch.audioMasterGain = clampGain(op.gain);
            return;
        }
        if (op.type === "audio.mixer.setTrackGain") {
            const target = track(op.trackId);
            if (target) patchTrack(target.id, { ...target, gain: clampGain(op.gain) });
            return;
        }
        if (op.type === "audio.mixer.setTrackPan") {
            const target = track(op.trackId);
            if (target) patchTrack(target.id, { ...target, pan: clampPan(op.pan) });
            return;
        }
        if (op.type === "audio.mixer.setClipGain") {
            const target = clip(op.clipId);
            if (target) patch.audioClips = patchClip(clips(), target.id, { gain: clampClipGain(op.gain) });
            return;
        }
        if (op.type === "audio.mixer.setMute") {
            const target = track(op.trackId);
            if (target) patchTrack(target.id, { ...target, mute: Boolean(op.value) });
            return;
        }
        if (op.type === "audio.mixer.setSolo") {
            const target = track(op.trackId);
            if (target) patchTrack(target.id, { ...target, solo: Boolean(op.value) });
            return;
        }
        if (op.type === "audio.mixer.setSend") {
            const target = track(op.trackId);
            const send = target?.sends?.find((item) => item.id === op.sendId);
            if (!target || !send) return;
            const next = {
                ...send,
                ...(op.gain !== undefined ? { gain: clampGain(op.gain) } : {}),
                ...(op.pre !== undefined ? { pre: Boolean(op.pre) } : {}),
                ...(op.enabled !== undefined ? { enabled: Boolean(op.enabled) } : {}),
            };
            patchTrack(target.id, { ...target, sends: (target.sends ?? []).map((item) => (item.id === send.id ? next : item)) });
            return;
        }
        if (op.type === "audio.mixer.addSend") {
            const target = track(op.trackId);
            const destination = track(op.targetTrackId);
            if (!target || !destination || destination.id === target.id) return;
            const created = withId(createAudioSend(destination.id), op.id);
            const send = { ...created, gain: clampGain(op.gain ?? created.gain), pre: op.pre ?? created.pre, enabled: op.enabled ?? created.enabled };
            patchTrack(target.id, { ...target, sends: [...(target.sends ?? []), send] });
            return;
        }
        if (op.type === "audio.mixer.removeSend") {
            const target = track(op.trackId);
            if (!target?.sends?.some((send) => send.id === op.sendId)) return;
            const nextTracks = tracks().map((item) => (item.id === target.id ? { ...item, sends: (item.sends ?? []).filter((send) => send.id !== op.sendId) } : item));
            patch.audioTracks = nextTracks;
            pruneSendAutomation(nextTracks);
            return;
        }

        // Transport / session
        if (op.type === "audio.transport.setTempo") {
            if (Number.isFinite(op.tempo)) patch.audioTempo = clampRange(op.tempo, 20, 300);
            return;
        }
        if (op.type === "audio.transport.setTimeSignature") {
            if (!Number.isFinite(op.numerator) || !Number.isFinite(op.denominator) || op.numerator <= 0 || op.denominator <= 0) return;
            patch.audioTimeSignature = { numerator: Math.round(op.numerator), denominator: Math.round(op.denominator) };
            return;
        }
        if (op.type === "audio.transport.setGrid") {
            patch.audioGrid = { enabled: op.enabled ?? grid().enabled, snap: op.snap ?? grid().snap };
            return;
        }
        if (op.type === "audio.transport.setCycle") {
            patch.audioCycle = { enabled: op.enabled ?? cycle().enabled, start: clampSeconds(op.start ?? cycle().start), end: clampSeconds(op.end ?? cycle().end) };
            return;
        }
        if (op.type === "audio.transport.setPunch") {
            patch.audioPunch = { enabled: op.enabled ?? punch().enabled, in: clampSeconds(op.in ?? punch().in), out: clampSeconds(op.out ?? punch().out) };
            return;
        }
        if (op.type === "audio.transport.setMetronome") {
            patch.audioMetronome = { enabled: op.enabled ?? metronome().enabled, volumeDb: Math.round(clampRange(op.volumeDb ?? metronome().volumeDb, -40, 0)) };
            return;
        }
        if (op.type === "audio.transport.setCountIn") {
            patch.audioCountIn = Math.round(clampRange(op.countIn, 0, 4));
            return;
        }
        if (op.type === "audio.transport.setCapture") {
            const current = capture();
            patch.audioCapture = {
                mode: op.mode === "punch" ? "punch" : op.mode === "normal" ? "normal" : current.mode,
                channels: op.channels === 1 ? 1 : op.channels === 2 ? 2 : current.channels,
                gainDb: Math.round(clampRange(op.gainDb ?? current.gainDb, -24, 24)),
                inputLatencyMs: clampRange(op.inputLatencyMs ?? current.inputLatencyMs, 0, 500),
            };
            return;
        }
        if (op.type === "audio.transport.setPpqn") {
            patch.audioPpqn = clampPpqn(op.ppqn);
            return;
        }
        if (op.type === "audio.marker.create") {
            patch.audioMarkers = [...markers(), withId(createAudioMarker(op.time, op.name ?? ""), op.id)];
            return;
        }
        if (op.type === "audio.marker.rename") {
            if (!markers().some((item) => item.id === op.markerId)) return;
            patch.audioMarkers = markers().map((item) => (item.id === op.markerId ? { ...item, name: op.name } : item));
            return;
        }
        if (op.type === "audio.marker.remove") {
            if (!markers().some((item) => item.id === op.markerId)) return;
            patch.audioMarkers = markers().filter((item) => item.id !== op.markerId);
            return;
        }

        // Automation
        if (op.type === "audio.automation.lane.add") {
            const target = track(op.trackId);
            if (!target || findAutomationLane(automation(), target.id, op.target)) return;
            patch.audioAutomation = [...automation(), withId(createAudioAutomationLane(target.id, op.target), op.id)];
            patch.audioTracks = tracks().map((item) => (item.id === target.id ? { ...item, collapsed: false } : item));
            return;
        }
        if (op.type === "audio.automation.lane.patch") {
            const target = lane(op.laneId);
            if (!target || !op.patch) return;
            const next: CanvasAudioAutomationLane = { ...target };
            if (op.patch.enabled !== undefined) next.enabled = op.patch.enabled;
            if (op.patch.target !== undefined) next.target = op.patch.target;
            patch.audioAutomation = automation().map((item) => (item.id === target.id ? next : item));
            return;
        }
        if (op.type === "audio.automation.lane.remove") {
            if (!lane(op.laneId)) return;
            patch.audioAutomation = automation().filter((item) => item.id !== op.laneId);
            return;
        }
        if (op.type === "audio.automation.lane.clearTrack") {
            const next = automation().filter((item) => item.trackId !== op.trackId);
            if (next.length !== automation().length) patch.audioAutomation = next;
            return;
        }
        if (op.type === "audio.automation.points.set") {
            if (!lane(op.laneId) || !op.points) return;
            patchLanePoints(op.laneId, sortAutomationPoints(op.points));
            return;
        }
        if (op.type === "audio.automation.point.upsert") {
            const target = lane(op.laneId);
            if (!target) return;
            patchLanePoints(target.id, upsertAutomationPoint(target.points, op.time, clampAutomationValue(target.target, op.value)));
            return;
        }
        if (op.type === "audio.automation.point.move") {
            const target = lane(op.laneId);
            if (!target) return;
            patchLanePoints(target.id, moveAutomationPoint(target.points, op.index, op.time, clampAutomationValue(target.target, op.value)));
            return;
        }
        if (op.type === "audio.automation.point.remove") {
            const target = lane(op.laneId);
            if (!target) return;
            patchLanePoints(target.id, removeAutomationPoint(target.points, op.index));
            return;
        }
        if (op.type === "audio.automation.point.curve") {
            const target = lane(op.laneId);
            if (!target) return;
            patchLanePoints(target.id, setAutomationPointCurve(target.points, op.index, op.curve));
        }
    });

    return patch;
}

// JSON Schema discriminated union on `type` for the audio ops; each variant pins `ns` to "audio".
const P_STRING = { type: "string" };
const P_NUMBER = { type: "number" };
const P_BOOLEAN = { type: "boolean" };
const P_STRINGS = { type: "array", items: { type: "string" } };
const P_FADE_SHAPE = { type: "string", enum: ["linear", "exponential", "sCurve"] };
const P_CURVE = { type: "string", enum: ["linear", "hold", "sCurve"] };

function audioOpVariant(type: string, properties: Record<string, unknown>, required: string[] = []) {
    return {
        type: "object",
        properties: { ns: { const: "audio" }, type: { const: type }, ...properties },
        required: ["ns", "type", ...required],
        additionalProperties: true,
    };
}

const AUDIO_OP_SPECS: { type: string; required?: string[]; properties: Record<string, unknown> }[] = [
    { type: "audio.track.create", properties: { trackType: { type: "string", enum: ["audio", "instrument", "midi", "group", "return"] }, id: P_STRING } },
    { type: "audio.track.duplicate", required: ["trackId"], properties: { trackId: P_STRING, id: P_STRING } },
    { type: "audio.track.remove", required: ["trackId"], properties: { trackId: P_STRING } },
    {
        type: "audio.track.patch",
        required: ["trackId"],
        properties: {
            trackId: P_STRING,
            patch: { type: "object", properties: { name: P_STRING, gain: P_NUMBER, pan: P_NUMBER, mute: P_BOOLEAN, solo: P_BOOLEAN, color: P_STRING, armed: P_BOOLEAN, collapsed: P_BOOLEAN }, additionalProperties: true },
        },
    },
    { type: "audio.track.setOutput", required: ["trackId"], properties: { trackId: P_STRING, targetTrackId: P_STRING } },
    {
        type: "audio.track.setSends",
        required: ["trackId"],
        properties: {
            trackId: P_STRING,
            sends: { type: "array", items: { type: "object", properties: { id: P_STRING, targetTrackId: P_STRING, gain: P_NUMBER, pre: P_BOOLEAN, enabled: P_BOOLEAN }, required: ["targetTrackId"], additionalProperties: true } },
        },
    },
    {
        type: "audio.clip.patch",
        required: ["clipId"],
        properties: {
            clipId: P_STRING,
            patch: { type: "object", properties: { name: P_STRING, gain: P_NUMBER, fadeIn: P_NUMBER, fadeOut: P_NUMBER, fadeInShape: P_FADE_SHAPE, fadeOutShape: P_FADE_SHAPE, loop: P_BOOLEAN, reversed: P_BOOLEAN, muted: P_BOOLEAN, locked: P_BOOLEAN, color: P_STRING }, additionalProperties: true },
        },
    },
    { type: "audio.clip.move", required: ["clipId", "start"], properties: { clipId: P_STRING, start: P_NUMBER, trackId: P_STRING } },
    { type: "audio.clip.duplicate", required: ["clipId"], properties: { clipId: P_STRING, start: P_NUMBER, id: P_STRING } },
    { type: "audio.clip.trimIn", required: ["clipId", "delta"], properties: { clipId: P_STRING, delta: P_NUMBER } },
    { type: "audio.clip.trimOut", required: ["clipId", "delta"], properties: { clipId: P_STRING, delta: P_NUMBER } },
    { type: "audio.clip.setFade", required: ["clipId", "edge", "seconds"], properties: { clipId: P_STRING, edge: { type: "string", enum: ["in", "out"] }, seconds: P_NUMBER } },
    { type: "audio.clip.split", required: ["clipId", "time"], properties: { clipId: P_STRING, time: P_NUMBER } },
    { type: "audio.clip.shift", required: ["clipIds", "deltaSeconds"], properties: { clipIds: P_STRINGS, deltaSeconds: P_NUMBER } },
    { type: "audio.clip.moveToTrack", required: ["clipIds", "trackId"], properties: { clipIds: P_STRINGS, trackId: P_STRING } },
    { type: "audio.clip.glue", required: ["clipId"], properties: { clipId: P_STRING } },
    { type: "audio.clip.crossfade", required: ["clipId"], properties: { clipId: P_STRING } },
    { type: "audio.clip.delete", properties: { clipId: P_STRING, clipIds: P_STRINGS } },
    { type: "audio.clip.toggleField", required: ["clipIds", "field"], properties: { clipIds: P_STRINGS, field: { type: "string", enum: ["loop", "reversed", "muted", "locked"] } } },
    { type: "audio.clip.toggleFade", required: ["clipIds", "edge"], properties: { clipIds: P_STRINGS, edge: { type: "string", enum: ["in", "out"] } } },
    { type: "audio.midi.region.create", required: ["trackId"], properties: { trackId: P_STRING, startTicks: P_NUMBER, durationTicks: P_NUMBER, name: P_STRING, id: P_STRING } },
    { type: "audio.midi.region.move", required: ["regionId", "startTicks"], properties: { regionId: P_STRING, startTicks: P_NUMBER, trackId: P_STRING } },
    { type: "audio.midi.region.duplicate", required: ["regionId"], properties: { regionId: P_STRING, id: P_STRING } },
    { type: "audio.midi.region.delete", properties: { regionId: P_STRING, regionIds: P_STRINGS } },
    { type: "audio.midi.region.split", required: ["regionId", "cutTicks"], properties: { regionId: P_STRING, cutTicks: P_NUMBER } },
    { type: "audio.midi.region.trimStart", required: ["regionId", "deltaTicks"], properties: { regionId: P_STRING, deltaTicks: P_NUMBER } },
    { type: "audio.midi.region.trimEnd", required: ["regionId", "durationTicks"], properties: { regionId: P_STRING, durationTicks: P_NUMBER } },
    { type: "audio.midi.note.add", required: ["regionId", "tick", "durationTicks", "pitch"], properties: { regionId: P_STRING, tick: P_NUMBER, durationTicks: P_NUMBER, pitch: P_NUMBER, velocity: P_NUMBER, id: P_STRING } },
    { type: "audio.midi.note.move", required: ["regionId", "noteIds", "tickDelta"], properties: { regionId: P_STRING, noteIds: P_STRINGS, tickDelta: P_NUMBER, pitchDelta: P_NUMBER } },
    { type: "audio.midi.note.resize", required: ["regionId", "noteIds", "durationDelta"], properties: { regionId: P_STRING, noteIds: P_STRINGS, durationDelta: P_NUMBER } },
    { type: "audio.midi.note.velocity", required: ["regionId", "noteIds", "velocity"], properties: { regionId: P_STRING, noteIds: P_STRINGS, velocity: P_NUMBER } },
    { type: "audio.midi.note.remove", required: ["regionId", "noteIds"], properties: { regionId: P_STRING, noteIds: P_STRINGS } },
    { type: "audio.midi.track.instrument", required: ["trackId", "preset"], properties: { trackId: P_STRING, preset: P_STRING } },
    { type: "audio.mixer.setMasterGain", required: ["gain"], properties: { gain: P_NUMBER } },
    { type: "audio.mixer.setTrackGain", required: ["trackId", "gain"], properties: { trackId: P_STRING, gain: P_NUMBER } },
    { type: "audio.mixer.setTrackPan", required: ["trackId", "pan"], properties: { trackId: P_STRING, pan: P_NUMBER } },
    { type: "audio.mixer.setClipGain", required: ["clipId", "gain"], properties: { clipId: P_STRING, gain: P_NUMBER } },
    { type: "audio.mixer.setMute", required: ["trackId", "value"], properties: { trackId: P_STRING, value: P_BOOLEAN } },
    { type: "audio.mixer.setSolo", required: ["trackId", "value"], properties: { trackId: P_STRING, value: P_BOOLEAN } },
    { type: "audio.mixer.setSend", required: ["trackId", "sendId"], properties: { trackId: P_STRING, sendId: P_STRING, gain: P_NUMBER, pre: P_BOOLEAN, enabled: P_BOOLEAN } },
    { type: "audio.mixer.addSend", required: ["trackId", "targetTrackId"], properties: { trackId: P_STRING, targetTrackId: P_STRING, gain: P_NUMBER, pre: P_BOOLEAN, enabled: P_BOOLEAN, id: P_STRING } },
    { type: "audio.mixer.removeSend", required: ["trackId", "sendId"], properties: { trackId: P_STRING, sendId: P_STRING } },
    { type: "audio.transport.setTempo", required: ["tempo"], properties: { tempo: P_NUMBER } },
    { type: "audio.transport.setTimeSignature", required: ["numerator", "denominator"], properties: { numerator: P_NUMBER, denominator: P_NUMBER } },
    { type: "audio.transport.setGrid", properties: { enabled: P_BOOLEAN, snap: { type: "string", enum: ["off", "bar", "beat", "1/2", "1/4", "1/8", "1/16"] } } },
    { type: "audio.transport.setCycle", properties: { enabled: P_BOOLEAN, start: P_NUMBER, end: P_NUMBER } },
    { type: "audio.transport.setPunch", properties: { enabled: P_BOOLEAN, in: P_NUMBER, out: P_NUMBER } },
    { type: "audio.transport.setMetronome", properties: { enabled: P_BOOLEAN, volumeDb: P_NUMBER } },
    { type: "audio.transport.setCountIn", required: ["countIn"], properties: { countIn: P_NUMBER } },
    { type: "audio.transport.setCapture", properties: { mode: { type: "string", enum: ["normal", "punch"] }, channels: P_NUMBER, gainDb: P_NUMBER, inputLatencyMs: P_NUMBER } },
    { type: "audio.transport.setPpqn", required: ["ppqn"], properties: { ppqn: P_NUMBER } },
    { type: "audio.marker.create", required: ["time"], properties: { time: P_NUMBER, name: P_STRING, id: P_STRING } },
    { type: "audio.marker.rename", required: ["markerId", "name"], properties: { markerId: P_STRING, name: P_STRING } },
    { type: "audio.marker.remove", required: ["markerId"], properties: { markerId: P_STRING } },
    { type: "audio.automation.lane.add", required: ["trackId", "target"], properties: { trackId: P_STRING, target: P_STRING, id: P_STRING } },
    { type: "audio.automation.lane.patch", required: ["laneId"], properties: { laneId: P_STRING, patch: { type: "object", properties: { enabled: P_BOOLEAN, target: P_STRING }, additionalProperties: true } } },
    { type: "audio.automation.lane.remove", required: ["laneId"], properties: { laneId: P_STRING } },
    { type: "audio.automation.lane.clearTrack", required: ["trackId"], properties: { trackId: P_STRING } },
    {
        type: "audio.automation.points.set",
        required: ["laneId", "points"],
        properties: {
            laneId: P_STRING,
            points: { type: "array", items: { type: "object", properties: { time: P_NUMBER, value: P_NUMBER, curve: P_CURVE }, required: ["time", "value"], additionalProperties: true } },
        },
    },
    { type: "audio.automation.point.upsert", required: ["laneId", "time", "value"], properties: { laneId: P_STRING, time: P_NUMBER, value: P_NUMBER } },
    { type: "audio.automation.point.move", required: ["laneId", "index", "time", "value"], properties: { laneId: P_STRING, index: P_NUMBER, time: P_NUMBER, value: P_NUMBER } },
    { type: "audio.automation.point.remove", required: ["laneId", "index"], properties: { laneId: P_STRING, index: P_NUMBER } },
    { type: "audio.automation.point.curve", required: ["laneId", "index", "curve"], properties: { laneId: P_STRING, index: P_NUMBER, curve: P_CURVE } },
    { type: "audio.export.mixdown", properties: {} },
    { type: "audio.export.stems", properties: {} },
];

export const AUDIO_AGENT_OP_TYPES = AUDIO_OP_SPECS.map((spec) => spec.type);

export const AUDIO_AGENT_SCHEMA: Record<string, unknown> = {
    type: "object",
    oneOf: AUDIO_OP_SPECS.map((spec) => audioOpVariant(spec.type, spec.properties, spec.required)),
};
