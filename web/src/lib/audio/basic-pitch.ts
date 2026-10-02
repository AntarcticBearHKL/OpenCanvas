/**
 * Basic Pitch ONNX post-processing.
 *
 * Ported from spotify/basic-pitch-ts `src/toMidi.ts` (Apache-2.0), with the
 * `@tonejs/midi` file writer removed. Pure math only: no DOM and no
 * onnxruntime import, so it is safe to run inside a Web Worker.
 */

export const BASIC_PITCH_SAMPLE_RATE = 22050;
export const BASIC_PITCH_WINDOW_SIZE = 43844;
export const BASIC_PITCH_OVERLAP = 7680;
export const BASIC_PITCH_HOP_SIZE = 36164;
export const BASIC_PITCH_PAD = 3840;
export const BASIC_PITCH_FRAMES_PER_WINDOW = 172;
export const BASIC_PITCH_OVERLAP_DROP = 15;
export const BASIC_PITCH_BINS = 88;
export const BASIC_PITCH_CONTOUR_BINS = 264;
export const BASIC_PITCH_INPUT_NAME = "serving_default_input_2:0";
export const BASIC_PITCH_INPUT_SHAPE: readonly number[] = [1, BASIC_PITCH_WINDOW_SIZE, 1];
export const BASIC_PITCH_DEFAULT_ONSET_THRESHOLD = 0.5;
export const BASIC_PITCH_DEFAULT_FRAME_THRESHOLD = 0.3;
export const BASIC_PITCH_DEFAULT_MIN_NOTE_LENGTH_FRAMES = 11;

export type BasicPitchNoteEvent = {
    startFrame: number;
    durationFrames: number;
    pitchMidi: number;
    amplitude: number;
    pitchBends?: number[];
};

export type BasicPitchNoteEventTime = {
    startTimeSeconds: number;
    durationSeconds: number;
    pitchMidi: number;
    amplitude: number;
    pitchBends?: number[];
};

export type BasicPitchDecodeOptions = {
    onsetThreshold?: number;
    frameThreshold?: number;
    minNoteLengthFrames?: number;
    inferOnsets?: boolean;
    melodiaTrick?: boolean;
    energyTolerance?: number;
};

type Optional<T> = T | null;

const MIDI_OFFSET = 21;
const AUDIO_SAMPLE_RATE = BASIC_PITCH_SAMPLE_RATE;
const AUDIO_WINDOW_LENGTH = 2;
const FFT_HOP = 256;
const ANNOTATIONS_FPS = Math.floor(AUDIO_SAMPLE_RATE / FFT_HOP);
const ANNOT_N_FRAMES = ANNOTATIONS_FPS * AUDIO_WINDOW_LENGTH;
const AUDIO_N_SAMPLES = AUDIO_SAMPLE_RATE * AUDIO_WINDOW_LENGTH - FFT_HOP;
const WINDOW_OFFSET =
    (FFT_HOP / AUDIO_SAMPLE_RATE) * (ANNOT_N_FRAMES - AUDIO_N_SAMPLES / FFT_HOP) + 0.0018; // magic alignment offset from basic-pitch
const MAX_FREQ_IDX = 87;
const CONTOURS_BINS_PER_SEMITONE = 3;
const ANNOTATIONS_BASE_FREQUENCY = 27.5; // lowest key on a piano
const ANNOTATIONS_N_SEMITONES = 88; // number of piano keys
const N_FREQ_BINS_CONTOURS = ANNOTATIONS_N_SEMITONES * CONTOURS_BINS_PER_SEMITONE;

/**
 * Number of model windows produced for a mono signal. Audio is prefixed with
 * {@link BASIC_PITCH_PAD} zeros and then scanned with {@link BASIC_PITCH_HOP_SIZE}.
 */
export function midiTranscriptionWindowCount(sampleCount: number): number {
    return Math.max(1, Math.ceil((sampleCount + BASIC_PITCH_PAD) / BASIC_PITCH_HOP_SIZE));
}

