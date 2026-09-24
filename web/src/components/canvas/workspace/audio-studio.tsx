import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode, type SetStateAction } from "react";
import { App, ConfigProvider, Dropdown, InputNumber, Modal, Popover, Segmented, Select, Switch } from "antd";
import { ArrowLeft, AudioLines, AudioWaveform, ChevronDown, ChevronRight, Circle, CircleStop, Ellipsis, Eraser, Flag, Hand, History, Library, Link, Link2, Lock, Magnet, MousePointer2, Music2, PanelRight, Pause, Pencil, Play, Plus, Repeat, Scissors, Search, Settings2, SkipBack, SlidersHorizontal, SlidersVertical, SquareDashed, Timer, Trash2, X, ZoomIn, ZoomOut } from "lucide-react";
import { nanoid } from "nanoid";
import { useTranslation } from "react-i18next";
import * as Tone from "tone";

import { type DockPanelDef } from "@/components/canvas/dock/dock-layout";
import { DockArea, useDockLayout } from "@/components/canvas/dock/dock-panel";
import { DockWindowMenu } from "@/components/canvas/dock/dock-window-menu";
import { AudioAutomationLane, AudioAutomationPanel, AUTOMATION_LANE_HEIGHT, AUTOMATION_PLOT_HEIGHT } from "@/components/canvas/workspace/audio-automation-lane";
import { AudioClipContextMenu, AudioLaneContextMenu, AudioMenus, AudioMidiRegionContextMenu, AudioRulerContextMenu, AudioTrackContextMenu, audioCompactMenuItems, audioOptionItems, AUDIO_MENU_BUTTON_CLASS, AUDIO_MENU_POPUP, prefixMenuKeys, type AudioAutomationCommand, type AudioClipCommand, type AudioEditCommand, type AudioLaneCommand, type AudioMidiRegionCommand, type AudioOptionCommand, type AudioTrackCommand, type AudioViewCommand } from "@/components/canvas/workspace/audio-menus";
import AudioMixer from "@/components/canvas/workspace/audio-mixer";
import { AudioInspectorPanel, AudioMediaPoolPanel, AudioMeter, AudioProjectSettingsPanel, AudioToggle, AudioValueInput, AUDIO_FADE_SHAPE_LABEL_KEYS, AUDIO_FADE_SHAPE_OPTIONS, AUDIO_METER_OPTIONS, AUDIO_SNAP_LABEL_KEYS, AUDIO_SNAP_OPTIONS, AUDIO_TRACK_TYPE_LABEL_KEYS } from "@/components/canvas/workspace/audio-panels";
import AudioPianoRoll from "@/components/canvas/workspace/audio-piano-roll";
import PsColorPicker from "@/components/canvas/workspace/ps-color-picker";
import { ImageSettingsTheme } from "@/components/image-settings-panel";
import { useCanvasTheme } from "@/hooks/use-canvas-theme";
import { AUDIO_AUTOMATION_GAIN, AUDIO_AUTOMATION_PAN, audioAutomationSendTarget, automationLanesForTrack, automationOwns, automationValueRange, createAudioAutomationLane, findAutomationLane, pruneAutomation } from "@/lib/canvas/audio-automation";
import { applyOverlap, AUDIO_MIN_CLIP_SECONDS, clipEnd, clipsIntersecting, crossfadeClip, duplicateClip, glueClip, moveClip, moveClipsToTrack, patchClip, setClipFade, shiftClips, splitClip, trimClipIn, trimClipOut } from "@/lib/canvas/audio-clip-ops";
import { applyAudioGraphMix, applyLiveTrackMix, buildAudioGraph, connectAudioGraphMonitor, liveAutomationValue, loadAudioGraphBuffers, type AudioGraph } from "@/lib/canvas/audio-graph";
import { AUDIO_DEFAULT_PPQN, audioTrackRegions, barTicks, beatTicks, createAudioMidiRegion, duplicateRegion, moveRegion, nextMidiRegionStart, secondsToTicks, splitRegionAt, ticksToSeconds, trimRegionEnd, trimRegionStart } from "@/lib/canvas/audio-midi";
import { AUDIO_DEFAULT_CAPTURE, AUDIO_DEFAULT_CYCLE, AUDIO_DEFAULT_GRID, AUDIO_DEFAULT_METER, AUDIO_DEFAULT_METRONOME, AUDIO_DEFAULT_PUNCH, AUDIO_DEFAULT_TEMPO, AUDIO_FADER_MAX_DB, AUDIO_FADER_MIN_DB, audioProjectAutomation, audioProjectCapture, audioProjectClips, audioProjectCountIn, audioProjectCycle, audioProjectDuration, audioProjectGrid, audioProjectMarkers, audioProjectMasterGain, audioProjectMetronome, audioProjectMidiRegions, audioProjectPpqn, audioProjectPunch, audioProjectTempo, audioProjectTimeSignature, audioProjectTracks, audioTrackClips, audioTrackType, canHostClips, canHostMidi, clampClipGain, clampGain, computeAudibility, createAudioMarker, createAudioTrack, faderDbGain, formatFaderDb, gainFaderDb, nextClipStart, parseDbValue, parseGainPercent, resolveAudioClipUrls, resolveAudioNodeDuration } from "@/lib/canvas/audio-project";
import { cutRecordedTake, startAudioRecording, type AudioRecordSession } from "@/lib/canvas/audio-record";
import { AUDIO_DEFAULT_PX_PER_SECOND, barSeconds, beatSeconds, chooseGridStep, chooseSnapStep, clampPxPerSecond, formatBarsBeats, secondsToPosition, snapSeconds } from "@/lib/canvas/audio-timeline";
import { formatAudioTime, getCachedAudioPeaks, loadAudioPeaks, peakBucketIndex, selectPeakBand, type AudioPeaks } from "@/lib/canvas/audio-waveform";
import { type CanvasTheme } from "@/lib/canvas-theme";
import { STUDIO_BAR_CLASS, STUDIO_DIVIDER_CLASS, STUDIO_ICON_BUTTON_CLASS, STUDIO_LIST_ROW_CLASS, STUDIO_OPTIONS_CLASS, STUDIO_TOOL_BUTTON_CLASS } from "@/components/canvas/workspace/studio-chrome";
import {
    CanvasNodeType,
    type CanvasAudioAutomationLane,
    type CanvasAudioAutomationPoint,
    type CanvasAudioClip,
    type CanvasAudioFadeShape,
    type CanvasAudioMarker,
    type CanvasAudioMidiRegion,
    type CanvasAudioNote,
    type CanvasAudioSnap,
    type CanvasAudioTrack,
    type CanvasAudioTrackType,
    type CanvasNodeData,
    type CanvasNodeMetadata,
} from "@/types/canvas";

type AudioTake = { trackId: string; start: number; duration: number; name: string };
type AudioRecordTake = { session: AudioRecordSession; trackId: string; clipStart: number; from: number; until: number | null; punchOut: number | null; count: number; disconnect: () => void };

type AudioStudioProps = {
    project: CanvasNodeData | null;
    projects: CanvasNodeData[];
    nodes: CanvasNodeData[];
    setNodes: Dispatch<SetStateAction<CanvasNodeData[]>>;
    onSelectProject: (nodeId: string) => void;
    onOutput: (project: CanvasNodeData) => Promise<void>;
    onExportStems: (project: CanvasNodeData) => Promise<void>;
    onRecorded: (project: CanvasNodeData, blob: Blob, take: AudioTake) => Promise<void>;
    onBack: () => void;
};

type AudioTool = "select" | "range" | "split" | "draw" | "erase" | "glue" | "hand" | "zoom";
type AudioView = "arrangement" | "mixer" | "roll";
type AudioClipGestureMode = "move" | "trim-in" | "trim-out" | "fade-in" | "fade-out" | "loop";
type AudioClipGesture = {
    pointerId: number;
    mode: AudioClipGestureMode;
    clipId: string;
    sourceId: string;
    trackId: string;
    element: HTMLElement;
    preview: HTMLElement;
    ghost: HTMLElement | null;
    startClips: CanvasAudioClip[];
    startClientX: number;
    startClientY: number;
    startStart: number;
    startDuration: number;
    moved: boolean;
    next: CanvasAudioClip[] | null;
};
type AudioRegionGestureMode = "move" | "trim-in" | "trim-out";
type AudioRegionGesture = {
    pointerId: number;
    mode: AudioRegionGestureMode;
    regionId: string;
    trackId: string;
    element: HTMLElement;
    startRegions: CanvasAudioMidiRegion[];
    startClientX: number;
    startClientY: number;
    startStartTicks: number;
    startDurationTicks: number;
    moved: boolean;
    next: CanvasAudioMidiRegion[] | null;
};
type AudioBand = { kind: "marquee" | "range" | "zoom"; x0: number; y0: number; x1: number; y1: number };
type AudioBandGesture = { pointerId: number; kind: AudioBand["kind"]; x0: number; y0: number; x1: number; y1: number };
type DragPreview = { transform?: string; left?: number; width?: number; fade?: { edge: "in" | "out"; width: number } };

const TRACK_WIDTH = 200;
const NARROW_TRACK_WIDTH = 88;
/** Track row height, derived from the header it must contain: 6px padding + 24px name row + 4px gap + 28px control row + 6px padding. */
const LANE_HEIGHT = 68;
const RULER_HEIGHT = 26;
const LANE_OVERSCAN_PX = 320;
const MIN_CLIP_WIDTH = 14;
const MIN_TIMELINE_SECONDS = 20;
const EDGE_HIT_PX = 6;
const FADE_HIT_PX = 8;
const DRAG_THRESHOLD_PX = 3;
const ZOOM_STEP = 1.25;
const GRID_LABEL_MIN_PX = 80;
const GRID_LABEL_MAX = 800;
const DEFAULT_FADE_SECONDS = 0.5;
const RECORD_LEAD_SECONDS = 0.08;
const COMPACT_QUERY = "(max-width: 767px)";
const OVERLAY_DOCK_QUERY = "(min-width: 768px) and (max-width: 1023px)";
const FLAT_ACTION_CLASS = STUDIO_ICON_BUTTON_CLASS;
// One control height for the transport and options rows: 28px, the icon-button size (size-7) and the content box of STUDIO_OPTIONS_CLASS (min-h-9 minus py-1).
const CONTROL_CLASS = "!h-7";
const CONTROL_GROUP_CLASS = "flex h-7 shrink-0 items-center gap-1.5";
const COMPACT_ACTION_CLASS = "grid size-6 shrink-0 place-items-center rounded-md transition hover:bg-hover hover:opacity-100 hover:bg-hover";
const TOOL_CLASS = STUDIO_TOOL_BUTTON_CLASS;
const LIST_ACTION_CLASS = STUDIO_LIST_ROW_CLASS;
const FOCUS_RING_CLASS = "[&_*:focus-visible]:[outline:1px_solid_var(--audio-focus)] [&_*:focus-visible]:outline-offset-1";
const EMPTY_TRACKS: CanvasAudioTrack[] = [];
const EMPTY_CLIPS: CanvasAudioClip[] = [];
const EMPTY_MIDI: CanvasAudioMidiRegion[] = [];
const EMPTY_MARKERS: CanvasAudioMarker[] = [];
const EMPTY_AUTOMATION: CanvasAudioAutomationLane[] = [];
const TOOLS: { id: AudioTool; icon: typeof MousePointer2; labelKey: string; hotkey: string }[] = [
    { id: "select", icon: MousePointer2, labelKey: "canvas.audioStudio.toolSelect", hotkey: "V" },
    { id: "range", icon: SquareDashed, labelKey: "canvas.audioStudio.toolRange", hotkey: "R" },
    { id: "split", icon: Scissors, labelKey: "canvas.audioStudio.toolSplit", hotkey: "C" },
    { id: "draw", icon: Pencil, labelKey: "canvas.audioStudio.toolDraw", hotkey: "D" },
    { id: "erase", icon: Eraser, labelKey: "canvas.audioStudio.toolErase", hotkey: "E" },
    { id: "glue", icon: Link, labelKey: "canvas.audioStudio.toolGlue", hotkey: "G" },
    { id: "hand", icon: Hand, labelKey: "canvas.audioStudio.toolHand", hotkey: "H" },
    { id: "zoom", icon: Search, labelKey: "canvas.audioStudio.toolZoom", hotkey: "Z" },
];
const TOOL_LABELS = Object.fromEntries(TOOLS.map((item) => [item.id, item.labelKey])) as Record<AudioTool, string>;
const TOOL_HOTKEYS: Record<string, AudioTool> = { v: "select", r: "range", c: "split", d: "draw", e: "erase", g: "glue", h: "hand", z: "zoom" };
const HINTS: Record<AudioTool, string> = {
    select: "canvas.audioStudio.hintSelect",
    range: "canvas.audioStudio.hintRange",
    split: "canvas.audioStudio.hintSplit",
    draw: "canvas.audioStudio.hintDraw",
    erase: "canvas.audioStudio.hintErase",
    glue: "canvas.audioStudio.hintGlue",
    hand: "canvas.audioStudio.hintHand",
    zoom: "canvas.audioStudio.hintZoom",
};
const FADE_SHAPE_LABEL_KEYS = AUDIO_FADE_SHAPE_LABEL_KEYS;
const AUDIO_DOCK_PANELS: DockPanelDef[] = [
    { id: "inspector", labelKey: "canvas.audioStudio.dockInspector", icon: SlidersHorizontal, dock: "right" },
    { id: "automation", labelKey: "canvas.audioStudio.dockAutomation", icon: SlidersVertical, dock: "right" },
    { id: "history", labelKey: "canvas.audioStudio.dockHistory", icon: History, dock: "right" },
    { id: "media", labelKey: "canvas.audioStudio.assetMedia", icon: Library, dock: "left" },
    { id: "markers", labelKey: "canvas.audioStudio.assetMarkers", icon: Flag, dock: "left" },
    { id: "projectSettings", labelKey: "canvas.audioStudio.projectSettings", icon: Settings2, dock: "left" },
];

/** Preview of an in-flight drag, written straight to the dragged element so a gesture never re-renders the studio. */
function paintDragPreview(element: HTMLElement, preview: DragPreview) {
    if (preview.transform !== undefined) element.style.transform = preview.transform;
    if (preview.left !== undefined) element.style.left = `${preview.left}px`;
    if (preview.width !== undefined) element.style.width = `${preview.width}px`;
    if (!preview.fade) return;
    const span = element.querySelector<HTMLElement>(`[data-clip-fade="${preview.fade.edge}"]`);
    if (span) span.style.width = `${preview.fade.width}px`;
}

/** Settles a released or aborted gesture: React's style diff skips unchanged keys, so the element is written back explicitly. */
function paintClipGeometry(element: HTMLElement, clip: CanvasAudioClip, pxPerSecond: number) {
    paintDragPreview(element, { transform: "", left: clip.start * pxPerSecond, width: Math.max(MIN_CLIP_WIDTH, clip.duration * pxPerSecond) });
    paintDragPreview(element, { fade: { edge: "in", width: Math.min(clip.fadeIn ?? 0, clip.duration) * pxPerSecond } });
    paintDragPreview(element, { fade: { edge: "out", width: Math.min(clip.fadeOut ?? 0, clip.duration) * pxPerSecond } });
}

function paintRegionGeometry(element: HTMLElement, region: CanvasAudioMidiRegion, ppqn: number, tempo: number, pxPerSecond: number) {
    paintDragPreview(element, {
        transform: "",
        left: ticksToSeconds(region.startTicks, ppqn, tempo) * pxPerSecond,
        width: Math.max(MIN_CLIP_WIDTH, ticksToSeconds(region.durationTicks, ppqn, tempo) * pxPerSecond),
    });
}

