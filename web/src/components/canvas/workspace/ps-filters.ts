import { createCanvasContext } from "@/lib/canvas/canvas-2d";
import { renderPsLayerBitmap } from "@/lib/canvas/smart-canvas";
import { psBitmapSize, psCanvasToBlob, psLoadImage } from "@/components/canvas/workspace/ps-paint";
import { psSelectionToLayerSpace, type PsSelection } from "@/components/canvas/workspace/ps-selection";
import { resolveImageUrl } from "@/services/image-storage";
import type { CanvasNodeData, CanvasPsLayer } from "@/types/canvas";

export type PsFilterType =
    | "gaussian-blur"
    | "box-blur"
    | "motion-blur"
    | "radial-blur"
    | "sharpen"
    | "unsharp-mask"
    | "add-noise"
    | "despeckle"
    | "dust-scratches"
    | "pixelate"
    | "crystallize"
    | "emboss"
    | "find-edges"
    | "solarize"
    | "ripple"
    | "pinch"
    | "spherize"
    | "clouds"
    | "lens-flare"
    | "tilt-shift"
    | "iris-blur"
    | "liquify";

export type PsFilterControl = { key: string; labelKey: string; kind: "slider" | "select" | "checkbox"; min?: number; max?: number; step?: number; suffix?: string; options?: { value: string; labelKey: string }[] };
export type PsFilterDef = { type: PsFilterType; labelKey: string; group: string; controls: PsFilterControl[]; defaults: Record<string, number | string> };
export type PsFilterParams = Record<string, number | string>;

const slider = (key: string, labelKey: string, min: number, max: number, suffix = "", step = 1): PsFilterControl => ({ key, labelKey, kind: "slider", min, max, suffix, step });
const select = (key: string, labelKey: string, options: { value: string; labelKey: string }[]): PsFilterControl => ({ key, labelKey, kind: "select", options });

export const PS_FILTER_GROUPS = ["blur", "sharpen", "noise", "pixelate", "stylize", "distort"];

