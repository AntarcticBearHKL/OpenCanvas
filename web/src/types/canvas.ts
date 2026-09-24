export type Position = {
    x: number;
    y: number;
};

export type CanvasWorkspace = "canvas" | "image" | "audio";

export const CANVAS_WORKSPACES: CanvasWorkspace[] = ["canvas", "image", "audio"];

export type ViewportTransform = {
    x: number;
    y: number;
    k: number;
};

export enum CanvasNodeType {
    Image = "image",
    Text = "text",
    Prompt = "prompt",
    MusicPrompt = "music-prompt",
    SpeechPrompt = "speech-prompt",
    VideoPrompt = "video-prompt",
    Config = "config",
    ImageGeneration = "image-generation",
    SpeechGeneration = "speech-generation",
    MusicGeneration = "music-generation",
    VideoGeneration = "video-generation",
    Video = "video",
    Audio = "audio",
    AudioProject = "audio-project",
    SmartCanvas = "smart-canvas",
    Assets = "assets",
    Recording = "recording",
    ImageModifier = "image-modifier",
}

// Node types are open strings: built-ins use CanvasNodeType and plugins use "<pluginId>:<name>".
export type CanvasNodeTypeId = CanvasNodeType | (string & {});

type CanvasNodeStatus = "idle" | "success" | "loading" | "error";
export type CanvasGenerationMode = "text" | "image" | "video" | "audio";
export type CanvasImageGenerationType = "generation" | "edit";

export type CanvasNodeImage = {
    id: string;
    status: CanvasNodeStatus;
    errorDetails?: string;
    content: string;
    storageKey?: string;
    thumbnail?: string;
    thumbnailKey?: string;
    naturalWidth: number;
    naturalHeight: number;
    bytes: number;
    mimeType: string;
};

export type CanvasNodeText = {
    id: string;
    status: CanvasNodeStatus;
    errorDetails?: string;
    content: string;
};

export type CanvasImageModifierParams = {
    brightness: number;
    contrast: number;
    saturate: number;
    hueRotate: number;
    blur: number;
    grayscale: number;
    sepia: number;
    invert: number;
    opacity: number;
    blackPoint: number;
    whitePoint: number;
    gamma: number;
    exposure: number;
    highlights: number;
    shadows: number;
};

export type CanvasImageModifierParamKey = keyof CanvasImageModifierParams;

export type CanvasImageModifierCurvePoint = { x: number; y: number };

export type CanvasVideoMode = "frames" | "reference";

export type CanvasVideoSlot = "firstFrame" | "lastFrame" | "reference";

/** Bound media node ids for the video prompt drop slots; never copied payloads. */
export type CanvasVideoSlots = {
    firstFrame?: string;
    lastFrame?: string;
    references?: string[];
};

export type CanvasImageModifierSource = {
    content: string;
    storageKey?: string;
    thumbnail?: string;
    thumbnailKey?: string;
    naturalWidth?: number;
    naturalHeight?: number;
    bytes?: number;
    mimeType?: string;
};

export type CanvasAssetSource = "folder" | "cache";

export type CanvasPsLayerKind = "image" | "text" | "group" | "pixel" | "shape" | "adjustment";

export type CanvasPsShapeKind = "rectangle" | "rounded-rectangle" | "ellipse" | "polygon" | "line";

/** Non-destructive adjustment layer types, one per entry of the Adjustments panel. */
export type CanvasPsAdjustmentType = "brightness-contrast" | "levels" | "curves" | "exposure" | "vibrance" | "hue-saturation" | "color-balance" | "black-white" | "photo-filter" | "channel-mixer" | "gradient-map" | "invert" | "posterize" | "threshold" | "selective-color";

export type CanvasPsLayerStyleType = "stroke" | "drop-shadow" | "inner-shadow" | "outer-glow" | "inner-glow" | "bevel" | "satin" | "color-overlay" | "gradient-overlay" | "pattern-overlay";

export type CanvasPsParamValue = number | string | number[] | string[];

/** Free-transform geometry, normalized to the layer box: (0,0) is its top-left and (1,1) its bottom-right, so move/scale/rotate keep working on a transformed layer. */
export type CanvasPsTransform = {
    quad: { x: number; y: number }[]; // top-left, top-right, bottom-right, bottom-left.
    warp?: { x: number; y: number }[]; // optional 4x4 control mesh, row-major, 16 points; takes precedence over the quad.
};

export type CanvasPsTextCase = "none" | "upper" | "lower" | "small-caps";

export type CanvasPsTextAlign = "left" | "center" | "right" | "justify";

export type CanvasPsTextWarpStyle = "arc" | "arc-lower" | "arc-upper" | "flag" | "wave" | "fish" | "rise" | "bulge" | "shell" | "squeeze";