export default function AudioStudio({ project, projects, nodes, setNodes, onSelectProject, onOutput, onExportStems, onRecorded, onBack }: AudioStudioProps) {
    const { t } = useTranslation();
    const { message } = App.useApp();
    const theme = useCanvasTheme();
    const projectId = project?.id || "";
    useEffect(() => {
        if (!project && projects.length) onSelectProject(projects[0].id);
    }, [onSelectProject, project, projects]);
    const tracks = useMemo(() => (project ? audioProjectTracks(project) : EMPTY_TRACKS), [project]);
    const projectClips = useMemo(() => (project ? audioProjectClips(project) : EMPTY_CLIPS), [project]);
    const projectMidi = useMemo(() => (project ? audioProjectMidiRegions(project) : EMPTY_MIDI), [project]);
    const ppqn = project ? audioProjectPpqn(project) : AUDIO_DEFAULT_PPQN;
    const markers = useMemo(() => (project ? audioProjectMarkers(project) : EMPTY_MARKERS), [project]);
    const projectAutomation = useMemo(() => (project ? audioProjectAutomation(project) : EMPTY_AUTOMATION), [project]);
    const tempo = project ? audioProjectTempo(project) : AUDIO_DEFAULT_TEMPO;
    const meter = project ? audioProjectTimeSignature(project) : AUDIO_DEFAULT_METER;
    const grid = project ? audioProjectGrid(project) : AUDIO_DEFAULT_GRID;
    const cycle = project ? audioProjectCycle(project) : AUDIO_DEFAULT_CYCLE;
    const punch = project ? audioProjectPunch(project) : AUDIO_DEFAULT_PUNCH;
    const metronome = project ? audioProjectMetronome(project) : AUDIO_DEFAULT_METRONOME;
    const capture = project ? audioProjectCapture(project) : AUDIO_DEFAULT_CAPTURE;
    const countIn = project ? audioProjectCountIn(project) : 0;
    const masterGain = project ? audioProjectMasterGain(project) : 1;

    const [playing, setPlaying] = useState(false);
    const [recording, setRecording] = useState(false);
    const [exporting, setExporting] = useState(false);
    const [unlocked, setUnlocked] = useState(false);
    const [view, setView] = useState<AudioView>("arrangement");
    const [tool, setTool] = useState<AudioTool>("select");
    const [pxPerSecond, setPxPerSecond] = useState(AUDIO_DEFAULT_PX_PER_SECOND);
    const [sources, setSources] = useState<Record<string, string>>({});
    const [selectedClipIds, setSelectedClipIds] = useState<string[]>([]);
    const [selectedRegionId, setSelectedRegionId] = useState("");
    const [selectedTrackId, setSelectedTrackId] = useState("");
    const [band, setBand] = useState<AudioBand | null>(null);
    const [range, setRange] = useState<{ start: number; end: number } | null>(null);
    const [picker, setPicker] = useState<{ trackId: string; at: number | null } | null>(null);
    const [clipDialog, setClipDialog] = useState<"" | "rename" | "properties">("");
    const [autoCrossfade, setAutoCrossfade] = useState(true);
    const [clipboardCount, setClipboardCount] = useState(0);
    const [graphVersion, setGraphVersion] = useState(0);
    const dock = useDockLayout("audio-studio", AUDIO_DOCK_PANELS);
    const [dockOpen, setDockOpen] = useState(false);
    const [layout, setLayout] = useState({ narrow: false, overlayDock: false });
    const [viewport, setViewport] = useState({ top: 0, height: window.innerHeight, left: 0, width: 0 });

    const trackWidth = layout.narrow ? NARROW_TRACK_WIDTH : TRACK_WIDTH;
    const dockOverlay = dockOpen && layout.overlayDock;

    const clipGestureRef = useRef<AudioClipGesture | null>(null);
    const regionGestureRef = useRef<AudioRegionGesture | null>(null);
    const midiScheduleRef = useRef("");
    const bandGestureRef = useRef<AudioBandGesture | null>(null);
    const panRef = useRef<{ pointerId: number; x: number; y: number; left: number; top: number } | null>(null);
    const clipboardRef = useRef<CanvasAudioClip[]>([]);
    const contextRef = useRef<{ trackId: string; time: number }>({ trackId: "", time: 0 });
    const rulerContextRef = useRef(0);
    const pendingZoomRef = useRef<{ time: number; viewX: number } | null>(null);
    const scrollRef = useRef<HTMLDivElement>(null);
    const contentRef = useRef<HTMLDivElement>(null);
    const laneRefs = useRef(new Map<string, HTMLDivElement>());
    const trackNameRefs = useRef(new Map<string, HTMLInputElement>());
    const graphRef = useRef<AudioGraph | null>(null);
    const recordRef = useRef<AudioRecordTake | null>(null);
    const finishRecordRef = useRef<() => void>(() => undefined);
    const metersRef = useRef(new Map<string, Tone.Meter>());
    const meterElsRef = useRef(new Map<string, Map<number, HTMLElement>>());
    const meterLevelsRef = useRef(new WeakMap<HTMLElement, { level: number; hot: number }>());
    const automationDotsRef = useRef(new Map<string, { element: HTMLElement; trackId: string; target: string }>());
    const playheadRef = useRef<HTMLSpanElement>(null);
    const playheadLaneRef = useRef<HTMLDivElement>(null);
    const bandRef = useRef<HTMLDivElement>(null);
    const scrubRef = useRef<{ pointerId: number; pending: number; frame: number } | null>(null);
    const timeRef = useRef<HTMLSpanElement>(null);
    const positionRef = useRef<HTMLSpanElement>(null);
    const dockToggleRef = useRef<HTMLButtonElement>(null);
    const overlayDockRef = useRef<HTMLElement>(null);
    const ppsRef = useRef(pxPerSecond);
    const trackWidthRef = useRef(trackWidth);
    const viewportRef = useRef(viewport);
    const shortcutsRef = useRef<(event: KeyboardEvent) => void>(() => undefined);
    ppsRef.current = pxPerSecond;
    trackWidthRef.current = trackWidth;
    viewportRef.current = viewport;

    const clips = projectClips;
    const automation = projectAutomation;
    const midi = projectMidi;
    const hasContent = Boolean(projectClips.length || projectMidi.length);
    const projectDuration = audioProjectDuration(projectClips, projectMidi, ppqn, tempo);
    const timelineSeconds = Math.max(MIN_TIMELINE_SECONDS, Math.ceil(projectDuration) + 5, Math.ceil(cycle.end) + 5, Math.ceil(punch.out) + 5, markers.reduce((end, marker) => Math.max(end, marker.time), 0) + 5);
    const timelineWidth = timelineSeconds * pxPerSecond;
    const snapStep = chooseSnapStep(pxPerSecond, grid.snap, tempo, meter);
    const gridStep = chooseGridStep(pxPerSecond, tempo, meter);
    const beatPx = beatSeconds(tempo, meter) * pxPerSecond;
    const selectedSet = useMemo(() => new Set(selectedClipIds), [selectedClipIds]);
    const tracksById = useMemo(() => new Map(tracks.map((track) => [track.id, track])), [tracks]);
    const audible = useMemo(() => (project ? computeAudibility(tracks) : null), [project, tracks]);
    const primaryClip = clips.find((clip) => clip.id === selectedClipIds[selectedClipIds.length - 1]) ?? null;
    const selectedRegion = midi.find((region) => region.id === selectedRegionId) ?? null;
    const selectedRegionTrack = selectedRegion ? tracksById.get(selectedRegion.trackId) ?? null : null;
    const selectedTrack = tracks.find((track) => track.id === selectedTrackId) ?? tracks[0] ?? null;
    const primaryClipTrack = primaryClip ? tracksById.get(primaryClip.trackId) : undefined;
    const audioNodes = useMemo(() => nodes.filter((node) => node.type === CanvasNodeType.Audio && Boolean(node.metadata?.content || node.metadata?.storageKey)), [nodes]);
    const audioNodesById = useMemo(() => new Map(audioNodes.map((node) => [node.id, node])), [audioNodes]);
    const pickerTrack = tracks.find((track) => track.id === picker?.trackId) ?? null;
    const cycleLoop = cycle.enabled && cycle.end > cycle.start;
    const armedTrack = tracks.find((track) => track.armed && canHostClips(track)) ?? null;
    // Only clip/MIDI tracks are numbered; a routing-only row (group, return, master) reads as its role instead.
    const trackPlaceholder = useCallback(
        (track: CanvasAudioTrack) => {
            const index = tracks.filter((item) => canHostClips(item) || canHostMidi(item)).findIndex((item) => item.id === track.id);
            return index >= 0 ? t("canvas.audioStudio.trackName", { index: index + 1 }) : t(AUDIO_TRACK_TYPE_LABEL_KEYS[audioTrackType(track)]);
        },
        [t, tracks],
    );

    const laneBlocks = useMemo(() => {
        let top = RULER_HEIGHT;
        return tracks.map((track) => {
            const lanes = track.collapsed ? 0 : automationLanesForTrack(automation, track.id).length;
            const block = { top, height: LANE_HEIGHT + lanes * AUTOMATION_LANE_HEIGHT };
            top += block.height;
            return block;
        });
    }, [tracks, automation]);
    const lanesHeight = laneBlocks.reduce((total, block) => total + block.height, 0);
    const laneWindow = { from: viewport.top - LANE_OVERSCAN_PX, to: viewport.top + viewport.height + LANE_OVERSCAN_PX };
    const laneView = { from: Math.max(0, viewport.left - trackWidth), to: Math.max(0, viewport.left + viewport.width - trackWidth) };
    const trackAtY = useCallback(
        (y: number) => {
            const index = laneBlocks.findIndex((block) => y >= block.top && y < block.top + block.height);
            return tracks[index] ?? null;
        },
        [laneBlocks, tracks],
    );

    const patchMetadata = useCallback(
        (patch: Partial<CanvasNodeMetadata>) => {
            if (!projectId) return;
            setNodes((prev) => prev.map((node) => (node.id === projectId ? { ...node, metadata: { ...node.metadata, ...patch } } : node)));
        },
        [projectId, setNodes],
    );

    const commitClips = useCallback(
        (next: CanvasAudioClip[]) => {
            patchMetadata({ audioClips: autoCrossfade ? applyOverlap(next) : next });
        },
        [autoCrossfade, patchMetadata],
    );

    useEffect(() => {
        setPlaying(false);
        setRecording(false);
        setSelectedClipIds([]);
        setRange(null);
        setBand(null);
        setPicker(null);
        setClipDialog("");
        setSelectedRegionId("");
        bandGestureRef.current = null;
        clipGestureRef.current = null;
        regionGestureRef.current = null;
        if (playheadRef.current) playheadRef.current.style.transform = "translateX(0px)";
        if (timeRef.current) timeRef.current.textContent = formatAudioTime(0);
        if (positionRef.current) positionRef.current.textContent = formatBarsBeats(0, tempo, meter);
        return () => {
            const active = recordRef.current;
            recordRef.current = null;
            active?.disconnect();
            active?.session.cancel();
            const transport = Tone.getTransport();
            transport.stop();
            transport.seconds = 0;
        };
    }, [projectId]);

    useEffect(() => {
        setSelectedTrackId((prev) => (tracks.some((track) => track.id === prev) ? prev : tracks[0]?.id || ""));
    }, [tracks]);

    useEffect(() => {
        let active = true;
        void resolveAudioClipUrls(projectClips, nodes).then((urls) => {
            if (active) setSources((prev) => (sameSources(prev, urls) ? prev : urls));
        });
        return () => {
            active = false;
        };
    }, [projectClips, nodes]);

    useEffect(() => {
        const narrow = window.matchMedia(COMPACT_QUERY);
        const overlay = window.matchMedia(OVERLAY_DOCK_QUERY);
        const apply = () => setLayout({ narrow: narrow.matches, overlayDock: overlay.matches });
        apply();
        narrow.addEventListener("change", apply);
        overlay.addEventListener("change", apply);
        return () => {
            narrow.removeEventListener("change", apply);
            overlay.removeEventListener("change", apply);
        };
    }, []);

    // Scroll position and viewport size drive lane virtualization and the visible window of every waveform canvas.
    useEffect(() => {
        const element = scrollRef.current;
        if (!element) return;
        let frame = 0;
        const sync = () => {
            frame = 0;
            const next = { top: element.scrollTop, height: element.clientHeight, left: element.scrollLeft, width: element.clientWidth };
            const previous = viewportRef.current;
            if (next.top === previous.top && next.height === previous.height && next.left === previous.left && next.width === previous.width) return;
            viewportRef.current = next;
            setViewport(next);
        };
        const schedule = () => {
            if (!frame) frame = requestAnimationFrame(sync);
        };
        sync();
        const observer = new ResizeObserver(schedule);
        observer.observe(element);
        element.addEventListener("scroll", schedule, { passive: true });
        return () => {
            if (frame) cancelAnimationFrame(frame);
            observer.disconnect();
            element.removeEventListener("scroll", schedule);
        };
    }, [projectId]);

    // The narrow-width dock is an overlay: it takes focus on open, closes on an outside pointerdown or Escape and
    // keeps Tab inside itself, so a keyboard user can never be left behind it.
    useEffect(() => {
        const element = overlayDockRef.current;
        if (!dockOverlay || !element) return;
        element.focus();
        const onPointerDown = (event: PointerEvent) => {
            const target = event.target as Node | null;
            if (target && (element.contains(target) || dockToggleRef.current?.contains(target))) return;
            setDockOpen(false);
        };
        window.addEventListener("pointerdown", onPointerDown, true);
        return () => window.removeEventListener("pointerdown", onPointerDown, true);
    }, [dockOverlay]);

    const trapDockFocus = (event: ReactKeyboardEvent<HTMLElement>) => {
        if (event.key !== "Tab") return;
        const element = event.currentTarget;
        const focusable = Array.from(element.querySelectorAll<HTMLElement>("button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex='-1'])")).filter((node) => node.offsetParent !== null);
        if (!focusable.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && (document.activeElement === first || document.activeElement === element)) {
            event.preventDefault();
            last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
        }
    };

    // Structural identity: strips, players and send taps follow it. Mix settings, clip gain/fades and automation
    // points are deliberately absent, so those edits never rebuild a player.
    const tracksVersion = [
        tracks.map((track) => `${track.id}:${audioTrackType(track)}:${track.output ?? ""}:${track.instrument?.preset ?? ""}:${(track.sends ?? []).map((send) => `${send.id}:${send.targetTrackId}:${send.pre ? 1 : 0}:${send.enabled ? 1 : 0}`).join(",")}`).join("|"),
        projectClips.map((clip) => `${clip.id}:${clip.trackId}:${clip.sourceNodeId}:${clip.start}:${clip.offset}:${clip.duration}:${clip.loop ? 1 : 0}:${clip.reversed ? 1 : 0}:${clip.muted ? 1 : 0}`).join("|"),
    ].join("||");
    // MIDI regions and their notes only re-schedule the synths, so they stay out of the structural key above.
    const midiNotesKey = projectMidi
        .map((region) => `${region.id}:${region.trackId}:${region.startTicks}:${region.durationTicks}:${region.notes.map((note) => `${note.tick},${note.durationTicks},${note.pitch},${note.velocity}`).join(";")}`)
        .join("|");
    // Mixer identity: fader/pan/gate/send level, clip gain/fades and automation ramps are set on the live graph.
    const mixerVersion = [
        tracks.map((track) => `${track.id}:${clampGain(track.gain)}:${track.pan ?? 0}:${track.mute ? 1 : 0}:${track.solo ? 1 : 0}:${(track.sends ?? []).map((send) => `${send.id}:${clampGain(send.gain)}:${send.enabled ? 1 : 0}`).join(",")}`).join("|"),
        projectClips.map((clip) => `${clip.id}:${clampClipGain(clip.gain ?? 1)}:${clip.fadeIn ?? 0}:${clip.fadeOut ?? 0}`).join("|"),
        projectAutomation
            .map((lane) => `${lane.id}:${lane.trackId}:${lane.target}:${lane.enabled ? 1 : 0}:${lane.points.map((point) => `${point.time.toFixed(3)},${point.value.toFixed(4)},${point.curve ?? "linear"}`).join(";")}`)
            .join("|"),
        masterGain,
        midiNotesKey,
    ].join("||");

    // Structural graph build through the shared builder, after the first gesture unlocked the context; cleanup
    // cancels the transport and disposes the graph, so a StrictMode double mount leaves no second graph behind.
    useEffect(() => {
        if (!projectId || !unlocked) return;
        let graph: AudioGraph | null = null;
        let released = false;
        void (async () => {
            const buffers = await loadAudioGraphBuffers(projectClips, sources);
            if (released) return;
            graph = buildAudioGraph({ tracks, clips: projectClips, regions: projectMidi, ppqn, tempo, masterGain, automation: projectAutomation }, buffers, { mode: "transport", meters: true });
            graphRef.current = graph;
            midiScheduleRef.current = "";
            const meters = new Map<string, Tone.Meter>();
            graph.strips.forEach((strip, trackId) => {
                if (strip.meter) meters.set(trackId, strip.meter);
            });
            metersRef.current = meters;
            setGraphVersion((version) => version + 1);
        })();
        return () => {
            released = true;
            Tone.getTransport().cancel();
            graphRef.current = null;
            midiScheduleRef.current = "";
            metersRef.current = new Map();
            graph?.dispose();
        };
    }, [projectId, unlocked, tracksVersion, sources]);

    // Mixer only: faders, pan, gates, send gains, fades, clip gains and automation ramps, never a rebuild.
    useEffect(() => {
        const graph = graphRef.current;
        if (!graph) return;
        graph.scheduleAutomation(projectAutomation);
        // Only re-schedule the notes when the regions, notes, tempo or structure changed, so a fader drag while
        // playing never clears a note event that is about to fire.
        const midiScheduleKey = `${tracksVersion}||${midiNotesKey}||${ppqn}||${tempo}`;
        if (midiScheduleRef.current !== midiScheduleKey) {
            graph.scheduleMidi(projectMidi, ppqn, tempo);
            midiScheduleRef.current = midiScheduleKey;
        }
        applyAudioGraphMix(graph, { tracks, clips: projectClips, masterGain });
        graph.players.forEach((player, clipId) => {
            const clip = projectClips.find((item) => item.id === clipId);
            if (!clip) return;
            player.volume.value = Tone.gainToDb(clampClipGain(clip.gain ?? 1));
            player.fadeIn = clip.fadeIn ?? 0;
            player.fadeOut = clip.fadeOut ?? 0;
        });
    }, [projectId, graphVersion, tracksVersion, mixerVersion, sources, tracks, masterGain, projectClips, projectAutomation, projectMidi, ppqn, tempo]);

    // The click follows the toggle, its volume and the meter without rebuilding a player; a count-in reuses it.
    useEffect(() => {
        graphRef.current?.scheduleMetronome({ ...metronome, timeSignature: meter });
    }, [graphVersion, metronome.enabled, metronome.volumeDb, meter.numerator, meter.denominator]);

    const registerMeter = useCallback((trackId: string, channel: number, element: HTMLElement | null) => {
        const list = meterElsRef.current.get(trackId) ?? new Map<number, HTMLElement>();
        if (element) list.set(channel, element);
        else list.delete(channel);
        if (list.size) meterElsRef.current.set(trackId, list);
        else meterElsRef.current.delete(trackId);
    }, []);

    const registerAutomationDot = useCallback((laneId: string, trackId: string, target: string, element: HTMLElement | null) => {
        if (element) automationDotsRef.current.set(laneId, { element, trackId, target });
        else automationDotsRef.current.delete(laneId);
    }, []);

    const previewTrackMix = useCallback((trackId: string, patch: { gain?: number; pan?: number }) => {
        applyLiveTrackMix(graphRef.current, trackId, patch);
    }, []);

    // Meters paint straight to the DOM from rAF; no per-frame React state.
    useEffect(() => {
        if (!projectId) return;
        meterLevelsRef.current = new WeakMap();
        let raf = 0;
        const tick = () => {
            metersRef.current.forEach((meter, trackId) => {
                const value = meter.getValue();
                const channels = Array.isArray(value) ? value : [value];
                meterElsRef.current.get(trackId)?.forEach((element, channel) => {
                    const db = channels[Math.min(channel, channels.length - 1)];
                    const level = Number.isFinite(db) ? Math.min(1, Math.max(0, (db + 60) / 60)) : 0;
                    const hot = db > -0.5 ? 2 : db > -6 ? 1 : 0;
                    const state = meterLevelsRef.current.get(element) ?? { level: -1, hot: -1 };
                    if (state.level !== level) {
                        element.style.transform = `scaleY(${level})`;
                        state.level = level;
                    }
                    if (state.hot !== hot) {
                        element.style.background = hot === 2 ? theme.node.blocked : hot === 1 ? theme.node.primaryText : theme.node.muted;
                        state.hot = hot;
                    }
                    meterLevelsRef.current.set(element, state);
                });
            });
            automationDotsRef.current.forEach(({ element, trackId, target }) => {
                const value = liveAutomationValue(graphRef.current, trackId, target);
                if (value === null) return;
                const { min, max } = automationValueRange(target);
                const ratio = Math.min(1, Math.max(0, (value - min) / (max - min)));
                element.style.transform = `translateY(${(1 - ratio) * AUTOMATION_PLOT_HEIGHT}px)`;
            });
            raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(raf);
    }, [projectId, theme]);

    useEffect(() => {
        const transport = Tone.getTransport();
        transport.bpm.value = tempo;
        transport.timeSignature = meter.numerator;
        transport.loop = cycleLoop;
        transport.loopStart = cycle.start;
        transport.loopEnd = Math.max(cycle.start + 0.01, cycle.end);
    }, [tempo, meter.numerator, cycleLoop, cycle.start, cycle.end]);

    const paintPlayhead = useCallback(
        (seconds: number) => {
            const position = Math.max(0, seconds);
            const transform = `translateX(${position * pxPerSecond}px)`;
            if (playheadRef.current) playheadRef.current.style.transform = transform;
            if (playheadLaneRef.current) playheadLaneRef.current.style.transform = transform;
            if (timeRef.current) timeRef.current.textContent = formatAudioTime(position);
            if (positionRef.current) positionRef.current.textContent = formatBarsBeats(position, tempo, meter);
        },
        [pxPerSecond, tempo, meter],
    );

    useEffect(() => {
        paintPlayhead(Tone.getTransport().seconds);
    }, [paintPlayhead]);

    const pausePlayback = useCallback(() => {
        if (recordRef.current) {
            void finishRecordRef.current();
            return;
        }
        Tone.getTransport().pause();
        setPlaying(false);
    }, []);

    const stopPlayback = useCallback(() => {
        if (recordRef.current) {
            void finishRecordRef.current();
            return;
        }
        const transport = Tone.getTransport();
        transport.stop();
        transport.seconds = 0;
        setPlaying(false);
        paintPlayhead(0);
    }, [paintPlayhead]);

    const seek = useCallback(
        (seconds: number) => {
            const transport = Tone.getTransport();
            const wasPlaying = transport.state === "started";
            transport.pause();
            transport.seconds = Math.max(0, Math.min(timelineSeconds, seconds));
            paintPlayhead(transport.seconds);
            if (wasPlaying) transport.start();
        },
        [paintPlayhead, timelineSeconds],
    );

    const unlockAudio = useCallback(async () => {
        // Must stay inside the user gesture; a suspended context (autoplay policy, tab had been backgrounded) is resumed here too.
        if (Tone.getContext().state !== "running") {
            try {
                await Tone.start();
            } catch {
                return false;
            }
        }
        setUnlocked(true);
        return true;
    }, []);

    /** The unlock is what triggers the build, so the first Play waits for its players instead of starting a silent transport. */
    const waitForGraph = useCallback(async () => {
        for (let frame = 0; frame < 120 && !graphRef.current; frame += 1) await new Promise((resolve) => requestAnimationFrame(resolve));
    }, []);

    const togglePlay = useCallback(async () => {
        if (recordRef.current) {
            void finishRecordRef.current();
            return;
        }
        if (Tone.getTransport().state === "started") {
            pausePlayback();
            return;
        }
        if (!hasContent) return;
        if (!(await unlockAudio())) return;
        await waitForGraph();
        const transport = Tone.getTransport();
        if (!cycleLoop && projectDuration > 0 && transport.seconds >= projectDuration) transport.seconds = 0;
        transport.start();
        setPlaying(true);
    }, [cycleLoop, hasContent, pausePlayback, projectDuration, unlockAudio, waitForGraph]);

    useEffect(() => {
        if (!playing) return;
        let raf = 0;
        const tick = () => {
            const seconds = Tone.getTransport().seconds;
            paintPlayhead(seconds);
            // A punch take ends at its out point; reaching the project end ends a normal take instead of pausing.
            const take = recordRef.current;
            if (take && take.punchOut !== null && seconds >= take.punchOut) {
                void finishRecordRef.current();
                return;
            }
            if (!cycleLoop && projectDuration > 0 && seconds >= projectDuration) {
                if (recordRef.current) {
                    void finishRecordRef.current();
                    return;
                }
                Tone.getTransport().pause();
                setPlaying(false);
                return;
            }
            raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(raf);
    }, [playing, projectDuration, cycleLoop, paintPlayhead]);

    const timeAt = useCallback(
        (clientX: number) => {
            const box = contentRef.current?.getBoundingClientRect();
            if (!box) return 0;
            return Math.max(0, (clientX - box.left - trackWidthRef.current) / ppsRef.current);
        },
        [],
    );

    const contentPoint = useCallback((clientX: number, clientY: number) => {
        const box = contentRef.current?.getBoundingClientRect();
        return { x: box ? clientX - box.left : 0, y: box ? clientY - box.top : 0 };
    }, []);

    const trackAt = useCallback(
        (clientY: number) => {
            for (const [trackId, element] of laneRefs.current) {
                const box = element.getBoundingClientRect();
                if (clientY >= box.top && clientY <= box.bottom) return trackId;
            }
            return null;
        },
        [],
    );

    const clipTrackAt = useCallback(
        (clientY: number) => {
            const trackId = trackAt(clientY);
            const track = trackId ? tracksById.get(trackId) : undefined;
            return track && canHostClips(track) ? track.id : null;
        },
        [trackAt, tracksById],
    );

    const midiTrackAt = useCallback(
        (clientY: number) => {
            const trackId = trackAt(clientY);
            const track = trackId ? tracksById.get(trackId) : undefined;
            return track && canHostMidi(track) ? track.id : null;
        },
        [trackAt, tracksById],
    );

    const snapTime = useCallback(
        (seconds: number, suspend: boolean) => {
            const clamped = Math.max(0, seconds);
            return suspend ? clamped : Math.max(0, snapSeconds(clamped, snapStep));
        },
        [snapStep],
    );

    useEffect(() => {
        const element = scrollRef.current;
        if (!element) return;
        const onWheel = (event: WheelEvent) => {
            if (event.ctrlKey || event.metaKey) {
                event.preventDefault();
                const rect = element.getBoundingClientRect();
                const viewX = event.clientX - rect.left;
                const time = Math.max(0, (element.scrollLeft + viewX - trackWidthRef.current) / ppsRef.current);
                const next = clampPxPerSecond(ppsRef.current * (event.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP));
                if (next === ppsRef.current) return;
                pendingZoomRef.current = { time, viewX };
                setPxPerSecond(next);
                return;
            }
            if (event.shiftKey) {
                event.preventDefault();
                element.scrollLeft += event.deltaY;
            }
        };
        element.addEventListener("wheel", onWheel, { passive: false });
        return () => element.removeEventListener("wheel", onWheel);
    }, [projectId]);

    useEffect(() => {
        const element = scrollRef.current;
        const pending = pendingZoomRef.current;
        if (!element || !pending) return;
        pendingZoomRef.current = null;
        element.scrollLeft = Math.max(0, trackWidth + pending.time * pxPerSecond - pending.viewX);
    }, [pxPerSecond, trackWidth]);

    const zoomBy = useCallback(
        (factor: number, viewX?: number) => {
            const element = scrollRef.current;
            if (!element) return;
            const x = viewX ?? element.clientWidth / 2;
            const time = Math.max(0, (element.scrollLeft + x - trackWidthRef.current) / ppsRef.current);
            const next = clampPxPerSecond(ppsRef.current * factor);
            if (next === ppsRef.current) return;
            pendingZoomRef.current = { time, viewX: x };
            setPxPerSecond(next);
        },
        [],
    );

    const zoomFit = useCallback(() => {
        const element = scrollRef.current;
        if (!element) return;
        const width = Math.max(120, element.clientWidth - trackWidth - 8);
        setPxPerSecond(clampPxPerSecond(width / Math.max(5, projectDuration || MIN_TIMELINE_SECONDS)));
        pendingZoomRef.current = { time: 0, viewX: trackWidth };
    }, [projectDuration, trackWidth]);

    /** A scrub moves the transport clock and the playhead directly; it never writes the document, so no frame re-renders the studio. */
    const scrubSeek = (seconds: number) => {
        const clamped = Math.max(0, Math.min(timelineSeconds, seconds));
        Tone.getTransport().seconds = clamped;
        paintPlayhead(clamped);
    };

    const beginScrub = (event: ReactPointerEvent<HTMLDivElement>) => {
        // Keep the hand tool from panning while the pointer is on the ruler.
        event.stopPropagation();
        event.currentTarget.setPointerCapture(event.pointerId);
        scrubRef.current = { pointerId: event.pointerId, pending: timeAt(event.clientX), frame: 0 };
        scrubSeek(scrubRef.current.pending);
    };

    const moveScrub = (event: ReactPointerEvent<HTMLDivElement>) => {
        const scrub = scrubRef.current;
        if (!scrub || scrub.pointerId !== event.pointerId) return;
        scrub.pending = timeAt(event.clientX);
        // One transport move per frame keeps a playing scrub smooth and cheap.
        if (scrub.frame) return;
        scrub.frame = requestAnimationFrame(() => {
            const active = scrubRef.current;
            if (!active) return;
            active.frame = 0;
            scrubSeek(active.pending);
        });
    };

    const endScrub = (event: ReactPointerEvent<HTMLDivElement>) => {
        const scrub = scrubRef.current;
        if (!scrub || scrub.pointerId !== event.pointerId) return;
        if (scrub.frame) cancelAnimationFrame(scrub.frame);
        scrubRef.current = null;
        scrubSeek(timeAt(event.clientX));
    };

    const beginPan = (event: ReactPointerEvent<HTMLDivElement>) => {
        const element = scrollRef.current;
        if (!element) return;
        event.preventDefault();
        element.setPointerCapture(event.pointerId);
        panRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, left: element.scrollLeft, top: element.scrollTop };
    };

    const movePan = (event: ReactPointerEvent<HTMLDivElement>) => {
        const pan = panRef.current;
        const element = scrollRef.current;
        if (!pan || !element || pan.pointerId !== event.pointerId) return;
        element.scrollLeft = pan.left - (event.clientX - pan.x);
        element.scrollTop = pan.top - (event.clientY - pan.y);
    };

    const endPan = (event: ReactPointerEvent<HTMLDivElement>) => {
        const pan = panRef.current;
        if (!pan || pan.pointerId !== event.pointerId) return;
        panRef.current = null;
    };

    const beginBand = (event: ReactPointerEvent<HTMLDivElement>, kind: AudioBand["kind"]) => {
        event.currentTarget.setPointerCapture(event.pointerId);
        const point = contentPoint(event.clientX, event.clientY);
        bandGestureRef.current = { pointerId: event.pointerId, kind, x0: point.x, y0: point.y, x1: point.x, y1: point.y };
        setBand({ kind, x0: point.x, y0: point.y, x1: point.x, y1: point.y });
    };

    const moveBand = (event: ReactPointerEvent<HTMLDivElement>) => {
        const gesture = bandGestureRef.current;
        if (!gesture || gesture.pointerId !== event.pointerId) return;
        const point = contentPoint(event.clientX, event.clientY);
        gesture.x1 = point.x;
        gesture.y1 = point.y;
        const element = bandRef.current;
        if (!element) return;
        element.style.left = `${Math.min(gesture.x0, gesture.x1)}px`;
        element.style.top = `${Math.min(gesture.y0, gesture.y1)}px`;
        element.style.width = `${Math.max(1, Math.abs(gesture.x1 - gesture.x0))}px`;
        element.style.height = `${Math.max(1, Math.abs(gesture.y1 - gesture.y0))}px`;
    };

    const endBand = (event: ReactPointerEvent<HTMLDivElement>) => {
        const gesture = bandGestureRef.current;
        if (!gesture || gesture.pointerId !== event.pointerId) return;
        bandGestureRef.current = null;
        setBand(null);
        const moved = Math.abs(gesture.x1 - gesture.x0) > DRAG_THRESHOLD_PX || Math.abs(gesture.y1 - gesture.y0) > DRAG_THRESHOLD_PX;
        if (gesture.kind === "zoom") {
            if (!moved) {
                zoomBy(ZOOM_STEP, gesture.x0 - (scrollRef.current?.scrollLeft ?? 0));
                return;
            }
            const from = Math.max(0, (Math.min(gesture.x0, gesture.x1) - trackWidth) / pxPerSecond);
            const to = Math.max(from + 0.01, (Math.max(gesture.x0, gesture.x1) - trackWidth) / pxPerSecond);
            const element = scrollRef.current;
            if (!element) return;
            setPxPerSecond(clampPxPerSecond(Math.max(120, element.clientWidth - trackWidth) / (to - from)));
            pendingZoomRef.current = { time: from, viewX: trackWidth };
            return;
        }
        const from = Math.max(0, (Math.min(gesture.x0, gesture.x1) - trackWidth) / pxPerSecond);
        const to = Math.max(from, (Math.max(gesture.x0, gesture.x1) - trackWidth) / pxPerSecond);
        if (gesture.kind === "range") {
            if (moved) setRange({ start: from, end: to });
            return;
        }
        if (!moved) {
            setSelectedClipIds([]);
            return;
        }
        const firstTrack = trackAtY(Math.min(gesture.y0, gesture.y1));
        const lastTrack = trackAtY(Math.max(gesture.y0, gesture.y1));
        const fromIndex = firstTrack ? Math.max(0, tracks.indexOf(firstTrack)) : 0;
        const toIndex = lastTrack ? tracks.indexOf(lastTrack) : tracks.length - 1;
        const trackIds = tracks.slice(fromIndex, toIndex + 1).map((track) => track.id);
        const hits = clipsIntersecting(clips, trackIds, from, to).map((clip) => clip.id);
        setSelectedClipIds((prev) => (event.shiftKey ? Array.from(new Set([...prev, ...hits])) : event.altKey ? prev.filter((id) => !hits.includes(id)) : hits));
    };

    const beginLaneGesture = (event: ReactPointerEvent<HTMLDivElement>, trackId: string) => {
        if (event.button === 2) {
            contextRef.current = { trackId, time: timeAt(event.clientX) };
            return;
        }
        if (event.button !== 0) return;
        setSelectedTrackId(trackId);
        if (tool === "hand") return;
        if (tool === "draw") {
            const track = tracksById.get(trackId);
            if (track && canHostMidi(track)) addRegion(trackId, snapTime(timeAt(event.clientX), event.shiftKey));
            else setPicker({ trackId, at: snapTime(timeAt(event.clientX), event.shiftKey) });
            return;
        }
        if (tool === "select" || tool === "range" || tool === "zoom") beginBand(event, tool === "select" ? "marquee" : tool);
    };

    const beginClipGesture = (event: ReactPointerEvent<HTMLDivElement>, clip: CanvasAudioClip) => {
        if (event.button === 2) {
            contextRef.current = { trackId: clip.trackId, time: timeAt(event.clientX) };
            return;
        }
        if (event.button !== 0) return;
        if (tool === "hand" || tool === "range" || tool === "zoom") return;
        event.stopPropagation();
        setSelectedTrackId(clip.trackId);
        if (tool === "erase") {
            removeClips([clip.id]);
            return;
        }
        if (tool === "split") {
            splitClips([clip.id], timeAt(event.clientX));
            return;
        }
        if (tool === "glue") {
            const next = glueClip(projectClips, clip.id);
            if (next) {
                setSelectedClipIds([clip.id]);
                commitClips(next);
            }
            return;
        }
        if (tool !== "select") return;
        const rect = event.currentTarget.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;
        const width = rect.width;
        if (clip.locked) {
            setSelectedClipIds([clip.id]);
            return;
        }
        let mode: AudioClipGestureMode = "move";
        if (y <= FADE_HIT_PX && x <= EDGE_HIT_PX) mode = "fade-in";
        else if (y <= FADE_HIT_PX && x >= width - EDGE_HIT_PX) mode = "fade-out";
        else if (x <= EDGE_HIT_PX) mode = "trim-in";
        else if (x >= width - EDGE_HIT_PX) mode = event.altKey ? "loop" : "trim-out";
        event.currentTarget.setPointerCapture(event.pointerId);
        const copy = event.altKey && mode === "move";
        const clipId = copy ? nanoid() : clip.id;
        const startClips = copy ? [...projectClips, { ...clip, id: clipId }] : projectClips;
        // Alt-copy has no document entry until release, so it drags a ghost and leaves the source clip in place.
        const ghost = copy ? (event.currentTarget.cloneNode(true) as HTMLElement) : null;
        if (ghost) {
            ghost.style.pointerEvents = "none";
            event.currentTarget.parentElement?.appendChild(ghost);
        }
        clipGestureRef.current = { pointerId: event.pointerId, mode, clipId, sourceId: clip.id, trackId: clip.trackId, element: event.currentTarget, preview: ghost ?? event.currentTarget, ghost, startClips, startClientX: event.clientX, startClientY: event.clientY, startStart: clip.start, startDuration: clip.duration, moved: false, next: null };
        setSelectedClipIds((prev) => (prev.includes(clip.id) ? prev : [clip.id]));
    };

    const moveClipGesture = (event: ReactPointerEvent<HTMLDivElement>) => {
        const gesture = clipGestureRef.current;
        if (!gesture || gesture.pointerId !== event.pointerId) return;
        const delta = (event.clientX - gesture.startClientX) / pxPerSecond;
        const suspend = event.shiftKey;
        if (gesture.mode === "move") {
            const start = snapTime(gesture.startStart + delta, suspend);
            const trackId = clipTrackAt(event.clientY) || gesture.trackId;
            gesture.moved = gesture.moved || Math.abs(start - gesture.startStart) > 0.0001 || trackId !== gesture.trackId;
            if (!gesture.moved) return;
            gesture.next = moveClip(gesture.startClips, gesture.clipId, start, trackId);
            const from = tracks.findIndex((track) => track.id === gesture.trackId);
            const to = tracks.findIndex((track) => track.id === trackId);
            const rows = from >= 0 && to >= 0 ? laneBlocks[to].top - laneBlocks[from].top : event.clientY - gesture.startClientY;
            paintDragPreview(gesture.preview, { transform: `translate(${(start - gesture.startStart) * pxPerSecond}px, ${rows}px)` });
            return;
        }
        if (gesture.mode === "trim-in") {
            const start = snapTime(gesture.startStart + delta, suspend);
            gesture.moved = gesture.moved || Math.abs(start - gesture.startStart) > 0.0001;
            if (!gesture.moved) return;
            gesture.next = trimClipIn(gesture.startClips, gesture.clipId, start - gesture.startStart);
            const clip = gesture.next.find((item) => item.id === gesture.clipId);
            if (clip) paintDragPreview(gesture.preview, { left: clip.start * pxPerSecond, width: Math.max(MIN_CLIP_WIDTH, clip.duration * pxPerSecond) });
            return;
        }
        const end = snapTime(gesture.startStart + gesture.startDuration + delta, suspend);
        if (gesture.mode === "trim-out") {
            gesture.moved = gesture.moved || Math.abs(end - (gesture.startStart + gesture.startDuration)) > 0.0001;
            if (!gesture.moved) return;
            gesture.next = trimClipOut(gesture.startClips, gesture.clipId, end - (gesture.startStart + gesture.startDuration));
            const clip = gesture.next.find((item) => item.id === gesture.clipId);
            if (clip) paintDragPreview(gesture.preview, { width: Math.max(MIN_CLIP_WIDTH, clip.duration * pxPerSecond) });
            return;
        }
        if (gesture.mode === "fade-in") {
            const length = snapTime(gesture.startStart + delta, suspend) - gesture.startStart;
            gesture.moved = gesture.moved || Math.abs(length) > 0.0001;
            if (!gesture.moved) return;
            gesture.next = setClipFade(gesture.startClips, gesture.clipId, "in", length);
            const clip = gesture.next.find((item) => item.id === gesture.clipId);
            if (clip) paintDragPreview(gesture.preview, { fade: { edge: "in", width: Math.min(clip.fadeIn ?? 0, clip.duration) * pxPerSecond } });
            return;
        }
        if (gesture.mode === "fade-out") {
            const length = gesture.startStart + gesture.startDuration - snapTime(gesture.startStart + gesture.startDuration + delta, suspend);
            gesture.moved = gesture.moved || Math.abs(length) > 0.0001;
            if (!gesture.moved) return;
            gesture.next = setClipFade(gesture.startClips, gesture.clipId, "out", length);
            const clip = gesture.next.find((item) => item.id === gesture.clipId);
            if (clip) paintDragPreview(gesture.preview, { fade: { edge: "out", width: Math.min(clip.fadeOut ?? 0, clip.duration) * pxPerSecond } });
            return;
        }
        gesture.moved = gesture.moved || Math.abs(end - (gesture.startStart + gesture.startDuration)) > 0.0001;
        if (!gesture.moved) return;
        gesture.next = patchClip(gesture.startClips, gesture.clipId, { duration: Math.max(AUDIO_MIN_CLIP_SECONDS, end - gesture.startStart), loop: true });
        const clip = gesture.next.find((item) => item.id === gesture.clipId);
        if (clip) paintDragPreview(gesture.preview, { width: Math.max(MIN_CLIP_WIDTH, clip.duration * pxPerSecond) });
    };

    const endClipGesture = (event: ReactPointerEvent<HTMLDivElement>) => {
        const gesture = clipGestureRef.current;
        if (!gesture || gesture.pointerId !== event.pointerId) return;
        clipGestureRef.current = null;
        gesture.ghost?.remove();
        const source = gesture.startClips.find((clip) => clip.id === gesture.sourceId);
        if (source) paintClipGeometry(gesture.element, source, pxPerSecond);
        if (gesture.next && gesture.moved) commitClips(gesture.next);
    };

    const commitMidi = (next: CanvasAudioMidiRegion[]) => {
        patchMetadata({ audioMidiRegions: next });
    };

    const updateRegion = (regionId: string, patch: Partial<CanvasAudioMidiRegion>) => {
        commitMidi(midi.map((region) => (region.id === regionId ? { ...region, ...patch } : region)));
    };

    const commitRegionNotes = (regionId: string, notes: CanvasAudioNote[]) => {
        commitMidi(midi.map((region) => (region.id === regionId ? { ...region, notes } : region)));
    };

    const addRegion = (trackId: string, at?: number) => {
        const region = createAudioMidiRegion(trackId, at === undefined ? nextMidiRegionStart(midi, trackId) : secondsToTicks(at, ppqn, tempo), barTicks(ppqn, meter));
        setSelectedTrackId(trackId);
        setSelectedRegionId(region.id);
        commitMidi([...midi, region]);
    };

    const removeRegions = (ids: string[]) => {
        setSelectedRegionId((prev) => (ids.includes(prev) ? "" : prev));
        commitMidi(midi.filter((region) => !ids.includes(region.id)));
    };

    const splitRegion = (regionId: string, time: number) => {
        const region = midi.find((item) => item.id === regionId);
        if (!region) return;
        const halves = splitRegionAt(region, secondsToTicks(time, ppqn, tempo));
        if (!halves) return;
        setSelectedRegionId(halves[1].id);
        commitMidi(midi.flatMap((item) => (item.id === regionId ? halves : [item])));
    };

    const handleRegionCommand = (command: AudioMidiRegionCommand, regionId: string) => {
        if (command === "open") {
            setSelectedRegionId(regionId);
            setView("roll");
            return;
        }
        if (command === "duplicate") {
            const region = midi.find((item) => item.id === regionId);
            if (!region) return;
            const copy = duplicateRegion(region);
            setSelectedRegionId(copy.id);
            commitMidi([...midi, copy]);
            return;
        }
        removeRegions([regionId]);
    };

    const beginRegionGesture = (event: ReactPointerEvent<HTMLDivElement>, region: CanvasAudioMidiRegion) => {
        if (event.button === 2) {
            contextRef.current = { trackId: region.trackId, time: timeAt(event.clientX) };
            return;
        }
        if (event.button !== 0) return;
        if (tool === "hand" || tool === "range" || tool === "zoom") return;
        event.stopPropagation();
        setSelectedTrackId(region.trackId);
        setSelectedRegionId(region.id);
        if (tool === "erase") {
            removeRegions([region.id]);
            return;
        }
        if (tool === "split") {
            splitRegion(region.id, timeAt(event.clientX));
            return;
        }
        if (tool !== "select") return;
        const rect = event.currentTarget.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const mode: AudioRegionGestureMode = x <= EDGE_HIT_PX ? "trim-in" : x >= rect.width - EDGE_HIT_PX ? "trim-out" : "move";
        event.currentTarget.setPointerCapture(event.pointerId);
        regionGestureRef.current = { pointerId: event.pointerId, mode, regionId: region.id, trackId: region.trackId, element: event.currentTarget, startRegions: projectMidi, startClientX: event.clientX, startClientY: event.clientY, startStartTicks: region.startTicks, startDurationTicks: region.durationTicks, moved: false, next: null };
    };

    const moveRegionGesture = (event: ReactPointerEvent<HTMLDivElement>) => {
        const gesture = regionGestureRef.current;
        if (!gesture || gesture.pointerId !== event.pointerId) return;
        const deltaSeconds = (event.clientX - gesture.startClientX) / pxPerSecond;
        const suspend = event.shiftKey;
        const startSeconds = ticksToSeconds(gesture.startStartTicks, ppqn, tempo);
        const minTicks = beatTicks(ppqn, meter);
        if (gesture.mode === "move") {
            const startTicks = secondsToTicks(snapTime(startSeconds + deltaSeconds, suspend), ppqn, tempo);
            const trackId = midiTrackAt(event.clientY) || gesture.trackId;
            gesture.moved = gesture.moved || startTicks !== gesture.startStartTicks || trackId !== gesture.trackId;
            if (!gesture.moved) return;
            gesture.next = moveRegion(gesture.startRegions, gesture.regionId, startTicks, trackId);
            const from = tracks.findIndex((track) => track.id === gesture.trackId);
            const to = tracks.findIndex((track) => track.id === trackId);
            const rows = from >= 0 && to >= 0 ? laneBlocks[to].top - laneBlocks[from].top : event.clientY - gesture.startClientY;
            paintDragPreview(gesture.element, { transform: `translate(${(ticksToSeconds(startTicks, ppqn, tempo) - startSeconds) * pxPerSecond}px, ${rows}px)` });
            return;
        }
        const maxStart = gesture.startStartTicks + gesture.startDurationTicks - minTicks;
        if (gesture.mode === "trim-in") {
            const startTicks = Math.min(maxStart, secondsToTicks(snapTime(startSeconds + deltaSeconds, suspend), ppqn, tempo));
            const delta = startTicks - gesture.startStartTicks;
            if (!delta) return;
            gesture.moved = true;
            gesture.next = gesture.startRegions.map((item) => (item.id === gesture.regionId ? trimRegionStart(item, delta) : item));
        } else {
            const endTicks = secondsToTicks(snapTime(ticksToSeconds(gesture.startStartTicks + gesture.startDurationTicks, ppqn, tempo) + deltaSeconds, suspend), ppqn, tempo);
            const durationTicks = Math.max(minTicks, endTicks - gesture.startStartTicks);
            if (durationTicks === gesture.startDurationTicks) return;
            gesture.moved = true;
            gesture.next = gesture.startRegions.map((item) => (item.id === gesture.regionId ? trimRegionEnd(item, durationTicks) : item));
        }
        const region = gesture.next.find((item) => item.id === gesture.regionId);
        if (region) {
            paintDragPreview(gesture.element, {
                left: ticksToSeconds(region.startTicks, ppqn, tempo) * pxPerSecond,
                width: Math.max(MIN_CLIP_WIDTH, ticksToSeconds(region.durationTicks, ppqn, tempo) * pxPerSecond),
            });
        }
    };

    const endRegionGesture = (event: ReactPointerEvent<HTMLDivElement>) => {
        const gesture = regionGestureRef.current;
        if (!gesture || gesture.pointerId !== event.pointerId) return;
        regionGestureRef.current = null;
        const settled = (gesture.next ?? gesture.startRegions).find((region) => region.id === gesture.regionId);
        if (settled) paintRegionGeometry(gesture.element, settled, ppqn, tempo, pxPerSecond);
        if (gesture.next && gesture.moved) commitMidi(gesture.next);
    };

    const updateTrack = (trackId: string, patch: Partial<CanvasAudioTrack>) => {
        const next = tracks.map((track) => (track.id === trackId ? { ...track, ...patch } : track));
        const nextAutomation = patch.sends ? pruneAutomation(projectAutomation, next) : projectAutomation;
        patchMetadata({ audioTracks: next, ...(nextAutomation === projectAutomation ? {} : { audioAutomation: nextAutomation }) });
    };

    const addTrack = (type: CanvasAudioTrackType = "audio") => {
        patchMetadata({ audioTracks: [...tracks, createAudioTrack(type)] });
    };

    const duplicateTrack = (trackId: string) => {
        const source = tracks.find((track) => track.id === trackId);
        if (!source || audioTrackType(source) === "master") return;
        const id = nanoid();
        const index = tracks.findIndex((track) => track.id === trackId) + 1;
        const next = [...tracks];
        next.splice(index, 0, { ...source, id, name: source.name ? `${source.name} 2` : trackPlaceholder(source) });
        patchMetadata({
            audioTracks: next,
            audioClips: [...projectClips, ...audioTrackClips(projectClips, trackId).map((clip) => ({ ...clip, id: nanoid(), trackId: id }))],
            audioMidiRegions: [...projectMidi, ...audioTrackRegions(projectMidi, trackId).map((region) => ({ ...duplicateRegion(region), trackId: id }))],
        });
    };

    const removeTrack = (trackId: string) => {
        const target = tracks.find((track) => track.id === trackId);
        if (!target || audioTrackType(target) === "master" || tracks.length <= 1) return;
        const next = tracks
            .filter((track) => track.id !== trackId)
            .map((track) => ({ ...track, output: track.output === trackId ? undefined : track.output, sends: track.sends?.length ? track.sends.filter((send) => send.targetTrackId !== trackId) : track.sends }));
        const nextAutomation = pruneAutomation(projectAutomation, next);
        patchMetadata({
            audioTracks: next,
            audioClips: projectClips.filter((clip) => clip.trackId !== trackId),
            audioMidiRegions: projectMidi.filter((region) => region.trackId !== trackId),
            ...(nextAutomation === projectAutomation ? {} : { audioAutomation: nextAutomation }),
        });
    };

    const patchAutomation = (laneId: string, patch: Partial<CanvasAudioAutomationLane>) => {
        patchMetadata({ audioAutomation: projectAutomation.map((lane) => (lane.id === laneId ? { ...lane, ...patch } : lane)) });
    };

    const commitAutomationPoints = (laneId: string, points: CanvasAudioAutomationPoint[]) => {
        patchMetadata({ audioAutomation: projectAutomation.map((lane) => (lane.id === laneId ? { ...lane, points } : lane)) });
    };

    const addAutomationLane = (trackId: string, target: string) => {
        if (findAutomationLane(projectAutomation, trackId, target)) return;
        patchMetadata({ audioAutomation: [...projectAutomation, createAudioAutomationLane(trackId, target)], audioTracks: tracks.map((track) => (track.id === trackId ? { ...track, collapsed: false } : track)) });
        setSelectedTrackId(trackId);
        dock.reveal("automation");
    };

    const removeAutomationLane = (laneId: string) => {
        patchMetadata({ audioAutomation: projectAutomation.filter((lane) => lane.id !== laneId) });
    };

    const clearTrackAutomation = (trackId: string) => {
        patchMetadata({ audioAutomation: projectAutomation.filter((lane) => lane.trackId !== trackId) });
    };

    const showTrackAutomation = (trackId: string) => {
        updateTrack(trackId, { collapsed: false });
        setSelectedTrackId(trackId);
        dock.reveal("automation");
    };

    const handleAutomationCommand = (command: AudioAutomationCommand) => {
        const track = selectedTrack;
        if (!track) return;
        if (command === "show") {
            if (track.collapsed) showTrackAutomation(track.id);
            else updateTrack(track.id, { collapsed: true });
            return;
        }
        if (command === "addGain") {
            addAutomationLane(track.id, AUDIO_AUTOMATION_GAIN);
            return;
        }
        if (command === "addPan") {
            addAutomationLane(track.id, AUDIO_AUTOMATION_PAN);
            return;
        }
        if (command === "addSend") {
            const send = (track.sends ?? []).find((item) => !findAutomationLane(projectAutomation, track.id, audioAutomationSendTarget(item.id)));
            if (send) addAutomationLane(track.id, audioAutomationSendTarget(send.id));
            return;
        }
        clearTrackAutomation(track.id);
    };

    const removeClips = (ids: string[]) => {
        const set = new Set(ids);
        setSelectedClipIds((prev) => prev.filter((id) => !set.has(id)));
        patchMetadata({ audioClips: projectClips.filter((clip) => !set.has(clip.id)) });
    };

    const toggleClipField = (ids: string[], field: "loop" | "reversed" | "muted" | "locked") => {
        const primary = clips.find((clip) => clip.id === ids[ids.length - 1]);
        if (!primary) return;
        const value = !primary[field];
        commitClips(clips.map((clip) => (ids.includes(clip.id) ? { ...clip, [field]: value } : clip)));
    };

    const toggleClipFade = (ids: string[], edge: "in" | "out") => {
        const primary = clips.find((clip) => clip.id === ids[ids.length - 1]);
        if (!primary) return;
        const current = (edge === "in" ? primary.fadeIn : primary.fadeOut) ?? 0;
        const value = current > 0 ? 0 : Math.min(DEFAULT_FADE_SECONDS, primary.duration);
        commitClips(clips.map((clip) => (ids.includes(clip.id) ? (edge === "in" ? { ...clip, fadeIn: value } : { ...clip, fadeOut: value }) : clip)));
    };

    const splitClips = (ids: string[], time: number) => {
        let next = projectClips;
        let changed = false;
        ids.forEach((id) => {
            const result = splitClip(next, id, time);
            if (result) {
                next = result;
                changed = true;
            }
        });
        if (!changed) return;
        const added = next.filter((clip) => !projectClips.some((item) => item.id === clip.id)).map((clip) => clip.id);
        commitClips(next);
        setSelectedClipIds(added);
    };

    const duplicateClips = (ids: string[]) => {
        const additions = clips.filter((clip) => ids.includes(clip.id)).map((clip) => duplicateClip(clip, clipEnd(clip)));
        if (!additions.length) return;
        commitClips([...clips, ...additions]);
        setSelectedClipIds(additions.map((clip) => clip.id));
    };

    const copyClips = () => {
        clipboardRef.current = clips.filter((clip) => selectedSet.has(clip.id)).map((clip) => ({ ...clip }));
        setClipboardCount(clipboardRef.current.length);
    };

    const cutClips = () => {
        copyClips();
        removeClips(selectedClipIds);
    };

    const pasteClips = () => {
        const source = clipboardRef.current;
        if (!source.length) return;
        const from = Math.min(...source.map((clip) => clip.start));
        const at = Math.max(0, snapTime(Tone.getTransport().seconds, false));
        const additions = source.map((clip) => ({ ...clip, id: nanoid(), start: at + (clip.start - from) }));
        commitClips([...projectClips, ...additions]);
        setSelectedClipIds(additions.map((clip) => clip.id));
    };

    const nudgeClips = (delta: number) => {
        if (!selectedClipIds.length) return;
        commitClips(shiftClips(clips, selectedClipIds, delta));
    };

    const moveClipsTrack = (direction: number) => {
        const primary = primaryClip ?? clips.find((clip) => selectedSet.has(clip.id));
        if (!primary) return;
        const from = tracks.findIndex((track) => track.id === primary.trackId);
        for (let index = from + direction; index >= 0 && index < tracks.length; index += direction) {
            const target = tracks[index];
            if (!canHostClips(target)) continue;
            setSelectedTrackId(target.id);
            commitClips(moveClipsToTrack(clips, selectedClipIds, target.id));
            return;
        }
    };

    const handleClipCommand = (command: AudioClipCommand, clipId?: string) => {
        const ids = clipId ? [clipId] : selectedClipIds;
        const primary = clipId ? clips.find((clip) => clip.id === clipId) : primaryClip;
        if (!ids.length || !primary) return;
        switch (command) {
            case "rename":
            case "properties":
                setClipDialog(command);
                return;
            case "split":
                splitClips(ids, Tone.getTransport().seconds);
                return;
            case "duplicate":
                duplicateClips(ids);
                return;
            case "delete":
                removeClips(ids);
                return;
            case "fadeIn":
                toggleClipFade(ids, "in");
                return;
            case "fadeOut":
                toggleClipFade(ids, "out");
                return;
            case "crossfade": {
                let next = clips;
                let changed = false;
                ids.forEach((id) => {
                    const result = crossfadeClip(next, id);
                    if (result) {
                        next = result;
                        changed = true;
                    }
                });
                if (changed) commitClips(next);
                return;
            }
            case "loop":
                toggleClipField(ids, "loop");
                return;
            case "reverse":
                toggleClipField(ids, "reversed");
                return;
            case "clipMute":
                toggleClipField(ids, "muted");
                return;
            case "lock":
                toggleClipField(ids, "locked");
                return;
        }
    };

    const handleTrackCommand = (command: AudioTrackCommand, trackId?: string) => {
        const target = trackId || selectedTrack?.id || "";
        if (command === "add") addTrack("audio");
        else if (command === "addInstrument") addTrack("instrument");
        else if (command === "addMidi") addTrack("midi");
        else if (command === "addGroup") addTrack("group");
        else if (command === "addReturn") addTrack("return");
        else if (command === "duplicate") duplicateTrack(target);
        else if (command === "exportStems") {
            if (project) void runExport(() => onExportStems(project));
        } else removeTrack(target);
    };

    const handleLaneCommand = (command: AudioLaneCommand, trackId: string) => {
        if (command === "addClip") {
            const track = tracksById.get(trackId);
            if (track && canHostMidi(track)) addRegion(trackId, snapTime(contextRef.current.time, false));
            else setPicker({ trackId, at: snapTime(contextRef.current.time, false) });
            return;
        }
        if (command === "rename") {
            trackNameRefs.current.get(trackId)?.focus();
            return;
        }
        if (command === "showAutomation") {
            showTrackAutomation(trackId);
            return;
        }
        handleTrackCommand(command, trackId);
    };

    const handleEditCommand = (command: AudioEditCommand) => {
        switch (command) {
            case "selectAll":
                setSelectedClipIds(projectClips.map((clip) => clip.id));
                return;
            case "deselect":
                setSelectedClipIds([]);
                return;
            case "copy":
                copyClips();
                return;
            case "cut":
                cutClips();
                return;
            case "paste":
                pasteClips();
                return;
            case "duplicate":
                duplicateClips(selectedClipIds);
                return;
            case "split":
                splitClips(selectedClipIds, Tone.getTransport().seconds);
                return;
            case "delete":
                removeClips(selectedClipIds);
                return;
            case "setCycle":
                if (range) patchMetadata({ audioCycle: { enabled: true, start: range.start, end: range.end } });
                return;
            case "clearCycle":
                patchMetadata({ audioCycle: { enabled: false, start: 0, end: 0 } });
                return;
        }
    };

    const handleViewCommand = (command: AudioViewCommand) => {
        if (command === "grid") patchMetadata({ audioGrid: { ...grid, enabled: !grid.enabled } });
        else if (command === "snap") patchMetadata({ audioGrid: { ...grid, snap: grid.snap === "off" ? "beat" : "off" } });
        else if (command === "cycle") patchMetadata({ audioCycle: { ...cycle, enabled: !cycle.enabled } });
        else if (command === "metronome") patchMetadata({ audioMetronome: { ...metronome, enabled: !metronome.enabled } });
        else if (command === "zoomIn") zoomBy(ZOOM_STEP);
        else if (command === "zoomOut") zoomBy(1 / ZOOM_STEP);
        else zoomFit();
    };

    const handleRulerCommand = (command: "addMarker" | "setCycle" | "clearCycle", time: number) => {
        if (command === "addMarker") patchMetadata({ audioMarkers: [...markers, createAudioMarker(time)] });
        else if (command === "setCycle" && range) patchMetadata({ audioCycle: { enabled: true, start: range.start, end: range.end } });
        else if (command === "clearCycle") patchMetadata({ audioCycle: { enabled: false, start: 0, end: 0 } });
    };

    const setFadeShape = (shape: CanvasAudioFadeShape) => {
        commitClips(clips.map((clip) => (selectedSet.has(clip.id) ? { ...clip, fadeInShape: shape, fadeOutShape: shape } : clip)));
    };

    /** Compact-menu keys arrive as `group:command` and `opt:snap:beat`-style values; see `audioCompactMenuItems`. */
    const handleCompactMenu = ({ key }: { key: string }) => {
        const [group, ...rest] = key.split(":");
        const command = rest.join(":");
        if (group === "edit") handleEditCommand(command as AudioEditCommand);
        else if (group === "track") handleTrackCommand(command as AudioTrackCommand);
        else if (group === "clip") handleClipCommand(command as AudioClipCommand);
        else if (group === "view") handleViewCommand(command as AudioViewCommand);
        else if (group === "automation") handleAutomationCommand(command as AudioAutomationCommand);
        else handleOptionCommand(command as AudioOptionCommand);
    };

    const handleOptionCommand = (command: AudioOptionCommand) => {
        if (command === "grid") patchMetadata({ audioGrid: { ...grid, enabled: !grid.enabled } });
        else if (command === "loop") toggleClipField(selectedClipIds, "loop");
        else if (command === "reverse") toggleClipField(selectedClipIds, "reversed");
        else if (command === "autoCrossfade") setAutoCrossfade((prev) => !prev);
        else if (command.startsWith("snap:")) patchMetadata({ audioGrid: { ...grid, snap: command.slice(5) as CanvasAudioSnap } });
        else setFadeShape(command.slice(10) as CanvasAudioFadeShape);
    };

    const addClip = async (trackId: string, node: CanvasNodeData, at: number | null) => {
        const duration = await resolveAudioNodeDuration(node);
        commitClips([...projectClips, { id: nanoid(), trackId, sourceNodeId: node.id, start: Math.max(0, at ?? nextClipStart(projectClips, trackId)), offset: 0, duration }]);
        setPicker(null);
    };

    /** Export runs one at a time: the button swaps to a disabled label until the render and upload finish. */
    const runExport = async (task: () => Promise<void>) => {
        setExporting(true);
        try {
            await task();
        } finally {
            setExporting(false);
        }
    };

    const startRecording = async () => {
        if (recordRef.current) return;
        const track = armedTrack;
        if (!track) {
            message.warning(t("canvas.audioStudio.recordNoArm"));
            return;
        }
        if (!(await unlockAudio())) return;
        await waitForGraph();
        const graph = graphRef.current;
        if (!graph) return;
        let session: AudioRecordSession | null = null;
        try {
            session = await startAudioRecording(capture.gainDb);
        } catch (error) {
            message.error(t((error as DOMException | null)?.name === "NotAllowedError" ? "canvas.audioStudio.recordDenied" : "canvas.audioStudio.recordFailed"));
            return;
        }
        if (!session) {
            message.error(t("canvas.audioStudio.recordFailed"));
            return;
        }
        const transport = Tone.getTransport();
        const punchTake = capture.mode === "punch" && punch.enabled && punch.out > punch.in;
        const position = Math.max(0, transport.seconds);
        const clipStart = punchTake ? Math.max(punch.in, position) : position;
        // Everything is anchored on the audio clock: the clicks lead in, then the transport rolls from the playhead
        // while the take itself is cut out of the capture, so a punch take records its range and nothing else.
        const firstClick = Tone.now() + RECORD_LEAD_SECONDS;
        const startAt = firstClick + countIn * barSeconds(tempo, meter);
        const lead = startAt - session.startedAt;
        const beat = beatSeconds(tempo, meter);
        for (let index = 0; index < countIn * meter.numerator; index += 1) graph.clickMetronome(firstClick + index * beat, index % meter.numerator === 0);
        transport.stop();
        // Seek while stopped, then start the clock at the future anchor: `start(time, offset)` would read the offset as ticks.
        transport.seconds = position;
        transport.start(startAt);
        setPlaying(true);
        setRecording(true);
        recordRef.current = { session, trackId: track.id, clipStart, from: lead + (clipStart - position), until: punchTake ? lead + (punch.out - position) : null, punchOut: punchTake ? punch.out : null, count: audioTrackClips(projectClips, track.id).length + 1, disconnect: connectAudioGraphMonitor(graph, track.id, session.monitor) };
    };

    const finishRecording = async () => {
        const active = recordRef.current;
        if (!active) return;
        recordRef.current = null;
        setRecording(false);
        setPlaying(false);
        active.disconnect();
        Tone.getTransport().pause();
        const buffer = await active.session.stop();
        if (!buffer || !project) return;
        const performed = Math.min(buffer.duration, active.until ?? Infinity) - active.from;
        if (performed < AUDIO_MIN_CLIP_SECONDS) {
            message.warning(t("canvas.audioStudio.recordEmpty"));
            return;
        }
        const latency = capture.inputLatencyMs / 1000;
        await onRecorded(project, cutRecordedTake(buffer, active.from, active.from + performed, capture.channels), { trackId: active.trackId, start: Math.max(0, active.clipStart - latency), duration: performed, name: t("canvas.audioStudio.takeName", { index: active.count }) });
    };
    finishRecordRef.current = finishRecording;

    const handleKeyDown = (event: KeyboardEvent) => {
        const target = event.target;
        if (target instanceof HTMLElement && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
        const key = event.key;
        // An automation point handles its own arrows, Delete and Enter; anything else still reaches the workspace.
        if (target instanceof HTMLElement && target.dataset.automationPoint && (key.startsWith("Arrow") || key === "Delete" || key === "Backspace" || key === "Enter")) return;
        const lower = key.toLowerCase();
        const mod = event.ctrlKey || event.metaKey;
        const consume = () => {
            event.preventDefault();
            event.stopImmediatePropagation();
        };
        if (mod && !event.altKey) {
            if (lower === "c") { consume(); copyClips(); return; }
            if (lower === "x") { consume(); cutClips(); return; }
            if (lower === "v") { consume(); pasteClips(); return; }
            if (lower === "d") { consume(); duplicateClips(selectedClipIds); return; }
            if (lower === "k") { consume(); splitClips(selectedClipIds, Tone.getTransport().seconds); return; }
            if (lower === "a") { consume(); setSelectedClipIds(projectClips.map((clip) => clip.id)); return; }
            return;
        }
        // A focused piano-roll grid owns its arrows, Delete and Escape; Space still drives the transport.
        const inRoll = target instanceof HTMLElement && Boolean(target.closest("[data-midi-roll]"));
        if (inRoll && key !== " ") return;
        if (key === " ") { consume(); void togglePlay(); return; }
        if (key === "Enter") {
            consume();
            // A focused clip opens the inspector, a focused MIDI region the piano roll; anywhere else Enter returns to the start.
            if (target instanceof HTMLElement && target.dataset.midiRegion) {
                setView("roll");
                return;
            }
            if (target instanceof HTMLElement && target.dataset.clipId) {
                dock.reveal("inspector");
                setDockOpen(true);
                overlayDockRef.current?.focus();
                return;
            }
            seek(0);
            return;
        }
        if (key === "Escape") {
            if (dockOverlay) {
                consume();
                setDockOpen(false);
                dockToggleRef.current?.focus();
                return;
            }
            if (bandGestureRef.current || clipGestureRef.current || regionGestureRef.current) {
                const clip = clipGestureRef.current;
                const region = regionGestureRef.current;
                const clipStart = clip ? clip.startClips.find((item) => item.id === clip.sourceId) : undefined;
                const regionStart = region ? region.startRegions.find((item) => item.id === region.regionId) : undefined;
                clip?.ghost?.remove();
                if (clip && clipStart) paintClipGeometry(clip.element, clipStart, pxPerSecond);
                if (region && regionStart) paintRegionGeometry(region.element, regionStart, ppqn, tempo, pxPerSecond);
                bandGestureRef.current = null;
                clipGestureRef.current = null;
                regionGestureRef.current = null;
                setBand(null);
                consume();
                return;
            }
            if (selectedClipIds.length || range || selectedRegionId) {
                consume();
                setSelectedClipIds([]);
                setRange(null);
                setSelectedRegionId("");
                return;
            }
            return;
        }
        if (key === "Delete" || key === "Backspace") {
            consume();
            if (selectedClipIds.length) removeClips(selectedClipIds);
            else if (selectedRegionId) removeRegions([selectedRegionId]);
            return;
        }
        if (key === "ArrowLeft" || key === "ArrowRight") {
            consume();
            const step = event.shiftKey ? barSeconds(tempo, meter) : snapStep || beatSeconds(tempo, meter);
            nudgeClips(key === "ArrowLeft" ? -step : step);
            return;
        }
        if (key === "ArrowUp" || key === "ArrowDown") { consume(); moveClipsTrack(key === "ArrowUp" ? -1 : 1); return; }
        if (key === "Home") { consume(); seek(0); return; }
        if (key === "End") { consume(); seek(projectDuration); return; }
        if (key === "+" || key === "=") { consume(); zoomBy(ZOOM_STEP); return; }
        if (key === "-" || key === "_") { consume(); zoomBy(1 / ZOOM_STEP); return; }
        if (lower === "m" && selectedTrack) { consume(); updateTrack(selectedTrack.id, { mute: !selectedTrack.mute }); return; }
        if (lower === "s" && selectedTrack) { consume(); updateTrack(selectedTrack.id, { solo: !selectedTrack.solo }); return; }
        if (lower === "r" && event.shiftKey && selectedTrack) { consume(); updateTrack(selectedTrack.id, { armed: !selectedTrack.armed }); return; }
        if (lower === "l" && cycle.end > cycle.start) { consume(); patchMetadata({ audioCycle: { ...cycle, enabled: !cycle.enabled } }); return; }
        if (lower === "t") { consume(); patchMetadata({ audioMetronome: { ...metronome, enabled: !metronome.enabled } }); return; }
        if (lower === "x") { consume(); handleClipCommand("crossfade"); return; }
        const nextTool = TOOL_HOTKEYS[lower];
        if (nextTool) setTool(nextTool);
    };
    shortcutsRef.current = handleKeyDown;

    useEffect(() => {
        const onKeyDown = (event: KeyboardEvent) => shortcutsRef.current(event);
        window.addEventListener("keydown", onKeyDown, true);
        return () => window.removeEventListener("keydown", onKeyDown, true);
    }, []);

    if (!project) {
        return (
            <div className="thin-scrollbar flex min-h-0 flex-1 flex-col items-center justify-center gap-3 overflow-y-auto px-6 py-8 text-center">
                <SlidersVertical className="size-7" style={{ color: theme.node.muted }} />
                <p className="text-sm" style={{ color: theme.node.muted }}>
                    {t("canvas.audioStudio.pickProject")}
                </p>
                {projects.length ? (
                    <div className="flex w-full max-w-xs flex-col gap-0.5">
                        {projects.map((item) => (
                            <button key={item.id} type="button" className={LIST_ACTION_CLASS} style={{ color: theme.node.text }} onClick={() => onSelectProject(item.id)}>
                                <SlidersVertical className="size-3.5 shrink-0" style={{ color: theme.node.muted }} />
                                <span className="min-w-0 flex-1 truncate">{item.title || t("canvas.node.untitled")}</span>
                                <span className="shrink-0 tabular-nums" style={{ color: theme.node.muted }}>
                                    {t("canvas.audioStudio.summary", { tracks: audioProjectTracks(item).length, clips: audioProjectClips(item).length })}
                                </span>
                            </button>
                        ))}
                    </div>
                ) : (
                    <p className="text-sm" style={{ color: theme.node.muted }}>
                        {t("canvas.audioStudio.noProjects")}
                    </p>
                )}
            </div>
        );
    }

    const gridImages = grid.enabled ? [`repeating-linear-gradient(to right, ${theme.toolbar.border} 0 1px, transparent 1px ${gridStep * pxPerSecond}px)`, beatPx >= 14 ? `repeating-linear-gradient(to right, ${theme.canvas.line} 0 1px, transparent 1px ${beatPx}px)` : ""].filter(Boolean).join(", ") : undefined;
    let labelStep = gridStep;
    while (labelStep * pxPerSecond < GRID_LABEL_MIN_PX) labelStep *= 2;
    while (timelineSeconds / labelStep > GRID_LABEL_MAX) labelStep *= 2;
    const labels: number[] = [];
    for (let index = 0; index * labelStep <= timelineSeconds; index += 1) labels.push(index * labelStep);
    const showBars = labelStep >= barSeconds(tempo, meter);
    const snapLabel = t(AUDIO_SNAP_LABEL_KEYS[grid.snap]);
    const hint = t(HINTS[tool]);
    const fadeShape = primaryClip?.fadeInShape ?? "linear";
    const selectedTrackLanes = selectedTrack ? automationLanesForTrack(projectAutomation, selectedTrack.id) : EMPTY_AUTOMATION;
    const automationFlags = {
        visible: !selectedTrack?.collapsed,
        hasLanes: Boolean(selectedTrackLanes.length),
        canAddGain: Boolean(selectedTrack && !findAutomationLane(projectAutomation, selectedTrack.id, AUDIO_AUTOMATION_GAIN)),
        canAddPan: Boolean(selectedTrack && !findAutomationLane(projectAutomation, selectedTrack.id, AUDIO_AUTOMATION_PAN)),
        canAddSend: Boolean(selectedTrack?.sends?.some((send) => !findAutomationLane(projectAutomation, selectedTrack.id, audioAutomationSendTarget(send.id)))),
    };
    const optionFlags = { grid: grid.enabled, snap: grid.snap, fadeShape, hasClip: Boolean(primaryClip), loop: Boolean(primaryClip?.loop), reversed: Boolean(primaryClip?.reversed), autoCrossfade };
    const renderAudioPanel = (panelId: string) => {
        if (panelId === "inspector")
            return (
                <AudioInspectorPanel
                    tracks={tracks}
                    selectedTrackId={selectedTrack?.id ?? ""}
                    clips={clips}
                    selectedClipIds={selectedClipIds}
                    masterGain={masterGain}
                    automation={projectAutomation}
                    onSelectTrack={setSelectedTrackId}
                    onTrackPatch={updateTrack}
                    onMixPreview={previewTrackMix}
                    onMasterGain={(value) => patchMetadata({ audioMasterGain: value })}
                />
            );
        if (panelId === "automation")
            return (
                <AudioAutomationPanel
                    automation={projectAutomation}
                    tracks={tracks}
                    selectedTrackId={selectedTrack?.id ?? ""}
                    onAdd={addAutomationLane}
                    onPatch={patchAutomation}
                    onRemove={removeAutomationLane}
                    onClearPoints={(laneId) => patchAutomation(laneId, { points: [] })}
                />
            );
        if (panelId === "history") return <PanelShell icon={History} hint={t("canvas.audioStudio.historyHint")} theme={theme} />;
        if (panelId === "media") return <AudioMediaPoolPanel audioNodes={audioNodes} canAdd={Boolean(selectedTrack && canHostClips(selectedTrack))} onAdd={(node) => void addClip(selectedTrack?.id ?? "", node, null)} onGoCanvas={onBack} />;
        if (panelId === "projectSettings") return <AudioProjectSettingsPanel tempo={tempo} meter={meter} grid={grid} cycle={cycle} punch={punch} metronome={metronome} capture={capture} countIn={countIn} masterGain={masterGain} onPatch={patchMetadata} />;
        if (panelId === "markers")
            return (
                <div className="thin-scrollbar flex min-h-0 flex-1 flex-col overflow-y-auto p-1.5 glass-card">
                    <button type="button" className={LIST_ACTION_CLASS} style={{ color: theme.node.text }} onClick={() => patchMetadata({ audioMarkers: [...markers, createAudioMarker(Tone.getTransport().seconds)] })}>
                        <Plus className="size-3.5 shrink-0" style={{ color: theme.node.muted }} />
                        {t("canvas.audioStudio.markerAtPlayhead")}
                    </button>
                    {markers.length ? (
                        markers.map((marker) => (
                            <div key={marker.id} className="flex items-center gap-1.5 px-1 py-0.5">
                                <button type="button" className="w-14 shrink-0 rounded-md px-0.5 text-left text-xs tabular-nums transition hover:bg-hover" style={{ color: theme.node.muted }} onClick={() => seek(marker.time)}>
                                    {formatAudioTime(marker.time)}
                                </button>
                                <input
                                    className="min-w-0 flex-1 bg-transparent text-sm outline-none"
                                    style={{ color: theme.node.text }}
                                    value={marker.name || ""}
                                    placeholder={t("canvas.audioStudio.markerName")}
                                    aria-label={t("canvas.audioStudio.markerName")}
                                    onChange={(event) => {
                                        const name = event.target.value;
                                        patchMetadata({ audioMarkers: markers.map((item) => (item.id === marker.id ? { ...item, name } : item)) });
                                    }}
                                />
                                <button
                                    type="button"
                                    className={COMPACT_ACTION_CLASS}
                                    style={{ color: theme.node.muted }}
                                    aria-label={t("canvas.audioStudio.removeMarker")}
                                    title={t("canvas.audioStudio.removeMarker")}
                                    onClick={() => patchMetadata({ audioMarkers: markers.filter((item) => item.id !== marker.id) })}
                                >
                                    <Trash2 className="size-3.5" />
                                </button>
                            </div>
                        ))
                    ) : (
                        <p className="px-1 py-2 text-sm" style={{ color: theme.node.placeholder }}>
                            {t("canvas.audioStudio.noMarkers")}
                        </p>
                    )}
                </div>
            );
        return null;
    };

    return (
        <div className={`flex min-h-0 min-w-0 flex-1 flex-col pt-14 ${FOCUS_RING_CLASS}`} style={{ "--audio-focus": theme.node.activeStroke } as React.CSSProperties}>
            <div className={`${STUDIO_BAR_CLASS} glass-surface h-11`}>
                <IconAction label={t("canvas.workspace.back")} onClick={onBack}>
                    <ArrowLeft className="size-3.5" />
                </IconAction>
                <Select
                    size="small"
                    variant="borderless"
                    className={`${CONTROL_CLASS} min-w-[120px] max-w-[220px]`}
                    value={project.id}
                    placeholder={t("canvas.audioStudio.pickProject")}
                    options={projects.map((item) => ({ value: item.id, label: item.title || t("canvas.node.untitled") }))}
                    popupMatchSelectWidth={false}
                    styles={{ popup: { root: { zIndex: 1300 } } }}
                    aria-label={t("canvas.audioStudio.pickProject")}
                    onChange={onSelectProject}
                />
                <span className={STUDIO_DIVIDER_CLASS} style={{ background: theme.toolbar.border }} />
                <IconAction label={t("canvas.audioStudio.toStart")} className="hidden lg:grid" onClick={() => seek(0)}>
                    <SkipBack className="size-3.5" />
                </IconAction>
                <IconAction label={t(playing ? "canvas.audioStudio.pause" : "canvas.audioStudio.play")} onClick={() => (playing ? pausePlayback() : void togglePlay())} disabled={!playing && !hasContent}>
                    {playing ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
                </IconAction>
                <IconAction label={t("canvas.audioStudio.pause")} className="hidden lg:grid" onClick={pausePlayback} disabled={!playing}>
                    <Pause className="size-3.5" />
                </IconAction>
                <IconAction label={t("canvas.audioStudio.stop")} className="hidden lg:grid" onClick={stopPlayback} disabled={!playing}>
                    <CircleStop className="size-3.5" />
                </IconAction>
                <button
                    type="button"
                    className={`${FLAT_ACTION_CLASS} hidden lg:grid`}
                    style={recording ? { background: theme.node.dangerSoft, color: theme.node.danger } : { color: theme.node.muted }}
                    aria-label={t(recording ? "canvas.audioStudio.recordStop" : "canvas.audioStudio.record")}
                    title={t(recording ? "canvas.audioStudio.recordStop" : "canvas.audioStudio.record")}
                    aria-pressed={recording}
                    onClick={() => void (recording ? finishRecording() : startRecording())}
                >
                    <Circle className="size-3.5" fill={recording ? "currentColor" : "none"} />
                </button>
                <span ref={positionRef} role="timer" aria-label={t("canvas.audioStudio.position")} className="w-24 shrink-0 text-center text-sm tabular-nums" style={{ color: playing ? theme.node.text : theme.node.muted }}>
                    1.01.000
                </span>
                <span ref={timeRef} className="hidden w-12 shrink-0 text-center text-sm tabular-nums lg:block" style={{ color: theme.node.muted }}>
                    0:00
                </span>
                <span className={`${STUDIO_DIVIDER_CLASS} hidden lg:block`} style={{ background: theme.toolbar.border }} />
                <InputNumber size="small" className={`${CONTROL_CLASS} !hidden !w-16 lg:!inline-flex`} min={20} max={300} step={1} value={tempo} aria-label={t("canvas.audioStudio.tempo")} onChange={(value) => value !== null && patchMetadata({ audioTempo: Math.min(300, Math.max(20, value)) })} />
                <Select
                    size="small"
                    className={`${CONTROL_CLASS} !hidden lg:!inline-flex lg:!w-[62px]`}
                    value={`${meter.numerator}/${meter.denominator}`}
                    options={AUDIO_METER_OPTIONS.map((value) => ({ value, label: value }))}
                    popupMatchSelectWidth={false}
                    styles={{ popup: { root: { zIndex: 1300 } } }}
                    aria-label={t("canvas.audioStudio.meter")}
                    onChange={(value) => {
                        const [numerator, denominator] = value.split("/").map(Number);
                        patchMetadata({ audioTimeSignature: { numerator, denominator } });
                    }}
                />
                <button
                    type="button"
                    className={`${FLAT_ACTION_CLASS} hidden lg:grid`}
                    style={cycleLoop ? { background: theme.node.warningSoft, color: theme.node.warning } : { color: theme.node.muted }}
                    aria-label={t("canvas.audioStudio.cycle")}
                    title={t("canvas.audioStudio.cycle")}
                    aria-pressed={cycleLoop}
                    disabled={cycle.end <= cycle.start}
                    onClick={() => patchMetadata({ audioCycle: { ...cycle, enabled: !cycle.enabled } })}
                >
                    <Repeat className="size-3.5" />
                </button>
                <button
                    type="button"
                    className={`${FLAT_ACTION_CLASS} hidden lg:grid`}
                    style={metronome.enabled ? { background: theme.toolbar.activeBg, color: theme.toolbar.activeText } : { color: theme.node.muted }}
                    aria-label={t("canvas.audioStudio.metronome")}
                    title={t("canvas.audioStudio.metronome")}
                    aria-pressed={metronome.enabled}
                    onClick={() => patchMetadata({ audioMetronome: { ...metronome, enabled: !metronome.enabled } })}
                >
                    <Timer className="size-3.5" />
                </button>
                <span className="min-w-0 flex-1" />
                <span className="hidden w-12 shrink-0 text-center text-sm tabular-nums lg:block" style={{ color: theme.node.muted }}>
                    {Math.round((pxPerSecond / AUDIO_DEFAULT_PX_PER_SECOND) * 100)}%
                </span>
                <button type="button" className="hidden h-7 shrink-0 items-center gap-1 rounded-full px-2.5 text-sm transition hover:bg-hover disabled:opacity-30 disabled:hover:bg-transparent lg:flex hover:bg-hover dark:disabled:hover:bg-transparent" style={{ color: theme.node.text }} disabled={exporting} onClick={() => void runExport(() => onOutput(project))}>
                    <AudioWaveform className="size-3.5" />
                    {t(exporting ? "canvas.audioStudio.exporting" : "canvas.audioStudio.saveAsNode")}
                </button>
                <button
                    ref={dockToggleRef}
                    type="button"
                    className={`${FLAT_ACTION_CLASS} hidden md:grid lg:hidden`}
                    style={dockOpen ? { background: theme.toolbar.activeBg, color: theme.toolbar.activeText } : { color: theme.node.muted }}
                    aria-label={t("canvas.audioStudio.panelToggle")}
                    title={t("canvas.audioStudio.panelToggle")}
                    aria-pressed={dockOpen}
                    onClick={() => setDockOpen((prev) => !prev)}
                >
                    <PanelRight className="size-3.5" />
                </button>
                <Popover
                    placement="bottomRight"
                    trigger="click"
                    classNames={{ container: "glass-raised" }}
                    styles={{ container: { background: "var(--glass-strong)" } }}
                    content={
                        <div className="flex w-56 flex-col gap-2 text-sm" style={{ color: theme.node.text }}>
                            <div className="flex items-center gap-1">
                                <IconAction label={t("canvas.audioStudio.toStart")} onClick={() => seek(0)}>
                                    <SkipBack className="size-3.5" />
                                </IconAction>
                                <IconAction label={t("canvas.audioStudio.stop")} onClick={stopPlayback} disabled={!playing}>
                                    <CircleStop className="size-3.5" />
                                </IconAction>
                                <button
                                    type="button"
                                    className={FLAT_ACTION_CLASS}
                                    style={recording ? { background: theme.node.dangerSoft, color: theme.node.danger } : { color: theme.node.muted }}
                                    aria-label={t(recording ? "canvas.audioStudio.recordStop" : "canvas.audioStudio.record")}
                                    title={t(recording ? "canvas.audioStudio.recordStop" : "canvas.audioStudio.record")}
                                    aria-pressed={recording}
                                    onClick={() => void (recording ? finishRecording() : startRecording())}
                                >
                                    <Circle className="size-3.5" fill={recording ? "currentColor" : "none"} />
                                </button>
                                <span className="min-w-0 flex-1" />
                                <button
                                    type="button"
                                    className={FLAT_ACTION_CLASS}
                                    style={cycleLoop ? { background: theme.node.warningSoft, color: theme.node.warning } : { color: theme.node.muted }}
                                    aria-label={t("canvas.audioStudio.cycle")}
                                    title={t("canvas.audioStudio.cycle")}
                                    aria-pressed={cycleLoop}
                                    disabled={cycle.end <= cycle.start}
                                    onClick={() => patchMetadata({ audioCycle: { ...cycle, enabled: !cycle.enabled } })}
                                >
                                    <Repeat className="size-3.5" />
                                </button>
                                <button
                                    type="button"
                                    className={FLAT_ACTION_CLASS}
                                    style={metronome.enabled ? { background: theme.toolbar.activeBg, color: theme.toolbar.activeText } : { color: theme.node.muted }}
                                    aria-label={t("canvas.audioStudio.metronome")}
                                    title={t("canvas.audioStudio.metronome")}
                                    aria-pressed={metronome.enabled}
                                    onClick={() => patchMetadata({ audioMetronome: { ...metronome, enabled: !metronome.enabled } })}
                                >
                                    <Timer className="size-3.5" />
                                </button>
                            </div>
                            <div className="flex items-center gap-1.5">
                                <span className="w-10 shrink-0" style={{ color: theme.node.muted }}>
                                    {t("canvas.audioStudio.tempo")}
                                </span>
                                <InputNumber size="small" className="!w-16" min={20} max={300} step={1} value={tempo} aria-label={t("canvas.audioStudio.tempo")} onChange={(value) => value !== null && patchMetadata({ audioTempo: Math.min(300, Math.max(20, value)) })} />
                                <Select
                                    size="small"
                                    className="w-[62px]"
                                    value={`${meter.numerator}/${meter.denominator}`}
                                    options={AUDIO_METER_OPTIONS.map((value) => ({ value, label: value }))}
                                    popupMatchSelectWidth={false}
                                    styles={{ popup: { root: { zIndex: 1300 } } }}
                                    aria-label={t("canvas.audioStudio.meter")}
                                    onChange={(value) => {
                                        const [numerator, denominator] = value.split("/").map(Number);
                                        patchMetadata({ audioTimeSignature: { numerator, denominator } });
                                    }}
                                />
                            </div>
                            <div className="flex items-center gap-1">
                                <button type="button" className={FLAT_ACTION_CLASS} style={{ color: theme.node.muted }} aria-label={t("canvas.audioStudio.zoomIn")} title={t("canvas.audioStudio.zoomIn")} onClick={() => zoomBy(ZOOM_STEP)}>
                                    <ZoomIn className="size-3.5" />
                                </button>
                                <button type="button" className={FLAT_ACTION_CLASS} style={{ color: theme.node.muted }} aria-label={t("canvas.audioStudio.zoomOut")} title={t("canvas.audioStudio.zoomOut")} onClick={() => zoomBy(1 / ZOOM_STEP)}>
                                    <ZoomOut className="size-3.5" />
                                </button>
                                <span className="min-w-0 flex-1 text-center tabular-nums" style={{ color: theme.node.muted }}>
                                    {Math.round((pxPerSecond / AUDIO_DEFAULT_PX_PER_SECOND) * 100)}%
                                </span>
                                <button type="button" className={FLAT_ACTION_CLASS} style={{ color: theme.node.muted }} aria-label={t("canvas.audioStudio.zoomFit")} title={t("canvas.audioStudio.zoomFit")} onClick={zoomFit}>
                                    <Search className="size-3.5" />
                                </button>
                            </div>
                            <button type="button" className="flex items-center gap-1.5 rounded-md px-1.5 py-1 text-left transition hover:bg-hover disabled:opacity-30 disabled:hover:bg-transparent hover:bg-hover dark:disabled:hover:bg-transparent" style={{ color: theme.node.text }} disabled={exporting} onClick={() => void runExport(() => onOutput(project))}>
                                <AudioWaveform className="size-3.5" />
                                {t(exporting ? "canvas.audioStudio.exporting" : "canvas.audioStudio.saveAsNode")}
                            </button>
                        </div>
                    }
                >
                    <button type="button" className={`${FLAT_ACTION_CLASS} lg:hidden`} aria-label={t("canvas.audioStudio.menuMore")} title={t("canvas.audioStudio.menuMore")}>
                        <Ellipsis className="size-3.5" />
                    </button>
                </Popover>
            </div>

            {/* !py-0.5 keeps the row at its 36px min-height now that the controls are 28px: 28 + 4 + 1px border fits, 28 + 8 + 1px would grow it to 37. */}
            <div className={`${STUDIO_OPTIONS_CLASS} glass-surface !py-0.5`} style={{ color: theme.node.muted, borderColor: theme.toolbar.border }}>
                <ImageSettingsTheme theme={theme}>
                    <span className="hidden md:flex [&_button]:!h-7">
                        <AudioMenus
                            clip={primaryClip}
                            snap={grid.snap}
                            view={{ grid: grid.enabled, cycle: cycleLoop, metronome: metronome.enabled }}
                            automation={automationFlags}
                            hasClips={Boolean(projectClips.length)}
                            hasSelection={Boolean(selectedClipIds.length)}
                            hasRange={Boolean(range)}
                            hasCycleRange={cycle.end > cycle.start}
                            canPaste={clipboardCount > 0}
                            canRemoveTrack={tracks.length > 1 && (!selectedTrack || audioTrackType(selectedTrack) !== "master")}
                            exporting={exporting}
                            onEdit={handleEditCommand}
                            onTrack={(command) => handleTrackCommand(command)}
                            onClip={(command) => handleClipCommand(command)}
                            onView={handleViewCommand}
                            onAutomation={handleAutomationCommand}
                        />
                        <span className="[&_button]:!h-7">
                            <DockWindowMenu defs={AUDIO_DOCK_PANELS} layout={dock.layout} onToggle={dock.toggle} onReset={dock.reset} />
                        </span>
                    </span>
                    <span className="hidden md:inline-flex lg:hidden">
                        <Dropdown
                            placement="bottomLeft"
                            styles={{ root: { zIndex: 1300 } }}
                            menu={{
                                ...AUDIO_MENU_POPUP,
                                items: prefixMenuKeys(audioOptionItems(t, optionFlags), "opt:"),
                                onClick: ({ key }) => handleOptionCommand(key.slice(4) as AudioOptionCommand),
                            }}
                        >
                            <button type="button" className={`${AUDIO_MENU_BUTTON_CLASS} !h-7`} aria-label={t("canvas.audioStudio.menuOptions")} title={t("canvas.audioStudio.menuOptions")}>
                                {t("canvas.audioStudio.menuOptions")}
                                <ChevronDown className="size-3" />
                            </button>
                        </Dropdown>
                    </span>
                    <span className="md:hidden">
                        <Dropdown
                            placement="bottomLeft"
                            styles={{ root: { zIndex: 1300 } }}
                            menu={{ ...AUDIO_MENU_POPUP, items: audioCompactMenuItems(t, { clip: primaryClip, view: { grid: grid.enabled, cycle: cycleLoop, metronome: metronome.enabled }, automation: automationFlags, hasClips: Boolean(projectClips.length), hasSelection: Boolean(selectedClipIds.length), hasRange: Boolean(range), hasCycleRange: cycle.end > cycle.start, canPaste: clipboardCount > 0, canRemoveTrack: tracks.length > 1 && (!selectedTrack || audioTrackType(selectedTrack) !== "master"), exporting, ...optionFlags }), onClick: handleCompactMenu }}
                        >
                            <button type="button" className={`${AUDIO_MENU_BUTTON_CLASS} !h-7`} aria-label={t("canvas.audioStudio.menuOptions")} title={t("canvas.audioStudio.menuOptions")}>
                                {t("canvas.audioStudio.menuOptions")}
                                <ChevronDown className="size-3" />
                            </button>
                        </Dropdown>
                    </span>
                    <span className="hidden w-20 shrink-0 truncate font-medium lg:inline" style={{ color: theme.node.text }}>
                        {t(TOOL_LABELS[tool])}
                    </span>
                    <span className="hidden min-w-0 flex-wrap items-center gap-x-3 gap-y-1.5 lg:flex">
                        <OptionToggle label={t("canvas.audioStudio.grid")} checked={grid.enabled} onChange={(checked) => patchMetadata({ audioGrid: { ...grid, enabled: checked } })} />
                        <label className={CONTROL_GROUP_CLASS}>
                            <span>{t("canvas.audioStudio.snap")}</span>
                            <Select
                                size="small"
                                className={`${CONTROL_CLASS} w-[74px]`}
                                value={grid.snap}
                                options={AUDIO_SNAP_OPTIONS.map((value) => ({ value, label: t(AUDIO_SNAP_LABEL_KEYS[value]) }))}
                                popupMatchSelectWidth={false}
                                styles={{ popup: { root: { zIndex: 1300 } } }}
                                aria-label={t("canvas.audioStudio.snap")}
                                onChange={(value) => patchMetadata({ audioGrid: { ...grid, snap: value } })}
                            />
                        </label>
                        {primaryClip ? (
                            <>
                                <label className={CONTROL_GROUP_CLASS}>
                                    <span>{t("canvas.audioStudio.fadeShape")}</span>
                                    <Select
                                        size="small"
                                        className={`${CONTROL_CLASS} w-[88px]`}
                                        value={fadeShape}
                                        options={AUDIO_FADE_SHAPE_OPTIONS.map((value) => ({ value, label: t(AUDIO_FADE_SHAPE_LABEL_KEYS[value]) }))}
                                        popupMatchSelectWidth={false}
                                        styles={{ popup: { root: { zIndex: 1300 } } }}
                                        aria-label={t("canvas.audioStudio.fadeShape")}
                                        onChange={(value) => setFadeShape(value)}
                                    />
                                </label>
                                <label className={CONTROL_GROUP_CLASS}>
                                    <span className="shrink-0">{t("canvas.audioStudio.clipGain")}</span>
                                    <AudioValueInput
                                        label={t("canvas.audioStudio.clipGain")}
                                        value={Math.round(clampClipGain(primaryClip.gain ?? 1) * 100)}
                                        format={(value) => String(Math.round(value))}
                                        parse={(text) => parseGainPercent(text, 200)}
                                        onCommit={(value) => commitClips(clips.map((clip) => (selectedSet.has(clip.id) ? { ...clip, gain: clampClipGain(Math.round(value) / 100) } : clip)))}
                                        className="h-7 w-12 shrink-0"
                                    />
                                    <span className="shrink-0">%</span>
                                </label>
                                <OptionToggle label={t("canvas.audioStudio.loop")} checked={Boolean(primaryClip.loop)} onChange={() => toggleClipField(selectedClipIds, "loop")} />
                                <OptionToggle label={t("canvas.audioStudio.reverse")} checked={Boolean(primaryClip.reversed)} onChange={() => toggleClipField(selectedClipIds, "reversed")} />
                            </>
                        ) : null}
                        <OptionToggle label={t("canvas.audioStudio.autoCrossfade")} checked={autoCrossfade} onChange={setAutoCrossfade} />
                    </span>
                </ImageSettingsTheme>
                <span className="min-w-0 flex-1 truncate">{hint}</span>
                {grid.snap !== "off" ? (
                    <span className="flex shrink-0 items-center gap-1">
                        <Magnet className="size-3" />
                        {snapLabel}
                    </span>
                ) : null}
            </div>

            {picker && pickerTrack ? (
                <div className="thin-scrollbar mx-3 mb-2 max-h-44 shrink-0 overflow-y-auto rounded-xl border p-2 glass-raised" style={{ borderColor: theme.toolbar.border }}>
                    <div className="flex items-center gap-2 px-1 pb-1">
                        <span className="min-w-0 flex-1 truncate text-sm" style={{ color: theme.node.muted }}>
                            {t("canvas.audioStudio.pickAudio", { track: pickerTrack.name || trackPlaceholder(pickerTrack) })}
                        </span>
                        <IconAction label={t("canvas.audioStudio.close")} onClick={() => setPicker(null)} compact>
                            <X className="size-3.5" />
                        </IconAction>
                    </div>
                    {audioNodes.length ? (
                        audioNodes.map((node) => (
                            <button key={node.id} type="button" className={LIST_ACTION_CLASS} style={{ color: theme.node.text }} onClick={() => void addClip(picker.trackId, node, picker.at)}>
                                <Music2 className="size-3.5 shrink-0" style={{ color: theme.node.muted }} />
                                <span className="min-w-0 flex-1 truncate">{node.title || t("canvas.node.untitled")}</span>
                                <span className="shrink-0 text-xs tabular-nums" style={{ color: theme.node.muted }}>
                                    {formatAudioTime((node.metadata?.durationMs || 0) / 1000)}
                                </span>
                            </button>
                        ))
                    ) : (
                        <p className="px-2 py-1 text-sm" style={{ color: theme.node.muted }}>
                            {t("canvas.audioStudio.noAudio")}
                        </p>
                    )}
                </div>
            ) : null}

            <DockArea
                defs={AUDIO_DOCK_PANELS}
                layout={dock.layout}
                renderPanel={renderAudioPanel}
                onActivate={dock.activate}
                onMove={dock.move}
                onResize={dock.resize}
                rowClassName="flex-col md:flex-row"
                edgeClassName={{ left: "hidden lg:flex", bottom: "hidden lg:flex", right: dockOverlay ? "absolute inset-y-0 right-0 z-40 flex outline-none max-md:!hidden md:flex lg:static lg:z-auto glass-raised" : "hidden outline-none lg:flex" }}
                edgeProps={{ right: { ref: overlayDockRef, tabIndex: -1, onKeyDown: trapDockFocus, "aria-label": t("canvas.audioStudio.dockInspector") } }}
            >
                <div className="thin-scrollbar flex h-10 shrink-0 flex-row items-center gap-0.5 overflow-x-auto overflow-y-hidden px-1.5 md:h-auto md:flex-col md:overflow-x-hidden md:overflow-y-auto md:py-2 glass-surface">
                    {TOOLS.map((item) => {
                        const Icon = item.icon;
                        const active = tool === item.id;
                        return (
                            <button
                                key={item.id}
                                type="button"
                                className={TOOL_CLASS}
                                style={active ? { background: theme.toolbar.accentBg, color: theme.toolbar.accentText } : { color: theme.node.muted }}
                                aria-label={`${t(item.labelKey)} (${item.hotkey})`}
                                title={`${t(item.labelKey)} (${item.hotkey})`}
                                aria-pressed={active}
                                onClick={() => setTool(item.id)}
                            >
                                <Icon className="size-4" />
                            </button>
                        );
                    })}
                    <span className="mx-1 h-5 w-px shrink-0 md:my-0.5 md:h-px md:w-5" style={{ background: theme.toolbar.border }} />
                    <button type="button" className={TOOL_CLASS} style={{ color: theme.node.muted }} aria-label={t("canvas.audioStudio.zoomIn")} title={t("canvas.audioStudio.zoomIn")} onClick={() => zoomBy(ZOOM_STEP)}>
                        <ZoomIn className="size-4" />
                    </button>
                    <button type="button" className={TOOL_CLASS} style={{ color: theme.node.muted }} aria-label={t("canvas.audioStudio.zoomOut")} title={t("canvas.audioStudio.zoomOut")} onClick={() => zoomBy(1 / ZOOM_STEP)}>
                        <ZoomOut className="size-4" />
                    </button>
                </div>

                <div className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden" style={{ background: theme.canvas.background }}>
                    <div className="flex h-8 shrink-0 items-center gap-1.5 px-2">
                        <ConfigProvider theme={{ components: { Segmented: { itemSelectedBg: theme.toolbar.accentBg, itemSelectedColor: theme.toolbar.accentText } } }}>
                            <Segmented
                                size="small"
                                value={view}
                                options={[
                                    { label: t("canvas.audioStudio.viewArrangement"), value: "arrangement" },
                                    { label: t("canvas.audioStudio.viewMixer"), value: "mixer" },
                                    { label: t("canvas.audioStudio.viewRoll"), value: "roll" },
                                ]}
                                onChange={(value) => setView(value as AudioView)}
                            />
                        </ConfigProvider>
                    </div>
                    {view === "mixer" ? (
                        <AudioMixer
                            tracks={tracks}
                            masterGain={masterGain}
                            automation={projectAutomation}
                            selectedTrackId={selectedTrack?.id ?? ""}
                            audible={audible}
                            registerMeter={registerMeter}
                            onSelectTrack={setSelectedTrackId}
                            onTrackPatch={updateTrack}
                            onMixPreview={previewTrackMix}
                            onMasterGain={(value) => patchMetadata({ audioMasterGain: value })}
                        />
                    ) : null}
                    {view === "roll" ? (
                        <AudioPianoRoll
                            track={selectedRegionTrack}
                            region={selectedRegion}
                            ppqn={ppqn}
                            tempo={tempo}
                            meter={meter}
                            snap={grid.snap}
                            onRegionPatch={(patch) => {
                                if (selectedRegion) updateRegion(selectedRegion.id, patch);
                            }}
                            onNotes={(notes) => {
                                if (selectedRegion) commitRegionNotes(selectedRegion.id, notes);
                            }}
                            onTrackPatch={(patch) => {
                                if (selectedRegion) updateTrack(selectedRegion.trackId, patch);
                            }}
                            onClose={() => setView("arrangement")}
                        />
                    ) : null}
                    <div
                        ref={scrollRef}
                        className={view === "arrangement" ? "thin-scrollbar min-h-0 flex-1 overflow-auto" : "hidden"}
                        style={{ cursor: tool === "hand" ? "grab" : tool === "zoom" ? "zoom-in" : tool === "split" || tool === "draw" || tool === "erase" || tool === "glue" || tool === "range" ? "crosshair" : "default" }}
                        onPointerDown={(event) => {
                            if (event.button === 1 || tool === "hand") beginPan(event);
                        }}
                        onPointerMove={movePan}
                        onPointerUp={endPan}
                        onPointerCancel={endPan}
                    >
                        <div ref={contentRef} className="relative" style={{ width: trackWidth + timelineWidth, minHeight: "100%" }}>
                            <div className="sticky top-0 z-40 flex" style={{ height: RULER_HEIGHT, background: theme.canvas.background }}>
                                <div className="sticky left-0 z-20 shrink-0" style={{ width: trackWidth, background: theme.canvas.background, borderBottom: `1px solid ${theme.toolbar.border}` }} />
                                <AudioRulerContextMenu hasRange={Boolean(range)} canClearCycle={cycle.end > cycle.start} onCommand={(command) => handleRulerCommand(command, rulerContextRef.current)}>
                                    <div
                                        className="relative shrink-0 cursor-ew-resize hover:bg-hover"
                                        style={{ width: timelineWidth, borderBottom: `1px solid ${theme.toolbar.border}`, touchAction: "none" }}
                                        title={t("canvas.audioStudio.hintRuler")}
                                        onPointerDown={(event) => {
                                            if (event.button === 2) {
                                                rulerContextRef.current = timeAt(event.clientX);
                                                return;
                                            }
                                            if (event.button === 0) beginScrub(event);
                                        }}
                                        onPointerMove={moveScrub}
                                        onPointerUp={endScrub}
                                        onPointerCancel={endScrub}
                                    >
                                        <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-1.5" style={gridImages ? { backgroundImage: gridImages } : undefined} />
                                        {labels.map((seconds) => {
                                            const position = secondsToPosition(seconds, tempo, meter);
                                            return (
                                                <span key={seconds} className="pointer-events-none absolute bottom-2 text-sm tabular-nums" style={{ left: seconds * pxPerSecond + 3, color: theme.node.muted }}>
                                                    {showBars ? position.bar : `${position.bar}.${position.beat}`}
                                                </span>
                                            );
                                        })}
                                        {cycle.end > cycle.start ? (
                                            <div
                                                className="pointer-events-none absolute bottom-0 top-0"
                                                style={{ left: cycle.start * pxPerSecond, width: Math.max(2, (cycle.end - cycle.start) * pxPerSecond), background: `${theme.node.info}24`, borderLeft: `1px solid ${theme.node.info}`, borderRight: `1px solid ${theme.node.info}` }}
                                            />
                                        ) : null}
                                        {punch.enabled && punch.out > punch.in ? (
                                            <div className="pointer-events-none absolute bottom-0 top-0" style={{ left: punch.in * pxPerSecond, width: Math.max(2, (punch.out - punch.in) * pxPerSecond), background: theme.node.blocked, opacity: 0.15 }} />
                                        ) : null}
                                        {markers.map((marker) => (
                                            <button
                                                key={marker.id}
                                                type="button"
                                                className="absolute bottom-0 top-0 w-px"
                                                style={{ left: marker.time * pxPerSecond, background: theme.node.activeStroke }}
                                                aria-label={marker.name || t("canvas.audioStudio.assetMarkers")}
                                                title={marker.name || formatAudioTime(marker.time)}
                                                onClick={() => seek(marker.time)}
                                            >
                                                <span className="absolute left-0 top-0 h-2.5 w-2.5 rounded-br-sm" style={{ background: theme.node.primary }} />
                                            </button>
                                        ))}
                                        <span ref={playheadRef} className="pointer-events-none absolute bottom-0 left-0 top-0 z-10 w-px" style={{ background: theme.node.accent }} />
                                    </div>
                                </AudioRulerContextMenu>
                            </div>
                            {tracks.map((track, index) => {
                                const trackLanes = automationLanesForTrack(automation, track.id);
                                const gainAutomated = automationOwns(projectAutomation, track.id, AUDIO_AUTOMATION_GAIN);
                                const trackRole = audioTrackType(track) === "audio" ? "" : t(AUDIO_TRACK_TYPE_LABEL_KEYS[audioTrackType(track)]);
                                const block = laneBlocks[index];
                                // Lanes outside the scroll window keep their height but render nothing.
                                if (block.top + block.height < laneWindow.from || block.top > laneWindow.to) return <div key={track.id} className="flex" style={{ height: block.height }} aria-hidden />;
                                return (
                                <Fragment key={track.id}>
                                <div className="flex" style={{ height: LANE_HEIGHT }}>
                                    <AudioTrackContextMenu canRemove={tracks.length > 1 && audioTrackType(track) !== "master"} exporting={exporting} onCommand={(command) => handleTrackCommand(command, track.id)}>
                                        <div
                                            className="sticky left-0 z-30 shrink-0 px-2 py-1.5 glass-surface"
                                            style={{ width: trackWidth, background: track.id === selectedTrack?.id ? theme.toolbar.activeBg : undefined, borderBottom: `1px solid ${theme.toolbar.border}`, borderLeft: track.armed ? `2px solid ${theme.node.danger}` : "2px solid transparent", opacity: audible?.get(track.id) === false ? 0.45 : 1 }}
                                            onPointerDown={() => setSelectedTrackId(track.id)}
                                        >
                                            <div className="flex h-6 items-center gap-1">
                                                <span className="h-3 w-1 shrink-0 rounded-md" style={{ background: track.color || theme.node.faint }} aria-hidden />
                                                {trackRole && (track.name.trim() || trackPlaceholder(track) !== trackRole) ? (
                                                    <span className="max-md:hidden shrink-0 text-sm" style={{ color: theme.node.muted }}>
                                                        {trackRole}
                                                    </span>
                                                ) : null}
                                                <input
                                                    ref={(element) => {
                                                        if (element) trackNameRefs.current.set(track.id, element);
                                                        else trackNameRefs.current.delete(track.id);
                                                    }}
                                                    className="min-w-0 flex-1 bg-transparent text-sm outline-none"
                                                    style={{ color: theme.node.text }}
                                                    value={track.name}
                                                    placeholder={trackPlaceholder(track)}
                                                    aria-label={trackPlaceholder(track)}
                                                    onChange={(event) => updateTrack(track.id, { name: event.target.value })}
                                                />
                                                {canHostClips(track) ? (
                                                    <IconAction label={t("canvas.audioStudio.addClip")} onClick={() => setPicker(picker?.trackId === track.id ? null : { trackId: track.id, at: null })} compact>
                                                        <Plus className="size-3.5" />
                                                    </IconAction>
                                                ) : canHostMidi(track) ? (
                                                    <IconAction label={t("canvas.audioStudio.addRegion")} onClick={() => addRegion(track.id)} compact>
                                                        <Plus className="size-3.5" />
                                                    </IconAction>
                                                ) : null}
                                                {trackLanes.length ? (
                                                    <IconAction label={t("canvas.audioStudio.automationShow")} className="max-md:hidden" onClick={() => updateTrack(track.id, { collapsed: !track.collapsed })} compact>
                                                        {track.collapsed ? <ChevronRight className="size-3.5" /> : <ChevronDown className="size-3.5" />}
                                                    </IconAction>
                                                ) : null}
                                                <IconAction
                                                    label={t("canvas.audioStudio.showInMixer")}
                                                    className="max-md:hidden"
                                                    onClick={() => {
                                                        setSelectedTrackId(track.id);
                                                        setView("mixer");
                                                    }}
                                                    compact
                                                >
                                                    <SlidersHorizontal className="size-3.5" />
                                                </IconAction>
                                            </div>
                                            {/* Fixed slots keep M / S / indicator / gain on the same x on every row, so a row missing a control still reserves its column. */}
                                            <div className="mt-1 flex h-7 items-center gap-1">
                                                <AudioToggle label={t("canvas.audioStudio.mute")} active={track.mute} onClick={() => updateTrack(track.id, { mute: !track.mute })} className="size-5 md:size-6">
                                                    M
                                                </AudioToggle>
                                                <AudioToggle label={t("canvas.audioStudio.solo")} active={track.solo} activeColor={theme.node.warning} activeBackground={theme.node.warningSoft} onClick={() => updateTrack(track.id, { solo: !track.solo })} className="size-5 md:size-6">
                                                    S
                                                </AudioToggle>
                                                {canHostClips(track) ? (
                                                    <AudioToggle label={t("canvas.audioStudio.trackArm")} active={Boolean(track.armed)} activeColor={theme.node.danger} activeBackground={theme.node.dangerSoft} onClick={() => updateTrack(track.id, { armed: !track.armed })} className="size-5 md:size-6">
                                                        <Circle className="size-2" fill={track.armed ? "currentColor" : "none"} />
                                                    </AudioToggle>
                                                ) : (
                                                    <span className="size-5 shrink-0 md:size-6" aria-hidden />
                                                )}
                                                <span className="flex w-3 shrink-0 items-center max-md:hidden" style={gainAutomated ? { color: theme.node.muted } : undefined} title={gainAutomated ? t("canvas.audioStudio.automationLink") : undefined} aria-hidden>
                                                    {gainAutomated ? <Link2 className="size-3" /> : null}
                                                </span>
                                                <span className="flex min-w-0 flex-1 items-center gap-1 max-md:hidden">
                                                    <AudioValueInput
                                                        label={t("canvas.audioStudio.gain")}
                                                        value={Math.round(gainFaderDb(track.gain) * 10) / 10}
                                                        format={formatFaderDb}
                                                        parse={(text) => parseDbValue(text, AUDIO_FADER_MIN_DB, AUDIO_FADER_MAX_DB)}
                                                        onCommit={(value) => updateTrack(track.id, { gain: faderDbGain(Math.round(value * 10) / 10) })}
                                                        disabled={gainAutomated}
                                                        className="min-w-0 flex-1"
                                                    />
                                                    <span className="shrink-0 text-sm" style={{ color: theme.node.muted }}>
                                                        dB
                                                    </span>
                                                </span>
                                                <AudioMeter trackId={track.id} register={registerMeter} className="h-6 max-md:hidden" />
                                            </div>
                                        </div>
                                    </AudioTrackContextMenu>
                                    <AudioLaneContextMenu canRemove={tracks.length > 1 && audioTrackType(track) !== "master"} midi={canHostMidi(track)} onCommand={(command) => handleLaneCommand(command, track.id)}>
                                        <div
                                            ref={(element) => {
                                                if (element) laneRefs.current.set(track.id, element);
                                                else laneRefs.current.delete(track.id);
                                            }}
                                            className="relative shrink-0"
                                            style={{ width: timelineWidth, borderBottom: `1px solid ${theme.toolbar.border}`, backgroundImage: gridImages, opacity: audible?.get(track.id) === false ? 0.45 : 1 }}
                                            onPointerDown={(event) => beginLaneGesture(event, track.id)}
                                            onPointerMove={moveBand}
                                            onPointerUp={endBand}
                                            onPointerCancel={endBand}
                                        >
                                            {canHostMidi(track)
                                                ? audioTrackRegions(midi, track.id).map((region) => {
                                                      const regionSelected = region.id === selectedRegionId;
                                                      const width = Math.max(MIN_CLIP_WIDTH, ticksToSeconds(region.durationTicks, ppqn, tempo) * pxPerSecond);
                                                      return (
                                                          <AudioMidiRegionContextMenu key={region.id} onCommand={(command) => handleRegionCommand(command, region.id)}>
                                                              <div
                                                                  className="absolute top-1 flex select-none flex-col overflow-hidden rounded-md border"
                                                                  style={{
                                                                      left: ticksToSeconds(region.startTicks, ppqn, tempo) * pxPerSecond,
                                                                      height: LANE_HEIGHT - 10,
                                                                      width,
                                                                      background: theme.toolbar.panel,
                                                                      borderColor: regionSelected ? theme.node.accent : theme.toolbar.border,
                                                                      cursor: "grab",
                                                                  }}
                                                                  tabIndex={0}
                                                                  data-midi-region={region.id}
                                                                  title={region.name || t("canvas.audioStudio.regionName")}
                                                                  aria-label={region.name || t("canvas.audioStudio.regionName")}
                                                                  onFocus={() => setSelectedRegionId(region.id)}
                                                                  onContextMenu={(event) => event.stopPropagation()}
                                                                  onDoubleClick={() => {
                                                                      setSelectedTrackId(region.trackId);
                                                                      setSelectedRegionId(region.id);
                                                                      setView("roll");
                                                                  }}
                                                                  onPointerDown={(event) => beginRegionGesture(event, region)}
                                                                  onPointerMove={moveRegionGesture}
                                                                  onPointerUp={endRegionGesture}
                                                                  onPointerCancel={endRegionGesture}
                                                              >
                                                                  {regionSelected ? <span className="pointer-events-none absolute inset-0" style={{ background: theme.canvas.selectionFill }} /> : null}
                                                                  <span className="pointer-events-none absolute bottom-0 left-0 top-0 w-[3px]" style={{ background: track.color || theme.node.faint }} />
                                                                  <div className="relative flex h-4 shrink-0 items-center gap-1 px-1.5" style={{ color: theme.node.muted }}>
                                                                      <Music2 className="size-2.5 shrink-0" />
                                                                      <span className="min-w-0 flex-1 truncate text-sm" style={{ color: theme.node.text }}>{region.name || t("canvas.audioStudio.regionName")}</span>
                                                                  </div>
                                                                  <MidiRegionNotes region={region} width={width} ppqn={ppqn} tempo={tempo} pxPerSecond={pxPerSecond} viewFrom={laneView.from} viewTo={laneView.to} theme={theme} />
                                                              </div>
                                                          </AudioMidiRegionContextMenu>
                                                      );
                                                  })
                                                : null}
                                            {audioTrackClips(clips, track.id).map((clip) => {
                                                const source = audioNodesById.get(clip.sourceNodeId);
                                                const url = sources[clip.sourceNodeId] || "";
                                                const selected = selectedSet.has(clip.id);
                                                const width = Math.max(MIN_CLIP_WIDTH, clip.duration * pxPerSecond);
                                                const fadeIn = Math.min(clip.fadeIn ?? 0, clip.duration) * pxPerSecond;
                                                const fadeOut = Math.min(clip.fadeOut ?? 0, clip.duration) * pxPerSecond;
                                                const sourceWindow = (source?.metadata?.durationMs || 0) / 1000;
                                                const loopFrom = clip.loop && sourceWindow > 0 ? Math.max(0, (sourceWindow - clip.offset) * pxPerSecond) : 0;
                                                return (
                                                    <AudioClipContextMenu key={clip.id} clip={clip} onCommand={(command) => handleClipCommand(command, clip.id)}>
                                                        <div
                                                            className="absolute top-1 flex select-none flex-col overflow-hidden rounded-md border"
                                                            style={{
                                                                left: clip.start * pxPerSecond,
                                                                height: LANE_HEIGHT - 10,
                                                                width,
                                                                background: theme.toolbar.panel,
                                                                borderColor: selected ? theme.node.accent : theme.toolbar.border,
                                                                borderStyle: url ? "solid" : "dashed",
                                                                opacity: clip.muted ? 0.45 : 1,
                                                                cursor: clip.locked ? "default" : "grab",
                                                            }}
                                                            tabIndex={0}
                                                            data-clip-id={clip.id}
                                                            title={clip.name || source?.title || t("canvas.nodeTypes.audio")}
                                                            aria-label={clip.locked ? `${clip.name || source?.title || t("canvas.nodeTypes.audio")} · ${t("canvas.audioStudio.locked")}` : clip.name || source?.title || t("canvas.nodeTypes.audio")}
                                                        onFocus={() => setSelectedClipIds((prev) => (prev.includes(clip.id) ? prev : [clip.id]))}
                                                        onContextMenu={(event) => event.stopPropagation()}
                                                        onPointerDown={(event) => beginClipGesture(event, clip)}
                                                            onPointerMove={moveClipGesture}
                                                            onPointerUp={endClipGesture}
                                                            onPointerCancel={endClipGesture}
                                                        >
                                                            {selected ? <span className="pointer-events-none absolute inset-0" style={{ background: theme.canvas.selectionFill }} /> : null}
                                                            <span className="pointer-events-none absolute bottom-0 left-0 top-0 w-[3px]" style={{ background: clip.color || theme.node.faint }} />
                                                            <div className="relative flex h-4 shrink-0 items-center gap-1 px-1.5" style={{ color: theme.node.muted }}>
                                                                <Music2 className="size-2.5 shrink-0" />
                                                                <span className="min-w-0 flex-1 truncate text-sm" style={{ color: theme.node.text }}>{clip.name || source?.title || t("canvas.nodeTypes.audio")}</span>
                                                                {clip.locked ? <Lock className="size-2.5 shrink-0" aria-hidden /> : null}
                                                            </div>
                                                            {url ? <ClipWaveform url={url} cacheKey={source?.metadata?.storageKey || url} clip={clip} width={width} pxPerSecond={pxPerSecond} viewFrom={laneView.from} viewTo={laneView.to} theme={theme} /> : null}
                                                            {loopFrom > 0 && loopFrom < width ? (
                                                                <span
                                                                    className="pointer-events-none absolute bottom-0 right-0 top-4 opacity-55"
                                                                    style={{ left: loopFrom, backgroundImage: `repeating-linear-gradient(45deg, ${theme.node.faint} 0 1px, transparent 1px 5px)` }}
                                                                />
                                                            ) : null}
                                                            <span data-clip-fade="in" className="pointer-events-none absolute left-0 top-0 h-full" style={{ width: fadeIn, background: theme.canvas.selectionFill, borderTop: `1px solid ${theme.toolbar.border}`, clipPath: "polygon(0 0, 100% 0, 0 100%)" }} />
                                                            <span data-clip-fade="out" className="pointer-events-none absolute right-0 top-0 h-full" style={{ width: fadeOut, background: theme.canvas.selectionFill, borderTop: `1px solid ${theme.toolbar.border}`, clipPath: "polygon(0 0, 100% 0, 100% 100%)" }} />
                                                            {url ? null : (
                                                                <span className="relative px-1.5 text-sm leading-4" style={{ color: theme.node.blocked }}>
                                                                    {t("canvas.audioStudio.missingSource")}
                                                                </span>
                                                            )}
                                                        </div>
                                                    </AudioClipContextMenu>
                                                );
                                            })}
                                        </div>
                                    </AudioLaneContextMenu>
                                </div>
                                {track.collapsed
                                    ? null
                                    : trackLanes.map((lane) => (
                                          <AudioAutomationLane
                                              key={lane.id}
                                              lane={lane}
                                              tracks={tracks}
                                              headerWidth={trackWidth}
                                              width={timelineWidth}
                                              pxPerSecond={pxPerSecond}
                                              snapStep={snapStep}
                                              gridImage={gridImages}
                                              takenTargets={trackLanes.filter((item) => item.id !== lane.id).map((item) => item.target)}
                                              registerDot={registerAutomationDot}
                                              onPatch={(patch) => patchAutomation(lane.id, patch)}
                                              onPoints={(points) => commitAutomationPoints(lane.id, points)}
                                          />
                                      ))}
                                </Fragment>
                                );
                            })}
                            <button type="button" className="flex h-8 items-center gap-1.5 px-2 text-left text-sm transition hover:bg-hover" style={{ color: theme.node.muted, width: trackWidth }} onClick={() => addTrack()}>
                                <Plus className="size-3.5" />
                                {t("canvas.audioStudio.addTrack")}
                            </button>
                            {range ? (
                                <div
                                    className="pointer-events-none absolute"
                                    style={{ left: trackWidth + range.start * pxPerSecond, top: RULER_HEIGHT, height: lanesHeight, width: Math.max(2, (range.end - range.start) * pxPerSecond), background: theme.canvas.accentFill, borderLeft: `1px solid ${theme.node.accent}`, borderRight: `1px solid ${theme.node.accent}` }}
                                />
                            ) : null}
                            {band ? (
                                <div
                                    ref={bandRef}
                                    className="pointer-events-none absolute"
                                    style={{
                                        left: Math.min(band.x0, band.x1),
                                        top: Math.min(band.y0, band.y1),
                                        width: Math.max(1, Math.abs(band.x1 - band.x0)),
                                        height: Math.max(1, Math.abs(band.y1 - band.y0)),
                                        background: theme.canvas.selectionFill,
                                        border: `1px solid ${theme.canvas.selectionStroke}`,
                                    }}
                                />
                            ) : null}
                            <div ref={playheadLaneRef} className="pointer-events-none absolute bottom-0 z-10 w-px" style={{ top: RULER_HEIGHT, left: trackWidth, background: theme.node.accent }} />
                        </div>
                    </div>
                    {view === "arrangement" && !tracks.length ? (
                        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2 text-center">
                            <AudioLines className="size-7" style={{ color: theme.node.muted }} />
                            <span className="text-sm" style={{ color: theme.node.placeholder }}>
                                {t("canvas.audioStudio.noTracks")}
                            </span>
                            <button type="button" className="pointer-events-auto flex items-center gap-1.5 rounded-md px-2 py-1 text-sm transition hover:bg-hover" style={{ color: theme.node.text }} onClick={() => addTrack()}>
                                <Plus className="size-3.5" />
                                {t("canvas.audioStudio.addTrack")}
                            </button>
                        </div>
                    ) : null}
                    {view === "arrangement" && tracks.length && !hasContent ? (
                        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2 text-center">
                            <AudioLines className="size-6" style={{ color: theme.node.muted }} />
                            <span className="text-sm" style={{ color: theme.node.placeholder }}>
                                {t("canvas.audioStudio.empty")}
                            </span>
                        </div>
                    ) : null}
                </div>

            </DockArea>

            {clipDialog && primaryClip ? <ClipDialog clip={primaryClip} kind={clipDialog} onClose={() => setClipDialog("")} onPatch={(patch) => commitClips(clips.map((clip) => (clip.id === primaryClip.id ? { ...clip, ...patch } : clip)))} /> : null}
        </div>
    );
}

function sameSources(current: Record<string, string>, next: Record<string, string>) {
    const keys = Object.keys(current);
    return keys.length === Object.keys(next).length && keys.every((key) => current[key] === next[key]);
}

/** Peak pyramid painted straight to a canvas, clamped to the scrolled window so a long clip never makes an oversized canvas. */
function ClipWaveform({ url, cacheKey, clip, width, pxPerSecond, viewFrom, viewTo, theme }: { url: string; cacheKey: string; clip: CanvasAudioClip; width: number; pxPerSecond: number; viewFrom: number; viewTo: number; theme: CanvasTheme }) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [peaks, setPeaks] = useState<AudioPeaks | null>(() => getCachedAudioPeaks(cacheKey));
    const left = Math.max(0, viewFrom - clip.start * pxPerSecond);
    const right = Math.min(width, viewTo - clip.start * pxPerSecond);
    const visible = Math.max(0, Math.round(right - left));

    useEffect(() => {
        let active = true;
        void loadAudioPeaks(cacheKey, url).then((value) => {
            if (active && value) setPeaks(value);
        });
        return () => {
            active = false;
        };
    }, [cacheKey, url]);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas || visible < 1) return;
        const ratio = Math.min(2, window.devicePixelRatio || 1);
        const height = canvas.clientHeight || LANE_HEIGHT - 26;
        canvas.width = Math.max(1, Math.round(visible * ratio));
        canvas.height = Math.max(1, Math.round(height * ratio));
        const context = canvas.getContext("2d");
        if (!context) return;
        context.clearRect(0, 0, canvas.width, canvas.height);
        const middle = canvas.height / 2;
        if (!peaks) {
            context.fillStyle = theme.node.faint;
            for (let x = 0; x < canvas.width; x += 3) context.fillRect(x, middle - 1, 1, 2);
            return;
        }
        const band = selectPeakBand(peaks, pxPerSecond);
        context.fillStyle = theme.node.faint;
        for (let x = 0; x < canvas.width; x += 1) {
            const laneX = left + x / ratio;
            const seconds = clip.reversed ? clip.offset + clip.duration - laneX / pxPerSecond : clip.offset + laneX / pxPerSecond;
            const index = peakBucketIndex(band, peaks, seconds);
            const top = middle - Math.max(0.015, band.max[index]) * middle;
            const bottom = middle - Math.min(-0.015, band.min[index]) * middle;
            context.fillRect(x, top, 1, Math.max(1, bottom - top));
        }
    }, [peaks, clip.offset, clip.duration, clip.reversed, pxPerSecond, left, visible, theme]);

    if (visible < 1) return null;
    return <canvas ref={canvasRef} className="pointer-events-none absolute bottom-0 top-4" style={{ left, width: visible }} aria-hidden />;
}

