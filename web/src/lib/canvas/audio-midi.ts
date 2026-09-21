import { nanoid } from "nanoid";

import type { CanvasAudioMidiRegion, CanvasAudioNote, CanvasAudioSnap } from "@/types/canvas";

export const AUDIO_DEFAULT_PPQN = 960;
export const AUDIO_NOTE_MIN = 0;
export const AUDIO_NOTE_MAX = 127;
export const AUDIO_MIN_NOTE_TICKS = 10;

const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const BLACK_KEY_NOTES = new Set([1, 3, 6, 8, 10]);

type AudioInstrumentPreset = {
    id: string;
    labelKey: string;
    oscillator: "sawtooth" | "square" | "triangle" | "sine";
    envelope: { attack: number; decay: number; sustain: number; release: number };
    volume: number; // dB
};

export const AUDIO_INSTRUMENT_PRESETS: AudioInstrumentPreset[] = [
    { id: "saw-lead", labelKey: "canvas.audioStudio.instrumentSawLead", oscillator: "sawtooth", envelope: { attack: 0.01, decay: 0.2, sustain: 0.5, release: 0.4 }, volume: -12 },
    { id: "square-bass", labelKey: "canvas.audioStudio.instrumentSquareBass", oscillator: "square", envelope: { attack: 0.005, decay: 0.15, sustain: 0.35, release: 0.25 }, volume: -14 },
    { id: "triangle-pad", labelKey: "canvas.audioStudio.instrumentTrianglePad", oscillator: "triangle", envelope: { attack: 0.4, decay: 0.6, sustain: 0.7, release: 1.2 }, volume: -8 },
    { id: "sine-bell", labelKey: "canvas.audioStudio.instrumentSineBell", oscillator: "sine", envelope: { attack: 0.005, decay: 0.9, sustain: 0.05, release: 0.9 }, volume: -8 },
];

export const AUDIO_DEFAULT_INSTRUMENT_PRESET = AUDIO_INSTRUMENT_PRESETS[0].id;

export function instrumentPreset(preset?: string) {
    return AUDIO_INSTRUMENT_PRESETS.find((item) => item.id === preset) ?? AUDIO_INSTRUMENT_PRESETS[0];
}

export function noteName(pitch: number) {
    const value = clampPitch(pitch);
    return `${NOTE_NAMES[value % 12]}${Math.floor(value / 12) - 1}`;
}

export function isBlackKey(pitch: number) {
    return BLACK_KEY_NOTES.has(((pitch % 12) + 12) % 12);
}

export function clampPitch(pitch: number) {
    return Math.min(AUDIO_NOTE_MAX, Math.max(AUDIO_NOTE_MIN, Math.round(Number.isFinite(pitch) ? pitch : 60)));
}

export function clampVelocity(velocity: number) {
    return Math.min(1, Math.max(0.05, Number.isFinite(velocity) ? velocity : 0.8));
}

export function clampPpqn(value?: number) {
    return value && Number.isFinite(value) && value >= 24 && value <= 9600 ? Math.round(value) : AUDIO_DEFAULT_PPQN;
}

function roundTicks(value: number) {
    return Math.max(0, Math.round(Number.isFinite(value) ? value : 0));
}

export function ticksToSeconds(ticks: number, ppqn: number, tempo: number) {
    return (ticks / ppqn) * (60 / (tempo > 0 ? tempo : 120));
}

export function secondsToTicks(seconds: number, ppqn: number, tempo: number) {
    return roundTicks((Math.max(0, seconds) * (tempo > 0 ? tempo : 120) * ppqn) / 60);
}

export function beatTicks(ppqn: number, meter: { numerator: number; denominator: number }) {
    return (ppqn * 4) / (meter.denominator > 0 ? meter.denominator : 4);
}

export function barTicks(ppqn: number, meter: { numerator: number; denominator: number }) {
    return beatTicks(ppqn, meter) * (meter.numerator > 0 ? meter.numerator : 4);
}

export function snapTicks(snap: CanvasAudioSnap, ppqn: number, meter: { numerator: number; denominator: number }) {
    if (snap === "bar") return barTicks(ppqn, meter);
    if (snap === "beat") return beatTicks(ppqn, meter);
    if (snap === "1/2") return ppqn * 2;
    if (snap === "1/4") return ppqn;
    if (snap === "1/8") return ppqn / 2;
    if (snap === "1/16") return ppqn / 4;
    return 0;
}

export function quantizeTicks(ticks: number, step: number) {
    const value = Math.max(0, Number.isFinite(ticks) ? ticks : 0);
    return step > 0 ? Math.max(0, Math.round(value / step) * step) : Math.round(value);
}

export function createAudioNote(tick: number, durationTicks: number, pitch: number, velocity = 0.8): CanvasAudioNote {
    return { id: nanoid(), tick: roundTicks(tick), durationTicks: Math.max(AUDIO_MIN_NOTE_TICKS, roundTicks(durationTicks)), pitch: clampPitch(pitch), velocity: clampVelocity(velocity) };
}

export function createAudioMidiRegion(trackId: string, startTicks: number, durationTicks: number, name = ""): CanvasAudioMidiRegion {
    return { id: nanoid(), trackId, startTicks: roundTicks(startTicks), durationTicks: Math.max(1, roundTicks(durationTicks)), notes: [], name };
}

