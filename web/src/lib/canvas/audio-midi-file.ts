import { Midi } from "@tonejs/midi";

import { AUDIO_DEFAULT_PPQN, AUDIO_DRUM_PRESET_ID, clampPitch, createAudioMidiRegion, createAudioNote, secondsToTicks } from "@/lib/canvas/audio-midi";
import { createAudioTrack } from "@/lib/canvas/audio-project";
import type { CanvasAudioMidiRegion, CanvasAudioTrack } from "@/types/canvas";

export type MidiNoteInput = { pitch: number; startTimeSeconds: number; durationSeconds: number; velocity: number };
export type MidiTrackInput = { name: string; notes: MidiNoteInput[] };
export type ParsedMidiTrack = { name: string; channel: number; percussion: boolean; notes: MidiNoteInput[] };
export type ParsedMidi = { ppq: number; tempo: number; durationMs: number; noteCount: number; tracks: ParsedMidiTrack[] };

/** Parses a Standard MIDI File into seconds-based notes; empty tracks are dropped. */
export function parseMidiFile(data: ArrayBuffer | Uint8Array): ParsedMidi {
    const midi = new Midi(data);
    const ppq = midi.header.ppq;
    const tempo = midi.header.tempos[0]?.bpm ?? 120;
    const tracks: ParsedMidiTrack[] = [];
    let durationMs = 0;
    let noteCount = 0;
    midi.tracks.forEach((track) => {
        if (!track.notes.length) return;
        const notes = track.notes.map((note) => {
            durationMs = Math.max(durationMs, (note.time + note.duration) * 1000);
            noteCount += 1;
            return { pitch: note.midi, startTimeSeconds: note.time, durationSeconds: note.duration, velocity: note.velocity };
        });
        tracks.push({ name: track.name || "", channel: track.channel, percussion: Boolean(track.instrument?.percussion), notes });
    });
    return { ppq, tempo, durationMs, noteCount, tracks };
}

/** Writes seconds-based tracks into a Standard MIDI File; `fromJSON` sets the PPQ because @tonejs/midi defaults to 480. */
export function midiFileFromTracks(tracks: MidiTrackInput[], opts?: { tempo?: number; ppqn?: number }): Uint8Array {
    const tempo = opts?.tempo ?? 120;
    const ppq = opts?.ppqn ?? AUDIO_DEFAULT_PPQN;
    const midi = new Midi();
    midi.header.fromJSON({ name: "", ppq, keySignatures: [], meta: [], timeSignatures: [], tempos: [{ bpm: tempo, ticks: 0 }] });
    tracks.forEach((track) => {
        const midiTrack = midi.addTrack();
        midiTrack.name = track.name;
        track.notes.forEach((note) => {
            midiTrack.addNote({ midi: clampPitch(note.pitch), time: note.startTimeSeconds, duration: note.durationSeconds, velocity: note.velocity });
        });
    });
    return midi.toArray();
}

/** Maps a parsed file onto fresh instrument tracks + regions, one region per non-empty track, using the shared factories. */
export function midiToProjectRegions(parsed: ParsedMidi, opts: { startSeconds: number; tempo: number; ppqn: number; fallbackName: string }): { tracks: CanvasAudioTrack[]; regions: CanvasAudioMidiRegion[] } {
    const tracks: CanvasAudioTrack[] = [];
    const regions: CanvasAudioMidiRegion[] = [];
    const regionStart = secondsToTicks(opts.startSeconds, opts.ppqn, opts.tempo);
    parsed.tracks.forEach((parsedTrack) => {
        if (!parsedTrack.notes.length) return;
        const track = createAudioTrack("instrument");
        if (parsedTrack.percussion) track.instrument = { kind: "synth", preset: AUDIO_DRUM_PRESET_ID };
        track.name = parsedTrack.name || opts.fallbackName;
        const region = createAudioMidiRegion(track.id, regionStart, 1, track.name);
        region.notes = parsedTrack.notes.map((note) => createAudioNote(secondsToTicks(note.startTimeSeconds, opts.ppqn, opts.tempo), secondsToTicks(note.durationSeconds, opts.ppqn, opts.tempo), note.pitch, note.velocity));
        region.durationTicks = region.notes.reduce((max, note) => Math.max(max, note.tick + note.durationTicks), 1);
        tracks.push(track);
        regions.push(region);
    });
    return { tracks, regions };
}
