import { nanoid } from "nanoid";

import type { CanvasPsPath, CanvasPsPathAnchor } from "@/types/canvas";

export type PsPathPoint = { x: number; y: number };

const CURVE_STEPS = 24;

export function psPathAnchor(x: number, y: number): CanvasPsPathAnchor {
    return { x, y, handleIn: { x: 0, y: 0 }, handleOut: { x: 0, y: 0 } };
}

export function createPsPath(name: string, anchors: CanvasPsPathAnchor[] = [], closed = false): CanvasPsPath {
    return { id: nanoid(), name, anchors, closed, visible: true };
}

function psSegment(path: CanvasPsPath, index: number): [PsPathPoint, PsPathPoint, PsPathPoint, PsPathPoint] | null {
    const anchors = path.anchors;
    const from = anchors[index];
    const to = anchors[index + 1] ?? (path.closed ? anchors[0] : undefined);
    if (!from || !to) return null;
    return [
        { x: from.x, y: from.y },
        { x: from.x + from.handleOut.x, y: from.y + from.handleOut.y },
        { x: to.x + to.handleIn.x, y: to.y + to.handleIn.y },
        { x: to.x, y: to.y },
    ];
}

export function psCubicPoint([p0, p1, p2, p3]: [PsPathPoint, PsPathPoint, PsPathPoint, PsPathPoint], t: number): PsPathPoint {
    const inverse = 1 - t;
    return {
        x: inverse * inverse * inverse * p0.x + 3 * inverse * inverse * t * p1.x + 3 * inverse * t * t * p2.x + t * t * t * p3.x,
        y: inverse * inverse * inverse * p0.y + 3 * inverse * inverse * t * p1.y + 3 * inverse * t * t * p2.y + t * t * t * p3.y,
    };
}

export function psPathSegmentCount(path: CanvasPsPath) {
    return path.closed ? path.anchors.length : Math.max(0, path.anchors.length - 1);
}

/** Flattened polyline of the whole path; the pen overlay, the selection mask, the fill and the glyph placement all read this. */
export function psPathPolyline(path: CanvasPsPath, steps = CURVE_STEPS): PsPathPoint[] {
    const points: PsPathPoint[] = [];
    const count = psPathSegmentCount(path);
    for (let index = 0; index < count; index += 1) {
        const segment = psSegment(path, index);
        if (!segment) continue;
        for (let step = 0; step < steps; step += 1) points.push(psCubicPoint(segment, step / steps));
    }
    const last = path.closed ? path.anchors[0] : path.anchors[path.anchors.length - 1];
    if (last) points.push({ x: last.x, y: last.y });
    return points;
}

export function psPathData(path: CanvasPsPath, offset: PsPathPoint = { x: 0, y: 0 }): string {
    const points = psPathPolyline(path).map((point) => `${(point.x - offset.x).toFixed(2)} ${(point.y - offset.y).toFixed(2)}`);
    return points.length ? `M ${points.join(" L ")}${path.closed ? " Z" : ""}` : "";
}

export function psPathBounds(path: CanvasPsPath) {
    const points = psPathPolyline(path);
    if (!points.length) return null;
    const xs = points.map((point) => point.x);
    const ys = points.map((point) => point.y);
    const x = Math.min(...xs);
    const y = Math.min(...ys);
    return { x, y, width: Math.max(1, Math.max(...xs) - x), height: Math.max(1, Math.max(...ys) - y) };
}

export type PsPathSampler = { pointAt: (length: number) => PsPathPoint | null; angleAt: (length: number) => number; total: number };

/** Arc-length sampler used to place glyphs along a path; the angle comes from the flattened segment, which is stable enough for text. */
export function psPathSampler(path: CanvasPsPath): PsPathSampler {
    const points = psPathPolyline(path);
    const lengths: number[] = [0];
    for (let index = 1; index < points.length; index += 1) lengths.push(lengths[index - 1] + Math.hypot(points[index].x - points[index - 1].x, points[index].y - points[index - 1].y));
    const total = lengths[lengths.length - 1] || 0;
    const locate = (length: number) => {
        if (points.length < 2 || total <= 0) return 0;
        let index = 1;
        while (index < lengths.length - 1 && lengths[index] < length) index += 1;
        return index;
    };
    return {
        total,
        pointAt: (length) => {
            if (points.length < 2 || total <= 0) return points[0] ?? null;
            const index = locate(Math.max(0, Math.min(total, length)));
            const previous = Math.max(0, lengths[index] - lengths[index - 1]) || 1;
            const ratio = (Math.max(0, Math.min(total, length)) - lengths[index - 1]) / previous;
            const from = points[index - 1];
            const to = points[index];
            return { x: from.x + (to.x - from.x) * ratio, y: from.y + (to.y - from.y) * ratio };
        },
        angleAt: (length) => {
            if (points.length < 2) return 0;
            const index = locate(Math.max(0, Math.min(total, length)));
            const from = points[index - 1];
            const to = points[index];
            return (Math.atan2(to.y - from.y, to.x - from.x) * 180) / Math.PI;
        },
    };
}