export const PS_FILTERS: PsFilterDef[] = [
    { type: "gaussian-blur", labelKey: "canvas.ps.filter.gaussianBlur", group: "blur", controls: [slider("radius", "canvas.ps.filter.radius", 0, 100, "px")], defaults: { radius: 4 } },
    { type: "box-blur", labelKey: "canvas.ps.filter.boxBlur", group: "blur", controls: [slider("radius", "canvas.ps.filter.radius", 0, 100, "px")], defaults: { radius: 4 } },
    { type: "motion-blur", labelKey: "canvas.ps.filter.motionBlur", group: "blur", controls: [slider("angle", "canvas.ps.filter.angle", -180, 180, "°"), slider("distance", "canvas.ps.filter.distance", 1, 100, "px")], defaults: { angle: 0, distance: 12 } },
    {
        type: "radial-blur",
        labelKey: "canvas.ps.filter.radialBlur",
        group: "blur",
        controls: [slider("amount", "canvas.ps.filter.amount", 1, 100), select("method", "canvas.ps.filter.method", [{ value: "zoom", labelKey: "canvas.ps.filter.zoom" }, { value: "spin", labelKey: "canvas.ps.filter.spin" }])],
        defaults: { amount: 10, method: "zoom" },
    },
    { type: "tilt-shift", labelKey: "canvas.ps.filter.tiltShift", group: "blur", controls: [slider("blur", "canvas.ps.filter.blur", 0, 100, "px"), slider("angle", "canvas.ps.filter.angle", -180, 180, "°"), slider("position", "canvas.ps.filter.position", 0, 100, "%"), slider("width", "canvas.ps.filter.width", 0, 100, "%")], defaults: { blur: 12, angle: 0, position: 50, width: 30 } },
    { type: "iris-blur", labelKey: "canvas.ps.filter.irisBlur", group: "blur", controls: [slider("blur", "canvas.ps.filter.blur", 0, 100, "px"), slider("x", "canvas.ps.filter.centerX", 0, 100, "%"), slider("y", "canvas.ps.filter.centerY", 0, 100, "%"), slider("radius", "canvas.ps.filter.radius", 0, 100, "%"), slider("feather", "canvas.ps.filter.feather", 0, 100, "%")], defaults: { blur: 12, x: 50, y: 50, radius: 35, feather: 40 } },
    { type: "sharpen", labelKey: "canvas.ps.filter.sharpen", group: "sharpen", controls: [slider("amount", "canvas.ps.filter.amount", 1, 500, "%")], defaults: { amount: 100 } },
    { type: "unsharp-mask", labelKey: "canvas.ps.filter.unsharpMask", group: "sharpen", controls: [slider("amount", "canvas.ps.filter.amount", 1, 500, "%"), slider("radius", "canvas.ps.filter.radius", 1, 100, "px"), slider("threshold", "canvas.ps.filter.threshold", 0, 255)], defaults: { amount: 100, radius: 2, threshold: 0 } },
    { type: "add-noise", labelKey: "canvas.ps.filter.addNoise", group: "noise", controls: [slider("amount", "canvas.ps.filter.amount", 1, 100, "%"), select("distribution", "canvas.ps.filter.distribution", [{ value: "uniform", labelKey: "canvas.ps.filter.uniform" }, { value: "gaussian", labelKey: "canvas.ps.filter.gaussian" }]), { key: "monochrome", labelKey: "canvas.ps.filter.monochrome", kind: "checkbox" }], defaults: { amount: 12, distribution: "uniform", monochrome: 1 } },
    { type: "despeckle", labelKey: "canvas.ps.filter.despeckle", group: "noise", controls: [], defaults: {} },
    { type: "dust-scratches", labelKey: "canvas.ps.filter.dustScratches", group: "noise", controls: [slider("radius", "canvas.ps.filter.radius", 1, 3, "px"), slider("threshold", "canvas.ps.filter.threshold", 0, 255)], defaults: { radius: 1, threshold: 16 } },
    { type: "pixelate", labelKey: "canvas.ps.filter.pixelate", group: "pixelate", controls: [slider("size", "canvas.ps.filter.cellSize", 2, 200, "px")], defaults: { size: 12 } },
    { type: "crystallize", labelKey: "canvas.ps.filter.crystallize", group: "pixelate", controls: [slider("size", "canvas.ps.filter.cellSize", 3, 200, "px")], defaults: { size: 16 } },
    { type: "emboss", labelKey: "canvas.ps.filter.emboss", group: "stylize", controls: [slider("angle", "canvas.ps.filter.angle", -180, 180, "°"), slider("height", "canvas.ps.filter.height", 1, 20, "px"), slider("amount", "canvas.ps.filter.amount", 1, 500, "%")], defaults: { angle: 135, height: 3, amount: 100 } },
    { type: "find-edges", labelKey: "canvas.ps.filter.findEdges", group: "stylize", controls: [], defaults: {} },
    { type: "solarize", labelKey: "canvas.ps.filter.solarize", group: "stylize", controls: [slider("threshold", "canvas.ps.filter.threshold", 0, 255)], defaults: { threshold: 128 } },
    { type: "clouds", labelKey: "canvas.ps.filter.clouds", group: "stylize", controls: [slider("size", "canvas.ps.filter.cellSize", 2, 400, "px"), slider("seed", "canvas.ps.filter.seed", 1, 9999)], defaults: { size: 64, seed: 7 } },
    { type: "lens-flare", labelKey: "canvas.ps.filter.lensFlare", group: "stylize", controls: [slider("brightness", "canvas.ps.filter.brightness", 10, 300, "%"), slider("x", "canvas.ps.filter.centerX", 0, 100, "%"), slider("y", "canvas.ps.filter.centerY", 0, 100, "%")], defaults: { brightness: 100, x: 30, y: 30 } },
    { type: "ripple", labelKey: "canvas.ps.filter.ripple", group: "distort", controls: [slider("amount", "canvas.ps.filter.amount", 1, 100, "px"), slider("size", "canvas.ps.filter.wavelength", 2, 400, "px")], defaults: { amount: 10, size: 60 } },
    { type: "pinch", labelKey: "canvas.ps.filter.pinch", group: "distort", controls: [slider("amount", "canvas.ps.filter.amount", -100, 100, "%")], defaults: { amount: 50 } },
    { type: "spherize", labelKey: "canvas.ps.filter.spherize", group: "distort", controls: [slider("amount", "canvas.ps.filter.amount", -100, 100, "%"), select("mode", "canvas.ps.filter.mode", [{ value: "normal", labelKey: "canvas.ps.filter.modeNormal" }, { value: "horizontal", labelKey: "canvas.ps.filter.modeHorizontal" }, { value: "vertical", labelKey: "canvas.ps.filter.modeVertical" }])], defaults: { amount: 50, mode: "normal" } },
    { type: "liquify", labelKey: "canvas.ps.filter.liquify", group: "distort", controls: [slider("size", "canvas.ps.filter.brushSize", 10, 300, "px"), slider("pressure", "canvas.ps.filter.pressure", 1, 100, "%")], defaults: { size: 80, pressure: 60 } },
];

export const PS_FILTER_BY_TYPE = new Map(PS_FILTERS.map((filter) => [filter.type, filter]));

export function psFilterParams(type: PsFilterType) {
    return { ...(PS_FILTER_BY_TYPE.get(type)?.defaults || {}) };
}

const TAU = Math.PI * 2;
const clampByte = (value: number) => Math.min(255, Math.max(0, Math.round(value)));
const clampIndex = (value: number, limit: number) => Math.min(limit - 1, Math.max(0, value));
const num = (params: PsFilterParams, key: string, fallback: number) => (typeof params[key] === "number" ? (params[key] as number) : fallback);
const str = (params: PsFilterParams, key: string, fallback: string) => (typeof params[key] === "string" ? (params[key] as string) : fallback);

