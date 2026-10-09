import type { CanvasPixelBlend } from "@/types/canvas";

export type Rgba = [number, number, number, number];

const clamp = (value: number) => (value < 0 ? 0 : value > 255 ? 255 : Math.round(value));

export function hexToRgba(hex: string): Rgba {
    const value = hex.trim().toLowerCase();
    if (value === "transparent") return [0, 0, 0, 0];
    const body = value.startsWith("#") ? value.slice(1) : value;
    if (body.length === 3 || body.length === 4) {
        const [r, g, b, a] = body.split("").map((char) => parseInt(char + char, 16));
        return [r, g, b, body.length === 4 ? a : 255];
    }
    if (body.length === 6 || body.length === 8) {
        const r = parseInt(body.slice(0, 2), 16);
        const g = parseInt(body.slice(2, 4), 16);
        const b = parseInt(body.slice(4, 6), 16);
        return [r, g, b, body.length === 8 ? parseInt(body.slice(6, 8), 16) : 255];
    }
    return [0, 0, 0, 255];
}

export function rgbaToHex(rgba: Rgba): string {
    const part = (channel: number) => clamp(channel).toString(16).padStart(2, "0");
    const [r, g, b, a] = rgba;
    return `#${part(r)}${part(g)}${part(b)}${a < 255 ? part(a) : ""}`;
}

export function makeBuffer(width: number, height: number): Uint8ClampedArray {
    return new Uint8ClampedArray(Math.max(0, width * height * 4));
}

export function getPixel(buf: Uint8ClampedArray, w: number, h: number, x: number, y: number): Rgba {
    if (x < 0 || y < 0 || x >= w || y >= h) return [0, 0, 0, 0];
    const index = (y * w + x) * 4;
    return [buf[index], buf[index + 1], buf[index + 2], buf[index + 3]];
}

export function setPixel(buf: Uint8ClampedArray, w: number, h: number, x: number, y: number, rgba: Rgba): void {
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    const index = (y * w + x) * 4;
    buf[index] = rgba[0];
    buf[index + 1] = rgba[1];
    buf[index + 2] = rgba[2];
    buf[index + 3] = rgba[3];
}

export function drawLine(buf: Uint8ClampedArray, w: number, h: number, x0: number, y0: number, x1: number, y1: number, rgba: Rgba): void {
    let x = Math.round(x0);
    let y = Math.round(y0);
    const endX = Math.round(x1);
    const endY = Math.round(y1);
    const dx = Math.abs(endX - x);
    const dy = -Math.abs(endY - y);
    const sx = x < endX ? 1 : -1;
    const sy = y < endY ? 1 : -1;
    let error = dx + dy;
    for (;;) {
        setPixel(buf, w, h, x, y, rgba);
        if (x === endX && y === endY) break;
        const doubled = 2 * error;
        if (doubled >= dy) {
            error += dy;
            x += sx;
        }
        if (doubled <= dx) {
            error += dx;
            y += sy;
        }
    }
}

export function drawRect(buf: Uint8ClampedArray, w: number, h: number, x: number, y: number, rw: number, rh: number, rgba: Rgba, filled: boolean): void {
    const left = Math.min(x, x + rw);
    const right = Math.max(x, x + rw);
    const top = Math.min(y, y + rh);
    const bottom = Math.max(y, y + rh);
    if (filled) {
        for (let py = top; py < bottom; py++) for (let px = left; px < right; px++) setPixel(buf, w, h, px, py, rgba);
        return;
    }
    for (let px = left; px < right; px++) {
        setPixel(buf, w, h, px, top, rgba);
        setPixel(buf, w, h, px, bottom - 1, rgba);
    }
    for (let py = top; py < bottom; py++) {
        setPixel(buf, w, h, left, py, rgba);
        setPixel(buf, w, h, right - 1, py, rgba);
    }
}

export function drawEllipse(buf: Uint8ClampedArray, w: number, h: number, cx: number, cy: number, rx: number, ry: number, rgba: Rgba, filled: boolean): void {
    const a = Math.abs(Math.round(rx));
    const b = Math.abs(Math.round(ry));
    if (a === 0 && b === 0) return setPixel(buf, w, h, cx, cy, rgba);
    if (a === 0) return drawLine(buf, w, h, cx, cy - b, cx, cy + b, rgba);
    if (b === 0) return drawLine(buf, w, h, cx - a, cy, cx + a, cy, rgba);
    const span = (from: number, to: number, y: number) => {
        if (filled) for (let x = from; x <= to; x++) setPixel(buf, w, h, x, y, rgba);
        else {
            setPixel(buf, w, h, from, y, rgba);
            setPixel(buf, w, h, to, y, rgba);
        }
    };
    const plot = (x: number, y: number) => {
        span(cx - x, cx + x, cy + y);
        if (y !== 0) span(cx - x, cx + x, cy - y);
    };
    const a2 = a * a;
    const b2 = b * b;
    let x = 0;
    let y = b;
    let px = 0;
    let py = 2 * a2 * y;
    let decision = Math.round(b2 - a2 * b + 0.25 * a2);
    while (px < py) {
        plot(x, y);
        x += 1;
        px += 2 * b2;
        if (decision < 0) decision += b2 + px;
        else {
            y -= 1;
            py -= 2 * a2;
            decision += b2 + px - py;
        }
    }
    decision = Math.round(b2 * (x + 0.5) * (x + 0.5) + a2 * (y - 1) * (y - 1) - a2 * b2);
    while (y >= 0) {
        plot(x, y);
        y -= 1;
        py -= 2 * a2;
        if (decision > 0) decision += a2 - py;
        else {
            x += 1;
            px += 2 * b2;
            decision += a2 - py + px;
        }
    }
}

