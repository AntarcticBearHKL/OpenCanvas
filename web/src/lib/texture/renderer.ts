// Ported from texture-create (gameanimation.info) class J (index.clean.js 3149-3469).
// WebGL2 renderer: two programs (per-layer texture + post), ping-pong FBOs, gradient LUT.
import { TYPE_ID } from "./registry";
import { BLEND_MODE_ID } from "./types";
import type { EditorState, GradientStop, LayerState, PostEffects } from "./types";
import { VERTEX_SHADER } from "./shaders/vertex";
import { TEXTURE_SHADER } from "./shaders/texture";
import { POST_SHADER } from "./shaders/post";

const MAIN_UNIFORMS = [
    "u_type",
    "u_time",
    "u_polarConversion",
    "u_params",
    "u_invertEnable",
    "u_gradEnable",
    "u_gradTex",
    "u_isBaseLayer",
    "u_backTex",
    "u_blendMode",
    "u_opacity",
    "u_blackBackground",
    "u_solidColorEnabled",
    "u_solidColor",
    "u_transform",
    "u_scroll",
] as const;

const POST_UNIFORMS = [
    "u_mainTex",
    "u_time",
    "u_resolution",
    "u_blurEnabled",
    "u_blurStrength",
    "u_bloom_en",
    "u_bloom_st",
    "u_sharpenEnabled",
    "u_sharpenStrength",
    "u_pixelationEnabled",
    "u_pixelSize",
    "u_chromaticAberrationEnabled",
    "u_chromaticAberration",
    "u_vignetteEnabled",
    "u_vignetteStrength",
    "u_vignetteSize",
    "u_vignetteColor",
    "u_scanlineEnabled",
    "u_scanlineDensity",
    "u_scanlineSpeed",
    "u_scanlineStrength",
    "u_scanlineColor",
    "u_kaleidoscopeEnabled",
    "u_kaleidoSegments",
    "u_kaleidoRotation",
    "u_mirrorTileEnabled",
    "u_mirrorTileX",
    "u_mirrorTileY",
    "u_swirlEnabled",
    "u_swirlStrength",
    "u_swirlRadius",
    "u_edgeDetectionEnabled",
    "u_edgeThickness",
    "u_edgeColor",
    "u_toonEnabled",
    "u_toonDark",
    "u_toonLight",
    "u_vignetteMaskEnabled",
    "u_colorEnabled",
    "u_colorShadow",
    "u_colorMidtone",
    "u_colorHighlight",
] as const;

/** Grayscale ramp fallback (i,i,i,255), matching the default LUT texture. */
function grayscaleRamp(size: number): Uint8ClampedArray {
    const out = new Uint8ClampedArray(size * 4);
    const denom = size > 1 ? size - 1 : 1;
    for (let i = 0; i < size; i++) {
        const v = Math.round((i * 255) / denom);
        out[i * 4] = v;
        out[i * 4 + 1] = v;
        out[i * 4 + 2] = v;
        out[i * 4 + 3] = 255;
    }
    return out;
}

/** Rasterize gradient stops to a 1D RGBA lookup table (port of `_buildLUTFromStops`). */
export function buildGradientLUT(stops: GradientStop[], size = 256): Uint8ClampedArray {
    if (!stops || stops.length < 2) return grayscaleRamp(size);
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = 1;
    const ctx = canvas.getContext("2d");
    if (!ctx) return grayscaleRamp(size);
    const gradient = ctx.createLinearGradient(0, 0, size, 0);
    [...stops]
        .sort((a, b) => a.position - b.position)
        .forEach((stop) => gradient.addColorStop(Math.min(1, Math.max(0, stop.position)), stop.color));
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, 1);
    return ctx.getImageData(0, 0, size, 1).data;
}

export class TextureRenderer {
    private readonly canvas: HTMLCanvasElement;
    private gl: WebGL2RenderingContext | null = null;
    private program: WebGLProgram | null = null;
    private postProgram: WebGLProgram | null = null;
    private vertexBuffer: WebGLBuffer | null = null;
    private gradTexture: WebGLTexture | null = null;
    private fbos: Array<WebGLFramebuffer | null> = [null, null];
    private textures: Array<WebGLTexture | null> = [null, null];
    private locations: Record<string, WebGLUniformLocation | null> = {};
    private postLocations: Record<string, WebGLUniformLocation | null> = {};
    private _ready = false;

    constructor(canvas: HTMLCanvasElement) {
        this.canvas = canvas;
        try {
            this._init();
        } catch {
            this._ready = false;
        }
    }

