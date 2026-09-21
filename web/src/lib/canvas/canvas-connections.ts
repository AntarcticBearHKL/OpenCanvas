import i18n from "@/i18n";
import { CanvasNodeType } from "@/types/canvas";
import type { CanvasConnection, CanvasNodeData, Position } from "@/types/canvas";

const EDGE_SAMPLE_SEGMENTS = 24;

const SOURCE_RELATIONS: Record<string, string> = {
    [CanvasNodeType.SmartCanvas]: "composite",
    [CanvasNodeType.Text]: "prompt",
    [CanvasNodeType.Prompt]: "prompt",
    [CanvasNodeType.MusicPrompt]: "prompt",
    [CanvasNodeType.SpeechPrompt]: "prompt",
    [CanvasNodeType.VideoPrompt]: "prompt",
    [CanvasNodeType.Video]: "video-reference",
    [CanvasNodeType.Audio]: "audio-reference",
    [CanvasNodeType.Image]: "reference",
};

export function connectionRelationLabel(connection: CanvasConnection, from: CanvasNodeData, to: CanvasNodeData, referenceIndex?: number): string {
    const relation = connection.relation || SOURCE_RELATIONS[from.type] || "linked";
    if (relation === "reference" && to.type === CanvasNodeType.Prompt && referenceIndex !== undefined) return i18n.t("canvas.relations.referenceNumbered", { index: referenceIndex + 1 });
    return i18n.t(`canvas.relations.${relation}`);
}

export function connectionGeometry(from: CanvasNodeData, to: CanvasNodeData) {
    const startX = from.position.x + from.width;
    const startY = from.position.y + from.height / 2;
    const endX = to.position.x;
    const endY = to.position.y + to.height / 2;
    const curvature = Math.max(Math.abs(endX - startX) * 0.5, 50);
    return { startX, startY, endX, endY, curvature, pathD: `M ${startX} ${startY} C ${startX + curvature} ${startY}, ${endX - curvature} ${endY}, ${endX} ${endY}` };
}

export function connectionCrossesStroke(from: CanvasNodeData, to: CanvasNodeData, stroke: Position[]): boolean {
    if (stroke.length < 2) return false;
    const edge = connectionPolyline(from, to);
    for (let i = 1; i < stroke.length; i++) {
        for (let j = 1; j < edge.length; j++) {
            if (segmentsCross(stroke[i - 1], stroke[i], edge[j - 1], edge[j])) return true;
        }
    }
    return false;
}

function connectionPolyline(from: CanvasNodeData, to: CanvasNodeData): Position[] {
    const { startX, startY, endX, endY, curvature } = connectionGeometry(from, to);
    const points: Position[] = [];
    for (let i = 0; i <= EDGE_SAMPLE_SEGMENTS; i++) {
        const t = i / EDGE_SAMPLE_SEGMENTS;
        const inv = 1 - t;
        const a = inv * inv * inv;
        const b = 3 * inv * inv * t;
        const c = 3 * inv * t * t;
        const d = t * t * t;
        points.push({
            x: a * startX + b * (startX + curvature) + c * (endX - curvature) + d * endX,
            y: a * startY + b * startY + c * endY + d * endY,
        });
    }
    return points;
}

function segmentsCross(a: Position, b: Position, c: Position, d: Position): boolean {
    const o1 = orientation(a, b, c);
    const o2 = orientation(a, b, d);
    const o3 = orientation(c, d, a);
    const o4 = orientation(c, d, b);
    if (o1 !== o2 && o3 !== o4) return true;
    return (o1 === 0 && onSegment(a, b, c)) || (o2 === 0 && onSegment(a, b, d)) || (o3 === 0 && onSegment(c, d, a)) || (o4 === 0 && onSegment(c, d, b));
}

function orientation(a: Position, b: Position, c: Position): -1 | 0 | 1 {
    const value = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
    if (Math.abs(value) < 1e-9) return 0;
    return value > 0 ? 1 : -1;
}

function onSegment(a: Position, b: Position, p: Position): boolean {
    return p.x >= Math.min(a.x, b.x) - 1e-9 && p.x <= Math.max(a.x, b.x) + 1e-9 && p.y >= Math.min(a.y, b.y) - 1e-9 && p.y <= Math.max(a.y, b.y) + 1e-9;
}
