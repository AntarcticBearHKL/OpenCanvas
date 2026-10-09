import type { AudioPeaks } from "@/lib/canvas/audio-waveform";

/**
 * Bounded in-memory caches for the audio workspace. Both decode paths write here and both evict the
 * oldest entry first, so a long session never keeps every source of the project in memory.
 */
const MAX_PEAKS_ENTRIES = 24;
const MAX_BUFFER_BYTES = 64 * 1024 * 1024;

const peaksEntries = new Map<string, AudioPeaks>();
const bufferEntries = new Map<string, AudioBuffer>();
let bufferBytes = 0;

/** Decoded PCM footprint of a buffer in bytes. */
export function audioBufferBytes(buffer: AudioBuffer) {
    return buffer.length * buffer.numberOfChannels * 4;
}

export function cachedAudioPeaks(key: string) {
    const entry = peaksEntries.get(key);
    if (!entry) return null;
    peaksEntries.delete(key);
    peaksEntries.set(key, entry);
    return entry;
}

export function cacheAudioPeaks(key: string, peaks: AudioPeaks) {
    peaksEntries.delete(key);
    peaksEntries.set(key, peaks);
    while (peaksEntries.size > MAX_PEAKS_ENTRIES) {
        const oldest = peaksEntries.keys().next().value;
        if (oldest === undefined) return;
        peaksEntries.delete(oldest);
    }
}

export function cachedAudioBuffer(url: string) {
    const entry = bufferEntries.get(url);
    if (!entry) return null;
    bufferEntries.delete(url);
    bufferEntries.set(url, entry);
    return entry;
}

export function cacheAudioBuffer(url: string, buffer: AudioBuffer) {
    const bytes = audioBufferBytes(buffer);
    // A single buffer above the whole budget is played but never cached.
    if (bytes > MAX_BUFFER_BYTES) return;
    const previous = bufferEntries.get(url);
    if (previous) bufferBytes -= audioBufferBytes(previous);
    bufferEntries.delete(url);
    bufferEntries.set(url, buffer);
    bufferBytes += bytes;
    while (bufferBytes > MAX_BUFFER_BYTES) {
        const oldest = bufferEntries.keys().next().value;
        if (oldest === undefined) return;
        const evicted = bufferEntries.get(oldest);
        if (evicted) bufferBytes -= audioBufferBytes(evicted);
        bufferEntries.delete(oldest);
    }
}
