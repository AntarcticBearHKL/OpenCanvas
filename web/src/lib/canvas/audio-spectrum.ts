/** FFT magnitude grid column-major in `data[column * rows + row]`; row 0 is the lowest frequency, values are 0..1. */
export type Spectrogram = { columns: number; rows: number; data: Float32Array };

const FFT_SIZE = 2048;
const FFT_BINS = FFT_SIZE >> 1;
const DEFAULT_ROWS = 48;
const SPECTRUM_MIN_HZ = 40;
const SPECTRUM_MAX_HZ = 16000;
const SPECTRUM_NYQUIST_RATIO = 0.475;
const SPECTRUM_MIN_DB = -90;
const SPECTRUM_MAX_DB = -6;
const SPECTRUM_FLOOR = 1e-9;

let twiddleCos: Float32Array | null = null;
let twiddleSin: Float32Array | null = null;

/** One twiddle table per FFT size, built lazily and shared by every call. */
function fftTwiddles() {
    if (twiddleCos && twiddleSin) return { cos: twiddleCos, sin: twiddleSin };
    const cos = new Float32Array(FFT_BINS);
    const sin = new Float32Array(FFT_BINS);
    for (let index = 0; index < FFT_BINS; index += 1) {
        const angle = (-2 * Math.PI * index) / FFT_SIZE;
        cos[index] = Math.cos(angle);
        sin[index] = Math.sin(angle);
    }
    twiddleCos = cos;
    twiddleSin = sin;
    return { cos, sin };
}

/** In-place iterative radix-2 Cooley-Tukey FFT with a bit-reversal permutation. */
function fft(re: Float32Array, im: Float32Array, cos: Float32Array, sin: Float32Array) {
    const n = FFT_SIZE;
    for (let index = 1, reversed = 0; index < n; index += 1) {
        let bit = n >> 1;
        for (; reversed & bit; bit >>= 1) reversed ^= bit;
        reversed ^= bit;
        if (index < reversed) {
            const swapRe = re[index];
            re[index] = re[reversed];
            re[reversed] = swapRe;
            const swapIm = im[index];
            im[index] = im[reversed];
            im[reversed] = swapIm;
        }
    }
    for (let size = 2; size <= n; size <<= 1) {
        const half = size >> 1;
        const step = n / size;
        for (let start = 0; start < n; start += size) {
            for (let offset = 0; offset < half; offset += 1) {
                const twiddle = offset * step;
                const cosValue = cos[twiddle];
                const sinValue = sin[twiddle];
                const evenRe = re[start + offset];
                const evenIm = im[start + offset];
                const oddRe = re[start + offset + half];
                const oddIm = im[start + offset + half];
                const rotatedRe = cosValue * oddRe - sinValue * oddIm;
                const rotatedIm = cosValue * oddIm + sinValue * oddRe;
                re[start + offset] = evenRe + rotatedRe;
                im[start + offset] = evenIm + rotatedIm;
                re[start + offset + half] = evenRe - rotatedRe;
                im[start + offset + half] = evenIm - rotatedIm;
            }
        }
    }
}

/** Average every channel of a decoded buffer into one mono Float32Array. */
export function toMono(buffer: AudioBuffer): Float32Array {
    const length = buffer.length;
    const mono = new Float32Array(length);
    const channels = buffer.numberOfChannels;
    for (let channel = 0; channel < channels; channel += 1) {
        const data = buffer.getChannelData(channel);
        for (let index = 0; index < length; index += 1) mono[index] += data[index];
    }
    if (channels > 1) {
        for (let index = 0; index < length; index += 1) mono[index] /= channels;
    }
    return mono;
}

/**
 * Renders `columns` independent time slices into a log-frequency spectrogram. `sampleAt` maps a column
 * to its centre sample, so the caller controls offset / reverse / loop mapping; a window that overruns
 * the PCM is zero-padded. Bins are averaged per row over cumulative log-spaced boundaries, then dB
 * normalised to -90..-6 dB and square-rooted for display.
 */
