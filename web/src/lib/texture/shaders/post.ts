// AUTO-GENERATED from texture-create (gameanimation.info). Verbatim GLSL. Do not edit by hand.
export const POST_SHADER = `#version 300 es
precision highp float;

in vec2 v_uv;
uniform sampler2D u_mainTex;
uniform float u_time;
uniform vec2 u_resolution;

// Effects toggles and params
uniform bool u_blurEnabled;
uniform float u_blurStrength;
uniform bool u_bloom_en;
uniform float u_bloom_st;
uniform bool u_sharpenEnabled;
uniform float u_sharpenStrength;

uniform bool u_pixelationEnabled;
uniform float u_pixelSize;

uniform bool u_chromaticAberrationEnabled;
uniform float u_chromaticAberration;

uniform bool u_vignetteEnabled;
uniform float u_vignetteStrength;
uniform float u_vignetteSize;
uniform vec3 u_vignetteColor;

uniform bool u_scanlineEnabled;
uniform float u_scanlineDensity;
uniform float u_scanlineSpeed;
uniform float u_scanlineStrength;
uniform vec3 u_scanlineColor;

uniform bool u_kaleidoscopeEnabled;
uniform float u_kaleidoSegments;
uniform float u_kaleidoRotation;

uniform bool u_mirrorTileEnabled;
uniform bool u_mirrorTileX;
uniform bool u_mirrorTileY;

uniform bool u_swirlEnabled;
uniform float u_swirlStrength;
uniform float u_swirlRadius;

uniform bool u_edgeDetectionEnabled;
uniform float u_edgeThickness;
uniform vec3 u_edgeColor;

uniform bool u_toonEnabled;
uniform float u_toonDark;
uniform float u_toonLight;

uniform bool u_vignetteMaskEnabled;

uniform bool u_colorEnabled;
uniform vec3 u_colorShadow;
uniform vec3 u_colorMidtone;
uniform vec3 u_colorHighlight;

out vec4 fragColor;

vec2 swirl(vec2 uv, float radius, float strength) {
    vec2 pos = uv - 0.5;
    float dist = length(pos);
    if(dist < radius) {
        float percent = (radius - dist) / radius;
        float theta = percent * percent * strength;
        float s = sin(theta);
        float c = cos(theta);
        pos = vec2(dot(pos, vec2(c, -s)), dot(pos, vec2(s, c)));
    }
    return pos + 0.5;
}

vec2 kaleidoscope(vec2 uv, float segments, float rotation) {
    vec2 p = uv - 0.5;
    float r = length(p);
    float a = atan(p.y, p.x);
    float angle = 3.14159265 * 2.0 / segments;
    a = mod(a, angle);
    a = abs(a - angle/2.0);
    a += rotation;
    return vec2(cos(a), sin(a)) * r + 0.5;
}

vec2 mirrorTile(vec2 uv, bool mirrorX, bool mirrorY) {
    vec2 p = uv;
    if (mirrorX) p.x = p.x > 0.5 ? 1.0 - p.x : p.x;
    if (mirrorY) p.y = p.y > 0.5 ? 1.0 - p.y : p.y;
    return p;
}

void main() {
    vec2 uv = v_uv;
    
    // UV manipulations
    if (u_mirrorTileEnabled) {
        uv = mirrorTile(uv, u_mirrorTileX, u_mirrorTileY);
    }
    
    if (u_kaleidoscopeEnabled) {
        uv = kaleidoscope(uv, u_kaleidoSegments, u_kaleidoRotation);
    }
    
    if (u_swirlEnabled) {
        uv = swirl(uv, u_swirlRadius, u_swirlStrength);
    }
    
    if (u_pixelationEnabled) {
        float ds = max(1.0, u_pixelSize);
        uv = floor(uv * ds) / ds;
    }
    
    vec4 col = texture(u_mainTex, uv);
    
    if (u_chromaticAberrationEnabled) {
        float r = texture(u_mainTex, uv + vec2(u_chromaticAberration, 0.0)).r;
        float b = texture(u_mainTex, uv - vec2(u_chromaticAberration, 0.0)).b;
        col.r = r;
        col.b = b;
    }
    
    if (u_blurEnabled) {
        vec2 d = 1.0 / u_resolution * u_blurStrength;
        vec4 blurCol = vec4(0.0);
        for(float x = -1.0; x <= 1.0; x++) {
            for(float y = -1.0; y <= 1.0; y++) {
                blurCol += texture(u_mainTex, uv + vec2(x, y) * d);
            }
        }
        col = blurCol / 9.0;
    }
    
    if (u_bloom_en) {
        vec2 d = 2.0 / u_resolution;
        vec4 bloomCol = vec4(0.0);
        for(float x = -2.0; x <= 2.0; x++) {
            for(float y = -2.0; y <= 2.0; y++) {
                vec4 smp = texture(u_mainTex, uv + vec2(x, y) * d);
                float luma = dot(smp.rgb, vec3(0.299, 0.587, 0.114));
                bloomCol += smp * smoothstep(0.4, 0.7, luma);
            }
        }
        bloomCol /= 25.0;
        col.rgb += bloomCol.rgb * u_bloom_st;
        col.rgb = min(col.rgb, vec3(1.0));
    }
    
    if (u_sharpenEnabled) {
        vec2 d = 1.0 / u_resolution;
        vec4 sum = col * 5.0;
        sum -= texture(u_mainTex, uv + vec2(-d.x, 0.0));
        sum -= texture(u_mainTex, uv + vec2(d.x, 0.0));
        sum -= texture(u_mainTex, uv + vec2(0.0, -d.y));
        sum -= texture(u_mainTex, uv + vec2(0.0, d.y));
        col = mix(col, sum, u_sharpenStrength);
    }
    
    if (u_edgeDetectionEnabled) {
        vec2 d = 1.0 / u_resolution * u_edgeThickness;
        vec4 sum = col * 4.0;
        sum -= texture(u_mainTex, uv + vec2(-d.x, 0.0));
        sum -= texture(u_mainTex, uv + vec2(d.x, 0.0));
        sum -= texture(u_mainTex, uv + vec2(0.0, -d.y));
        sum -= texture(u_mainTex, uv + vec2(0.0, d.y));
        float edge = length(sum.rgb);
        col.rgb = mix(col.rgb, u_edgeColor, clamp(edge, 0.0, 1.0));
    }
    
    if (u_scanlineEnabled) {
        float s = sin(uv.y * u_scanlineDensity + u_time * u_scanlineSpeed * 10.0) * 0.5 + 0.5;
        vec3 scanLine = mix(col.rgb, u_scanlineColor, u_scanlineStrength * s);
        col.rgb = scanLine;
    }

    if (u_toonEnabled) {
        float luma = dot(col.rgb, vec3(0.299, 0.587, 0.114));
        float stepCount = (luma < 0.5) ? u_toonDark : u_toonLight;
        col.rgb = floor(col.rgb * stepCount) / stepCount;
    }
    
    if (u_colorEnabled) {
        float luma = dot(col.rgb, vec3(0.299, 0.587, 0.114));
        if (luma < 0.5) {
            float t = luma * 2.0;
            col.rgb = mix(u_colorShadow, u_colorMidtone, t);
        } else {
            float t = (luma - 0.5) * 2.0;
            col.rgb = mix(u_colorMidtone, u_colorHighlight, t);
        }
    }

    if (u_vignetteMaskEnabled) {
        float dist = length(uv - 0.5);
        float mask = smoothstep(0.5, 0.2, dist);
        col *= mask;
    }
    
    if (u_vignetteEnabled) {
        float d = distance(uv, vec2(0.5));
        float v = smoothstep(u_vignetteSize, u_vignetteSize + u_vignetteStrength, d);
        col.rgb = mix(col.rgb, u_vignetteColor, clamp(v, 0.0, 1.0));
    }
    
    fragColor = col;
}
`;