    get ready(): boolean {
        return this._ready;
    }

    private _init(): void {
        const gl = this.canvas.getContext("webgl2", { preserveDrawingBuffer: true, alpha: true });
        if (!gl) {
            this._ready = false;
            return;
        }
        this.gl = gl;

        const program = this._createProgram(gl, VERTEX_SHADER, TEXTURE_SHADER);
        const postProgram = this._createProgram(gl, VERTEX_SHADER, POST_SHADER);
        if (!program || !postProgram) return;
        this.program = program;
        this.postProgram = postProgram;

        const vertices = new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]);
        const buffer = gl.createBuffer();
        this.vertexBuffer = buffer;
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);

        const attr = gl.getAttribLocation(program, "a_position");
        if (attr >= 0) {
            gl.enableVertexAttribArray(attr);
            gl.vertexAttribPointer(attr, 2, gl.FLOAT, false, 0, 0);
        }

        for (const name of MAIN_UNIFORMS) {
            this.locations[name] = gl.getUniformLocation(program, name);
        }
        for (const name of POST_UNIFORMS) {
            this.postLocations[name] = gl.getUniformLocation(postProgram, name);
        }

        this._createDefaultGradTexture(gl);
        this._setupFBOs();
        this._ready = true;
    }

    private _createShader(gl: WebGL2RenderingContext, type: GLenum, source: string): WebGLShader | null {
        const shader = gl.createShader(type);
        if (!shader) return null;
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        if (gl.getShaderParameter(shader, gl.COMPILE_STATUS)) return shader;
        console.error("Shader compile error:", gl.getShaderInfoLog(shader));
        gl.deleteShader(shader);
        return null;
    }

    private _createProgram(gl: WebGL2RenderingContext, vertexSrc: string, fragmentSrc: string): WebGLProgram | null {
        const vertex = this._createShader(gl, gl.VERTEX_SHADER, vertexSrc);
        const fragment = this._createShader(gl, gl.FRAGMENT_SHADER, fragmentSrc);
        if (!vertex || !fragment) return null;
        const program = gl.createProgram();
        if (!program) return null;
        gl.attachShader(program, vertex);
        gl.attachShader(program, fragment);
        gl.linkProgram(program);
        if (gl.getProgramParameter(program, gl.LINK_STATUS)) return program;
        console.error("Program link error:", gl.getProgramInfoLog(program));
        return null;
    }

    private _setupFBOs(): void {
        const gl = this.gl;
        if (!gl) return;
        const width = this.canvas.width;
        const height = this.canvas.height;
        for (let i = 0; i < 2; i++) {
            if (this.textures[i]) gl.deleteTexture(this.textures[i]);
            if (this.fbos[i]) gl.deleteFramebuffer(this.fbos[i]);
            this.textures[i] = gl.createTexture();
            gl.bindTexture(gl.TEXTURE_2D, this.textures[i]);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
            this.fbos[i] = gl.createFramebuffer();
            gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbos[i]);
            gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.textures[i], 0);
        }
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }

    resize(width: number, height: number): void {
        if (this.canvas.width !== width || this.canvas.height !== height) {
            this.canvas.width = width;
            this.canvas.height = height;
            this._setupFBOs();
        }
    }

    private _createDefaultGradTexture(gl: WebGL2RenderingContext): void {
        const size = 256;
        const data = new Uint8Array(size * 4);
        for (let i = 0; i < size; i++) {
            data[i * 4] = i;
            data[i * 4 + 1] = i;
            data[i * 4 + 2] = i;
            data[i * 4 + 3] = 255;
        }
        this.gradTexture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, this.gradTexture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, size, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    }

    updateGradientLUT(data: Uint8ClampedArray | Uint8Array): void {
        const gl = this.gl;
        if (!this._ready || !gl || !data) return;
        gl.bindTexture(gl.TEXTURE_2D, this.gradTexture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 256, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
    }

    render(state: EditorState, allLayers: LayerState[]): void {
        const gl = this.gl;
        if (!this._ready || !gl || !allLayers) return;
        const loc = this.locations;

        this.resize(state.resolution, state.resolution);
        const layers = allLayers.filter((layer) => layer.visible !== false);
        if (layers.length === 0) {
            gl.bindFramebuffer(gl.FRAMEBUFFER, null);
            gl.clearColor(0, 0, 0, state.blackBackground ? 1 : 0);
            gl.clear(gl.COLOR_BUFFER_BIT);
            return;
        }

        gl.viewport(0, 0, this.canvas.width, this.canvas.height);
        gl.useProgram(this.program);

        let readIndex = 0;
        let writeIndex = 1;
        for (let l = 0; l < layers.length; l++) {
            const layer = layers[l];
            const isBase = l === 0;

            gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbos[writeIndex]);

            const typeId = TYPE_ID[layer.type];
            gl.uniform1i(loc.u_type, typeId !== undefined ? typeId : 0);
            gl.uniform1f(loc.u_time, state.time);
            gl.uniform1i(loc.u_polarConversion, layer.polarConversion ? 1 : 0);

            const params = new Float32Array(16);
            const source = layer.typeParams;
            if (Array.isArray(source)) {
                const count = Math.min(16, source.length);
                for (let k = 0; k < count; k++) params[k] = source[k];
            }
            gl.uniform1fv(loc.u_params, params);

            const scaleX = layer.scaleX !== undefined ? layer.scaleX : 1;
            const scaleY = layer.scaleY !== undefined ? layer.scaleY : 1;
            const offsetX = layer.offsetX !== undefined ? layer.offsetX : 0;
            const offsetY = layer.offsetY !== undefined ? layer.offsetY : 0;
            const rotation = layer.rotation !== undefined ? layer.rotation : 0;
            gl.uniform1fv(loc.u_transform, new Float32Array([offsetX, offsetY, scaleX, scaleY, rotation]));

            const scrollX = layer.scrollX !== undefined ? layer.scrollX : 0;
            const scrollY = layer.scrollY !== undefined ? layer.scrollY : 0;
            gl.uniform2f(loc.u_scroll, scrollX, scrollY);
            gl.uniform1i(loc.u_invertEnable, layer.invertEnable ? 1 : 0);

            const gradStops =
                layer.gradEnable && layer.gradStops && layer.gradStops.length > 0 ? layer.gradStops : null;
            gl.uniform1i(loc.u_gradEnable, gradStops ? 1 : 0);
            if (gradStops) {
                this.updateGradientLUT(buildGradientLUT(gradStops));
            }

            gl.uniform1i(loc.u_isBaseLayer, isBase ? 1 : 0);
            gl.uniform1i(loc.u_blackBackground, state.blackBackground ? 1 : 0);

            const opacity = layer.opacity !== undefined ? layer.opacity : 1;
            gl.uniform1f(loc.u_opacity, opacity);
            gl.uniform1i(loc.u_solidColorEnabled, layer.solidColorEnabled ? 1 : 0);
            gl.uniform3fv(loc.u_solidColor, layer.solidColor ? layer.solidColor : [1, 1, 1]);

            const blendMode = BLEND_MODE_ID[layer.blendMode];
            gl.uniform1i(loc.u_blendMode, blendMode !== undefined ? blendMode : 0);

            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, isBase ? null : this.textures[readIndex]);
            gl.uniform1i(loc.u_backTex, 0);

            gl.activeTexture(gl.TEXTURE1);
            gl.bindTexture(gl.TEXTURE_2D, this.gradTexture);
            gl.uniform1i(loc.u_gradTex, 1);

            gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

            const previousRead = readIndex;
            readIndex = writeIndex;
            writeIndex = previousRead;
        }

        gl.useProgram(this.postProgram);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, this.canvas.width, this.canvas.height);

        const post = this.postLocations;
        gl.uniform1f(post.u_time, state.time);
        gl.uniform2f(post.u_resolution, this.canvas.width, this.canvas.height);

        const r: Partial<PostEffects> = state.postEffects || {};
        gl.uniform1i(post.u_blurEnabled, r.blurEnabled ? 1 : 0);
        gl.uniform1f(post.u_blurStrength, r.blurStrength || 1);
        gl.uniform1i(post.u_bloom_en, r.bloomEnabled ? 1 : 0);
        gl.uniform1f(post.u_bloom_st, r.bloomStrength !== undefined ? r.bloomStrength : 1);
        gl.uniform1i(post.u_sharpenEnabled, r.sharpenEnabled ? 1 : 0);
        gl.uniform1f(post.u_sharpenStrength, r.sharpenStrength || 1);
        gl.uniform1i(post.u_pixelationEnabled, r.pixelationEnabled ? 1 : 0);
        gl.uniform1f(post.u_pixelSize, r.pixelSize || 10);
        gl.uniform1i(post.u_chromaticAberrationEnabled, r.chromaticAberrationEnabled ? 1 : 0);
        gl.uniform1f(post.u_chromaticAberration, r.chromaticAberration || 0.01);
        gl.uniform1i(post.u_vignetteEnabled, r.vignetteEnabled ? 1 : 0);
        gl.uniform1f(post.u_vignetteStrength, r.vignetteStrength || 0.5);
        gl.uniform1f(post.u_vignetteSize, r.vignetteSize || 0.5);
        gl.uniform3fv(post.u_vignetteColor, r.vignetteColor || [0, 0, 0]);
        gl.uniform1i(post.u_scanlineEnabled, r.scanlineEnabled ? 1 : 0);
        gl.uniform1f(post.u_scanlineDensity, r.scanlineDensity || 100);
        gl.uniform1f(post.u_scanlineSpeed, r.scanlineSpeed || 1);
        gl.uniform1f(post.u_scanlineStrength, r.scanlineStrength || 0.5);
        gl.uniform3fv(post.u_scanlineColor, r.scanlineColor || [0, 0, 0]);
        gl.uniform1i(post.u_kaleidoscopeEnabled, r.kaleidoscopeEnabled ? 1 : 0);
        gl.uniform1f(post.u_kaleidoSegments, r.kaleidoSegments || 6);
        gl.uniform1f(post.u_kaleidoRotation, r.kaleidoRotation || 0);
        gl.uniform1i(post.u_mirrorTileEnabled, r.mirrorTileEnabled ? 1 : 0);
        gl.uniform1i(post.u_mirrorTileX, r.mirrorTileX ? 1 : 0);
        gl.uniform1i(post.u_mirrorTileY, r.mirrorTileY ? 1 : 0);
        gl.uniform1i(post.u_swirlEnabled, r.swirlEnabled ? 1 : 0);
        gl.uniform1f(post.u_swirlStrength, r.swirlStrength || 3);
        gl.uniform1f(post.u_swirlRadius, r.swirlRadius || 0.5);
        gl.uniform1i(post.u_edgeDetectionEnabled, r.edgeDetectionEnabled ? 1 : 0);
        gl.uniform1f(post.u_edgeThickness, r.edgeThickness || 1);
        gl.uniform3fv(post.u_edgeColor, r.edgeColor || [0, 1, 0]);
        gl.uniform1i(post.u_toonEnabled, r.toonEnabled ? 1 : 0);
        gl.uniform1f(post.u_toonDark, r.toonDark !== undefined ? r.toonDark : 4);
        gl.uniform1f(post.u_toonLight, r.toonLight !== undefined ? r.toonLight : 4);
        gl.uniform1i(post.u_vignetteMaskEnabled, r.vignetteMaskEnabled ? 1 : 0);
        gl.uniform1i(post.u_colorEnabled, r.colorEnabled ? 1 : 0);
        gl.uniform3fv(post.u_colorShadow, r.colorShadow || [0, 0, 0]);
        gl.uniform3fv(post.u_colorMidtone, r.colorMidtone || [0.5, 0.5, 0.5]);
        gl.uniform3fv(post.u_colorHighlight, r.colorHighlight || [1, 1, 1]);

        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.textures[readIndex]);
        gl.uniform1i(post.u_mainTex, 0);

        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }

    readPixels(): { data: Uint8Array; width: number; height: number } {
        const width = this.canvas.width;
        const height = this.canvas.height;
        const out = new Uint8Array(width * height * 4);
        const gl = this.gl;
        if (!gl) return { data: out, width, height };

        const raw = new Uint8Array(width * height * 4);
        gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, raw);

        for (let y = 0; y < height; y++) {
            const source = (height - 1 - y) * width * 4;
            const dest = y * width * 4;
            out.set(raw.subarray(source, source + width * 4), dest);
        }
        return { data: out, width, height };
    }

    dispose(): void {
        const gl = this.gl;
        if (gl) {
            for (const texture of this.textures) {
                if (texture) gl.deleteTexture(texture);
            }
            for (const framebuffer of this.fbos) {
                if (framebuffer) gl.deleteFramebuffer(framebuffer);
            }
            if (this.gradTexture) gl.deleteTexture(this.gradTexture);
            if (this.vertexBuffer) gl.deleteBuffer(this.vertexBuffer);
            if (this.program) gl.deleteProgram(this.program);
            if (this.postProgram) gl.deleteProgram(this.postProgram);
        }
        this.textures = [null, null];
        this.fbos = [null, null];
        this.gradTexture = null;
        this.vertexBuffer = null;
        this.program = null;
        this.postProgram = null;
        this._ready = false;
        this.gl = null;
    }
}
