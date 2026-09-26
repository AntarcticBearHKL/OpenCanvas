import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from "react";
import { Select } from "antd";
import { Music2, SlidersHorizontal, X, ZoomIn, ZoomOut } from "lucide-react";
import { nanoid } from "nanoid";
import * as Tone from "tone";
import { useTranslation } from "react-i18next";

import { AUDIO_TRACK_TYPE_LABEL_KEYS } from "@/components/canvas/workspace/audio-panels";
import { useCanvasTheme } from "@/hooks/use-canvas-theme";
import {
    addNote,
    AUDIO_INSTRUMENT_PRESETS,
    AUDIO_MIN_NOTE_TICKS,
    AUDIO_NOTE_MAX,
    AUDIO_NOTE_MIN,
    barTicks,
    beatTicks,
    clampPitch,
    clampVelocity,
    createAudioNote,
    instrumentPreset,
    isBlackKey,
    moveNotes,
    noteName,
    notesBounds,
    quantizeTicks,
    removeNotes,
    resizeNotes,
    secondsToTicks,
    setNoteVelocity,
    snapTicks,
} from "@/lib/canvas/audio-midi";
import { audioTrackType } from "@/lib/canvas/audio-project";
import type { AudioGraphVstSource } from "@/lib/canvas/audio-graph";
import { createVstClient } from "@/lib/canvas/audio-vst";
import type { VstPlugin } from "@/lib/canvas/audio-vst-protocol";
import { startVstStateSession, type VstStateSession } from "@/lib/canvas/vst-state";
import type { CanvasAudioMidiRegion, CanvasAudioNote, CanvasAudioSnap, CanvasAudioTrack } from "@/types/canvas";

const KEY_WIDTH = 46;
const ROW_HEIGHT = 12;
const VELOCITY_HEIGHT = 56;
const NOTE_EDGE_PX = 5;
const ROW_COUNT = AUDIO_NOTE_MAX - AUDIO_NOTE_MIN + 1;
const MIN_PX_PER_BEAT = 8;
const MAX_PX_PER_BEAT = 240;
const ROLL_ACTION_CLASS = "grid size-6 shrink-0 place-items-center rounded-md transition hover:bg-hover hover:opacity-100 hover:bg-hover";
const EMPTY_NOTES: CanvasAudioNote[] = [];

type VstScanState = { status: "loading" | "ready" | "unavailable"; plugins: VstPlugin[] };
type VstEditorSource = { status: AudioGraphVstSource["status"]; instanceId: string };

// The host caches its own scan, so one scan per page load is enough; a failed scan is dropped so
// opening the roll again retries once the host has been started.
let vstScanTask: Promise<VstPlugin[]> | null = null;

function vstInstruments() {
    if (!vstScanTask) {
        vstScanTask = createVstClient()
            .scan()
            .then((plugins) => plugins.filter((plugin) => plugin.isInstrument))
            .catch((error) => {
                vstScanTask = null;
                throw error;
            });
    }
    return vstScanTask;
}

function useVstInstruments(): VstScanState {
    const [state, setState] = useState<VstScanState>({ status: "loading", plugins: [] });
    useEffect(() => {
        let active = true;
        void vstInstruments().then(
            (plugins) => {
                if (active) setState({ status: "ready", plugins });
            },
            () => {
                if (active) setState({ status: "unavailable", plugins: [] });
            },
        );
        return () => {
            active = false;
        };
    }, []);
    return state;
}

type AudioPianoRollProps = {
    track: CanvasAudioTrack | null;
    region: CanvasAudioMidiRegion | null;
    ppqn: number;
    tempo: number;
    meter: { numerator: number; denominator: number };
    snap: CanvasAudioSnap;
    onRegionPatch: (patch: Partial<CanvasAudioMidiRegion>) => void;
    onNotes: (notes: CanvasAudioNote[]) => void;
    onTrackPatch: (patch: Partial<CanvasAudioTrack>) => void;
    getVstSource: (trackId: string) => AudioGraphVstSource | null;
    onClose: () => void;
};

type NoteGesture = {
    pointerId: number;
    mode: "move" | "resize";
    ids: string[];
    primaryId: string;
    primaryTick: number;
    primaryDuration: number;
    startNotes: CanvasAudioNote[];
    startClientX: number;
    startClientY: number;
    moved: boolean;
};

