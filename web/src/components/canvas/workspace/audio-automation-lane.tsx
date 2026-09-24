import { useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from "react";
import { Select, Switch } from "antd";
import { Eraser, Circle, Trash2 } from "lucide-react";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";

import { AudioAutomationPointMenu, type AudioAutomationPointCommand } from "@/components/canvas/workspace/audio-menus";
import { AudioToggle, AUDIO_TRACK_TYPE_LABEL_KEYS } from "@/components/canvas/workspace/audio-panels";
import { useCanvasTheme } from "@/hooks/use-canvas-theme";
import {
    AUDIO_AUTOMATION_GAIN,
    AUDIO_AUTOMATION_PAN,
    audioAutomationSendTarget,
    automationLanesForTrack,
    automationSendId,
    automationTargetKind,
    automationValueRange,
    moveAutomationPoint,
    removeAutomationPoint,
    setAutomationPointCurve,
    upsertAutomationPoint,
} from "@/lib/canvas/audio-automation";
import { audioTrackType } from "@/lib/canvas/audio-project";
import { snapSeconds } from "@/lib/canvas/audio-timeline";
import type { CanvasAudioAutomationLane, CanvasAudioAutomationPoint, CanvasAudioTrack } from "@/types/canvas";

export const AUTOMATION_LANE_HEIGHT = 40;
export const AUTOMATION_PLOT_HEIGHT = AUTOMATION_LANE_HEIGHT - 8;

const POINT_SIZE = 6;
const POINT_HIT_SIZE = 12;
const PANEL_ACTION_CLASS = "grid size-5 shrink-0 place-items-center rounded-[2px] transition hover:bg-hover hover:opacity-100 hover:bg-hover";

export function automationTargetLabel(t: TFunction, target: string, tracks: CanvasAudioTrack[]) {
    const kind = automationTargetKind(target);
    if (kind === "gain") return t("canvas.audioStudio.automationGain");
    if (kind === "pan") return t("canvas.audioStudio.automationPan");
    if (kind !== "send") return target;
    const sendId = automationSendId(target);
    const owner = tracks.find((track) => (track.sends ?? []).some((send) => send.id === sendId));
    const send = owner ? (owner.sends ?? []).find((item) => item.id === sendId) : undefined;
    const destination = send ? tracks.find((track) => track.id === send.targetTrackId) : undefined;
    return `${t("canvas.audioStudio.automationSend")} · ${destination?.name || t("canvas.audioStudio.trackTypeReturn")}`;
}

export function automationTargetOptions(t: TFunction, track: CanvasAudioTrack | null, tracks: CanvasAudioTrack[], taken: string[]) {
    const options = [
        { value: AUDIO_AUTOMATION_GAIN, label: t("canvas.audioStudio.automationGain") },
        { value: AUDIO_AUTOMATION_PAN, label: t("canvas.audioStudio.automationPan") },
    ];
    (track?.sends ?? []).forEach((send) => {
        const target = audioAutomationSendTarget(send.id);
        options.push({ value: target, label: automationTargetLabel(t, target, tracks) });
    });
    return options.filter((option) => !taken.includes(option.value));
}

function segmentPath(from: CanvasAudioAutomationPoint, to: CanvasAudioAutomationPoint, x: (time: number) => number, y: (value: number) => number) {
    const startX = x(from.time);
    const startY = y(from.value);
    const endX = x(to.time);
    const endY = y(to.value);
    const curve = from.curve ?? "linear";
    if (curve === "hold") return `M ${startX} ${startY} H ${endX} V ${endY}`;
    if (curve === "sCurve") return `M ${startX} ${startY} C ${startX + (endX - startX) / 2} ${startY} ${endX - (endX - startX) / 2} ${endY} ${endX} ${endY}`;
    return `M ${startX} ${startY} L ${endX} ${endY}`;
}

type AudioAutomationLaneProps = {
    lane: CanvasAudioAutomationLane;
    tracks: CanvasAudioTrack[];
    headerWidth: number;
    width: number;
    pxPerSecond: number;
    snapStep: number;
    gridImage?: string;
    takenTargets: string[];
    registerDot: (laneId: string, trackId: string, target: string, element: HTMLElement | null) => void;
    onPatch: (patch: Partial<CanvasAudioAutomationLane>) => void;
    onPoints: (points: CanvasAudioAutomationPoint[]) => void;
};

export function AudioAutomationLane({ lane, tracks, headerWidth, width, pxPerSecond, snapStep, gridImage, takenTargets, registerDot, onPatch, onPoints }: AudioAutomationLaneProps) {
    const { t } = useTranslation();
    const theme = useCanvasTheme();
    const plotRef = useRef<HTMLDivElement>(null);
    const dragRef = useRef<{ pointerId: number; index: number; points: CanvasAudioAutomationPoint[] } | null>(null);
    const draftRef = useRef<CanvasAudioAutomationPoint[] | null>(null);
    const [draft, setDraft] = useState<CanvasAudioAutomationPoint[] | null>(null);
    const [activeIndex, setActiveIndex] = useState<number | null>(null);
    const track = tracks.find((item) => item.id === lane.trackId) ?? null;
    const points = draft ?? lane.points;
    const { min, max } = automationValueRange(lane.target);
    const toY = (value: number) => AUTOMATION_PLOT_HEIGHT * (1 - (Math.min(max, Math.max(min, value)) - min) / (max - min));
    const toValue = (y: number) => min + (1 - Math.min(1, Math.max(0, y / AUTOMATION_PLOT_HEIGHT))) * (max - min);
    const targets = [{ value: lane.target, label: automationTargetLabel(t, lane.target, tracks) }, ...automationTargetOptions(t, track, tracks, takenTargets).filter((option) => option.value !== lane.target)];

    const pointerTime = (event: ReactPointerEvent<HTMLDivElement> | ReactMouseEvent<HTMLDivElement>, suspend: boolean) => {
        const box = plotRef.current?.getBoundingClientRect();
        if (!box) return 0;
        return snapSeconds(Math.max(0, (event.clientX - box.left) / pxPerSecond), suspend ? 0 : snapStep);
    };

    const beginPoint = (event: ReactPointerEvent<HTMLDivElement>, index: number) => {
        if (event.button !== 0) return;
        event.stopPropagation();
        plotRef.current?.setPointerCapture(event.pointerId);
        dragRef.current = { pointerId: event.pointerId, index, points: lane.points };
        setActiveIndex(index);
    };

    const movePointer = (event: ReactPointerEvent<HTMLDivElement>) => {
        const drag = dragRef.current;
        if (!drag || drag.pointerId !== event.pointerId) return;
        const box = plotRef.current?.getBoundingClientRect();
        if (!box) return;
        const next = moveAutomationPoint(drag.points, drag.index, pointerTime(event, event.shiftKey), toValue(event.clientY - box.top));
        draftRef.current = next;
        setDraft(next);
    };

    const endPointer = (event: ReactPointerEvent<HTMLDivElement>) => {
        const drag = dragRef.current;
        if (!drag || drag.pointerId !== event.pointerId) return;
        dragRef.current = null;
        const next = draftRef.current;
        draftRef.current = null;
        setDraft(null);
        if (next) onPoints(next);
    };

    const addPoint = (event: ReactMouseEvent<HTMLDivElement>) => {
        const box = plotRef.current?.getBoundingClientRect();
        if (!box) return;
        onPoints(upsertAutomationPoint(lane.points, pointerTime(event, event.shiftKey), toValue(event.clientY - box.top)));
    };

    const handlePointCommand = (index: number, command: AudioAutomationPointCommand) => {
        if (command === "delete") {
            setActiveIndex(null);
            onPoints(removeAutomationPoint(lane.points, index));
            return;
        }
        onPoints(setAutomationPointCurve(lane.points, index, command));
    };

    const nudgePoint = (event: ReactKeyboardEvent<HTMLDivElement>, index: number) => {
        const point = lane.points[index];
        if (!point) return;
        if (event.key === "Delete" || event.key === "Backspace") {
            event.preventDefault();
            handlePointCommand(index, "delete");
            return;
        }
        if (event.key === "Enter") {
            event.preventDefault();
            onPoints(setAutomationPointCurve(lane.points, index, point.curve === "linear" ? "hold" : point.curve === "hold" ? "sCurve" : "linear"));
            return;
        }
        const timeStep = event.shiftKey ? 0.01 : snapStep || 0.01;
        const valueStep = (max - min) * (event.shiftKey ? 0.002 : 0.02);
        const time = event.key === "ArrowLeft" ? point.time - timeStep : event.key === "ArrowRight" ? point.time + timeStep : null;
        const value = event.key === "ArrowUp" ? point.value + valueStep : event.key === "ArrowDown" ? point.value - valueStep : null;
        if (time === null && value === null) return;
        event.preventDefault();
        setActiveIndex(index);
        onPoints(moveAutomationPoint(lane.points, index, snapSeconds(time ?? point.time, event.shiftKey ? 0 : snapStep), value ?? point.value));
    };

    return (
        <div className="flex glass-card" style={{ height: AUTOMATION_LANE_HEIGHT }}>
            <div className="sticky left-0 z-30 flex shrink-0 items-center gap-1 px-2" style={{ width: headerWidth, background: theme.canvas.background, borderBottom: `1px solid ${theme.toolbar.border}` }}>
                <Select
                    size="small"
                    variant="borderless"
                    className="min-w-0 flex-1"
                    value={lane.target}
                    options={targets}
                    popupMatchSelectWidth={false}
                    styles={{ popup: { root: { zIndex: 1300 } } }}
                    aria-label={t("canvas.audioStudio.automationTarget")}
                    onChange={(value: string) => onPatch({ target: value })}
                />
                <AudioToggle label={t("canvas.audioStudio.automationEnable")} active={lane.enabled} onClick={() => onPatch({ enabled: !lane.enabled })}>
                    <Circle className="size-2" fill={lane.enabled ? "currentColor" : "none"} />
                </AudioToggle>
            </div>
            <div className="relative shrink-0" style={{ width, borderBottom: `1px solid ${theme.toolbar.border}` }}>
                <div
                    ref={plotRef}
                    className="absolute inset-x-0 top-1 select-none"
                    style={{ height: AUTOMATION_PLOT_HEIGHT, backgroundImage: gridImage, cursor: "crosshair" }}
                    onPointerMove={movePointer}
                    onPointerUp={endPointer}
                    onPointerCancel={endPointer}
                    onDoubleClick={addPoint}
                >
                    <svg className="pointer-events-none absolute inset-0" width={width} height={AUTOMATION_PLOT_HEIGHT} aria-hidden>
                        {points.slice(0, -1).map((point, index) => (
                            <path key={index} d={segmentPath(point, points[index + 1], (time) => time * pxPerSecond, toY)} fill="none" stroke={theme.node.muted} strokeWidth={1} />
                        ))}
                    </svg>
                    {points.map((point, index) => (
                        <AudioAutomationPointMenu key={index} curve={point.curve ?? "linear"} onCommand={(command) => handlePointCommand(index, command)}>
                            <div
                                className="absolute grid place-items-center rounded-[2px]"
                                style={{ left: point.time * pxPerSecond - POINT_HIT_SIZE / 2, top: toY(point.value) - POINT_HIT_SIZE / 2, width: POINT_HIT_SIZE, height: POINT_HIT_SIZE, cursor: "grab" }}
                                tabIndex={0}
                                role="button"
                                data-automation-point="true"
                                aria-label={`${automationTargetLabel(t, lane.target, tracks)} · ${point.time.toFixed(2)}s`}
                                onPointerDown={(event) => beginPoint(event, index)}
                                onKeyDown={(event) => nudgePoint(event, index)}
                                onDoubleClick={(event) => {
                                    event.stopPropagation();
                                    handlePointCommand(index, "delete");
                                }}
                                title={`${automationTargetLabel(t, lane.target, tracks)} · ${point.time.toFixed(2)}s · ${t("canvas.audioStudio.automationPointNudge")}`}
                            >
                                <span className="pointer-events-none block" style={{ width: POINT_SIZE, height: POINT_SIZE, background: index === activeIndex ? theme.node.activeStroke : theme.node.muted }} />
                            </div>
                        </AudioAutomationPointMenu>
                    ))}
                    {lane.enabled ? (
                        <span
                            ref={(element) => registerDot(lane.id, lane.trackId, lane.target, element)}
                            className="pointer-events-none absolute left-0 top-0 size-1.5 rounded-full"
                            style={{ background: theme.node.primaryText, marginTop: -POINT_SIZE / 2 }}
                            aria-hidden
                        />
                    ) : null}
                </div>
            </div>
        </div>
    );
}

type AudioAutomationPanelProps = {
    automation: CanvasAudioAutomationLane[];
    tracks: CanvasAudioTrack[];
    selectedTrackId: string;
    onAdd: (trackId: string, target: string) => void;
    onPatch: (laneId: string, patch: Partial<CanvasAudioAutomationLane>) => void;
    onRemove: (laneId: string) => void;
    onClearPoints: (laneId: string) => void;
};

export function AudioAutomationPanel({ automation, tracks, selectedTrackId, onAdd, onPatch, onRemove, onClearPoints }: AudioAutomationPanelProps) {
    const { t } = useTranslation();
    const theme = useCanvasTheme();
    const track = tracks.find((item) => item.id === selectedTrackId) ?? tracks[0] ?? null;
    if (!track) {
        return (
            <div className="flex min-h-0 flex-1 items-center justify-center px-4 text-center text-sm glass-card" style={{ color: theme.node.placeholder }}>
                {t("canvas.audioStudio.noTracks")}
            </div>
        );
    }
    const lanes = automationLanesForTrack(automation, track.id);
    const options = automationTargetOptions(
        t,
        track,
        tracks,
        lanes.map((lane) => lane.target),
    );
    return (
        <div className="thin-scrollbar min-h-0 flex-1 overflow-y-auto text-sm glass-card" style={{ color: theme.node.text }}>
            <div className="flex flex-col gap-1 px-2 py-1.5">
                <div className="flex min-w-0 items-center gap-1.5">
                    <span className="w-14 shrink-0" style={{ color: theme.node.muted }}>
                        {t("canvas.audioStudio.inspectorTrack")}
                    </span>
                    <span className="min-w-0 flex-1 truncate">{track.name || t(AUDIO_TRACK_TYPE_LABEL_KEYS[audioTrackType(track)])}</span>
                </div>
                <Select
                    size="small"
                    variant="borderless"
                    className="w-full"
                    value={null}
                    placeholder={t("canvas.audioStudio.automationAdd")}
                    options={options}
                    disabled={!options.length}
                    popupMatchSelectWidth={false}
                    styles={{ popup: { root: { zIndex: 1300 } } }}
                    aria-label={t("canvas.audioStudio.automationAdd")}
                    onChange={(target: string) => onAdd(track.id, target)}
                />
                <span className="text-sm leading-4" style={{ color: theme.node.placeholder }}>
                    {t("canvas.audioStudio.automationHint")}
                </span>
            </div>
            {lanes.length ? (
                lanes.map((lane) => (
                    <div key={lane.id} className="flex min-w-0 items-center gap-1.5 border-t px-2 py-1" style={{ borderColor: theme.toolbar.border }}>
                        <span className="min-w-0 flex-1 truncate">{automationTargetLabel(t, lane.target, tracks)}</span>
                        <span className="shrink-0 tabular-nums" style={{ color: theme.node.muted }}>
                            {t("canvas.audioStudio.automationPoints", { count: lane.points.length })}
                        </span>
                        <Switch size="small" checked={lane.enabled} aria-label={t("canvas.audioStudio.automationEnable")} onChange={(checked) => onPatch(lane.id, { enabled: checked })} />
                        <button type="button" className={PANEL_ACTION_CLASS} style={{ color: theme.node.muted }} aria-label={t("canvas.audioStudio.automationClear")} title={t("canvas.audioStudio.automationClear")} onClick={() => onClearPoints(lane.id)}>
                            <Eraser className="size-3.5" />
                        </button>
                        <button type="button" className={PANEL_ACTION_CLASS} style={{ color: theme.node.muted }} aria-label={t("canvas.audioStudio.automationRemove")} title={t("canvas.audioStudio.automationRemove")} onClick={() => onRemove(lane.id)}>
                            <Trash2 className="size-3.5" />
                        </button>
                    </div>
                ))
            ) : (
                <p className="px-2 py-2" style={{ color: theme.node.placeholder }}>
                    {t("canvas.audioStudio.automationEmpty")}
                </p>
            )}
        </div>
    );
}
