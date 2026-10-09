// AUTO-GENERATED from texture-create (gameanimation.info). Do not edit by hand.

export interface ParamSpec {
    key: string;
    en: string;
    ja: string;
    min: number;
    max: number;
    step: number;
    default: number;
    index: number;
}

export const PARAM_SLOTS = 16;

/** Canonical type order (source `ee`). */
export const TYPE_ORDER: string[] = [
    "Circle",
    "Vignette",
    "LensFlare",
    "Sun",
    "SolarGlow",
    "Ring",
    "Crescent",
    "Flash",
    "EnergyRing",
    "AuraRing",
    "Halo",
    "Ripple",
    "Concentric",
    "Pulse",
    "MetaBalls",
    "WaveRingSine",
    "WaveRingNoisy",
    "WaveRingSquare",
    "WaveRingDouble",
    "Star",
    "Polygon",
    "HexGridRadial",
    "Rectangle",
    "Checker",
    "GradientChecker",
    "RoundChecker",
    "DiamondChecker",
    "Spark",
    "Flare",
    "Cross",
    "Glare",
    "StarFlare",
    "RayBurst",
    "Burst",
    "ImpactLines",
    "RadialLines",
    "SpiralV2",
    "Swirl",
    "GodRay",
    "StarBurst",
    "Flower",
    "Spiral",
    "Energy",
    "Crack",
    "Bokeh",
    "Shimmer",
    "VoronoiFluid",
    "Speckle",
    "CrossGrid",
    "SquareGrid",
    "PyramidPattern",
    "RandomTiles",
    "SquareGridDash",
    "Dots",
    "SquareGridPolka",
    "DotMatrix",
    "Zigzag",
    "Crosshatch",
    "TriGrid",
    "Bricks",
    "Scanline",
    "FlowLines",
    "Fabric",
    "PolarDots",
    "Weave",
    "Halftone",
    "SweepGradient",
    "GradationLinear",
    "GradationReflect",
    "GradationRepeat",
    "BevelSquare",
    "Grain",
    "PerlinNoise",
    "FbmNoise",
    "DistortionWave",
    "StripeNoise",
    "ToxicCloud",
    "GeoRelief",
    "Smoke",
    "WaterTurbulence",
    "Electric",
    "SimplexNoise",
    "Lava",
    "Wrinkle",
    "Crystal",
    "AbsNoise",
    "FractalCamo",
    "PlasmaV2",
    "Squiggles",
    "Grunge",
    "GrungeV2",
    "CellularEdge",
    "Twirl",
    "CosmicPortal",
    "Wormhole",
    "Plasma",
    "MarbleNoise",
    "Fire",
    "Cloud",
    "Caustics",
    "Aurora",
    "Flame",
    "PixelNoise",
    "AnalogGlitch",
    "CyberBlock",
    "Mosaic",
    "LaserBeam",
    "GlitchBlock",
    "VoronoiCell",
    "Matrix",
    "Wood",
    "SparkBurst",
    "VoronoiNoise",
    "Cell",
    "Lightning",
    "Kaleido",
    "SymmetricNoise"
];

/** type name -> shader u_type integer (source `Ft`). */
export const TYPE_ID: Record<string, number> = {
    "Circle": 0,
    "Vignette": 201,
    "LensFlare": 202,
    "Sun": 203,
    "SolarGlow": 204,
    "Ring": 232,
    "WaveRingSine": 233,
    "WaveRingNoisy": 205,
    "WaveRingSquare": 206,
    "WaveRingDouble": 207,
    "GradationLinear": 3,
    "GradationReflect": 208,
    "GradationRepeat": 209,
    "Wood": 234,
    "Checker": 235,
    "GradientChecker": 210,
    "RoundChecker": 211,
    "DiamondChecker": 212,
    "Spark": 236,
    "Flare": 237,
    "Cross": 10,
    "CrossGrid": 222,
    "Flower": 238,
    "PerlinNoise": 15,
    "FbmNoise": 239,
    "VoronoiNoise": 240,
    "VoronoiCell": 241,
    "SimplexNoise": 242,
    "MarbleNoise": 243,
    "Cell": 244,
    "Lightning": 245,
    "Smoke": 246,
    "Fire": 247,
    "Flame": 248,
    "Flash": 249,
    "Cloud": 27,
    "Caustics": 250,
    "WaterTurbulence": 251,
    "Electric": 252,
    "Energy": 253,
    "Squiggles": 254,
    "Speckle": 255,
    "Grunge": 256,
    "HexGridRadial": 213,
    "Spiral": 258,
    "Ripple": 38,
    "Plasma": 259,
    "Concentric": 260,
    "StarBurst": 261,
    "MetaBalls": 262,
    "Wrinkle": 263,
    "Fabric": 264,
    "Crack": 265,
    "Lava": 266,
    "Matrix": 267,
    "Star": 50,
    "Polygon": 51,
    "Rectangle": 268,
    "Halo": 269,
    "RayBurst": 270,
    "GodRay": 271,
    "Bokeh": 272,
    "Aurora": 273,
    "Shimmer": 274,
    "SquareGrid": 59,
    "Dots": 221,
    "SquareGridDash": 223,
    "RandomTiles": 224,
    "SquareGridPolka": 225,
    "DotMatrix": 226,
    "Zigzag": 227,
    "Crosshatch": 228,
    "TriGrid": 276,
    "RadialLines": 277,
    "Swirl": 278,
    "PixelNoise": 279,
    "StripeNoise": 280,
    "FlowLines": 281,
    "SymmetricNoise": 282,
    "BevelSquare": 283,
    "PyramidPattern": 284,
    "CellularEdge": 285,
    "Weave": 286,
    "SpiralV2": 287,
    "Scanline": 288,
    "Kaleido": 289,
    "FractalCamo": 290,
    "SweepGradient": 291,
    "Bricks": 293,
    "PlasmaV2": 295,
    "GrungeV2": 296,
    "Pulse": 297,
    "Burst": 298,
    "Twirl": 299,
    "Halftone": 300,
    "Mosaic": 301,
    "VoronoiFluid": 302,
    "Grain": 303,
    "DistortionWave": 304,
    "PolarDots": 305,
    "Crystal": 306,
    "AbsNoise": 307,
    "EnergyRing": 308,
    "SparkBurst": 309,
    "Wormhole": 310,
    "StarFlare": 311,
    "ImpactLines": 312,
    "AuraRing": 313,
    "Crescent": 314,
    "Glare": 315,
    "LaserBeam": 316,
    "GlitchBlock": 317,
    "AnalogGlitch": 110,
    "CosmicPortal": 318,
    "CyberBlock": 319,
    "ToxicCloud": 320,
    "GeoRelief": 321
};

export const TYPE_COUNT = TYPE_ORDER.length;