/** Text warp, Photoshop's Warp Text: one style plus bend and the two distortion axes, all in -100..100. */
export type CanvasPsTextWarp = { style: CanvasPsTextWarpStyle; bend: number; horizontal: number; vertical: number };

export type CanvasPsTextParagraph = {
    align: CanvasPsTextAlign;
    indentLeft: number;
    indentRight: number;
    indentFirst: number;
    spaceBefore: number;
    spaceAfter: number;
    hyphenate: boolean;
};

/** Path anchor; the two handles are offsets from the anchor, so the anchor can be moved on its own. */
export type CanvasPsPathAnchor = { x: number; y: number; handleIn: { x: number; y: number }; handleOut: { x: number; y: number } };

/** Vector path in board coordinates, stored with the board document (metadata), not with the layers. */
export type CanvasPsPath = { id: string; name: string; anchors: CanvasPsPathAnchor[]; closed: boolean; visible: boolean };

/** Saved selection channel; the bitmap lives in the image store behind an `image:` key so the cleanup sweep keeps it alive. */
export type CanvasPsAlphaChannel = { id: string; name: string; storageKey: string };

/** Layer style entry; `params` keys and ranges are defined with the renderer so preview and export share one implementation. */
export type CanvasPsLayerStyle = {
    id: string;
    type: CanvasPsLayerStyleType;
    enabled: boolean;
    params: Record<string, CanvasPsParamValue>;
};

/** Smart Canvas layer document entry; geometry is board-local, an image layer's bitmap comes from sourceNodeId and a pixel layer's own bitmap from storageKey. */
export type CanvasPsLayer = {
    id: string;
    name: string;
    kind: CanvasPsLayerKind;
    sourceNodeId?: string;
    storageKey?: string; // pixel layers: own bitmap in the image store, sized to the layer box; also kept alive by the image cleanup sweep.
    maskStorageKey?: string; // optional per-layer mask in the image store: white shows, transparent hides; used only by the compositor, never written into images.
    adjustment?: CanvasPsAdjustmentType; // adjustment layers: which non-destructive adjustment is applied to the layers below it in the same container.
    adjustmentParams?: Record<string, CanvasPsParamValue>; // adjustment layers: parameters for the chosen adjustment type.
    styles?: CanvasPsLayerStyle[]; // optional layer styles (fx); rendered by the shared raster compositor so preview and export always agree.
    text?: string;
    shape?: CanvasPsShapeKind; // shape layers: geometry drawn as SVG in the preview and Path2D in the composite.
    shapeRadius?: number; // rounded-md rectangle corner radius, layer-local units.
    shapeSides?: number; // polygon side count, 3..24.
    shapeFill?: string;
    shapeStroke?: string;
    shapeStrokeWidth?: number;
    x: number;
    y: number;
    width: number;
    height: number;
    rotation: number;
    opacity: number;
    blendMode: string;
    hidden: boolean;
    locked: boolean;
    fontSize?: number;
    color?: string;
    fontFamily?: string; // text layers: CSS font family used by the shared renderer, default sans-serif.
    tracking?: number; // text layers: extra advance per glyph in 1/1000 em.
    leading?: number; // text layers: baseline distance in px; 0 falls back to 1.2 × font size.
    kerning?: number; // text layers: extra px between glyph pairs.
    baselineShift?: number; // text layers: vertical glyph offset in px.
    textScaleX?: number; // text layers: horizontal glyph scale in percent.
    textScaleY?: number; // text layers: vertical glyph scale in percent.
    fauxBold?: boolean;
    fauxItalic?: boolean;
    underline?: boolean;
    strikethrough?: boolean;
    textCase?: CanvasPsTextCase;
    paragraph?: CanvasPsTextParagraph;
    textPathId?: string; // text layers: id of a board path the glyphs follow.
    textWarp?: CanvasPsTextWarp;
    transform?: CanvasPsTransform; // free transform (skew / distort / perspective / warp) rendered by the shared raster renderer.
    children?: string[]; // group layers: ids of image/text layers inside this group, same array, single level only.
};

/** Audio fade shape; all three are stored, v1 renders linear. */
export type CanvasAudioFadeShape = "linear" | "exponential" | "sCurve";

/** Audio timeline snap grid; the effective step is derived from tempo + meter. */
export type CanvasAudioSnap = "off" | "bar" | "beat" | "1/2" | "1/4" | "1/8" | "1/16";

/** Audio timeline cue point; time is seconds. */
export type CanvasAudioMarker = { id: string; time: number; name?: string; color?: string };

/** Audio track role; `master` is the single output sink, `group` sums its inputs, `return` is fed only by sends, and `instrument`/`midi` host MIDI regions. */
export type CanvasAudioTrackType = "audio" | "instrument" | "midi" | "group" | "return" | "master";