/**
 * Slice one padded window of the model input, zero-filling outside the signal.
 */
export function buildMidiTranscriptionWindow(samples: Float32Array, windowIndex: number): Float32Array {
    const output = new Float32Array(BASIC_PITCH_WINDOW_SIZE);
    const start = windowIndex * BASIC_PITCH_HOP_SIZE - BASIC_PITCH_PAD;
    const from = Math.max(0, -start);
    const to = Math.min(BASIC_PITCH_WINDOW_SIZE, samples.length - start);
    for (let index = from; index < to; index += 1) {
        output[index] = samples[start + index];
    }
    return output;
}

/**
 * Drop half of the overlapping frames from each end of a raw model output and
 * return the remaining rows (142 per window).
 */
export function unwrapBasicPitchOutput(tensor: Float32Array, frames: number, bins: number): number[][] {
    const output: number[][] = [];
    for (let frame = BASIC_PITCH_OVERLAP_DROP; frame < frames - BASIC_PITCH_OVERLAP_DROP; frame += 1) {
        const row: number[] = new Array(bins);
        const offset = frame * bins;
        for (let bin = 0; bin < bins; bin += 1) row[bin] = tensor[offset + bin];
        output.push(row);
    }
    return output;
}

/** Resample and downmix a stereo pair to a mono signal at `targetRate`. */
export function downmixAndResample(left: Float32Array, right: Float32Array | null, sourceRate: number, targetRate: number): Float32Array {
    const length = Math.max(1, Math.floor((left.length * targetRate) / sourceRate));
    const output = new Float32Array(length);
    const ratio = sourceRate / targetRate;
    const last = left.length - 1;
    for (let index = 0; index < length; index += 1) {
        const position = index * ratio;
        const base = Math.min(Math.floor(position), last);
        const next = Math.min(base + 1, last);
        const fraction = position - base;
        const a = monoAt(left, right, base);
        const b = monoAt(left, right, next);
        output[index] = a + (b - a) * fraction;
    }
    return output;
}

function monoAt(left: Float32Array, right: Float32Array | null, index: number): number {
    return right ? (left[index] + right[index]) / 2 : left[index];
}

/** PORTED LIBROSA FUNCTIONS */

const hzToMidi = (hz: number): number => 12 * (Math.log2(hz) - Math.log2(440.0)) + 69;

const midiToHz = (midi: number): number => 440.0 * 2.0 ** ((midi - 69.0) / 12.0);

export const modelFrameToTime = (frame: number): number => (frame * FFT_HOP) / AUDIO_SAMPLE_RATE - WINDOW_OFFSET * Math.floor(frame / ANNOT_N_FRAMES);

/** PORTED NUMPY FUNCTIONS */

function argMax(arr: number[]): Optional<number> {
    return arr.length === 0
        ? null
        : arr.reduce((maxIndex, currentValue, index) => (arr[maxIndex] > currentValue ? maxIndex : index), -1);
}

const argMaxAxis1 = (arr: number[][]): number[] => arr.map((row) => argMax(row) as number);

function whereGreaterThanAxis1(arr2d: number[][], threshold: number): [number[], number[]] {
    const outputX: number[] = [];
    const outputY: number[] = [];
    for (let i = 0; i < arr2d.length; i += 1) {
        for (let j = 0; j < arr2d[i].length; j += 1) {
            if (arr2d[i][j] > threshold) {
                outputX.push(i);
                outputY.push(j);
            }
        }
    }
    return [outputX, outputY];
}

function meanStdDev(array: number[][]): [number, number] {
    const [sum, sumSquared, count] = array.reduce(
        (prev, row) => {
            const [rowSum, rowSumsSquared, rowCount] = row.reduce((p, value) => [p[0] + value, p[1] + value * value, p[2] + 1], [0, 0, 0]);
            return [prev[0] + rowSum, prev[1] + rowSumsSquared, prev[2] + rowCount];
        },
        [0, 0, 0],
    );
    const mean = sum / count;
    const std = Math.sqrt((1 / (count - 1)) * (sumSquared - (sum * sum) / count));
    return [mean, std];
}