/** Note preview of a MIDI region on its lane; the region's own pitch range is stretched over the block height. */
function MidiRegionNotes({ region, width, ppqn, tempo, pxPerSecond, viewFrom, viewTo, theme }: { region: CanvasAudioMidiRegion; width: number; ppqn: number; tempo: number; pxPerSecond: number; viewFrom: number; viewTo: number; theme: CanvasTheme }) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const regionStart = ticksToSeconds(region.startTicks, ppqn, tempo) * pxPerSecond;
    const left = Math.max(0, viewFrom - regionStart);
    const right = Math.min(width, viewTo - regionStart);
    const visible = Math.max(0, Math.round(right - left));
    const pxPerTick = (pxPerSecond * 60) / (tempo * ppqn);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas || visible < 1) return;
        const ratio = Math.min(2, window.devicePixelRatio || 1);
        const height = canvas.clientHeight || LANE_HEIGHT - 26;
        canvas.width = Math.max(1, Math.round(visible * ratio));
        canvas.height = Math.max(1, Math.round(height * ratio));
        const context = canvas.getContext("2d");
        if (!context) return;
        context.clearRect(0, 0, canvas.width, canvas.height);
        const pitches = region.notes.map((note) => note.pitch);
        const high = pitches.length ? Math.max(...pitches) : 72;
        const span = Math.max(1, high - (pitches.length ? Math.min(...pitches) : 60));
        context.fillStyle = theme.node.faint;
        region.notes.forEach((note) => {
            context.fillRect((note.tick * pxPerTick - left) * ratio, ((high - note.pitch) / span) * (canvas.height - 2 * ratio), Math.max(1, note.durationTicks * pxPerTick * ratio), Math.max(1, ratio));
        });
    }, [region.notes, left, visible, pxPerTick, theme]);

    if (visible < 1) return null;
    return <canvas ref={canvasRef} className="pointer-events-none absolute bottom-0 top-4" style={{ left, width: visible }} aria-hidden />;
}

