import * as Tone from "tone";

import { buildAudioGraph, loadAudioGraphBuffers, vstNoteSchedule, type AudioGraphDoc } from "@/lib/canvas/audio-graph";
import { AUDIO_DEFAULT_PPQN } from "@/lib/canvas/audio-midi";
import { AUDIO_DEFAULT_TEMPO, audioProjectDuration, canHostMidi, isVst3Instrument, resolveAudioClipUrls } from "@/lib/canvas/audio-project";
import { createVstClient } from "@/lib/canvas/audio-vst";
import { VST_CHANNELS, VST_FRAMES_PER_BLOCK } from "@/lib/canvas/audio-vst-protocol";
import { readVstState } from "@/services/file-storage";
import type { CanvasNodeData } from "@/types/canvas";

const AUDIO_MIDI_RELEASE_TAIL_SECONDS = 1.5;

/** One vst3 track's bounce outcome, so the export path can tell the user what was included and what was not. */
export type AudioMixdownVstReport = { trackId: string; name: string; reason?: string };
export type AudioMixdownResult = { audio: Tone.ToneAudioBuffer; bounced: AudioMixdownVstReport[]; skipped: AudioMixdownVstReport[] };

/** Offline render through the shared graph builder, so the export matches playback exactly. */
export async function renderAudioMixdown(doc: AudioGraphDoc, hostNodes: CanvasNodeData[]): Promise<AudioMixdownResult> {
    const regions = doc.regions ?? [];
    const ppqn = doc.ppqn ?? AUDIO_DEFAULT_PPQN;
    const tempo = doc.tempo ?? AUDIO_DEFAULT_TEMPO;
    const duration = audioProjectDuration(doc.clips, regions, ppqn, tempo) + (regions.length ? AUDIO_MIDI_RELEASE_TAIL_SECONDS : 0);
    const sources = await resolveAudioClipUrls(doc.clips, hostNodes);
    const buffers = await loadAudioGraphBuffers(doc.clips, sources);
    const { stems, bounced, skipped } = await bounceVstStems(doc, duration);
    const audio = await Tone.Offline(() => {
        buildAudioGraph({ ...doc, regions, ppqn, tempo }, buffers, { mode: "offline", vstStems: stems });
    }, duration + 0.05);
    return { audio, bounced, skipped };
}

/**
 * Bounce every vst3 instrument track through the host's `POST /render` before the offline render.
 * Each stem is loaded at the sample rate `Tone.Offline` will use and restored to the plug-in state
 * the playback bridge restores; the graph builder then plays it at 0 through the track's strip, so
 * fader / pan / mute / solo still apply. A track whose host, load or render fails is skipped (as it
 * silently was before) and reported instead of failing the whole export.
 */
async function bounceVstStems(doc: AudioGraphDoc, duration: number) {
    const stems = new Map<string, Tone.ToneAudioBuffer>();
    const bounced: AudioMixdownVstReport[] = [];
    const skipped: AudioMixdownVstReport[] = [];
    const vstTracks = doc.tracks.filter((track) => canHostMidi(track) && isVst3Instrument(track.instrument));
    if (!vstTracks.length) return { stems, bounced, skipped };
    const sampleRate = Tone.getContext().sampleRate;
    const client = createVstClient();
    for (const track of vstTracks) {
        const instrument = track.instrument;
        if (!isVst3Instrument(instrument)) continue;
        const notes = vstNoteSchedule(doc.regions?.filter((region) => region.trackId === track.id) ?? [], doc.ppqn ?? AUDIO_DEFAULT_PPQN, doc.tempo ?? AUDIO_DEFAULT_TEMPO);
        if (!notes.length) continue;
        let instanceId = "";
        try {
            instanceId = (await client.load({ pluginId: instrument.pluginId, sampleRate, blockSize: VST_FRAMES_PER_BLOCK, channels: VST_CHANNELS })).instanceId;
            if (instrument.stateKey) {
                try {
                    const state = await readVstState(instrument.stateKey);
                    if (state !== null) await client.setState(instanceId, state);
                } catch (error) {
                    console.warn("VST3 plug-in state could not be restored for mixdown", error);
                }
            }
            const rendered = await client.renderOffline({ instanceId, seconds: duration, notes, sampleRate, blockSize: VST_FRAMES_PER_BLOCK, channels: VST_CHANNELS });
            stems.set(track.id, Tone.ToneAudioBuffer.fromArray(rendered.channels));
            bounced.push({ trackId: track.id, name: track.name || "" });
        } catch (error) {
            skipped.push({ trackId: track.id, name: track.name || "", reason: error instanceof Error ? error.message : String(error) });
        } finally {
            if (instanceId) await client.unload(instanceId).catch(() => undefined);
        }
    }
    return { stems, bounced, skipped };
}

export function encodeWavBlob(audio: Tone.ToneAudioBuffer) {
    const channels = Array.from({ length: audio.numberOfChannels }, (_, index) => audio.toArray(index) as Float32Array);
    const frames = channels[0]?.length || 0;
    const dataBytes = frames * channels.length * 2;
    const view = new DataView(new ArrayBuffer(44 + dataBytes));
    writeAscii(view, 0, "RIFF");
    view.setUint32(4, 36 + dataBytes, true);
    writeAscii(view, 8, "WAVE");
    writeAscii(view, 12, "fmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, channels.length, true);
    view.setUint32(24, audio.sampleRate, true);
    view.setUint32(28, audio.sampleRate * channels.length * 2, true);
    view.setUint16(32, channels.length * 2, true);
    view.setUint16(34, 16, true);
    writeAscii(view, 36, "data");
    view.setUint32(40, dataBytes, true);
    let offset = 44;
    for (let frame = 0; frame < frames; frame += 1) {
        for (const channel of channels) {
            const sample = Math.max(-1, Math.min(1, channel[frame]));
            view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
            offset += 2;
        }
    }
    return new Blob([view], { type: "audio/wav" });
}

function writeAscii(view: DataView, offset: number, text: string) {
    for (let index = 0; index < text.length; index += 1) view.setUint8(offset + index, text.charCodeAt(index));
}