/** Per-type parameter descriptors (source `vt`). */
export const PARAM_SPECS: Record<string, ParamSpec[]> = {
    "Circle": [
        {
            "key": "radius",
            "en": "Radius",
            "ja": "半径",
            "min": 0,
            "max": 2,
            "step": 0.01,
            "default": 0.5,
            "index": 0
        },
        {
            "key": "softness",
            "en": "Softness",
            "ja": "ぼかし",
            "min": 0,
            "max": 1,
            "step": 0.01,
            "default": 0.2,
            "index": 1
        },
        {
            "key": "power",
            "en": "Power Exponent",
            "ja": "減衰力",
            "min": 0.1,
            "max": 10,
            "step": 0.1,
            "default": 1,
            "index": 2
        }
    ],
    "Vignette": [
        {
            "key": "radius",
            "en": "Radius",
            "ja": "半径",
            "min": 0.1,
            "max": 2,
            "step": 0.05,
            "default": 0.8,
            "index": 0
        },
        {
            "key": "softness",
            "en": "Softness",
            "ja": "ぼかし",
            "min": 0,
            "max": 2,
            "step": 0.05,
            "default": 0.5,
            "index": 1
        },
        {
            "key": "roundness",
            "en": "Roundness",
            "ja": "丸み",
            "min": 0,
            "max": 1,
            "step": 0.01,
            "default": 1,
            "index": 2
        }
    ],
    "LensFlare": [
        {
            "key": "radius",
            "en": "Radius",
            "ja": "半径",
            "min": 0,
            "max": 2,
            "step": 0.01,
            "default": 0.5,
            "index": 0
        },
        {
            "key": "power",
            "en": "Power Exponent",
            "ja": "減衰力",
            "min": 0.1,
            "max": 10,
            "step": 0.1,
            "default": 1,
            "index": 1
        },
        {
            "key": "coronaSize",
            "en": "Glow Range",
            "ja": "グロー範囲",
            "min": 0.5,
            "max": 20,
            "step": 0.5,
            "default": 3,
            "index": 2
        }
    ],
    "Sun": [
        {
            "key": "radius",
            "en": "Radius",
            "ja": "半径",
            "min": 0,
            "max": 2,
            "step": 0.01,
            "default": 0.5,
            "index": 0
        },
        {
            "key": "coronaSize",
            "en": "Glow Range",
            "ja": "グロー範囲",
            "min": 0.5,
            "max": 20,
            "step": 0.5,
            "default": 3,
            "index": 1
        }
    ],
    "SolarGlow": [
        {
            "key": "power",
            "en": "Power Exponent",
            "ja": "減衰力",
            "min": 0.1,
            "max": 10,
            "step": 0.1,
            "default": 1,
            "index": 0
        },
        {
            "key": "intensity",
            "en": "Intensity",
            "ja": "明るさ",
            "min": 0,
            "max": 2,
            "step": 0.01,
            "default": 1,
            "index": 1
        }
    ],
    "Ring": [
        {
            "key": "radius",
            "en": "Radius",
            "ja": "半径",
            "min": 0,
            "max": 2,
            "step": 0.01,
            "default": 0.5,
            "index": 0
        },
        {
            "key": "width",
            "en": "Width",
            "ja": "太さ",
            "min": 0,
            "max": 0.5,
            "step": 0.01,
            "default": 0.1,
            "index": 1
        },
        {
            "key": "softness",
            "en": "Softness",
            "ja": "ぼかし",
            "min": 0,
            "max": 1,
            "step": 0.01,
            "default": 0.1,
            "index": 2
        },
        {
            "key": "power",
            "en": "Power Exponent",
            "ja": "減衰力",
            "min": 0.1,
            "max": 10,
            "step": 0.1,
            "default": 1,
            "index": 3
        }
    ],
    "WaveRingSine": [
        {
            "key": "radius",
            "en": "Radius",
            "ja": "半径",
            "min": 0,
            "max": 2,
            "step": 0.01,
            "default": 0.5,
            "index": 0
        },
        {
            "key": "width",
            "en": "Width",
            "ja": "太さ",
            "min": 0,
            "max": 0.5,
            "step": 0.01,
            "default": 0.08,
            "index": 1
        },
        {
            "key": "frequency",
            "en": "Frequency",
            "ja": "波の数",
            "min": 1,
            "max": 30,
            "step": 1,
            "default": 6,
            "index": 2
        },
        {
            "key": "amplitude",
            "en": "Amplitude",
            "ja": "波の振幅",
            "min": 0,
            "max": 0.5,
            "step": 0.01,
            "default": 0.05,
            "index": 3
        },
        {
            "key": "power",
            "en": "Power Exponent",
            "ja": "減衰力",
            "min": 0.1,
            "max": 10,
            "step": 0.1,
            "default": 1,
            "index": 4
        }
    ],
    "WaveRingNoisy": [
        {
            "key": "radius",
            "en": "Radius",
            "ja": "半径",
            "min": 0,
            "max": 2,
            "step": 0.01,
            "default": 0.5,
            "index": 0
        },
        {
            "key": "width",
            "en": "Width",
            "ja": "太さ",
            "min": 0,
            "max": 0.5,
            "step": 0.01,
            "default": 0.08,
            "index": 1
        },
        {
            "key": "amplitude",
            "en": "Amplitude",
            "ja": "波の振幅",
            "min": 0,
            "max": 0.5,
            "step": 0.01,
            "default": 0.05,
            "index": 2
        },
        {
            "key": "power",
            "en": "Power Exponent",
            "ja": "減衰力",
            "min": 0.1,
            "max": 10,
            "step": 0.1,
            "default": 1,
            "index": 3
        },
        {
            "key": "noiseScale",
            "en": "Noise Scale",
            "ja": "ノイズスケール",
            "min": 0,
            "max": 10,
            "step": 0.1,
            "default": 3,
            "index": 4
        }
    ],
    "WaveRingSquare": [
        {
            "key": "radius",
            "en": "Radius",
            "ja": "半径",
            "min": 0,
            "max": 2,
            "step": 0.01,
            "default": 0.5,
            "index": 0
        },
        {
            "key": "width",
            "en": "Width",
            "ja": "太さ",
            "min": 0,
            "max": 0.5,
            "step": 0.01,
            "default": 0.08,
            "index": 1
        },
        {
            "key": "frequency",
            "en": "Frequency",
            "ja": "波の数",
            "min": 1,
            "max": 30,
            "step": 1,
            "default": 6,
            "index": 2
        },
        {
            "key": "amplitude",
            "en": "Amplitude",
            "ja": "波の振幅",
            "min": 0,
            "max": 0.5,
            "step": 0.01,
            "default": 0.05,
            "index": 3
        },
        {
            "key": "power",
            "en": "Power Exponent",
            "ja": "減衰力",
            "min": 0.1,
            "max": 10,
            "step": 0.1,
            "default": 1,
            "index": 4
        }
    ],
    "WaveRingDouble": [
        {
            "key": "radius",
            "en": "Radius",
            "ja": "半径",
            "min": 0,
            "max": 2,
            "step": 0.01,
            "default": 0.5,
            "index": 0
        },
        {
            "key": "width",
            "en": "Width",
            "ja": "太さ",
            "min": 0,
            "max": 0.5,
            "step": 0.01,
            "default": 0.08,
            "index": 1
        },
        {
            "key": "frequency",
            "en": "Frequency",
            "ja": "波の数",
            "min": 1,
            "max": 30,
            "step": 1,
            "default": 6,
            "index": 2
        },
        {
            "key": "amplitude",
            "en": "Amplitude",
            "ja": "波の振幅",
            "min": 0,
            "max": 0.5,
            "step": 0.01,
            "default": 0.05,
            "index": 3
        },
        {
            "key": "power",
            "en": "Power Exponent",
            "ja": "減衰力",
            "min": 0.1,
            "max": 10,
            "step": 0.1,
            "default": 1,
            "index": 4
        }
    ],
    "GradationLinear": [
        {
            "key": "angle",
            "en": "Angle",
            "ja": "角度",
            "min": -360,
            "max": 360,
            "step": 1,
            "default": 0,
            "index": 0
        },
        {
            "key": "scale",
            "en": "Scale (Repeat)",
            "ja": "スケール(反復)",
            "min": 0.1,
            "max": 20,
            "step": 0.1,
            "default": 1,
            "index": 1
        },
        {
            "key": "offset",
            "en": "Offset",
            "ja": "オフセット",
            "min": -1,
            "max": 1,
            "step": 0.01,
            "default": 0,
            "index": 2
        },
        {
            "key": "power",
            "en": "Power Exponent",
            "ja": "減衰力",
            "min": 0.1,
            "max": 10,
            "step": 0.1,
            "default": 1,
            "index": 3
        }
    ],
    "GradationReflect": [
        {
            "key": "angle",
            "en": "Angle",
            "ja": "角度",
            "min": -360,
            "max": 360,
            "step": 1,
            "default": 0,
            "index": 0
        },
        {
            "key": "scale",
            "en": "Scale (Repeat)",
            "ja": "スケール(反復)",
            "min": 0.1,
            "max": 20,
            "step": 0.1,
            "default": 1,
            "index": 1
        },
        {
            "key": "offset",
            "en": "Offset",
            "ja": "オフセット",
            "min": -1,
            "max": 1,
            "step": 0.01,
            "default": 0,
            "index": 2
        },
        {
            "key": "power",
            "en": "Power Exponent",
            "ja": "減衰力",
            "min": 0.1,
            "max": 10,
            "step": 0.1,
            "default": 1,
            "index": 3
        }
    ],
    "GradationRepeat": [
        {
            "key": "angle",
            "en": "Angle",
            "ja": "角度",
            "min": -360,
            "max": 360,
            "step": 1,
            "default": 0,
            "index": 0
        },
        {
            "key": "scale",
            "en": "Scale (Repeat)",
            "ja": "スケール(反復)",
            "min": 0.1,
            "max": 20,
            "step": 0.1,
            "default": 1,
            "index": 1
        },
        {
            "key": "offset",
            "en": "Offset",
            "ja": "オフセット",
            "min": -1,
            "max": 1,
            "step": 0.01,
            "default": 0,
            "index": 2
        },
        {
            "key": "power",
            "en": "Power Exponent",
            "ja": "減衰力",
            "min": 0.1,
            "max": 10,
            "step": 0.1,
            "default": 1,
            "index": 3
        }
    ],
    "Wood": [
        {
            "key": "frequency",
            "en": "Frequency",
            "ja": "密度",
            "min": 1,
            "max": 50,
            "step": 0.5,
            "default": 10,
            "index": 0
        },
        {
            "key": "power",
            "en": "Contrast",
            "ja": "コントラスト",
            "min": 0.1,
            "max": 5,
            "step": 0.1,
            "default": 1,
            "index": 1
        },
        {
            "key": "turbulence",
            "en": "Turbulence",
            "ja": "歪み",
            "min": 0,
            "max": 5,
            "step": 0.1,
            "default": 1,
            "index": 2
        }
    ],
    "Checker": [
        {
            "key": "widthX",
            "en": "Width X",
            "ja": "分割数 X",
            "min": 1,
            "max": 100,
            "step": 1,
            "default": 8,
            "index": 0
        },
        {
            "key": "widthY",
            "en": "Width Y",
            "ja": "分割数 Y",
            "min": 1,
            "max": 100,
            "step": 1,
            "default": 8,
            "index": 1
        }
    ],
    "GradientChecker": [
        {
            "key": "widthX",
            "en": "Width X",
            "ja": "分割数 X",
            "min": 1,
            "max": 100,
            "step": 1,
            "default": 8,
            "index": 0
        },
        {
            "key": "widthY",
            "en": "Width Y",
            "ja": "分割数 Y",
            "min": 1,
            "max": 100,
            "step": 1,
            "default": 8,
            "index": 1
        }
    ],
    "RoundChecker": [
        {
            "key": "widthX",
            "en": "Width X",
            "ja": "分割数 X",
            "min": 1,
            "max": 100,
            "step": 1,
            "default": 8,
            "index": 0
        },
        {
            "key": "widthY",
            "en": "Width Y",
            "ja": "分割数 Y",
            "min": 1,
            "max": 100,
            "step": 1,
            "default": 8,
            "index": 1
        },
        {
            "key": "roundness",
            "en": "Roundness",
            "ja": "丸み",
            "min": 0,
            "max": 1,
            "step": 0.01,
            "default": 0,
            "index": 2
        }
    ],
    "DiamondChecker": [
        {
            "key": "widthX",
            "en": "Width X",
            "ja": "分割数 X",
            "min": 1,
            "max": 100,
            "step": 1,
            "default": 8,
            "index": 0
        },
        {
            "key": "widthY",
            "en": "Width Y",
            "ja": "分割数 Y",
            "min": 1,
            "max": 100,
            "step": 1,
            "default": 8,
            "index": 1
        },
        {
            "key": "roundness",
            "en": "Roundness",
            "ja": "丸み",
            "min": 0,
            "max": 1,
            "step": 0.01,
            "default": 0,
            "index": 2
        }
    ],
    "Spark": [
        {
            "key": "intensity",
            "en": "Intensity",
            "ja": "明るさ",
            "min": 0,
            "max": 2,
            "step": 0.01,
            "default": 1,
            "index": 0
        },
        {
            "key": "power",
            "en": "Power Exponent",
            "ja": "鋭さ",
            "min": 0.1,
            "max": 20,
            "step": 0.1,
            "default": 8,
            "index": 1
        },
        {
            "key": "arms",
            "en": "Arms",
            "ja": "条数",
            "min": 2,
            "max": 64,
            "step": 1,
            "default": 6,
            "index": 2
        }
    ],
    "Flare": [
        {
            "key": "intensity",
            "en": "Intensity",
            "ja": "明るさ",
            "min": 0,
            "max": 2,
            "step": 0.01,
            "default": 1,
            "index": 0
        },
        {
            "key": "power",
            "en": "Power Exponent",
            "ja": "鋭さ",
            "min": 0.1,
            "max": 10,
            "step": 0.1,
            "default": 3,
            "index": 1
        }
    ],
    "Cross": [
        {
            "key": "intensity",
            "en": "Intensity",
            "ja": "明るさ",
            "min": 0,
            "max": 2,
            "step": 0.01,
            "default": 1,
            "index": 0
        },
        {
            "key": "power",
            "en": "Power Exponent",
            "ja": "鋭さ",
            "min": 0.1,
            "max": 10,
            "step": 0.1,
            "default": 1,
            "index": 1
        },
        {
            "key": "width",
            "en": "Width",
            "ja": "太さ",
            "min": 0.01,
            "max": 2,
            "step": 0.01,
            "default": 0.2,
            "index": 2
        }
    ],
    "Flower": [
        {
            "key": "petals",
            "en": "Petals",
            "ja": "花びらの数",
            "min": 1,
            "max": 30,
            "step": 1,
            "default": 5,
            "index": 0
        },
        {
            "key": "radius",
            "en": "Radius",
            "ja": "半径",
            "min": 0,
            "max": 2,
            "step": 0.01,
            "default": 0.8,
            "index": 1
        },
        {
            "key": "offset",
            "en": "Offset / Twist",
            "ja": "オフセット / 捻り",
            "min": 0,
            "max": 2,
            "step": 0.01,
            "default": 0,
            "index": 2
        },
        {
            "key": "intensity",
            "en": "Intensity",
            "ja": "明るさ",
            "min": 0,
            "max": 2,
            "step": 0.01,
            "default": 1,
            "index": 3
        },
        {
            "key": "power",
            "en": "Power Exponent",
            "ja": "減衰力",
            "min": 0.1,
            "max": 10,
            "step": 0.1,
            "default": 1,
            "index": 4
        }
    ],
    "PerlinNoise": [
        {
            "key": "frequency",
            "en": "Frequency",
            "ja": "スケール",
            "min": 0.5,
            "max": 40,
            "step": 0.5,
            "default": 4,
            "index": 0
        },
        {
            "key": "octaves",
            "en": "Octaves",
            "ja": "オクターブ(細部)",
            "min": 1,
            "max": 10,
            "step": 1,
            "default": 4,
            "index": 1
        },
        {
            "key": "persistence",
            "en": "Persistence",
            "ja": "減衰効果",
            "min": 0.1,
            "max": 1,
            "step": 0.05,
            "default": 0.5,
            "index": 2
        },
        {
            "key": "amplitude",
            "en": "Amplitude",
            "ja": "振幅",
            "min": 0,
            "max": 2,
            "step": 0.01,
            "default": 1,
            "index": 3
        }
    ],
    "FbmNoise": [
        {
            "key": "frequency",
            "en": "Frequency",
            "ja": "スケール",
            "min": 0.5,
            "max": 40,
            "step": 0.5,
            "default": 3,
            "index": 0
        },
        {
            "key": "octaves",
            "en": "Octaves",
            "ja": "オクターブ(細部)",
            "min": 1,
            "max": 10,
            "step": 1,
            "default": 6,
            "index": 1
        },
        {
            "key": "lacunarity",
            "en": "Lacunarity",
            "ja": "粗さ",
            "min": 1,
            "max": 4,
            "step": 0.1,
            "default": 2,
            "index": 2
        },
        {
            "key": "gain",
            "en": "Gain",
            "ja": "ゲイン",
            "min": 0.1,
            "max": 1,
            "step": 0.05,
            "default": 0.5,
            "index": 3
        }
    ],
    "VoronoiNoise": [
        {
            "key": "scale",
            "en": "Scale",
            "ja": "スケール",
            "min": 0.5,
            "max": 50,
            "step": 0.5,
            "default": 6,
            "index": 0
        },
        {
            "key": "jitter",
            "en": "Jitter",
            "ja": "ランダム性",
            "min": 0,
            "max": 1,
            "step": 0.01,
            "default": 1,
            "index": 1
        },
        {
            "key": "power",
            "en": "Power Exponent",
            "ja": "コントラスト",
            "min": 0.1,
            "max": 5,
            "step": 0.1,
            "default": 1,
            "index": 2
        }
    ],
    "VoronoiCell": [
        {
            "key": "scale",
            "en": "Scale",
            "ja": "スケール",
            "min": 0.5,
            "max": 50,
            "step": 0.5,
            "default": 6,
            "index": 0
        },
        {
            "key": "jitter",
            "en": "Jitter",
            "ja": "ランダム性",
            "min": 0,
            "max": 1,
            "step": 0.01,
            "default": 1,
            "index": 1
        }
    ],
    "SimplexNoise": [
        {
            "key": "frequency",
            "en": "Frequency",
            "ja": "スケール",
            "min": 0.5,
            "max": 40,
            "step": 0.5,
            "default": 3,
            "index": 0
        },
        {
            "key": "octaves",
            "en": "Octaves",
            "ja": "オクターブ(細部)",
            "min": 1,
            "max": 8,
            "step": 1,
            "default": 4,
            "index": 1
        }
    ],
    "MarbleNoise": [
        {
            "key": "scale",
            "en": "Scale",
            "ja": "スケール",
            "min": 0.5,
            "max": 20,
            "step": 0.5,
            "default": 4,
            "index": 0
        },
        {
            "key": "frequency",
            "en": "Frequency",
            "ja": "線の密度",
            "min": 0.5,
            "max": 20,
            "step": 0.5,
            "default": 4,
            "index": 1
        },
        {
            "key": "turbulence",
            "en": "Turbulence",
            "ja": "歪み",
            "min": 0,
            "max": 5,
            "step": 0.1,
            "default": 2,
            "index": 2
        }
    ],
    "Cell": [
        {
            "key": "intensity",
            "en": "Intensity",
            "ja": "明るさ",
            "min": 0,
            "max": 2,
            "step": 0.01,
            "default": 1,
            "index": 0
        },
        {
            "key": "size",
            "en": "Size",
            "ja": "サイズ",
            "min": 0.5,
            "max": 40,
            "step": 0.5,
            "default": 5,
            "index": 1
        },
        {
            "key": "power",
            "en": "Power Exponent",
            "ja": "減衰力",
            "min": 0.1,
            "max": 10,
            "step": 0.1,
            "default": 1,
            "index": 2
        }
    ],
    "Lightning": [
        {
            "key": "intensity",
            "en": "Intensity",
            "ja": "明るさ",
            "min": 0,
            "max": 2,
            "step": 0.01,
            "default": 1,
            "index": 0
        },
        {
            "key": "frequency",
            "en": "Frequency",
            "ja": "波打ち",
            "min": 0.5,
            "max": 20,
            "step": 0.5,
            "default": 3,
            "index": 1
        },
        {
            "key": "width",
            "en": "Width",
            "ja": "太さ",
            "min": 0.1,
            "max": 5,
            "step": 0.1,
            "default": 1,
            "index": 2
        }
    ],
    "Smoke": [
        {
            "key": "volume",
            "en": "Volume",
            "ja": "密度",
            "min": 1,
            "max": 10,
            "step": 0.5,
            "default": 3,
            "index": 0
        },
        {
            "key": "beta",
            "en": "Beta",
            "ja": "広がり",
            "min": 0.1,
            "max": 5,
            "step": 0.1,
            "default": 1.5,
            "index": 1
        },
        {
            "key": "delta",
            "en": "Delta",
            "ja": "微細さ",
            "min": 0.01,
            "max": 0.5,
            "step": 0.01,
            "default": 0.1,
            "index": 2
        }
    ],
    "Fire": [
        {
            "key": "intensity",
            "en": "Intensity",
            "ja": "明るさ",
            "min": 0,
            "max": 2,
            "step": 0.01,
            "default": 1,
            "index": 0
        },
        {
            "key": "strength",
            "en": "Strength",
            "ja": "燃え上がり",
            "min": 0,
            "max": 10,
            "step": 0.1,
            "default": 1.5,
            "index": 1
        },
        {
            "key": "power",
            "en": "Power",
            "ja": "減衰力",
            "min": 0.1,
            "max": 5,
            "step": 0.1,
            "default": 0.7,
            "index": 2
        },
        {
            "key": "range",
            "en": "Range",
            "ja": "範囲",
            "min": 0.5,
            "max": 5,
            "step": 0.1,
            "default": 2,
            "index": 3
        },
        {
            "key": "width",
            "en": "Width",
            "ja": "太さ",
            "min": 0.1,
            "max": 5,
            "step": 0.1,
            "default": 0.6,
            "index": 4
        }
    ],
    "Flame": [
        {
            "key": "intensity",
            "en": "Intensity",
            "ja": "明るさ",
            "min": 0,
            "max": 2,
            "step": 0.01,
            "default": 1,
            "index": 0
        },
        {
            "key": "width",
            "en": "Width",
            "ja": "太さ",
            "min": 0.1,
            "max": 5,
            "step": 0.1,
            "default": 0.5,
            "index": 1
        },
        {
            "key": "scale",
            "en": "Scale",
            "ja": "炎の大きさ",
            "min": 0.1,
            "max": 10,
            "step": 0.1,
            "default": 2,
            "index": 2
        }
    ],
    "Flash": [
        {
            "key": "frequency",
            "en": "Frequency",
            "ja": "スパイク数",
            "min": 1,
            "max": 64,
            "step": 0.5,
            "default": 8,
            "index": 0
        },
        {
            "key": "power",
            "en": "Power Exponent",
            "ja": "減衰力",
            "min": 0.1,
            "max": 10,
            "step": 0.1,
            "default": 1,
            "index": 1
        }
    ],
    "Cloud": [
        {
            "key": "width",
            "en": "Width",
            "ja": "雲の幅",
            "min": 0.1,
            "max": 5,
            "step": 0.05,
            "default": 1,
            "index": 0
        },
        {
            "key": "height",
            "en": "Height",
            "ja": "雲の高さ",
            "min": 0.1,
            "max": 5,
            "step": 0.05,
            "default": 1,
            "index": 1
        },
        {
            "key": "intensity",
            "en": "Intensity",
            "ja": "明るさ",
            "min": 0,
            "max": 2,
            "step": 0.01,
            "default": 1,
            "index": 2
        },
        {
            "key": "ambient",
            "en": "Ambient",
            "ja": "環境光",
            "min": 0,
            "max": 1,
            "step": 0.01,
            "default": 0,
            "index": 3
        },
        {
            "key": "smoothness",
            "en": "Smoothness",
            "ja": "なめらかさ",
            "min": 0.1,
            "max": 1,
            "step": 0.01,
            "default": 0.6,
            "index": 4
        }
    ],
    "Caustics": [
        {
            "key": "scale",
            "en": "Scale",
            "ja": "スケール",
            "min": 0.5,
            "max": 30,
            "step": 0.5,
            "default": 5,
            "index": 0
        },
        {
            "key": "speed",
            "en": "Speed",
            "ja": "揺らぎ速度",
            "min": 0,
            "max": 10,
            "step": 0.1,
            "default": 1,
            "index": 1
        }
    ],
    "WaterTurbulence": [
        {
            "key": "scale",
            "en": "Scale",
            "ja": "スケール",
            "min": 0.5,
            "max": 40,
            "step": 0.5,
            "default": 4,
            "index": 0
        },
        {
            "key": "intensity",
            "en": "Intensity",
            "ja": "波の強さ",
            "min": 0,
            "max": 2,
            "step": 0.01,
            "default": 1,
            "index": 1
        }
    ],
    "Electric": [
        {
            "key": "frequency",
            "en": "Frequency",
            "ja": "波形数",
            "min": 0.5,
            "max": 20,
            "step": 0.5,
            "default": 3,
            "index": 0
        },
        {
            "key": "scale",
            "en": "Scale",
            "ja": "ノイズスケール",
            "min": 0.5,
            "max": 30,
            "step": 0.5,
            "default": 3,
            "index": 1
        },
        {
            "key": "power",
            "en": "Power Exponent",
            "ja": "発光力",
            "min": 0.1,
            "max": 10,
            "step": 0.1,
            "default": 1,
            "index": 2
        }
    ],
    "Energy": [
        {
            "key": "power",
            "en": "Power",
            "ja": "発光力",
            "min": 0.1,
            "max": 10,
            "step": 0.1,
            "default": 1,
            "index": 0
        },
        {
            "key": "density",
            "en": "Density",
            "ja": "密度",
            "min": 1,
            "max": 50,
            "step": 1,
            "default": 8,
            "index": 1
        },
        {
            "key": "thickness",
            "en": "Thickness",
            "ja": "太さ",
            "min": 0.1,
            "max": 10,
            "step": 0.1,
            "default": 1,
            "index": 2
        },
        {
            "key": "scale",
            "en": "Scale",
            "ja": "スケール",
            "min": 0.5,
            "max": 20,
            "step": 0.1,
            "default": 2,
            "index": 3
        }
    ],
    "Squiggles": [
        {
            "key": "size",
            "en": "Size",
            "ja": "サイズ",
            "min": 0.5,
            "max": 20,
            "step": 0.5,
            "default": 3,
            "index": 0
        },
        {
            "key": "scale",
            "en": "Scale",
            "ja": "うねり度",
            "min": 0.5,
            "max": 20,
            "step": 0.5,
            "default": 3,
            "index": 1
        },
        {
            "key": "density",
            "en": "Density",
            "ja": "密度",
            "min": 1,
            "max": 20,
            "step": 0.5,
            "default": 3,
            "index": 2
        }
    ],
    "Speckle": [
        {
            "key": "radius",
            "en": "Radius",
            "ja": "粒半径",
            "min": 0.1,
            "max": 1,
            "step": 0.05,
            "default": 0.3,
            "index": 0
        },
        {
            "key": "scale",
            "en": "Scale",
            "ja": "スケール",
            "min": 1,
            "max": 60,
            "step": 1,
            "default": 10,
            "index": 1
        },
        {
            "key": "density",
            "en": "Density",
            "ja": "密度",
            "min": 0.1,
            "max": 1,
            "step": 0.05,
            "default": 0.5,
            "index": 2
        }
    ],
    "Grunge": [
        {
            "key": "scale",
            "en": "Scale",
            "ja": "スケール",
            "min": 0.5,
            "max": 30,
            "step": 0.5,
            "default": 3,
            "index": 0
        },
        {
            "key": "width",
            "en": "Width",
            "ja": "幅",
            "min": 0.1,
            "max": 5,
            "step": 0.1,
            "default": 1,
            "index": 1
        },
        {
            "key": "alpha",
            "en": "Alpha",
            "ja": "透明度",
            "min": 0,
            "max": 2,
            "step": 0.1,
            "default": 1,
            "index": 2
        }
    ],
    "HexGridRadial": [
        {
            "key": "scale",
            "en": "Scale / Rings",
            "ja": "スケール / リング数",
            "min": 0.5,
            "max": 50,
            "step": 0.5,
            "default": 6,
            "index": 0
        },
        {
            "key": "lineWidth",
            "en": "Line Width",
            "ja": "線の太さ",
            "min": 0.01,
            "max": 2,
            "step": 0.01,
            "default": 0.5,
            "index": 1
        },
        {
            "key": "smoothness",
            "en": "Smoothness",
            "ja": "なめらかさ",
            "min": 0,
            "max": 1,
            "step": 0.05,
            "default": 0.2,
            "index": 2
        }
    ],
    "Spiral": [
        {
            "key": "arms",
            "en": "Arms",
            "ja": "アーム数",
            "min": 1,
            "max": 20,
            "step": 1,
            "default": 2,
            "index": 0
        },
        {
            "key": "tightness",
            "en": "Tightness",
            "ja": "巻きの強さ",
            "min": 0.1,
            "max": 20,
            "step": 0.1,
            "default": 3,
            "index": 1
        },
        {
            "key": "radius",
            "en": "Radius",
            "ja": "半径",
            "min": 0.1,
            "max": 2,
            "step": 0.05,
            "default": 0.5,
            "index": 2
        },
        {
            "key": "width",
            "en": "Width",
            "ja": "太さ",
            "min": 0.1,
            "max": 2,
            "step": 0.05,
            "default": 0.4,
            "index": 3
        }
    ],
    "Ripple": [
        {
            "key": "radius",
            "en": "Radius",
            "ja": "半径",
            "min": 0.1,
            "max": 2,
            "step": 0.05,
            "default": 1,
            "index": 0
        },
        {
            "key": "frequency",
            "en": "Frequency",
            "ja": "波の密度",
            "min": 1,
            "max": 100,
            "step": 1,
            "default": 20,
            "index": 1
        },
        {
            "key": "amplitude",
            "en": "Amplitude",
            "ja": "波の振幅",
            "min": 0,
            "max": 2,
            "step": 0.1,
            "default": 1,
            "index": 2
        },
        {
            "key": "centerX",
            "en": "Center X",
            "ja": "中心座標 X",
            "min": 0,
            "max": 1,
            "step": 0.01,
            "default": 0.5,
            "index": 3
        },
        {
            "key": "centerY",
            "en": "Center Y",
            "ja": "中心座標 Y",
            "min": 0,
            "max": 1,
            "step": 0.01,
            "default": 0.5,
            "index": 4
        }
    ],
    "Plasma": [
        {
            "key": "frequency",
            "en": "Frequency",
            "ja": "密度",
            "min": 1,
            "max": 50,
            "step": 0.5,
            "default": 5,
            "index": 0
        },
        {
            "key": "colorShift",
            "en": "Color Shift",
            "ja": "色相シフト",
            "min": 0,
            "max": 6.28,
            "step": 0.1,
            "default": 0,
            "index": 1
        }
    ],
    "Concentric": [
        {
            "key": "frequency",
            "en": "Frequency",
            "ja": "円の密度",
            "min": 1,
            "max": 50,
            "step": 0.5,
            "default": 10,
            "index": 0
        },
        {
            "key": "offset",
            "en": "Offset",
            "ja": "オフセット",
            "min": 0,
            "max": 1,
            "step": 0.01,
            "default": 0,
            "index": 1
        },
        {
            "key": "softness",
            "en": "Softness",
            "ja": "ぼかし",
            "min": 0,
            "max": 1,
            "step": 0.01,
            "default": 0.05,
            "index": 2
        }
    ],
    "StarBurst": [
        {
            "key": "points",
            "en": "Points",
            "ja": "頂点数",
            "min": 2,
            "max": 32,
            "step": 1,
            "default": 5,
            "index": 0
        },
        {
            "key": "radius",
            "en": "Radius",
            "ja": "半径",
            "min": 0.1,
            "max": 2,
            "step": 0.05,
            "default": 1,
            "index": 1
        },
        {
            "key": "sharpness",
            "en": "Sharpness",
            "ja": "鋭さ",
            "min": 0.5,
            "max": 30,
            "step": 0.5,
            "default": 5,
            "index": 2
        }
    ],
    "MetaBalls": [
        {
            "key": "count",
            "en": "Count",
            "ja": "個数",
            "min": 1,
            "max": 16,
            "step": 1,
            "default": 3,
            "index": 0
        },
        {
            "key": "threshold",
            "en": "Threshold",
            "ja": "融合しきい値",
            "min": 0.1,
            "max": 10,
            "step": 0.1,
            "default": 1,
            "index": 1
        },
        {
            "key": "radius",
            "en": "Ball Radius",
            "ja": "ボール半径",
            "min": 0.05,
            "max": 1,
            "step": 0.01,
            "default": 0.2,
            "index": 2
        }
    ],
    "Wrinkle": [
        {
            "key": "scale",
            "en": "Scale",
            "ja": "スケール",
            "min": 0.5,
            "max": 30,
            "step": 0.5,
            "default": 3,
            "index": 0
        },
        {
            "key": "octaves",
            "en": "Octaves",
            "ja": "細部",
            "min": 1,
            "max": 10,
            "step": 1,
            "default": 5,
            "index": 1
        },
        {
            "key": "roughness",
            "en": "Roughness",
            "ja": "粗さ",
            "min": 0.1,
            "max": 1,
            "step": 0.05,
            "default": 0.6,
            "index": 2
        }
    ],
    "Fabric": [
        {
            "key": "warpFreq",
            "en": "Warp Frequency",
            "ja": "縦糸の密度",
            "min": 0.5,
            "max": 50,
            "step": 0.5,
            "default": 5,
            "index": 0
        },
        {
            "key": "weftFreq",
            "en": "Weft Frequency",
            "ja": "横糸の密度",
            "min": 0.5,
            "max": 50,
            "step": 0.5,
            "default": 5,
            "index": 1
        },
        {
            "key": "mix",
            "en": "Mix",
            "ja": "ブレンド率",
            "min": 0,
            "max": 1,
            "step": 0.05,
            "default": 0.5,
            "index": 2
        }
    ],
    "Crack": [
        {
            "key": "scale",
            "en": "Scale",
            "ja": "スケール",
            "min": 0.5,
            "max": 40,
            "step": 0.5,
            "default": 5,
            "index": 0
        },
        {
            "key": "threshold",
            "en": "Threshold",
            "ja": "しきい値",
            "min": 0.1,
            "max": 0.9,
            "step": 0.05,
            "default": 0.3,
            "index": 1
        },
        {
            "key": "depth",
            "en": "Depth",
            "ja": "深さ",
            "min": 0,
            "max": 2,
            "step": 0.05,
            "default": 0.8,
            "index": 2
        }
    ],
    "Lava": [
        {
            "key": "scale",
            "en": "Scale",
            "ja": "スケール",
            "min": 0.5,
            "max": 30,
            "step": 0.5,
            "default": 3,
            "index": 0
        },
        {
            "key": "threshold",
            "en": "Threshold",
            "ja": "しきい値",
            "min": 0.1,
            "max": 0.9,
            "step": 0.05,
            "default": 0.5,
            "index": 1
        },
        {
            "key": "sharpness",
            "en": "Sharpness",
            "ja": "シャープネス",
            "min": 0.1,
            "max": 10,
            "step": 0.1,
            "default": 1,
            "index": 2
        }
    ],
    "Matrix": [
        {
            "key": "speed",
            "en": "Speed",
            "ja": "スピード",
            "min": 0.1,
            "max": 10,
            "step": 0.1,
            "default": 1.5,
            "index": 0
        },
        {
            "key": "density",
            "en": "Column Density",
            "ja": "縦列の密度",
            "min": 5,
            "max": 100,
            "step": 1,
            "default": 20,
            "index": 1
        },
        {
            "key": "glowIntensity",
            "en": "Glow Intensity",
            "ja": "発光力",
            "min": 0,
            "max": 5,
            "step": 0.1,
            "default": 1,
            "index": 2
        }
    ],
    "Star": [
        {
            "key": "points",
            "en": "Points",
            "ja": "頂点数",
            "min": 3,
            "max": 20,
            "step": 1,
            "default": 5,
            "index": 0
        },
        {
            "key": "innerRadius",
            "en": "Inner Radius",
            "ja": "内半径",
            "min": 0.01,
            "max": 2,
            "step": 0.01,
            "default": 0.3,
            "index": 1
        },
        {
            "key": "outerRadius",
            "en": "Outer Radius",
            "ja": "外半径",
            "min": 0.01,
            "max": 2,
            "step": 0.01,
            "default": 0.8,
            "index": 2
        },
        {
            "key": "innerRoundness",
            "en": "Inner Roundness",
            "ja": "内側の丸み",
            "min": 0,
            "max": 0.5,
            "step": 0.01,
            "default": 0.02,
            "index": 3
        },
        {
            "key": "outerRoundness",
            "en": "Outer Roundness",
            "ja": "外側の丸み",
            "min": 0,
            "max": 0.5,
            "step": 0.01,
            "default": 0.05,
            "index": 4
        },
        {
            "key": "angle",
            "en": "Angle",
            "ja": "角度",
            "min": -360,
            "max": 360,
            "step": 1,
            "default": 0,
            "index": 5
        },
        {
            "key": "glowPower",
            "en": "Glow Power",
            "ja": "グロー強度",
            "min": 0,
            "max": 10,
            "step": 0.1,
            "default": 0,
            "index": 6
        },
        {
            "key": "outlineWidth",
            "en": "Outline Width",
            "ja": "アウトライン幅",
            "min": 0,
            "max": 0.2,
            "step": 0.005,
            "default": 0,
            "index": 7
        }
    ],
    "Polygon": [
        {
            "key": "sides",
            "en": "Sides",
            "ja": "角数",
            "min": 3,
            "max": 20,
            "step": 1,
            "default": 6,
            "index": 0
        },
        {
            "key": "radius",
            "en": "Radius",
            "ja": "半径",
            "min": 0.01,
            "max": 2,
            "step": 0.01,
            "default": 0.6,
            "index": 1
        },
        {
            "key": "softness",
            "en": "Softness",
            "ja": "ぼかし",
            "min": 0,
            "max": 1,
            "step": 0.01,
            "default": 0.02,
            "index": 2
        },
        {
            "key": "angle",
            "en": "Angle",
            "ja": "角度",
            "min": -360,
            "max": 360,
            "step": 1,
            "default": 0,
            "index": 3
        },
        {
            "key": "glowPower",
            "en": "Glow Power",
            "ja": "グロー強度",
            "min": 0,
            "max": 10,
            "step": 0.1,
            "default": 0,
            "index": 4
        },
        {
            "key": "outlineWidth",
            "en": "Outline Width",
            "ja": "アウトライン幅",
            "min": 0,
            "max": 0.3,
            "step": 0.005,
            "default": 0,
            "index": 5
        }
    ],
    "Rectangle": [
        {
            "key": "width",
            "en": "Width",
            "ja": "幅",
            "min": 0.01,
            "max": 2,
            "step": 0.01,
            "default": 0.8,
            "index": 0
        },
        {
            "key": "height",
            "en": "Height",
            "ja": "高さ",
            "min": 0.01,
            "max": 2,
            "step": 0.01,
            "default": 0.8,
            "index": 1
        },
        {
            "key": "softness",
            "en": "Softness",
            "ja": "ぼかし",
            "min": 0,
            "max": 1,
            "step": 0.01,
            "default": 0.02,
            "index": 2
        },
        {
            "key": "angle",
            "en": "Angle",
            "ja": "角度",
            "min": -360,
            "max": 360,
            "step": 1,
            "default": 0,
            "index": 3
        },
        {
            "key": "cornerRadius",
            "en": "Corner Radius",
            "ja": "角の丸み",
            "min": 0,
            "max": 1,
            "step": 0.01,
            "default": 0,
            "index": 4
        },
        {
            "key": "glowPower",
            "en": "Glow Power",
            "ja": "グロー強度",
            "min": 0,
            "max": 10,
            "step": 0.1,
            "default": 0,
            "index": 5
        },
        {
            "key": "outlineWidth",
            "en": "Outline Width",
            "ja": "アウトライン幅",
            "min": 0,
            "max": 0.3,
            "step": 0.005,
            "default": 0,
            "index": 6
        }
    ],
    "Halo": [
        {
            "key": "ringRadius",
            "en": "Ring Radius",
            "ja": "リング半径",
            "min": 0,
            "max": 2,
            "step": 0.01,
            "default": 0.6,
            "index": 0
        },
        {
            "key": "ringWidth",
            "en": "Ring Width",
            "ja": "リングの太さ",
            "min": 0.01,
            "max": 1,
            "step": 0.01,
            "default": 0.25,
            "index": 1
        },
        {
            "key": "coreGlow",
            "en": "Core Glow",
            "ja": "コアグロー",
            "min": 0,
            "max": 2,
            "step": 0.01,
            "default": 0.5,
            "index": 2
        },
        {
            "key": "power",
            "en": "Sharpness",
            "ja": "锐さ",
            "min": 0.1,
            "max": 10,
            "step": 0.1,
            "default": 2,
            "index": 3
        }
    ],
    "RayBurst": [
        {
            "key": "rays",
            "en": "Ray Count",
            "ja": "光線本数",
            "min": 2,
            "max": 32,
            "step": 1,
            "default": 12,
            "index": 0
        },
        {
            "key": "sharpness",
            "en": "Sharpness",
            "ja": "锐さ",
            "min": 0.1,
            "max": 20,
            "step": 0.1,
            "default": 4,
            "index": 1
        },
        {
            "key": "falloff",
            "en": "Falloff",
            "ja": "減衰",
            "min": 0.1,
            "max": 5,
            "step": 0.1,
            "default": 1.5,
            "index": 2
        },
        {
            "key": "spin",
            "en": "Spin (deg)",
            "ja": "回転角度",
            "min": -180,
            "max": 180,
            "step": 1,
            "default": 0,
            "index": 3
        },
        {
            "key": "power",
            "en": "Power",
            "ja": "強度",
            "min": 0.1,
            "max": 5,
            "step": 0.1,
            "default": 1,
            "index": 4
        }
    ],
    "GodRay": [
        {
            "key": "beams",
            "en": "Beam Count",
            "ja": "ビーム本数",
            "min": 1,
            "max": 8,
            "step": 1,
            "default": 5,
            "index": 0
        },
        {
            "key": "angle",
            "en": "Angle (deg)",
            "ja": "角度",
            "min": -180,
            "max": 180,
            "step": 1,
            "default": 90,
            "index": 1
        },
        {
            "key": "spread",
            "en": "Spread",
            "ja": "拡散",
            "min": 0.01,
            "max": 1,
            "step": 0.01,
            "default": 0.2,
            "index": 2
        },
        {
            "key": "falloff",
            "en": "Falloff",
            "ja": "色褱",
            "min": 0.1,
            "max": 5,
            "step": 0.1,
            "default": 1.5,
            "index": 3
        },
        {
            "key": "noise",
            "en": "Noise",
            "ja": "ノイズ",
            "min": 0,
            "max": 2,
            "step": 0.01,
            "default": 0.5,
            "index": 4
        }
    ],
    "Bokeh": [
        {
            "key": "count",
            "en": "Count",
            "ja": "個数",
            "min": 1,
            "max": 20,
            "step": 1,
            "default": 8,
            "index": 0
        },
        {
            "key": "radius",
            "en": "Radius",
            "ja": "半径",
            "min": 0.02,
            "max": 0.5,
            "step": 0.01,
            "default": 0.1,
            "index": 1
        },
        {
            "key": "softness",
            "en": "Softness",
            "ja": "ゼワさ",
            "min": 0,
            "max": 1,
            "step": 0.01,
            "default": 0.3,
            "index": 2
        },
        {
            "key": "seed",
            "en": "Seed",
            "ja": "シード",
            "min": 0,
            "max": 100,
            "step": 1,
            "default": 1,
            "index": 3
        },
        {
            "key": "glow",
            "en": "Glow",
            "ja": "グロー",
            "min": 0,
            "max": 2,
            "step": 0.01,
            "default": 0.4,
            "index": 4
        }
    ],
    "Aurora": [
        {
            "key": "bands",
            "en": "Bands",
            "ja": "帯の数",
            "min": 1,
            "max": 6,
            "step": 1,
            "default": 3,
            "index": 0
        },
        {
            "key": "height",
            "en": "Y Position",
            "ja": "Y位置",
            "min": 0.1,
            "max": 0.9,
            "step": 0.01,
            "default": 0.5,
            "index": 1
        },
        {
            "key": "width",
            "en": "Band Width",
            "ja": "帯の幅",
            "min": 0.1,
            "max": 5,
            "step": 0.1,
            "default": 1,
            "index": 2
        },
        {
            "key": "speed",
            "en": "Speed",
            "ja": "速度",
            "min": 0,
            "max": 3,
            "step": 0.1,
            "default": 0.5,
            "index": 3
        },
        {
            "key": "turbulence",
            "en": "Turbulence",
            "ja": "ねじれ",
            "min": 0,
            "max": 3,
            "step": 0.1,
            "default": 1,
            "index": 4
        }
    ],
    "Shimmer": [
        {
            "key": "count",
            "en": "Count",
            "ja": "個数",
            "min": 1,
            "max": 30,
            "step": 1,
            "default": 15,
            "index": 0
        },
        {
            "key": "size",
            "en": "Size",
            "ja": "大きさ",
            "min": 0.1,
            "max": 5,
            "step": 0.1,
            "default": 1,
            "index": 1
        },
        {
            "key": "speed",
            "en": "Speed",
            "ja": "点滅速度",
            "min": 0.1,
            "max": 10,
            "step": 0.1,
            "default": 2,
            "index": 2
        },
        {
            "key": "power",
            "en": "Brightness",
            "ja": "輝度",
            "min": 0.1,
            "max": 3,
            "step": 0.1,
            "default": 1,
            "index": 3
        },
        {
            "key": "scale",
            "en": "Distribution",
            "ja": "分布範囲",
            "min": 0.1,
            "max": 1,
            "step": 0.01,
            "default": 0.9,
            "index": 4
        }
    ],
    "SquareGrid": [
        {
            "key": "scale",
            "en": "Scale X / Cols",
            "ja": "スケールX / 列数",
            "min": 1,
            "max": 100,
            "step": 1,
            "default": 10,
            "index": 0
        },
        {
            "key": "lineWidth",
            "en": "Line Width / Border",
            "ja": "線の太さ / 枠幅",
            "min": 0.01,
            "max": 0.5,
            "step": 0.01,
            "default": 0.05,
            "index": 1
        },
        {
            "key": "softness",
            "en": "Softness",
            "ja": "ぼかし",
            "min": 0,
            "max": 1,
            "step": 0.01,
            "default": 0.1,
            "index": 2
        }
    ],
    "Dots": [
        {
            "key": "scale",
            "en": "Scale X / Cols",
            "ja": "スケールX / 列数",
            "min": 1,
            "max": 100,
            "step": 1,
            "default": 10,
            "index": 0
        },
        {
            "key": "softness",
            "en": "Softness",
            "ja": "ぼかし",
            "min": 0,
            "max": 1,
            "step": 0.01,
            "default": 0.1,
            "index": 1
        },
        {
            "key": "dotRadius",
            "en": "Dot Radius",
            "ja": "ドット半径",
            "min": 0.05,
            "max": 0.5,
            "step": 0.01,
            "default": 0.2,
            "index": 2
        }
    ],
    "CrossGrid": [
        {
            "key": "scale",
            "en": "Scale X / Cols",
            "ja": "スケールX / 列数",
            "min": 1,
            "max": 100,
            "step": 1,
            "default": 10,
            "index": 0
        },
        {
            "key": "lineWidth",
            "en": "Line Width / Border",
            "ja": "線の太さ / 枠幅",
            "min": 0.01,
            "max": 0.5,
            "step": 0.01,
            "default": 0.05,
            "index": 1
        },
        {
            "key": "softness",
            "en": "Softness",
            "ja": "ぼかし",
            "min": 0,
            "max": 1,
            "step": 0.01,
            "default": 0.1,
            "index": 2
        }
    ],
    "SquareGridDash": [
        {
            "key": "scale",
            "en": "Scale X / Cols",
            "ja": "スケールX / 列数",
            "min": 1,
            "max": 100,
            "step": 1,
            "default": 10,
            "index": 0
        },
        {
            "key": "lineWidth",
            "en": "Line Width / Border",
            "ja": "線の太さ / 枠幅",
            "min": 0.01,
            "max": 0.5,
            "step": 0.01,
            "default": 0.05,
            "index": 1
        },
        {
            "key": "softness",
            "en": "Softness",
            "ja": "ぼかし",
            "min": 0,
            "max": 1,
            "step": 0.01,
            "default": 0.1,
            "index": 2
        }
    ],
    "RandomTiles": [
        {
            "key": "scale",
            "en": "Scale X / Cols",
            "ja": "スケールX / 列数",
            "min": 1,
            "max": 100,
            "step": 1,
            "default": 10,
            "index": 0
        },
        {
            "key": "lineWidth",
            "en": "Line Width / Border",
            "ja": "線の太さ / 枠幅",
            "min": 0.01,
            "max": 0.5,
            "step": 0.01,
            "default": 0.05,
            "index": 1
        },
        {
            "key": "scaleY",
            "en": "Scale Y / Rows",
            "ja": "スケールY / 行数",
            "min": 1,
            "max": 100,
            "step": 1,
            "default": 10,
            "index": 2
        },
        {
            "key": "variation",
            "en": "Variation / Noise",
            "ja": "ランダム・ノイズ",
            "min": 0,
            "max": 1,
            "step": 0.05,
            "default": 0.3,
            "index": 3
        }
    ],
    "SquareGridPolka": [
        {
            "key": "scale",
            "en": "Scale X / Cols",
            "ja": "スケールX / 列数",
            "min": 1,
            "max": 100,
            "step": 1,
            "default": 10,
            "index": 0
        },
        {
            "key": "softness",
            "en": "Softness",
            "ja": "ぼかし",
            "min": 0,
            "max": 1,
            "step": 0.01,
            "default": 0.1,
            "index": 1
        },
        {
            "key": "dotRadius",
            "en": "Dot Radius",
            "ja": "ドット半径",
            "min": 0.05,
            "max": 0.5,
            "step": 0.01,
            "default": 0.2,
            "index": 2
        }
    ],
    "DotMatrix": [
        {
            "key": "scale",
            "en": "Scale X / Cols",
            "ja": "スケールX / 列数",
            "min": 1,
            "max": 100,
            "step": 1,
            "default": 10,
            "index": 0
        },
        {
            "key": "dotRadius",
            "en": "Dot Radius",
            "ja": "ドット半径",
            "min": 0.05,
            "max": 0.5,
            "step": 0.01,
            "default": 0.2,
            "index": 1
        },
        {
            "key": "scaleY",
            "en": "Scale Y / Rows",
            "ja": "スケールY / 行数",
            "min": 1,
            "max": 100,
            "step": 1,
            "default": 10,
            "index": 2
        },
        {
            "key": "variation",
            "en": "Variation / Noise",
            "ja": "ランダム・ノイズ",
            "min": 0,
            "max": 1,
            "step": 0.05,
            "default": 0.3,
            "index": 3
        }
    ],
    "Zigzag": [
        {
            "key": "frequency",
            "en": "Frequency / Scale",
            "ja": "密度 / スケール",
            "min": 1,
            "max": 100,
            "step": 1,
            "default": 20,
            "index": 0
        },
        {
            "key": "angle",
            "en": "Angle (Deg)",
            "ja": "角度",
            "min": -180,
            "max": 180,
            "step": 1,
            "default": 0,
            "index": 1
        },
        {
            "key": "lineWidth",
            "en": "Line Width",
            "ja": "線の太さ",
            "min": 0.01,
            "max": 0.99,
            "step": 0.01,
            "default": 0.5,
            "index": 2
        },
        {
            "key": "softness",
            "en": "Softness",
            "ja": "ぼかし",
            "min": 0,
            "max": 1,
            "step": 0.01,
            "default": 0.05,
            "index": 3
        },
        {
            "key": "amplitude",
            "en": "Amplitude (Zigzag)",
            "ja": "振幅 (ジグザグ)",
            "min": 0,
            "max": 1,
            "step": 0.05,
            "default": 0.2,
            "index": 4
        }
    ],
    "Crosshatch": [
        {
            "key": "frequency",
            "en": "Frequency / Scale",
            "ja": "密度 / スケール",
            "min": 1,
            "max": 100,
            "step": 1,
            "default": 20,
            "index": 0
        },
        {
            "key": "angle",
            "en": "Angle 1 (Deg)",
            "ja": "角度 1",
            "min": -90,
            "max": 90,
            "step": 1,
            "default": 0,
            "index": 1
        },
        {
            "key": "lineWidth",
            "en": "Line Width",
            "ja": "線の太さ",
            "min": 0.01,
            "max": 0.99,
            "step": 0.01,
            "default": 0.5,
            "index": 2
        },
        {
            "key": "angle2",
            "en": "Angle 2 (Cross)",
            "ja": "角度 2 (クロス)",
            "min": -90,
            "max": 90,
            "step": 1,
            "default": -45,
            "index": 3
        }
    ],
    "TriGrid": [
        {
            "key": "scale",
            "en": "Scale",
            "ja": "スケール",
            "min": 1,
            "max": 50,
            "step": 1,
            "default": 10,
            "index": 0
        },
        {
            "key": "lineWidth",
            "en": "Line Width",
            "ja": "線の太さ",
            "min": 0.01,
            "max": 0.5,
            "step": 0.01,
            "default": 0.1,
            "index": 1
        }
    ],
    "RadialLines": [
        {
            "key": "rays",
            "en": "Ray Count",
            "ja": "線の数",
            "min": 2,
            "max": 100,
            "step": 1,
            "default": 36,
            "index": 0
        },
        {
            "key": "width",
            "en": "Width",
            "ja": "太さ",
            "min": 0.01,
            "max": 0.5,
            "step": 0.01,
            "default": 0.1,
            "index": 1
        },
        {
            "key": "softness",
            "en": "Softness",
            "ja": "ぼかし",
            "min": 0.01,
            "max": 1,
            "step": 0.01,
            "default": 0.1,
            "index": 2
        },
        {
            "key": "spin",
            "en": "Spin",
            "ja": "回転速度",
            "min": -5,
            "max": 5,
            "step": 0.1,
            "default": 0,
            "index": 3
        }
    ],
    "Swirl": [
        {
            "key": "arms",
            "en": "Arms",
            "ja": "アーム数",
            "min": 1,
            "max": 20,
            "step": 1,
            "default": 3,
            "index": 0
        },
        {
            "key": "twist",
            "en": "Twist",
            "ja": "ひねり",
            "min": -20,
            "max": 20,
            "step": 0.5,
            "default": 5,
            "index": 1
        },
        {
            "key": "center",
            "en": "Center Focus",
            "ja": "中心の強さ",
            "min": 0.1,
            "max": 5,
            "step": 0.1,
            "default": 1,
            "index": 2
        }
    ],
    "PixelNoise": [
        {
            "key": "scale",
            "en": "Scale",
            "ja": "解像度",
            "min": 1,
            "max": 256,
            "step": 1,
            "default": 32,
            "index": 0
        },
        {
            "key": "speed",
            "en": "Speed",
            "ja": "速度",
            "min": 0,
            "max": 10,
            "step": 0.1,
            "default": 1,
            "index": 1
        }
    ],
    "StripeNoise": [
        {
            "key": "scaleX",
            "en": "Scale X",
            "ja": "横スケール",
            "min": 0.1,
            "max": 100,
            "step": 0.1,
            "default": 10,
            "index": 0
        },
        {
            "key": "scaleY",
            "en": "Scale Y",
            "ja": "縦スケール",
            "min": 0.1,
            "max": 100,
            "step": 0.1,
            "default": 1,
            "index": 1
        },
        {
            "key": "angle",
            "en": "Angle",
            "ja": "角度",
            "min": -90,
            "max": 90,
            "step": 1,
            "default": 0,
            "index": 2
        },
        {
            "key": "contrast",
            "en": "Contrast",
            "ja": "コントラスト",
            "min": 0.5,
            "max": 5,
            "step": 0.1,
            "default": 1,
            "index": 3
        }
    ],
    "FlowLines": [
        {
            "key": "scale",
            "en": "Scale",
            "ja": "スケール",
            "min": 1,
            "max": 20,
            "step": 0.5,
            "default": 5,
            "index": 0
        },
        {
            "key": "density",
            "en": "Density",
            "ja": "線の密度",
            "min": 1,
            "max": 50,
            "step": 1,
            "default": 10,
            "index": 1
        },
        {
            "key": "speed",
            "en": "Speed",
            "ja": "速度",
            "min": 0,
            "max": 5,
            "step": 0.1,
            "default": 0.5,
            "index": 2
        }
    ],
    "SymmetricNoise": [
        {
            "key": "scale",
            "en": "Scale",
            "ja": "スケール",
            "min": 0.5,
            "max": 20,
            "step": 0.5,
            "default": 3,
            "index": 0
        },
        {
            "key": "axes",
            "en": "Axes",
            "ja": "対称軸の数",
            "min": 1,
            "max": 8,
            "step": 1,
            "default": 4,
            "index": 1
        },
        {
            "key": "speed",
            "en": "Speed",
            "ja": "速度",
            "min": 0,
            "max": 5,
            "step": 0.1,
            "default": 1,
            "index": 2
        }
    ],
    "BevelSquare": [
        {
            "key": "size",
            "en": "Size",
            "ja": "サイズ",
            "min": 0.1,
            "max": 2,
            "step": 0.01,
            "default": 0.7,
            "index": 0
        },
        {
            "key": "bevel",
            "en": "Bevel Depth",
            "ja": "ベベル深さ",
            "min": 0,
            "max": 1,
            "step": 0.01,
            "default": 0.2,
            "index": 1
        },
        {
            "key": "lightDir",
            "en": "Light Dir",
            "ja": "光源角度",
            "min": 0,
            "max": 360,
            "step": 1,
            "default": 135,
            "index": 2
        }
    ],
    "PyramidPattern": [
        {
            "key": "scale",
            "en": "Scale",
            "ja": "スケール",
            "min": 1,
            "max": 50,
            "step": 1,
            "default": 5,
            "index": 0
        },
        {
            "key": "depth",
            "en": "Depth",
            "ja": "深さ",
            "min": 0,
            "max": 1,
            "step": 0.01,
            "default": 1,
            "index": 1
        }
    ],
    "CellularEdge": [
        {
            "key": "scale",
            "en": "Scale",
            "ja": "スケール",
            "min": 1,
            "max": 50,
            "step": 1,
            "default": 10,
            "index": 0
        },
        {
            "key": "jitter",
            "en": "Jitter",
            "ja": "歪み",
            "min": 0,
            "max": 1,
            "step": 0.05,
            "default": 1,
            "index": 1
        },
        {
            "key": "thickness",
            "en": "Thickness",
            "ja": "線の太さ",
            "min": 0.01,
            "max": 0.5,
            "step": 0.01,
            "default": 0.05,
            "index": 2
        }
    ],
    "Weave": [
        {
            "key": "scale",
            "en": "Scale",
            "ja": "スケール",
            "min": 1,
            "max": 50,
            "step": 1,
            "default": 8,
            "index": 0
        },
        {
            "key": "width",
            "en": "Band Width",
            "ja": "帯の幅",
            "min": 0.1,
            "max": 0.9,
            "step": 0.05,
            "default": 0.6,
            "index": 1
        },
        {
            "key": "shadow",
            "en": "Shadow",
            "ja": "立体感",
            "min": 0,
            "max": 1,
            "step": 0.05,
            "default": 0.5,
            "index": 2
        }
    ],
    "SpiralV2": [
        {
            "key": "arms",
            "en": "Arms",
            "ja": "アーム数",
            "min": 1,
            "max": 20,
            "step": 1,
            "default": 2,
            "index": 0
        },
        {
            "key": "power",
            "en": "Power",
            "ja": "曲がり具合",
            "min": 0.1,
            "max": 5,
            "step": 0.1,
            "default": 1,
            "index": 1
        },
        {
            "key": "speed",
            "en": "Speed",
            "ja": "速度",
            "min": -5,
            "max": 5,
            "step": 0.1,
            "default": 1,
            "index": 2
        }
    ],
    "Scanline": [
        {
            "key": "count",
            "en": "Count",
            "ja": "ライン数",
            "min": 10,
            "max": 500,
            "step": 1,
            "default": 100,
            "index": 0
        },
        {
            "key": "speed",
            "en": "Speed",
            "ja": "流れる速度",
            "min": -10,
            "max": 10,
            "step": 0.1,
            "default": 1,
            "index": 1
        },
        {
            "key": "brightness",
            "en": "Brightness",
            "ja": "明るさ",
            "min": 0,
            "max": 2,
            "step": 0.1,
            "default": 1,
            "index": 2
        }
    ],
    "Kaleido": [
        {
            "key": "sides",
            "en": "Sides",
            "ja": "分割数",
            "min": 3,
            "max": 20,
            "step": 1,
            "default": 6,
            "index": 0
        },
        {
            "key": "scale",
            "en": "Scale",
            "ja": "スケール",
            "min": 0.5,
            "max": 5,
            "step": 0.1,
            "default": 1,
            "index": 1
        },
        {
            "key": "speed",
            "en": "Speed",
            "ja": "速度",
            "min": 0,
            "max": 2,
            "step": 0.1,
            "default": 0.5,
            "index": 2
        }
    ],
    "FractalCamo": [
        {
            "key": "scale",
            "en": "Scale",
            "ja": "スケール",
            "min": 0.5,
            "max": 20,
            "step": 0.5,
            "default": 3,
            "index": 0
        },
        {
            "key": "levels",
            "en": "Levels",
            "ja": "階調数",
            "min": 2,
            "max": 8,
            "step": 1,
            "default": 4,
            "index": 1
        },
        {
            "key": "smoothness",
            "en": "Smoothness",
            "ja": "滑らかさ",
            "min": 0,
            "max": 0.5,
            "step": 0.01,
            "default": 0.1,
            "index": 2
        }
    ],
    "SweepGradient": [
        {
            "key": "turns",
            "en": "Turns",
            "ja": "回転数",
            "min": 1,
            "max": 10,
            "step": 1,
            "default": 1,
            "index": 0
        },
        {
            "key": "offset",
            "en": "Angle Offset",
            "ja": "角度オフセット",
            "min": 0,
            "max": 360,
            "step": 1,
            "default": 0,
            "index": 1
        }
    ],
    "Bricks": [
        {
            "key": "cols",
            "en": "Columns",
            "ja": "列数",
            "min": 1,
            "max": 50,
            "step": 1,
            "default": 5,
            "index": 0
        },
        {
            "key": "rows",
            "en": "Rows",
            "ja": "行数",
            "min": 1,
            "max": 50,
            "step": 1,
            "default": 10,
            "index": 1
        },
        {
            "key": "mortar",
            "en": "Mortar Size",
            "ja": "目地の太さ",
            "min": 0,
            "max": 0.2,
            "step": 0.01,
            "default": 0.05,
            "index": 2
        },
        {
            "key": "shift",
            "en": "Shift",
            "ja": "ずれ",
            "min": 0,
            "max": 1,
            "step": 0.05,
            "default": 0.5,
            "index": 3
        }
    ],
    "PlasmaV2": [
        {
            "key": "scale",
            "en": "Scale",
            "ja": "スケール",
            "min": 0.5,
            "max": 20,
            "step": 0.5,
            "default": 5,
            "index": 0
        },
        {
            "key": "speed",
            "en": "Speed",
            "ja": "速度",
            "min": 0,
            "max": 5,
            "step": 0.1,
            "default": 1,
            "index": 1
        },
        {
            "key": "complexity",
            "en": "Complexity",
            "ja": "複雑さ",
            "min": 1,
            "max": 5,
            "step": 1,
            "default": 3,
            "index": 2
        }
    ],
    "GrungeV2": [
        {
            "key": "scale",
            "en": "Scale",
            "ja": "スケール",
            "min": 1,
            "max": 50,
            "step": 1,
            "default": 15,
            "index": 0
        },
        {
            "key": "scratches",
            "en": "Scratches",
            "ja": "傷の量",
            "min": 0,
            "max": 1,
            "step": 0.05,
            "default": 0.5,
            "index": 1
        },
        {
            "key": "spots",
            "en": "Spots",
            "ja": "シミの量",
            "min": 0,
            "max": 1,
            "step": 0.05,
            "default": 0.3,
            "index": 2
        }
    ],
    "Pulse": [
        {
            "key": "frequency",
            "en": "Frequency",
            "ja": "波及頻度",
            "min": 0.5,
            "max": 5,
            "step": 0.1,
            "default": 1,
            "index": 0
        },
        {
            "key": "width",
            "en": "Width",
            "ja": "リングの太さ",
            "min": 0.01,
            "max": 0.5,
            "step": 0.01,
            "default": 0.1,
            "index": 1
        },
        {
            "key": "count",
            "en": "Count",
            "ja": "同時リング数",
            "min": 1,
            "max": 10,
            "step": 1,
            "default": 3,
            "index": 2
        }
    ],
    "Burst": [
        {
            "key": "rays",
            "en": "Rays",
            "ja": "光線数",
            "min": 5,
            "max": 200,
            "step": 1,
            "default": 50,
            "index": 0
        },
        {
            "key": "noiseSq",
            "en": "Noise Freq",
            "ja": "ノイズ周波数",
            "min": 0,
            "max": 20,
            "step": 0.5,
            "default": 5,
            "index": 1
        },
        {
            "key": "power",
            "en": "Power",
            "ja": "鋭さ",
            "min": 0.1,
            "max": 10,
            "step": 0.1,
            "default": 2,
            "index": 2
        }
    ],
    "Twirl": [
        {
            "key": "strength",
            "en": "Strength",
            "ja": "ひねりの強さ",
            "min": -20,
            "max": 20,
            "step": 0.5,
            "default": 5,
            "index": 0
        },
        {
            "key": "radius",
            "en": "Radius",
            "ja": "影響半径",
            "min": 0.1,
            "max": 2,
            "step": 0.05,
            "default": 0.5,
            "index": 1
        },
        {
            "key": "baseScale",
            "en": "Base Scale",
            "ja": "背景の柄サイズ",
            "min": 1,
            "max": 20,
            "step": 1,
            "default": 5,
            "index": 2
        }
    ],
    "Halftone": [
        {
            "key": "scale",
            "en": "Scale",
            "ja": "スケール",
            "min": 5,
            "max": 200,
            "step": 1,
            "default": 50,
            "index": 0
        },
        {
            "key": "angle",
            "en": "Angle",
            "ja": "角度",
            "min": -45,
            "max": 45,
            "step": 1,
            "default": 15,
            "index": 1
        },
        {
            "key": "contrast",
            "en": "Contrast",
            "ja": "コントラスト",
            "min": 0.5,
            "max": 5,
            "step": 0.1,
            "default": 2,
            "index": 2
        }
    ],
    "Mosaic": [
        {
            "key": "blocksX",
            "en": "Blocks X",
            "ja": "横ブロック数",
            "min": 2,
            "max": 100,
            "step": 1,
            "default": 16,
            "index": 0
        },
        {
            "key": "blocksY",
            "en": "Blocks Y",
            "ja": "縦ブロック数",
            "min": 2,
            "max": 100,
            "step": 1,
            "default": 16,
            "index": 1
        },
        {
            "key": "scale",
            "en": "Noise Scale",
            "ja": "柄のサイズ",
            "min": 0.5,
            "max": 10,
            "step": 0.1,
            "default": 2,
            "index": 2
        }
    ],
    "VoronoiFluid": [
        {
            "key": "scale",
            "en": "Scale",
            "ja": "スケール",
            "min": 1,
            "max": 20,
            "step": 0.5,
            "default": 5,
            "index": 0
        },
        {
            "key": "speed",
            "en": "Speed",
            "ja": "速度",
            "min": 0,
            "max": 5,
            "step": 0.1,
            "default": 1,
            "index": 1
        },
        {
            "key": "smoothness",
            "en": "Smoothness",
            "ja": "滑らかさ",
            "min": 0.01,
            "max": 0.5,
            "step": 0.01,
            "default": 0.1,
            "index": 2
        }
    ],
    "Grain": [
        {
            "key": "strength",
            "en": "Strength",
            "ja": "強さ",
            "min": 0,
            "max": 1,
            "step": 0.01,
            "default": 0.5,
            "index": 0
        },
        {
            "key": "speed",
            "en": "Speed",
            "ja": "速度",
            "min": 0,
            "max": 30,
            "step": 1,
            "default": 10,
            "index": 1
        }
    ],
    "DistortionWave": [
        {
            "key": "frequency",
            "en": "Frequency",
            "ja": "波の数",
            "min": 1,
            "max": 30,
            "step": 0.5,
            "default": 10,
            "index": 0
        },
        {
            "key": "amplitude",
            "en": "Amplitude",
            "ja": "歪みの強さ",
            "min": 0,
            "max": 0.5,
            "step": 0.01,
            "default": 0.05,
            "index": 1
        },
        {
            "key": "baseScale",
            "en": "Base Scale",
            "ja": "柄のサイズ",
            "min": 1,
            "max": 20,
            "step": 1,
            "default": 5,
            "index": 2
        }
    ],
    "PolarDots": [
        {
            "key": "rings",
            "en": "Rings",
            "ja": "リング数",
            "min": 1,
            "max": 30,
            "step": 1,
            "default": 5,
            "index": 0
        },
        {
            "key": "dots",
            "en": "Dots/Ring",
            "ja": "ドット密度",
            "min": 2,
            "max": 60,
            "step": 1,
            "default": 12,
            "index": 1
        },
        {
            "key": "radius",
            "en": "Radius",
            "ja": "ドットの大きさ",
            "min": 0.1,
            "max": 1,
            "step": 0.05,
            "default": 0.4,
            "index": 2
        }
    ],
    "Crystal": [
        {
            "key": "scale",
            "en": "Scale",
            "ja": "スケール",
            "min": 1,
            "max": 20,
            "step": 0.5,
            "default": 5,
            "index": 0
        },
        {
            "key": "jagged",
            "en": "Jaggedness",
            "ja": "鋭さ",
            "min": 0,
            "max": 1,
            "step": 0.05,
            "default": 0.5,
            "index": 1
        },
        {
            "key": "layers",
            "en": "Layers",
            "ja": "重なり",
            "min": 1,
            "max": 5,
            "step": 1,
            "default": 3,
            "index": 2
        }
    ],
    "AbsNoise": [
        {
            "key": "scale",
            "en": "Scale",
            "ja": "スケール",
            "min": 0.5,
            "max": 20,
            "step": 0.5,
            "default": 3,
            "index": 0
        },
        {
            "key": "power",
            "en": "Power",
            "ja": "コントラスト",
            "min": 0.1,
            "max": 5,
            "step": 0.1,
            "default": 1,
            "index": 1
        },
        {
            "key": "octaves",
            "en": "Octaves",
            "ja": "細部",
            "min": 1,
            "max": 8,
            "step": 1,
            "default": 4,
            "index": 2
        }
    ],
    "EnergyRing": [
        {
            "key": "radius",
            "en": "Radius",
            "ja": "半径",
            "min": 0.1,
            "max": 1,
            "step": 0.01,
            "default": 0.4,
            "index": 0
        },
        {
            "key": "thickness",
            "en": "Thickness",
            "ja": "リングの太さ",
            "min": 0.01,
            "max": 0.5,
            "step": 0.01,
            "default": 0.05,
            "index": 1
        },
        {
            "key": "noiseScale",
            "en": "Noise Scale",
            "ja": "歪みの細かさ",
            "min": 0,
            "max": 20,
            "step": 0.5,
            "default": 5,
            "index": 2
        },
        {
            "key": "power",
            "en": "Power",
            "ja": "発光力",
            "min": 0.1,
            "max": 5,
            "step": 0.1,
            "default": 1,
            "index": 3
        }
    ],
    "SparkBurst": [
        {
            "key": "count",
            "en": "Count",
            "ja": "火花の数",
            "min": 5,
            "max": 100,
            "step": 1,
            "default": 30,
            "index": 0
        },
        {
            "key": "speed",
            "en": "Speed",
            "ja": "速度",
            "min": 0.1,
            "max": 5,
            "step": 0.1,
            "default": 1,
            "index": 1
        },
        {
            "key": "len",
            "en": "Length",
            "ja": "火花の長さ",
            "min": 0.01,
            "max": 0.5,
            "step": 0.01,
            "default": 0.1,
            "index": 2
        },
        {
            "key": "width",
            "en": "Width",
            "ja": "火花の太さ",
            "min": 0.001,
            "max": 0.05,
            "step": 0.001,
            "default": 0.01,
            "index": 3
        }
    ],
    "Wormhole": [
        {
            "key": "scale",
            "en": "Scale",
            "ja": "スケール",
            "min": 1,
            "max": 20,
            "step": 0.5,
            "default": 5,
            "index": 0
        },
        {
            "key": "speed",
            "en": "Speed",
            "ja": "吸い込み速度",
            "min": 0,
            "max": 5,
            "step": 0.1,
            "default": 1,
            "index": 1
        },
        {
            "key": "voidSize",
            "en": "Void Size",
            "ja": "中心の穴サイズ",
            "min": 0,
            "max": 0.8,
            "step": 0.01,
            "default": 0.1,
            "index": 2
        },
        {
            "key": "contrast",
            "en": "Contrast",
            "ja": "コントラスト",
            "min": 0.5,
            "max": 5,
            "step": 0.1,
            "default": 2,
            "index": 3
        }
    ],
    "StarFlare": [
        {
            "key": "intensity",
            "en": "Intensity",
            "ja": "明るさ",
            "min": 0,
            "max": 2,
            "step": 0.01,
            "default": 1,
            "index": 0
        },
        {
            "key": "spikeWidth",
            "en": "Spike Width",
            "ja": "光の筋の太さ",
            "min": 0.001,
            "max": 0.1,
            "step": 0.001,
            "default": 0.01,
            "index": 1
        },
        {
            "key": "spikeLen",
            "en": "Spike Length",
            "ja": "光の筋の長さ",
            "min": 0.1,
            "max": 2,
            "step": 0.01,
            "default": 0.5,
            "index": 2
        },
        {
            "key": "haloSize",
            "en": "Halo Size",
            "ja": "ハロの広がり",
            "min": 0,
            "max": 1,
            "step": 0.01,
            "default": 0.2,
            "index": 3
        }
    ],
    "ImpactLines": [
        {
            "key": "density",
            "en": "Density",
            "ja": "線の密度",
            "min": 10,
            "max": 200,
            "step": 1,
            "default": 50,
            "index": 0
        },
        {
            "key": "len",
            "en": "Length Variation",
            "ja": "長さのばらつき",
            "min": 0,
            "max": 1,
            "step": 0.05,
            "default": 0.5,
            "index": 1
        },
        {
            "key": "sharpness",
            "en": "Sharpness",
            "ja": "線の細さ",
            "min": 0.1,
            "max": 5,
            "step": 0.1,
            "default": 1,
            "index": 2
        },
        {
            "key": "centerClear",
            "en": "Center Clear",
            "ja": "中心の余白",
            "min": 0,
            "max": 1,
            "step": 0.01,
            "default": 0.2,
            "index": 3
        }
    ],
    "AuraRing": [
        {
            "key": "radius",
            "en": "Radius",
            "ja": "半径",
            "min": 0.1,
            "max": 1,
            "step": 0.01,
            "default": 0.4,
            "index": 0
        },
        {
            "key": "thickness",
            "en": "Thickness",
            "ja": "リングの太さ",
            "min": 0.01,
            "max": 0.5,
            "step": 0.01,
            "default": 0.05,
            "index": 1
        },
        {
            "key": "flameScale",
            "en": "Flame Scale",
            "ja": "炎のサイズ",
            "min": 1,
            "max": 20,
            "step": 0.5,
            "default": 5,
            "index": 2
        },
        {
            "key": "rayIntensity",
            "en": "Ray Intensity",
            "ja": "後光の強さ",
            "min": 0,
            "max": 5,
            "step": 0.1,
            "default": 1,
            "index": 3
        }
    ],
    "Crescent": [
        {
            "key": "radius",
            "en": "Radius",
            "ja": "半径",
            "min": 0.1,
            "max": 1,
            "step": 0.01,
            "default": 0.4,
            "index": 0
        },
        {
            "key": "innerRadius",
            "en": "Inner Radius",
            "ja": "内円の半径",
            "min": 0.1,
            "max": 1,
            "step": 0.01,
            "default": 0.35,
            "index": 1
        },
        {
            "key": "angle",
            "en": "Angle",
            "ja": "欠ける角度",
            "min": 0,
            "max": 360,
            "step": 1,
            "default": 45,
            "index": 2
        },
        {
            "key": "softness",
            "en": "Softness",
            "ja": "ぼかし",
            "min": 0,
            "max": 0.2,
            "step": 0.001,
            "default": 0.01,
            "index": 3
        },
        {
            "key": "glowPower",
            "en": "Glow Power",
            "ja": "グロー強度",
            "min": 0,
            "max": 10,
            "step": 0.1,
            "default": 0,
            "index": 4
        },
        {
            "key": "ringWidth",
            "en": "Ring Width",
            "ja": "リング幅",
            "min": 0,
            "max": 0.1,
            "step": 0.001,
            "default": 0,
            "index": 5
        }
    ],
    "Glare": [
        {
            "key": "rays",
            "en": "Rays",
            "ja": "光の筋の数",
            "min": 2,
            "max": 16,
            "step": 1,
            "default": 4,
            "index": 0
        },
        {
            "key": "width",
            "en": "Width",
            "ja": "筋の太さ",
            "min": 0.001,
            "max": 0.05,
            "step": 0.001,
            "default": 0.005,
            "index": 1
        },
        {
            "key": "len",
            "en": "Length",
            "ja": "筋の長さ",
            "min": 0.1,
            "max": 2,
            "step": 0.05,
            "default": 1,
            "index": 2
        },
        {
            "key": "coreInt",
            "en": "Core Intensity",
            "ja": "中心の強さ",
            "min": 0.1,
            "max": 5,
            "step": 0.1,
            "default": 1.5,
            "index": 3
        }
    ],
    "LaserBeam": [
        {
            "key": "density",
            "en": "Density",
            "ja": "線の密度",
            "min": 5,
            "max": 100,
            "step": 1,
            "default": 20,
            "index": 0
        },
        {
            "key": "speed",
            "en": "Speed",
            "ja": "速度",
            "min": 0,
            "max": 10,
            "step": 0.1,
            "default": 2,
            "index": 1
        },
        {
            "key": "heightVar",
            "en": "Height Var",
            "ja": "太さのばらつき",
            "min": 0,
            "max": 2,
            "step": 0.05,
            "default": 1,
            "index": 2
        },
        {
            "key": "glow",
            "en": "Glow",
            "ja": "発光",
            "min": 0,
            "max": 5,
            "step": 0.1,
            "default": 1,
            "index": 3
        }
    ],
    "GlitchBlock": [
        {
            "key": "scaleX",
            "en": "Scale X",
            "ja": "横スケール",
            "min": 1,
            "max": 50,
            "step": 1,
            "default": 10,
            "index": 0
        },
        {
            "key": "scaleY",
            "en": "Scale Y",
            "ja": "縦スケール",
            "min": 1,
            "max": 50,
            "step": 1,
            "default": 25,
            "index": 1
        },
        {
            "key": "speed",
            "en": "Speed",
            "ja": "点滅速度",
            "min": 0,
            "max": 5,
            "step": 0.1,
            "default": 1,
            "index": 2
        },
        {
            "key": "density",
            "en": "Density",
            "ja": "ブロック密度",
            "min": 0,
            "max": 1,
            "step": 0.01,
            "default": 0.2,
            "index": 3
        }
    ],
    "AnalogGlitch": [
        {
            "key": "lines",
            "en": "Line Count",
            "ja": "走査線数",
            "min": 10,
            "max": 100,
            "step": 1,
            "default": 50,
            "index": 0
        },
        {
            "key": "speed",
            "en": "Speed",
            "ja": "スピード",
            "min": 0,
            "max": 5,
            "step": 0.1,
            "default": 1.5,
            "index": 1
        },
        {
            "key": "gWidth",
            "en": "Glitch Width",
            "ja": "ノイズ幅",
            "min": 0,
            "max": 1,
            "step": 0.01,
            "default": 0.3,
            "index": 2
        },
        {
            "key": "sharpness",
            "en": "Sharpness",
            "ja": "シャープネス",
            "min": 0.1,
            "max": 5,
            "step": 0.1,
            "default": 2,
            "index": 3
        }
    ],
    "CosmicPortal": [
        {
            "key": "zoom",
            "en": "Zoom",
            "ja": "ズーム",
            "min": 1,
            "max": 10,
            "step": 0.1,
            "default": 2,
            "index": 0
        },
        {
            "key": "twist",
            "en": "Twist",
            "ja": "渦の強さ",
            "min": 0,
            "max": 5,
            "step": 0.1,
            "default": 2.5,
            "index": 1
        },
        {
            "key": "speed",
            "en": "Evo Speed",
            "ja": "変化の速度",
            "min": 0,
            "max": 3,
            "step": 0.1,
            "default": 1,
            "index": 2
        },
        {
            "key": "detail",
            "en": "Detail",
            "ja": "ディテール",
            "min": 0.5,
            "max": 3,
            "step": 0.1,
            "default": 1.5,
            "index": 3
        }
    ],
    "CyberBlock": [
        {
            "key": "grid",
            "en": "Grid Size",
            "ja": "グリッド分割",
            "min": 5,
            "max": 100,
            "step": 1,
            "default": 30,
            "index": 0
        },
        {
            "key": "speed",
            "en": "Flash Speed",
            "ja": "点滅スピード",
            "min": 0,
            "max": 5,
            "step": 0.1,
            "default": 2,
            "index": 1
        },
        {
            "key": "density",
            "en": "Block Density",
            "ja": "ブロック出現率",
            "min": 0,
            "max": 1,
            "step": 0.01,
            "default": 0.4,
            "index": 2
        },
        {
            "key": "blur",
            "en": "Blur",
            "ja": "ぼかし",
            "min": 0,
            "max": 0.5,
            "step": 0.01,
            "default": 0.05,
            "index": 3
        }
    ],
    "ToxicCloud": [
        {
            "key": "scale",
            "en": "Scale",
            "ja": "スケール",
            "min": 1,
            "max": 10,
            "step": 0.1,
            "default": 3,
            "index": 0
        },
        {
            "key": "speed",
            "en": "Speed",
            "ja": "湧き上げ速度",
            "min": 0,
            "max": 3,
            "step": 0.1,
            "default": 1,
            "index": 1
        },
        {
            "key": "octaves",
            "en": "Octaves",
            "ja": "複雑度",
            "min": 1,
            "max": 8,
            "step": 1,
            "default": 4,
            "index": 2
        },
        {
            "key": "soft",
            "en": "Softness",
            "ja": "もやの濃さ",
            "min": 0.1,
            "max": 3,
            "step": 0.1,
            "default": 1,
            "index": 3
        }
    ],
    "GeoRelief": [
        {
            "key": "scale",
            "en": "Scale",
            "ja": "スケール",
            "min": 1,
            "max": 20,
            "step": 0.1,
            "default": 5,
            "index": 0
        },
        {
            "key": "elev",
            "en": "Elevation",
            "ja": "標高・強度",
            "min": 0.5,
            "max": 3,
            "step": 0.1,
            "default": 1,
            "index": 1
        },
        {
            "key": "detail",
            "en": "Detail",
            "ja": "細部ディテール",
            "min": 1,
            "max": 5,
            "step": 0.1,
            "default": 2.5,
            "index": 2
        },
        {
            "key": "sharp",
            "en": "Ridge Sharp",
            "ja": "エッジの強調",
            "min": 0.1,
            "max": 2,
            "step": 0.1,
            "default": 0.8,
            "index": 3
        }
    ]
};

/** Default u_params[16] for a type (source `Y`). */
export function defaultParams(type: string): number[] {
    const out = new Array<number>(PARAM_SLOTS).fill(0);
    const list = PARAM_SPECS[type];
    if (list) for (const p of list) out[p.index] = p.default;
    return out;
}
