import { nanoid } from "nanoid";

import { AUDIO_GAIN_MAX, clampGain, clampPan } from "@/lib/canvas/audio-project";
import type { CanvasAudioAutomationCurve, CanvasAudioAutomationLane, CanvasAudioAutomationPoint, CanvasAudioTrack } from "@/types/canvas";

export const AUDIO_AUTOMATION_GAIN = "track.gain";
export const AUDIO_AUTOMATION_PAN = "track.pan";

const SEND_PREFIX = "send.";
const SEND_SUFFIX = ".gain";
const MIN_POINT_GAP = 0.005;
const SCURVE_SEGMENTS = 6;

export type CanvasAudioAutomationKind = "gain" | "pan" | "send";

export function audioAutomationSendTarget(sendId: string) {
    return `${SEND_PREFIX}${sendId}${SEND_SUFFIX}`;
}

export function automationTargetKind(target: string): CanvasAudioAutomationKind | null {
    if (target === AUDIO_AUTOMATION_GAIN) return "gain";
    if (target === AUDIO_AUTOMATION_PAN) return "pan";
    if (target.startsWith(SEND_PREFIX) && target.endsWith(SEND_SUFFIX)) return "send";
    return null;
}

export function automationSendId(target: string) {
    return automationTargetKind(target) === "send" ? target.slice(SEND_PREFIX.length, -SEND_SUFFIX.length) : "";
}

/** Value axis of a lane: gain and send gain span the fader scale (0..+6 dB), pan is -1..1. */
export function automationValueRange(target: string) {
    return automationTargetKind(target) === "pan" ? { min: -1, max: 1 } : { min: 0, max: AUDIO_GAIN_MAX };
}

export function clampAutomationValue(target: string, value: number) {
    const finite = Number.isFinite(value) ? value : 0;
    return automationTargetKind(target) === "pan" ? clampPan(finite) : clampGain(finite);
}

export function createAudioAutomationLane(trackId: string, target: string): CanvasAudioAutomationLane {
    return { id: nanoid(), trackId, target, enabled: true, points: [] };
}

export function automationLanesForTrack(automation: CanvasAudioAutomationLane[], trackId: string) {
    return automation.filter((lane) => lane.trackId === trackId);
}

export function findAutomationLane(automation: CanvasAudioAutomationLane[], trackId: string, target: string) {
    return automation.find((lane) => lane.trackId === trackId && lane.target === target);
}

export function automationKey(trackId: string, target: string) {
    return `${trackId}|${target}`;
}

export function automationOwns(automation: CanvasAudioAutomationLane[], trackId: string, target: string) {
    return automation.some((lane) => lane.trackId === trackId && lane.target === target && lane.enabled && lane.points.length > 0);
}

/** Drop lanes of removed tracks and lanes whose send target no longer exists; returns the same array when nothing is orphaned. */
export function pruneAutomation(automation: CanvasAudioAutomationLane[], tracks: CanvasAudioTrack[]) {
    const trackIds = new Set(tracks.map((track) => track.id));
    const sendIds = new Set(tracks.flatMap((track) => (track.sends ?? []).map((send) => send.id)));
    const kept = automation.filter((lane) => trackIds.has(lane.trackId) && (automationTargetKind(lane.target) !== "send" || sendIds.has(automationSendId(lane.target))));
    return kept.length === automation.length ? automation : kept;
}

export function sortAutomationPoints(points: CanvasAudioAutomationPoint[]) {
    return [...points].sort((a, b) => a.time - b.time);
}

/** Insert a breakpoint; a point already at that time is replaced instead of stacked. */
export function upsertAutomationPoint(points: CanvasAudioAutomationPoint[], time: number, value: number) {
    const at = Math.max(0, time);
    const next = points.filter((point) => Math.abs(point.time - at) > MIN_POINT_GAP);
    return sortAutomationPoints([...next, { time: at, value }]);
}

/** Move one breakpoint, clamped between its neighbours so the index stays stable while dragging. */
export function moveAutomationPoint(points: CanvasAudioAutomationPoint[], index: number, time: number, value: number) {
    const point = points[index];
    if (!point) return points;
    const previous = points[index - 1];
    const next = points[index + 1];
    const min = previous ? previous.time + MIN_POINT_GAP : 0;
    const max = next ? next.time - MIN_POINT_GAP : Number.POSITIVE_INFINITY;
    const at = Math.max(min, Math.min(time, max));
    return points.map((item, itemIndex) => (itemIndex === index ? { ...point, time: at, value } : item));
}

export function removeAutomationPoint(points: CanvasAudioAutomationPoint[], index: number) {
    return points.filter((_, itemIndex) => itemIndex !== index);
}

export function setAutomationPointCurve(points: CanvasAudioAutomationPoint[], index: number, curve: CanvasAudioAutomationCurve) {
    return points.map((point, itemIndex) => (itemIndex === index ? { ...point, curve } : point));
}

function smoothStep(ratio: number) {
    return ratio * ratio * (3 - 2 * ratio);
}

/** Value of the lane at `time`: the first value holds before the first point, the last value holds after the last one. */
export function automationValueAt(points: CanvasAudioAutomationPoint[], time: number) {
    if (!points.length) return 0;
    if (time <= points[0].time) return points[0].value;
    for (let index = 0; index < points.length - 1; index += 1) {
        const from = points[index];
        const to = points[index + 1];
        if (time > to.time) continue;
        const span = to.time - from.time;
        const ratio = span > 0 ? (time - from.time) / span : 1;
        const curve = from.curve ?? "linear";
        if (curve === "hold") return from.value;
        if (curve === "sCurve") return from.value + (to.value - from.value) * smoothStep(ratio);
        return from.value + (to.value - from.value) * ratio;
    }
    return points[points.length - 1].value;
}

export type AudioAutomationEvent = { kind: "set" | "ramp"; time: number; value: number };

/** Schedule builder: a linear segment is one ramp, hold is a step and S-curve is a few linear ramps. */
export function automationEvents(points: CanvasAudioAutomationPoint[]): AudioAutomationEvent[] {
    const events: AudioAutomationEvent[] = [];
    if (!points.length) return events;
    events.push({ kind: "set", time: points[0].time, value: points[0].value });
    for (let index = 0; index < points.length - 1; index += 1) {
        const from = points[index];
        const to = points[index + 1];
        const curve = from.curve ?? "linear";
        if (curve === "hold") {
            events.push({ kind: "set", time: to.time, value: to.value });
            continue;
        }
        if (curve === "sCurve") {
            const span = to.time - from.time;
            for (let step = 1; step <= SCURVE_SEGMENTS; step += 1) {
                const ratio = step / SCURVE_SEGMENTS;
                events.push({ kind: "ramp", time: from.time + span * ratio, value: from.value + (to.value - from.value) * smoothStep(ratio) });
            }
            continue;
        }
        events.push({ kind: "ramp", time: to.time, value: to.value });
    }
    return events;
}