function globalMax(array: number[][]): number {
    return array.reduce((prev, row) => Math.max(prev, ...row), 0);
}

function min3dForAxis0(array: number[][][]): number[][] {
    const minArray = array[0].map((v) => v.slice());
    for (let x = 1; x < array.length; x += 1) {
        for (let y = 0; y < array[0].length; y += 1) {
            for (let z = 0; z < array[0][0].length; z += 1) {
                minArray[y][z] = Math.min(minArray[y][z], array[x][y][z]);
            }
        }
    }
    return minArray;
}

function argRelMax(array: number[][], order = 1): [number, number][] {
    const result: [number, number][] = [];
    for (let col = 0; col < array[0].length; col += 1) {
        for (let row = 0; row < array.length; row += 1) {
            let isRelMax = true;
            for (let comparisonRow = Math.max(0, row - order); isRelMax && comparisonRow <= Math.min(array.length - 1, row + order); comparisonRow += 1) {
                if (comparisonRow !== row) {
                    isRelMax = isRelMax && array[row][col] > array[comparisonRow][col];
                }
            }
            if (isRelMax) result.push([row, col]);
        }
    }
    return result;
}

function max3dForAxis0(array: number[][][]): number[][] {
    const maxArray = array[0].map((v) => v.slice());
    for (let x = 1; x < array.length; x += 1) {
        for (let y = 0; y < array[0].length; y += 1) {
            for (let z = 0; z < array[0][0].length; z += 1) {
                maxArray[y][z] = Math.max(maxArray[y][z], array[x][y][z]);
            }
        }
    }
    return maxArray;
}

/** Helpers */

function isNotNull<T>(t: Optional<T>): t is T {
    return t !== null;
}

function constrainFrequency(onsets: number[][], frames: number[][], maxFreq: Optional<number>, minFreq: Optional<number>) {
    if (maxFreq) {
        const maxFreqIdx = hzToMidi(maxFreq) - MIDI_OFFSET;
        for (let i = 0; i < onsets.length; i += 1) onsets[i].fill(0, maxFreqIdx);
        for (let i = 0; i < frames.length; i += 1) frames[i].fill(0, maxFreqIdx);
    }
    if (minFreq) {
        const minFreqIdx = hzToMidi(minFreq) - MIDI_OFFSET;
        for (let i = 0; i < onsets.length; i += 1) onsets[i].fill(0, 0, minFreqIdx);
        for (let i = 0; i < frames.length; i += 1) frames[i].fill(0, 0, minFreqIdx);
    }
}

function getInferredOnsets(onsets: number[][], frames: number[][], nDiff = 2): number[][] {
    const diffs = Array.from(Array(nDiff).keys())
        .map((n) => n + 1)
        .map((n) => {
            const framesAppended: number[][] = Array(n)
                .fill(Array(frames[0].length).fill(0))
                .concat(frames);
            const nPlus = framesAppended.slice(n);
            const minusN = framesAppended.slice(0, -n);
            return nPlus.map((row, r) => row.map((v, c) => v - minusN[r][c]));
        });
    let frameDiff = min3dForAxis0(diffs);
    frameDiff = frameDiff.map((row) => row.map((v) => Math.max(v, 0)));
    frameDiff = frameDiff.map((row, r) => (r < nDiff ? row.fill(0) : row));
    const onsetMax = globalMax(onsets);
    const frameDiffMax = globalMax(frameDiff);
    frameDiff = frameDiff.map((row) => row.map((v) => (onsetMax * v) / frameDiffMax));
    return max3dForAxis0([onsets, frameDiff]);
}

/**
 * Decode raw model output to polyphonic note events.
 * Ported from basic-pitch `output_to_notes_polyphonic`.
 */