function psCloneImage(image: ImageData) {
    return new ImageData(new Uint8ClampedArray(image.data), image.width, image.height);
}

function psBoxBlur(image: ImageData, radius: number) {
    const r = Math.round(radius);
    if (r < 1) return;
    const { data, width, height } = image;
    const temp = new Uint8ClampedArray(data.length);
    const span = 2 * r + 1;
    for (let y = 0; y < height; y += 1) {
        for (let channel = 0; channel < 4; channel += 1) {
            let sum = 0;
            for (let offset = -r; offset <= r; offset += 1) sum += data[(y * width + clampIndex(offset, width)) * 4 + channel];
            for (let x = 0; x < width; x += 1) {
                temp[(y * width + x) * 4 + channel] = sum / span;
                sum += data[(y * width + clampIndex(x + r + 1, width)) * 4 + channel] - data[(y * width + clampIndex(x - r, width)) * 4 + channel];
            }
        }
    }
    for (let x = 0; x < width; x += 1) {
        for (let channel = 0; channel < 4; channel += 1) {
            let sum = 0;
            for (let offset = -r; offset <= r; offset += 1) sum += temp[(clampIndex(offset, height) * width + x) * 4 + channel];
            for (let y = 0; y < height; y += 1) {
                data[(y * width + x) * 4 + channel] = sum / span;
                sum += temp[(clampIndex(y + r + 1, height) * width + x) * 4 + channel] - temp[(clampIndex(y - r, height) * width + x) * 4 + channel];
            }
        }
    }
}

function psGaussianBlur(image: ImageData, radius: number) {
    const r = Math.max(1, Math.round((Math.sqrt(4 * radius * radius + 1) - 1) / 2));
    for (let pass = 0; pass < 3; pass += 1) psBoxBlur(image, r);
}

function psConvolve(image: ImageData, kernel: number[], size: number, divisor: number, offset = 0) {
    const { data, width, height } = image;
    const source = new Uint8ClampedArray(data);
    const half = (size - 1) / 2;
    const total = divisor || kernel.reduce((sum, value) => sum + value, 0) || 1;
    for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
            let r = 0;
            let g = 0;
            let b = 0;
            for (let ky = 0; ky < size; ky += 1) {
                for (let kx = 0; kx < size; kx += 1) {
                    const weight = kernel[ky * size + kx];
                    if (!weight) continue;
                    const index = (clampIndex(y + ky - half, height) * width + clampIndex(x + kx - half, width)) * 4;
                    r += source[index] * weight;
                    g += source[index + 1] * weight;
                    b += source[index + 2] * weight;
                }
            }
            const index = (y * width + x) * 4;
            data[index] = clampByte(r / total + offset);
            data[index + 1] = clampByte(g / total + offset);
            data[index + 2] = clampByte(b / total + offset);
        }
    }
}

function psMedian(image: ImageData, radius: number, threshold: number) {
    const { data, width, height } = image;
    const source = new Uint8ClampedArray(data);
    const size = radius * 2 + 1;
    const window = new Float64Array(size * size);
    const medianOf = (count: number) => {
        for (let index = 1; index < count; index += 1) {
            const value = window[index];
            let position = index - 1;
            while (position >= 0 && window[position] > value) {
                window[position + 1] = window[position];
                position -= 1;
            }
            window[position + 1] = value;
        }
        return window[count >> 1];
    };
    for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
            for (let channel = 0; channel < 3; channel += 1) {
                let count = 0;
                for (let ky = -radius; ky <= radius; ky += 1) {
                    for (let kx = -radius; kx <= radius; kx += 1) window[count++] = source[(clampIndex(y + ky, height) * width + clampIndex(x + kx, width)) * 4 + channel];
                }
                const median = medianOf(count);
                const index = (y * width + x) * 4 + channel;
                if (threshold <= 0 || Math.abs(data[index] - median) > threshold) data[index] = median;
            }
        }
    }
}

function psSampleBilinear(data: Uint8ClampedArray, width: number, height: number, x: number, y: number) {
    const cx = Math.min(width - 1, Math.max(0, x));
    const cy = Math.min(height - 1, Math.max(0, y));
    const x0 = Math.floor(cx);
    const y0 = Math.floor(cy);
    const x1 = Math.min(width - 1, x0 + 1);
    const y1 = Math.min(height - 1, y0 + 1);
    const fx = cx - x0;
    const fy = cy - y0;
    const top = (y0 * width + x0) * 4;
    const topRight = (y0 * width + x1) * 4;
    const bottom = (y1 * width + x0) * 4;
    const bottomRight = (y1 * width + x1) * 4;
    const mix = (offset: number) => data[top + offset] * (1 - fx) * (1 - fy) + data[topRight + offset] * fx * (1 - fy) + data[bottom + offset] * (1 - fx) * fy + data[bottomRight + offset] * fx * fy;
    return [mix(0), mix(1), mix(2), mix(3)];
}

