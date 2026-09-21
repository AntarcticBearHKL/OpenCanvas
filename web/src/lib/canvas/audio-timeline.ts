import type { CanvasAudioSnap } from "@/types/canvas";

type CanvasAudioMeter = { numerator: number; denominator: number };

const AUDIO_TICKS_PER_BEAT = 960;
const AUDIO_MIN_PX_PER_SECOND = 2;
const AUDIO_MAX_PX_PER_SECOND = 240;
const AUDIO_GRID_MIN_PX = 48;
const AUDIO_SNAP_MIN_PX = 6;
export const AUDIO_DEFAULT_PX_PER_SECOND = 36;

export function beatSeconds(tempo: number, meter: CanvasAudioMeter) {
    return (60 / (tempo > 0 ? tempo : 120)) * (4 / (meter.denominator || 4));
}

export function barSeconds(tempo: number, meter: CanvasAudioMeter) {
    return beatSeconds(tempo, meter) * (meter.numerator || 4);
}

/** 1-based bar/beat plus a display-only tick derived from the beat length. */
export function secondsToPosition(seconds: number, tempo: number, meter: CanvasAudioMeter) {
    const beat = beatSeconds(tempo, meter);
    const bar = barSeconds(tempo, meter);
    const safe = Math.max(0, Number.isFinite(seconds) ? seconds : 0);
    const barIndex = Math.floor(safe / bar);
    const inBar = safe - barIndex * bar;
    const beatIndex = Math.min(meter.numerator - 1, Math.floor(inBar / beat));
    const rawTick = Math.round(((inBar - beatIndex * beat) / beat) * AUDIO_TICKS_PER_BEAT);
    const tick = rawTick >= AUDIO_TICKS_PER_BEAT ? AUDIO_TICKS_PER_BEAT - 1 : Math.max(0, rawTick);
    return { bar: barIndex + 1, beat: beatIndex + 1, tick };
}

export function formatBarsBeats(seconds: number, tempo: number, meter: CanvasAudioMeter) {
    const { bar, beat, tick } = secondsToPosition(seconds, tempo, meter);
    return `${bar}.${String(beat).padStart(2, "0")}.${String(tick).padStart(3, "0")}`;
}

/** Musical length of one cell for the given snap mode; 0 when snap is off. */
function snapStepSeconds(snap: CanvasAudioSnap, tempo: number, meter: CanvasAudioMeter) {
    if (snap === "off") return 0;
    if (snap === "bar") return barSeconds(tempo, meter);
    const beat = beatSeconds(tempo, meter);
    if (snap === "beat") return beat;
    const division = Number(snap.split("/")[1]);
    return beat * (4 / division);
}

export function snapSeconds(seconds: number, step: number) {
    return step > 0 ? Math.round(seconds / step) * step : seconds;
}

/** Snap step doubled until a cell is at least AUDIO_SNAP_MIN_PX wide, so snap never becomes sub-pixel. */
export function chooseSnapStep(pxPerSecond: number, snap: CanvasAudioSnap, tempo: number, meter: CanvasAudioMeter) {
    let step = snapStepSeconds(snap, tempo, meter);
    if (step <= 0) return 0;
    while (step * pxPerSecond < AUDIO_SNAP_MIN_PX) step *= 2;
    return step;
}

/** Grid spacing: the finest musical unit that still leaves AUDIO_GRID_MIN_PX per cell. */
export function chooseGridStep(pxPerSecond: number, tempo: number, meter: CanvasAudioMeter) {
    const bar = barSeconds(tempo, meter);
    const candidates = [bar / 4, bar / 2, bar, bar * 2, bar * 4, bar * 8, bar * 16, bar * 32, bar * 64];
    return candidates.find((step) => step * pxPerSecond >= AUDIO_GRID_MIN_PX) ?? bar * 64;
}

export function clampPxPerSecond(value: number) {
    return Math.min(AUDIO_MAX_PX_PER_SECOND, Math.max(AUDIO_MIN_PX_PER_SECOND, Number.isFinite(value) ? value : AUDIO_DEFAULT_PX_PER_SECOND));
}
