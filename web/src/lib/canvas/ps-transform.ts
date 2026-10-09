import type { CanvasPsLayer, CanvasPsTransform } from "@/types/canvas";

export type PsPoint = { x: number; y: number };
export type PsMesh = PsPoint[];

export type PsTransformMode = "free" | "skew" | "distort" | "perspective" | "warp";

export type PsNumericTransform = { dx: number; dy: number; scaleX: number; scaleY: number; rotation: number; skewX: number; skewY: number };

export const PS_TRANSFORM_MODES: PsTransformMode[] = ["free", "skew", "distort", "perspective", "warp"];
export const PS_WARP_GRID = 4;
export const PS_NUMERIC_TRANSFORM_DEFAULT: PsNumericTransform = { dx: 0, dy: 0, scaleX: 100, scaleY: 100, rotation: 0, skewX: 0, skewY: 0 };

const MESH_STEPS = 10;
const CORNER_HANDLES: [number, number][] = [[0, 0], [1, 0], [1, 1], [0, 1]];
const SKEW_HANDLES: [number, number][] = [[0, 0], [0.5, 0], [1, 0], [0, 0.5], [1, 0.5], [0, 1], [0.5, 1], [1, 1]];

export function psIdentityQuad(): PsPoint[] {
    return [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }];
}

export function psIdentityMesh(): PsMesh {
    return Array.from({ length: PS_WARP_GRID * PS_WARP_GRID }, (_, index) => ({ x: (index % PS_WARP_GRID) / (PS_WARP_GRID - 1), y: Math.floor(index / PS_WARP_GRID) / (PS_WARP_GRID - 1) }));
}

export function psDefaultTransform(): CanvasPsTransform {
    return { quad: psIdentityQuad() };
}

export function psHasTransform(layer: CanvasPsLayer) {
    return Boolean(layer.transform?.quad?.length === 4);
}

export function psIsIdentityTransform(transform?: CanvasPsTransform) {
    if (!transform) return true;
    const points = transform.warp?.length === PS_WARP_GRID * PS_WARP_GRID ? transform.warp : transform.quad;
    return points.every((point, index) => Math.abs(point.x - (index % PS_WARP_GRID) / (PS_WARP_GRID - 1)) < 1e-4 && Math.abs(point.y - Math.floor(index / PS_WARP_GRID) / (PS_WARP_GRID - 1)) < 1e-4);
}

/** The 4x4 control mesh a transform edits; a quad-only transform expands to the same grid so both draw through one path. */
export function psTransformControl(transform: CanvasPsTransform): PsMesh {
    if (transform.warp?.length === PS_WARP_GRID * PS_WARP_GRID) return transform.warp.map((point) => ({ x: point.x, y: point.y }));
    const quad = transform.quad.length === 4 ? transform.quad : psIdentityQuad();
    return Array.from({ length: PS_WARP_GRID * PS_WARP_GRID }, (_, index) => psQuadPoint(quad, (index % PS_WARP_GRID) / (PS_WARP_GRID - 1), Math.floor(index / PS_WARP_GRID) / (PS_WARP_GRID - 1)));
}

export function psSetControlPoint(transform: CanvasPsTransform, index: number, point: PsPoint): CanvasPsTransform {
    const mesh = psTransformControl(transform);
    mesh[index] = point;
    return { ...transform, warp: mesh };
}

export function psQuadPoint(quad: PsPoint[], u: number, v: number): PsPoint {
    const top = { x: quad[0].x + (quad[1].x - quad[0].x) * u, y: quad[0].y + (quad[1].y - quad[0].y) * u };
    const bottom = { x: quad[3].x + (quad[2].x - quad[3].x) * u, y: quad[3].y + (quad[2].y - quad[3].y) * u };
    return { x: top.x + (bottom.x - top.x) * v, y: top.y + (bottom.y - top.y) * v };
}

export function psMeshPoint(mesh: PsMesh, u: number, v: number): PsPoint {
    const span = PS_WARP_GRID - 1;
    const col = Math.min(span - 1, Math.max(0, Math.floor(u * span)));
    const row = Math.min(span - 1, Math.max(0, Math.floor(v * span)));
    const cu = Math.min(1, Math.max(0, u * span - col));
    const cv = Math.min(1, Math.max(0, v * span - row));
    const topLeft = mesh[row * PS_WARP_GRID + col];
    const topRight = mesh[row * PS_WARP_GRID + col + 1];
    const bottomLeft = mesh[(row + 1) * PS_WARP_GRID + col];
    const bottomRight = mesh[(row + 1) * PS_WARP_GRID + col + 1];
    const top = { x: topLeft.x + (topRight.x - topLeft.x) * cu, y: topLeft.y + (topRight.y - topLeft.y) * cu };
    const bottom = { x: bottomLeft.x + (bottomRight.x - bottomLeft.x) * cu, y: bottomLeft.y + (bottomRight.y - bottomLeft.y) * cu };
    return { x: top.x + (bottom.x - top.x) * cv, y: top.y + (bottom.y - top.y) * cv };
}