function psRemap(image: ImageData, map: (x: number, y: number) => [number, number]) {
    const { width, height } = image;
    const source = new Uint8ClampedArray(image.data);
    const data = image.data;
    for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
            const [sx, sy] = map(x, y);
            const [r, g, b, a] = psSampleBilinear(source, width, height, sx, sy);
            const index = (y * width + x) * 4;
            data[index] = r;
            data[index + 1] = g;
            data[index + 2] = b;
            data[index + 3] = a;
        }
    }
}

function psValueNoise(width: number, height: number, cell: number, seed: number) {
    const random = (x: number, y: number) => {
        const value = Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453;
        return value - Math.floor(value);
    };
    const grid = new Float32Array(width * height);
    const scale = Math.max(1, cell);
    const octaves = 4;
    let amplitude = 1;
    let total = 0;
    for (let octave = 0; octave < octaves; octave += 1) {
        const step = Math.max(1, scale / Math.pow(2, octave));
        for (let y = 0; y < height; y += 1) {
            for (let x = 0; x < width; x += 1) {
                const gx = Math.floor(x / step);
                const gy = Math.floor(y / step);
                const fx = x / step - gx;
                const fy = y / step - gy;
                const sx = fx * fx * (3 - 2 * fx);
                const sy = fy * fy * (3 - 2 * fy);
                const top = random(gx, gy) * (1 - sx) + random(gx + 1, gy) * sx;
                const bottom = random(gx, gy + 1) * (1 - sx) + random(gx + 1, gy + 1) * sx;
                grid[y * width + x] += (top * (1 - sy) + bottom * sy) * amplitude;
            }
        }
        total += amplitude;
        amplitude *= 0.5;
    }
    for (let index = 0; index < grid.length; index += 1) grid[index] = (grid[index] / total) * 255;
    return grid;
}

function psApplyBlurMix(image: ImageData, blurred: ImageData, maskAt: (x: number, y: number) => number) {
    const data = image.data;
    const source = blurred.data;
    for (let index = 0; index < data.length; index += 4) {
        const pixel = index >> 2;
        const weight = Math.min(1, Math.max(0, maskAt(pixel % image.width, Math.floor(pixel / image.width))));
        data[index] += (source[index] - data[index]) * weight;
        data[index + 1] += (source[index + 1] - data[index + 1]) * weight;
        data[index + 2] += (source[index + 2] - data[index + 2]) * weight;
        data[index + 3] += (source[index + 3] - data[index + 3]) * weight;
    }
}