export function audioTrackRegions(regions: CanvasAudioMidiRegion[], trackId: string) {
    return regions.filter((region) => region.trackId === trackId);
}

/** Where a new MIDI region lands: right after the last region on that track. */
export function nextMidiRegionStart(regions: CanvasAudioMidiRegion[], trackId: string) {
    const last = audioTrackRegions(regions, trackId).sort((a, b) => a.startTicks - b.startTicks).at(-1);
    return last ? last.startTicks + last.durationTicks : 0;
}

export function midiRegionEnd(region: CanvasAudioMidiRegion, ppqn: number, tempo: number) {
    return ticksToSeconds(region.startTicks + region.durationTicks, ppqn, tempo);
}

export function sortNotes(notes: CanvasAudioNote[]) {
    return [...notes].sort((a, b) => a.tick - b.tick || a.pitch - b.pitch);
}

export function addNote(notes: CanvasAudioNote[], note: CanvasAudioNote) {
    return sortNotes([...notes, note]);
}

export function notesBounds(notes: CanvasAudioNote[], ids: string[]) {
    const picked = notes.filter((note) => ids.includes(note.id));
    return {
        minTick: picked.reduce((min, note) => Math.min(min, note.tick), Number.POSITIVE_INFINITY),
        minPitch: picked.reduce((min, note) => Math.min(min, note.pitch), AUDIO_NOTE_MAX),
        maxPitch: picked.reduce((max, note) => Math.max(max, note.pitch), AUDIO_NOTE_MIN),
    };
}

export function moveNotes(notes: CanvasAudioNote[], ids: string[], tickDelta: number, pitchDelta: number) {
    return sortNotes(notes.map((note) => (ids.includes(note.id) ? { ...note, tick: Math.max(0, note.tick + tickDelta), pitch: clampPitch(note.pitch + pitchDelta) } : note)));
}

export function resizeNotes(notes: CanvasAudioNote[], ids: string[], durationDelta: number) {
    return notes.map((note) => (ids.includes(note.id) ? { ...note, durationTicks: Math.max(AUDIO_MIN_NOTE_TICKS, roundTicks(note.durationTicks + durationDelta)) } : note));
}

export function setNoteVelocity(notes: CanvasAudioNote[], ids: string[], velocity: number) {
    return notes.map((note) => (ids.includes(note.id) ? { ...note, velocity: clampVelocity(velocity) } : note));
}

export function removeNotes(notes: CanvasAudioNote[], ids: string[]) {
    return notes.filter((note) => !ids.includes(note.id));
}

const AUDIO_MIN_REGION_TICKS = 10;

function patchRegionList(regions: CanvasAudioMidiRegion[], id: string, patch: Partial<CanvasAudioMidiRegion>) {
    return regions.map((region) => (region.id === id ? { ...region, ...patch } : region));
}

export function moveRegion(regions: CanvasAudioMidiRegion[], id: string, startTicks: number, trackId: string) {
    return patchRegionList(regions, id, { startTicks: roundTicks(startTicks), trackId });
}

/** Duplicates a region right after itself; the copy takes fresh ids so its notes stay independent. */
export function duplicateRegion(region: CanvasAudioMidiRegion): CanvasAudioMidiRegion {
    return { ...region, id: nanoid(), startTicks: region.startTicks + region.durationTicks, notes: region.notes.map((note) => ({ ...note, id: nanoid() })) };
}

/** Left-edge trim: notes keep their musical position, so the ones cut off by the new start are dropped. */
export function trimRegionStart(region: CanvasAudioMidiRegion, deltaTicks: number): CanvasAudioMidiRegion {
    const startTicks = Math.max(0, roundTicks(region.startTicks + deltaTicks));
    const shift = startTicks - region.startTicks;
    if (!shift) return region;
    return {
        ...region,
        startTicks,
        durationTicks: Math.max(AUDIO_MIN_REGION_TICKS, region.durationTicks - shift),
        notes: region.notes.filter((note) => note.tick >= shift).map((note) => ({ ...note, tick: note.tick - shift })),
    };
}

/** Right-edge trim: notes that would start past the new end are dropped, so no silent note is stored. */
export function trimRegionEnd(region: CanvasAudioMidiRegion, durationTicks: number): CanvasAudioMidiRegion {
    const duration = Math.max(AUDIO_MIN_REGION_TICKS, roundTicks(durationTicks));
    return { ...region, durationTicks: duration, notes: region.notes.filter((note) => note.tick < duration) };
}

/** Splits a region at an absolute tick into two regions; notes are re-based onto each half's start. */
export function splitRegionAt(region: CanvasAudioMidiRegion, cutTicks: number): CanvasAudioMidiRegion[] | null {
    const cut = Math.round(cutTicks);
    const offset = cut - region.startTicks;
    if (offset <= 0 || offset >= region.durationTicks) return null;
    const left: CanvasAudioMidiRegion = {
        ...region,
        durationTicks: offset,
        notes: region.notes.filter((note) => note.tick < offset).map((note) => ({ ...note, durationTicks: Math.min(note.durationTicks, offset - note.tick) })),
    };
    const right: CanvasAudioMidiRegion = {
        ...region,
        id: nanoid(),
        startTicks: cut,
        durationTicks: region.durationTicks - offset,
        notes: region.notes.filter((note) => note.tick >= offset).map((note) => ({ ...note, id: nanoid(), tick: note.tick - offset })),
    };
    return [left, right];
}