/** Matches `rgba` against the pixel at x/y within `tolerance` (0-255 per channel); returns pixels painted. */
export function floodFill(buf: Uint8ClampedArray, w: number, h: number, x: number, y: number, rgba: Rgba, tolerance = 0): number {
    if (x < 0 || y < 0 || x >= w || y >= h) return 0;
    const target = getPixel(buf, w, h, x, y);
    if (target.every((channel, index) => Math.abs(channel - rgba[index]) <= tolerance)) return 0;
    const close = (px: number, py: number) => {
        const pixel = getPixel(buf, w, h, px, py);
        return pixel.every((channel, index) => Math.abs(channel - target[index]) <= tolerance);
    };
    const painted = new Uint8Array(w * h);
    const stack: number[] = [y * w + x];
    let changed = 0;
    while (stack.length) {
        const index = stack.pop()!;
        if (painted[index]) continue;
        const px = index % w;
        const py = (index - px) / w;
        if (!close(px, py)) continue;
        painted[index] = 1;
        setPixel(buf, w, h, px, py, rgba);
        changed += 1;
        if (px > 0) stack.push(index - 1);
        if (px < w - 1) stack.push(index + 1);
        if (py > 0) stack.push(index - w);
        if (py < h - 1) stack.push(index + w);
    }
    return changed;
}

/** Raw copy of the overlapping region of `src` into `dst` at dx/dy (no alpha blending). */
export function blit(dst: Uint8ClampedArray, dw: number, dh: number, src: Uint8ClampedArray, sw: number, sh: number, dx: number, dy: number): void {
    for (let y = 0; y < sh; y++) {
        const targetY = dy + y;
        if (targetY < 0 || targetY >= dh) continue;
        for (let x = 0; x < sw; x++) {
            const targetX = dx + x;
            if (targetX < 0 || targetX >= dw) continue;
            const source = (y * sw + x) * 4;
            const target = (targetY * dw + targetX) * 4;
            dst[target] = src[source];
            dst[target + 1] = src[source + 1];
            dst[target + 2] = src[source + 2];
            dst[target + 3] = src[source + 3];
        }
    }
}

export function extractRegion(buf: Uint8ClampedArray, w: number, h: number, x: number, y: number, rw: number, rh: number): Uint8ClampedArray {
    const out = makeBuffer(rw, rh);
    for (let py = 0; py < rh; py++) {
        for (let px = 0; px < rw; px++) {
            const source = ((y + py) * w + (x + px)) * 4;
            const target = (py * rw + px) * 4;
            if (x + px < 0 || y + py < 0 || x + px >= w || y + py >= h) continue;
            out[target] = buf[source];
            out[target + 1] = buf[source + 1];
            out[target + 2] = buf[source + 2];
            out[target + 3] = buf[source + 3];
        }
    }
    return out;
}

export function resizeNearest(buf: Uint8ClampedArray, w: number, h: number, nw: number, nh: number): Uint8ClampedArray {
    const out = makeBuffer(nw, nh);
    if (w <= 0 || h <= 0 || nw <= 0 || nh <= 0) return out;
    for (let y = 0; y < nh; y++) {
        const sourceY = Math.min(h - 1, Math.floor((y * h) / nh));
        for (let x = 0; x < nw; x++) {
            const sourceX = Math.min(w - 1, Math.floor((x * w) / nw));
            const source = (sourceY * w + sourceX) * 4;
            const target = (y * nw + x) * 4;
            out[target] = buf[source];
            out[target + 1] = buf[source + 1];
            out[target + 2] = buf[source + 2];
            out[target + 3] = buf[source + 3];
        }
    }
    return out;
}

function blendChannel(mode: CanvasPixelBlend, backdrop: number, source: number): number {
    const cb = backdrop / 255;
    const cs = source / 255;
    if (mode === "multiply") return cb * cs * 255;
    if (mode === "screen") return (1 - (1 - cb) * (1 - cs)) * 255;
    if (mode === "overlay") return (cb < 0.5 ? 2 * cb * cs : 1 - 2 * (1 - cb) * (1 - cs)) * 255;
    if (mode === "add") return Math.min(255, backdrop + source);
    return source;
}

export function compositeLayers(layers: { buffer: Uint8ClampedArray; opacity: number; blend: CanvasPixelBlend; visible: boolean }[], w: number, h: number, background: string): Uint8ClampedArray {
    const out = makeBuffer(w, h);
    if (background !== "transparent") {
        const [r, g, b, a] = hexToRgba(background);
        for (let index = 0; index < out.length; index += 4) {
            out[index] = r;
            out[index + 1] = g;
            out[index + 2] = b;
            out[index + 3] = a;
        }
    }
    for (const layer of layers) {
        if (!layer.visible || layer.opacity <= 0) continue;
        for (let index = 0; index < out.length; index += 4) {
            const sourceAlpha = (layer.buffer[index + 3] / 255) * layer.opacity;
            if (sourceAlpha <= 0) continue;
            const backdropAlpha = out[index + 3] / 255;
            const outAlpha = sourceAlpha + backdropAlpha * (1 - sourceAlpha);
            if (outAlpha <= 0) continue;
            for (let channel = 0; channel < 3; channel++) {
                const blended = blendChannel(layer.blend, out[index + channel], layer.buffer[index + channel]);
                out[index + channel] = (blended * sourceAlpha + out[index + channel] * backdropAlpha * (1 - sourceAlpha)) / outAlpha;
            }
            out[index + 3] = outAlpha * 255;
        }
    }
    return out;
}