/** One destructive filter applied to a layer bitmap in place; the interactive liquify filter is driven by its dialog instead. */
export function applyPsFilter(image: ImageData, type: PsFilterType, params: PsFilterParams) {
    if (type === "gaussian-blur") return psGaussianBlur(image, num(params, "radius", 4));
    if (type === "box-blur") return psBoxBlur(image, num(params, "radius", 4));
    if (type === "motion-blur") {
        const distance = Math.max(1, Math.round(num(params, "distance", 12)));
        const stride = Math.max(1, Math.ceil(distance / 48));
        const radians = (num(params, "angle", 0) * Math.PI) / 180;
        const dx = Math.cos(radians);
        const dy = Math.sin(radians);
        const { width, height } = image;
        const source = new Uint8ClampedArray(image.data);
        const data = image.data;
        for (let y = 0; y < height; y += 1) {
            for (let x = 0; x < width; x += 1) {
                let r = 0;
                let g = 0;
                let b = 0;
                let a = 0;
                let count = 0;
                for (let offset = -distance / 2; offset <= distance / 2; offset += stride) {
                    const index = (clampIndex(Math.round(y + dy * offset), height) * width + clampIndex(Math.round(x + dx * offset), width)) * 4;
                    r += source[index];
                    g += source[index + 1];
                    b += source[index + 2];
                    a += source[index + 3];
                    count += 1;
                }
                const index = (y * width + x) * 4;
                data[index] = r / count;
                data[index + 1] = g / count;
                data[index + 2] = b / count;
                data[index + 3] = a / count;
            }
        }
        return;
    }
    if (type === "radial-blur") {
        const amount = num(params, "amount", 10);
        const method = str(params, "method", "zoom");
        const { width, height } = image;
        const cx = width / 2;
        const cy = height / 2;
        const samples = 12;
        const source = new Uint8ClampedArray(image.data);
        const data = image.data;
        for (let y = 0; y < height; y += 1) {
            for (let x = 0; x < width; x += 1) {
                let r = 0;
                let g = 0;
                let b = 0;
                let a = 0;
                for (let step = 0; step < samples; step += 1) {
                    const t = ((step - samples / 2) / samples) * (amount / 100);
                    const sampleX = method === "spin" ? cx + (x - cx) * Math.cos(t) - (y - cy) * Math.sin(t) : cx + (x - cx) * (1 + t);
                    const sampleY = method === "spin" ? cy + (x - cx) * Math.sin(t) + (y - cy) * Math.cos(t) : cy + (y - cy) * (1 + t);
                    const [sr, sg, sb, sa] = psSampleBilinear(source, width, height, sampleX, sampleY);
                    r += sr;
                    g += sg;
                    b += sb;
                    a += sa;
                }
                const index = (y * width + x) * 4;
                data[index] = r / samples;
                data[index + 1] = g / samples;
                data[index + 2] = b / samples;
                data[index + 3] = a / samples;
            }
        }
        return;
    }
    if (type === "tilt-shift") {
        const blur = num(params, "blur", 12);
        const angle = (num(params, "angle", 0) * Math.PI) / 180;
        const position = num(params, "position", 50) / 100;
        const width = Math.max(0.05, num(params, "width", 30) / 100);
        const blurred = psCloneImage(image);
        psGaussianBlur(blurred, blur);
        const nx = Math.sin(angle);
        const ny = -Math.cos(angle);
        const cx = image.width / 2;
        const cy = image.height * position;
        const extent = image.height / 2;
        return psApplyBlurMix(image, blurred, (x, y) => {
            const distance = Math.abs((x - cx) * nx + (y - cy) * ny) / extent;
            return Math.min(1, Math.max(0, (distance - width) / Math.max(0.05, width)));
        });
    }
    if (type === "iris-blur") {
        const blur = num(params, "blur", 12);
        const blurred = psCloneImage(image);
        psGaussianBlur(blurred, blur);
        const cx = (num(params, "x", 50) / 100) * image.width;
        const cy = (num(params, "y", 50) / 100) * image.height;
        const radius = (num(params, "radius", 35) / 100) * Math.min(image.width, image.height);
        const feather = Math.max(1, (num(params, "feather", 40) / 100) * Math.min(image.width, image.height));
        return psApplyBlurMix(image, blurred, (x, y) => {
            const distance = Math.hypot(x - cx, y - cy);
            return Math.min(1, Math.max(0, (distance - radius) / feather));
        });
    }
    if (type === "sharpen") {
        const amount = num(params, "amount", 100) / 100;
        return psConvolve(image, [0, -amount, 0, -amount, 1 + 4 * amount, -amount, 0, -amount, 0], 3, 1);
    }
    if (type === "unsharp-mask") {
        const amount = num(params, "amount", 100) / 100;
        const threshold = num(params, "threshold", 0);
        const blurred = psCloneImage(image);
        psGaussianBlur(blurred, num(params, "radius", 2));
        const data = image.data;
        const source = blurred.data;
        for (let index = 0; index < data.length; index += 4) {
            for (let channel = 0; channel < 3; channel += 1) {
                const difference = data[index + channel] - source[index + channel];
                if (Math.abs(difference) > threshold) data[index + channel] = clampByte(data[index + channel] + difference * amount);
            }
        }
        return;
    }
    if (type === "add-noise") {
        const amount = num(params, "amount", 12) * 2.55;
        const gaussian = str(params, "distribution", "uniform") === "gaussian";
        const monochrome = num(params, "monochrome", 1) >= 0.5;
        const data = image.data;
        const random = () => (gaussian ? (Math.random() + Math.random() + Math.random() + Math.random() - 2) / 2 : Math.random() * 2 - 1) * amount;
        for (let index = 0; index < data.length; index += 4) {
            const shared = random();
            for (let channel = 0; channel < 3; channel += 1) data[index + channel] = clampByte(data[index + channel] + (monochrome ? shared : random()));
        }
        return;
    }
    if (type === "despeckle") return psMedian(image, 1, 0);
    if (type === "dust-scratches") return psMedian(image, Math.round(num(params, "radius", 1)), num(params, "threshold", 16));
    if (type === "pixelate") {
        const size = Math.max(2, Math.round(num(params, "size", 12)));
        const { data, width, height } = image;
        for (let y = 0; y < height; y += size) {
            for (let x = 0; x < width; x += size) {
                let r = 0;
                let g = 0;
                let b = 0;
                let a = 0;
                let count = 0;
                for (let py = y; py < Math.min(height, y + size); py += 1) {
                    for (let px = x; px < Math.min(width, x + size); px += 1) {
                        const index = (py * width + px) * 4;
                        r += data[index];
                        g += data[index + 1];
                        b += data[index + 2];
                        a += data[index + 3];
                        count += 1;
                    }
                }
                const fill = [r / count, g / count, b / count, a / count];
                for (let py = y; py < Math.min(height, y + size); py += 1) {
                    for (let px = x; px < Math.min(width, x + size); px += 1) {
                        const index = (py * width + px) * 4;
                        data[index] = fill[0];
                        data[index + 1] = fill[1];
                        data[index + 2] = fill[2];
                        data[index + 3] = fill[3];
                    }
                }
            }
        }
        return;
    }
    if (type === "crystallize") {
        const size = Math.max(3, Math.round(num(params, "size", 16)));
        const { width, height } = image;
        const cols = Math.ceil(width / size) + 2;
        const rows = Math.ceil(height / size) + 2;
        const centres = Array.from({ length: cols * rows }, (_, index) => {
            const col = index % cols;
            const row = Math.floor(index / cols);
            return { x: (col - 0.5) * size + Math.random() * size, y: (row - 0.5) * size + Math.random() * size, r: 0, g: 0, b: 0, a: 0, count: 0 };
        });
        const data = image.data;
        for (let y = 0; y < height; y += 1) {
            for (let x = 0; x < width; x += 1) {
                const index = (y * width + x) * 4;
                let best = 0;
                let bestDistance = Infinity;
                const col = Math.floor(x / size) + 1;
                const row = Math.floor(y / size) + 1;
                for (let oy = -1; oy <= 1; oy += 1) {
                    for (let ox = -1; ox <= 1; ox += 1) {
                        const centre = centres[(row + oy) * cols + col + ox];
                        const distance = (centre.x - x) * (centre.x - x) + (centre.y - y) * (centre.y - y);
                        if (distance < bestDistance) {
                            bestDistance = distance;
                            best = (row + oy) * cols + col + ox;
                        }
                    }
                }
                const target = centres[best];
                target.r += data[index];
                target.g += data[index + 1];
                target.b += data[index + 2];
                target.a += data[index + 3];
                target.count += 1;
                data[index + 3] = 0;
            }
        }
        for (let y = 0; y < height; y += 1) {
            for (let x = 0; x < width; x += 1) {
                const index = (y * width + x) * 4;
                let best = 0;
                let bestDistance = Infinity;
                const col = Math.floor(x / size) + 1;
                const row = Math.floor(y / size) + 1;
                for (let oy = -1; oy <= 1; oy += 1) {
                    for (let ox = -1; ox <= 1; ox += 1) {
                        const centre = centres[(row + oy) * cols + col + ox];
                        const distance = (centre.x - x) * (centre.x - x) + (centre.y - y) * (centre.y - y);
                        if (distance < bestDistance) {
                            bestDistance = distance;
                            best = (row + oy) * cols + col + ox;
                        }
                    }
                }
                const target = centres[best];
                data[index] = target.r / target.count;
                data[index + 1] = target.g / target.count;
                data[index + 2] = target.b / target.count;
                data[index + 3] = target.a / target.count;
            }
        }
        return;
    }
    if (type === "emboss") {
        const angle = (num(params, "angle", 135) * Math.PI) / 180;
        const height = num(params, "height", 3);
        const amount = num(params, "amount", 100) / 100;
        const dx = Math.cos(angle) * height;
        const dy = -Math.sin(angle) * height;
        const { width, data } = image;
        const source = new Uint8ClampedArray(data);
        for (let y = 0; y < image.height; y += 1) {
            for (let x = 0; x < width; x += 1) {
                const light = psSampleBilinear(source, width, image.height, x + dx, y + dy);
                const shade = psSampleBilinear(source, width, image.height, x - dx, y - dy);
                const index = (y * width + x) * 4;
                for (let channel = 0; channel < 3; channel += 1) data[index + channel] = clampByte(128 + (light[channel] - shade[channel]) * amount);
            }
        }
        return;
    }
    if (type === "find-edges") {
        const { data, width, height } = image;
        const source = new Uint8ClampedArray(data);
        const luma = (x: number, y: number) => {
            const index = (clampIndex(y, height) * width + clampIndex(x, width)) * 4;
            return 0.299 * source[index] + 0.587 * source[index + 1] + 0.114 * source[index + 2];
        };
        for (let y = 0; y < height; y += 1) {
            for (let x = 0; x < width; x += 1) {
                const gx = luma(x + 1, y - 1) + 2 * luma(x + 1, y) + luma(x + 1, y + 1) - luma(x - 1, y - 1) - 2 * luma(x - 1, y) - luma(x - 1, y + 1);
                const gy = luma(x - 1, y + 1) + 2 * luma(x, y + 1) + luma(x + 1, y + 1) - luma(x - 1, y - 1) - 2 * luma(x, y - 1) - luma(x + 1, y - 1);
                const magnitude = Math.min(255, Math.hypot(gx, gy));
                const value = clampByte(255 - magnitude);
                const index = (y * width + x) * 4;
                data[index] = value;
                data[index + 1] = value;
                data[index + 2] = value;
            }
        }
        return;
    }
    if (type === "solarize") {
        const threshold = num(params, "threshold", 128);
        const data = image.data;
        for (let index = 0; index < data.length; index += 4) {
            if (0.299 * data[index] + 0.587 * data[index + 1] + 0.114 * data[index + 2] < threshold) continue;
            data[index] = 255 - data[index];
            data[index + 1] = 255 - data[index + 1];
            data[index + 2] = 255 - data[index + 2];
        }
        return;
    }
    if (type === "ripple") {
        const amount = num(params, "amount", 10);
        const size = Math.max(2, num(params, "size", 60));
        return psRemap(image, (x, y) => [x + amount * Math.sin((y / size) * TAU), y + amount * Math.sin((x / size) * TAU)]);
    }
    if (type === "pinch") {
        const amount = num(params, "amount", 50) / 100;
        const { width, height } = image;
        const cx = width / 2;
        const cy = height / 2;
        const limit = Math.min(cx, cy);
        return psRemap(image, (x, y) => {
            const dx = x - cx;
            const dy = y - cy;
            const distance = Math.hypot(dx, dy);
            if (distance >= limit) return [x, y];
            const scale = 1 + amount * (1 - distance / limit) * 0.9;
            return [cx + dx * scale, cy + dy * scale];
        });
    }
    if (type === "spherize") {
        const amount = num(params, "amount", 50) / 100;
        const mode = str(params, "mode", "normal");
        const { width, height } = image;
        const cx = width / 2;
        const cy = height / 2;
        const limit = Math.min(cx, cy);
        return psRemap(image, (x, y) => {
            const dx = x - cx;
            const dy = y - cy;
            const distance = Math.hypot(dx, dy);
            if (distance >= limit) return [x, y];
            const factor = 1 + amount * (1 - Math.pow(distance / limit, 2));
            if (mode === "horizontal") return [cx + dx * factor, y];
            if (mode === "vertical") return [x, cy + dy * factor];
            return [cx + dx * factor, cy + dy * factor];
        });
    }
    if (type === "clouds") {
        const { width, height, data } = image;
        const grid = psValueNoise(width, height, num(params, "size", 64), num(params, "seed", 7));
        for (let pixel = 0; pixel < grid.length; pixel += 1) {
            const index = pixel * 4;
            data[index] = grid[pixel];
            data[index + 1] = grid[pixel];
            data[index + 2] = grid[pixel];
            data[index + 3] = 255;
        }
        return;
    }
    if (type === "lens-flare") {
        const brightness = num(params, "brightness", 100) / 100;
        const cx = (num(params, "x", 30) / 100) * image.width;
        const cy = (num(params, "y", 30) / 100) * image.height;
        const flare = createCanvasContext(image.width, image.height);
        const flareContext = flare.context;
        if (!flareContext) return;
        const limit = Math.min(image.width, image.height);
        const glow = flareContext.createRadialGradient(cx, cy, 0, cx, cy, limit * 0.9);
        glow.addColorStop(0, `rgba(255,250,235,${Math.min(1, brightness)})`);
        glow.addColorStop(0.12, `rgba(255,238,200,${Math.min(1, brightness * 0.7)})`);
        glow.addColorStop(0.35, `rgba(255,200,140,${Math.min(1, brightness * 0.25)})`);
        glow.addColorStop(1, "rgba(255,200,140,0)");
        flareContext.fillStyle = glow;
        flareContext.fillRect(0, 0, image.width, image.height);
        const dx = image.width / 2 - cx;
        const dy = image.height / 2 - cy;
        [
            { t: -0.3, r: 0.08, color: "255,220,180" },
            { t: 0.4, r: 0.05, color: "200,230,255" },
            { t: 0.7, r: 0.09, color: "255,240,200" },
            { t: 1.2, r: 0.12, color: "255,190,150" },
        ].forEach((item) => {
            const x = cx + dx * item.t;
            const y = cy + dy * item.t;
            const radius = limit * item.r;
            const spot = flareContext.createRadialGradient(x, y, 0, x, y, radius);
            spot.addColorStop(0, `rgba(${item.color},${Math.min(1, brightness * 0.5)})`);
            spot.addColorStop(1, `rgba(${item.color},0)`);
            flareContext.fillStyle = spot;
            flareContext.fillRect(x - radius, y - radius, radius * 2, radius * 2);
        });
        const source = flareContext.getImageData(0, 0, image.width, image.height).data;
        const data = image.data;
        for (let index = 0; index < data.length; index += 4) {
            data[index] = clampByte(255 - ((255 - data[index]) * (255 - source[index])) / 255);
            data[index + 1] = clampByte(255 - ((255 - data[index + 1]) * (255 - source[index + 1])) / 255);
            data[index + 2] = clampByte(255 - ((255 - data[index + 2]) * (255 - source[index + 2])) / 255);
        }
        return;
    }
    if (type === "liquify") return;
}

