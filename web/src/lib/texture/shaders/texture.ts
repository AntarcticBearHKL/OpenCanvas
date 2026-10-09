// AUTO-GENERATED from texture-create (gameanimation.info). Verbatim GLSL. Do not edit by hand.
export const TEXTURE_SHADER = `#version 300 es
precision highp float;

in vec2 v_uv;
out vec4 fragColor;

// 基本 uniform
uniform int   u_type;
uniform float u_time;
uniform bool  u_polarConversion;
uniform float u_params[16];

// UV Transform uniform
uniform float u_transform[5]; // ox, oy, sx, sy, rot
uniform vec2  u_scroll;       // scX, scY

// 後処理 uniform
uniform bool  u_invertEnable;

// カラー uniform

// グラジエント LUT uniform
uniform bool      u_gradEnable;    // グラジエントランプ有効フラグ
uniform sampler2D u_gradTex;       // 256x1 の LUT テクスチャ

// マルチレイヤー合成 uniform
uniform bool      u_isBaseLayer;
uniform sampler2D u_backTex;
uniform int       u_blendMode; // 0:Normal, 1:Add, 2:Multiply, 3:Screen, 4:Mask(Clip)
uniform float     u_opacity;
uniform bool      u_blackBackground;

uniform bool      u_solidColorEnabled;
uniform vec3      u_solidColor;

// ============================
// ユーティリティ関数
// ============================
float hash1(float p) {
    p = fract(p * 0.1031);
    p *= p + 33.33;
    p *= p + p;
    return fract(p);
}

float hash1v2(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.13);
    p3 += dot(p3, p3.yzx + 3.333);
    return fract((p3.x + p3.y) * p3.z);
}

vec2 hash2v2(vec2 p) {
    return fract(sin(vec2(dot(p, vec2(127.1, 311.7)),
                          dot(p, vec2(269.5, 183.3)))) * 43758.5453);
}

// ============================
// ノイズ関数群
// ============================

// Value Noise
float valueNoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash1v2(i + vec2(0,0)), hash1v2(i + vec2(1,0)), u.x),
               mix(hash1v2(i + vec2(0,1)), hash1v2(i + vec2(1,1)), u.x), u.y);
}

// Gradient Noise (Perlin-like)
float perlin(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    float a = hash1v2(i + vec2(0,0)) * 6.2831853;
    float b = hash1v2(i + vec2(1,0)) * 6.2831853;
    float c = hash1v2(i + vec2(0,1)) * 6.2831853;
    float d = hash1v2(i + vec2(1,1)) * 6.2831853;
    float va = dot(vec2(cos(a), sin(a)), f - vec2(0,0));
    float vb = dot(vec2(cos(b), sin(b)), f - vec2(1,0));
    float vc = dot(vec2(cos(c), sin(c)), f - vec2(0,1));
    float vd = dot(vec2(cos(d), sin(d)), f - vec2(1,1));
    return mix(mix(va, vb, u.x), mix(vc, vd, u.x), u.y) * 0.5 + 0.5;
}

// FBM (Fractal Brownian Motion)
float fbm(vec2 p, int octaves, float lacunarity, float gain) {
    float value = 0.0;
    float amplitude = 0.5;
    float frequency = 1.0;
    for (int i = 0; i < 12; i++) {
        if (i >= octaves) break;
        value += amplitude * perlin(p * frequency);
        frequency *= lacunarity;
        amplitude *= gain;
    }
    return value;
}

// Simplex Noise 2D
vec3 mod289v3(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec2 mod289v2(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec3 permute3(vec3 x) { return mod289v3(((x * 34.0) + 10.0) * x); }

float snoise(vec2 v) {
    const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);
    vec2 i  = floor(v + dot(v, C.yy));
    vec2 x0 = v - i + dot(i, C.xx);
    vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
    vec4 x12 = x0.xyxy + C.xxzz;
    x12.xy -= i1;
    i = mod289v2(i);
    vec3 p = permute3(permute3(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
    vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)), 0.0);
    m = m * m * m * m;
    vec3 x2 = 2.0 * fract(p * C.www) - 1.0;
    vec3 h = abs(x2) - 0.5;
    vec3 ox = floor(x2 + 0.5);
    vec3 a0 = x2 - ox;
    m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);
    vec3 g;
    g.x  = a0.x  * x0.x  + h.x  * x0.y;
    g.yz = a0.yz * x12.xz + h.yz * x12.yw;
    return 130.0 * dot(m, g) * 0.5 + 0.5;
}

// Voronoi Distance
float voronoiDist(vec2 p, float jitter) {
    vec2 pi = floor(p);
    vec2 pf = fract(p);
    float minDist = 8.0;
    for (int y = -1; y <= 1; y++) {
        for (int x = -1; x <= 1; x++) {
            vec2 nb = vec2(float(x), float(y));
            vec2 pt = hash2v2(pi + nb) * jitter;
            vec2 diff = nb + pt - pf;
            minDist = min(minDist, dot(diff, diff));
        }
    }
    return sqrt(minDist);
}

// Voronoi Cell
float voronoiCell(vec2 p, float jitter) {
    vec2 pi = floor(p);
    vec2 pf = fract(p);
    float minDist = 8.0;
    vec2 minPt;
    for (int y = -1; y <= 1; y++) {
        for (int x = -1; x <= 1; x++) {
            vec2 nb = vec2(float(x), float(y));
            vec2 pt = hash2v2(pi + nb) * jitter;
            vec2 diff = nb + pt - pf;
            float d = dot(diff, diff);
            if (d < minDist) {
                minDist = d;
                minPt = hash2v2(pi + nb);
            }
        }
    }
    return hash1v2(minPt);
}

// ============================
// 各 Type 実装
// ============================

// 0: Circle (統合型 - subMode で 6 種類の円形エフェクトを切り替え)
// subMode: 0=Circle, 1=RadialGradient, 2=Vignette, 3=LensFlare, 4=Sun, 5=Solar
float typeCircle(vec2 uv, float mode) {
    int subMode = int(mode);
    float radius, softness, power, roundness, coronaSize, intensity;
    if (subMode == 0) {
        radius = u_params[0];
        softness = u_params[1];
        power = u_params[2];
    }
    else if (subMode == 1) {
        softness = u_params[0];
        power = u_params[1];
    }
    else if (subMode == 2) {
        radius = u_params[0];
        softness = u_params[1];
        power = u_params[2];
        roundness = u_params[3];
    }
    else if (subMode == 3) {
        radius = u_params[0];
        power = u_params[1];
        coronaSize = u_params[2];
    }
    else if (subMode == 4) {
        radius = u_params[0];
        coronaSize = u_params[1];
    }
    else if (subMode == 5) {
        power = u_params[0];
        intensity = u_params[1];
    }

    vec2  centered = uv - 0.5;
    float dist = length(centered) * 2.0;
    float val  = 0.0;

    if (subMode == 0) {
        // 〔Circle〕シンプルな円（旧 typeCircle）
        val = 1.0 - smoothstep(radius - softness * 0.3, radius + softness * 0.3, dist);
        val = pow(clamp(val, 0.0, 1.0), max(0.001, power));

    } else if (subMode == 1) {
        // 〔RadialGradient〕放射グラデーション（旧 typeRadialGradient）
        float offset = softness; // softness を offset として流用
        val = pow(clamp(1.0 - dist * 0.5 + offset * 0.5, 0.0, 1.0), max(0.001, power));

    } else if (subMode == 2) {
        // 〔Vignette〕ビネット（旧 typeVignette）
        // roundness: 1.0=真円, 0.0=画面端まで均等
        float aspect = mix(1.0, 0.0, 1.0 - roundness);
        vec2 p = centered * vec2(1.0, 1.0 + aspect * 0.5);
        float d2 = length(p) * 2.0;
        val = 1.0 - smoothstep(radius - softness * 0.5, radius + softness * 0.5, d2);
        val = pow(clamp(val, 0.0, 1.0), max(0.001, power));

    } else if (subMode == 3) {
        // 〔LensFlare〕レンズフレア（旧 typeLensFlare）
        float core = 1.0 - smoothstep(0.0, radius, dist);
        float glow = exp(-dist * coronaSize);
        val = pow(clamp(max(core, glow), 0.0, 1.0), max(0.001, power));

    } else if (subMode == 4) {
        // 〔Sun〕太陽（コア＋コロナ）（旧 typeSun）
        float core   = 1.0 - smoothstep(0.0, radius, dist);
        float corona = exp(-dist * coronaSize) * 0.8;
        val = clamp(max(core, corona), 0.0, 1.0);

    } else {
        // 〔Solar〕指数的減衰グロー（旧 typeSolar、subMode == 5）
        val = pow(max(0.0, 1.0 - dist), max(0.001, power)) * intensity;
        val = clamp(val, 0.0, 1.0);
    }
    return val;
}

// 1: Ring
float typeRing(vec2 uv) {
    float radius = u_params[0];
    float width  = u_params[1];
    float softness = u_params[2];
    float power  = u_params[3];
    float dist = length(uv - 0.5) * 2.0;
    float inner = smoothstep(radius - width - softness * 0.1, radius - width, dist);
    float outer = 1.0 - smoothstep(radius + softness * 0.1, radius + width + softness * 0.1, dist);
    return pow(clamp(inner * outer, 0.0, 1.0), max(0.001, power));
}

// 2: WaveRing (統合型 - subMode で波の形状を切り替え)
// subMode: 0=Sine波(従来), 1=ノイジー波, 2=角波(矩形), 3=二重リング
float typeWaveRing(vec2 uv, float mode) {
    int subMode = int(mode);
    float radius, width, frequency, amplitude, power, noiseScale;
    if (subMode == 0) {
        radius = u_params[0];
        width = u_params[1];
        frequency = u_params[2];
        amplitude = u_params[3];
        power = u_params[4];
    }
    else if (subMode == 1) {
        radius = u_params[0];
        width = u_params[1];
        amplitude = u_params[2];
        power = u_params[3];
        noiseScale = u_params[4];
    }
    else if (subMode == 2) {
        radius = u_params[0];
        width = u_params[1];
        frequency = u_params[2];
        amplitude = u_params[3];
        power = u_params[4];
    }
    else if (subMode == 3) {
        radius = u_params[0];
        width = u_params[1];
        frequency = u_params[2];
        amplitude = u_params[3];
        power = u_params[4];
    }
    vec2  centered   = uv - 0.5;
    float angle = atan(centered.y, centered.x);
    float dist  = length(centered) * 2.0;
    float val   = 0.0;

    if (subMode == 0) {
        // 〔Sine波〕従来のWaveRing
        // frequency を整数に丸めてシームレス化
        float freq = max(1.0, floor(frequency + 0.5));
        float waveR = radius + sin(angle * freq + u_time * 2.0) * amplitude;
        val = 1.0 - smoothstep(waveR - width * 0.5, waveR + width * 0.5, dist);

    } else if (subMode == 1) {
        // 〔ノイジー波〕シームレスノイズで変形
        // atan の -π/+π 境界不連続を避けるため sin/cos の円周座標でサンプリング
        // → 角度が一周したとき同じ座標に戻るため完全にシームレス
        vec2 circCoord = vec2(sin(angle), cos(angle)) * noiseScale;
        float n = snoise(circCoord + vec2(0.0, u_time * 0.5)) * amplitude;
        float waveR = radius + n;
        val = 1.0 - smoothstep(waveR - width * 0.5, waveR + width * 0.5, dist);

    } else if (subMode == 2) {
        // 〔角波（矩形波）〕ステップ状の波
        // frequency を整数に丸めてシームレス化
        float freq = max(1.0, floor(frequency + 0.5));
        float phase = fract(angle / (2.0 * 3.14159) * freq + u_time * 0.3);
        float stepWave = step(0.5, phase);
        float waveR = radius + (stepWave * 2.0 - 1.0) * amplitude;
        val = 1.0 - smoothstep(waveR - width * 0.5, waveR + width * 0.5, dist);

    } else {
        // 〔二重リング〕内外2本のリング
        // frequency を整数に丸めてシームレス化（-π/+π境界で連続になる）
        float freq1 = max(1.0, floor(frequency + 0.5));
        float freq2 = max(1.0, floor(frequency * 0.7 + 0.5));
        float w1 = radius + sin(angle * freq1 + u_time * 2.0) * amplitude;
        float w2 = radius * 1.4 + sin(angle * freq2 + u_time * 1.5) * amplitude;
        float v1 = 1.0 - smoothstep(w1 - width * 0.5, w1 + width * 0.5, dist);
        float v2 = 1.0 - smoothstep(w2 - width * 0.5, w2 + width * 0.5, dist);
        val = max(v1, v2);
    }
    return pow(clamp(val, 0.0, 1.0), max(0.001, power));
}

// 3: Gradation
float typeGradation(vec2 uv, float mode) {
    int subMode = int(mode);
    float angle, scale, offset, power;
    if (subMode == 0) {
        angle = u_params[0] * 3.14159265 / 180.0;
        scale = u_params[1];
        offset = u_params[2];
        power = u_params[3];
    }
    else if (subMode == 1) {
        angle = u_params[0] * 3.14159265 / 180.0;
        scale = u_params[1];
        offset = u_params[2];
        power = u_params[3];
    }
    else if (subMode == 2) {
        angle = u_params[0] * 3.14159265 / 180.0;
        scale = u_params[1];
        offset = u_params[2];
        power = u_params[3];
    }

    // 方向ベクトルの設定（angleによる回転）
    vec2 dir = vec2(cos(angle), sin(angle));

    // 内積でローカルな1D座標(v)を作る（-0.5 ～ 0.5 のuvと仮定した基準）
    // scaleを掛け、offsetを足す
    float v = dot(uv, dir) * scale + offset;

    float val = 0.0;
    if (subMode == 0) {
        // 0: Linear (clamp)
        val = clamp(v + 0.5, 0.0, 1.0);
    } else if (subMode == 1) {
        // 1: Reflect (PingPong: 0->1->0)
        // Triangle wave
        val = abs(fract(v) * 2.0 - 1.0);
    } else {
        // 2: Repeat (Sawtooth: 0->1, 0->1)
        val = fract(v);
    }
    
    return pow(val, max(0.001, power));
}

// 5: Wood
float typeWood(vec2 uv) {
    float frequency = u_params[0];
    float power     = u_params[1];
    float turbulence = u_params[2];
    float noise = fbm(uv * 3.0 + u_time * 0.05, 5, 2.0, 0.5) * turbulence;
    float dist  = length(uv - 0.5) * frequency;
    float val   = fract(dist + noise);
    return pow(clamp(val, 0.0, 1.0), max(0.001, power));
}

// 6: Checker (統合型 - subMode でスタイルを切り替え)
// subMode: 0=標準(従来), 1=グラデーションChecker, 2=丸みChecker, 3=ダイヤChecker
float typeChecker(vec2 uv, float mode) {
    int subMode = int(mode);
    float wX, wY, roundness;
    if (subMode == 0) {
        wX = u_params[0];
        wY = u_params[1];
    }
    else if (subMode == 1) {
        wX = u_params[0];
        wY = u_params[1];
    }
    else if (subMode == 2) {
        wX = u_params[0];
        wY = u_params[1];
        roundness = u_params[2];
    }
    else if (subMode == 3) {
        wX = u_params[0];
        wY = u_params[1];
        roundness = u_params[2];
    }
    vec2  grid     = floor(uv * vec2(wX, wY));
    float checker  = mod(grid.x + grid.y, 2.0); // 0.0 or 1.0

    if (subMode == 0) {
        // 〔標準〕バイナリチェッカー（従来）
        return checker;

    } else if (subMode == 1) {
        // 〔グラデーション〕セル内で距離グラデーション
        vec2 cell  = fract(uv * vec2(wX, wY));
        float dist = length(cell - 0.5) * 2.0;
        float grad = 1.0 - dist;
        return checker > 0.5 ? grad : 1.0 - grad;

    } else if (subMode == 2) {
        // 〔丸みChecker〕セル内に円を描画
        vec2  cell = fract(uv * vec2(wX, wY));
        float dist = length(cell - 0.5) * 2.0;
        float r    = mix(0.5, 1.0, roundness);
        float circle = 1.0 - smoothstep(r - 0.05, r, dist);
        return checker > 0.5 ? circle : 1.0 - circle;

    } else {
        // 〔ダイヤChecker〕45度回転したダイヤ形状
        vec2  cell = fract(uv * vec2(wX, wY)) - 0.5;
        float dist = abs(cell.x) + abs(cell.y); // L1距離
        float r    = mix(0.3, 0.5, roundness);
        float diamond = 1.0 - smoothstep(r - 0.02, r, dist);
        return checker > 0.5 ? diamond : 1.0 - diamond;
    }
}

// 7: Solar
float typeSolar(vec2 uv) {
    float intensity = u_params[0];
    float power     = u_params[1];
    float dist = length(uv - 0.5) * 2.0;
    float val  = pow(max(0.0, 1.0 - dist), max(0.001, power)) * intensity;
    return clamp(val, 0.0, 1.0);
}

// 8: Spark
float typeSpark(vec2 uv) {
    float intensity = u_params[0];
    float power     = u_params[1];
    float arms      = u_params[2];
    vec2  centered  = uv - 0.5;
    float angle = atan(centered.y, centered.x);
    float dist  = length(centered) * 2.0;
    float spark = pow(abs(cos(angle * arms)), power);
    float radial = max(0.0, 1.0 - dist);
    return clamp(spark * radial * intensity, 0.0, 1.0);
}

// 9: Flare
float typeFlare(vec2 uv) {
    float intensity = u_params[0];
    float power     = u_params[1];
    vec2  centered  = uv - 0.5;
    float dist = length(centered) * 2.0;
    float radial = max(0.0, 1.0 - dist);
    float l = length(centered) + 0.001;
    float streaksH = pow(max(0.0, 1.0 - abs(centered.y) / l * 2.0), power);
    float streaksV = pow(max(0.0, 1.0 - abs(centered.x) / l * 2.0), power);
    float val = max(streaksH, streaksV) * radial * intensity;
    return clamp(val, 0.0, 1.0);
}

// 10: Cross
float typeCross(vec2 uv) {
    float intensity = u_params[0];
    float power     = u_params[1];
    float width     = u_params[2];
    vec2  centered  = uv - 0.5;
    float crossH = exp(-abs(centered.y) / max(0.001, width * 0.1));
    float crossV = exp(-abs(centered.x) / max(0.001, width * 0.1));
    float dist = length(centered) * 2.0;
    float val  = max(crossH, crossV) * (1.0 - dist * 0.5) * intensity;
    return pow(clamp(val, 0.0, 1.0), max(0.001, power));
}

// 11: LensFlare
float typeLensFlare(vec2 uv) {
    float radius = u_params[0];
    float range  = u_params[1];
    float power  = u_params[2];
    vec2  centered = uv - 0.5;
    float dist = length(centered) * 2.0;
    float core = 1.0 - smoothstep(0.0, radius, dist);
    float glow = exp(-dist * range);
    float val  = max(core, glow);
    return pow(clamp(val, 0.0, 1.0), max(0.001, power));
}

// 12: Sun
float typeSun(vec2 uv) {
    float radius = u_params[0];
    float coronaSize = u_params[1];
    vec2  centered = uv - 0.5;
    float dist  = length(centered) * 2.0;
    float core  = 1.0 - smoothstep(0.0, radius, dist);
    float corona = exp(-dist * coronaSize) * 0.8;
    return clamp(max(core, corona), 0.0, 1.0);
}

// 13: Flower (FlowerFunのoffsetパラメータを統合)
float typeFlower(vec2 uv) {
    float petals    = u_params[0];
    float radius    = u_params[1];
    float offset    = u_params[2];
    float intensity = u_params[3];
    float power     = u_params[4];
    vec2  centered  = uv - 0.5;
    float angle = atan(centered.y, centered.x);
    float dist  = length(centered) * 2.0;
    // offsetによる捻り処理 (FlowerFun相当) を統合。offset=0なら従来のFlowerと同じ動作
    float petal = cos(angle * petals + offset * 3.14159) * 0.5 + 0.5;
    float val   = petal * (1.0 - smoothstep(0.0, radius, dist)) * intensity;
    return pow(clamp(val, 0.0, 1.0), max(0.001, power));
}

// 15: PerlinNoise
float typePerlinNoise(vec2 uv) {
    float frequency   = u_params[0];
    float octaves     = u_params[1];
    float persistence = u_params[2];
    float amplitude   = u_params[3];
    float val = fbm(uv * frequency + u_time * 0.1, int(octaves), 2.0, persistence) * amplitude;
    return clamp(val, 0.0, 1.0);
}

// 16: FbmNoise
float typeFbmNoise(vec2 uv) {
    float frequency  = u_params[0];
    float octaves    = u_params[1];
    float lacunarity = u_params[2];
    float gain       = u_params[3];
    float val = fbm(uv * frequency + u_time * 0.1, int(octaves), lacunarity, gain);
    return clamp(val, 0.0, 1.0);
}

// 17: VoronoiNoise
float typeVoronoiNoise(vec2 uv) {
    float scale  = u_params[0];
    float jitter = u_params[1];
    float power  = u_params[2];
    float val = voronoiDist(uv * scale + u_time * 0.1, jitter);
    val = clamp(val, 0.0, 1.0);
    return pow(val, max(0.001, power));
}

// 18: VoronoiCell
float typeVoronoiCell(vec2 uv) {
    float scale  = u_params[0];
    float jitter = u_params[1];
    return voronoiCell(uv * scale, jitter);
}

// 19: SimplexNoise
float typeSimplexNoise(vec2 uv) {
    float frequency = u_params[0];
    float octaves   = u_params[1];
    float val = 0.0;
    float amp  = 0.5;
    float freq = frequency;
    int oct = int(octaves);
    for (int i = 0; i < 8; i++) {
        if (i >= oct) break;
        val  += snoise(uv * freq + u_time * 0.05) * amp;
        freq *= 2.0;
        amp  *= 0.5;
    }
    return clamp(val, 0.0, 1.0);
}

// 20: MarbleNoise
float typeMarbleNoise(vec2 uv) {
    float scale      = u_params[0];
    float frequency  = u_params[1];
    float turbulence = u_params[2];
    float noise = fbm(uv * scale + u_time * 0.05, 6, 2.0, 0.5) * turbulence;
    float val   = sin((uv.x * frequency + noise) * 3.14159) * 0.5 + 0.5;
    return clamp(val, 0.0, 1.0);
}

// 21: Cell
float typeCell(vec2 uv) {
    float intensity = u_params[0];
    float size      = u_params[1];
    float power     = u_params[2];
    float v   = voronoiDist(uv * size + u_time * 0.05, 1.0);
    float val = (1.0 - clamp(v, 0.0, 1.0)) * intensity;
    return pow(clamp(val, 0.0, 1.0), max(0.001, power));
}

// 22: Lightning
float typeLightning(vec2 uv) {
    float intensity = u_params[0];
    float frequency = u_params[1];
    float width     = u_params[2];
    float xOffset = (fbm(vec2(uv.y * frequency, u_time), 5, 2.0, 0.5) - 0.5) * 0.4;
    float dist = abs(uv.x - 0.5 - xOffset);
    float bolt = 1.0 - smoothstep(0.0, width * 0.05, dist);
    return clamp(bolt * intensity, 0.0, 1.0);
}

// 23: Smoke
float typeSmoke(vec2 uv) {
    float volume = u_params[0];
    float beta   = u_params[1];
    float delta  = u_params[2];
    vec2 p = uv * volume;
    float n = fbm(p + u_time * 0.2, 6, 2.0, 0.5);
    float val = pow(n, beta) * delta * 10.0;
    return clamp(val, 0.0, 1.0);
}

// 24: Fire
float typeFire(vec2 uv) {
    float intensity = u_params[0];
    float strength  = u_params[1];
    float power     = u_params[2];
    float range     = u_params[3];
    float width     = u_params[4];
    vec2 p = (uv - vec2(0.5, 0.0)) * vec2(range / max(0.1, width), 1.0);
    float noise    = fbm(p * 3.0 + vec2(0.0, -u_time * 2.0), 6, 2.0, 0.5);
    float gradient = 1.0 - uv.y;
    float val = noise * gradient * strength * intensity;
    return clamp(pow(val, max(0.001, power)), 0.0, 1.0);
}

// 25: Flame
float typeFlame(vec2 uv) {
    float intensity = u_params[0];
    float width     = u_params[1];
    float scale     = u_params[2];
    vec2 p = (uv - 0.5) * vec2(1.0 / max(0.01, width), 1.0);
    float noise = fbm(p * scale + vec2(0.0, -u_time * 1.5), 4, 2.0, 0.5);
    float shape = max(0.0, 1.0 - length(p) * 2.0);
    return clamp(noise * shape * intensity, 0.0, 1.0);
}

// 26: Flash
float typeFlash(vec2 uv) {
    float frequency = u_params[0];
    float power     = u_params[1];
    float dist = length(uv - 0.5) * 2.0;
    float val  = sin(dist * frequency - u_time * 5.0) * 0.5 + 0.5;
    val *= (1.0 - dist);
    return pow(clamp(val, 0.0, 1.0), max(0.001, power));
}

// 27: Cloud
float typeCloud(vec2 uv) {
    float width      = u_params[0];
    float height     = u_params[1];
    float intensity  = u_params[2];
    float ambient    = u_params[3];
    float smoothness = u_params[4];
    vec2 p = (uv - 0.5) * vec2(1.0 / max(0.01, width), 1.0 / max(0.01, height));
    float n   = fbm(p * 3.0 + u_time * 0.05, 6, 2.0, 0.5);
    float val = smoothstep(1.0 - smoothness, 1.0, n) * intensity + ambient;
    return clamp(val, 0.0, 1.0);
}

// 28: Caustics
float typeCaustics(vec2 uv) {
    float scale = u_params[0];
    float speed = u_params[1];
    vec2 p = uv * scale;
    float t  = u_time * speed;
    float n1 = snoise(p + vec2(t * 0.7, t * 0.3));
    float n2 = snoise(p * 1.3 + vec2(-t * 0.4, t * 0.6));
    float n3 = snoise(p * 0.8 + vec2(t * 0.2, -t * 0.5));
    float val = (n1 * n2 * n3);
    return clamp(pow(val, 3.0), 0.0, 1.0);
}

// 29: WaterTurbulence
float typeWaterTurbulence(vec2 uv) {
    float scale     = u_params[0];
    float intensity = u_params[1];
    vec2 p  = uv * scale;
    float t = u_time * 0.3;
    float n = fbm(p + vec2(sin(t), cos(t)) * 0.5, 5, 2.0, 0.5);
    n += fbm(p * 2.1 + vec2(cos(t * 0.7), sin(t * 0.8)) * 0.3, 4, 2.0, 0.5) * 0.5;
    return clamp(n * intensity, 0.0, 1.0);
}

// 30: Electric
float typeElectric(vec2 uv) {
    float frequency = u_params[0];
    float scale     = u_params[1];
    float power     = u_params[2];
    vec2 p = uv * scale;
    float n   = fbm(p * frequency + u_time * 0.5, 4, 2.0, 0.5);
    float val = abs(n * 2.0 - 1.0);
    val = 1.0 - smoothstep(0.0, 0.1, val);
    return pow(clamp(val, 0.0, 1.0), max(0.001, power));
}

// 31: Energy
float typeEnergy(vec2 uv) {
    float power     = u_params[0];
    float density   = u_params[1];
    float thickness = u_params[2];
    float scale     = u_params[3];
    vec2 p    = (uv - 0.5) * scale;
    float dist  = length(p);
    float angle = atan(p.y, p.x);
    float wave  = sin(dist * density - u_time * 2.0 + angle * 3.0) * 0.5 + 0.5;
    float env   = 1.0 - smoothstep(0.0, 0.5, dist);
    float val   = pow(wave, max(0.001, thickness)) * env;
    return pow(clamp(val, 0.0, 1.0), max(0.001, power));
}

// 32: Squiggles
float typeSquiggles(vec2 uv) {
    float size    = u_params[0];
    float scale   = u_params[1];
    float density = u_params[2];
    vec2 p  = uv * scale;
    float n = fbm(p * size + u_time * 0.1, 4, 2.0, 0.5);
    float val = abs(sin(n * density * 6.2831853));
    val = 1.0 - smoothstep(0.4, 0.5, val);
    return clamp(val, 0.0, 1.0);
}

// 33: Speckle
float typeSpeckle(vec2 uv) {
    float radius  = u_params[0];
    float scale   = u_params[1];
    float density = u_params[2];
    vec2 p  = uv * scale;
    vec2 pi = floor(p);
    vec2 pf = fract(p);
    float val = 0.0;
    for (int y = -1; y <= 1; y++) {
        for (int x = -1; x <= 1; x++) {
            vec2 nb = vec2(float(x), float(y));
            float cellHash = hash1v2(pi + nb + 999.0);
            if (cellHash > (1.0 - density)) {
                vec2 pt   = hash2v2(pi + nb);
                vec2 diff = pf - nb - pt;
                float d   = length(diff);
                val = max(val, 1.0 - smoothstep(0.0, radius * 0.3, d));
            }
        }
    }
    return clamp(val, 0.0, 1.0);
}

// 34: Grunge
float typeGrunge(vec2 uv) {
    float scale = u_params[0];
    float width = u_params[1];
    float alpha = u_params[2];
    vec2  p  = uv * scale;
    float n  = fbm(p, 8, 2.0, 0.5);
    float n2 = fbm(p * 1.7 + 5.3, 8, 2.0, 0.5);
    float val = abs(n - n2) * alpha;
    val = 1.0 - smoothstep(0.0, width * 0.1, val);
    return clamp(val, 0.0, 1.0);
}

// 35: HexGrid (統合型 - subMode: 0=通常グリッド, 1=RadialHex)
float typeHexGrid(vec2 uv, float mode) {
    int subMode = int(mode);
    float scale, lineWidth, smoothness;
    if (subMode == 0) {
        scale = u_params[0];
        lineWidth = u_params[1];
        smoothness = clamp(u_params[2], 0.0, 1.0);
    }
    else if (subMode == 1) {
        scale = u_params[0];
        lineWidth = u_params[1];
        smoothness = clamp(u_params[2], 0.0, 1.0);
    }

    if (subMode == 0) {
        // 〔通常のHexGrid〕
        vec2 p = uv * scale;
        const float sq3 = 1.7320508;
        vec2 r = vec2(1.0, sq3);
        vec2 h = r * 0.5;
        vec2 a = mod(p, r) - h;
        vec2 b = mod(p - h, r) - h;
        float dist = sqrt(min(dot(a, a), dot(b, b)));
        float val  = 1.0 - smoothstep(lineWidth * 0.3 - smoothness * 0.02,
                                        lineWidth * 0.3 + smoothness * 0.02,
                                        dist / 0.866);
        return clamp(val, 0.0, 1.0);
    } else {
        // 〔同心円状・RadialHex〕 旧RadialHex
        float rings = scale;
        vec2 p = uv - 0.5;
        float r = length(p);
        float a = atan(p.y, p.x);
        float hexA = mod(a, 3.14159265 / 3.0) - 3.14159265 / 6.0;
        float dist = r * cos(hexA);
        float lineDist = abs(fract(dist * rings) - 0.5) * 2.0;
        float val = 1.0 - smoothstep(lineWidth - smoothness * 0.1, lineWidth + smoothness * 0.1, lineDist);
        return clamp(val, 0.0, 1.0);
    }
}

// 36: DiamondPattern
// 37: Spiral
float typeSpiral(vec2 uv) {
    float arms      = u_params[0];
    float tightness = u_params[1];
    float radius    = u_params[2];
    float width     = u_params[3];
    vec2  centered  = uv - 0.5;
    float dist  = length(centered);
    float angle = atan(centered.y, centered.x);
    float spiral = mod(angle / (2.0 * 3.14159) + dist * tightness - u_time * 0.3, 1.0 / arms);
    float val = 1.0 - smoothstep(0.0, width / arms, spiral);
    float env = 1.0 - smoothstep(0.0, radius, dist * 2.0);
    return clamp(val * env, 0.0, 1.0);
}

// 38: Ripple
float typeRipple(vec2 uv) {
    float ripRadius  = u_params[0];
    float frequency  = u_params[1];
    float amplitude  = u_params[2];
    float cx         = u_params[3];
    float cy         = u_params[4];
    vec2  center = vec2(cx, cy);
    float dist = length(uv - center);
    float val  = sin(dist * frequency - u_time * 3.0) * 0.5 + 0.5;
    float env  = 1.0 - smoothstep(0.0, ripRadius, dist);
    return clamp(val * env * amplitude, 0.0, 1.0);
}

// 39: Plasma
float typePlasma(vec2 uv) {
    float frequency  = u_params[0];
    float colorShift = u_params[1];
    float t = u_time * 0.5;
    float v = sin(uv.x * frequency + t);
    v += sin(uv.y * frequency + t);
    v += sin((uv.x + uv.y) * frequency * 0.7 + t * 1.3);
    v += sin(sqrt(dot(uv - 0.5, uv - 0.5)) * frequency + t);
    return sin(v * 3.14159 + colorShift) * 0.5 + 0.5;
}

// 40: Concentric
float typeConcentric(vec2 uv) {
    float frequency = u_params[0];
    float offset    = u_params[1];
    float softness  = u_params[2];
    float dist = length(uv - 0.5) * 2.0;
    float raw  = sin((dist + offset - u_time * 0.3) * frequency * 3.14159) * 0.5 + 0.5;
    float val  = smoothstep(0.5 - softness, 0.5 + softness, raw);
    float env  = 1.0 - dist * 0.5;
    return clamp(val * env, 0.0, 1.0);
}

// 41: StarBurst
float typeStarBurst(vec2 uv) {
    float points    = u_params[0];
    float radius    = u_params[1];
    float sharpness = u_params[2];
    vec2  centered  = uv - 0.5;
    float angle = atan(centered.y, centered.x);
    float dist  = length(centered) * 2.0;
    float star  = pow(abs(cos(angle * points * 0.5)), sharpness);
    return clamp(star * (1.0 - smoothstep(0.0, radius, dist)), 0.0, 1.0);
}

// 42: MetaBalls
float typeMetaBalls(vec2 uv) {
    float count     = u_params[0];
    float threshold = u_params[1];
    float radius    = u_params[2];
    float potential = 0.0;
    float n = min(count, 8.0);
    for (int i = 0; i < 8; i++) {
        if (float(i) >= n) break;
        float angle  = float(i) * 6.2831853 / n + u_time * 0.5;
        vec2  center = vec2(cos(angle), sin(angle)) * 0.3 + 0.5;
        float d = length(uv - center);
        potential += radius * radius / max(0.0001, d * d);
    }
    return clamp((potential - threshold) / threshold, 0.0, 1.0);
}

// 44: Wrinkle
float typeWrinkle(vec2 uv) {
    float scale    = u_params[0];
    float octaves  = u_params[1];
    float roughness= u_params[2];
    vec2  p = uv * scale;
    float n   = 0.0;
    float amp = 1.0;
    float freq= 1.0;
    int   oct = int(octaves);
    for (int i = 0; i < 10; i++) {
        if (i >= oct) break;
        float pn = perlin(p * freq);
        n   += abs(pn * 2.0 - 1.0) * amp;
        freq *= 2.0;
        amp  *= roughness;
    }
    return clamp(1.0 - n, 0.0, 1.0);
}

// 45: Fabric
float typeFabric(vec2 uv) {
    float warpFreq = u_params[0];
    float weftFreq = u_params[1];
    float mixRatio = u_params[2];
    float warp = sin(uv.y * warpFreq * 6.2831853) * 0.5 + 0.5;
    float weft = sin(uv.x * weftFreq * 6.2831853) * 0.5 + 0.5;
    return clamp(warp * (1.0 - mixRatio) + weft * mixRatio, 0.0, 1.0);
}

// 46: Crack
float typeCrack(vec2 uv) {
    float scale     = u_params[0];
    float threshold = u_params[1];
    float depth     = u_params[2];
    vec2  p = uv * scale;
    float v = voronoiDist(p, 1.0);
    float border = smoothstep(threshold - 0.05, threshold, v);
    return clamp(1.0 - border * depth, 0.0, 1.0);
}

// 48: Lava
float typeLava(vec2 uv) {
    float scale     = u_params[0];
    float threshold = u_params[1];
    float sharpness = u_params[2];
    vec2  p = uv * scale + u_time * 0.05;
    float n = fbm(p, 6, 2.0, 0.5);
    float lava = smoothstep(threshold - 0.05, threshold + 0.05, n);
    return clamp(pow(lava, max(0.001, sharpness)), 0.0, 1.0);
}

// 49: Matrix
float typeMatrix(vec2 uv) {
    float speed         = u_params[0];
    float density       = u_params[1];
    float glowIntensity = u_params[2];
    float colW  = 1.0 / max(1.0, density);
    float col   = floor(uv.x / colW);
    float phase = hash1(col) * 10.0;
    float dropY = fract(u_time * speed * 0.3 + phase);
    float headDist = abs(uv.y - dropY);
    float trail = max(0.0, 1.0 - (uv.y - dropY) * 5.0) * step(uv.y, dropY);
    float glow  = 1.0 - smoothstep(0.0, 0.04, headDist);
    return clamp(glow * glowIntensity + trail * 0.4, 0.0, 1.0);
}

// ============================
// メイン関数
// ============================
// 50: Star (SDF + Roundness + subMode)
// subMode: 0=塗りつぶし(従来), 1=減衰グロー, 2=アウトラインのみ
float typeStar(vec2 uv, float mode) {
    float points = max(3.0, floor(u_params[0]));
    float innerR = u_params[1];
    float outerR = max(u_params[2], innerR + 0.01);
    float innerRound = max(0.0, u_params[3]);
    float outerRound = max(0.0, u_params[4]);
    float angle = u_params[5] * 3.14159265 / 180.0;
    float glowPower = u_params[6];
    float outlineWidth = u_params[7];

    vec2 p = uv * 2.0 - 1.0;
    
    float armLength = outerR - innerR;
    float totalRequestedRound = innerRound + outerRound;
    float sc = 1.0;
    if (totalRequestedRound > armLength * 0.99) {
        sc = (armLength * 0.99) / totalRequestedRound;
    }
    
    float safeOuterRound = outerRound * sc;
    float safeInnerRound = innerRound * sc;
    
    float c = cos(angle), s = sin(angle);
    p = vec2(c * p.x - s * p.y, s * p.x + c * p.y);
    
    float seg = 6.2831853 / points;
    float halfSeg = seg * 0.5;
    
    float a = atan(p.x, -p.y);
    float local_a = mod(a + halfSeg, seg) - halfSeg;
    
    vec2 q = length(p) * vec2(sin(local_a), cos(local_a));
    q.x = abs(q.x);
    
    float delta = safeInnerRound - safeOuterRound;
    float baseOuterR = max(0.01, outerR + delta);
    float baseInnerR = max(0.005, innerR + delta);
    
    vec2 p1 = vec2(0.0, baseOuterR);
    vec2 p2 = vec2(sin(halfSeg) * baseInnerR, cos(halfSeg) * baseInnerR);
    
    vec2 v = p2 - p1;
    vec2 w = q - p1;
    float h = clamp(dot(w, v) / dot(v, v), 0.0, 1.0);
    float dLine = length(w - v * h);
    float signVal = sign(v.x * w.y - v.y * w.x);
    float dSharp = dLine * signVal;
    float d = dSharp - safeOuterRound + safeInnerRound;
    
    float softness = 0.005; 
    
    float fill = 0.0;
    if (outlineWidth > 0.0) {
        float edge = abs(d);
        fill = clamp(1.0 - smoothstep(0.0, outlineWidth, edge), 0.0, 1.0);
    } else {
        fill = clamp(1.0 - smoothstep(-softness, softness, d), 0.0, 1.0);
    }
    
    float glow = 0.0;
    if (glowPower > 0.0) {
        glow = exp(-max(0.0, d) * glowPower * 8.0);
    }
    
    return clamp(fill + glow * 0.7, 0.0, 1.0);
}


// 51: Polygon (統合型 - subMode で塗りスタイルを切り替え)
// subMode: 0=塗りつぶし(従来), 1=アウトラインのみ, 2=グロー
float typePolygon(vec2 uv, float mode) {
    float sides = max(3.0, floor(u_params[0]));
    float radius = u_params[1];
    float softness = u_params[2];
    float rotAngle = u_params[3] * 3.14159265 / 180.0;
    float glowPower = u_params[4];
    float outlineWidth = u_params[5];

    vec2 p = uv * 2.0 - 1.0;
    float c = cos(rotAngle), s = sin(rotAngle);
    p = vec2(c * p.x - s * p.y, s * p.x + c * p.y);

    float a = atan(p.x, p.y);
    float b = 6.2831853 / sides;
    float dist = cos(floor(0.5 + a / b) * b - a) * length(p);

    float fill = 0.0;
    if (outlineWidth > 0.0) {
        float edge = abs(dist - radius);
        fill = clamp(1.0 - smoothstep(0.0, outlineWidth, edge), 0.0, 1.0);
    } else {
        if (softness < 0.001) fill = dist > radius ? 0.0 : 1.0;
        else fill = clamp(1.0 - smoothstep(radius - softness, radius, dist), 0.0, 1.0);
    }

    float glow = 0.0;
    if (glowPower > 0.0) {
        glow = exp(-max(0.0, dist - radius) * glowPower * 5.0);
    }
    
    return clamp(fill + glow * 0.6, 0.0, 1.0);
}


// 52: Rectangle (統合型 - subMode で塗りスタイルを切り替え)
// subMode: 0=塗りつぶし(従来), 1=アウトラインのみ, 2=グロー, 3=ソフトグロー
float typeRectangle(vec2 uv, float mode) {
    float width = u_params[0];
    float height = u_params[1];
    float softness = u_params[2];
    float rotAngle = u_params[3] * 3.14159265 / 180.0;
    float cornerRadius = u_params[4];
    float glowPower = u_params[5];
    float outlineWidth = u_params[6];

    vec2 p = uv * 2.0 - 1.0;
    float c = cos(rotAngle), s = sin(rotAngle);
    p = vec2(c * p.x - s * p.y, s * p.x + c * p.y);

    vec2  halfSize = vec2(width * 0.5, height * 0.5);
    float cr  = min(cornerRadius * 0.5, min(halfSize.x, halfSize.y));
    vec2  q   = abs(p) - halfSize + cr;
    float dist = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - cr;

    float fill = 0.0;
    if (outlineWidth > 0.0) {
        float edge = abs(dist);
        fill = clamp(1.0 - smoothstep(0.0, outlineWidth, edge), 0.0, 1.0);
    } else {
        if (softness < 0.001) fill = dist > 0.0 ? 0.0 : 1.0;
        else fill = clamp(1.0 - smoothstep(-softness, 0.0, dist), 0.0, 1.0);
    }

    float glow = 0.0;
    if (glowPower > 0.0) {
        float glowDist = max(0.0, dist);
        glow = exp(-glowDist * glowPower * 5.0);
    }
    
    return clamp(fill + glow * 0.6, 0.0, 1.0);
}


// 53: Halo (後光 - リング状グロー)
float typeHalo(vec2 uv) {
    float ringRadius = u_params[0]; // リングの半径
    float ringWidth  = u_params[1]; // リングの太さ
    float glow       = u_params[2]; // 内側のコアグロー
    float power      = u_params[3]; // 山の髸さ
    float dist = length(uv - 0.5) * 2.0;
    // リング部分
    float ringVal = 1.0 - abs(dist - ringRadius) / max(0.001, ringWidth);
    ringVal = clamp(ringVal, 0.0, 1.0);
    ringVal = pow(ringVal, max(0.1, power));
    // 中心コアグロー
    float coreGlow = max(0.0, 1.0 - dist / max(0.001, ringRadius)) * glow;
    return clamp(ringVal + coreGlow, 0.0, 1.0);
}

// 54: RayBurst (放射光線)
float typeRayBurst(vec2 uv) {
    float rays     = u_params[0]; // 光線の本数
    float sharpness = u_params[1]; // 光線の锐さ
    float falloff  = u_params[2]; // 中心からの減衰
    float spin     = u_params[3]; // 回転角度
    float power    = u_params[4]; // 全体の強度
    vec2 centered = uv - 0.5;
    float dist  = length(centered);
    float angle = atan(centered.y, centered.x) + spin * 3.14159265 / 180.0;
    float rayVal = abs(sin(angle * rays * 0.5));
    rayVal = pow(rayVal, max(0.1, sharpness));
    float radial = pow(max(0.0, 1.0 - dist * 2.0 * falloff), 0.5);
    return clamp(pow(rayVal * radial, max(0.1, power)), 0.0, 1.0);
}

// 55: GodRay (ゴッドレイ - 方向性ビーム群)
float typeGodRay(vec2 uv) {
    float beams    = u_params[0]; // ビーム本数
    float angle    = u_params[1]; // 全体の角度（度）
    float spread   = u_params[2]; // 拡散幅
    float falloff  = u_params[3]; // 色褱
    float noise    = u_params[4]; // ノイズ量
    vec2 centered = uv - 0.5;
    float rad = angle * 3.14159265 / 180.0;
    vec2 dir = vec2(cos(rad), sin(rad));
    float along = dot(centered, dir);
    float perp  = abs(dot(centered, vec2(-dir.y, dir.x)));
    // ノイズでビームを分割
    float n = snoise(uv * (noise * 5.0 + 2.0) + u_time * 0.2) * 0.5 + 0.5;
    float beamWidth = spread / max(1.0, beams);
    float beamAngle = atan(perp, max(0.001, along + 0.5));
    float beamVal = 1.0 - smoothstep(0.0, beamWidth * (1.0 + n * 0.3), perp / max(0.001, along + 0.5));
    float beam = 0.0;
    for (int i = 0; i < 8; i++) {
        if (float(i) >= beams) break;
        float bAngle = float(i) * 3.14159265 * 2.0 / beams + rad;
        vec2 bDir = vec2(cos(bAngle), sin(bAngle));
        float bAlong = dot(centered, bDir);
        float bPerp  = abs(dot(centered, vec2(-bDir.y, bDir.x)));
        float w = spread * (1.0 + n * 0.2);
        float b = max(0.0, bAlong + 0.5) * clamp(1.0 - bPerp / max(0.001, w), 0.0, 1.0);
        beam = max(beam, b);
    }
    return clamp(beam * pow(max(0.0, 1.0 - length(centered) * 2.0), max(0.1, falloff)), 0.0, 1.0);
}

// 56: Bokeh (ボケ玉)
float typeBokeh(vec2 uv) {
    float count    = u_params[0]; // ボケ玉の数
    float radius   = u_params[1]; // 1つのボケ玉の半径
    float softness = u_params[2]; // ゼワさ
    float seed     = u_params[3]; // ランダムシード
    float glow     = u_params[4]; // 全体グロー
    float val = 0.0;
    for (int i = 0; i < 20; i++) {
        if (float(i) >= count) break;
        vec2 center = hash2v2(vec2(float(i), seed + 1.0)) * 0.8 + 0.1;
        float d = length(uv - center);
        float b = 1.0 - smoothstep(radius * 0.5 - softness * radius, radius * 0.5, d);
        // リング輝きのボケ玉
        float ring = 1.0 - abs(d - radius * 0.45) / (radius * 0.15 + 0.001);
        ring = clamp(ring, 0.0, 1.0) * 0.5;
        val = max(val, b + ring);
        // グロー
        float g = max(0.0, 1.0 - d / (radius * 2.0)) * glow;
        val = max(val, g);
    }
    return clamp(val, 0.0, 1.0);
}

// 57: Aurora (オーロラ)
float typeAurora(vec2 uv) {
    float bands    = u_params[0]; // 帯の数
    float height   = u_params[1]; // Y中心位置
    float width    = u_params[2]; // 帯の幅
    float speed    = u_params[3]; // アニメ速度
    float turbulence = u_params[4]; // うねり幅
    float val = 0.0;
    for (int i = 0; i < 6; i++) {
        if (float(i) >= bands) break;
        float fi = float(i);
        float yOff = height + fi * 0.12 - 0.06;
        float phase = fi * 1.7 + u_time * speed;
        float wave = snoise(vec2(uv.x * 3.0 + phase, fi * 2.0)) * turbulence * 0.3;
        float yDist = abs(uv.y - yOff - wave);
        float b = 1.0 - smoothstep(0.0, width * 0.12, yDist);
        b *= (sin(uv.x * 8.0 + fi * 2.3 + u_time * speed * 0.7) * 0.5 + 0.5);
        b *= (snoise(vec2(uv.x * 4.0, fi + u_time * 0.3)) * 0.5 + 0.5);
        val = max(val, b);
    }
    return clamp(val, 0.0, 1.0);
}

// 58: Shimmer (キラキラしたきめき)
float typeShimmer(vec2 uv) {
    float count  = u_params[0]; // 点の数
    float size   = u_params[1]; // 点の大きさ
    float speed  = u_params[2]; // 点滅の速度
    float power  = u_params[3]; // 輝腑強度
    float scale  = u_params[4]; // 全体分布
    float val = 0.0;
    for (int i = 0; i < 30; i++) {
        if (float(i) >= count) break;
        float fi = float(i);
        vec2 center = hash2v2(vec2(fi, 42.0)) * scale + (1.0 - scale) * 0.5;
        float flicker = sin(u_time * speed + fi * 3.7) * 0.5 + 0.5;
        flicker = pow(flicker, 3.0);
        float d = length(uv - center);
        float s = 1.0 - smoothstep(0.0, size * 0.04, d);
        // 十字形の輝き（Spark的）
        vec2 p = uv - center;
        float sparkH = exp(-abs(p.y) / max(0.001, size * 0.02)) * exp(-abs(p.x) / max(0.001, size * 0.1));
        float sparkV = exp(-abs(p.x) / max(0.001, size * 0.02)) * exp(-abs(p.y) / max(0.001, size * 0.1));
        float spark = max(sparkH, sparkV);
        val = max(val, (s + spark) * flicker * power);
    }
    return clamp(val, 0.0, 1.0);
}


// 59: SquareGrid (統合型 - subMode でグリッドスタイルを切り替え)
// subMode: 0=グリッド(従来), 1=ドット, 2=クロス, 3=ダッシュライン, 4=ランダムタイル, 5=水玉, 6=マトリクス
float typeSquareGrid(vec2 uv, float mode) {
    int subMode = int(mode);
    float scale, lineWidth, softness, dotRadius, intensity, power, width, scaleY, varNoise;
    if (subMode == 0) {
        scale = u_params[0];
        lineWidth = u_params[1];
        softness = clamp(u_params[2], 0.0, 1.0);
    }
    else if (subMode == 1) {
        scale = u_params[0];
        softness = clamp(u_params[1], 0.0, 1.0);
        dotRadius = u_params[2];
    }
    else if (subMode == 2) {
        scale = u_params[0];
        lineWidth = u_params[1];
        softness = clamp(u_params[2], 0.0, 1.0);
    }
    else if (subMode == 3) {
        scale = u_params[0];
        lineWidth = u_params[1];
        softness = clamp(u_params[2], 0.0, 1.0);
    }
    else if (subMode == 4) {
        scale = u_params[0];
        lineWidth = u_params[1];
        scaleY = max(1.0, u_params[2]);
        varNoise = u_params[3];
    }
    else if (subMode == 5) {
        scale = u_params[0];
        softness = clamp(u_params[1], 0.0, 1.0);
        dotRadius = u_params[2];
    }
    else if (subMode == 6) {
        scale = u_params[0];
        dotRadius = u_params[1];
        scaleY = max(1.0, u_params[2]);
        varNoise = u_params[3];
    }

    vec2  p = fract(uv * scale) - 0.5;
    vec2  d = abs(p);

    if (subMode == 0) {
        // 〔グリッド〕従来のSquareGrid（セルの辺ライン）
        float dist = max(d.x, d.y);
        return clamp(1.0 - smoothstep(0.5 - lineWidth - softness * 0.1, 0.5 - lineWidth + softness * 0.1, dist), 0.0, 1.0);

    } else if (subMode == 1) {
        // 〔ドット〕各セル中心に円を配置
        float dist = length(p);
        return clamp(1.0 - smoothstep(dotRadius - softness * 0.1, dotRadius + softness * 0.1, dist), 0.0, 1.0);

    } else if (subMode == 2) {
        // 〔クロス〕小さな十字
        float hLine = 1.0 - smoothstep(lineWidth - softness * 0.05, lineWidth + softness * 0.05, d.y);
        float vLine = 1.0 - smoothstep(lineWidth - softness * 0.05, lineWidth + softness * 0.05, d.x);
        return clamp(max(hLine, vLine), 0.0, 1.0);

    } else if (subMode == 3) {
        // 〔ダッシュライン〕断続線
        float t = fract(uv.x * scale * 2.0); // 中間点でON/OFF
        float hLine = 1.0 - smoothstep(lineWidth - softness * 0.05, lineWidth + softness * 0.05, d.y);
        hLine *= step(0.5, t); // 交互に点滅
        float vLine = 1.0 - smoothstep(lineWidth - softness * 0.05, lineWidth + softness * 0.05, d.x);
        return clamp(max(hLine, vLine), 0.0, 1.0);

    } else if (subMode == 4) {
        // 〔ランダムタイル〕旧TilePattern (scaleY, varNoise, lineWidth=borderを利用)
        vec2 tileUV = fract(uv * vec2(scale, scaleY));
        vec2 tileID = floor(uv * vec2(scale, scaleY));
        float v  = hash1v2(tileID) * varNoise;
        float edge = max(abs(tileUV.x - 0.5), abs(tileUV.y - 0.5));
        float val  = 1.0 - smoothstep(0.5 - lineWidth - v * 0.1, 0.5 - lineWidth * 0.5, edge);
        return clamp(val, 0.0, 1.0);

    } else if (subMode == 5) {
        // 〔水玉（千鳥配置）〕旧Polka
        vec2 pv = uv * scale;
        vec2 g1 = fract(pv) - 0.5;
        vec2 g2 = fract(pv - 0.5) - 0.5;
        float dist = min(length(g1), length(g2));
        float val = 1.0 - smoothstep(dotRadius - softness * 0.1, dotRadius + softness * 0.1, dist);
        return clamp(val, 0.0, 1.0);

    } else {
        // 〔ドットマトリクス〕旧DotMatrix (scale, scaleY, dotRadius, varNoiseを利用)
        vec2 pv = uv * vec2(scale, scaleY);
        vec2 pos = floor(pv);
        vec2 fractPos = fract(pv) - 0.5;
        float n = hash1v2(pos + vec2(u_time * 0.2, 0.0));
        float alpha = step(varNoise, n);
        float val = 1.0 - smoothstep(dotRadius - max(0.001, softness * 0.1), dotRadius + max(0.001, softness * 0.1), length(fractPos));
        return clamp(val * alpha, 0.0, 1.0);
    }
}

// 60: Lines (統合型 - subMode: 0=直線, 1=ジグザグ, 2=クロスハッチ)
float typeLines(vec2 uv, float mode) {
    int subMode = int(mode);
    float freq, angle1, lineWidth, softness, amp, angle2;
    if (subMode == 0) {
        freq = u_params[0];
        angle1 = u_params[1] * 3.14159265 / 180.0;
        lineWidth = u_params[2];
        softness = clamp(u_params[3], 0.0, 1.0);
    }
    else if (subMode == 1) {
        freq = u_params[0];
        angle1 = u_params[1] * 3.14159265 / 180.0;
        lineWidth = u_params[2];
        softness = clamp(u_params[3], 0.0, 1.0);
        amp = u_params[4];
    }
    else if (subMode == 2) {
        freq = u_params[0];
        angle1 = u_params[1] * 3.14159265 / 180.0;
        lineWidth = u_params[2];
        angle2 = u_params[3] * 3.14159265 / 180.0;
    }

    if (subMode == 0) {
        // 〔直線〕旧Lines
        float c = cos(angle1), s = sin(angle1);
        vec2 p = vec2(c * uv.x - s * uv.y, s * uv.x + c * uv.y);
        float dist = abs(fract(p.x * freq) - 0.5) * 2.0;
        return clamp(1.0 - smoothstep(lineWidth - softness * 0.1, lineWidth + softness * 0.1, dist), 0.0, 1.0);
    } else if (subMode == 1) {
        // 〔ジグザグ〕旧Zigzag
        float c = cos(angle1), s = sin(angle1);
        vec2 uvRot = vec2(c * uv.x - s * uv.y, s * uv.x + c * uv.y);
        float y = uvRot.y * freq;
        float z = abs(fract(uvRot.x * freq) - 0.5) * 2.0 * amp;
        float d = abs(fract(y) - 0.5 - z + amp*0.5) * 2.0;
        return clamp(1.0 - smoothstep(lineWidth - softness * 0.1, lineWidth + softness * 0.1, d), 0.0, 1.0);
    } else {
        // 〔クロスハッチ〕旧Crosshatch
        vec2 dir1 = vec2(cos(angle1), sin(angle1));
        vec2 dir2 = vec2(cos(angle2), sin(angle2));
        float l1 = abs(fract(dot(uv, dir1) * freq) - 0.5) * 2.0;
        float l2 = abs(fract(dot(uv, dir2) * freq) - 0.5) * 2.0;
        float v1 = 1.0 - smoothstep(lineWidth - softness * 0.1, lineWidth + softness * 0.1, l1);
        float v2 = 1.0 - smoothstep(lineWidth - softness * 0.1, lineWidth + softness * 0.1, l2);
        return clamp(max(v1, v2), 0.0, 1.0);
    }
}

// 62: TriGrid
float typeTriGrid(vec2 uv) {
    float scale = u_params[0];
    float lineWidth = u_params[1];
    vec2 p = uv * scale;
    const float sq3 = 1.7320508;
    vec2 p1 = p;
    vec2 p2 = vec2(p.x + p.y / sq3, p.y - p.x * sq3) * 0.5;
    vec2 p3 = vec2(p.x - p.y / sq3, p.y + p.x * sq3) * 0.5;
    float d1 = abs(fract(p1.y) - 0.5) * 2.0;
    float d2 = abs(fract(p2.y) - 0.5) * 2.0;
    float d3 = abs(fract(p3.y) - 0.5) * 2.0;
    float val1 = 1.0 - smoothstep(lineWidth, lineWidth + 0.05, d1);
    float val2 = 1.0 - smoothstep(lineWidth, lineWidth + 0.05, d2);
    float val3 = 1.0 - smoothstep(lineWidth, lineWidth + 0.05, d3);
    return clamp(max(max(val1, val2), val3), 0.0, 1.0);
}

// 63: RadialLines
float typeRadialLines(vec2 uv) {
    float rays = u_params[0];
    float width = u_params[1];
    float softness = u_params[2];
    float spin = u_params[3];
    vec2 centered = uv - 0.5;
    float angle = atan(centered.y, centered.x) + u_time * spin;
    float rayVal = abs(fract(angle * rays / 6.2831853) - 0.5) * 2.0;
    float val = 1.0 - smoothstep(width - softness * 0.1, width + softness * 0.1, rayVal);
    return clamp(val, 0.0, 1.0);
}

// 64: Swirl
float typeSwirl(vec2 uv) {
    float arms = u_params[0];
    float twist = u_params[1];
    float centerFocus = u_params[2];
    vec2 centered = uv - 0.5;
    float dist = length(centered);
    float angle = atan(centered.y, centered.x);
    float t = angle * arms + dist * twist * 10.0 - u_time * 2.0;
    float val = sin(t) * 0.5 + 0.5;
    float mask = pow(dist * 2.0, centerFocus);
    return clamp(val * mask, 0.0, 1.0);
}

// 65: PixelNoise
float typePixelNoise(vec2 uv) {
    float scale = u_params[0];
    float speed = u_params[1];
    vec2 p = floor(uv * scale);
    float val = hash1v2(p + floor(u_time * speed * 10.0));
    return clamp(val, 0.0, 1.0);
}

// 66: StripeNoise
float typeStripeNoise(vec2 uv) {
    float scaleX = u_params[0];
    float scaleY = u_params[1];
    float angle = u_params[2] * 3.14159265 / 180.0;
    float contrast = u_params[3];
    float c = cos(angle), s = sin(angle);
    vec2 p = vec2(c * uv.x - s * uv.y, s * uv.x + c * uv.y);
    p *= vec2(scaleX, scaleY);
    float val = fbm(p + u_time * 0.1, 4, 2.0, 0.5);
    return clamp((val - 0.5) * contrast + 0.5, 0.0, 1.0);
}

// 68: FlowLines
float typeFlowLines(vec2 uv) {
    float scale = u_params[0];
    float density = u_params[1];
    float speed = u_params[2];
    vec2 p = uv * scale;
    float n = fbm(p + u_time * speed, 4, 2.0, 0.5);
    float val = sin((uv.y * density + n) * 6.2831853) * 0.5 + 0.5;
    return clamp(pow(val, 2.0), 0.0, 1.0);
}

// 69: SymmetricNoise
float typeSymmetricNoise(vec2 uv) {
    float scale = u_params[0];
    float axes = max(1.0, u_params[1]);
    float speed = u_params[2];
    vec2 p = uv - 0.5;
    float r = length(p);
    float a = atan(p.y, p.x);
    float sector = 3.14159265 / axes;
    a = abs(fract(a / sector + 0.5) * sector - sector * 0.5);
    p = vec2(cos(a), sin(a)) * r;
    float n = fbm(p * scale + u_time * speed, 5, 2.0, 0.5);
    return clamp(n, 0.0, 1.0);
}

// 70: BevelSquare
float typeBevelSquare(vec2 uv) {
    float size = u_params[0];
    float bevel = u_params[1];
    float lightDir = u_params[2] * 3.14159265 / 180.0;
    vec2 p = uv * 2.0 - 1.0;
    vec2 d = abs(p) - vec2(size);
    float dist = max(d.x, d.y);
    float mask = 1.0 - smoothstep(0.0, 0.05, dist);
    
    vec2 normal;
    if (dist > -bevel) {
        normal = normalize(sign(p) * max(vec2(0.0), d + bevel));
    } else {
        normal = vec2(0.0, 0.0);
    }
    vec2 light = vec2(cos(lightDir), sin(lightDir));
    float lighting = dot(normal, light) * 0.5 + 0.5;
    return clamp(mix(1.0, lighting, smoothstep(-bevel, 0.0, dist)) * mask, 0.0, 1.0);
}

// 71: PyramidPattern
float typePyramidPattern(vec2 uv) {
    float scale = u_params[0];
    float depth = u_params[1];
    vec2 p = fract(uv * scale) - 0.5;
    float d = max(abs(p.x), abs(p.y));
    float val = 1.0 - d * 2.0 * depth;
    return clamp(val, 0.0, 1.0);
}

// 73: CellularEdge
float typeCellularEdge(vec2 uv) {
    float scale = u_params[0];
    float jitter = u_params[1];
    float thickness = u_params[2];
    vec2 p = uv * scale;
    vec2 pi = floor(p);
    vec2 pf = fract(p);
    float d1 = 8.0;
    float d2 = 8.0;
    for (int y = -1; y <= 1; y++) {
        for (int x = -1; x <= 1; x++) {
            vec2 nb = vec2(float(x), float(y));
            vec2 pt = hash2v2(pi + nb) * jitter;
            vec2 diff = nb + pt - pf;
            float d = dot(diff, diff);
            if (d < d1) {
                d2 = d1;
                d1 = d;
            } else if (d < d2) {
                d2 = d;
            }
        }
    }
    float dist = sqrt(d2) - sqrt(d1);
    float val = 1.0 - smoothstep(thickness, thickness + 0.05, dist);
    return clamp(val, 0.0, 1.0);
}

// 74: Weave
float typeWeave(vec2 uv) {
    float scale = u_params[0];
    float width = u_params[1];
    float shadow = u_params[2];
    vec2 p = uv * scale;
    vec2 f = fract(p);
    vec2 i = floor(p);
    
    float parity = mod(i.x + i.y, 2.0);
    float v = 0.0;
    if (parity < 0.5) {
        float dx = abs(f.y - 0.5) * 2.0;
        float dy = abs(f.x - 0.5) * 2.0;
        if (dx < width) {
            v = 1.0 - dx * shadow;
        } else if (dy < width) {
            v = 0.5 - dy * shadow;
        }
    } else {
        float dx = abs(f.y - 0.5) * 2.0;
        float dy = abs(f.x - 0.5) * 2.0;
        if (dy < width) {
            v = 1.0 - dy * shadow;
        } else if (dx < width) {
            v = 0.5 - dx * shadow;
        }
    }
    return clamp(v, 0.0, 1.0);
}

// 75: SpiralV2
float typeSpiralV2(vec2 uv) {
    float arms = u_params[0];
    float power = u_params[1];
    float speed = u_params[2];
    vec2 centered = uv - 0.5;
    float r = length(centered);
    float a = atan(centered.y, centered.x);
    float v = sin(arms * a + log(r) * 10.0 * power + u_time * speed);
    return clamp(v * 0.5 + 0.5, 0.0, 1.0);
}

// 76: Scanline
float typeScanline(vec2 uv) {
    float count = u_params[0];
    float speed = u_params[1];
    float brightness = u_params[2];
    float y = uv.y * count + u_time * speed;
    float val = sin(y) * 0.5 + 0.5;
    return clamp(val * brightness, 0.0, 1.0);
}

// 78: Kaleido
float typeKaleido(vec2 uv) {
    float sides = u_params[0];
    float scale = u_params[1];
    float speed = u_params[2];
    vec2 p = uv - 0.5;
    float r = length(p);
    float a = atan(p.y, p.x);
    float pi2 = 6.2831853;
    float segment = pi2 / sides;
    a = mod(a, segment);
    a = abs(a - segment / 2.0);
    p = r * vec2(cos(a), sin(a));
    p *= scale;
    float val = snoise(p + u_time * speed) * 0.5 + 0.5;
    return clamp(val, 0.0, 1.0);
}

// 79: FractalCamo
float typeFractalCamo(vec2 uv) {
    float scale = u_params[0];
    float levels = u_params[1];
    float smoothness = u_params[2];
    vec2 p = uv * scale;
    float n = fbm(p, 6, 2.0, 0.5);
    n = n * levels;
    float level = floor(n);
    float f = smoothstep(0.0, smoothness, fract(n));
    float val = (level + f) / levels;
    return clamp(val, 0.0, 1.0);
}

// 81: SweepGradient
float typeSweepGradient(vec2 uv) {
    float turns = u_params[0];
    float offset = u_params[1] * 3.14159265 / 180.0;
    vec2 p = uv - 0.5;
    float a = atan(p.y, p.x) + offset;
    a = a / (2.0 * 3.14159265) + 0.5;
    float val = fract(a * turns);
    return clamp(val, 0.0, 1.0);
}

// 82: DiamondGrid (統合型 - subMode: 0=アウトライン, 1=塗りつぶし)
float typeDiamondGrid(vec2 uv, float mode) {
    int subMode = int(mode);
    float scale, lineWidth, softness;
    if (subMode == 0) {
        scale = u_params[0];
        lineWidth = u_params[1];
        softness = clamp(u_params[2], 0.0, 1.0);
    }
    else if (subMode == 1) {
        scale = u_params[0];
        lineWidth = u_params[1];
        softness = clamp(u_params[2], 0.0, 1.0);
    }

    if (subMode == 0) {
        // 〔アウトライン〕旧DiamondGrid
        vec2 p = uv * scale;
        vec2 p2 = vec2(p.x - p.y, p.x + p.y);
        float d1 = abs(fract(p2.x) - 0.5) * 2.0;
        float d2 = abs(fract(p2.y) - 0.5) * 2.0;
        float v1 = 1.0 - smoothstep(lineWidth - softness * 0.1, lineWidth + softness * 0.1, d1);
        float v2 = 1.0 - smoothstep(lineWidth - softness * 0.1, lineWidth + softness * 0.1, d2);
        return clamp(max(v1, v2), 0.0, 1.0);
    } else {
        // 〔塗りつぶし〕旧DiamondPattern
        vec2  p = uv * scale;
        vec2  a = abs(fract(p) - 0.5);
        float d = a.x + a.y;
        float val = 1.0 - smoothstep(lineWidth * 0.4 - softness * 0.1,
                                       lineWidth * 0.4 + softness * 0.1, d);
        return clamp(val, 0.0, 1.0);
    }
}

// 83: Bricks
float typeBricks(vec2 uv) {
    float cols = u_params[0];
    float rows = u_params[1];
    float mortar = u_params[2];
    float shift = u_params[3];
    vec2 p = uv * vec2(cols, rows);
    float yi = floor(p.y);
    float offset = mod(yi, 2.0) * shift;
    float x = p.x + offset;
    vec2 b = fract(vec2(x, p.y));
    vec2 d = min(b, 1.0 - b);
    float dist = min(d.x * rows / cols, d.y);
    float val = smoothstep(0.0, mortar, dist);
    return clamp(val, 0.0, 1.0);
}

// 84: ChainLink
float typeChainLink(vec2 uv) {
    float scale = u_params[0];
    float thickness = u_params[1];
    vec2 p = uv * scale;
    vec2 i = floor(p);
    vec2 f = fract(p) - 0.5;
    float dist = length(f) * 2.0;
    float hole = 1.0 - smoothstep(thickness, thickness + 0.1, dist);
    return clamp(hole, 0.0, 1.0);
}

// 85: PlasmaV2
float typePlasmaV2(vec2 uv) {
    float scale = u_params[0];
    float speed = u_params[1];
    float complexity = u_params[2];
    vec2 p = uv * scale;
    float t = u_time * speed;
    float v = 0.0;
    for(int i=0; i<5; i++) {
        if (float(i) >= complexity) break;
        v += sin(p.x + t);
        v += sin(p.y + t);
        t += 1.0;
        p = p * vec2(0.8, 1.2) + vec2(v);
    }
    v = sin(v * 3.14159) * 0.5 + 0.5;
    return clamp(v, 0.0, 1.0);
}

// 86: GrungeV2
float typeGrungeV2(vec2 uv) {
    float scale = u_params[0];
    float scratches = u_params[1];
    float spots = u_params[2];
    vec2 p = uv * scale;
    float np = fbm(p * 5.0, 6, 2.0, 0.5);
    float ns = snoise(p * vec2(10.0, 0.5));
    float scratchVal = smoothstep(1.0 - scratches, 1.0, abs(ns));
    float spotVal = smoothstep(1.0 - spots, 1.0, np);
    return clamp(max(scratchVal, spotVal), 0.0, 1.0);
}

// 87: Pulse
float typePulse(vec2 uv) {
    float freq = u_params[0];
    float width = u_params[1];
    float count = u_params[2];
    vec2 p = uv - 0.5;
    float t = u_time * freq;
    float r = length(p) * 2.0;
    float rings = fract(r * count - t);
    float val = 1.0 - abs(rings - 0.5) * 2.0;
    val = smoothstep(1.0 - width * 2.0, 1.0, val);
    return clamp(val, 0.0, 1.0);
}

// 88: Burst
float typeBurst(vec2 uv) {
    float rays = u_params[0];
    float noiseFreq = u_params[1];
    float power = u_params[2];
    vec2 p = uv - 0.5;
    float a = atan(p.y, p.x);
    float n = snoise(vec2(a * noiseFreq, u_time)) * 0.5 + 0.5;
    float val = abs(sin(a * rays/2.0 + n));
    val = pow(val, power);
    float r = length(p) * 2.0;
    return clamp(val * max(0.0, 1.0 - r + n*0.2), 0.0, 1.0);
}

// 89: Twirl
float typeTwirl(vec2 uv) {
    float strength = u_params[0];
    float radius = u_params[1];
    float baseScale = u_params[2];
    vec2 p = uv - 0.5;
    float dist = length(p);
    float angle = atan(p.y, p.x);
    float twirlAmount = strength * max(0.0, radius - dist) / radius;
    float newAngle = angle + twirlAmount;
    vec2 newP = vec2(cos(newAngle), sin(newAngle)) * dist;
    float val = fbm((newP + 0.5) * baseScale + u_time * 0.5, 4, 2.0, 0.5);
    return clamp(val, 0.0, 1.0);
}

// 90: Vignette
float typeVignette(vec2 uv) {
    float radius = u_params[0];
    float softness = u_params[1];
    float roundness = u_params[2];
    vec2 p = uv - 0.5;
    float lg = length(p);
    float bx = max(abs(p.x), abs(p.y));
    float dist = mix(bx, lg, roundness) * 2.0;
    float val = 1.0 - smoothstep(radius - softness, radius, dist);
    return clamp(val, 0.0, 1.0);
}

// 91: Halftone
float typeHalftone(vec2 uv) {
    float scale = u_params[0];
    float angle = u_params[1] * 3.14159265 / 180.0;
    float contrast = u_params[2];
    float c = cos(angle), s = sin(angle);
    vec2 p = vec2(c * uv.x - s * uv.y, s * uv.x + c * uv.y);
    p *= scale;
    float dotSize = (sin(p.x) * sin(p.y)) * 0.5 + 0.5;
    float img = uv.x * 0.5 + uv.y * 0.5;
    float val = smoothstep(img - contrast * 0.1, img + contrast * 0.1, dotSize);
    return clamp(val, 0.0, 1.0);
}

// 92: Mosaic
float typeMosaic(vec2 uv) {
    float blocksX = u_params[0];
    float blocksY = u_params[1];
    float scale = u_params[2];
    vec2 p = floor(uv * vec2(blocksX, blocksY)) / vec2(blocksX, blocksY);
    float val = fbm(p * scale + u_time * 0.1, 4, 2.0, 0.5);
    return clamp(val, 0.0, 1.0);
}

// 93: VoronoiFluid
float typeVoronoiFluid(vec2 uv) {
    float scale = u_params[0];
    float speed = u_params[1];
    float smoothness = u_params[2];
    vec2 p = uv * scale;
    float t = u_time * speed;
    vec2 pi = floor(p);
    vec2 pf = fract(p);
    float res = 8.0;
    for(int j=-1; j<=1; j++) {
        for(int i=-1; i<=1; i++) {
            vec2 b = vec2(float(i), float(j));
            vec2 pt = hash2v2(pi + b);
            pt = 0.5 + 0.5 * sin(t + 6.2831 * pt);
            vec2 r = vec2(b) - pf + pt;
            float d = dot(r, r);
            res = min(res, d);
        }
    }
    float val = smoothstep(0.0, smoothness, res);
    return clamp(1.0 - val, 0.0, 1.0);
}

// 94: Grain
float typeGrain(vec2 uv) {
    float strength = u_params[0];
    float speed = u_params[1];
    float n = hash1v2(uv + floor(u_time * speed * 10.0) * 0.1);
    float val = mix(0.5, n, strength);
    return clamp(val, 0.0, 1.0);
}

// 95: DistortionWave
float typeDistortionWave(vec2 uv) {
    float freq = u_params[0];
    float amp = u_params[1];
    float baseScale = u_params[2];
    vec2 p = uv;
    p.x += sin(p.y * freq + u_time * 2.0) * amp;
    p.y += cos(p.x * freq + u_time * 2.0) * amp;
    float val = fbm(p * baseScale, 5, 2.0, 0.5);
    return clamp(val, 0.0, 1.0);
}

// 96: PolarDots
float typePolarDots(vec2 uv) {
    float rings = u_params[0];
    float dots = u_params[1];
    float radius = u_params[2];
    vec2 p = uv - 0.5;
    float r = length(p);
    float a = atan(p.y, p.x);
    float ringIdx = floor(r * rings);
    float ringR = (ringIdx + 0.5) / rings;
    float dotSpacing = 3.14159265 * 2.0 / dots;
    float aIdx = floor(a / dotSpacing);
    float dotA = (aIdx + 0.5) * dotSpacing;
    vec2 center = vec2(cos(dotA), sin(dotA)) * ringR;
    float dist = length(p - center);
    float dotRad = radius / rings * 0.5;
    float val = 1.0 - smoothstep(dotRad - 0.01, dotRad, dist);
    val *= step(r, 0.5);
    return clamp(val, 0.0, 1.0);
}

// 98: Crystal
float typeCrystal(vec2 uv) {
    float scale = u_params[0];
    float jagged = u_params[1];
    float layers = u_params[2];
    vec2 p = uv * scale;
    float val = 0.0;
    float amp = 1.0;
    for(int i=0; i<5; i++) {
        if (float(i) >= layers) break;
        vec2 pi = floor(p);
        vec2 pf = fract(p);
        float d1 = 8.0;
        for (int y = -1; y <= 1; y++) {
            for (int x = -1; x <= 1; x++) {
                vec2 nb = vec2(float(x), float(y));
                vec2 pt = hash2v2(pi + nb) * jagged;
                vec2 diff = nb + pt - pf;
                d1 = min(d1, max(abs(diff.x), abs(diff.y)));
            }
        }
        val += d1 * amp;
        p *= 2.0;
        amp *= 0.5;
    }
    return clamp(val, 0.0, 1.0);
}

// 99: AbsNoise
float typeAbsNoise(vec2 uv) {
    float scale = u_params[0];
    float power = u_params[1];
    float octaves = u_params[2];
    vec2 p = uv * scale + u_time * 0.5;
    float n = 0.0;
    float amp = 1.0;
    float freq = 1.0;
    for(int i=0; i<8; i++) {
        if(float(i) >= octaves) break;
        n += abs(snoise(p * freq)) * amp;
        freq *= 2.0;
        amp *= 0.5;
    }
    return clamp(pow(n, power), 0.0, 1.0);
}

// 100: EnergyRing
float typeEnergyRing(vec2 uv) {
    float radius = u_params[0];
    float thickness = u_params[1];
    float noiseScale = u_params[2];
    float power = u_params[3];
    vec2 p = uv - 0.5;
    float angle = atan(p.y, p.x);
    // 円周上のノイズ
    float n = snoise(vec2(cos(angle), sin(angle)) * noiseScale + u_time * 2.0) * 0.5 + 0.5;
    float dist = length(p);
    // 半径をノイズで揺らす
    float r = radius + n * thickness;
    float lineDist = abs(dist - r);
    float val = thickness / (lineDist * 10.0 + thickness);
    return clamp(pow(val, power), 0.0, 1.0);
}

// 101: SparkBurst
float typeSparkBurst(vec2 uv) {
    float count = u_params[0];
    float speed = u_params[1];
    float len = u_params[2];
    float width = u_params[3];
    vec2 p = uv - 0.5;
    float angle = atan(p.y, p.x);
    float dist = length(p);
    
    // 角度を分割してパーティクルを配置
    float segment = floor(angle * count / 6.2831853);
    float segmentAngle = (segment + 0.5) * 6.2831853 / count;
    
    // 各パーティクルのランダムプロパティ
    float hash = hash1(segment);
    float timeOffset = hash * 10.0;
    float pSpeed = speed * (0.5 + hash * 0.5);
    
    // 進行度 (0.0 から 1.0 でループ)
    float progress = fract(u_time * pSpeed + timeOffset);
    // 中心から外へ移動
    float pRadius = progress * 1.5;
    
    // 角度のズレ (線の太さ)
    float angleDist = abs(angle - segmentAngle);
    // 距離のズレ (線の長さ)
    float radDist = abs(dist - pRadius);
    
    // 描画
    float val = smoothstep(width / dist, 0.0, angleDist); // 外側ほど太くならないように補正
    val *= smoothstep(len, 0.0, radDist);
    // フェードアウト
    val *= (1.0 - progress);
    
    // 中心付近の除外
    val *= smoothstep(0.0, 0.1, dist);

    return clamp(val, 0.0, 1.0);
}

// 102: Wormhole
float typeWormhole(vec2 uv) {
    float scale = u_params[0];
    float speed = u_params[1];
    float voidSize = u_params[2];
    float contrast = u_params[3];
    vec2 p = uv - 0.5;
    float dist = length(p);
    float angle = atan(p.y, p.x);

    // 吸い込まれるようなUV座標変形
    // 中心に近いほどスケールが大きくなり、角度がねじれる
    float twirl = 1.0 / (dist * 2.0 + 0.1);
    vec2 polarUv = vec2(
        1.0 / (dist + 0.01) * scale - u_time * speed * 2.0,
        angle * 2.0 + twirl - u_time * speed
    );

    float n = fbm(polarUv, 4, 2.0, 0.5);
    float val = pow(n, contrast);
    
    // 中心部分（ブラックホール）をくり抜く
    float mask = smoothstep(voidSize - 0.1, voidSize + 0.1, dist);
    
    return clamp(val * mask, 0.0, 1.0);
}

// 103: StarFlare
float typeStarFlare(vec2 uv) {
    float intensity = u_params[0];
    float spikeWidth = u_params[1];
    float spikeLen = u_params[2];
    float haloSize = u_params[3];
    
    vec2 p = uv - 0.5;
    float dist = length(p);
    
    // コアの光
    float core = clamp(0.02 / (dist * dist + 0.001), 0.0, 1.0);
    
    // 十字の光の筋 (スパイク)
    // x軸とy軸に沿った距離
    float dx = abs(p.x);
    float dy = abs(p.y);
    
    float spikeX = (spikeWidth / (dy * 50.0 + spikeWidth)) * max(0.0, 1.0 - dx / spikeLen);
    float spikeY = (spikeWidth / (dx * 50.0 + spikeWidth)) * max(0.0, 1.0 - dy / spikeLen);
    float spikes = spikeX + spikeY;

    // ハロ (周囲のぼやっとした光)
    float halo = smoothstep(haloSize, 0.0, dist) * 0.3;

    // またたき (フリッカー)
    float flicker = snoise(vec2(u_time * 5.0, 0.0)) * 0.1 + 0.9;

    float val = (core + spikes * 2.0 + halo) * intensity * flicker;
    return clamp(val, 0.0, 1.0);
}

// 104: ImpactLines
float typeImpactLines(vec2 uv) {
    float density = u_params[0];
    float len = u_params[1];
    float sharpness = u_params[2];
    float centerClear = u_params[3];

    vec2 p = uv - 0.5;
    float angle = atan(p.y, p.x);
    float dist = length(p);

    // 放射状の線 (1Dノイズっぽいもの)
    float n = hash1(floor(angle * density) / density);
    
    // ランダムなアニメーション（チカチカ入れ替わる）
    float t = floor(u_time * 15.0);
    float anim = hash1(n + t);

    // 線の太さ
    float line = smoothstep(sharpness * 0.1, 0.0, abs(fract(angle * density) - 0.5));

    // 各線の長さ (ランダム)
    float innerEdge = centerClear + anim * len;
    float mask = smoothstep(innerEdge - 0.05, innerEdge + 0.05, dist);

    float val = line * mask * (0.5 + anim * 0.5);
    return clamp(val, 0.0, 1.0);
}

// 105: AuraRing
float typeAuraRing(vec2 uv) {
    float radius = u_params[0];
    float thickness = u_params[1];
    float flameScale = u_params[2];
    float rayIntensity = u_params[3];

    vec2 p = uv - 0.5;
    float dist = length(p);
    float angle = atan(p.y, p.x);

    // リング本体の形（少し歪ませる）
    float distort = snoise(vec2(cos(angle), sin(angle)) * flameScale * 0.5 + u_time) * 0.1;
    float r = radius + distort * thickness;
    
    // ベースとなるリング
    float ring = thickness / (abs(dist - r) * 10.0 + thickness);

    // 炎状のモヤ
    vec2 noiseUv = vec2(angle * flameScale, dist * flameScale - u_time * 2.0);
    float flame = fbm(noiseUv, 3, 2.0, 0.5);
    
    // 放射状の光 (Ray)
    float rayNoise = hash1(floor(angle * 30.0) / 30.0);
    float ray = smoothstep(0.5, 1.0, flame) * (1.0 - dist) * rayIntensity * rayNoise;

    float val = ring * flame * 2.0 + ray;
    return clamp(val, 0.0, 1.0);
}

// 106: Crescent (統合型 - subMode でスタイルを切り替え)
// subMode: 0=従来, 1=内側グロー, 2=クレセント+リング
float typeCrescent(vec2 uv, float mode) {
    float radius = u_params[0];
    float innerRadius = u_params[1];
    float angle = u_params[2] * 3.14159265 / 180.0;
    float softness = u_params[3];
    float glowPower = u_params[4];
    float ringWidth = u_params[5];

    vec2 p = uv - 0.5;
    
    float dist1 = length(p);
    float val1 = 1.0 - smoothstep(radius - softness, radius, dist1);
    
    vec2 offset = vec2(cos(angle), sin(angle)) * (radius - innerRadius) * 0.5;
    float dist2 = length(p - offset);
    float val2  = smoothstep(innerRadius - softness, innerRadius, dist2);
    float fill  = val1 * val2;

    float glow = 0.0;
    if (glowPower > 0.0) {
        float innerEdgeDist = abs(dist2 - innerRadius);
        glow = exp(-innerEdgeDist * glowPower * 10.0) * val1;
    }

    float ring = 0.0;
    if (ringWidth > 0.0) {
        ring = 1.0 - smoothstep(radius - ringWidth, radius, dist1);
        ring -= 1.0 - smoothstep(radius - ringWidth * 2.0, radius - ringWidth, dist1);
    }

    return clamp(fill + glow * 0.8 + max(0.0, ring), 0.0, 1.0);
}


// 107: Glare
float typeGlare(vec2 uv) {
    float rays = u_params[0];
    float width = u_params[1];
    float len = u_params[2];
    float coreInt = u_params[3];

    vec2 p = uv - 0.5;
    float dist = length(p);
    float a = atan(p.y, p.x);
    
    // 中心点
    float core = clamp(0.1 / (dist * (20.0 - coreInt * 10.0) + 0.1), 0.0, 1.0);

    // スパイク
    float val = 0.0;
    for(float i=0.0; i<8.0; i++) {
        if(i >= rays) break;
        // 角度の設定
        float ang = a + i * 3.14159265 / rays;
        // 横にする
        float spikeDist = abs(sin(ang)) * dist;
        float spike = (width / (spikeDist * 100.0 + width)) * max(0.0, 1.0 - dist / len);
        val += spike;
    }
    
    val += core * coreInt;
    return clamp(val, 0.0, 1.0);
}

// 108: LaserBeam
float typeLaserBeam(vec2 uv) {
    float density = u_params[0];
    float speed = u_params[1];
    float heightVar = u_params[2];
    float glow = u_params[3];

    // 水平方向
    vec2 p = uv;
    
    // y軸ベースにノイズを生成し、直線を引く
    float yGrid = floor(p.y * density) / density;
    
    // その位置でのランダムジェネレータ
    float hash = hash1(yGrid);
    
    // 描画される線幅のバリエーション
    float h = mix(0.1, 1.0, hash) * heightVar;
    
    // 線の位置
    float lineDist = abs(fract(p.y * density) - 0.5);
    
    // 水平方向の動き
    float xMove = fract(p.x - u_time * speed * (hash - 0.5) * 2.0);
    // ランダムな破線にするためのX座標マスク
    float xMask = smoothstep(0.4, 0.6, hash1v2(vec2(floor(xMove * 5.0), yGrid)));

    float line = (0.01 / (lineDist * 5.0 / h + 0.01)) * xMask;
    
    // グロー
    float lGlow = smoothstep(0.5, 0.0, lineDist) * glow * xMask;

    return clamp(line + lGlow, 0.0, 1.0);
}

// 109: GlitchBlock
float typeGlitchBlock(vec2 uv) {
    float scaleX = u_params[0];
    float scaleY = u_params[1];
    float speed = u_params[2];
    float density = u_params[3];

    vec2 p = uv;
    // タイミングを離散的にする（カクカク動く）
    float t = floor(u_time * speed * 10.0) / 10.0;
    
    // ブロック単位の座標
    vec2 grid = vec2(
        floor(p.x * scaleX),
        floor(p.y * scaleY)
    );
    
    // 横方向に引き伸ばされたランダムノイズ
    float n = hash1v2(grid + vec2(t * 0.1, t));
    
    // しきい値でブロックをON/OFF
    float val = step(1.0 - density, n);
    
    // 薄いノイズも混ぜる
    val += smoothstep(1.0 - density * 1.5, 1.0, n) * 0.5;

    return clamp(val, 0.0, 1.0);
}

// -------------------------
// 110: AnalogGlitch (アナログ・VHS風横ノイズ)
// params: [0]lines, [1]speed, [2]glitchWidth, [3]sharpness
// -------------------------
float typeAnalogGlitch(vec2 uv) {
    float lines = max(1.0, u_params[0]);  // 走査線数
    float speed = u_params[1];
    float gWidth = u_params[2];
    float sharpness = max(0.1, u_params[3]);

    vec2 p = vec2(uv.x, floor(uv.y * lines) / lines);
    float t = u_time * speed + 1.0; // +1.0 でtime=0でもてきときにならない
    float r1 = hash1v2(vec2(p.y * 1.3, floor(t * 5.0) * 0.1));
    float r2 = hash1v2(vec2(p.y * 2.7, floor(t * 3.1) * 0.3));

    // 各行のランダムなXズレ
    float shift = (r1 - 0.5) * gWidth;
    // ノイズ値（snoiseは-1ひ1なのので渔標化）
    float noiseVal = snoise(vec2((uv.x + shift) * 3.0, p.y * 5.0 + t * 0.3)) * 0.5 + 0.5;
    // 毎行に別のノイズのブレンド
    float lineNoise = hash1v2(vec2(p.y * 5.0, t * 0.05)) * 0.5 + 0.3;
    
    float v = mix(lineNoise, noiseVal, 0.7);
    v = clamp(v, 0.0, 1.0);
    v = pow(v, 1.0 / sharpness);

    return clamp(v, 0.0, 1.0);
}

// -------------------------
// 111: CosmicPortal (宇宙の渦/ブラックホール)
// params: [0]zoom, [1]twist, [2]evoSpeed, [3]detail
// -------------------------
float typeCosmicPortal(vec2 uv) {
    float zoom = max(0.1, u_params[0]);
    float twist = u_params[1];
    float speed = u_params[2];
    float detail = max(0.1, u_params[3]);

    vec2 p = uv - 0.5;
    float r = length(p);
    float a = atan(p.y, p.x);

    // 渦巻き表現
    float warpAngle = twist * exp(-r * 4.0);
    float ta = a + warpAngle;
    vec2 vortexUv = vec2(cos(ta), sin(ta)) * r * zoom;
    
    // FBMで星雲モヤ
    float t = u_time * speed;
    float n1 = fbm(vortexUv * 2.0 + vec2(0.3, 0.7) + t * 0.3, 4, 2.0, 0.5);
    float n2 = fbm(vortexUv * 3.5 + vec2(1.1, 2.3) - t * 0.2, 4, 2.0, 0.5);
    float n3 = fbm(vortexUv * 7.0 + vec2(3.7, 0.9) + t * 0.1, 4, 2.0, 0.5);

    float val = (n1 + n2 * 0.5 + n3 * 0.25) / 1.75;
    val = clamp(val, 0.0, 1.0);
    val = pow(val, 1.0 / detail);

    // 中心を少し陰にする
    float centerDark = 1.0 - smoothstep(0.0, 0.1, r);
    val = max(0.0, val - centerDark * 0.5);

    return clamp(val, 0.0, 1.0);
}

// -------------------------
// 112: CyberBlock (四角い集合ノイズ)
// params: [0]grid, [1]flashSpeed, [2]density, [3]blur
// -------------------------
float typeCyberBlock(vec2 uv) {
    float grid = max(1.0, u_params[0]);
    float speed = u_params[1];
    float density = u_params[2];
    float blur = u_params[3];

    vec2 p = uv * grid;
    vec2 id = floor(p);
    vec2 lp = fract(p);

    // 各セルにランダムな値
    float r = hash1v2(id);
    float t = u_time * speed;
    
    // ランダムな位相でサイン波（time=0でも各セルがバラバラな値を持つ）
    float appear = sin(t + r * 6.28318) * 0.5 + 0.5;
    
    // 出現率の閾値処理
    float v = smoothstep(1.0 - density, 1.0, appear);
    
    // エッジの処理（blur > 0 なら円滑な境界、それ以外はベタ層り）
    float blurAmt = max(blur, 0.01); // 少なくとも2pxのソフトエッジ
    float edgeD = min(min(lp.x, 1.0-lp.x), min(lp.y, 1.0-lp.y));
    v *= smoothstep(0.0, blurAmt, edgeD);
    
    return clamp(v, 0.0, 1.0);
}

// -------------------------
// 113: ToxicCloud (毒の雲・煙)
// params: [0]scale, [1]speed, [2]octaves, [3]softness
// -------------------------
float typeToxicCloud(vec2 uv) {
    float scale = max(0.1, u_params[0]);
    float speed = u_params[1];
    float octavesParam = u_params[2];
    float soft = max(0.01, u_params[3]);

    vec2 p = uv * scale;
    float t = u_time * speed;

    // octavesが0や未初期化のときも安全に動だす
    int oct = max(1, int(octavesParam));
    
    // Domain Warping
    vec2 q = vec2(
        fbm(p + vec2(1.7, 9.2), oct, 2.0, 0.5),
        fbm(p + vec2(8.3, 2.8), oct, 2.0, 0.5)
    );
    vec2 r = vec2(
        fbm(p + 4.0 * q + vec2(0.0, t * 0.5), oct, 2.0, 0.5),
        fbm(p + 4.0 * q + vec2(5.2, t * 0.3), oct, 2.0, 0.5)
    );
    float n = fbm(p + r * 3.0 + vec2(t * 0.2, 0.0), oct, 2.0, 0.5);
    n = clamp(n, 0.0, 1.0);
    
    float v = smoothstep(0.2, 0.9, n);
    v = pow(v, 1.0 / soft);
    
    return clamp(v, 0.0, 1.0);
}

// -------------------------
// 114: GeoRelief (地形・レリーフ風ノイズ)
// params: [0]scale, [1]elevation, [2]detail, [3]sharpness
// -------------------------
float typeGeoRelief(vec2 uv) {
    float scale = max(0.1, u_params[0]);
    float elev = max(0.01, u_params[1]);
    float detail = max(0.1, u_params[2]);
    float sharp = max(0.01, u_params[3]);

    vec2 p = uv * scale;
    float n = 0.0;
    float amp = 1.0;
    float freq = 1.0;
    float maxAmp = 0.0;
    
    for (int i = 0; i < 5; i++) {
        // snoise は-1～1返すので、絕対値後に0～1になる
        float s = abs(snoise(p * freq + vec2(3.7, 1.3))); // 基準座標をオフセット
        s = 1.0 - s; // 谷を1、山をを0にリッジ化
        s = pow(s, detail);
        
        n += s * amp;
        maxAmp += amp;
        amp *= 0.5;
        freq *= 2.0;
    }
    n /= maxAmp;
    
    // 陰影（X方向のグラディエント近似）
    float eps = 0.01;
    float nR = 0.0; float amp2 = 1.0; float freq2 = 1.0; float maxA2 = 0.0;
    for (int i = 0; i < 5; i++) {
        float sx = abs(snoise((p + vec2(eps, 0.0)) * freq2 + vec2(3.7, 1.3))); sx = 1.0 - sx; sx = pow(sx, detail);
        nR += sx * amp2; maxA2 += amp2; amp2 *= 0.5; freq2 *= 2.0;
    }
    nR /= maxA2;
    float shadow = clamp((nR - n) * 8.0, -1.0, 1.0);
    
    float v = clamp(pow(n * elev, sharp) + shadow * 0.3, 0.0, 1.0);
    return v;
}

float getVal0(vec2 uv, int type) {
    float val = -1.0;
    if      (type == 0) val = typeCircle(uv, 0.0);
    else if (type == 201) val = typeCircle(uv, 2.0);
    else if (type == 202) val = typeCircle(uv, 3.0);
    else if (type == 203) val = typeCircle(uv, 4.0);
    else if (type == 204) val = typeCircle(uv, 5.0);
    else if (type == 232) val = typeRing(uv);
    else if (type == 233) val = typeWaveRing(uv, 0.0);
    else if (type == 205) val = typeWaveRing(uv, 1.0);
    else if (type == 206) val = typeWaveRing(uv, 2.0);
    else if (type == 207) val = typeWaveRing(uv, 3.0);
    else if (type == 3) val = typeGradation(uv, 0.0);
    else if (type == 208) val = typeGradation(uv, 1.0);
    else if (type == 209) val = typeGradation(uv, 2.0);
    else if (type == 234) val = typeWood(uv);
    else if (type == 235) val = typeChecker(uv, 0.0);
    else if (type == 210) val = typeChecker(uv, 1.0);
    else if (type == 211) val = typeChecker(uv, 2.0);
    else if (type == 212) val = typeChecker(uv, 3.0);
    else if (type == 236) val = typeSpark(uv);
    else if (type == 237) val = typeFlare(uv);
    else if (type == 10) val = typeCross(uv);
    else if (type == 222) val = typeSquareGrid(uv, 2.0);
    else if (type == 238) val = typeFlower(uv);
    else if (type == 15) val = typePerlinNoise(uv);
    else if (type == 239) val = typeFbmNoise(uv);
    else if (type == 240) val = typeVoronoiNoise(uv);
    else if (type == 241) val = typeVoronoiCell(uv);
    else if (type == 242) val = typeSimplexNoise(uv);
    else if (type == 243) val = typeMarbleNoise(uv);
    else if (type == 244) val = typeCell(uv);
    else if (type == 245) val = typeLightning(uv);
    else if (type == 246) val = typeSmoke(uv);
    else if (type == 247) val = typeFire(uv);
    else if (type == 248) val = typeFlame(uv);
    return val;
}

float getVal1(vec2 uv, int type) {
    float val = -1.0;
    if (type == 249) val = typeFlash(uv);
    else if (type == 27) val = typeCloud(uv);
    else if (type == 250) val = typeCaustics(uv);
    else if (type == 251) val = typeWaterTurbulence(uv);
    else if (type == 252) val = typeElectric(uv);
    else if (type == 253) val = typeEnergy(uv);
    else if (type == 254) val = typeSquiggles(uv);
    else if (type == 255) val = typeSpeckle(uv);
    else if (type == 256) val = typeGrunge(uv);
    else if (type == 213) val = typeHexGrid(uv, 1.0);
    else if (type == 258) val = typeSpiral(uv);
    else if (type == 38) val = typeRipple(uv);
    else if (type == 259) val = typePlasma(uv);
    else if (type == 260) val = typeConcentric(uv);
    else if (type == 261) val = typeStarBurst(uv);
    else if (type == 262) val = typeMetaBalls(uv);
    else if (type == 263) val = typeWrinkle(uv);
    else if (type == 264) val = typeFabric(uv);
    else if (type == 265) val = typeCrack(uv);
    else if (type == 266) val = typeLava(uv);
    else if (type == 267) val = typeMatrix(uv);
    else if (type == 50) val = typeStar(uv, 0.0);
    else if (type == 51) val = typePolygon(uv, 0.0);
    else if (type == 268) val = typeRectangle(uv, 0.0);
    else if (type == 269) val = typeHalo(uv);
    else if (type == 270) val = typeRayBurst(uv);
    return val;
}

float getVal2(vec2 uv, int type) {
    float val = -1.0;
    if (type == 271) val = typeGodRay(uv);
    else if (type == 272) val = typeBokeh(uv);
    else if (type == 273) val = typeAurora(uv);
    else if (type == 274) val = typeShimmer(uv);
    else if (type == 59) val = typeSquareGrid(uv, 0.0);
    else if (type == 221) val = typeSquareGrid(uv, 1.0);
    else if (type == 222) val = typeSquareGrid(uv, 2.0);
    else if (type == 223) val = typeSquareGrid(uv, 3.0);
    else if (type == 224) val = typeSquareGrid(uv, 4.0);
    else if (type == 225) val = typeSquareGrid(uv, 5.0);
    else if (type == 226) val = typeSquareGrid(uv, 6.0);
    else if (type == 227) val = typeLines(uv, 1.0);
    else if (type == 228) val = typeLines(uv, 2.0);
    else if (type == 276) val = typeTriGrid(uv);
    else if (type == 277) val = typeRadialLines(uv);
    else if (type == 278) val = typeSwirl(uv);
    else if (type == 279) val = typePixelNoise(uv);
    else if (type == 280) val = typeStripeNoise(uv);
    else if (type == 281) val = typeFlowLines(uv);
    else if (type == 282) val = typeSymmetricNoise(uv);
    else if (type == 283) val = typeBevelSquare(uv);
    else if (type == 284) val = typePyramidPattern(uv);
    else if (type == 285) val = typeCellularEdge(uv);
    else if (type == 286) val = typeWeave(uv);
    else if (type == 287) val = typeSpiralV2(uv);
    else if (type == 288) val = typeScanline(uv);
    else if (type == 289) val = typeKaleido(uv);
    else if (type == 290) val = typeFractalCamo(uv);
    else if (type == 291) val = typeSweepGradient(uv);
    else if (type == 293) val = typeBricks(uv);
    return val;
}

float getVal3(vec2 uv, int type) {
    float val = -1.0;
    if      (type == 295) val = typePlasmaV2(uv);
    else if (type == 296) val = typeGrungeV2(uv);
    else if (type == 297) val = typePulse(uv);
    else if (type == 298) val = typeBurst(uv);
    else if (type == 299) val = typeTwirl(uv);
    else if (type == 201) val = typeCircle(uv, 2.0);
    else if (type == 300) val = typeHalftone(uv);
    else if (type == 301) val = typeMosaic(uv);
    else if (type == 302) val = typeVoronoiFluid(uv);
    else if (type == 303) val = typeGrain(uv);
    else if (type == 304) val = typeDistortionWave(uv);
    else if (type == 305) val = typePolarDots(uv);
    else if (type == 306) val = typeCrystal(uv);
    else if (type == 307) val = typeAbsNoise(uv);
    else if (type == 308) val = typeEnergyRing(uv);
    else if (type == 309) val = typeSparkBurst(uv);
    else if (type == 310) val = typeWormhole(uv);
    else if (type == 311) val = typeStarFlare(uv);
    else if (type == 312) val = typeImpactLines(uv);
    else if (type == 313) val = typeAuraRing(uv);
    else if (type == 314) val = typeCrescent(uv, 0.0);
    else if (type == 315) val = typeGlare(uv);
    else if (type == 316) val = typeLaserBeam(uv);
    else if (type == 317) val = typeGlitchBlock(uv);
    else if (type == 110) val = typeAnalogGlitch(uv);
    else if (type == 318) val = typeCosmicPortal(uv);
    else if (type == 319) val = typeCyberBlock(uv);
    else if (type == 320) val = typeToxicCloud(uv);
    else if (type == 321) val = typeGeoRelief(uv);
    return val;
}

void main() {
    vec2 uv = v_uv;

    // 極座標変換
    if (u_polarConversion) {
        vec2 centered = uv - 0.5;
        float r     = length(centered) * 2.0;
        float theta = atan(centered.y, centered.x) / (2.0 * 3.14159) + 0.5;
        uv = vec2(r, theta);
    }

    // --- Transform & Scroll ---
    // [0] = ox, [1] = oy, [2] = sx, [3] = sy, [4] = rot
    // Scale & Offset (Center is 0.5, 0.5)
    uv -= 0.5;
    uv.x /= u_transform[2];
    uv.y /= u_transform[3];
    
    // Rotation
    float rot = u_transform[4] * 3.14159265 / 180.0;
    float c = cos(rot);
    float s = sin(rot);
    uv = vec2(uv.x * c - uv.y * s, uv.x * s + uv.y * c);
    
    uv += 0.5;
    uv -= vec2(u_transform[0], u_transform[1]);

    // Time Scroll
    uv += u_scroll * u_time;


    float val = getVal0(uv, u_type);
    if (val < -0.5) val = getVal1(uv, u_type);
    if (val < -0.5) val = getVal2(uv, u_type);
    if (val < -0.5) val = getVal3(uv, u_type);
    if (val < -0.5) val = 0.0;


    val = clamp(val, 0.0, 1.0);

    // 反転
    if (u_invertEnable) val = 1.0 - val;

    vec3 col;
    if (u_gradEnable) {
        // グラジエント LUTサンプリング
        col = texture(u_gradTex, vec2(val, 0.5)).rgb;
    } else {
        col = vec3(val);
    }

    if (u_solidColorEnabled) {
        col *= u_solidColor;
    }

    // --- マルチレイヤー合成 ---
    // 形状の値 val 自体をレイヤーの基本アルファとして扱う
    // fg.rgb は unpremultiplied の計算結果 (col)
    float baseAlpha = clamp(val, 0.0, 1.0);
    vec4 fg = vec4(col, baseAlpha);
    
    // 現在のレイヤーのプレマルチプライド値を計算
    float a_fg = fg.a * u_opacity;
    vec4 fg_pre = vec4(fg.rgb * a_fg, a_fg);

    if (u_isBaseLayer) {
        // 一番下のレイヤー
        if (u_blackBackground) {
            // 黒背景と合成 (C_out = C_fg + 0, A_out = 1.0)
            fragColor = vec4(fg_pre.rgb, 1.0);
        } else {
            fragColor = fg_pre;
        }
    } else {
        // 背面レイヤーもプレマルチプライド状態で渡ってくる
        vec4 bg = texture(u_backTex, v_uv);
        
        if (u_blendMode == 0) {
            // 0: Normal -> C_out = C_fg + C_bg * (1 - A_fg)
            fragColor = fg_pre + bg * (1.0 - fg_pre.a);
        } else if (u_blendMode == 1) {
            // 1: Add -> C_out = C_fg + C_bg
            fragColor = min(vec4(1.0), fg_pre + bg);
        } else if (u_blendMode == 2) {
            // 2: Multiply
            // pre-multiplied multiply: C_out = C_fg * C_bg + C_fg*(1-A_bg) + C_bg*(1-A_fg)
            vec3 multRGB = fg_pre.rgb * bg.rgb + fg_pre.rgb * (1.0 - bg.a) + bg.rgb * (1.0 - fg_pre.a);
            float multA = fg_pre.a + bg.a * (1.0 - fg_pre.a);
            fragColor = vec4(multRGB, multA);
        } else if (u_blendMode == 3) {
            // 3: Screen
            vec3 screenRGB = fg_pre.rgb + bg.rgb - fg_pre.rgb * bg.rgb;
            float screenA = fg_pre.a + bg.a - fg_pre.a * bg.a;
            fragColor = vec4(screenRGB, screenA);
        } else if (u_blendMode == 4) {
            // 4: Mask (クリッピングマスク)
            // 下地のアルファとRGBを、Foregroundの形状(fg.a)に合わせて削る
            float maskRatio = mix(1.0, fg.a, u_opacity);
            fragColor = bg * maskRatio;
        } else {
            fragColor = bg;
        }
    }
}
`;
