import * as Tone from "tone";

import { encodeWavBlob } from "@/lib/canvas/audio-mixdown";

const RECORD_MIME_TYPES = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus"];

export type AudioRecordSession = {
    /** Raw audio-context time the capture started at; the studio measures the take's pre-roll against it. */
    startedAt: number;
    /** Post-gain tap the studio hangs on the armed strip so the player hears the input while recording. */
    monitor: Tone.Gain;
    /** Ends the capture and decodes it; null when nothing usable was recorded. */
    stop: () => Promise<AudioBuffer | null>;
    cancel: () => void;
};

/**
 * Opens the browser's default input through the capture gain and records it into a single take.
 * `Tone.UserMedia.open` must stay inside the user gesture, so this is called straight from the record click.
 */
export async function startAudioRecording(gainDb: number): Promise<AudioRecordSession | null> {
    if (!Tone.UserMedia.supported || typeof MediaRecorder === "undefined") return null;
    const input = new Tone.UserMedia();
    await input.open();
    const monitor = new Tone.Gain(Tone.dbToGain(gainDb));
    input.connect(monitor);
    const destination = Tone.getContext().createMediaStreamDestination();
    monitor.connect(destination);
    const mimeType = RECORD_MIME_TYPES.find((type) => MediaRecorder.isTypeSupported(type));
    const recorder = new MediaRecorder(destination.stream, mimeType ? { mimeType } : undefined);
    const chunks: Blob[] = [];
    recorder.ondataavailable = (event) => {
        if (event.data.size) chunks.push(event.data);
    };
    const stopped = new Promise<void>((resolve) => {
        recorder.onstop = () => resolve();
    });
    recorder.start();
    const startedAt = Tone.getContext().currentTime;
    const close = () => {
        input.close();
        input.dispose();
        monitor.dispose();
        destination.disconnect();
    };
    const halt = () => {
        if (recorder.state !== "inactive") recorder.stop();
    };
    return {
        startedAt,
        monitor,
        stop: async () => {
            halt();
            await stopped;
            close();
            if (!chunks.length) return null;
            try {
                return await Tone.getContext().decodeAudioData(await new Blob(chunks, { type: mimeType || "audio/webm" }).arrayBuffer());
            } catch {
                return null;
            }
        },
        cancel: () => {
            halt();
            void stopped.then(close);
        },
    };
}

/** Cuts the performance window out of a decoded take, downmixes it to `channels` and encodes a 16-bit WAV. */
export function cutRecordedTake(buffer: AudioBuffer, from: number, to: number, channels: number) {
    const start = Math.min(buffer.duration, Math.max(0, from));
    const frames = Math.max(1, Math.round((Math.min(buffer.duration, Math.max(to, from)) - start) * buffer.sampleRate));
    const count = channels === 1 ? 1 : Math.min(2, buffer.numberOfChannels);
    const cut = new AudioBuffer({ length: frames, numberOfChannels: count, sampleRate: buffer.sampleRate });
    const offset = Math.round(start * buffer.sampleRate);
    const sources = Array.from({ length: buffer.numberOfChannels }, (_, channel) => buffer.getChannelData(channel));
    for (let channel = 0; channel < count; channel += 1) {
        const target = cut.getChannelData(channel);
        for (let frame = 0; frame < frames; frame += 1) {
            const index = offset + frame;
            target[frame] = count === 1 && sources.length > 1 ? sources.reduce((sum, source) => sum + (source[index] || 0), 0) / sources.length : sources[channel][index] || 0;
        }
    }
    return encodeWavBlob(new Tone.ToneAudioBuffer(cut));
}