/** Pushes pixels forward under the liquify brush; the dialog calls it per pointer move on its working bitmap. */
export function psLiquifyPush(image: ImageData, point: { x: number; y: number }, delta: { x: number; y: number }, radius: number, pressure: number) {
    const { width, height } = image;
    const limit = Math.min(Math.max(1, radius), 600);
    const source = new Uint8ClampedArray(image.data);
    const data = image.data;
    const x0 = Math.max(0, Math.floor(point.x - limit));
    const y0 = Math.max(0, Math.floor(point.y - limit));
    const x1 = Math.min(width, Math.ceil(point.x + limit));
    const y1 = Math.min(height, Math.ceil(point.y + limit));
    const strength = Math.max(0.01, Math.min(1, pressure));
    for (let y = y0; y < y1; y += 1) {
        for (let x = x0; x < x1; x += 1) {
            const distance = Math.hypot(x - point.x, y - point.y);
            if (distance > limit) continue;
            const weight = (1 - distance / limit) * strength;
            const [r, g, b, a] = psSampleBilinear(source, width, height, x - delta.x * weight, y - delta.y * weight);
            const index = (y * width + x) * 4;
            data[index] = r;
            data[index + 1] = g;
            data[index + 2] = b;
            data[index + 3] = a;
        }
    }
}

