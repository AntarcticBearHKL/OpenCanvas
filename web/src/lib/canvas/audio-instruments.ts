import * as Tone from "tone";

import { instrumentPreset } from "@/lib/canvas/audio-midi";
import { canHostMidi, isVst3Instrument } from "@/lib/canvas/audio-project";
import type { CanvasAudioTrack } from "@/types/canvas";

/**
 * Built-in sampled instruments. The samples come from the open-source FluidR3_GM soundfont
 * (gleitz/midi-js-soundfonts on jsDelivr) and are decoded once through the module cache below,
 * so both the live playback graph and the offline mixdown build their `Tone.Sampler` from the
 * very same decoded buffers (decoded AudioBuffers are context-agnostic, as the mixdown's
 * `Tone.Player` path already relies on).
 */
const SOUNDFONT_BASE = "https://cdn.jsdelivr.net/gh/gleitz/midi-js-soundfonts@gh-pages/FluidR3_GM";
const SOUNDFONT_DIRS: Record<string, string> = { piano: "acoustic_grand_piano-mp3", guitar: "acoustic_guitar_nylon-mp3" };
const FLAT_NOTES = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];

/** Sample every 3 semitones from C2 (MIDI 36) to C6 (MIDI 84) inclusive; the Sampler pitch-shifts the gaps. */
const SAMPLE_NOTES = Array.from({ length: 17 }, (_, index) => {
    const midi = 36 + index * 3;
    return `${FLAT_NOTES[midi % 12]}${Math.floor(midi / 12) - 1}`;
});

const cache = new Map<string, Record<string, Tone.ToneAudioBuffer>>();
const loads = new Map<string, Promise<Record<string, Tone.ToneAudioBuffer>>>();

function sampleUrls(dir: string) {
    return Object.fromEntries(SAMPLE_NOTES.map((note) => [note, `${SOUNDFONT_BASE}/${dir}/${note}.mp3`]));
}

/**
 * Decode one preset's samples once. A total failure resolves `{}` (callers never throw) and drops the
 * in-flight entry so a later call retries; a partial failure keeps whatever decoded, and the Sampler
 * fills the gaps by pitch-shifting the nearest available sample.
 */
function loadOne(id: string): Promise<Record<string, Tone.ToneAudioBuffer>> {
    const cached = cache.get(id);
    if (cached) return Promise.resolve(cached);
    const inFlight = loads.get(id);
    if (inFlight) return inFlight;
    const dir = SOUNDFONT_DIRS[id];
    if (!dir) return Promise.resolve({});
    const task = (async () => {
        const results = await Promise.allSettled(
            Object.entries(sampleUrls(dir)).map(
                ([note, url]) =>
                    new Promise<[string, Tone.ToneAudioBuffer]>((resolve, reject) => {
                        new Tone.ToneAudioBuffer(url, (buffer) => resolve([note, buffer]), reject);
                    }),
            ),
        );
        const record: Record<string, Tone.ToneAudioBuffer> = {};
        results.forEach((result) => {
            if (result.status === "fulfilled") record[result.value[0]] = result.value[1];
        });
        if (!Object.keys(record).length) {
            loads.delete(id);
            return {};
        }
        cache.set(id, record);
        loads.delete(id);
        return record;
    })();
    loads.set(id, task);
    return task;
}

/** Decode the given presets ahead of a graph build; never rejects, so a failed sample set only stays silent. */
export async function preloadSamplerBuffers(ids: string[]): Promise<void> {
    const pending = Array.from(new Set(ids.filter((id) => id && !cache.has(id))));
    await Promise.all(pending.map((id) => loadOne(id).catch(() => ({}))));
}

/** Synchronously read a preset's decoded samples; null until `preloadSamplerBuffers` has succeeded. */
export function samplerBuffersFor(id: string): Record<string, Tone.ToneAudioBuffer> | null {
    return cache.get(id) ?? null;
}

/** Unique preset ids of the non-vst3 instrument tracks, so a caller only preloads what the project uses. */
export function samplerPresetIdsFor(tracks: CanvasAudioTrack[]): string[] {
    return Array.from(new Set(tracks.filter((track) => canHostMidi(track) && !isVst3Instrument(track.instrument)).map((track) => instrumentPreset(track.instrument?.preset).id)));
}