export function computeSpectrogram(samples: Float32Array, sampleRate: number, columns: number, sampleAt: (index: number, columns: number) => number, rows = DEFAULT_ROWS): Spectrogram {
    const rowCount = Math.max(1, Math.floor(rows));
    const columnCount = Math.max(0, Math.floor(columns));
    const data = new Float32Array(columnCount * rowCount);
    if (!columnCount || !samples.length || !Number.isFinite(sampleRate) || sampleRate <= 0) return { columns: columnCount, rows: rowCount, data };

    const { cos, sin } = fftTwiddles();
    const hann = new Float32Array(FFT_SIZE);
    for (let index = 0; index < FFT_SIZE; index += 1) hann[index] = 0.5 * (1 - Math.cos((2 * Math.PI * index) / (FFT_SIZE - 1)));

    const binHz = sampleRate / FFT_SIZE;
    const topHz = Math.max(SPECTRUM_MIN_HZ, Math.min(SPECTRUM_MAX_HZ, sampleRate * SPECTRUM_NYQUIST_RATIO));
    const boundaries = new Int32Array(rowCount + 1);
    for (let row = 0; row <= rowCount; row += 1) {
        const hz = SPECTRUM_MIN_HZ * (topHz / SPECTRUM_MIN_HZ) ** (row / rowCount);
        const bin = Math.floor(hz / binHz);
        // Force each boundary past the previous one so low rows never collapse to an empty range.
        boundaries[row] = Math.min(FFT_BINS, Math.max(row > 0 ? boundaries[row - 1] + 1 : 0, bin));
    }
    const rowFrom = new Int32Array(rowCount);
    const rowTo = new Int32Array(rowCount);
    for (let row = 0; row < rowCount; row += 1) {
        const from = Math.min(FFT_BINS - 1, boundaries[row]);
        rowFrom[row] = from;
        rowTo[row] = Math.min(FFT_BINS - 1, Math.max(from, boundaries[row + 1] - 1));
    }

    const re = new Float32Array(FFT_SIZE);
    const im = new Float32Array(FFT_SIZE);
    const centre = FFT_SIZE >> 1;
    for (let column = 0; column < columnCount; column += 1) {
        const clamped = Math.min(samples.length - 1, Math.max(0, Math.round(sampleAt(column, columnCount))));
        const offset = clamped - centre;
        for (let index = 0; index < FFT_SIZE; index += 1) {
            const sample = offset + index;
            re[index] = sample >= 0 && sample < samples.length ? samples[sample] * hann[index] : 0;
            im[index] = 0;
        }
        fft(re, im, cos, sin);
        for (let row = 0; row < rowCount; row += 1) {
            const from = rowFrom[row];
            const to = rowTo[row];
            let magnitude = 0;
            // A full-scale sine reads ~0.5 here (-6 dB), the top of the display range.
            for (let bin = from; bin <= to; bin += 1) magnitude += (2 * Math.hypot(re[bin], im[bin])) / FFT_SIZE;
            magnitude /= to - from + 1;
            const db = 20 * Math.log10(magnitude + SPECTRUM_FLOOR);
            const normalised = (db - SPECTRUM_MIN_DB) / (SPECTRUM_MAX_DB - SPECTRUM_MIN_DB);
            const clampedValue = normalised < 0 ? 0 : normalised > 1 ? 1 : normalised;
            data[column * rowCount + row] = Math.sqrt(clampedValue);
        }
    }
    return { columns: columnCount, rows: rowCount, data };
}

type Rgb = { r: number; g: number; b: number };

function parseHexColor(value: string): Rgb | null {
    const match = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(value.trim());
    if (!match) return null;
    const hex = match[1];
    const full = hex.length === 3 ? hex.split("").map((char) => char + char).join("") : hex;
    return { r: Number.parseInt(full.slice(0, 2), 16), g: Number.parseInt(full.slice(2, 4), 16), b: Number.parseInt(full.slice(4, 6), 16) };
}

/** 256-entry RGBA ramp across the parseable hex stops, interpolated in sRGB; unparseable stops are dropped. */
export function spectrogramLut(stops: string[]): Uint8ClampedArray {
    const colors = stops.map(parseHexColor).filter((color): color is Rgb => color !== null);
    const lut = new Uint8ClampedArray(256 * 4);
    if (!colors.length) {
        for (let index = 0; index < 256; index += 1) lut[index * 4 + 3] = 255;
        return lut;
    }
    const last = colors.length - 1;
    for (let index = 0; index < 256; index += 1) {
        const position = (index / 255) * last;
        const low = Math.min(last, Math.floor(position));
        const high = Math.min(last, low + 1);
        const mix = position - low;
        const from = colors[low];
        const to = colors[high];
        const offset = index * 4;
        lut[offset] = from.r + (to.r - from.r) * mix;
        lut[offset + 1] = from.g + (to.g - from.g) * mix;
        lut[offset + 2] = from.b + (to.b - from.b) * mix;
        lut[offset + 3] = 255;
    }
    return lut;
}

let offscreen: HTMLCanvasElement | null = null;

/** Blit a spectrogram through `lut` onto a small offscreen bitmap, then scale it up with smoothing. */
export function drawSpectrogram(ctx: CanvasRenderingContext2D, spectrogram: Spectrogram, width: number, height: number, lut: Uint8ClampedArray): void {
    const { columns, rows, data } = spectrogram;
    if (columns <= 0 || rows <= 0 || width <= 0 || height <= 0 || lut.length < 256 * 4 || data.length < columns * rows) return;
    offscreen ??= document.createElement("canvas");
    if (offscreen.width !== columns) offscreen.width = columns;
    if (offscreen.height !== rows) offscreen.height = rows;
    const offscreenContext = offscreen.getContext("2d");
    if (!offscreenContext) return;
    const image = offscreenContext.createImageData(columns, rows);
    const pixels = image.data;
    for (let column = 0; column < columns; column += 1) {
        for (let row = 0; row < rows; row += 1) {
            // Row 0 is the lowest frequency, so it lands on the bottom scanline of the bitmap.
            const value = data[column * rows + (rows - 1 - row)];
            const entry = Math.min(255, Math.max(0, Math.round(value * 255))) * 4;
            const pixel = (row * columns + column) * 4;
            pixels[pixel] = lut[entry];
            pixels[pixel + 1] = lut[entry + 1];
            pixels[pixel + 2] = lut[entry + 2];
            pixels[pixel + 3] = lut[entry + 3];
        }
    }
    offscreenContext.putImageData(image, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(offscreen, 0, 0, columns, rows, 0, 0, width, height);
}