export default function AudioPianoRoll({ track, region, ppqn, tempo, meter, snap, onRegionPatch, onNotes, onTrackPatch, getVstSource, onClose }: AudioPianoRollProps) {
    const { t } = useTranslation();
    const theme = useCanvasTheme();
    const vst = useVstInstruments();
    const scrollRef = useRef<HTMLDivElement>(null);
    const gridRef = useRef<HTMLDivElement>(null);
    const playheadRef = useRef<HTMLSpanElement>(null);
    const gestureRef = useRef<NoteGesture | null>(null);
    const velocityRef = useRef<{ pointerId: number; affected: string[]; moved: boolean } | null>(null);
    const draftRef = useRef<CanvasAudioNote[] | null>(null);
    const [noteDraft, setNoteDraft] = useState<CanvasAudioNote[] | null>(null);
    const [selectedNoteIds, setSelectedNoteIds] = useState<string[]>([]);
    const [pxPerBeat, setPxPerBeat] = useState(40);
    const notes = noteDraft ?? region?.notes ?? EMPTY_NOTES;
    const trackId = track?.id ?? "";
    const vstPluginId = track?.instrument?.kind === "vst3" ? track.instrument.pluginId : "";
    const [vstSource, setVstSource] = useState<VstEditorSource | null>(null);
    const [editorOpening, setEditorOpening] = useState(false);
    const [editorOpened, setEditorOpened] = useState(false);
    const [editorError, setEditorError] = useState(false);
    const editorSessionRef = useRef<VstStateSession | null>(null);

    const noteStep = snapTicks(snap, ppqn, meter);
    const pxPerTick = pxPerBeat / ppqn;
    const gridWidth = region ? Math.max(160, region.durationTicks * pxPerTick) : 160;
    const gridHeight = ROW_COUNT * ROW_HEIGHT;
    const barPx = barTicks(ppqn, meter) * pxPerTick;
    const beatPx = beatTicks(ppqn, meter) * pxPerTick;
    const octavePx = ROW_HEIGHT * 12;
    const regionId = region?.id ?? "";

    const snapTick = (ticks: number, suspend: boolean) => (suspend || !noteStep ? Math.round(ticks) : quantizeTicks(ticks, noteStep));

    useEffect(() => {
        setSelectedNoteIds([]);
        const element = scrollRef.current;
        if (!element || !region) return;
        const pitches = region.notes.map((note) => note.pitch);
        const center = pitches.length ? (Math.max(...pitches) + Math.min(...pitches)) / 2 : 60;
        element.scrollTop = Math.max(0, (AUDIO_NOTE_MAX - center) * ROW_HEIGHT - element.clientHeight / 2);
        element.scrollLeft = 0;
        gridRef.current?.focus();
    }, [regionId]);

    useEffect(() => {
        const element = playheadRef.current;
        if (!element || !region) return;
        let raf = 0;
        let last = Number.NaN;
        let lastVisible = false;
        const tick = () => {
            const ticks = secondsToTicks(Tone.getTransport().seconds, ppqn, tempo) - region.startTicks;
            const x = ticks * pxPerTick;
            const visible = x >= 0 && x <= gridWidth;
            const rounded = Math.round(x);
            if (rounded !== last || visible !== lastVisible) {
                element.style.display = visible ? "block" : "none";
                element.style.transform = `translateX(${rounded}px)`;
                last = rounded;
                lastVisible = visible;
            }
            raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(raf);
    }, [regionId, region?.startTicks, ppqn, tempo, pxPerTick, gridWidth]);

    // The bridge attach resolves after the graph build, so readiness is polled from the graph handle; the
    // effect only runs while this track's instrument is a vst3 one.
    useEffect(() => {
        setEditorError(false);
        if (!trackId || !vstPluginId) {
            setVstSource(null);
            return;
        }
        const sync = () => {
            const source = getVstSource(trackId);
            const next: VstEditorSource | null = source ? { status: source.status, instanceId: source.instanceId ?? "" } : null;
            setVstSource((current) => (current && next && current.status === next.status && current.instanceId === next.instanceId ? current : next));
        };
        sync();
        const timer = window.setInterval(sync, 500);
        return () => window.clearInterval(timer);
    }, [trackId, vstPluginId, getVstSource]);

    // Leaving the roll or switching tracks ends an open editor session with a final save; the plug-in's own
    // window is host-side, so this unmount is the last reliable moment the page is sure to observe.
    useEffect(() => {
        setEditorOpened(false);
        return () => {
            const session = editorSessionRef.current;
            editorSessionRef.current = null;
            void session?.stop();
        };
    }, [trackId]);

    const openVstEditor = async () => {
        if (editorOpening) return;
        const instanceId = getVstSource(trackId)?.instanceId;
        if (!instanceId) return;
        setEditorOpening(true);
        setEditorError(false);
        try {
            const result = await createVstClient().openEditor(instanceId);
            if (!result.opened) {
                setEditorError(true);
                return;
            }
            // The plug-in's own window is the only place its state changes, so the session is the only moment a
            // save can happen: a bounded debounce while it is open, plus the final save when it closes.
            void editorSessionRef.current?.stop();
            editorSessionRef.current = startVstStateSession(instanceId, track?.instrument?.kind === "vst3" ? track.instrument.stateKey : undefined);
            setEditorOpened(true);
        } catch {
            setEditorError(true);
        } finally {
            setEditorOpening(false);
        }
    };

    const closeVstEditor = async () => {
        if (editorOpening) return;
        const instanceId = getVstSource(trackId)?.instanceId;
        setEditorError(false);
        const session = editorSessionRef.current;
        editorSessionRef.current = null;
        if (instanceId) {
            setEditorOpening(true);
            try {
                await createVstClient().closeEditor(instanceId);
            } catch {
                setEditorError(true);
            } finally {
                setEditorOpening(false);
                setEditorOpened(false);
            }
        } else {
            setEditorOpened(false);
        }
        // The final save runs even when the host already closed the window itself (its editorClose is a no-op then).
        await session?.stop();
    };

    const commitNotes = (notes: CanvasAudioNote[]) => {
        draftRef.current = null;
        setNoteDraft(null);
        onNotes(notes);
    };

    // The drag preview lives in this component's own state, so moving a note never re-renders the studio around it.
    const previewNotes = (notes: CanvasAudioNote[]) => {
        draftRef.current = notes;
        setNoteDraft(notes);
    };

    const noteAt = (event: ReactPointerEvent<HTMLDivElement>, note: CanvasAudioNote) => {
        if (event.button !== 0 || !region) return;
        event.stopPropagation();
        const ids = selectedNoteIds.includes(note.id) ? selectedNoteIds : [note.id];
        if (!selectedNoteIds.includes(note.id)) setSelectedNoteIds([note.id]);
        const rect = event.currentTarget.getBoundingClientRect();
        const mode = event.clientX >= rect.right - NOTE_EDGE_PX ? "resize" : "move";
        event.currentTarget.setPointerCapture(event.pointerId);
        gestureRef.current = { pointerId: event.pointerId, mode, ids, primaryId: note.id, primaryTick: note.tick, primaryDuration: note.durationTicks, startNotes: region.notes, startClientX: event.clientX, startClientY: event.clientY, moved: false };
    };

    const moveNoteGesture = (event: ReactPointerEvent<HTMLDivElement>) => {
        const gesture = gestureRef.current;
        if (!gesture || gesture.pointerId !== event.pointerId || !region) return;
        const deltaTicks = (event.clientX - gesture.startClientX) / pxPerTick;
        if (gesture.mode === "resize") {
            const max = Math.max(AUDIO_MIN_NOTE_TICKS, region.durationTicks - gesture.primaryTick);
            const primary = Math.min(max, Math.max(AUDIO_MIN_NOTE_TICKS, snapTick(gesture.primaryDuration + deltaTicks, event.shiftKey)));
            const delta = primary - gesture.primaryDuration;
            if (!delta) return;
            gesture.moved = true;
            previewNotes(resizeNotes(gesture.startNotes, gesture.ids, delta));
            return;
        }
        const bounds = notesBounds(gesture.startNotes, gesture.ids);
        const raw = snapTick(gesture.primaryTick + deltaTicks, event.shiftKey) - gesture.primaryTick;
        const tickDelta = Math.max(-bounds.minTick, raw);
        const pitchDelta = Math.min(
            AUDIO_NOTE_MAX - bounds.maxPitch,
            Math.max(AUDIO_NOTE_MIN - bounds.minPitch, -Math.round((event.clientY - gesture.startClientY) / ROW_HEIGHT)),
        );
        if (!tickDelta && !pitchDelta) return;
        gesture.moved = true;
        previewNotes(moveNotes(gesture.startNotes, gesture.ids, tickDelta, pitchDelta));
    };

    const endNoteGesture = (event: ReactPointerEvent<HTMLDivElement>) => {
        const gesture = gestureRef.current;
        if (!gesture || gesture.pointerId !== event.pointerId) return;
        gestureRef.current = null;
        const next = draftRef.current;
        draftRef.current = null;
        setNoteDraft(null);
        if (next && gesture.moved) onNotes(next);
    };

    const addNoteAt = (event: ReactMouseEvent<HTMLDivElement>) => {
        if (!region) return;
        const box = gridRef.current?.getBoundingClientRect();
        if (!box) return;
        const tick = Math.min(Math.max(0, region.durationTicks - 1), snapTick((event.clientX - box.left) / pxPerTick, event.shiftKey));
        const pitch = clampPitch(AUDIO_NOTE_MAX - Math.floor((event.clientY - box.top) / ROW_HEIGHT));
        const length = Math.min(Math.max(AUDIO_MIN_NOTE_TICKS, region.durationTicks - tick), noteStep || beatTicks(ppqn, meter));
        const note = createAudioNote(tick, length, pitch);
        setSelectedNoteIds([note.id]);
        commitNotes(addNote(notes, note));
    };

    const nudgeNotes = (event: ReactKeyboardEvent<HTMLDivElement>) => {
        if (!region || !selectedNoteIds.length) {
            if (event.key === "Escape") setSelectedNoteIds([]);
            return;
        }
        if (event.key === "Escape") {
            event.preventDefault();
            setSelectedNoteIds([]);
            return;
        }
        if (event.key === "Delete" || event.key === "Backspace") {
            event.preventDefault();
            setSelectedNoteIds([]);
            commitNotes(removeNotes(notes, selectedNoteIds));
            return;
        }
        const step = event.shiftKey ? barTicks(ppqn, meter) : noteStep || beatTicks(ppqn, meter);
        const bounds = notesBounds(notes, selectedNoteIds);
        const rawTick = event.key === "ArrowLeft" ? -step : event.key === "ArrowRight" ? step : 0;
        const rawPitch = event.key === "ArrowDown" ? -1 : event.key === "ArrowUp" ? 1 : 0;
        if (!rawTick && !rawPitch) return;
        event.preventDefault();
        commitNotes(moveNotes(notes, selectedNoteIds, Math.max(-bounds.minTick, rawTick), Math.min(AUDIO_NOTE_MAX - bounds.maxPitch, Math.max(AUDIO_NOTE_MIN - bounds.minPitch, rawPitch))));
    };

    const gridImage = `repeating-linear-gradient(to right, ${theme.toolbar.border} 0 1px, transparent 1px ${Math.max(2, barPx)}px), repeating-linear-gradient(to right, ${theme.canvas.line} 0 1px, transparent 1px ${Math.max(2, beatPx)}px), repeating-linear-gradient(to bottom, ${theme.toolbar.border} 0 1px, transparent 1px ${octavePx}px), repeating-linear-gradient(to bottom, ${theme.canvas.line} 0 1px, transparent 1px ${ROW_HEIGHT}px)`;

    if (!region || !track) {
        return (
            <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
                <Music2 className="size-7" style={{ color: theme.node.muted }} />
                <span className="text-sm" style={{ color: theme.node.placeholder }}>
                    {t("canvas.audioStudio.rollEmpty")}
                </span>
                <button type="button" className="flex items-center gap-1.5 rounded-md px-2 py-1 text-sm transition hover:bg-hover" style={{ color: theme.node.text }} onClick={onClose}>
                    {t("canvas.audioStudio.rollBack")}
                </button>
            </div>
        );
    }

    const instrumentValue = track.instrument?.kind === "vst3" ? `vst:${track.instrument.pluginId}` : instrumentPreset(track.instrument?.preset).id;
    const vstOptions = vst.plugins.map((plugin) => ({ value: `vst:${plugin.id}`, label: plugin.vendor ? `${plugin.name} · ${plugin.vendor}` : plugin.name }));
    if (track.instrument?.kind === "vst3" && !vstOptions.some((option) => option.value === instrumentValue)) vstOptions.unshift({ value: instrumentValue, label: track.instrument.name || track.instrument.pluginId });
    const instrumentOptions = [
        { label: t("canvas.audioStudio.rollInstrumentBuiltin"), options: AUDIO_INSTRUMENT_PRESETS.map((preset) => ({ value: preset.id, label: t(preset.labelKey) })) },
        {
            label: t("canvas.audioStudio.rollInstrumentVst3"),
            options: vstOptions.length ? vstOptions : [{ value: "vst-unavailable", label: t(vst.status === "loading" ? "canvas.audioStudio.vstScanning" : "canvas.audioStudio.vstHostDown"), disabled: true }],
        },
    ];
    const vstEditorReady = track.instrument?.kind === "vst3" && vstSource !== null && vstSource.status === "ready" && Boolean(vstSource.instanceId);
    const vstEditorHint =
        track.instrument?.kind === "vst3" && vstSource && vstSource.status !== "ready"
            ? t(vstSource.status === "failed" ? "canvas.audioStudio.vstEditorFailed" : vstSource.status === "offline" ? "canvas.audioStudio.vstEditorOffline" : "canvas.audioStudio.vstEditorPending")
            : "";
    const vstEditorActionLabel = editorOpening
        ? t(editorOpened ? "canvas.audioStudio.vstEditorClosing" : "canvas.audioStudio.vstEditorOpening")
        : t(editorOpened ? "canvas.audioStudio.vstEditorClose" : "canvas.audioStudio.vstEditorOpen");

    return (
        <div className="flex min-h-0 flex-1 flex-col glass-card">
            <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1.5 border-b px-2 py-1 text-sm" style={{ borderColor: theme.toolbar.border, color: theme.node.muted }}>
                <input
                    className="w-40 min-w-0 shrink rounded-md border bg-transparent px-1.5 py-0.5 text-sm outline-none"
                    style={{ borderColor: theme.toolbar.border, color: theme.node.text }}
                    value={region.name || ""}
                    placeholder={track.name || t(AUDIO_TRACK_TYPE_LABEL_KEYS[audioTrackType(track)])}
                    aria-label={t("canvas.audioStudio.rollRegionName")}
                    onChange={(event) => onRegionPatch({ name: event.target.value })}
                />
                <span className="shrink-0 tabular-nums">{t("canvas.audioStudio.rollNotes", { count: notes.length })}</span>
                {audioTrackType(track) === "instrument" ? (
                    <label className="flex shrink-0 items-center gap-1.5" data-roll-instrument="true">
                        <span>{t("canvas.audioStudio.rollInstrument")}</span>
                        <Select
                            size="small"
                            className="w-[104px]"
                            value={instrumentValue}
                            options={instrumentOptions}
                            popupMatchSelectWidth={false}
                            styles={{ popup: { root: { zIndex: 1300 } } }}
                            aria-label={t("canvas.audioStudio.rollInstrument")}
                            onChange={(value: string) => {
                                if (value.startsWith("vst:")) {
                                    const pluginId = value.slice(4);
                                    const plugin = vst.plugins.find((item) => item.id === pluginId);
                                    const name = plugin?.name ?? (track.instrument?.kind === "vst3" ? track.instrument.name : undefined);
                                    // `stateKey` names this track's plug-in state blob; a fresh key follows a fresh plug-in.
                                    onTrackPatch({ instrument: { kind: "vst3", pluginId, stateKey: nanoid(), ...(name ? { name } : {}) } });
                                    return;
                                }
                                onTrackPatch({ instrument: { kind: "synth", preset: value } });
                            }}
                        />
                        {vst.status === "unavailable" ? (
                            <span className="shrink-0" style={{ color: theme.node.muted }}>
                                {t("canvas.audioStudio.vstHostDown")}
                            </span>
                        ) : null}
                    </label>
                ) : null}
                {vstEditorReady ? (
                    <>
                        <button
                            type="button"
                            className="flex h-6 shrink-0 items-center gap-1 rounded-md px-1.5 transition hover:bg-hover"
                            style={{ color: theme.node.text }}
                            data-roll-vst-editor="true"
                            disabled={editorOpening}
                            aria-label={vstEditorActionLabel}
                            title={vstEditorActionLabel}
                            onClick={() => void (editorOpened ? closeVstEditor() : openVstEditor())}
                        >
                            <SlidersHorizontal className="size-3.5" />
                            {vstEditorActionLabel}
                        </button>
                        {editorError ? (
                            <span className="shrink-0" style={{ color: theme.node.danger }} data-roll-vst-editor-error="true">
                                {t("canvas.audioStudio.vstEditorOpenFailed")}
                            </span>
                        ) : null}
                    </>
                ) : vstEditorHint ? (
                    <span className="shrink-0" style={{ color: theme.node.muted }} data-roll-vst-editor-hint="true">
                        {vstEditorHint}
                    </span>
                ) : null}
                <span className="flex shrink-0 items-center gap-1">
                    <button type="button" className={ROLL_ACTION_CLASS} style={{ color: theme.node.muted }} aria-label={t("canvas.audioStudio.zoomIn")} title={t("canvas.audioStudio.zoomIn")} onClick={() => setPxPerBeat((prev) => Math.min(MAX_PX_PER_BEAT, prev * 1.25))}>
                        <ZoomIn className="size-3.5" />
                    </button>
                    <button type="button" className={ROLL_ACTION_CLASS} style={{ color: theme.node.muted }} aria-label={t("canvas.audioStudio.zoomOut")} title={t("canvas.audioStudio.zoomOut")} onClick={() => setPxPerBeat((prev) => Math.max(MIN_PX_PER_BEAT, prev / 1.25))}>
                        <ZoomOut className="size-3.5" />
                    </button>
                </span>
                <span className="min-w-0 flex-1 truncate">{t("canvas.audioStudio.rollHint")}</span>
                <button type="button" className={ROLL_ACTION_CLASS} style={{ color: theme.node.muted }} aria-label={t("canvas.audioStudio.rollClose")} title={t("canvas.audioStudio.rollClose")} onClick={onClose}>
                    <X className="size-3.5" />
                </button>
            </div>

            <div ref={scrollRef} data-midi-roll="true" onPointerDown={() => gridRef.current?.focus()} className="thin-scrollbar relative min-h-0 flex-1 overflow-auto">
                <div className="relative flex" style={{ width: KEY_WIDTH + gridWidth, height: gridHeight }}>
                    <div className="sticky left-0 z-20 shrink-0" style={{ width: KEY_WIDTH }}>
                        {Array.from({ length: ROW_COUNT }, (_, index) => {
                            const pitch = AUDIO_NOTE_MAX - index;
                            const black = isBlackKey(pitch);
                            return (
                                <div key={pitch} className="flex items-center justify-end pr-1 text-xs leading-3 tabular-nums" style={{ height: ROW_HEIGHT, background: black ? theme.node.faint : theme.toolbar.panel, color: black ? theme.node.muted : theme.node.text, borderBottom: `1px solid ${theme.toolbar.border}` }}>
                                    {pitch % 12 === 0 ? noteName(pitch) : ""}
                                </div>
                            );
                        })}
                    </div>
                    <div
                        ref={gridRef}
                        tabIndex={0}
                        className="relative shrink-0 outline-none"
                        style={{ width: gridWidth, height: gridHeight, backgroundImage: gridImage, cursor: "crosshair" }}
                        onKeyDown={nudgeNotes}
                        onDoubleClick={addNoteAt}
                        onPointerMove={moveNoteGesture}
                        onPointerUp={endNoteGesture}
                        onPointerCancel={endNoteGesture}
                    >
                        {notes.map((note) => {
                            const selected = selectedNoteIds.includes(note.id);
                            return (
                                <div
                                    key={note.id}
                                    className="absolute rounded-md border"
                                    style={{
                                        left: note.tick * pxPerTick,
                                        top: (AUDIO_NOTE_MAX - note.pitch) * ROW_HEIGHT,
                                        width: Math.max(4, note.durationTicks * pxPerTick),
                                        height: ROW_HEIGHT - 2,
                                        background: selected ? theme.node.muted : theme.node.faint,
                                        borderColor: selected ? theme.node.accent : theme.toolbar.border,
                                        cursor: "grab",
                                    }}
                                    tabIndex={0}
                                    role="button"
                                    aria-label={`${noteName(note.pitch)} · ${note.durationTicks} ticks · ${Math.round(note.velocity * 100)}%`}
                                    title={t("canvas.audioStudio.rollNoteHint")}
                                    onFocus={() => setSelectedNoteIds((prev) => (prev.includes(note.id) ? prev : [note.id]))}
                                    onPointerDown={(event) => noteAt(event, note)}
                                    onDoubleClick={(event) => {
                                        event.stopPropagation();
                                        setSelectedNoteIds([]);
                                        commitNotes(removeNotes(notes, [note.id]));
                                    }}
                                >
                                    <span className="pointer-events-none absolute inset-y-0 right-0 w-[3px] opacity-60" style={{ background: theme.canvas.line }} />
                                </div>
                            );
                        })}
                        <span ref={playheadRef} className="pointer-events-none absolute bottom-0 left-0 top-0 z-10 w-px" style={{ background: theme.node.accent }} />
                    </div>
                </div>
                <div className="sticky bottom-0 z-30 flex" style={{ width: KEY_WIDTH + gridWidth }}>
                    <div className="sticky left-0 z-10 flex shrink-0 items-end justify-end pr-1 pb-1 text-sm" style={{ width: KEY_WIDTH, height: VELOCITY_HEIGHT, background: theme.toolbar.panel, borderTop: `1px solid ${theme.toolbar.border}`, color: theme.node.muted }}>
                        {t("canvas.audioStudio.rollVelocity")}
                    </div>
                    <div
                        className="relative shrink-0"
                        style={{ width: gridWidth, height: VELOCITY_HEIGHT, background: theme.canvas.background, borderTop: `1px solid ${theme.toolbar.border}` }}
                        onPointerDown={(event: ReactPointerEvent<HTMLDivElement>) => {
                            if (event.button !== 0) return;
                            const box = event.currentTarget.getBoundingClientRect();
                            const tick = Math.floor((event.clientX - box.left) / pxPerTick);
                            const hit = notes.find((note) => tick >= note.tick && tick <= note.tick + note.durationTicks);
                            if (!hit) return;
                            event.currentTarget.setPointerCapture(event.pointerId);
                            const affected = selectedNoteIds.includes(hit.id) ? selectedNoteIds : [hit.id];
                            velocityRef.current = { pointerId: event.pointerId, affected, moved: true };
                            const velocity = clampVelocity(1 - (event.clientY - box.top) / VELOCITY_HEIGHT);
                            previewNotes(setNoteVelocity(notes, affected, velocity));
                        }}
                        onPointerMove={(event: ReactPointerEvent<HTMLDivElement>) => {
                            const drag = velocityRef.current;
                            if (!drag || drag.pointerId !== event.pointerId) return;
                            const box = event.currentTarget.getBoundingClientRect();
                            previewNotes(setNoteVelocity(notes, drag.affected, clampVelocity(1 - (event.clientY - box.top) / VELOCITY_HEIGHT)));
                        }}
                        onPointerUp={(event: ReactPointerEvent<HTMLDivElement>) => {
                            const drag = velocityRef.current;
                            if (!drag || drag.pointerId !== event.pointerId) return;
                            velocityRef.current = null;
                            if (drag.moved) commitNotes(draftRef.current ?? notes);
                        }}
                        onPointerCancel={() => {
                            velocityRef.current = null;
                        }}
                    >
                        {notes.map((note) => (
                            <span
                                key={note.id}
                                className="pointer-events-none absolute bottom-0 w-[3px] rounded-t-sm"
                                style={{ left: note.tick * pxPerTick, height: Math.max(2, note.velocity * (VELOCITY_HEIGHT - 6)), background: selectedNoteIds.includes(note.id) ? theme.node.activeStroke : theme.node.faint }}
                            />
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}