/** Loads the bitmap a filter will rewrite: a pixel layer's own bitmap, an image layer's source, or a rasterised text / shape / group layer. */
export async function psLoadFilterSource(layer: CanvasPsLayer, layers: CanvasPsLayer[], nodes: CanvasNodeData[]) {
    const width = psBitmapSize(layer.width);
    const height = psBitmapSize(layer.height);
    const { canvas, context } = createCanvasContext(width, height);
    if (!context) return null;
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    if (layer.kind === "pixel" || layer.kind === "image") {
        const source = layer.kind === "pixel" ? undefined : nodes.find((node) => node.id === layer.sourceNodeId);
        const url = layer.kind === "pixel" ? await resolveImageUrl(layer.storageKey) : await resolveImageUrl(source?.metadata?.storageKey, source?.metadata?.content || "");
        const image = await psLoadImage(url);
        if (image) context.drawImage(image, 0, 0, width, height);
        return canvas;
    }
    const rasterised = await renderPsLayerBitmap(layer, layers, nodes);
    if (rasterised) context.drawImage(rasterised, 0, 0, width, height);
    return canvas;
}

/** Mask weight per pixel: the layer mask times the active selection, both mapped into the layer's own pixel space (rotation included); null means "no clipping". */
export async function psFilterMask(width: number, height: number, layer: CanvasPsLayer, selection: PsSelection | null, maskUrl?: string) {
    if (!maskUrl && !selection) return null;
    const mask = new Float32Array(width * height).fill(1);
    const read = (canvas: HTMLCanvasElement) => {
        const context = canvas.getContext("2d");
        if (!context) return;
        const { data } = context.getImageData(0, 0, width, height);
        for (let pixel = 0; pixel < mask.length; pixel += 1) mask[pixel] *= data[pixel * 4 + 3] / 255;
    };
    if (maskUrl) {
        const image = await psLoadImage(maskUrl);
        if (image) {
            const canvas = createCanvasContext(width, height);
            if (canvas.context) {
                canvas.context.drawImage(image, 0, 0, width, height);
                const clip = psSelectionToLayerSpace({ canvas: canvas.canvas }, layer, width, height);
                if (clip) read(clip);
            }
        }
    }
    if (selection) {
        const clip = psSelectionToLayerSpace(selection, layer, width, height);
        if (clip) read(clip);
    }
    return mask;
}

export function psMixFiltered(base: ImageData, filtered: ImageData, mask: Float32Array | null) {
    if (!mask) return filtered;
    const data = base.data;
    const source = filtered.data;
    for (let pixel = 0; pixel < mask.length; pixel += 1) {
        const weight = mask[pixel];
        if (weight >= 1) continue;
        const index = pixel * 4;
        for (let channel = 0; channel < 4; channel += 1) data[index + channel] += (source[index + channel] - data[index + channel]) * weight;
    }
    return base;
}

export async function psFilterLayerBitmap(layer: CanvasPsLayer, layers: CanvasPsLayer[], nodes: CanvasNodeData[], type: PsFilterType, params: PsFilterParams, source: { selection: PsSelection | null; maskUrl?: string }) {
    const canvas = await psLoadFilterSource(layer, layers, nodes);
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return null;
    const base = context.getImageData(0, 0, canvas.width, canvas.height);
    const filtered = psCloneImage(base);
    applyPsFilter(filtered, type, params);
    const mask = await psFilterMask(canvas.width, canvas.height, layer, source.selection, source.maskUrl);
    context.putImageData(psMixFiltered(base, filtered, mask), 0, 0);
    return psCanvasToBlob(canvas);
}
