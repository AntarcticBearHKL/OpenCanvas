// AUTO-GENERATED from texture-create (gameanimation.info) builtin samples. Do not edit by hand.
import type { EditorState } from "./types";

export interface TextureSample {
    id: string;
    name: string;
    description: string;
    state: EditorState;
}

export const BUILTIN_SAMPLES: TextureSample[] = [
    {
        "id": "magic-energy-ring",
        "name": "Magic Energy Ring",
        "description": "Layered energy rings with glow and starburst",
        "state": {
            "resolution": 512,
            "time": 0.72,
            "animSpeed": 0.65,
            "animate": false,
            "checkerboard": true,
            "blackBackground": false,
            "gifFps": 30,
            "gifDuration": 2,
            "gifSeamless": true,
            "postEffects": {
                "blurEnabled": false,
                "blurStrength": 1,
                "sharpenEnabled": false,
                "sharpenStrength": 1,
                "pixelationEnabled": false,
                "pixelSize": 10,
                "chromaticAberrationEnabled": false,
                "chromaticAberration": 0.01,
                "vignetteEnabled": true,
                "vignetteStrength": 0.25,
                "vignetteSize": 0.72,
                "vignetteColor": [
                    0,
                    0,
                    0
                ],
                "scanlineEnabled": false,
                "scanlineDensity": 100,
                "scanlineSpeed": 1,
                "scanlineStrength": 0.5,
                "scanlineColor": [
                    0,
                    0,
                    0
                ],
                "kaleidoscopeEnabled": false,
                "kaleidoSegments": 6,
                "kaleidoRotation": 0,
                "mirrorTileEnabled": false,
                "mirrorTileX": true,
                "mirrorTileY": true,
                "swirlEnabled": false,
                "swirlStrength": 3,
                "swirlRadius": 0.5,
                "edgeDetectionEnabled": false,
                "edgeThickness": 1,
                "edgeColor": [
                    0,
                    1,
                    0
                ],
                "toonEnabled": false,
                "toonDark": 4,
                "toonLight": 4,
                "vignetteMaskEnabled": false,
                "bloomEnabled": true,
                "bloomStrength": 1.35,
                "colorEnabled": false,
                "colorShadow": [
                    0,
                    0,
                    0
                ],
                "colorMidtone": [
                    0.5,
                    0.5,
                    0.5
                ],
                "colorHighlight": [
                    1,
                    1,
                    1
                ]
            },
            "activeLayerId": 5,
            "layerCounter": 5,
            "layers": [
                {
                    "id": 1,
                    "name": "EnergyRing",
                    "type": "EnergyRing",
                    "blendMode": "normal",
                    "opacity": 1,
                    "polarConversion": false,
                    "invertEnable": false,
                    "visible": true,
                    "typeParams": [
                        0.46,
                        0.055,
                        13,
                        2.2,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0
                    ],
                    "offsetX": 0,
                    "offsetY": 0,
                    "scaleX": 1.12,
                    "scaleY": 1.12,
                    "rotation": 0,
                    "scrollX": 0,
                    "scrollY": 0,
                    "gradEnable": true,
                    "gradStops": [
                        {
                            "position": 0,
                            "color": "#050016"
                        },
                        {
                            "position": 0.22,
                            "color": "#2a0f73"
                        },
                        {
                            "position": 0.52,
                            "color": "#7137ff"
                        },
                        {
                            "position": 0.78,
                            "color": "#35d9ff"
                        },
                        {
                            "position": 1,
                            "color": "#ffffff"
                        }
                    ],
                    "solidColorEnabled": false,
                    "solidColor": [
                        1,
                        1,
                        1
                    ]
                },
                {
                    "id": 2,
                    "name": "AuraRing",
                    "type": "AuraRing",
                    "blendMode": "screen",
                    "opacity": 0.72,
                    "polarConversion": false,
                    "invertEnable": false,
                    "visible": true,
                    "typeParams": [
                        0.51,
                        0.045,
                        13.5,
                        2.6,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0
                    ],
                    "offsetX": 0,
                    "offsetY": 0,
                    "scaleX": 1,
                    "scaleY": 1,
                    "rotation": 0.18,
                    "scrollX": 0,
                    "scrollY": 0,
                    "gradEnable": true,
                    "gradStops": [
                        {
                            "position": 0,
                            "color": "#050016"
                        },
                        {
                            "position": 0.22,
                            "color": "#2a0f73"
                        },
                        {
                            "position": 0.52,
                            "color": "#7137ff"
                        },
                        {
                            "position": 0.78,
                            "color": "#35d9ff"
                        },
                        {
                            "position": 1,
                            "color": "#ffffff"
                        }
                    ],
                    "solidColorEnabled": false,
                    "solidColor": [
                        1,
                        1,
                        1
                    ]
                },
                {
                    "id": 3,
                    "name": "StarBurst",
                    "type": "StarBurst",
                    "blendMode": "add",
                    "opacity": 0.42,
                    "polarConversion": false,
                    "invertEnable": false,
                    "visible": true,
                    "typeParams": [
                        12,
                        0.92,
                        17,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0
                    ],
                    "offsetX": 0,
                    "offsetY": 0,
                    "scaleX": 0.92,
                    "scaleY": 0.92,
                    "rotation": 0.1,
                    "scrollX": 0,
                    "scrollY": 0,
                    "gradEnable": true,
                    "gradStops": [
                        {
                            "position": 0,
                            "color": "#050016"
                        },
                        {
                            "position": 0.22,
                            "color": "#2a0f73"
                        },
                        {
                            "position": 0.52,
                            "color": "#7137ff"
                        },
                        {
                            "position": 0.78,
                            "color": "#35d9ff"
                        },
                        {
                            "position": 1,
                            "color": "#ffffff"
                        }
                    ],
                    "solidColorEnabled": false,
                    "solidColor": [
                        1,
                        1,
                        1
                    ]
                },
                {
                    "id": 4,
                    "name": "SparkBurst",
                    "type": "SparkBurst",
                    "blendMode": "add",
                    "opacity": 0.5,
                    "polarConversion": false,
                    "invertEnable": false,
                    "visible": true,
                    "typeParams": [
                        58,
                        0.65,
                        0.13,
                        0.006,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0
                    ],
                    "offsetX": 0,
                    "offsetY": 0,
                    "scaleX": 0.92,
                    "scaleY": 0.92,
                    "rotation": 0,
                    "scrollX": 0,
                    "scrollY": 0,
                    "gradEnable": true,
                    "gradStops": [
                        {
                            "position": 0,
                            "color": "#050016"
                        },
                        {
                            "position": 0.22,
                            "color": "#2a0f73"
                        },
                        {
                            "position": 0.52,
                            "color": "#7137ff"
                        },
                        {
                            "position": 0.78,
                            "color": "#35d9ff"
                        },
                        {
                            "position": 1,
                            "color": "#ffffff"
                        }
                    ],
                    "solidColorEnabled": false,
                    "solidColor": [
                        1,
                        1,
                        1
                    ]
                },
                {
                    "id": 5,
                    "name": "Ring",
                    "type": "Ring",
                    "blendMode": "add",
                    "opacity": 0.82,
                    "polarConversion": false,
                    "invertEnable": false,
                    "visible": true,
                    "typeParams": [
                        0.48,
                        0.018,
                        0.035,
                        2.7,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0
                    ],
                    "offsetX": 0,
                    "offsetY": 0,
                    "scaleX": 1,
                    "scaleY": 1,
                    "rotation": 0,
                    "scrollX": 0,
                    "scrollY": 0,
                    "gradEnable": true,
                    "gradStops": [
                        {
                            "position": 0,
                            "color": "#050016"
                        },
                        {
                            "position": 0.22,
                            "color": "#2a0f73"
                        },
                        {
                            "position": 0.52,
                            "color": "#7137ff"
                        },
                        {
                            "position": 0.78,
                            "color": "#35d9ff"
                        },
                        {
                            "position": 1,
                            "color": "#ffffff"
                        }
                    ],
                    "solidColorEnabled": false,
                    "solidColor": [
                        1,
                        1,
                        1
                    ]
                }
            ]
        }
    },
    {
        "id": "fire-burst",
        "name": "Fire Burst",
        "description": "Blazing burst with flying sparks",
        "state": {
            "resolution": 512,
            "time": 0.43,
            "animSpeed": 0.8,
            "animate": false,
            "checkerboard": true,
            "blackBackground": false,
            "gifFps": 30,
            "gifDuration": 2,
            "gifSeamless": true,
            "postEffects": {
                "blurEnabled": false,
                "blurStrength": 1,
                "sharpenEnabled": true,
                "sharpenStrength": 0.35,
                "pixelationEnabled": false,
                "pixelSize": 10,
                "chromaticAberrationEnabled": false,
                "chromaticAberration": 0.01,
                "vignetteEnabled": true,
                "vignetteStrength": 0.48,
                "vignetteSize": 0.68,
                "vignetteColor": [
                    0,
                    0,
                    0
                ],
                "scanlineEnabled": false,
                "scanlineDensity": 100,
                "scanlineSpeed": 1,
                "scanlineStrength": 0.5,
                "scanlineColor": [
                    0,
                    0,
                    0
                ],
                "kaleidoscopeEnabled": false,
                "kaleidoSegments": 6,
                "kaleidoRotation": 0,
                "mirrorTileEnabled": false,
                "mirrorTileX": true,
                "mirrorTileY": true,
                "swirlEnabled": false,
                "swirlStrength": 3,
                "swirlRadius": 0.5,
                "edgeDetectionEnabled": false,
                "edgeThickness": 1,
                "edgeColor": [
                    0,
                    1,
                    0
                ],
                "toonEnabled": false,
                "toonDark": 4,
                "toonLight": 4,
                "vignetteMaskEnabled": false,
                "bloomEnabled": true,
                "bloomStrength": 1.15,
                "colorEnabled": false,
                "colorShadow": [
                    0,
                    0,
                    0
                ],
                "colorMidtone": [
                    0.5,
                    0.5,
                    0.5
                ],
                "colorHighlight": [
                    1,
                    1,
                    1
                ]
            },
            "activeLayerId": 5,
            "layerCounter": 5,
            "layers": [
                {
                    "id": 1,
                    "name": "Burst",
                    "type": "Burst",
                    "blendMode": "normal",
                    "opacity": 1,
                    "polarConversion": false,
                    "invertEnable": false,
                    "visible": true,
                    "typeParams": [
                        88,
                        7.5,
                        3.1,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0
                    ],
                    "offsetX": 0,
                    "offsetY": 0,
                    "scaleX": 1.06,
                    "scaleY": 1.06,
                    "rotation": 0,
                    "scrollX": 0,
                    "scrollY": 0,
                    "gradEnable": true,
                    "gradStops": [
                        {
                            "position": 0,
                            "color": "#140000"
                        },
                        {
                            "position": 0.22,
                            "color": "#7d0900"
                        },
                        {
                            "position": 0.5,
                            "color": "#ff3b00"
                        },
                        {
                            "position": 0.78,
                            "color": "#ffb000"
                        },
                        {
                            "position": 1,
                            "color": "#fff5b0"
                        }
                    ],
                    "solidColorEnabled": false,
                    "solidColor": [
                        1,
                        1,
                        1
                    ]
                },
                {
                    "id": 2,
                    "name": "RayBurst",
                    "type": "RayBurst",
                    "blendMode": "screen",
                    "opacity": 0.68,
                    "polarConversion": false,
                    "invertEnable": false,
                    "visible": true,
                    "typeParams": [
                        18,
                        6.5,
                        2.2,
                        8,
                        1.7,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0
                    ],
                    "offsetX": 0,
                    "offsetY": 0,
                    "scaleX": 0.96,
                    "scaleY": 0.96,
                    "rotation": 0,
                    "scrollX": 0,
                    "scrollY": 0,
                    "gradEnable": true,
                    "gradStops": [
                        {
                            "position": 0,
                            "color": "#140000"
                        },
                        {
                            "position": 0.22,
                            "color": "#7d0900"
                        },
                        {
                            "position": 0.5,
                            "color": "#ff3b00"
                        },
                        {
                            "position": 0.78,
                            "color": "#ffb000"
                        },
                        {
                            "position": 1,
                            "color": "#fff5b0"
                        }
                    ],
                    "solidColorEnabled": false,
                    "solidColor": [
                        1,
                        1,
                        1
                    ]
                },
                {
                    "id": 3,
                    "name": "StarFlare",
                    "type": "StarFlare",
                    "blendMode": "add",
                    "opacity": 0.78,
                    "polarConversion": false,
                    "invertEnable": false,
                    "visible": true,
                    "typeParams": [
                        0.9,
                        0.008,
                        0.72,
                        0.1,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0
                    ],
                    "offsetX": 0,
                    "offsetY": 0,
                    "scaleX": 0.65,
                    "scaleY": 0.65,
                    "rotation": 0,
                    "scrollX": 0,
                    "scrollY": 0,
                    "gradEnable": true,
                    "gradStops": [
                        {
                            "position": 0,
                            "color": "#140000"
                        },
                        {
                            "position": 0.22,
                            "color": "#7d0900"
                        },
                        {
                            "position": 0.5,
                            "color": "#ff3b00"
                        },
                        {
                            "position": 0.78,
                            "color": "#ffb000"
                        },
                        {
                            "position": 1,
                            "color": "#fff5b0"
                        }
                    ],
                    "solidColorEnabled": false,
                    "solidColor": [
                        1,
                        1,
                        1
                    ]
                },
                {
                    "id": 4,
                    "name": "SparkBurst",
                    "type": "SparkBurst",
                    "blendMode": "add",
                    "opacity": 0.72,
                    "polarConversion": false,
                    "invertEnable": false,
                    "visible": true,
                    "typeParams": [
                        66,
                        0.82,
                        0.2,
                        0.007,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0
                    ],
                    "offsetX": 0,
                    "offsetY": 0,
                    "scaleX": 1,
                    "scaleY": 1,
                    "rotation": 0,
                    "scrollX": 0,
                    "scrollY": 0,
                    "gradEnable": true,
                    "gradStops": [
                        {
                            "position": 0,
                            "color": "#140000"
                        },
                        {
                            "position": 0.22,
                            "color": "#7d0900"
                        },
                        {
                            "position": 0.5,
                            "color": "#ff3b00"
                        },
                        {
                            "position": 0.78,
                            "color": "#ffb000"
                        },
                        {
                            "position": 1,
                            "color": "#fff5b0"
                        }
                    ],
                    "solidColorEnabled": false,
                    "solidColor": [
                        1,
                        1,
                        1
                    ]
                },
                {
                    "id": 5,
                    "name": "Smoke",
                    "type": "Smoke",
                    "blendMode": "screen",
                    "opacity": 0.1,
                    "polarConversion": false,
                    "invertEnable": false,
                    "visible": true,
                    "typeParams": [
                        4.5,
                        1.6,
                        0.08,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0
                    ],
                    "offsetX": 0,
                    "offsetY": 0,
                    "scaleX": 1.25,
                    "scaleY": 1.25,
                    "rotation": 0,
                    "scrollX": 0,
                    "scrollY": 0,
                    "gradEnable": true,
                    "gradStops": [
                        {
                            "position": 0,
                            "color": "#140000"
                        },
                        {
                            "position": 0.22,
                            "color": "#7d0900"
                        },
                        {
                            "position": 0.5,
                            "color": "#ff3b00"
                        },
                        {
                            "position": 0.78,
                            "color": "#ffb000"
                        },
                        {
                            "position": 1,
                            "color": "#fff5b0"
                        }
                    ],
                    "solidColorEnabled": false,
                    "solidColor": [
                        1,
                        1,
                        1
                    ]
                }
            ]
        }
    },
    {
        "id": "water-vortex",
        "name": "Water Vortex",
        "description": "Flowing water vortex",
        "state": {
            "resolution": 512,
            "time": 0.58,
            "animSpeed": 0.55,
            "animate": false,
            "checkerboard": true,
            "blackBackground": false,
            "gifFps": 30,
            "gifDuration": 2,
            "gifSeamless": true,
            "postEffects": {
                "blurEnabled": false,
                "blurStrength": 1,
                "sharpenEnabled": false,
                "sharpenStrength": 1,
                "pixelationEnabled": false,
                "pixelSize": 10,
                "chromaticAberrationEnabled": false,
                "chromaticAberration": 0.01,
                "vignetteEnabled": true,
                "vignetteStrength": 0.5,
                "vignetteSize": 0.7,
                "vignetteColor": [
                    0,
                    0,
                    0
                ],
                "scanlineEnabled": false,
                "scanlineDensity": 100,
                "scanlineSpeed": 1,
                "scanlineStrength": 0.5,
                "scanlineColor": [
                    0,
                    0,
                    0
                ],
                "kaleidoscopeEnabled": false,
                "kaleidoSegments": 6,
                "kaleidoRotation": 0,
                "mirrorTileEnabled": false,
                "mirrorTileX": true,
                "mirrorTileY": true,
                "swirlEnabled": false,
                "swirlStrength": 3,
                "swirlRadius": 0.5,
                "edgeDetectionEnabled": false,
                "edgeThickness": 1,
                "edgeColor": [
                    0,
                    1,
                    0
                ],
                "toonEnabled": false,
                "toonDark": 4,
                "toonLight": 4,
                "vignetteMaskEnabled": false,
                "bloomEnabled": true,
                "bloomStrength": 0.55,
                "colorEnabled": false,
                "colorShadow": [
                    0,
                    0,
                    0
                ],
                "colorMidtone": [
                    0.5,
                    0.5,
                    0.5
                ],
                "colorHighlight": [
                    1,
                    1,
                    1
                ]
            },
            "activeLayerId": 5,
            "layerCounter": 5,
            "layers": [
                {
                    "id": 1,
                    "name": "Wormhole",
                    "type": "Wormhole",
                    "blendMode": "normal",
                    "opacity": 1,
                    "polarConversion": false,
                    "invertEnable": false,
                    "visible": true,
                    "typeParams": [
                        7.5,
                        0.65,
                        0.26,
                        2.8,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0
                    ],
                    "offsetX": 0,
                    "offsetY": 0,
                    "scaleX": 1.12,
                    "scaleY": 1.12,
                    "rotation": 0,
                    "scrollX": 0,
                    "scrollY": 0,
                    "gradEnable": true,
                    "gradStops": [
                        {
                            "position": 0,
                            "color": "#001328"
                        },
                        {
                            "position": 0.28,
                            "color": "#004f86"
                        },
                        {
                            "position": 0.55,
                            "color": "#00a6d9"
                        },
                        {
                            "position": 0.8,
                            "color": "#61efff"
                        },
                        {
                            "position": 1,
                            "color": "#b9fbff"
                        }
                    ],
                    "solidColorEnabled": false,
                    "solidColor": [
                        1,
                        1,
                        1
                    ]
                },
                {
                    "id": 2,
                    "name": "CosmicPortal",
                    "type": "CosmicPortal",
                    "blendMode": "screen",
                    "opacity": 0.26,
                    "polarConversion": false,
                    "invertEnable": false,
                    "visible": true,
                    "typeParams": [
                        2.8,
                        3.4,
                        0.55,
                        2.15,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0
                    ],
                    "offsetX": 0,
                    "offsetY": 0,
                    "scaleX": 1.04,
                    "scaleY": 1.04,
                    "rotation": 0,
                    "scrollX": 0,
                    "scrollY": 0,
                    "gradEnable": true,
                    "gradStops": [
                        {
                            "position": 0,
                            "color": "#001328"
                        },
                        {
                            "position": 0.28,
                            "color": "#004f86"
                        },
                        {
                            "position": 0.55,
                            "color": "#00a6d9"
                        },
                        {
                            "position": 0.8,
                            "color": "#61efff"
                        },
                        {
                            "position": 1,
                            "color": "#b9fbff"
                        }
                    ],
                    "solidColorEnabled": false,
                    "solidColor": [
                        1,
                        1,
                        1
                    ]
                },
                {
                    "id": 3,
                    "name": "Ripple",
                    "type": "Ripple",
                    "blendMode": "screen",
                    "opacity": 0.24,
                    "polarConversion": false,
                    "invertEnable": false,
                    "visible": true,
                    "typeParams": [
                        1.15,
                        34,
                        0.75,
                        0.5,
                        0.5,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0
                    ],
                    "offsetX": 0,
                    "offsetY": 0,
                    "scaleX": 1,
                    "scaleY": 1,
                    "rotation": 0,
                    "scrollX": 0,
                    "scrollY": 0,
                    "gradEnable": true,
                    "gradStops": [
                        {
                            "position": 0,
                            "color": "#001328"
                        },
                        {
                            "position": 0.28,
                            "color": "#004f86"
                        },
                        {
                            "position": 0.55,
                            "color": "#00a6d9"
                        },
                        {
                            "position": 0.8,
                            "color": "#61efff"
                        },
                        {
                            "position": 1,
                            "color": "#b9fbff"
                        }
                    ],
                    "solidColorEnabled": false,
                    "solidColor": [
                        1,
                        1,
                        1
                    ]
                },
                {
                    "id": 4,
                    "name": "Ring",
                    "type": "Ring",
                    "blendMode": "add",
                    "opacity": 0.68,
                    "polarConversion": false,
                    "invertEnable": false,
                    "visible": true,
                    "typeParams": [
                        0.52,
                        0.035,
                        0.06,
                        2.3,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0
                    ],
                    "offsetX": 0,
                    "offsetY": 0,
                    "scaleX": 1,
                    "scaleY": 1,
                    "rotation": 0,
                    "scrollX": 0,
                    "scrollY": 0,
                    "gradEnable": true,
                    "gradStops": [
                        {
                            "position": 0,
                            "color": "#001328"
                        },
                        {
                            "position": 0.28,
                            "color": "#004f86"
                        },
                        {
                            "position": 0.55,
                            "color": "#00a6d9"
                        },
                        {
                            "position": 0.8,
                            "color": "#61efff"
                        },
                        {
                            "position": 1,
                            "color": "#b9fbff"
                        }
                    ],
                    "solidColorEnabled": false,
                    "solidColor": [
                        1,
                        1,
                        1
                    ]
                },
                {
                    "id": 5,
                    "name": "AuraRing",
                    "type": "AuraRing",
                    "blendMode": "screen",
                    "opacity": 0.3,
                    "polarConversion": false,
                    "invertEnable": false,
                    "visible": true,
                    "typeParams": [
                        0.49,
                        0.035,
                        9,
                        0.45,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0
                    ],
                    "offsetX": 0,
                    "offsetY": 0,
                    "scaleX": 1,
                    "scaleY": 1,
                    "rotation": -0.12,
                    "scrollX": 0,
                    "scrollY": 0,
                    "gradEnable": true,
                    "gradStops": [
                        {
                            "position": 0,
                            "color": "#001328"
                        },
                        {
                            "position": 0.28,
                            "color": "#004f86"
                        },
                        {
                            "position": 0.55,
                            "color": "#00a6d9"
                        },
                        {
                            "position": 0.8,
                            "color": "#61efff"
                        },
                        {
                            "position": 1,
                            "color": "#b9fbff"
                        }
                    ],
                    "solidColorEnabled": false,
                    "solidColor": [
                        1,
                        1,
                        1
                    ]
                }
            ]
        }
    },
    {
        "id": "impact-shockwave",
        "name": "Impact Shockwave",
        "description": "Strong radial impact shockwave",
        "state": {
            "resolution": 512,
            "time": 0.21,
            "animSpeed": 0.9,
            "animate": false,
            "checkerboard": true,
            "blackBackground": false,
            "gifFps": 30,
            "gifDuration": 2,
            "gifSeamless": true,
            "postEffects": {
                "blurEnabled": false,
                "blurStrength": 1,
                "sharpenEnabled": true,
                "sharpenStrength": 0.5,
                "pixelationEnabled": false,
                "pixelSize": 10,
                "chromaticAberrationEnabled": false,
                "chromaticAberration": 0.01,
                "vignetteEnabled": true,
                "vignetteStrength": 0.42,
                "vignetteSize": 0.72,
                "vignetteColor": [
                    0,
                    0,
                    0
                ],
                "scanlineEnabled": false,
                "scanlineDensity": 100,
                "scanlineSpeed": 1,
                "scanlineStrength": 0.5,
                "scanlineColor": [
                    0,
                    0,
                    0
                ],
                "kaleidoscopeEnabled": false,
                "kaleidoSegments": 6,
                "kaleidoRotation": 0,
                "mirrorTileEnabled": false,
                "mirrorTileX": true,
                "mirrorTileY": true,
                "swirlEnabled": false,
                "swirlStrength": 3,
                "swirlRadius": 0.5,
                "edgeDetectionEnabled": false,
                "edgeThickness": 1,
                "edgeColor": [
                    0,
                    1,
                    0
                ],
                "toonEnabled": false,
                "toonDark": 4,
                "toonLight": 4,
                "vignetteMaskEnabled": false,
                "bloomEnabled": true,
                "bloomStrength": 1.2,
                "colorEnabled": false,
                "colorShadow": [
                    0,
                    0,
                    0
                ],
                "colorMidtone": [
                    0.5,
                    0.5,
                    0.5
                ],
                "colorHighlight": [
                    1,
                    1,
                    1
                ]
            },
            "activeLayerId": 5,
            "layerCounter": 5,
            "layers": [
                {
                    "id": 1,
                    "name": "Burst",
                    "type": "Burst",
                    "blendMode": "normal",
                    "opacity": 1,
                    "polarConversion": false,
                    "invertEnable": false,
                    "visible": true,
                    "typeParams": [
                        108,
                        8.5,
                        4,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0
                    ],
                    "offsetX": 0,
                    "offsetY": 0,
                    "scaleX": 1.08,
                    "scaleY": 1.08,
                    "rotation": 0,
                    "scrollX": 0,
                    "scrollY": 0,
                    "gradEnable": true,
                    "gradStops": [
                        {
                            "position": 0,
                            "color": "#170500"
                        },
                        {
                            "position": 0.25,
                            "color": "#7d2100"
                        },
                        {
                            "position": 0.58,
                            "color": "#ff7a00"
                        },
                        {
                            "position": 0.82,
                            "color": "#ffd54a"
                        },
                        {
                            "position": 1,
                            "color": "#ffffff"
                        }
                    ],
                    "solidColorEnabled": false,
                    "solidColor": [
                        1,
                        1,
                        1
                    ]
                },
                {
                    "id": 2,
                    "name": "RadialLines",
                    "type": "RadialLines",
                    "blendMode": "screen",
                    "opacity": 0.42,
                    "polarConversion": false,
                    "invertEnable": false,
                    "visible": true,
                    "typeParams": [
                        48,
                        0.04,
                        0.07,
                        0.18,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0
                    ],
                    "offsetX": 0,
                    "offsetY": 0,
                    "scaleX": 0.94,
                    "scaleY": 0.94,
                    "rotation": 0,
                    "scrollX": 0,
                    "scrollY": 0,
                    "gradEnable": true,
                    "gradStops": [
                        {
                            "position": 0,
                            "color": "#170500"
                        },
                        {
                            "position": 0.25,
                            "color": "#7d2100"
                        },
                        {
                            "position": 0.58,
                            "color": "#ff7a00"
                        },
                        {
                            "position": 0.82,
                            "color": "#ffd54a"
                        },
                        {
                            "position": 1,
                            "color": "#ffffff"
                        }
                    ],
                    "solidColorEnabled": false,
                    "solidColor": [
                        1,
                        1,
                        1
                    ]
                },
                {
                    "id": 3,
                    "name": "Ring",
                    "type": "Ring",
                    "blendMode": "add",
                    "opacity": 0.9,
                    "polarConversion": false,
                    "invertEnable": false,
                    "visible": true,
                    "typeParams": [
                        0.49,
                        0.04,
                        0.06,
                        2.6,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0
                    ],
                    "offsetX": 0,
                    "offsetY": 0,
                    "scaleX": 1,
                    "scaleY": 1,
                    "rotation": 0,
                    "scrollX": 0,
                    "scrollY": 0,
                    "gradEnable": true,
                    "gradStops": [
                        {
                            "position": 0,
                            "color": "#170500"
                        },
                        {
                            "position": 0.25,
                            "color": "#7d2100"
                        },
                        {
                            "position": 0.58,
                            "color": "#ff7a00"
                        },
                        {
                            "position": 0.82,
                            "color": "#ffd54a"
                        },
                        {
                            "position": 1,
                            "color": "#ffffff"
                        }
                    ],
                    "solidColorEnabled": false,
                    "solidColor": [
                        1,
                        1,
                        1
                    ]
                },
                {
                    "id": 4,
                    "name": "StarFlare",
                    "type": "StarFlare",
                    "blendMode": "add",
                    "opacity": 0.8,
                    "polarConversion": false,
                    "invertEnable": false,
                    "visible": true,
                    "typeParams": [
                        1.05,
                        0.007,
                        0.86,
                        0.08,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0
                    ],
                    "offsetX": 0,
                    "offsetY": 0,
                    "scaleX": 0.62,
                    "scaleY": 0.62,
                    "rotation": 0.08,
                    "scrollX": 0,
                    "scrollY": 0,
                    "gradEnable": true,
                    "gradStops": [
                        {
                            "position": 0,
                            "color": "#170500"
                        },
                        {
                            "position": 0.25,
                            "color": "#7d2100"
                        },
                        {
                            "position": 0.58,
                            "color": "#ff7a00"
                        },
                        {
                            "position": 0.82,
                            "color": "#ffd54a"
                        },
                        {
                            "position": 1,
                            "color": "#ffffff"
                        }
                    ],
                    "solidColorEnabled": false,
                    "solidColor": [
                        1,
                        1,
                        1
                    ]
                },
                {
                    "id": 5,
                    "name": "SparkBurst",
                    "type": "SparkBurst",
                    "blendMode": "add",
                    "opacity": 0.52,
                    "polarConversion": false,
                    "invertEnable": false,
                    "visible": true,
                    "typeParams": [
                        44,
                        0.58,
                        0.16,
                        0.006,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0
                    ],
                    "offsetX": 0,
                    "offsetY": 0,
                    "scaleX": 0.92,
                    "scaleY": 0.92,
                    "rotation": 0,
                    "scrollX": 0,
                    "scrollY": 0,
                    "gradEnable": true,
                    "gradStops": [
                        {
                            "position": 0,
                            "color": "#170500"
                        },
                        {
                            "position": 0.25,
                            "color": "#7d2100"
                        },
                        {
                            "position": 0.58,
                            "color": "#ff7a00"
                        },
                        {
                            "position": 0.82,
                            "color": "#ffd54a"
                        },
                        {
                            "position": 1,
                            "color": "#ffffff"
                        }
                    ],
                    "solidColorEnabled": false,
                    "solidColor": [
                        1,
                        1,
                        1
                    ]
                }
            ]
        }
    },
    {
        "id": "cyber-portal",
        "name": "Cyber Portal",
        "description": "Neon cyber portal",
        "state": {
            "resolution": 512,
            "time": 0.84,
            "animSpeed": 0.7,
            "animate": false,
            "checkerboard": true,
            "blackBackground": false,
            "gifFps": 30,
            "gifDuration": 2,
            "gifSeamless": true,
            "postEffects": {
                "blurEnabled": false,
                "blurStrength": 1,
                "sharpenEnabled": false,
                "sharpenStrength": 1,
                "pixelationEnabled": false,
                "pixelSize": 10,
                "chromaticAberrationEnabled": true,
                "chromaticAberration": 0.006,
                "vignetteEnabled": true,
                "vignetteStrength": 0.35,
                "vignetteSize": 0.7,
                "vignetteColor": [
                    0,
                    0,
                    0
                ],
                "scanlineEnabled": true,
                "scanlineDensity": 150,
                "scanlineSpeed": 0.35,
                "scanlineStrength": 0.1,
                "scanlineColor": [
                    0,
                    0,
                    0
                ],
                "kaleidoscopeEnabled": false,
                "kaleidoSegments": 6,
                "kaleidoRotation": 0,
                "mirrorTileEnabled": false,
                "mirrorTileX": true,
                "mirrorTileY": true,
                "swirlEnabled": false,
                "swirlStrength": 3,
                "swirlRadius": 0.5,
                "edgeDetectionEnabled": false,
                "edgeThickness": 1,
                "edgeColor": [
                    0,
                    1,
                    0
                ],
                "toonEnabled": false,
                "toonDark": 4,
                "toonLight": 4,
                "vignetteMaskEnabled": false,
                "bloomEnabled": true,
                "bloomStrength": 0.9,
                "colorEnabled": false,
                "colorShadow": [
                    0,
                    0,
                    0
                ],
                "colorMidtone": [
                    0.5,
                    0.5,
                    0.5
                ],
                "colorHighlight": [
                    1,
                    1,
                    1
                ]
            },
            "activeLayerId": 6,
            "layerCounter": 6,
            "layers": [
                {
                    "id": 1,
                    "name": "EnergyRing",
                    "type": "EnergyRing",
                    "blendMode": "normal",
                    "opacity": 1,
                    "polarConversion": false,
                    "invertEnable": false,
                    "visible": true,
                    "typeParams": [
                        0.48,
                        0.034,
                        5.5,
                        2.1,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0
                    ],
                    "offsetX": 0,
                    "offsetY": 0,
                    "scaleX": 1.1,
                    "scaleY": 1.1,
                    "rotation": 0,
                    "scrollX": 0,
                    "scrollY": 0,
                    "gradEnable": true,
                    "gradStops": [
                        {
                            "position": 0,
                            "color": "#02051b"
                        },
                        {
                            "position": 0.25,
                            "color": "#1231a8"
                        },
                        {
                            "position": 0.53,
                            "color": "#00d9ff"
                        },
                        {
                            "position": 0.76,
                            "color": "#b426ff"
                        },
                        {
                            "position": 1,
                            "color": "#b9f8ff"
                        }
                    ],
                    "solidColorEnabled": false,
                    "solidColor": [
                        1,
                        1,
                        1
                    ]
                },
                {
                    "id": 2,
                    "name": "HexGridRadial",
                    "type": "HexGridRadial",
                    "blendMode": "screen",
                    "opacity": 0.28,
                    "polarConversion": false,
                    "invertEnable": false,
                    "visible": true,
                    "typeParams": [
                        11.5,
                        0.12,
                        0.06,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0
                    ],
                    "offsetX": 0,
                    "offsetY": 0,
                    "scaleX": 0.92,
                    "scaleY": 0.92,
                    "rotation": 0.12,
                    "scrollX": 0,
                    "scrollY": 0,
                    "gradEnable": true,
                    "gradStops": [
                        {
                            "position": 0,
                            "color": "#02051b"
                        },
                        {
                            "position": 0.25,
                            "color": "#1231a8"
                        },
                        {
                            "position": 0.53,
                            "color": "#00d9ff"
                        },
                        {
                            "position": 0.76,
                            "color": "#b426ff"
                        },
                        {
                            "position": 1,
                            "color": "#b9f8ff"
                        }
                    ],
                    "solidColorEnabled": false,
                    "solidColor": [
                        1,
                        1,
                        1
                    ]
                },
                {
                    "id": 3,
                    "name": "CyberBlock",
                    "type": "CyberBlock",
                    "blendMode": "screen",
                    "opacity": 0.18,
                    "polarConversion": false,
                    "invertEnable": false,
                    "visible": true,
                    "typeParams": [
                        44,
                        1.2,
                        0.24,
                        0.02,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0
                    ],
                    "offsetX": 0,
                    "offsetY": 0,
                    "scaleX": 1.05,
                    "scaleY": 1.05,
                    "rotation": 0,
                    "scrollX": 0,
                    "scrollY": 0,
                    "gradEnable": true,
                    "gradStops": [
                        {
                            "position": 0,
                            "color": "#02051b"
                        },
                        {
                            "position": 0.25,
                            "color": "#1231a8"
                        },
                        {
                            "position": 0.53,
                            "color": "#00d9ff"
                        },
                        {
                            "position": 0.76,
                            "color": "#b426ff"
                        },
                        {
                            "position": 1,
                            "color": "#b9f8ff"
                        }
                    ],
                    "solidColorEnabled": false,
                    "solidColor": [
                        1,
                        1,
                        1
                    ]
                },
                {
                    "id": 4,
                    "name": "GlitchBlock",
                    "type": "GlitchBlock",
                    "blendMode": "add",
                    "opacity": 0.16,
                    "polarConversion": false,
                    "invertEnable": false,
                    "visible": true,
                    "typeParams": [
                        24,
                        45,
                        0.75,
                        0.12,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0
                    ],
                    "offsetX": 0,
                    "offsetY": 0,
                    "scaleX": 1,
                    "scaleY": 1,
                    "rotation": 0,
                    "scrollX": 0,
                    "scrollY": 0,
                    "gradEnable": true,
                    "gradStops": [
                        {
                            "position": 0,
                            "color": "#02051b"
                        },
                        {
                            "position": 0.25,
                            "color": "#1231a8"
                        },
                        {
                            "position": 0.53,
                            "color": "#00d9ff"
                        },
                        {
                            "position": 0.76,
                            "color": "#b426ff"
                        },
                        {
                            "position": 1,
                            "color": "#b9f8ff"
                        }
                    ],
                    "solidColorEnabled": false,
                    "solidColor": [
                        1,
                        1,
                        1
                    ]
                },
                {
                    "id": 5,
                    "name": "Ring",
                    "type": "Ring",
                    "blendMode": "add",
                    "opacity": 0.78,
                    "polarConversion": false,
                    "invertEnable": false,
                    "visible": true,
                    "typeParams": [
                        0.64,
                        0.018,
                        0.03,
                        2.7,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0
                    ],
                    "offsetX": 0,
                    "offsetY": 0,
                    "scaleX": 1,
                    "scaleY": 1,
                    "rotation": 0,
                    "scrollX": 0,
                    "scrollY": 0,
                    "gradEnable": true,
                    "gradStops": [
                        {
                            "position": 0,
                            "color": "#02051b"
                        },
                        {
                            "position": 0.25,
                            "color": "#1231a8"
                        },
                        {
                            "position": 0.53,
                            "color": "#00d9ff"
                        },
                        {
                            "position": 0.76,
                            "color": "#b426ff"
                        },
                        {
                            "position": 1,
                            "color": "#b9f8ff"
                        }
                    ],
                    "solidColorEnabled": false,
                    "solidColor": [
                        1,
                        1,
                        1
                    ]
                },
                {
                    "id": 6,
                    "name": "Scanline",
                    "type": "Scanline",
                    "blendMode": "screen",
                    "opacity": 0.13,
                    "polarConversion": false,
                    "invertEnable": false,
                    "visible": true,
                    "typeParams": [
                        180,
                        0.35,
                        0.8,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0
                    ],
                    "offsetX": 0,
                    "offsetY": 0,
                    "scaleX": 1,
                    "scaleY": 1,
                    "rotation": 0,
                    "scrollX": 0,
                    "scrollY": 0,
                    "gradEnable": true,
                    "gradStops": [
                        {
                            "position": 0,
                            "color": "#02051b"
                        },
                        {
                            "position": 0.25,
                            "color": "#1231a8"
                        },
                        {
                            "position": 0.53,
                            "color": "#00d9ff"
                        },
                        {
                            "position": 0.76,
                            "color": "#b426ff"
                        },
                        {
                            "position": 1,
                            "color": "#b9f8ff"
                        }
                    ],
                    "solidColorEnabled": false,
                    "solidColor": [
                        1,
                        1,
                        1
                    ]
                }
            ]
        }
    },
    {
        "id": "frost-nova",
        "name": "Frost Nova",
        "description": "Ice crystal burst with frost",
        "state": {
            "resolution": 512,
            "time": 0.36,
            "animSpeed": 0.6,
            "animate": false,
            "checkerboard": true,
            "blackBackground": false,
            "gifFps": 30,
            "gifDuration": 2,
            "gifSeamless": true,
            "postEffects": {
                "blurEnabled": false,
                "blurStrength": 1,
                "sharpenEnabled": true,
                "sharpenStrength": 0.25,
                "pixelationEnabled": false,
                "pixelSize": 10,
                "chromaticAberrationEnabled": false,
                "chromaticAberration": 0.01,
                "vignetteEnabled": true,
                "vignetteStrength": 0.4,
                "vignetteSize": 0.72,
                "vignetteColor": [
                    0,
                    0,
                    0
                ],
                "scanlineEnabled": false,
                "scanlineDensity": 100,
                "scanlineSpeed": 1,
                "scanlineStrength": 0.5,
                "scanlineColor": [
                    0,
                    0,
                    0
                ],
                "kaleidoscopeEnabled": false,
                "kaleidoSegments": 6,
                "kaleidoRotation": 0,
                "mirrorTileEnabled": false,
                "mirrorTileX": true,
                "mirrorTileY": true,
                "swirlEnabled": false,
                "swirlStrength": 3,
                "swirlRadius": 0.5,
                "edgeDetectionEnabled": false,
                "edgeThickness": 1,
                "edgeColor": [
                    0,
                    1,
                    0
                ],
                "toonEnabled": false,
                "toonDark": 4,
                "toonLight": 4,
                "vignetteMaskEnabled": false,
                "bloomEnabled": true,
                "bloomStrength": 0.9,
                "colorEnabled": false,
                "colorShadow": [
                    0,
                    0,
                    0
                ],
                "colorMidtone": [
                    0.5,
                    0.5,
                    0.5
                ],
                "colorHighlight": [
                    1,
                    1,
                    1
                ]
            },
            "activeLayerId": 5,
            "layerCounter": 5,
            "layers": [
                {
                    "id": 1,
                    "name": "Crystal",
                    "type": "Crystal",
                    "blendMode": "normal",
                    "opacity": 0.38,
                    "polarConversion": false,
                    "invertEnable": false,
                    "visible": true,
                    "typeParams": [
                        7.5,
                        0.72,
                        4,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0
                    ],
                    "offsetX": 0,
                    "offsetY": 0,
                    "scaleX": 1.08,
                    "scaleY": 1.08,
                    "rotation": 0,
                    "scrollX": 0,
                    "scrollY": 0,
                    "gradEnable": true,
                    "gradStops": [
                        {
                            "position": 0,
                            "color": "#000817"
                        },
                        {
                            "position": 0.24,
                            "color": "#00446f"
                        },
                        {
                            "position": 0.52,
                            "color": "#16bfe5"
                        },
                        {
                            "position": 0.8,
                            "color": "#adf7ff"
                        },
                        {
                            "position": 1,
                            "color": "#ffffff"
                        }
                    ],
                    "solidColorEnabled": false,
                    "solidColor": [
                        1,
                        1,
                        1
                    ]
                },
                {
                    "id": 2,
                    "name": "StarBurst",
                    "type": "StarBurst",
                    "blendMode": "screen",
                    "opacity": 0.58,
                    "polarConversion": false,
                    "invertEnable": false,
                    "visible": true,
                    "typeParams": [
                        6,
                        0.88,
                        13,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0
                    ],
                    "offsetX": 0,
                    "offsetY": 0,
                    "scaleX": 0.88,
                    "scaleY": 0.88,
                    "rotation": 0.12,
                    "scrollX": 0,
                    "scrollY": 0,
                    "gradEnable": true,
                    "gradStops": [
                        {
                            "position": 0,
                            "color": "#000817"
                        },
                        {
                            "position": 0.24,
                            "color": "#00446f"
                        },
                        {
                            "position": 0.52,
                            "color": "#16bfe5"
                        },
                        {
                            "position": 0.8,
                            "color": "#adf7ff"
                        },
                        {
                            "position": 1,
                            "color": "#ffffff"
                        }
                    ],
                    "solidColorEnabled": false,
                    "solidColor": [
                        1,
                        1,
                        1
                    ]
                },
                {
                    "id": 3,
                    "name": "EnergyRing",
                    "type": "EnergyRing",
                    "blendMode": "add",
                    "opacity": 0.78,
                    "polarConversion": false,
                    "invertEnable": false,
                    "visible": true,
                    "typeParams": [
                        0.48,
                        0.04,
                        9,
                        1.8,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0
                    ],
                    "offsetX": 0,
                    "offsetY": 0,
                    "scaleX": 1,
                    "scaleY": 1,
                    "rotation": 0,
                    "scrollX": 0,
                    "scrollY": 0,
                    "gradEnable": true,
                    "gradStops": [
                        {
                            "position": 0,
                            "color": "#000817"
                        },
                        {
                            "position": 0.24,
                            "color": "#00446f"
                        },
                        {
                            "position": 0.52,
                            "color": "#16bfe5"
                        },
                        {
                            "position": 0.8,
                            "color": "#adf7ff"
                        },
                        {
                            "position": 1,
                            "color": "#ffffff"
                        }
                    ],
                    "solidColorEnabled": false,
                    "solidColor": [
                        1,
                        1,
                        1
                    ]
                },
                {
                    "id": 4,
                    "name": "SparkBurst",
                    "type": "SparkBurst",
                    "blendMode": "add",
                    "opacity": 0.56,
                    "polarConversion": false,
                    "invertEnable": false,
                    "visible": true,
                    "typeParams": [
                        48,
                        0.45,
                        0.12,
                        0.005,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0
                    ],
                    "offsetX": 0,
                    "offsetY": 0,
                    "scaleX": 0.9,
                    "scaleY": 0.9,
                    "rotation": 0,
                    "scrollX": 0,
                    "scrollY": 0,
                    "gradEnable": true,
                    "gradStops": [
                        {
                            "position": 0,
                            "color": "#000817"
                        },
                        {
                            "position": 0.24,
                            "color": "#00446f"
                        },
                        {
                            "position": 0.52,
                            "color": "#16bfe5"
                        },
                        {
                            "position": 0.8,
                            "color": "#adf7ff"
                        },
                        {
                            "position": 1,
                            "color": "#ffffff"
                        }
                    ],
                    "solidColorEnabled": false,
                    "solidColor": [
                        1,
                        1,
                        1
                    ]
                },
                {
                    "id": 5,
                    "name": "Ring",
                    "type": "Ring",
                    "blendMode": "add",
                    "opacity": 0.82,
                    "polarConversion": false,
                    "invertEnable": false,
                    "visible": true,
                    "typeParams": [
                        0.61,
                        0.018,
                        0.035,
                        2.8,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0
                    ],
                    "offsetX": 0,
                    "offsetY": 0,
                    "scaleX": 1,
                    "scaleY": 1,
                    "rotation": 0,
                    "scrollX": 0,
                    "scrollY": 0,
                    "gradEnable": true,
                    "gradStops": [
                        {
                            "position": 0,
                            "color": "#000817"
                        },
                        {
                            "position": 0.24,
                            "color": "#00446f"
                        },
                        {
                            "position": 0.52,
                            "color": "#16bfe5"
                        },
                        {
                            "position": 0.8,
                            "color": "#adf7ff"
                        },
                        {
                            "position": 1,
                            "color": "#ffffff"
                        }
                    ],
                    "solidColorEnabled": false,
                    "solidColor": [
                        1,
                        1,
                        1
                    ]
                }
            ]
        }
    },
    {
        "id": "toxic-pulse",
        "name": "Toxic Pulse",
        "description": "Toxic pulse ripples",
        "state": {
            "resolution": 512,
            "time": 0.64,
            "animSpeed": 0.5,
            "animate": false,
            "checkerboard": true,
            "blackBackground": false,
            "gifFps": 30,
            "gifDuration": 2,
            "gifSeamless": true,
            "postEffects": {
                "blurEnabled": false,
                "blurStrength": 1,
                "sharpenEnabled": false,
                "sharpenStrength": 1,
                "pixelationEnabled": false,
                "pixelSize": 10,
                "chromaticAberrationEnabled": false,
                "chromaticAberration": 0.01,
                "vignetteEnabled": true,
                "vignetteStrength": 0.52,
                "vignetteSize": 0.68,
                "vignetteColor": [
                    0,
                    0,
                    0
                ],
                "scanlineEnabled": false,
                "scanlineDensity": 100,
                "scanlineSpeed": 1,
                "scanlineStrength": 0.5,
                "scanlineColor": [
                    0,
                    0,
                    0
                ],
                "kaleidoscopeEnabled": false,
                "kaleidoSegments": 6,
                "kaleidoRotation": 0,
                "mirrorTileEnabled": false,
                "mirrorTileX": true,
                "mirrorTileY": true,
                "swirlEnabled": false,
                "swirlStrength": 3,
                "swirlRadius": 0.5,
                "edgeDetectionEnabled": false,
                "edgeThickness": 1,
                "edgeColor": [
                    0,
                    1,
                    0
                ],
                "toonEnabled": false,
                "toonDark": 4,
                "toonLight": 4,
                "vignetteMaskEnabled": false,
                "bloomEnabled": true,
                "bloomStrength": 0.55,
                "colorEnabled": false,
                "colorShadow": [
                    0,
                    0,
                    0
                ],
                "colorMidtone": [
                    0.5,
                    0.5,
                    0.5
                ],
                "colorHighlight": [
                    1,
                    1,
                    1
                ]
            },
            "activeLayerId": 5,
            "layerCounter": 5,
            "layers": [
                {
                    "id": 1,
                    "name": "ToxicCloud",
                    "type": "ToxicCloud",
                    "blendMode": "normal",
                    "opacity": 0.7,
                    "polarConversion": false,
                    "invertEnable": false,
                    "visible": true,
                    "typeParams": [
                        4.2,
                        0.55,
                        5,
                        1.35,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0
                    ],
                    "offsetX": 0,
                    "offsetY": 0,
                    "scaleX": 1.1,
                    "scaleY": 1.1,
                    "rotation": 0,
                    "scrollX": 0,
                    "scrollY": 0,
                    "gradEnable": true,
                    "gradStops": [
                        {
                            "position": 0,
                            "color": "#020b00"
                        },
                        {
                            "position": 0.24,
                            "color": "#0c4100"
                        },
                        {
                            "position": 0.54,
                            "color": "#56bd00"
                        },
                        {
                            "position": 0.8,
                            "color": "#c7ff1a"
                        },
                        {
                            "position": 1,
                            "color": "#f5ffb0"
                        }
                    ],
                    "solidColorEnabled": false,
                    "solidColor": [
                        1,
                        1,
                        1
                    ]
                },
                {
                    "id": 2,
                    "name": "FbmNoise",
                    "type": "FbmNoise",
                    "blendMode": "screen",
                    "opacity": 0.2,
                    "polarConversion": false,
                    "invertEnable": false,
                    "visible": true,
                    "typeParams": [
                        5.5,
                        6,
                        2.2,
                        0.48,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0
                    ],
                    "offsetX": 0,
                    "offsetY": 0,
                    "scaleX": 1,
                    "scaleY": 1,
                    "rotation": 0,
                    "scrollX": 0,
                    "scrollY": 0,
                    "gradEnable": true,
                    "gradStops": [
                        {
                            "position": 0,
                            "color": "#020b00"
                        },
                        {
                            "position": 0.24,
                            "color": "#0c4100"
                        },
                        {
                            "position": 0.54,
                            "color": "#56bd00"
                        },
                        {
                            "position": 0.8,
                            "color": "#c7ff1a"
                        },
                        {
                            "position": 1,
                            "color": "#f5ffb0"
                        }
                    ],
                    "solidColorEnabled": false,
                    "solidColor": [
                        1,
                        1,
                        1
                    ]
                },
                {
                    "id": 3,
                    "name": "MetaBalls",
                    "type": "MetaBalls",
                    "blendMode": "screen",
                    "opacity": 0.34,
                    "polarConversion": false,
                    "invertEnable": false,
                    "visible": true,
                    "typeParams": [
                        7,
                        1.6,
                        0.14,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0
                    ],
                    "offsetX": 0,
                    "offsetY": 0,
                    "scaleX": 1.06,
                    "scaleY": 1.06,
                    "rotation": 0,
                    "scrollX": 0,
                    "scrollY": 0,
                    "gradEnable": true,
                    "gradStops": [
                        {
                            "position": 0,
                            "color": "#020b00"
                        },
                        {
                            "position": 0.24,
                            "color": "#0c4100"
                        },
                        {
                            "position": 0.54,
                            "color": "#56bd00"
                        },
                        {
                            "position": 0.8,
                            "color": "#c7ff1a"
                        },
                        {
                            "position": 1,
                            "color": "#f5ffb0"
                        }
                    ],
                    "solidColorEnabled": false,
                    "solidColor": [
                        1,
                        1,
                        1
                    ]
                },
                {
                    "id": 4,
                    "name": "Pulse",
                    "type": "Pulse",
                    "blendMode": "add",
                    "opacity": 0.54,
                    "polarConversion": false,
                    "invertEnable": false,
                    "visible": true,
                    "typeParams": [
                        1.1,
                        0.05,
                        4,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0
                    ],
                    "offsetX": 0,
                    "offsetY": 0,
                    "scaleX": 1,
                    "scaleY": 1,
                    "rotation": 0,
                    "scrollX": 0,
                    "scrollY": 0,
                    "gradEnable": true,
                    "gradStops": [
                        {
                            "position": 0,
                            "color": "#020b00"
                        },
                        {
                            "position": 0.24,
                            "color": "#0c4100"
                        },
                        {
                            "position": 0.54,
                            "color": "#56bd00"
                        },
                        {
                            "position": 0.8,
                            "color": "#c7ff1a"
                        },
                        {
                            "position": 1,
                            "color": "#f5ffb0"
                        }
                    ],
                    "solidColorEnabled": false,
                    "solidColor": [
                        1,
                        1,
                        1
                    ]
                },
                {
                    "id": 5,
                    "name": "Ring",
                    "type": "Ring",
                    "blendMode": "add",
                    "opacity": 0.52,
                    "polarConversion": false,
                    "invertEnable": false,
                    "visible": true,
                    "typeParams": [
                        0.52,
                        0.025,
                        0.05,
                        2.1,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0
                    ],
                    "offsetX": 0,
                    "offsetY": 0,
                    "scaleX": 1,
                    "scaleY": 1,
                    "rotation": 0,
                    "scrollX": 0,
                    "scrollY": 0,
                    "gradEnable": true,
                    "gradStops": [
                        {
                            "position": 0,
                            "color": "#020b00"
                        },
                        {
                            "position": 0.24,
                            "color": "#0c4100"
                        },
                        {
                            "position": 0.54,
                            "color": "#56bd00"
                        },
                        {
                            "position": 0.8,
                            "color": "#c7ff1a"
                        },
                        {
                            "position": 1,
                            "color": "#f5ffb0"
                        }
                    ],
                    "solidColorEnabled": false,
                    "solidColor": [
                        1,
                        1,
                        1
                    ]
                }
            ]
        }
    },
    {
        "id": "holy-flare",
        "name": "Holy Flare",
        "description": "Sacred halo of light",
        "state": {
            "resolution": 512,
            "time": 0.28,
            "animSpeed": 0.55,
            "animate": false,
            "checkerboard": true,
            "blackBackground": false,
            "gifFps": 30,
            "gifDuration": 2,
            "gifSeamless": true,
            "postEffects": {
                "blurEnabled": false,
                "blurStrength": 1,
                "sharpenEnabled": false,
                "sharpenStrength": 1,
                "pixelationEnabled": false,
                "pixelSize": 10,
                "chromaticAberrationEnabled": false,
                "chromaticAberration": 0.01,
                "vignetteEnabled": true,
                "vignetteStrength": 0.32,
                "vignetteSize": 0.76,
                "vignetteColor": [
                    0,
                    0,
                    0
                ],
                "scanlineEnabled": false,
                "scanlineDensity": 100,
                "scanlineSpeed": 1,
                "scanlineStrength": 0.5,
                "scanlineColor": [
                    0,
                    0,
                    0
                ],
                "kaleidoscopeEnabled": false,
                "kaleidoSegments": 6,
                "kaleidoRotation": 0,
                "mirrorTileEnabled": false,
                "mirrorTileX": true,
                "mirrorTileY": true,
                "swirlEnabled": false,
                "swirlStrength": 3,
                "swirlRadius": 0.5,
                "edgeDetectionEnabled": false,
                "edgeThickness": 1,
                "edgeColor": [
                    0,
                    1,
                    0
                ],
                "toonEnabled": false,
                "toonDark": 4,
                "toonLight": 4,
                "vignetteMaskEnabled": false,
                "bloomEnabled": true,
                "bloomStrength": 1.15,
                "colorEnabled": false,
                "colorShadow": [
                    0,
                    0,
                    0
                ],
                "colorMidtone": [
                    0.5,
                    0.5,
                    0.5
                ],
                "colorHighlight": [
                    1,
                    1,
                    1
                ]
            },
            "activeLayerId": 6,
            "layerCounter": 6,
            "layers": [
                {
                    "id": 1,
                    "name": "Burst",
                    "type": "Burst",
                    "blendMode": "normal",
                    "opacity": 0.76,
                    "polarConversion": false,
                    "invertEnable": false,
                    "visible": true,
                    "typeParams": [
                        72,
                        5.5,
                        3.2,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0
                    ],
                    "offsetX": 0,
                    "offsetY": 0,
                    "scaleX": 1.05,
                    "scaleY": 1.05,
                    "rotation": 0,
                    "scrollX": 0,
                    "scrollY": 0,
                    "gradEnable": true,
                    "gradStops": [
                        {
                            "position": 0,
                            "color": "#170b00"
                        },
                        {
                            "position": 0.24,
                            "color": "#9d4d00"
                        },
                        {
                            "position": 0.54,
                            "color": "#ffd34c"
                        },
                        {
                            "position": 0.82,
                            "color": "#fff2a8"
                        },
                        {
                            "position": 1,
                            "color": "#ffffff"
                        }
                    ],
                    "solidColorEnabled": false,
                    "solidColor": [
                        1,
                        1,
                        1
                    ]
                },
                {
                    "id": 2,
                    "name": "RayBurst",
                    "type": "RayBurst",
                    "blendMode": "screen",
                    "opacity": 0.62,
                    "polarConversion": false,
                    "invertEnable": false,
                    "visible": true,
                    "typeParams": [
                        16,
                        7,
                        2.5,
                        0,
                        1.7,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0
                    ],
                    "offsetX": 0,
                    "offsetY": 0,
                    "scaleX": 0.92,
                    "scaleY": 0.92,
                    "rotation": 0,
                    "scrollX": 0,
                    "scrollY": 0,
                    "gradEnable": true,
                    "gradStops": [
                        {
                            "position": 0,
                            "color": "#170b00"
                        },
                        {
                            "position": 0.24,
                            "color": "#9d4d00"
                        },
                        {
                            "position": 0.54,
                            "color": "#ffd34c"
                        },
                        {
                            "position": 0.82,
                            "color": "#fff2a8"
                        },
                        {
                            "position": 1,
                            "color": "#ffffff"
                        }
                    ],
                    "solidColorEnabled": false,
                    "solidColor": [
                        1,
                        1,
                        1
                    ]
                },
                {
                    "id": 3,
                    "name": "Glare",
                    "type": "Glare",
                    "blendMode": "add",
                    "opacity": 0.68,
                    "polarConversion": false,
                    "invertEnable": false,
                    "visible": true,
                    "typeParams": [
                        8,
                        0.004,
                        1.25,
                        1.8,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0
                    ],
                    "offsetX": 0,
                    "offsetY": 0,
                    "scaleX": 0.78,
                    "scaleY": 0.78,
                    "rotation": 0,
                    "scrollX": 0,
                    "scrollY": 0,
                    "gradEnable": true,
                    "gradStops": [
                        {
                            "position": 0,
                            "color": "#170b00"
                        },
                        {
                            "position": 0.24,
                            "color": "#9d4d00"
                        },
                        {
                            "position": 0.54,
                            "color": "#ffd34c"
                        },
                        {
                            "position": 0.82,
                            "color": "#fff2a8"
                        },
                        {
                            "position": 1,
                            "color": "#ffffff"
                        }
                    ],
                    "solidColorEnabled": false,
                    "solidColor": [
                        1,
                        1,
                        1
                    ]
                },
                {
                    "id": 4,
                    "name": "StarFlare",
                    "type": "StarFlare",
                    "blendMode": "add",
                    "opacity": 0.7,
                    "polarConversion": false,
                    "invertEnable": false,
                    "visible": true,
                    "typeParams": [
                        0.9,
                        0.007,
                        0.72,
                        0.08,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0
                    ],
                    "offsetX": 0,
                    "offsetY": 0,
                    "scaleX": 0.58,
                    "scaleY": 0.58,
                    "rotation": 0,
                    "scrollX": 0,
                    "scrollY": 0,
                    "gradEnable": true,
                    "gradStops": [
                        {
                            "position": 0,
                            "color": "#170b00"
                        },
                        {
                            "position": 0.24,
                            "color": "#9d4d00"
                        },
                        {
                            "position": 0.54,
                            "color": "#ffd34c"
                        },
                        {
                            "position": 0.82,
                            "color": "#fff2a8"
                        },
                        {
                            "position": 1,
                            "color": "#ffffff"
                        }
                    ],
                    "solidColorEnabled": false,
                    "solidColor": [
                        1,
                        1,
                        1
                    ]
                },
                {
                    "id": 5,
                    "name": "Ring",
                    "type": "Ring",
                    "blendMode": "add",
                    "opacity": 0.55,
                    "polarConversion": false,
                    "invertEnable": false,
                    "visible": true,
                    "typeParams": [
                        0.5,
                        0.025,
                        0.05,
                        2.4,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0
                    ],
                    "offsetX": 0,
                    "offsetY": 0,
                    "scaleX": 1,
                    "scaleY": 1,
                    "rotation": 0,
                    "scrollX": 0,
                    "scrollY": 0,
                    "gradEnable": true,
                    "gradStops": [
                        {
                            "position": 0,
                            "color": "#170b00"
                        },
                        {
                            "position": 0.24,
                            "color": "#9d4d00"
                        },
                        {
                            "position": 0.54,
                            "color": "#ffd34c"
                        },
                        {
                            "position": 0.82,
                            "color": "#fff2a8"
                        },
                        {
                            "position": 1,
                            "color": "#ffffff"
                        }
                    ],
                    "solidColorEnabled": false,
                    "solidColor": [
                        1,
                        1,
                        1
                    ]
                },
                {
                    "id": 6,
                    "name": "Shimmer",
                    "type": "Shimmer",
                    "blendMode": "add",
                    "opacity": 0.28,
                    "polarConversion": false,
                    "invertEnable": false,
                    "visible": true,
                    "typeParams": [
                        18,
                        0.8,
                        1.4,
                        1.5,
                        0.82,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0
                    ],
                    "offsetX": 0,
                    "offsetY": 0,
                    "scaleX": 1,
                    "scaleY": 1,
                    "rotation": 0,
                    "scrollX": 0,
                    "scrollY": 0,
                    "gradEnable": true,
                    "gradStops": [
                        {
                            "position": 0,
                            "color": "#170b00"
                        },
                        {
                            "position": 0.24,
                            "color": "#9d4d00"
                        },
                        {
                            "position": 0.54,
                            "color": "#ffd34c"
                        },
                        {
                            "position": 0.82,
                            "color": "#fff2a8"
                        },
                        {
                            "position": 1,
                            "color": "#ffffff"
                        }
                    ],
                    "solidColorEnabled": false,
                    "solidColor": [
                        1,
                        1,
                        1
                    ]
                }
            ]
        }
    },
    {
        "id": "dark-singularity",
        "name": "Dark Singularity",
        "description": "Collapsing dark gravity well",
        "state": {
            "resolution": 512,
            "time": 0.76,
            "animSpeed": 0.45,
            "animate": false,
            "checkerboard": true,
            "blackBackground": false,
            "gifFps": 30,
            "gifDuration": 2,
            "gifSeamless": true,
            "postEffects": {
                "blurEnabled": false,
                "blurStrength": 1,
                "sharpenEnabled": false,
                "sharpenStrength": 1,
                "pixelationEnabled": false,
                "pixelSize": 10,
                "chromaticAberrationEnabled": false,
                "chromaticAberration": 0.01,
                "vignetteEnabled": true,
                "vignetteStrength": 0.68,
                "vignetteSize": 0.6,
                "vignetteColor": [
                    0,
                    0,
                    0
                ],
                "scanlineEnabled": false,
                "scanlineDensity": 100,
                "scanlineSpeed": 1,
                "scanlineStrength": 0.5,
                "scanlineColor": [
                    0,
                    0,
                    0
                ],
                "kaleidoscopeEnabled": false,
                "kaleidoSegments": 6,
                "kaleidoRotation": 0,
                "mirrorTileEnabled": false,
                "mirrorTileX": true,
                "mirrorTileY": true,
                "swirlEnabled": true,
                "swirlStrength": 1.4,
                "swirlRadius": 0.6,
                "edgeDetectionEnabled": false,
                "edgeThickness": 1,
                "edgeColor": [
                    0,
                    1,
                    0
                ],
                "toonEnabled": false,
                "toonDark": 4,
                "toonLight": 4,
                "vignetteMaskEnabled": false,
                "bloomEnabled": true,
                "bloomStrength": 0.65,
                "colorEnabled": false,
                "colorShadow": [
                    0,
                    0,
                    0
                ],
                "colorMidtone": [
                    0.5,
                    0.5,
                    0.5
                ],
                "colorHighlight": [
                    1,
                    1,
                    1
                ]
            },
            "activeLayerId": 5,
            "layerCounter": 5,
            "layers": [
                {
                    "id": 1,
                    "name": "Wormhole",
                    "type": "Wormhole",
                    "blendMode": "normal",
                    "opacity": 1,
                    "polarConversion": false,
                    "invertEnable": false,
                    "visible": true,
                    "typeParams": [
                        9,
                        0.48,
                        0.3,
                        3.4,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0
                    ],
                    "offsetX": 0,
                    "offsetY": 0,
                    "scaleX": 1.12,
                    "scaleY": 1.12,
                    "rotation": 0,
                    "scrollX": 0,
                    "scrollY": 0,
                    "gradEnable": true,
                    "gradStops": [
                        {
                            "position": 0,
                            "color": "#000000"
                        },
                        {
                            "position": 0.26,
                            "color": "#12001f"
                        },
                        {
                            "position": 0.52,
                            "color": "#3b0a6f"
                        },
                        {
                            "position": 0.8,
                            "color": "#8227d4"
                        },
                        {
                            "position": 1,
                            "color": "#d8a8ff"
                        }
                    ],
                    "solidColorEnabled": false,
                    "solidColor": [
                        1,
                        1,
                        1
                    ]
                },
                {
                    "id": 2,
                    "name": "CosmicPortal",
                    "type": "CosmicPortal",
                    "blendMode": "screen",
                    "opacity": 0.38,
                    "polarConversion": false,
                    "invertEnable": false,
                    "visible": true,
                    "typeParams": [
                        3.5,
                        4.2,
                        0.45,
                        2.5,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0
                    ],
                    "offsetX": 0,
                    "offsetY": 0,
                    "scaleX": 1,
                    "scaleY": 1,
                    "rotation": 0,
                    "scrollX": 0,
                    "scrollY": 0,
                    "gradEnable": true,
                    "gradStops": [
                        {
                            "position": 0,
                            "color": "#000000"
                        },
                        {
                            "position": 0.26,
                            "color": "#12001f"
                        },
                        {
                            "position": 0.52,
                            "color": "#3b0a6f"
                        },
                        {
                            "position": 0.8,
                            "color": "#8227d4"
                        },
                        {
                            "position": 1,
                            "color": "#d8a8ff"
                        }
                    ],
                    "solidColorEnabled": false,
                    "solidColor": [
                        1,
                        1,
                        1
                    ]
                },
                {
                    "id": 3,
                    "name": "Swirl",
                    "type": "Swirl",
                    "blendMode": "screen",
                    "opacity": 0.32,
                    "polarConversion": false,
                    "invertEnable": false,
                    "visible": true,
                    "typeParams": [
                        7,
                        11,
                        2.2,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0
                    ],
                    "offsetX": 0,
                    "offsetY": 0,
                    "scaleX": 0.95,
                    "scaleY": 0.95,
                    "rotation": 0,
                    "scrollX": 0,
                    "scrollY": 0,
                    "gradEnable": true,
                    "gradStops": [
                        {
                            "position": 0,
                            "color": "#000000"
                        },
                        {
                            "position": 0.26,
                            "color": "#12001f"
                        },
                        {
                            "position": 0.52,
                            "color": "#3b0a6f"
                        },
                        {
                            "position": 0.8,
                            "color": "#8227d4"
                        },
                        {
                            "position": 1,
                            "color": "#d8a8ff"
                        }
                    ],
                    "solidColorEnabled": false,
                    "solidColor": [
                        1,
                        1,
                        1
                    ]
                },
                {
                    "id": 4,
                    "name": "EnergyRing",
                    "type": "EnergyRing",
                    "blendMode": "add",
                    "opacity": 0.46,
                    "polarConversion": false,
                    "invertEnable": false,
                    "visible": true,
                    "typeParams": [
                        0.45,
                        0.028,
                        11,
                        1.9,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0
                    ],
                    "offsetX": 0,
                    "offsetY": 0,
                    "scaleX": 1,
                    "scaleY": 1,
                    "rotation": 0,
                    "scrollX": 0,
                    "scrollY": 0,
                    "gradEnable": true,
                    "gradStops": [
                        {
                            "position": 0,
                            "color": "#000000"
                        },
                        {
                            "position": 0.26,
                            "color": "#12001f"
                        },
                        {
                            "position": 0.52,
                            "color": "#3b0a6f"
                        },
                        {
                            "position": 0.8,
                            "color": "#8227d4"
                        },
                        {
                            "position": 1,
                            "color": "#d8a8ff"
                        }
                    ],
                    "solidColorEnabled": false,
                    "solidColor": [
                        1,
                        1,
                        1
                    ]
                },
                {
                    "id": 5,
                    "name": "Ring",
                    "type": "Ring",
                    "blendMode": "add",
                    "opacity": 0.58,
                    "polarConversion": false,
                    "invertEnable": false,
                    "visible": true,
                    "typeParams": [
                        0.58,
                        0.016,
                        0.025,
                        3,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0
                    ],
                    "offsetX": 0,
                    "offsetY": 0,
                    "scaleX": 1,
                    "scaleY": 1,
                    "rotation": 0,
                    "scrollX": 0,
                    "scrollY": 0,
                    "gradEnable": true,
                    "gradStops": [
                        {
                            "position": 0,
                            "color": "#000000"
                        },
                        {
                            "position": 0.26,
                            "color": "#12001f"
                        },
                        {
                            "position": 0.52,
                            "color": "#3b0a6f"
                        },
                        {
                            "position": 0.8,
                            "color": "#8227d4"
                        },
                        {
                            "position": 1,
                            "color": "#d8a8ff"
                        }
                    ],
                    "solidColorEnabled": false,
                    "solidColor": [
                        1,
                        1,
                        1
                    ]
                }
            ]
        }
    },
    {
        "id": "electric-storm",
        "name": "Electric Storm",
        "description": "Thunderous electric energy",
        "state": {
            "resolution": 512,
            "time": 0.48,
            "animSpeed": 0.9,
            "animate": false,
            "checkerboard": true,
            "blackBackground": false,
            "gifFps": 30,
            "gifDuration": 2,
            "gifSeamless": true,
            "postEffects": {
                "blurEnabled": false,
                "blurStrength": 1,
                "sharpenEnabled": true,
                "sharpenStrength": 0.35,
                "pixelationEnabled": false,
                "pixelSize": 10,
                "chromaticAberrationEnabled": true,
                "chromaticAberration": 0.004,
                "vignetteEnabled": true,
                "vignetteStrength": 0.38,
                "vignetteSize": 0.72,
                "vignetteColor": [
                    0,
                    0,
                    0
                ],
                "scanlineEnabled": false,
                "scanlineDensity": 100,
                "scanlineSpeed": 1,
                "scanlineStrength": 0.5,
                "scanlineColor": [
                    0,
                    0,
                    0
                ],
                "kaleidoscopeEnabled": false,
                "kaleidoSegments": 6,
                "kaleidoRotation": 0,
                "mirrorTileEnabled": false,
                "mirrorTileX": true,
                "mirrorTileY": true,
                "swirlEnabled": false,
                "swirlStrength": 3,
                "swirlRadius": 0.5,
                "edgeDetectionEnabled": false,
                "edgeThickness": 1,
                "edgeColor": [
                    0,
                    1,
                    0
                ],
                "toonEnabled": false,
                "toonDark": 4,
                "toonLight": 4,
                "vignetteMaskEnabled": false,
                "bloomEnabled": true,
                "bloomStrength": 1,
                "colorEnabled": false,
                "colorShadow": [
                    0,
                    0,
                    0
                ],
                "colorMidtone": [
                    0.5,
                    0.5,
                    0.5
                ],
                "colorHighlight": [
                    1,
                    1,
                    1
                ]
            },
            "activeLayerId": 5,
            "layerCounter": 5,
            "layers": [
                {
                    "id": 1,
                    "name": "Electric",
                    "type": "Electric",
                    "blendMode": "normal",
                    "opacity": 0.68,
                    "polarConversion": false,
                    "invertEnable": false,
                    "visible": true,
                    "typeParams": [
                        6,
                        7,
                        2.1,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0
                    ],
                    "offsetX": 0,
                    "offsetY": 0,
                    "scaleX": 1.08,
                    "scaleY": 1.08,
                    "rotation": 0,
                    "scrollX": 0,
                    "scrollY": 0,
                    "gradEnable": true,
                    "gradStops": [
                        {
                            "position": 0,
                            "color": "#00041d"
                        },
                        {
                            "position": 0.25,
                            "color": "#102b9e"
                        },
                        {
                            "position": 0.52,
                            "color": "#266cff"
                        },
                        {
                            "position": 0.8,
                            "color": "#67e8ff"
                        },
                        {
                            "position": 1,
                            "color": "#ffffff"
                        }
                    ],
                    "solidColorEnabled": false,
                    "solidColor": [
                        1,
                        1,
                        1
                    ]
                },
                {
                    "id": 2,
                    "name": "Lightning",
                    "type": "Lightning",
                    "blendMode": "screen",
                    "opacity": 0.6,
                    "polarConversion": false,
                    "invertEnable": false,
                    "visible": true,
                    "typeParams": [
                        1.35,
                        6,
                        0.7,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0
                    ],
                    "offsetX": 0,
                    "offsetY": 0,
                    "scaleX": 1,
                    "scaleY": 1,
                    "rotation": 0.16,
                    "scrollX": 0,
                    "scrollY": 0,
                    "gradEnable": true,
                    "gradStops": [
                        {
                            "position": 0,
                            "color": "#00041d"
                        },
                        {
                            "position": 0.25,
                            "color": "#102b9e"
                        },
                        {
                            "position": 0.52,
                            "color": "#266cff"
                        },
                        {
                            "position": 0.8,
                            "color": "#67e8ff"
                        },
                        {
                            "position": 1,
                            "color": "#ffffff"
                        }
                    ],
                    "solidColorEnabled": false,
                    "solidColor": [
                        1,
                        1,
                        1
                    ]
                },
                {
                    "id": 3,
                    "name": "Energy",
                    "type": "Energy",
                    "blendMode": "screen",
                    "opacity": 0.34,
                    "polarConversion": false,
                    "invertEnable": false,
                    "visible": true,
                    "typeParams": [
                        1.8,
                        14,
                        0.65,
                        3,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0
                    ],
                    "offsetX": 0,
                    "offsetY": 0,
                    "scaleX": 1,
                    "scaleY": 1,
                    "rotation": 0,
                    "scrollX": 0,
                    "scrollY": 0,
                    "gradEnable": true,
                    "gradStops": [
                        {
                            "position": 0,
                            "color": "#00041d"
                        },
                        {
                            "position": 0.25,
                            "color": "#102b9e"
                        },
                        {
                            "position": 0.52,
                            "color": "#266cff"
                        },
                        {
                            "position": 0.8,
                            "color": "#67e8ff"
                        },
                        {
                            "position": 1,
                            "color": "#ffffff"
                        }
                    ],
                    "solidColorEnabled": false,
                    "solidColor": [
                        1,
                        1,
                        1
                    ]
                },
                {
                    "id": 4,
                    "name": "SparkBurst",
                    "type": "SparkBurst",
                    "blendMode": "add",
                    "opacity": 0.66,
                    "polarConversion": false,
                    "invertEnable": false,
                    "visible": true,
                    "typeParams": [
                        74,
                        1.05,
                        0.22,
                        0.005,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0
                    ],
                    "offsetX": 0,
                    "offsetY": 0,
                    "scaleX": 1,
                    "scaleY": 1,
                    "rotation": 0,
                    "scrollX": 0,
                    "scrollY": 0,
                    "gradEnable": true,
                    "gradStops": [
                        {
                            "position": 0,
                            "color": "#00041d"
                        },
                        {
                            "position": 0.25,
                            "color": "#102b9e"
                        },
                        {
                            "position": 0.52,
                            "color": "#266cff"
                        },
                        {
                            "position": 0.8,
                            "color": "#67e8ff"
                        },
                        {
                            "position": 1,
                            "color": "#ffffff"
                        }
                    ],
                    "solidColorEnabled": false,
                    "solidColor": [
                        1,
                        1,
                        1
                    ]
                },
                {
                    "id": 5,
                    "name": "Burst",
                    "type": "Burst",
                    "blendMode": "add",
                    "opacity": 0.24,
                    "polarConversion": false,
                    "invertEnable": false,
                    "visible": true,
                    "typeParams": [
                        84,
                        11,
                        4.2,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0
                    ],
                    "offsetX": 0,
                    "offsetY": 0,
                    "scaleX": 1,
                    "scaleY": 1,
                    "rotation": 0,
                    "scrollX": 0,
                    "scrollY": 0,
                    "gradEnable": true,
                    "gradStops": [
                        {
                            "position": 0,
                            "color": "#00041d"
                        },
                        {
                            "position": 0.25,
                            "color": "#102b9e"
                        },
                        {
                            "position": 0.52,
                            "color": "#266cff"
                        },
                        {
                            "position": 0.8,
                            "color": "#67e8ff"
                        },
                        {
                            "position": 1,
                            "color": "#ffffff"
                        }
                    ],
                    "solidColorEnabled": false,
                    "solidColor": [
                        1,
                        1,
                        1
                    ]
                }
            ]
        }
    },
    {
        "id": "hologram-shield",
        "name": "Hologram Shield",
        "description": "Holographic hexagonal shield",
        "state": {
            "resolution": 512,
            "time": 0.52,
            "animSpeed": 0.65,
            "animate": false,
            "checkerboard": true,
            "blackBackground": false,
            "gifFps": 30,
            "gifDuration": 2,
            "gifSeamless": true,
            "postEffects": {
                "blurEnabled": false,
                "blurStrength": 1,
                "sharpenEnabled": false,
                "sharpenStrength": 1,
                "pixelationEnabled": false,
                "pixelSize": 10,
                "chromaticAberrationEnabled": false,
                "chromaticAberration": 0.01,
                "vignetteEnabled": true,
                "vignetteStrength": 0.34,
                "vignetteSize": 0.74,
                "vignetteColor": [
                    0,
                    0,
                    0
                ],
                "scanlineEnabled": true,
                "scanlineDensity": 170,
                "scanlineSpeed": 0.35,
                "scanlineStrength": 0.1,
                "scanlineColor": [
                    0,
                    0,
                    0
                ],
                "kaleidoscopeEnabled": false,
                "kaleidoSegments": 6,
                "kaleidoRotation": 0,
                "mirrorTileEnabled": false,
                "mirrorTileX": true,
                "mirrorTileY": true,
                "swirlEnabled": false,
                "swirlStrength": 3,
                "swirlRadius": 0.5,
                "edgeDetectionEnabled": false,
                "edgeThickness": 1,
                "edgeColor": [
                    0,
                    1,
                    0
                ],
                "toonEnabled": false,
                "toonDark": 4,
                "toonLight": 4,
                "vignetteMaskEnabled": false,
                "bloomEnabled": true,
                "bloomStrength": 0.65,
                "colorEnabled": false,
                "colorShadow": [
                    0,
                    0,
                    0
                ],
                "colorMidtone": [
                    0.5,
                    0.5,
                    0.5
                ],
                "colorHighlight": [
                    1,
                    1,
                    1
                ]
            },
            "activeLayerId": 6,
            "layerCounter": 6,
            "layers": [
                {
                    "id": 1,
                    "name": "HexGridRadial",
                    "type": "HexGridRadial",
                    "blendMode": "normal",
                    "opacity": 0.54,
                    "polarConversion": false,
                    "invertEnable": false,
                    "visible": true,
                    "typeParams": [
                        9,
                        0.12,
                        0.08,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0
                    ],
                    "offsetX": 0,
                    "offsetY": 0,
                    "scaleX": 0.94,
                    "scaleY": 0.94,
                    "rotation": 0,
                    "scrollX": 0,
                    "scrollY": 0,
                    "gradEnable": true,
                    "gradStops": [
                        {
                            "position": 0,
                            "color": "#001018"
                        },
                        {
                            "position": 0.25,
                            "color": "#004d60"
                        },
                        {
                            "position": 0.52,
                            "color": "#00b8d4"
                        },
                        {
                            "position": 0.8,
                            "color": "#6affef"
                        },
                        {
                            "position": 1,
                            "color": "#eaffff"
                        }
                    ],
                    "solidColorEnabled": false,
                    "solidColor": [
                        1,
                        1,
                        1
                    ]
                },
                {
                    "id": 2,
                    "name": "EnergyRing",
                    "type": "EnergyRing",
                    "blendMode": "screen",
                    "opacity": 0.78,
                    "polarConversion": false,
                    "invertEnable": false,
                    "visible": true,
                    "typeParams": [
                        0.48,
                        0.035,
                        5,
                        1.8,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0
                    ],
                    "offsetX": 0,
                    "offsetY": 0,
                    "scaleX": 1,
                    "scaleY": 1,
                    "rotation": 0,
                    "scrollX": 0,
                    "scrollY": 0,
                    "gradEnable": true,
                    "gradStops": [
                        {
                            "position": 0,
                            "color": "#001018"
                        },
                        {
                            "position": 0.25,
                            "color": "#004d60"
                        },
                        {
                            "position": 0.52,
                            "color": "#00b8d4"
                        },
                        {
                            "position": 0.8,
                            "color": "#6affef"
                        },
                        {
                            "position": 1,
                            "color": "#eaffff"
                        }
                    ],
                    "solidColorEnabled": false,
                    "solidColor": [
                        1,
                        1,
                        1
                    ]
                },
                {
                    "id": 3,
                    "name": "Pulse",
                    "type": "Pulse",
                    "blendMode": "add",
                    "opacity": 0.46,
                    "polarConversion": false,
                    "invertEnable": false,
                    "visible": true,
                    "typeParams": [
                        0.8,
                        0.035,
                        3,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0
                    ],
                    "offsetX": 0,
                    "offsetY": 0,
                    "scaleX": 1,
                    "scaleY": 1,
                    "rotation": 0,
                    "scrollX": 0,
                    "scrollY": 0,
                    "gradEnable": true,
                    "gradStops": [
                        {
                            "position": 0,
                            "color": "#001018"
                        },
                        {
                            "position": 0.25,
                            "color": "#004d60"
                        },
                        {
                            "position": 0.52,
                            "color": "#00b8d4"
                        },
                        {
                            "position": 0.8,
                            "color": "#6affef"
                        },
                        {
                            "position": 1,
                            "color": "#eaffff"
                        }
                    ],
                    "solidColorEnabled": false,
                    "solidColor": [
                        1,
                        1,
                        1
                    ]
                },
                {
                    "id": 4,
                    "name": "Ring",
                    "type": "Ring",
                    "blendMode": "add",
                    "opacity": 0.76,
                    "polarConversion": false,
                    "invertEnable": false,
                    "visible": true,
                    "typeParams": [
                        0.66,
                        0.016,
                        0.025,
                        2.8,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0
                    ],
                    "offsetX": 0,
                    "offsetY": 0,
                    "scaleX": 1,
                    "scaleY": 1,
                    "rotation": 0,
                    "scrollX": 0,
                    "scrollY": 0,
                    "gradEnable": true,
                    "gradStops": [
                        {
                            "position": 0,
                            "color": "#001018"
                        },
                        {
                            "position": 0.25,
                            "color": "#004d60"
                        },
                        {
                            "position": 0.52,
                            "color": "#00b8d4"
                        },
                        {
                            "position": 0.8,
                            "color": "#6affef"
                        },
                        {
                            "position": 1,
                            "color": "#eaffff"
                        }
                    ],
                    "solidColorEnabled": false,
                    "solidColor": [
                        1,
                        1,
                        1
                    ]
                },
                {
                    "id": 5,
                    "name": "Scanline",
                    "type": "Scanline",
                    "blendMode": "screen",
                    "opacity": 0.12,
                    "polarConversion": false,
                    "invertEnable": false,
                    "visible": true,
                    "typeParams": [
                        160,
                        0.35,
                        0.8,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0
                    ],
                    "offsetX": 0,
                    "offsetY": 0,
                    "scaleX": 1,
                    "scaleY": 1,
                    "rotation": 0,
                    "scrollX": 0,
                    "scrollY": 0,
                    "gradEnable": true,
                    "gradStops": [
                        {
                            "position": 0,
                            "color": "#001018"
                        },
                        {
                            "position": 0.25,
                            "color": "#004d60"
                        },
                        {
                            "position": 0.52,
                            "color": "#00b8d4"
                        },
                        {
                            "position": 0.8,
                            "color": "#6affef"
                        },
                        {
                            "position": 1,
                            "color": "#eaffff"
                        }
                    ],
                    "solidColorEnabled": false,
                    "solidColor": [
                        1,
                        1,
                        1
                    ]
                },
                {
                    "id": 6,
                    "name": "GlitchBlock",
                    "type": "GlitchBlock",
                    "blendMode": "screen",
                    "opacity": 0.1,
                    "polarConversion": false,
                    "invertEnable": false,
                    "visible": true,
                    "typeParams": [
                        22,
                        42,
                        0.6,
                        0.1,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0
                    ],
                    "offsetX": 0,
                    "offsetY": 0,
                    "scaleX": 1,
                    "scaleY": 1,
                    "rotation": 0,
                    "scrollX": 0,
                    "scrollY": 0,
                    "gradEnable": true,
                    "gradStops": [
                        {
                            "position": 0,
                            "color": "#001018"
                        },
                        {
                            "position": 0.25,
                            "color": "#004d60"
                        },
                        {
                            "position": 0.52,
                            "color": "#00b8d4"
                        },
                        {
                            "position": 0.8,
                            "color": "#6affef"
                        },
                        {
                            "position": 1,
                            "color": "#eaffff"
                        }
                    ],
                    "solidColorEnabled": false,
                    "solidColor": [
                        1,
                        1,
                        1
                    ]
                }
            ]
        }
    },
    {
        "id": "aurora-field",
        "name": "Aurora Field",
        "description": "Flowing aurora bands",
        "state": {
            "resolution": 512,
            "time": 0.68,
            "animSpeed": 0.45,
            "animate": false,
            "checkerboard": true,
            "blackBackground": false,
            "gifFps": 30,
            "gifDuration": 2,
            "gifSeamless": true,
            "postEffects": {
                "blurEnabled": false,
                "blurStrength": 1,
                "sharpenEnabled": false,
                "sharpenStrength": 1,
                "pixelationEnabled": false,
                "pixelSize": 10,
                "chromaticAberrationEnabled": false,
                "chromaticAberration": 0.01,
                "vignetteEnabled": true,
                "vignetteStrength": 0.32,
                "vignetteSize": 0.76,
                "vignetteColor": [
                    0,
                    0,
                    0
                ],
                "scanlineEnabled": false,
                "scanlineDensity": 100,
                "scanlineSpeed": 1,
                "scanlineStrength": 0.5,
                "scanlineColor": [
                    0,
                    0,
                    0
                ],
                "kaleidoscopeEnabled": false,
                "kaleidoSegments": 6,
                "kaleidoRotation": 0,
                "mirrorTileEnabled": false,
                "mirrorTileX": true,
                "mirrorTileY": true,
                "swirlEnabled": false,
                "swirlStrength": 3,
                "swirlRadius": 0.5,
                "edgeDetectionEnabled": false,
                "edgeThickness": 1,
                "edgeColor": [
                    0,
                    1,
                    0
                ],
                "toonEnabled": false,
                "toonDark": 4,
                "toonLight": 4,
                "vignetteMaskEnabled": false,
                "bloomEnabled": true,
                "bloomStrength": 0.38,
                "colorEnabled": false,
                "colorShadow": [
                    0,
                    0,
                    0
                ],
                "colorMidtone": [
                    0.5,
                    0.5,
                    0.5
                ],
                "colorHighlight": [
                    1,
                    1,
                    1
                ]
            },
            "activeLayerId": 5,
            "layerCounter": 5,
            "layers": [
                {
                    "id": 1,
                    "name": "Aurora",
                    "type": "Aurora",
                    "blendMode": "normal",
                    "opacity": 0.78,
                    "polarConversion": false,
                    "invertEnable": false,
                    "visible": true,
                    "typeParams": [
                        4,
                        0.52,
                        1.4,
                        0.45,
                        1.6,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0
                    ],
                    "offsetX": 0,
                    "offsetY": 0,
                    "scaleX": 1.08,
                    "scaleY": 1.08,
                    "rotation": 0,
                    "scrollX": 0,
                    "scrollY": 0,
                    "gradEnable": true,
                    "gradStops": [
                        {
                            "position": 0,
                            "color": "#02120d"
                        },
                        {
                            "position": 0.24,
                            "color": "#0a5e42"
                        },
                        {
                            "position": 0.5,
                            "color": "#22d3a6"
                        },
                        {
                            "position": 0.76,
                            "color": "#8b5cf6"
                        },
                        {
                            "position": 1,
                            "color": "#f0d9ff"
                        }
                    ],
                    "solidColorEnabled": false,
                    "solidColor": [
                        1,
                        1,
                        1
                    ]
                },
                {
                    "id": 2,
                    "name": "FbmNoise",
                    "type": "FbmNoise",
                    "blendMode": "screen",
                    "opacity": 0.2,
                    "polarConversion": false,
                    "invertEnable": false,
                    "visible": true,
                    "typeParams": [
                        3.5,
                        6,
                        2.1,
                        0.48,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0
                    ],
                    "offsetX": 0,
                    "offsetY": 0,
                    "scaleX": 1,
                    "scaleY": 1,
                    "rotation": 0,
                    "scrollX": 0,
                    "scrollY": 0,
                    "gradEnable": true,
                    "gradStops": [
                        {
                            "position": 0,
                            "color": "#02120d"
                        },
                        {
                            "position": 0.24,
                            "color": "#0a5e42"
                        },
                        {
                            "position": 0.5,
                            "color": "#22d3a6"
                        },
                        {
                            "position": 0.76,
                            "color": "#8b5cf6"
                        },
                        {
                            "position": 1,
                            "color": "#f0d9ff"
                        }
                    ],
                    "solidColorEnabled": false,
                    "solidColor": [
                        1,
                        1,
                        1
                    ]
                },
                {
                    "id": 3,
                    "name": "FlowLines",
                    "type": "FlowLines",
                    "blendMode": "screen",
                    "opacity": 0.28,
                    "polarConversion": false,
                    "invertEnable": false,
                    "visible": true,
                    "typeParams": [
                        6,
                        18,
                        0.4,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0
                    ],
                    "offsetX": 0,
                    "offsetY": 0,
                    "scaleX": 1,
                    "scaleY": 1,
                    "rotation": -0.12,
                    "scrollX": 0,
                    "scrollY": 0,
                    "gradEnable": true,
                    "gradStops": [
                        {
                            "position": 0,
                            "color": "#02120d"
                        },
                        {
                            "position": 0.24,
                            "color": "#0a5e42"
                        },
                        {
                            "position": 0.5,
                            "color": "#22d3a6"
                        },
                        {
                            "position": 0.76,
                            "color": "#8b5cf6"
                        },
                        {
                            "position": 1,
                            "color": "#f0d9ff"
                        }
                    ],
                    "solidColorEnabled": false,
                    "solidColor": [
                        1,
                        1,
                        1
                    ]
                },
                {
                    "id": 4,
                    "name": "Shimmer",
                    "type": "Shimmer",
                    "blendMode": "add",
                    "opacity": 0.32,
                    "polarConversion": false,
                    "invertEnable": false,
                    "visible": true,
                    "typeParams": [
                        22,
                        0.7,
                        1.2,
                        1.4,
                        0.9,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0
                    ],
                    "offsetX": 0,
                    "offsetY": 0,
                    "scaleX": 1,
                    "scaleY": 1,
                    "rotation": 0,
                    "scrollX": 0,
                    "scrollY": 0,
                    "gradEnable": true,
                    "gradStops": [
                        {
                            "position": 0,
                            "color": "#02120d"
                        },
                        {
                            "position": 0.24,
                            "color": "#0a5e42"
                        },
                        {
                            "position": 0.5,
                            "color": "#22d3a6"
                        },
                        {
                            "position": 0.76,
                            "color": "#8b5cf6"
                        },
                        {
                            "position": 1,
                            "color": "#f0d9ff"
                        }
                    ],
                    "solidColorEnabled": false,
                    "solidColor": [
                        1,
                        1,
                        1
                    ]
                },
                {
                    "id": 5,
                    "name": "Smoke",
                    "type": "Smoke",
                    "blendMode": "screen",
                    "opacity": 0.1,
                    "polarConversion": false,
                    "invertEnable": false,
                    "visible": true,
                    "typeParams": [
                        4,
                        1.7,
                        0.08,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0
                    ],
                    "offsetX": 0,
                    "offsetY": 0,
                    "scaleX": 1.2,
                    "scaleY": 1.2,
                    "rotation": 0,
                    "scrollX": 0,
                    "scrollY": 0,
                    "gradEnable": true,
                    "gradStops": [
                        {
                            "position": 0,
                            "color": "#02120d"
                        },
                        {
                            "position": 0.24,
                            "color": "#0a5e42"
                        },
                        {
                            "position": 0.5,
                            "color": "#22d3a6"
                        },
                        {
                            "position": 0.76,
                            "color": "#8b5cf6"
                        },
                        {
                            "position": 1,
                            "color": "#f0d9ff"
                        }
                    ],
                    "solidColorEnabled": false,
                    "solidColor": [
                        1,
                        1,
                        1
                    ]
                }
            ]
        }
    }
];