/** Built-in instrument of an instrument/MIDI track; only `synth` is implemented, `sampler` is reserved for a later stage. */
export type CanvasAudioInstrument = { kind: "synth" | "sampler"; preset?: string; soundFontKey?: string };

/** Aux send; `pre` taps before the fader (both taps sit inside the track's mute/solo gate). */
export type CanvasAudioSend = {
    id: string;
    targetTrackId: string;
    gain: number; // linear
    pre: boolean;
    enabled: boolean;
};

/** Audio compositor track; gain is linear over the fader scale 0..+6 dB (the UI shows dB), solo wins over mute. */
export type CanvasAudioTrack = {
    id: string;
    name: string;
    type?: CanvasAudioTrackType; // defaults to "audio"
    gain: number;
    pan?: number; // -1..1, defaults to 0
    mute: boolean;
    solo: boolean;
    output?: string; // target track id; unset means the master track
    sends?: CanvasAudioSend[];
    color?: string;
    armed?: boolean; // Record-arm state only; recording itself is not implemented yet.
    collapsed?: boolean; // Fold this track's automation lanes in the arrangement.
    instrument?: CanvasAudioInstrument; // Instrument/MIDI tracks: the built-in synth; unset means the default preset.
};

/** Audio compositor clip; times are seconds and sourceNodeId references an AUDIO node, never a copied payload. */
export type CanvasAudioClip = {
    id: string;
    trackId: string;
    sourceNodeId: string;
    start: number; // timeline position (s)
    offset: number; // source in-point (s)
    duration: number; // visible length (s)
    name?: string;
    gain?: number; // linear clip gain, defaults to 1
    fadeIn?: number; // seconds, clamped to duration
    fadeOut?: number;
    fadeInShape?: CanvasAudioFadeShape;
    fadeOutShape?: CanvasAudioFadeShape;
    loop?: boolean; // repeat the source window to fill duration
    reversed?: boolean;
    muted?: boolean;
    color?: string;
    locked?: boolean; // no move/trim, still selectable
};

/** Recording input: `punch` gates a take to the enabled punch range, `channels` is the take's channel count (1 downmixes), and `inputLatencyMs` shifts the take earlier by the input latency. */
export type CanvasAudioCapture = {
    mode: "normal" | "punch";
    channels: number; // 1 = mono (downmixes the input), 2 = stereo
    gainDb: number; // capture gain applied before recording and monitoring
    inputLatencyMs: number; // 0 by default; auditable, never a sentinel
};

/** One MIDI note; `tick` is relative to the region start and `velocity` is 0..1. */
export type CanvasAudioNote = { id: string; tick: number; durationTicks: number; pitch: number; velocity: number };

/** MIDI region on an instrument/MIDI track; positions are PPQN ticks so the notes follow the project tempo. */
export type CanvasAudioMidiRegion = {
    id: string;
    trackId: string;
    startTicks: number;
    durationTicks: number;
    notes: CanvasAudioNote[];
    name?: string;
};

/** Audio automation interpolation; `sCurve` is stored and rendered, the graph approximates it with a few linear ramps. */
export type CanvasAudioAutomationCurve = "linear" | "hold" | "sCurve";

/** Audio automation breakpoint; time is seconds and `curve` shapes the segment that leaves this point (default linear). */
export type CanvasAudioAutomationPoint = { time: number; value: number; curve?: CanvasAudioAutomationCurve };

/**
 * Audio automation lane; `target` is "track.gain" | "track.pan" | "send.<sendId>.gain" and values are the target's own
 * unit (linear gain, pan -1..1). An enabled lane with points owns its parameter: the graph builder schedules it and the
 * mixer's manual edits skip it.
 */
export type CanvasAudioAutomationLane = {
    id: string;
    trackId: string;
    target: string;
    enabled: boolean;
    points: CanvasAudioAutomationPoint[]; // sorted by time
};