export function psTransformMesh(transform?: CanvasPsTransform): PsMesh | null {
    if (!transform || psIsIdentityTransform(transform)) return null;
    return psTransformControl(transform);
}

function psRotate(x: number, y: number, centre: PsPoint, degrees: number) {
    const angle = (degrees * Math.PI) / 180;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const dx = x - centre.x;
    const dy = y - centre.y;
    return { x: centre.x + dx * cos - dy * sin, y: centre.y + dx * sin + dy * cos };
}

/** Local (u, v) of a layer box maps to board coordinates; the same mapping positions the overlay handles and the mesh. */
export function psTransformPointDoc(layer: CanvasPsLayer, u: number, v: number): PsPoint {
    const centre = { x: layer.x + layer.width / 2, y: layer.y + layer.height / 2 };
    return psRotate(layer.x + u * layer.width, layer.y + v * layer.height, centre, layer.rotation);
}

/** Inverse of psTransformPointDoc: a board point in the layer's normalized box space, used by the transform gestures. */
export function psDocToTransformPoint(layer: CanvasPsLayer, point: PsPoint): PsPoint {
    const centre = { x: layer.x + layer.width / 2, y: layer.y + layer.height / 2 };
    const local = psRotate(point.x, point.y, centre, -layer.rotation);
    return { x: (local.x - layer.x) / Math.max(1, layer.width), y: (local.y - layer.y) / Math.max(1, layer.height) };
}

/** Handle 0..7 for skew (corners and edge midpoints), 0..3 for distort / perspective (corners), 0..15 for warp (control mesh). */
export function psTransformHandlesDoc(layer: CanvasPsLayer, mode: PsTransformMode): { index: number; point: PsPoint }[] {
    if (mode === "warp") {
        const transform = layer.transform || psDefaultTransform();
        return psTransformControl(transform).map((point, index) => ({ index, point: psTransformPointDoc(layer, point.x, point.y) }));
    }
    return (mode === "distort" || mode === "perspective" ? CORNER_HANDLES : SKEW_HANDLES).map(([u, v], index) => ({ index, point: psTransformPointDoc(layer, u, v) }));
}

const SKEW_TOP = [0, 1, 2];
const SKEW_BOTTOM = [4, 5, 6];
const SKEW_LEFT = [0, 6, 7];
const SKEW_RIGHT = [2, 3, 4];

/** Skew moves a whole edge, distort moves one corner, perspective moves a corner and its opposite in mirrored steps. */
export function psMoveTransformHandle(layer: CanvasPsLayer, mode: PsTransformMode, handle: number, point: PsPoint): CanvasPsTransform {
    const transform = layer.transform || psDefaultTransform();
    if (mode === "warp") return psSetControlPoint(transform, Math.min(15, Math.max(0, handle)), psDocToTransformPoint(layer, point));
    const quad = psTransformControl(transform)
        .filter((_, index) => [0, PS_WARP_GRID - 1, PS_WARP_GRID * PS_WARP_GRID - 1, PS_WARP_GRID * (PS_WARP_GRID - 1)].includes(index))
        .map((item) => ({ ...item }));
    const local = psDocToTransformPoint(layer, point);
    if (mode === "distort") {
        quad[handle % 4] = local;
        return { quad };
    }
    if (mode === "perspective") {
        const corner = handle % 4;
        const opposite = (corner + 2) % 4;
        const delta = { x: local.x - quad[corner].x, y: local.y - quad[corner].y };
        quad[corner] = local;
        quad[opposite] = { x: quad[opposite].x - delta.x, y: quad[opposite].y - delta.y };
        return { quad };
    }
    const [u, v] = SKEW_HANDLES[handle % 8];
    const dx = local.x - u;
    const dy = local.y - v;
    if (SKEW_TOP.includes(handle)) {
        quad[0] = { x: quad[0].x + dx, y: quad[0].y };
        quad[1] = { x: quad[1].x + dx, y: quad[1].y };
    }
    if (SKEW_BOTTOM.includes(handle)) {
        quad[3] = { x: quad[3].x + dx, y: quad[3].y };
        quad[2] = { x: quad[2].x + dx, y: quad[2].y };
    }
    if (SKEW_LEFT.includes(handle)) {
        quad[0] = { x: quad[0].x, y: quad[0].y + dy };
        quad[3] = { x: quad[3].x, y: quad[3].y + dy };
    }
    if (SKEW_RIGHT.includes(handle)) {
        quad[1] = { x: quad[1].x, y: quad[1].y + dy };
        quad[2] = { x: quad[2].x, y: quad[2].y + dy };
    }
    return { quad };
}

