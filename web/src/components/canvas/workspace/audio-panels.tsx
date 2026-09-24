import { useState, type ReactNode } from "react";
import { InputNumber, Select, Slider, Switch } from "antd";
import { Circle, Link2, Music2, Plus, SlidersVertical, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";

import PsColorPicker from "@/components/canvas/workspace/ps-color-picker";
import { useCanvasTheme } from "@/hooks/use-canvas-theme";
import { STUDIO_FLAT_BUTTON_CLASS, STUDIO_PANEL_LABEL_CLASS, STUDIO_PANEL_ROW_CLASS } from "@/components/canvas/workspace/studio-chrome";
import { AUDIO_AUTOMATION_GAIN, AUDIO_AUTOMATION_PAN, audioAutomationSendTarget, automationOwns } from "@/lib/canvas/audio-automation";
import { AUDIO_FADER_MAX_DB, AUDIO_FADER_MIN_DB, AUDIO_GAIN_MAX, audioReturnTracks, audioRoutingCycle, audioTrackType, clampGain, createAudioSend, faderDbGain, formatFaderDb, gainFaderDb, parseDbValue, parseGainPercent } from "@/lib/canvas/audio-project";
import { formatAudioTime } from "@/lib/canvas/audio-waveform";
import type { CanvasAudioAutomationLane, CanvasAudioCapture, CanvasAudioClip, CanvasAudioFadeShape, CanvasAudioSend, CanvasAudioSnap, CanvasAudioTrack, CanvasAudioTrackType, CanvasNodeData, CanvasNodeMetadata } from "@/types/canvas";

export const AUDIO_SNAP_OPTIONS: CanvasAudioSnap[] = ["off", "bar", "beat", "1/2", "1/4", "1/8", "1/16"];
export const AUDIO_SNAP_LABEL_KEYS: Record<CanvasAudioSnap, string> = { off: "canvas.audioStudio.snapOff", bar: "canvas.audioStudio.snapBar", beat: "canvas.audioStudio.snapBeat", "1/2": "canvas.audioStudio.snapHalf", "1/4": "canvas.audioStudio.snapQuarter", "1/8": "canvas.audioStudio.snapEighth", "1/16": "canvas.audioStudio.snapSixteenth" };
export const AUDIO_METER_OPTIONS = ["4/4", "3/4", "2/4", "6/8", "5/4", "7/8"];
export const AUDIO_COUNT_IN_OPTIONS = [0, 1, 2, 4];
export const AUDIO_CHANNEL_OPTIONS = [1, 2];
export const AUDIO_FADE_SHAPE_OPTIONS: CanvasAudioFadeShape[] = ["linear", "exponential", "sCurve"];
export const AUDIO_FADE_SHAPE_LABEL_KEYS: Record<CanvasAudioFadeShape, string> = {
    linear: "canvas.audioStudio.fadeLinear",
    exponential: "canvas.audioStudio.fadeExponential",
    sCurve: "canvas.audioStudio.fadeSCurve",
};
export const AUDIO_TRACK_TYPE_LABEL_KEYS: Record<CanvasAudioTrackType, string> = {
    audio: "canvas.audioStudio.trackTypeAudio",
    instrument: "canvas.audioStudio.trackTypeInstrument",
    midi: "canvas.audioStudio.trackTypeMidi",
    group: "canvas.audioStudio.trackTypeGroup",
    return: "canvas.audioStudio.trackTypeReturn",
    master: "canvas.audioStudio.trackTypeMaster",
};

const ROW_CLASS = STUDIO_PANEL_ROW_CLASS;
const LABEL_CLASS = STUDIO_PANEL_LABEL_CLASS;
const SECTION_CLASS = "flex shrink-0 flex-col gap-0.5 px-2 pb-2 pt-1.5";
const FLAT_BUTTON_CLASS = STUDIO_FLAT_BUTTON_CLASS;

export function AudioMeter({ trackId, register, className = "" }: { trackId: string; register: (trackId: string, channel: number, element: HTMLElement | null) => void; className?: string }) {
    const theme = useCanvasTheme();
    return (
        <span className={`flex shrink-0 items-stretch gap-px rounded-[2px] ${className}`} aria-hidden>
            {[0, 1].map((channel) => (
                <span key={channel} className="relative w-[2px] overflow-hidden rounded-[2px]" style={{ background: theme.toolbar.border }}>
                    <span
                        ref={(element) => register(trackId, channel, element)}
                        className="absolute inset-x-0 bottom-0 top-0 origin-bottom"
                        style={{ background: theme.node.muted, transform: "scaleY(0)" }}
                    />
                </span>
            ))}
        </span>
    );
}

export function AudioToggle({ label, active, activeColor, activeBackground, onClick, className = "size-6", children }: { label: string; active: boolean; activeColor?: string; activeBackground?: string; onClick: () => void; className?: string; children: ReactNode }) {
    const theme = useCanvasTheme();
    return (
        <button
            type="button"
            className={`grid shrink-0 place-items-center rounded-[2px] text-sm font-medium transition hover:bg-hover ${className}`}
            style={active ? { background: activeBackground || theme.toolbar.activeBg, color: activeColor || theme.toolbar.activeText } : { color: theme.node.muted }}
            aria-label={label}
            title={label}
            aria-pressed={active}
            onClick={onClick}
        >
            {children}
        </button>
    );
}

/** Slider that keeps a local draft while dragging and writes the document once on release. */
export function AudioSlider({ label, value, min, max, step = 1, linked = false, format, onPreview, onCommit, onReset }: { label: string; value: number; min: number; max: number; step?: number; linked?: boolean; format?: (value: number) => string; onPreview?: (value: number) => void; onCommit: (value: number) => void; onReset?: () => void }) {
    const theme = useCanvasTheme();
    const { t } = useTranslation();
    const [draft, setDraft] = useState<number | null>(null);
    const current = draft ?? value;
    const text = format ? format(current) : String(Math.round(current * 10) / 10);
    return (
        <label className={ROW_CLASS} onDoubleClick={linked ? undefined : onReset}>
            <span className={`${LABEL_CLASS} flex items-center gap-0.5`} style={{ color: theme.node.muted }}>
                {linked ? (
                    <span className="flex shrink-0" title={t("canvas.audioStudio.automationLink")} aria-hidden>
                        <Link2 className="size-2.5" />
                    </span>
                ) : null}
                <span className="truncate">{label}</span>
            </span>
            <Slider
                className="!mx-0 min-w-0 flex-1"
                min={min}
                max={max}
                step={step}
                value={current}
                disabled={linked}
                tooltip={{ formatter: (input) => (format ? format(input ?? 0) : String(input)) }}
                ariaLabelForHandle={label}
                onChange={(next) => {
                    setDraft(next);
                    onPreview?.(next);
                }}
                onChangeComplete={(next) => {
                    setDraft(null);
                    onCommit(next);
                }}
            />
            <span className="w-10 shrink-0 text-right text-sm tabular-nums" style={{ color: theme.node.muted }}>
                {text}
            </span>
        </label>
    );
}

/** Gain field: shows the slider's formatted value, keeps the raw text while typing and commits once on Enter or blur. */
export function AudioValueInput({ label, value, format, parse, onCommit, disabled = false, onReset, className = "" }: { label: string; value: number; format: (value: number) => string; parse: (text: string) => number | null; onCommit: (value: number) => void; disabled?: boolean; onReset?: () => void; className?: string }) {
    const theme = useCanvasTheme();
    const [draft, setDraft] = useState<string | null>(null);
    const commit = () => {
        if (draft === null) return;
        setDraft(null);
        const next = parse(draft);
        if (next !== null && next !== value) onCommit(next);
    };
    return (
        <input
            className={`min-w-0 rounded-[2px] border bg-transparent px-1 py-0.5 text-right text-sm tabular-nums outline-none transition hover:bg-hover focus:bg-hover disabled:opacity-40 disabled:hover:bg-transparent hover:bg-hover focus:bg-hover ${className}`}
            style={{ borderColor: theme.toolbar.border, color: theme.node.text }}
            value={draft ?? format(value)}
            disabled={disabled}
            aria-label={label}
            title={label}
            inputMode="decimal"
            autoComplete="off"
            spellCheck={false}
            onChange={(event) => setDraft(event.target.value)}
            onFocus={(event) => {
                setDraft(format(value));
                event.currentTarget.select();
            }}
            onBlur={commit}
            onDoubleClick={(event) => {
                event.stopPropagation();
                if (disabled || !onReset) return;
                setDraft(null);
                onReset();
            }}
            onKeyDown={(event) => {
                if (event.key === "Enter") commit();
                else if (event.key === "Escape") setDraft(null);
            }}
        />
    );
}

export function AudioSendList({ track, tracks, automation, onChange }: { track: CanvasAudioTrack; tracks: CanvasAudioTrack[]; automation: CanvasAudioAutomationLane[]; onChange: (sends: CanvasAudioSend[]) => void }) {
    const { t } = useTranslation();
    const theme = useCanvasTheme();
    const returns = audioReturnTracks(tracks);
    const sends = track.sends ?? [];
    const patch = (id: string, next: Partial<CanvasAudioSend>) => onChange(sends.map((send) => (send.id === id ? { ...send, ...next } : send)));
    return (
        <div className={SECTION_CLASS}>
            <div className="flex items-center gap-1.5">
                <span className="text-sm" style={{ color: theme.node.muted }}>
                    {t("canvas.audioStudio.sends")}
                </span>
                <span className="min-w-0 flex-1" />
                {returns.length ? (
                    <Select
                        size="small"
                        variant="borderless"
                        className="min-w-0 flex-1"
                        value={null}
                        placeholder={t("canvas.audioStudio.sendAdd")}
                        options={returns.map((item) => ({ value: item.id, label: item.name || t("canvas.audioStudio.trackTypeReturn") }))}
                        popupMatchSelectWidth={false}
                        styles={{ popup: { root: { zIndex: 1300 } } }}
                        aria-label={t("canvas.audioStudio.sendAdd")}
                        onChange={(target: string) => onChange([...sends, createAudioSend(target)])}
                    />
                ) : (
                    <span className="truncate text-sm" style={{ color: theme.node.placeholder }}>
                        {t("canvas.audioStudio.noReturnTracks")}
                    </span>
                )}
            </div>
            {sends.length ? (
                sends.map((send) => {
                    const linked = automationOwns(automation, track.id, audioAutomationSendTarget(send.id));
                    return (
                    <div key={send.id} className="flex flex-col gap-0.5 border-t pt-0.5" style={{ borderColor: theme.toolbar.border }}>
                        <div className="flex items-center gap-1">
                            <AudioToggle label={t("canvas.audioStudio.sendEnable")} active={send.enabled} onClick={() => patch(send.id, { enabled: !send.enabled })} className="size-4">
                                <Circle className="size-2" fill={send.enabled ? "currentColor" : "none"} />
                            </AudioToggle>
                            <Select
                                size="small"
                                variant="borderless"
                                className="min-w-0 flex-1"
                                value={send.targetTrackId}
                                options={returns.map((item) => ({ value: item.id, label: item.name || t("canvas.audioStudio.trackTypeReturn") }))}
                                popupMatchSelectWidth={false}
                                styles={{ popup: { root: { zIndex: 1300 } } }}
                                aria-label={t("canvas.audioStudio.sendTarget")}
                                onChange={(target: string) => patch(send.id, { targetTrackId: target })}
                            />
                            <button
                                type="button"
                                className="shrink-0 rounded-[2px] px-1 text-sm transition hover:bg-hover"
                                style={send.pre ? { background: theme.toolbar.activeBg, color: theme.toolbar.activeText } : { color: theme.node.muted }}
                                aria-label={t("canvas.audioStudio.sendPre")}
                                title={t(send.pre ? "canvas.audioStudio.sendPre" : "canvas.audioStudio.sendPost")}
                                aria-pressed={send.pre}
                                onClick={() => patch(send.id, { pre: !send.pre })}
                            >
                                {t(send.pre ? "canvas.audioStudio.sendPre" : "canvas.audioStudio.sendPost")}
                            </button>
                            <button
                                type="button"
                                className="grid size-5 shrink-0 place-items-center rounded-[2px] transition hover:bg-hover hover:opacity-100 hover:bg-hover"
                                style={{ color: theme.node.muted }}
                                aria-label={t("canvas.audioStudio.sendRemove")}
                                title={t("canvas.audioStudio.sendRemove")}
                                onClick={() => onChange(sends.filter((item) => item.id !== send.id))}
                            >
                                <Trash2 className="size-3" />
                            </button>
                        </div>
                        <div className="flex items-center gap-1 pl-5">
                            {linked ? (
                                <span className="flex shrink-0" style={{ color: theme.node.muted }} title={t("canvas.audioStudio.automationLink")} aria-hidden>
                                    <Link2 className="size-2.5" />
                                </span>
                            ) : null}
                            <AudioValueInput
                                label={t("canvas.audioStudio.sendGain")}
                                value={Math.round(clampGain(send.gain) * 100)}
                                format={(value) => String(Math.round(value))}
                                parse={(text) => parseGainPercent(text, Math.round(AUDIO_GAIN_MAX * 100))}
                                onCommit={(percent) => patch(send.id, { gain: clampGain(Math.round(percent) / 100) })}
                                disabled={linked}
                                className="min-w-0 flex-1"
                            />
                            <span className="w-3 shrink-0 text-sm" style={{ color: theme.node.muted }}>
                                %
                            </span>
                        </div>
                    </div>
                    );
                })
            ) : (
                <span className="px-0.5 text-sm" style={{ color: theme.node.placeholder }}>
                    {t("canvas.audioStudio.noSends")}
                </span>
            )}
        </div>
    );
}

type AudioInspectorPanelProps = {
    tracks: CanvasAudioTrack[];
    selectedTrackId: string;
    clips: CanvasAudioClip[];
    selectedClipIds: string[];
    masterGain: number;
    automation: CanvasAudioAutomationLane[];
    onSelectTrack: (trackId: string) => void;
    onTrackPatch: (trackId: string, patch: Partial<CanvasAudioTrack>) => void;
    onMixPreview: (trackId: string, patch: { gain?: number; pan?: number }) => void;
    onMasterGain: (value: number) => void;
};

export function AudioInspectorPanel({ tracks, selectedTrackId, clips, selectedClipIds, masterGain, automation, onSelectTrack, onTrackPatch, onMixPreview, onMasterGain }: AudioInspectorPanelProps) {
    const { t } = useTranslation();
    const theme = useCanvasTheme();
    const track = tracks.find((item) => item.id === selectedTrackId) ?? tracks[0];
    const clip = clips.find((item) => item.id === selectedClipIds[selectedClipIds.length - 1]);
    if (!track) {
        return (
            <div className="flex min-h-0 flex-1 items-center justify-center px-4 text-center text-sm glass-card" style={{ color: theme.node.placeholder }}>
                {t("canvas.audioStudio.noTracks")}
            </div>
        );
    }
    const type = audioTrackType(track);
    const master = type === "master";
    const gainAutomated = automationOwns(automation, track.id, AUDIO_AUTOMATION_GAIN);
    const outputId = track.output && audioRoutingCycle(tracks, track.id, track.output) ? "" : track.output || "";
    const outputs = tracks.filter((item) => item.id !== track.id && !audioRoutingCycle(tracks, track.id, item.id));
    const trackLabel = (item: CanvasAudioTrack) => item.name || t(AUDIO_TRACK_TYPE_LABEL_KEYS[audioTrackType(item)]);
    return (
        <div className="thin-scrollbar min-h-0 flex-1 overflow-y-auto text-sm glass-card" style={{ color: theme.node.text }}>
            <div className={SECTION_CLASS}>
                <label className={ROW_CLASS}>
                    <span className={LABEL_CLASS} style={{ color: theme.node.muted }}>
                        {t("canvas.audioStudio.inspectorTrack")}
                    </span>
                    <Select
                        size="small"
                        className="min-w-0 flex-1"
                        value={track.id}
                        options={tracks.map((item) => ({ value: item.id, label: trackLabel(item) }))}
                        popupMatchSelectWidth={false}
                        styles={{ popup: { root: { zIndex: 1300 } } }}
                        aria-label={t("canvas.audioStudio.inspectorTrack")}
                        onChange={onSelectTrack}
                    />
                </label>
                <div className={ROW_CLASS}>
                    <span className={LABEL_CLASS} style={{ color: theme.node.muted }}>
                        {t("canvas.audioStudio.trackType")}
                    </span>
                    <span>
                        {t(AUDIO_TRACK_TYPE_LABEL_KEYS[type])}
                        {master ? "" : ` · ${t(type === "return" ? "canvas.audioStudio.trackRoleReturn" : type === "group" ? "canvas.audioStudio.trackRoleGroup" : "canvas.audioStudio.trackRoleSource")}`}
                    </span>
                </div>
                <label className={ROW_CLASS}>
                    <span className={LABEL_CLASS} style={{ color: theme.node.muted }}>
                        {t("canvas.audioStudio.name")}
                    </span>
                    <input
                        className="min-w-0 flex-1 rounded-[2px] border bg-transparent px-1.5 py-0.5 text-sm outline-none"
                        style={{ borderColor: theme.toolbar.border, color: theme.node.text }}
                        value={track.name}
                        placeholder={t(AUDIO_TRACK_TYPE_LABEL_KEYS[type])}
                        aria-label={t("canvas.audioStudio.name")}
                        onChange={(event) => onTrackPatch(track.id, { name: event.target.value })}
                    />
                </label>
                <div className={ROW_CLASS}>
                    <span className={LABEL_CLASS} style={{ color: theme.node.muted }}>
                        {t("canvas.audioStudio.trackColor")}
                    </span>
                    <PsColorPicker value={track.color || ""} ariaLabel={t("canvas.audioStudio.trackColor")} onChange={(hex) => onTrackPatch(track.id, { color: hex })} />
                </div>
                <div className={ROW_CLASS}>
                    <span className={`${LABEL_CLASS} flex items-center gap-0.5`} style={{ color: theme.node.muted }}>
                        {gainAutomated ? (
                            <span className="flex shrink-0" title={t("canvas.audioStudio.automationLink")} aria-hidden>
                                <Link2 className="size-2.5" />
                            </span>
                        ) : null}
                        <span className="truncate">{t("canvas.audioStudio.gain")}</span>
                    </span>
                    <AudioValueInput
                        label={t("canvas.audioStudio.gain")}
                        value={Math.round(gainFaderDb(master ? masterGain : track.gain) * 10) / 10}
                        format={formatFaderDb}
                        parse={(text) => parseDbValue(text, AUDIO_FADER_MIN_DB, AUDIO_FADER_MAX_DB)}
                        onCommit={(value) => (master ? onMasterGain(faderDbGain(Math.round(value * 10) / 10)) : onTrackPatch(track.id, { gain: faderDbGain(Math.round(value * 10) / 10) }))}
                        onReset={() => (master ? onMasterGain(1) : onTrackPatch(track.id, { gain: 1 }))}
                        disabled={gainAutomated}
                        className="w-16 shrink-0"
                    />
                    <span className="shrink-0 text-sm" style={{ color: theme.node.muted }}>
                        dB
                    </span>
                </div>
                <AudioSlider
                    label={t("canvas.audioStudio.pan")}
                    value={Math.round((track.pan ?? 0) * 100) / 100}
                    min={-1}
                    max={1}
                    step={0.05}
                    linked={automationOwns(automation, track.id, AUDIO_AUTOMATION_PAN)}
                    format={(value) => (Math.abs(value) < 0.02 ? "C" : `${value < 0 ? "L" : "R"}${Math.round(Math.abs(value) * 100)}`)}
                    onPreview={(value) => onMixPreview(track.id, { pan: value })}
                    onCommit={(value) => onTrackPatch(track.id, { pan: value })}
                    onReset={() => onTrackPatch(track.id, { pan: 0 })}
                />
                <div className="flex items-center gap-1 py-0.5">
                    <AudioToggle label={t("canvas.audioStudio.mute")} active={track.mute} onClick={() => onTrackPatch(track.id, { mute: !track.mute })}>
                        M
                    </AudioToggle>
                    <AudioToggle label={t("canvas.audioStudio.solo")} active={track.solo} activeColor={theme.node.warning} activeBackground={theme.node.warningSoft} onClick={() => onTrackPatch(track.id, { solo: !track.solo })}>
                        S
                    </AudioToggle>
                    {type === "audio" ? (
                        <AudioToggle label={t("canvas.audioStudio.trackArm")} active={Boolean(track.armed)} activeColor={theme.node.danger} activeBackground={theme.node.dangerSoft} onClick={() => onTrackPatch(track.id, { armed: !track.armed })}>
                            <Circle className="size-2" fill={track.armed ? "currentColor" : "none"} />
                        </AudioToggle>
                    ) : null}
                </div>
                {master ? null : (
                    <label className={ROW_CLASS}>
                        <span className={LABEL_CLASS} style={{ color: theme.node.muted }}>
                            {t("canvas.audioStudio.trackOutput")}
                        </span>
                        <Select
                            size="small"
                            className="min-w-0 flex-1"
                            value={outputId || undefined}
                            placeholder={t("canvas.audioStudio.trackTypeMaster")}
                            options={outputs.map((item) => ({ value: item.id, label: trackLabel(item) }))}
                            popupMatchSelectWidth={false}
                            styles={{ popup: { root: { zIndex: 1300 } } }}
                            aria-label={t("canvas.audioStudio.trackOutput")}
                            onChange={(value: string) => onTrackPatch(track.id, { output: value })}
                        />
                    </label>
                )}
            </div>
            {master ? null : <AudioSendList track={track} tracks={tracks} automation={automation} onChange={(sends) => onTrackPatch(track.id, { sends })} />}
            <div className={SECTION_CLASS}>
                <span className="text-sm" style={{ color: theme.node.muted }}>
                    {t("canvas.audioStudio.inspectorClip")}
                </span>
                {clip ? (
                    <div className="flex flex-col gap-0.5">
                        <span className="truncate">{clip.name || t("canvas.nodeTypes.audio")}</span>
                        <span style={{ color: theme.node.muted }}>
                            {t("canvas.audioStudio.clipStart")} {formatAudioTime(clip.start)} · {t("canvas.audioStudio.clipLength")} {formatAudioTime(clip.duration)}
                        </span>
                    </div>
                ) : (
                    <span style={{ color: theme.node.placeholder }}>{t("canvas.audioStudio.noClipSelection")}</span>
                )}
            </div>
        </div>
    );
}

export function AudioMediaPoolPanel({ audioNodes, canAdd, onAdd, onGoCanvas }: { audioNodes: CanvasNodeData[]; canAdd: boolean; onAdd: (node: CanvasNodeData) => void; onGoCanvas: () => void }) {
    const { t } = useTranslation();
    const theme = useCanvasTheme();
    if (!audioNodes.length) {
        return (
            <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 px-4 text-center glass-card">
                <Music2 className="size-5" style={{ color: theme.node.muted }} />
                <span className="text-sm" style={{ color: theme.node.placeholder }}>
                    {t("canvas.audioStudio.mediaEmpty")}
                </span>
                <button type="button" className={FLAT_BUTTON_CLASS} style={{ color: theme.node.text }} onClick={onGoCanvas}>
                    <Plus className="size-3" />
                    {t("canvas.audioStudio.mediaGoCanvas")}
                </button>
            </div>
        );
    }
    return (
        <div className="thin-scrollbar min-h-0 flex-1 overflow-y-auto p-1.5 glass-card">
            {audioNodes.map((node) => (
                <button
                    key={node.id}
                    type="button"
                    className="flex w-full items-center gap-2 rounded-[2px] px-2 py-1.5 text-left text-sm transition hover:bg-hover disabled:opacity-40 disabled:hover:bg-transparent hover:bg-hover dark:disabled:hover:bg-transparent"
                    style={{ color: theme.node.text }}
                    disabled={!canAdd}
                    title={canAdd ? t("canvas.audioStudio.mediaAdd") : t("canvas.audioStudio.noTracks")}
                    onClick={() => onAdd(node)}
                >
                    <Music2 className="size-3.5 shrink-0" style={{ color: theme.node.muted }} />
                    <span className="min-w-0 flex-1 truncate">{node.title || t("canvas.node.untitled")}</span>
                    <span className="shrink-0 tabular-nums" style={{ color: theme.node.muted }}>
                        {formatAudioTime((node.metadata?.durationMs || 0) / 1000)}
                    </span>
                    <Plus className="size-3 shrink-0" style={{ color: theme.node.muted }} />
                </button>
            ))}
        </div>
    );
}

type AudioProjectSettingsPanelProps = {
    tempo: number;
    meter: { numerator: number; denominator: number };
    grid: { enabled: boolean; snap: CanvasAudioSnap };
    cycle: { enabled: boolean; start: number; end: number };
    punch: { enabled: boolean; in: number; out: number };
    metronome: { enabled: boolean; volumeDb: number };
    capture: CanvasAudioCapture;
    countIn: number;
    masterGain: number;
    onPatch: (patch: Partial<CanvasNodeMetadata>) => void;
};

export function AudioProjectSettingsPanel({ tempo, meter, grid, cycle, punch, metronome, capture, countIn, masterGain, onPatch }: AudioProjectSettingsPanelProps) {
    const { t } = useTranslation();
    const theme = useCanvasTheme();
    return (
        <section className="thin-scrollbar max-h-[46%] shrink-0 overflow-y-auto border-t glass-card" style={{ borderColor: theme.toolbar.border }}>
            <div className="flex items-center gap-1 px-2 py-1.5">
                <SlidersVertical className="size-3.5 shrink-0" style={{ color: theme.node.muted }} />
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{t("canvas.audioStudio.projectSettings")}</span>
            </div>
            <div className="flex flex-col gap-1 px-2 pb-2 text-sm">
                <label className={ROW_CLASS}>
                    <span className={LABEL_CLASS} style={{ color: theme.node.muted }}>
                        {t("canvas.audioStudio.tempo")}
                    </span>
                    <InputNumber size="small" min={20} max={300} step={1} value={tempo} aria-label={t("canvas.audioStudio.tempo")} onChange={(value) => value !== null && onPatch({ audioTempo: Math.min(300, Math.max(20, value)) })} />
                </label>
                <label className={ROW_CLASS}>
                    <span className={LABEL_CLASS} style={{ color: theme.node.muted }}>
                        {t("canvas.audioStudio.meter")}
                    </span>
                    <Select
                        size="small"
                        className="w-[70px]"
                        value={`${meter.numerator}/${meter.denominator}`}
                        options={AUDIO_METER_OPTIONS.map((value) => ({ value, label: value }))}
                        popupMatchSelectWidth={false}
                        styles={{ popup: { root: { zIndex: 1300 } } }}
                        aria-label={t("canvas.audioStudio.meter")}
                        onChange={(value: string) => {
                            const [numerator, denominator] = value.split("/").map(Number);
                            onPatch({ audioTimeSignature: { numerator, denominator } });
                        }}
                    />
                </label>
                <label className={ROW_CLASS}>
                    <span className={LABEL_CLASS} style={{ color: theme.node.muted }}>
                        {t("canvas.audioStudio.grid")}
                    </span>
                    <Switch size="small" checked={grid.enabled} aria-label={t("canvas.audioStudio.grid")} onChange={(checked) => onPatch({ audioGrid: { ...grid, enabled: checked } })} />
                    <Select
                        size="small"
                        className="min-w-0 flex-1"
                        value={grid.snap}
                        options={AUDIO_SNAP_OPTIONS.map((value) => ({ value, label: t(AUDIO_SNAP_LABEL_KEYS[value]) }))}
                        popupMatchSelectWidth={false}
                        styles={{ popup: { root: { zIndex: 1300 } } }}
                        aria-label={t("canvas.audioStudio.snap")}
                        onChange={(value: CanvasAudioSnap) => onPatch({ audioGrid: { ...grid, snap: value } })}
                    />
                </label>
                <label className={ROW_CLASS}>
                    <span className={LABEL_CLASS} style={{ color: theme.node.muted }}>
                        {t("canvas.audioStudio.cycle")}
                    </span>
                    <Switch size="small" checked={cycle.enabled} aria-label={t("canvas.audioStudio.cycle")} onChange={(checked) => onPatch({ audioCycle: { ...cycle, enabled: checked } })} />
                    <InputNumber size="small" className="!w-[74px]" min={0} step={0.1} value={Math.round(cycle.start * 100) / 100} aria-label={t("canvas.audioStudio.cycleStart")} onChange={(value) => value !== null && onPatch({ audioCycle: { ...cycle, start: Math.max(0, value) } })} />
                    <span style={{ color: theme.node.muted }}>-</span>
                    <InputNumber size="small" className="!w-[74px]" min={0} step={0.1} value={Math.round(cycle.end * 100) / 100} aria-label={t("canvas.audioStudio.cycleEnd")} onChange={(value) => value !== null && onPatch({ audioCycle: { ...cycle, end: Math.max(0, value) } })} />
                </label>
                <label className={ROW_CLASS}>
                    <span className={LABEL_CLASS} style={{ color: theme.node.muted }}>
                        {t("canvas.audioStudio.punch")}
                    </span>
                    <Switch size="small" checked={punch.enabled} aria-label={t("canvas.audioStudio.punch")} onChange={(checked) => onPatch({ audioPunch: { ...punch, enabled: checked } })} />
                    <InputNumber size="small" className="!w-[74px]" min={0} step={0.1} value={Math.round(punch.in * 100) / 100} aria-label={t("canvas.audioStudio.punchIn")} onChange={(value) => value !== null && onPatch({ audioPunch: { ...punch, in: Math.max(0, value) } })} />
                    <span style={{ color: theme.node.muted }}>-</span>
                    <InputNumber size="small" className="!w-[74px]" min={0} step={0.1} value={Math.round(punch.out * 100) / 100} aria-label={t("canvas.audioStudio.punchOut")} onChange={(value) => value !== null && onPatch({ audioPunch: { ...punch, out: Math.max(0, value) } })} />
                </label>
                <span className="pt-1" style={{ color: theme.node.muted }}>
                    {t("canvas.audioStudio.captureTitle")}
                </span>
                <label className={ROW_CLASS}>
                    <span className={LABEL_CLASS} style={{ color: theme.node.muted }}>
                        {t("canvas.audioStudio.captureMode")}
                    </span>
                    <Select
                        size="small"
                        className="w-[92px]"
                        value={capture.mode}
                        options={[
                            { value: "normal", label: t("canvas.audioStudio.captureNormal") },
                            { value: "punch", label: t("canvas.audioStudio.capturePunch") },
                        ]}
                        popupMatchSelectWidth={false}
                        styles={{ popup: { root: { zIndex: 1300 } } }}
                        aria-label={t("canvas.audioStudio.captureMode")}
                        onChange={(value: CanvasAudioCapture["mode"]) => onPatch({ audioCapture: { ...capture, mode: value } })}
                    />
                </label>
                <label className={ROW_CLASS}>
                    <span className={LABEL_CLASS} style={{ color: theme.node.muted }}>
                        {t("canvas.audioStudio.countIn")}
                    </span>
                    <Select
                        size="small"
                        className="w-[92px]"
                        value={countIn}
                        options={AUDIO_COUNT_IN_OPTIONS.map((value) => ({ value, label: value ? t("canvas.audioStudio.countInBars", { count: value }) : t("canvas.audioStudio.countInOff") }))}
                        popupMatchSelectWidth={false}
                        styles={{ popup: { root: { zIndex: 1300 } } }}
                        aria-label={t("canvas.audioStudio.countIn")}
                        onChange={(value: number) => onPatch({ audioCountIn: value })}
                    />
                </label>
                <label className={ROW_CLASS}>
                    <span className={LABEL_CLASS} style={{ color: theme.node.muted }}>
                        {t("canvas.audioStudio.captureChannels")}
                    </span>
                    <Select
                        size="small"
                        className="w-[92px]"
                        value={capture.channels}
                        options={AUDIO_CHANNEL_OPTIONS.map((value) => ({ value, label: t(value === 1 ? "canvas.audioStudio.captureMono" : "canvas.audioStudio.captureStereo") }))}
                        popupMatchSelectWidth={false}
                        styles={{ popup: { root: { zIndex: 1300 } } }}
                        aria-label={t("canvas.audioStudio.captureChannels")}
                        onChange={(value: number) => onPatch({ audioCapture: { ...capture, channels: value } })}
                    />
                </label>
                <div className={ROW_CLASS}>
                    <span className={LABEL_CLASS} style={{ color: theme.node.muted }}>
                        {t("canvas.audioStudio.captureGain")}
                    </span>
                    <AudioValueInput
                        label={t("canvas.audioStudio.captureGain")}
                        value={Math.round(capture.gainDb)}
                        format={(value) => String(Math.round(value))}
                        parse={(text) => parseDbValue(text, -24, 24)}
                        onCommit={(value) => onPatch({ audioCapture: { ...capture, gainDb: Math.round(value) } })}
                        onReset={() => onPatch({ audioCapture: { ...capture, gainDb: 0 } })}
                        className="w-12 shrink-0"
                    />
                    <span className="shrink-0 text-sm" style={{ color: theme.node.muted }}>
                        dB
                    </span>
                </div>
                <label className={ROW_CLASS}>
                    <span className={LABEL_CLASS} style={{ color: theme.node.muted }}>
                        {t("canvas.audioStudio.captureLatency")}
                    </span>
                    <InputNumber size="small" className="!w-[74px]" min={0} max={500} step={5} value={capture.inputLatencyMs} aria-label={t("canvas.audioStudio.captureLatency")} onChange={(value) => value !== null && onPatch({ audioCapture: { ...capture, inputLatencyMs: value } })} />
                    <span style={{ color: theme.node.muted }}>ms</span>
                </label>
                <label className={ROW_CLASS}>
                    <span className={LABEL_CLASS} style={{ color: theme.node.muted }}>
                        {t("canvas.audioStudio.metronome")}
                    </span>
                    <Switch size="small" checked={metronome.enabled} aria-label={t("canvas.audioStudio.metronome")} onChange={(checked) => onPatch({ audioMetronome: { ...metronome, enabled: checked } })} />
                </label>
                <div className={ROW_CLASS}>
                    <span className={LABEL_CLASS} style={{ color: theme.node.muted }}>
                        {t("canvas.audioStudio.metronomeVolume")}
                    </span>
                    <AudioValueInput
                        label={t("canvas.audioStudio.metronomeVolume")}
                        value={Math.round(metronome.volumeDb)}
                        format={(value) => String(Math.round(value))}
                        parse={(text) => parseDbValue(text, -40, 0)}
                        onCommit={(value) => onPatch({ audioMetronome: { ...metronome, volumeDb: Math.round(value) } })}
                        onReset={() => onPatch({ audioMetronome: { ...metronome, volumeDb: -6 } })}
                        className="w-12 shrink-0"
                    />
                    <span className="shrink-0 text-sm" style={{ color: theme.node.muted }}>
                        dB
                    </span>
                </div>
                <div className={ROW_CLASS}>
                    <span className={LABEL_CLASS} style={{ color: theme.node.muted }}>
                        {t("canvas.audioStudio.masterGain")}
                    </span>
                    <AudioValueInput
                        label={t("canvas.audioStudio.masterGain")}
                        value={Math.round(masterGain * 100)}
                        format={(value) => String(Math.round(value))}
                        parse={(text) => parseGainPercent(text, Math.round(AUDIO_GAIN_MAX * 100))}
                        onCommit={(value) => onPatch({ audioMasterGain: clampGain(Math.round(value) / 100) })}
                        onReset={() => onPatch({ audioMasterGain: 1 })}
                        className="w-16 shrink-0"
                    />
                    <span className="shrink-0 text-sm" style={{ color: theme.node.muted }}>
                        %
                    </span>
                </div>
            </div>
        </section>
    );
}