export type CanvasNodeMetadata = {
    content?: string;
    composerContent?: string;
    prompt?: string;
    status?: CanvasNodeStatus;
    errorDetails?: string;
    fontSize?: number;
    lineHeight?: number;
    fontFamily?: string;
    fontWeight?: "normal" | "bold";
    italic?: boolean;
    textAlign?: "left" | "center" | "right";
    textColor?: string;
    generationMode?: CanvasGenerationMode;
    generationType?: CanvasImageGenerationType;
    model?: string;
    reasoningEffort?: "auto" | "low" | "medium" | "high" | "xhigh";
    size?: string;
    quality?: string;
    background?: string;
    count?: number;
    textCount?: number;
    texts?: CanvasNodeText[];
    primaryTextId?: string;
    seconds?: string;
    vquality?: string;
    generateAudio?: string;
    watermark?: string;
    videoMode?: CanvasVideoMode; // Video prompt mode; defaults to "frames".
    videoSlots?: CanvasVideoSlots; // Video prompt slots; bound IMAGE / VIDEO / AUDIO node ids.
    audioVoice?: string;
    audioFormat?: string;
    audioSpeed?: string;
    audioInstructions?: string;
    references?: string[];
    naturalWidth?: number;
    naturalHeight?: number;
    freeResize?: boolean;
    images?: CanvasNodeImage[];
    primaryImageId?: string;
    storageKey?: string;
    thumbnail?: string;
    thumbnailKey?: string;
    mimeType?: string;
    bytes?: number;
    durationMs?: number;
    videoTaskId?: string;
    videoTaskProvider?: "openai" | "plugin" | "openrouter";
    boardRatio?: string; // Smart Canvas board aspect ratio, e.g. "16:9"; defaults to "16:9".
    boardResolution?: "1k" | "2k" | "4k"; // Smart Canvas composite resolution tier; defaults to "2k".
    boardBackground?: string; // Smart Canvas board background colour as a CSS colour string; defaults to "transparent".
    boardBackgroundOpacity?: number; // Smart Canvas board background opacity in 0..1; defaults to 1.
    boardLayers?: CanvasPsLayer[]; // Self-contained board layer document; array order is z-order (index 0 = bottom) and geometry is board-local.
    boardPaths?: CanvasPsPath[]; // Board vector paths; document data, so they save and export with the board.
    boardAlphaChannels?: CanvasPsAlphaChannel[]; // Board alpha channels saved from selections; document data with `image:`-keyed bitmaps.
    boardChannelVisibility?: { r: boolean; g: boolean; b: boolean }; // Per-channel visibility; hiding a channel drops it from the composite in the shared renderer.
    blendMode?: string;
    opacity?: number;
    interactive?: boolean; // Plugin node interaction/move state; see CanvasNodeDefinition.interactionToggle.
    locked?: boolean;
    hidden?: boolean;
    modifierSource?: CanvasImageModifierSource;
    modifierParams?: CanvasImageModifierParams;
    modifierCurve?: CanvasImageModifierCurvePoint[];
    modifierEmit?: boolean;
    modifierError?: string;
    assetSource?: CanvasAssetSource; // Assets node source mode; defaults to "folder".
    audioTracks?: CanvasAudioTrack[]; // Audio compositor lanes; a new AUDIO PROJECT node starts with one empty track.
    audioClips?: CanvasAudioClip[]; // Audio compositor clips; each clip references an AUDIO node instead of copying its payload.
    audioMasterGain?: number; // Audio compositor master gain, linear 0..1; defaults to 1.
    audioTempo?: number; // Audio timeline BPM; defaults to 120.
    audioTimeSignature?: { numerator: number; denominator: number }; // Audio timeline meter; defaults to 4/4.
    audioGrid?: { enabled: boolean; snap: CanvasAudioSnap }; // Audio grid + snap; defaults to on + beat.
    audioCycle?: { enabled: boolean; start: number; end: number }; // Audio cycle region in seconds.
    audioPunch?: { enabled: boolean; in: number; out: number }; // Punch range in seconds; recording itself is not implemented yet.
    audioMarkers?: CanvasAudioMarker[]; // Audio timeline cue points.
    audioMetronome?: { enabled: boolean; volumeDb: number }; // Metronome state; the click itself is not implemented yet.
    audioAutomation?: CanvasAudioAutomationLane[]; // Audio parameter automation lanes; an enabled lane with points owns its parameter.
    audioMidiRegions?: CanvasAudioMidiRegion[]; // MIDI regions on instrument/MIDI tracks; positions are PPQN ticks.
    audioPpqn?: number; // Ticks per quarter note for MIDI regions; defaults to 960.
    audioCapture?: CanvasAudioCapture; // Recording input settings; defaults to normal mode, stereo, 0 dB, no latency.
    audioCountIn?: number; // Record count-in in bars (0 = off); defaults to 0.
};

export type CanvasNodeData = {
    id: string;
    type: CanvasNodeTypeId;
    title: string;
    position: Position;
    width: number;
    height: number;
    metadata?: CanvasNodeMetadata;
};

export type CanvasConnection = {
    id: string;
    fromNodeId: string;
    toNodeId: string;
    relation?: string; // Relationship label key under canvas.relations; when unset the label is derived from the node types.
};

export type CanvasAssistantImage = {
    id: string;
    dataUrl: string;
    storageKey?: string;
    prompt: string;
};

export type ConnectionHandle = {
    nodeId: string;
    handleType: "source" | "target";
};

export type SelectionBox = {
    startWorldX: number;
    startWorldY: number;
    currentWorldX: number;
    currentWorldY: number;
    additive: boolean;
    initialSelectedNodeIds: string[];
};