export function outputToNotesPoly(
    frames: number[][],
    onsets: number[][],
    onsetThresh = 0.5,
    frameThresh: number | null = 0.3,
    minNoteLen = 5,
    inferOnsets = true,
    maxFreq: Optional<number> = null,
    minFreq: Optional<number> = null,
    melodiaTrick = true,
    energyTolerance = 11,
): BasicPitchNoteEvent[] {
    let inferredFrameThresh = frameThresh;
    if (inferredFrameThresh === null) {
        const [mean, std] = meanStdDev(frames);
        inferredFrameThresh = mean + std;
    }
    const nFrames = frames.length;
    constrainFrequency(onsets, frames, maxFreq, minFreq);
    let inferredOnsets = onsets;
    if (inferOnsets) inferredOnsets = getInferredOnsets(onsets, frames);

    const peakThresholdMatrix = inferredOnsets.map((o) => o.map(() => 0));
    argRelMax(inferredOnsets).forEach(([row, col]) => {
        peakThresholdMatrix[row][col] = inferredOnsets[row][col];
    });

    const [noteStarts, freqIdxs] = whereGreaterThanAxis1(peakThresholdMatrix, onsetThresh);
    noteStarts.reverse();
    freqIdxs.reverse();

    const remainingEnergy = frames.map((frame) => frame.slice());

    const noteEvents = noteStarts
        .map((noteStartIdx, idx) => {
            const freqIdx = freqIdxs[idx];
            if (noteStartIdx >= nFrames - 1) return null;
            let i = noteStartIdx + 1;
            let k = 0;
            while (i < nFrames - 1 && k < energyTolerance) {
                if (remainingEnergy[i][freqIdx] < inferredFrameThresh) k += 1;
                else k = 0;
                i += 1;
            }
            i -= k;
            if (i - noteStartIdx <= minNoteLen) return null;
            for (let j = noteStartIdx; j < i; j += 1) {
                remainingEnergy[j][freqIdx] = 0;
                if (freqIdx < MAX_FREQ_IDX) remainingEnergy[j][freqIdx + 1] = 0;
                if (freqIdx > 0) remainingEnergy[j][freqIdx - 1] = 0;
            }
            const amplitude = frames.slice(noteStartIdx, i).reduce((prev, row) => prev + row[freqIdx], 0) / (i - noteStartIdx);
            return { startFrame: noteStartIdx, durationFrames: i - noteStartIdx, pitchMidi: freqIdx + MIDI_OFFSET, amplitude };
        })
        .filter(isNotNull);

    if (melodiaTrick === true) {
        while (globalMax(remainingEnergy) > inferredFrameThresh) {
            const [iMid, freqIdx] = remainingEnergy.reduce(
                (prevCoord, currRow, rowIdx) => {
                    const colMaxIdx = argMax(currRow)!;
                    return currRow[colMaxIdx] > remainingEnergy[prevCoord[0]][prevCoord[1]] ? [rowIdx, colMaxIdx] : prevCoord;
                },
                [0, 0],
            );
            remainingEnergy[iMid][freqIdx] = 0;
            let i = iMid + 1;
            let k = 0;
            while (i < nFrames - 1 && k < energyTolerance) {
                if (remainingEnergy[i][freqIdx] < inferredFrameThresh) k += 1;
                else k = 0;
                remainingEnergy[i][freqIdx] = 0;
                if (freqIdx < MAX_FREQ_IDX) remainingEnergy[i][freqIdx + 1] = 0;
                if (freqIdx > 0) remainingEnergy[i][freqIdx - 1] = 0;
                i += 1;
            }
            const iEnd = i - 1 - k;
            i = iMid - 1;
            k = 0;
            while (i > 0 && k < energyTolerance) {
                if (remainingEnergy[i][freqIdx] < inferredFrameThresh) k += 1;
                else k = 0;
                remainingEnergy[i][freqIdx] = 0;
                if (freqIdx < MAX_FREQ_IDX) remainingEnergy[i][freqIdx + 1] = 0;
                if (freqIdx > 0) remainingEnergy[i][freqIdx - 1] = 0;
                i -= 1;
            }
            const iStart = i + 1 + k;
            if (iEnd - iStart <= minNoteLen) continue;
            const amplitude = frames.slice(iStart, iEnd).reduce((sum, row) => sum + row[freqIdx], 0) / (iEnd - iStart);
            noteEvents.push({ startFrame: iStart, durationFrames: iEnd - iStart, pitchMidi: freqIdx + MIDI_OFFSET, amplitude });
        }
    }
    return noteEvents;
}