function PanelShell({ icon: Icon, hint, theme }: { icon: typeof Music2; hint: string; theme: CanvasTheme }) {
    return (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 px-4 text-center glass-card">
            <Icon className="size-5" style={{ color: theme.node.muted }} />
            <span className="text-sm" style={{ color: theme.node.placeholder }}>
                {hint}
            </span>
        </div>
    );
}

function ClipDialog({ clip, kind, onClose, onPatch }: { clip: CanvasAudioClip; kind: "rename" | "properties"; onClose: () => void; onPatch: (patch: Partial<CanvasAudioClip>) => void }) {
    const { t } = useTranslation();
    const theme = useCanvasTheme();
    const [form, setForm] = useState(() => ({ name: clip.name || "", gain: Math.round(clampClipGain(clip.gain ?? 1) * 100), fadeIn: clip.fadeIn ?? 0, fadeOut: clip.fadeOut ?? 0 }));
    const apply = () => {
        if (kind === "rename") onPatch({ name: form.name });
        else onPatch({ name: form.name, gain: clampClipGain(form.gain / 100), fadeIn: Math.min(form.fadeIn, clip.duration), fadeOut: Math.min(form.fadeOut, clip.duration) });
        onClose();
    };
    const rowClass = "flex min-w-0 items-center gap-2";
    const labelClass = "w-16 shrink-0";
    return (
        <Modal open title={t(kind === "rename" ? "canvas.audioStudio.renameTitle" : "canvas.audioStudio.propertiesTitle")} okText={t("canvas.audioStudio.apply")} cancelText={t("canvas.audioStudio.cancel")} onCancel={onClose} onOk={apply} classNames={{ container: "glass-raised" }} styles={{ container: { background: "var(--glass-strong)" } }}>
            <ImageSettingsTheme theme={theme}>
                <div className="flex flex-col gap-1.5 py-2 text-sm" style={{ color: theme.node.text }}>
                    <label className={rowClass}>
                        <span className={labelClass} style={{ color: theme.node.muted }}>
                            {t("canvas.audioStudio.name")}
                        </span>
                        <input className="min-w-0 flex-1 rounded-md border bg-transparent px-1.5 py-0.5 text-sm outline-none" style={{ borderColor: theme.toolbar.border, color: theme.node.text }} value={form.name} aria-label={t("canvas.audioStudio.name")} onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))} />
                    </label>
                    {kind === "properties" ? (
                        <>
                            <label className={rowClass}>
                                <span className={labelClass} style={{ color: theme.node.muted }}>
                                    {t("canvas.audioStudio.clipGain")}
                                </span>
                                <InputNumber size="small" min={0} max={200} value={form.gain} aria-label={t("canvas.audioStudio.clipGain")} onChange={(value) => value !== null && setForm((prev) => ({ ...prev, gain: value }))} />
                                <span style={{ color: theme.node.muted }}>%</span>
                            </label>
                            <label className={rowClass}>
                                <span className={labelClass} style={{ color: theme.node.muted }}>
                                    {t("canvas.audioStudio.fadeIn")}
                                </span>
                                <InputNumber size="small" min={0} max={clip.duration} step={0.05} value={form.fadeIn} aria-label={t("canvas.audioStudio.fadeIn")} onChange={(value) => value !== null && setForm((prev) => ({ ...prev, fadeIn: value }))} />
                                <span style={{ color: theme.node.muted }}>s</span>
                            </label>
                            <label className={rowClass}>
                                <span className={labelClass} style={{ color: theme.node.muted }}>
                                    {t("canvas.audioStudio.fadeOut")}
                                </span>
                                <InputNumber size="small" min={0} max={clip.duration} step={0.05} value={form.fadeOut} aria-label={t("canvas.audioStudio.fadeOut")} onChange={(value) => value !== null && setForm((prev) => ({ ...prev, fadeOut: value }))} />
                                <span style={{ color: theme.node.muted }}>s</span>
                            </label>
                            <span className={rowClass}>
                                <span className={labelClass} style={{ color: theme.node.muted }}>
                                    {t("canvas.audioStudio.color")}
                                </span>
                                <PsColorPicker value={clip.color || ""} ariaLabel={t("canvas.audioStudio.color")} onChange={(hex) => onPatch({ color: hex })} />
                            </span>
                            <label className={rowClass}>
                                <span className={labelClass} style={{ color: theme.node.muted }}>
                                    {t("canvas.audioStudio.loop")}
                                </span>
                                <Switch size="small" checked={Boolean(clip.loop)} onChange={(checked) => onPatch({ loop: checked })} />
                            </label>
                            <label className={rowClass}>
                                <span className={labelClass} style={{ color: theme.node.muted }}>
                                    {t("canvas.audioStudio.reverse")}
                                </span>
                                <Switch size="small" checked={Boolean(clip.reversed)} onChange={(checked) => onPatch({ reversed: checked })} />
                            </label>
                            <label className={rowClass}>
                                <span className={labelClass} style={{ color: theme.node.muted }}>
                                    {t("canvas.audioStudio.clipMute")}
                                </span>
                                <Switch size="small" checked={Boolean(clip.muted)} onChange={(checked) => onPatch({ muted: checked })} />
                            </label>
                            <label className={rowClass}>
                                <span className={labelClass} style={{ color: theme.node.muted }}>
                                    {t("canvas.audioStudio.lock")}
                                </span>
                                <Switch size="small" checked={Boolean(clip.locked)} onChange={(checked) => onPatch({ locked: checked })} />
                            </label>
                        </>
                    ) : null}
                </div>
            </ImageSettingsTheme>
        </Modal>
    );
}

function OptionToggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
    return (
        <label className={CONTROL_GROUP_CLASS}>
            <span className="shrink-0">{label}</span>
            <Switch size="small" checked={checked} onChange={onChange} />
        </label>
    );
}

function IconAction({ label, onClick, disabled = false, compact = false, className = "", children }: { label: string; onClick: () => void; disabled?: boolean; compact?: boolean; className?: string; children: ReactNode }) {
    return (
        <button type="button" className={`${compact ? COMPACT_ACTION_CLASS : FLAT_ACTION_CLASS} ${className}`} aria-label={label} title={label} disabled={disabled} onClick={onClick}>
            {children}
        </button>
    );
}