export function psApplyNumericTransform(layers: CanvasPsLayer[], id: string, params: PsNumericTransform) {
    const layer = layers.find((item) => item.id === id);
    if (!layer) return layers;
    const scaleX = Math.max(0.01, params.scaleX / 100);
    const scaleY = Math.max(0.01, params.scaleY / 100);
    const width = Math.max(1, layer.width * scaleX);
    const height = Math.max(1, layer.height * scaleY);
    const centre = { x: layer.x + layer.width / 2 + params.dx, y: layer.y + layer.height / 2 + params.dy };
    const skewX = Math.tan((Math.max(-80, Math.min(80, params.skewX)) * Math.PI) / 180);
    const skewY = Math.tan((Math.max(-80, Math.min(80, params.skewY)) * Math.PI) / 180);
    const skewed = Math.abs(params.skewX) > 1e-3 || Math.abs(params.skewY) > 1e-3;
    return layers.map((item) =>
        item.id === id
            ? {
                  ...item,
                  x: centre.x - width / 2,
                  y: centre.y - height / 2,
                  width,
                  height,
                  rotation: item.rotation + params.rotation,
                  fontSize: item.fontSize ? Math.max(1, Math.round(item.fontSize * ((scaleX + scaleY) / 2))) : item.fontSize,
                  transform: skewed ? { quad: [{ x: skewX, y: 0 }, { x: 1 + skewX, y: skewY }, { x: 1, y: 1 + skewY }, { x: 0, y: 1 }] } : undefined,
              }
            : item,
    );
}

export function psClearTransform(layers: CanvasPsLayer[], id: string) {
    return layers.map((layer) => (layer.id === id ? { ...layer, transform: undefined } : layer));
}

function psDrawTriangle(context: CanvasRenderingContext2D, image: CanvasImageSource, source: PsPoint[], target: PsPoint[]) {
    const [s0, s1, s2] = source;
    const [d0, d1, d2] = target;
    const determinant = (s1.x - s0.x) * (s2.y - s0.y) - (s2.x - s0.x) * (s1.y - s0.y);
    if (!determinant) return;
    const a = ((d1.x - d0.x) * (s2.y - s0.y) - (d2.x - d0.x) * (s1.y - s0.y)) / determinant;
    const b = ((d1.y - d0.y) * (s2.y - s0.y) - (d2.y - d0.y) * (s1.y - s0.y)) / determinant;
    const c = ((d2.x - d0.x) * (s1.x - s0.x) - (d1.x - d0.x) * (s2.x - s0.x)) / determinant;
    const d = ((d2.y - d0.y) * (s1.x - s0.x) - (d1.y - d0.y) * (s2.x - s0.x)) / determinant;
    context.save();
    context.beginPath();
    context.moveTo(d0.x, d0.y);
    context.lineTo(d1.x, d1.y);
    context.lineTo(d2.x, d2.y);
    context.closePath();
    context.clip();
    context.transform(a, b, c, d, d0.x - a * s0.x - c * s0.y, d0.y - b * s0.x - d * s0.y);
    context.drawImage(image, 0, 0);
    context.restore();
}

function psIsAffineMesh(mesh: PsMesh) {
    const topLeft = mesh[0];
    const topRight = mesh[PS_WARP_GRID - 1];
    const bottomLeft = mesh[PS_WARP_GRID * (PS_WARP_GRID - 1)];
    const bottomRight = mesh[mesh.length - 1];
    return Math.abs(topLeft.x + bottomRight.x - topRight.x - bottomLeft.x) < 1e-4 && Math.abs(topLeft.y + bottomRight.y - topRight.y - bottomLeft.y) < 1e-4;
}

/** The one place a transformed bitmap reaches a canvas: an affine mesh draws as a single clipped transform, the rest as subdivided triangles. */
export function drawPsWarpedContent(context: CanvasRenderingContext2D, image: CanvasImageSource & { width: number; height: number }, mesh: PsMesh, offset: PsPoint) {
    const width = image.width;
    const height = image.height;
    if (!width || !height) return;
    context.save();
    context.translate(offset.x, offset.y);
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    const scale = (point: PsPoint) => ({ x: point.x * width, y: point.y * height });
    if (psIsAffineMesh(mesh)) {
        psDrawTriangle(context, image, [{ x: 0, y: 0 }, { x: width, y: 0 }, { x: width, y: height }], [scale(mesh[0]), scale(mesh[PS_WARP_GRID - 1]), scale(mesh[mesh.length - 1])]);
    } else {
        for (let row = 0; row < MESH_STEPS; row += 1) {
            for (let col = 0; col < MESH_STEPS; col += 1) {
                const u0 = col / MESH_STEPS;
                const v0 = row / MESH_STEPS;
                const u1 = (col + 1) / MESH_STEPS;
                const v1 = (row + 1) / MESH_STEPS;
                const source = [{ x: u0 * width, y: v0 * height }, { x: u1 * width, y: v0 * height }, { x: u1 * width, y: v1 * height }, { x: u0 * width, y: v1 * height }];
                const target = [psMeshPoint(mesh, u0, v0), psMeshPoint(mesh, u1, v0), psMeshPoint(mesh, u1, v1), psMeshPoint(mesh, u0, v1)].map(scale);
                psDrawTriangle(context, image, [source[0], source[1], source[2]], [target[0], target[1], target[2]]);
                psDrawTriangle(context, image, [source[0], source[2], source[3]], [target[0], target[2], target[3]]);
            }
        }
    }
    context.restore();
}