const gaussian = (M: number, std: number): number[] => Array.from(Array(M).keys()).map((n) => Math.exp((-1 * (n - (M - 1) / 2) ** 2) / (2 * std ** 2)));

const midiPitchToContourBin = (pitchMidi: number): number => 12.0 * CONTOURS_BINS_PER_SEMITONE * Math.log2(midiToHz(pitchMidi) / ANNOTATIONS_BASE_FREQUENCY);

export function addPitchBendsToNoteEvents(contours: number[][], notes: BasicPitchNoteEvent[], nBinsTolerance = 25): BasicPitchNoteEvent[] {
    const windowLength = nBinsTolerance * 2 + 1;
    const freqGaussian = gaussian(windowLength, 5);
    return notes.map((note) => {
        const freqIdx = Math.floor(Math.round(midiPitchToContourBin(note.pitchMidi)));
        const freqStartIdx = Math.max(freqIdx - nBinsTolerance, 0);
        const freqEndIdx = Math.min(N_FREQ_BINS_CONTOURS, freqIdx + nBinsTolerance + 1);
        const freqGaussianSubMatrix = freqGaussian.slice(
            Math.max(0, nBinsTolerance - freqIdx),
            windowLength - Math.max(0, freqIdx - (N_FREQ_BINS_CONTOURS - nBinsTolerance - 1)),
        );
        const pitchBendSubmatrix = contours
            .slice(note.startFrame, note.startFrame + note.durationFrames)
            .map((d) => d.slice(freqStartIdx, freqEndIdx).map((v, col) => v * freqGaussianSubMatrix[col]));
        const pbShift = nBinsTolerance - Math.max(0, nBinsTolerance - freqIdx);
        const bends = argMaxAxis1(pitchBendSubmatrix).map((v) => v - pbShift);
        return { ...note, pitchBends: bends };
    });
}

export const noteFramesToTime = (notes: BasicPitchNoteEvent[]): BasicPitchNoteEventTime[] =>
    notes.map((note) => ({
        pitchMidi: note.pitchMidi,
        amplitude: note.amplitude,
        pitchBends: note.pitchBends,
        startTimeSeconds: modelFrameToTime(note.startFrame),
        durationSeconds: modelFrameToTime(note.startFrame + note.durationFrames) - modelFrameToTime(note.startFrame),
    }));

/**
 * Full decode pipeline: polyphonic note detection, pitch bends and frame to
 * seconds conversion.
 */
export function decodeBasicPitchOutput(frames: number[][], onsets: number[][], contours: number[][], options: BasicPitchDecodeOptions = {}): BasicPitchNoteEventTime[] {
    const notes = outputToNotesPoly(
        frames,
        onsets,
        options.onsetThreshold ?? BASIC_PITCH_DEFAULT_ONSET_THRESHOLD,
        options.frameThreshold ?? BASIC_PITCH_DEFAULT_FRAME_THRESHOLD,
        options.minNoteLengthFrames ?? BASIC_PITCH_DEFAULT_MIN_NOTE_LENGTH_FRAMES,
        options.inferOnsets ?? true,
        null,
        null,
        options.melodiaTrick ?? true,
        options.energyTolerance ?? 11,
    );
    return noteFramesToTime(addPitchBendsToNoteEvents(contours, notes));
}
