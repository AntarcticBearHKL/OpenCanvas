import * as Tone from "tone";

import { buildAudioGraph, loadAudioGraphBuffers, type AudioGraphDoc } from "@/lib/canvas/audio-graph";
import { AUDIO_DEFAULT_PPQN } from "@/lib/canvas/audio-midi";
import { AUDIO_DEFAULT_TEMPO, audioProjectDuration, resolveAudioClipUrls } from "@/lib/canvas/audio-project";
import type { CanvasNodeData } from "@/types/canvas";

const AUDIO_MIDI_RELEASE_TAIL_SECONDS = 1.5;

/** Offline render through the shared graph builder, so the export matches playback exactly. */
export async function renderAudioMixdown(doc: AudioGraphDoc, hostNodes: CanvasNodeData[]) {
    const regions = doc.regions ?? [];
    const ppqn = doc.ppqn ?? AUDIO_DEFAULT_PPQN;
    const tempo = doc.tempo ?? AUDIO_DEFAULT_TEMPO;
    const duration = audioProjectDuration(doc.clips, regions, ppqn, tempo) + (regions.length ? AUDIO_MIDI_RELEASE_TAIL_SECONDS : 0);
    const sources = await resolveAudioClipUrls(doc.clips, hostNodes);
    const buffers = await loadAudioGraphBuffers(doc.clips, sources);
    return Tone.Offline(() => {
        buildAudioGraph({ ...doc, regions, ppqn, tempo }, buffers, { mode: "offline" });
    }, duration + 0.05);
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
