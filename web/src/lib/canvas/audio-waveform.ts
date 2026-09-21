import { cacheAudioBuffer, cacheAudioPeaks, cachedAudioBuffer, cachedAudioPeaks } from "@/lib/canvas/audio-peaks-cache";

/** Bars drawn by the canvas audio node's own mini waveform. */
export const AUDIO_WAVEFORM_BARS = 96;
/** Deepest decimation stage: one min/max bucket per 1024 samples, about 1/1024 of the decoded PCM. */
const AUDIO_PEAK_BUCKET_SAMPLES = 1024;
const AUDIO_PEAK_MIN_BUCKETS = 8;

/** One decimation stage: the min/max envelope of `bucketSamples` samples per bucket. */
export type AudioPeakBand = { bucketSamples: number; min: Float32Array; max: Float32Array };
/** Multi-resolution peak pyramid, bands ordered from the finest stage to the coarsest one. */
export type AudioPeaks = { duration: number; sampleRate: number; bands: AudioPeakBand[] };

const pendingPeaks = new Map<string, Promise<AudioPeaks | null>>();
const pendingBuffers = new Map<string, Promise<AudioBuffer | null>>();
let decodeContext: AudioContext | null = null;

export function getCachedAudioPeaks(key: string) {
    return cachedAudioPeaks(key);
}

/**
 * Decode once per source url and keep the PCM in the bounded cache; playback and peaks share it, so a
 * source is downloaded and decoded a single time. `Tone` is deliberately not imported here: this module
 * is also used by the canvas audio node, which must not pull the audio engine into the main bundle.
 */
export function loadAudioBuffer(url: string): Promise<AudioBuffer | null> {
    const cached = cachedAudioBuffer(url);
    if (cached) return Promise.resolve(cached);
    const pending = pendingBuffers.get(url);
    if (pending) return pending;
    const task = decodeAudioBuffer(url).then((buffer) => {
        pendingBuffers.delete(url);
        if (buffer) cacheAudioBuffer(url, buffer);
        return buffer;
    });
    pendingBuffers.set(url, task);
    return task;
}

export function loadAudioPeaks(key: string, src: string): Promise<AudioPeaks | null> {
    const cached = cachedAudioPeaks(key);
    if (cached) return Promise.resolve(cached);
    const pending = pendingPeaks.get(key);
    if (pending) return pending;
    const task = loadAudioBuffer(src).then((buffer) => {
        pendingPeaks.delete(key);
        if (!buffer) return null;
        const peaks = buildAudioPeaks(buffer);
        cacheAudioPeaks(key, peaks);
        return peaks;
    });
    pendingPeaks.set(key, task);
    return task;
}

/** Finest band that already paints a bucket per pixel, so a compressed view reads at most one bucket per pixel. */
export function selectPeakBand(peaks: AudioPeaks, pxPerSecond: number) {
    return peaks.bands.find((band) => (band.bucketSamples / peaks.sampleRate) * pxPerSecond >= 1) ?? peaks.bands[0];
}

/** Bucket of `band` that contains `seconds`; clamped to the band so a clip can read past its own tail. */
export function peakBucketIndex(band: AudioPeakBand, peaks: AudioPeaks, seconds: number) {
    const bucket = Math.floor((Math.max(0, seconds) * peaks.sampleRate) / band.bucketSamples);
    return Math.min(band.max.length - 1, Math.max(0, bucket));
}

/** Coarse normalised envelope for the canvas audio node's mini waveform, pooled from the first band that has enough buckets. */
export function peakBars(peaks: AudioPeaks, bars: number) {
    const band = peaks.bands.find((item) => item.max.length >= bars) ?? peaks.bands[peaks.bands.length - 1];
    const step = band.max.length / bars;
    const values: number[] = [];
    for (let bar = 0; bar < bars; bar += 1) {
        const from = Math.floor(bar * step);
        const to = Math.max(from + 1, Math.floor((bar + 1) * step));
        let peak = 0;
        for (let index = from; index < to && index < band.max.length; index += 1) peak = Math.max(peak, Math.abs(band.max[index]), Math.abs(band.min[index]));
        values.push(peak);
    }
    const max = Math.max(...values);
    return max > 0 ? values.map((value) => value / max) : values;
}

export function formatAudioTime(seconds: number) {
    if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
    const total = Math.floor(seconds);
    return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

async function decodeAudioBuffer(url: string) {
    try {
        const response = await fetch(url);
        const data = await response.arrayBuffer();
        // One AudioContext for every decode; decoding works while it is still suspended, so no gesture is needed here.
        decodeContext ??= new AudioContext();
        return await decodeContext.decodeAudioData(data);
    } catch {
        return null;
    }
}

/** Build the min/max pyramid: the deep stage pools every channel, then each further stage folds two buckets. */
function buildAudioPeaks(buffer: AudioBuffer): AudioPeaks {
    const channels = Array.from({ length: buffer.numberOfChannels }, (_, index) => buffer.getChannelData(index));
    const bands: AudioPeakBand[] = [];
    let bucketSamples = AUDIO_PEAK_BUCKET_SAMPLES;
    let previous: AudioPeakBand | null = null;
    while (true) {
        const buckets = Math.max(1, Math.ceil(buffer.length / bucketSamples));
        const min = new Float32Array(buckets);
        const max = new Float32Array(buckets);
        if (previous) {
            for (let bucket = 0; bucket < buckets; bucket += 1) {
                const from = bucket * 2;
                const to = Math.min(previous.max.length, from + 2);
                let low = previous.min[from];
                let high = previous.max[from];
                for (let index = from + 1; index < to; index += 1) {
                    low = Math.min(low, previous.min[index]);
                    high = Math.max(high, previous.max[index]);
                }
                min[bucket] = low;
                max[bucket] = high;
            }
        } else {
            for (let bucket = 0; bucket < buckets; bucket += 1) {
                const from = bucket * bucketSamples;
                const to = Math.min(buffer.length, from + bucketSamples);
                let low = 0;
                let high = 0;
                for (let sample = from; sample < to; sample += 1) {
                    for (const channel of channels) {
                        const value = channel[sample];
                        if (value < low) low = value;
                        if (value > high) high = value;
                    }
                }
                min[bucket] = low;
                max[bucket] = high;
            }
        }
        const band: AudioPeakBand = { bucketSamples, min, max };
        bands.push(band);
        if (buckets <= AUDIO_PEAK_MIN_BUCKETS) break;
        previous = band;
        bucketSamples *= 2;
    }
    return { duration: buffer.duration, sampleRate: buffer.sampleRate, bands };
}
