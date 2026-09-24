import { useEffect, useRef, useState } from "react";
import { Select, Slider } from "antd";
import { Circle, AudioLines, Link2 } from "lucide-react";
import { useTranslation } from "react-i18next";

import { AudioMeter, AudioSendList, AudioToggle, AUDIO_TRACK_TYPE_LABEL_KEYS } from "@/components/canvas/workspace/audio-panels";
import { useCanvasTheme } from "@/hooks/use-canvas-theme";
import { AUDIO_AUTOMATION_GAIN, AUDIO_AUTOMATION_PAN, automationOwns } from "@/lib/canvas/audio-automation";
import { AUDIO_FADER_MAX_DB, AUDIO_FADER_MIN_DB, audioMasterTrackId, audioRoutingCycle, audioTrackType, clampGain, faderDbGain, formatFaderDb, gainFaderDb } from "@/lib/canvas/audio-project";
import type { CanvasAudioAutomationLane, CanvasAudioTrack } from "@/types/canvas";

type AudioMixerProps = {
    tracks: CanvasAudioTrack[];
    masterGain: number;
    automation: CanvasAudioAutomationLane[];
    selectedTrackId: string;
    audible: Map<string, boolean> | null;
    registerMeter: (trackId: string, channel: number, element: HTMLElement | null) => void;
    onSelectTrack: (trackId: string) => void;
    onTrackPatch: (trackId: string, patch: Partial<CanvasAudioTrack>) => void;
    onMixPreview: (trackId: string, patch: { gain?: number; pan?: number }) => void;
    onMasterGain: (value: number) => void;
};

const STRIP_WIDTH = 148;
const FADER_HEIGHT = 132;

export default function AudioMixer({ tracks, masterGain, automation, selectedTrackId, audible, registerMeter, onSelectTrack, onTrackPatch, onMixPreview, onMasterGain }: AudioMixerProps) {
    const { t } = useTranslation();
    const theme = useCanvasTheme();
    const masterId = audioMasterTrackId(tracks);
    const strips = tracks.filter((track) => track.id !== masterId);
    const master = tracks.find((track) => track.id === masterId);
    const rootRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!selectedTrackId) return;
        rootRef.current?.querySelector<HTMLElement>(`[data-track-strip="${CSS.escape(selectedTrackId)}"]`)?.scrollIntoView({ block: "nearest", inline: "nearest" });
    }, [selectedTrackId]);
    const renderStrip = (track: CanvasAudioTrack) => (
        <MixerStrip
            key={track.id}
            track={track}
            tracks={tracks}
            masterGain={masterGain}
            automation={automation}
            selected={track.id === selectedTrackId}
            audible={audible?.get(track.id) !== false}
            registerMeter={registerMeter}
            onSelectTrack={onSelectTrack}
            onTrackPatch={onTrackPatch}
            onMixPreview={onMixPreview}
            onMasterGain={onMasterGain}
        />
    );
    return (
        <div ref={rootRef} className="flex min-h-0 min-w-0 flex-1 flex-col md:flex-row">
            <div className="shrink-0 px-2 pb-1.5 md:hidden">
                <Select
                    size="small"
                    className="w-full"
                    value={selectedTrackId || undefined}
                    options={tracks.map((track) => ({ value: track.id, label: track.name || t(AUDIO_TRACK_TYPE_LABEL_KEYS[audioTrackType(track)]) }))}
                    popupMatchSelectWidth={false}
                    styles={{ popup: { root: { zIndex: 1300 } } }}
                    aria-label={t("canvas.audioStudio.inspectorTrack")}
                    onChange={onSelectTrack}
                />
            </div>
            <div className="thin-scrollbar flex min-h-0 min-w-0 flex-1 overflow-x-auto">
                {strips.length ? (
                    strips.map(renderStrip)
                ) : (
                    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 px-4 text-center">
                        <AudioLines className="size-6" style={{ color: theme.node.muted }} />
                        <span className="text-sm" style={{ color: theme.node.placeholder }}>
                            {t("canvas.audioStudio.noTracks")}
                        </span>
                    </div>
                )}
            </div>
            {master ? renderStrip(master) : null}
        </div>
    );
}

type MixerStripProps = {
    track: CanvasAudioTrack;
    tracks: CanvasAudioTrack[];
    masterGain: number;
    automation: CanvasAudioAutomationLane[];
    selected: boolean;
    audible: boolean;
    registerMeter: (trackId: string, channel: number, element: HTMLElement | null) => void;
    onSelectTrack: (trackId: string) => void;
    onTrackPatch: (trackId: string, patch: Partial<CanvasAudioTrack>) => void;
    onMixPreview: (trackId: string, patch: { gain?: number; pan?: number }) => void;
    onMasterGain: (value: number) => void;
};

function MixerStrip({ track, tracks, masterGain, automation, selected, audible, registerMeter, onSelectTrack, onTrackPatch, onMixPreview, onMasterGain }: MixerStripProps) {
    const { t } = useTranslation();
    const theme = useCanvasTheme();
    const [renaming, setRenaming] = useState(false);
    const [nameDraft, setNameDraft] = useState(track.name);
    const type = audioTrackType(track);
    const master = type === "master";
    const gain = master ? masterGain : clampGain(track.gain);
    const gainAutomated = automationOwns(automation, track.id, AUDIO_AUTOMATION_GAIN);
    const panAutomated = automationOwns(automation, track.id, AUDIO_AUTOMATION_PAN);
    const outputs = tracks.filter((item) => item.id !== track.id && !audioRoutingCycle(tracks, track.id, item.id));
    const trackLabel = (item: CanvasAudioTrack) => item.name || t(AUDIO_TRACK_TYPE_LABEL_KEYS[audioTrackType(item)]);
    const commitName = () => {
        setRenaming(false);
        if (nameDraft !== track.name) onTrackPatch(track.id, { name: nameDraft });
    };
    return (
        <div
            data-track-strip={track.id}
            className={`flex shrink-0 flex-col gap-1 border-r px-1.5 py-1.5 glass-card ${selected ? "" : "max-md:hidden"}`}
            style={{ width: STRIP_WIDTH, borderColor: theme.toolbar.border, background: selected ? theme.toolbar.activeBg : undefined, opacity: audible ? 1 : 0.45 }}
            onPointerDown={() => onSelectTrack(track.id)}
        >
            <span className="h-1 w-full shrink-0 rounded-md" style={{ background: track.color || theme.node.faint }} />
            {renaming ? (
                <input
                    autoFocus
                    className="w-full shrink-0 rounded-md border bg-transparent px-1 py-0.5 text-sm outline-none"
                    style={{ borderColor: theme.toolbar.border, color: theme.node.text }}
                    value={nameDraft}
                    aria-label={t("canvas.audioStudio.name")}
                    onChange={(event) => setNameDraft(event.target.value)}
                    onBlur={commitName}
                    onKeyDown={(event) => {
                        if (event.key === "Enter") commitName();
                        if (event.key === "Escape") {
                            setNameDraft(track.name);
                            setRenaming(false);
                        }
                    }}
                />
            ) : (
                <button
                    type="button"
                    className="w-full shrink-0 truncate rounded-md px-1 py-0.5 text-left text-sm transition hover:bg-hover"
                    style={{ color: theme.node.text }}
                    title={t("canvas.audioStudio.trackRename")}
                    onDoubleClick={() => {
                        setNameDraft(track.name);
                        setRenaming(true);
                    }}
                    onClick={() => onSelectTrack(track.id)}
                >
                    {track.name || trackLabel(track)}
                </button>
            )}
            {master || type === "audio" ? null : (
                <span className="shrink-0 text-center text-sm" style={{ color: theme.node.muted }}>
                    {t(AUDIO_TRACK_TYPE_LABEL_KEYS[type])}
                </span>
            )}
            {master ? null : <AudioSendList track={track} tracks={tracks} automation={automation} onChange={(sends) => onTrackPatch(track.id, { sends })} />}
            <MixerSlider
                label={t("canvas.audioStudio.pan")}
                value={Math.round((track.pan ?? 0) * 100) / 100}
                min={-1}
                max={1}
                step={0.05}
                linked={panAutomated}
                format={(value) => (Math.abs(value) < 0.02 ? "C" : `${value < 0 ? "L" : "R"}${Math.round(Math.abs(value) * 100)}`)}
                onPreview={(value) => onMixPreview(track.id, { pan: value })}
                onCommit={(value) => onTrackPatch(track.id, { pan: value })}
                onReset={() => onTrackPatch(track.id, { pan: 0 })}
            />
            <div className="flex min-h-0 flex-1 items-stretch justify-center gap-2 pt-1">
                <MixerSlider
                    label={t("canvas.audioStudio.gain")}
                    value={Math.round(gainFaderDb(gain) * 10) / 10}
                    min={AUDIO_FADER_MIN_DB}
                    max={AUDIO_FADER_MAX_DB}
                    step={0.5}
                    vertical
                    linked={gainAutomated}
                    format={formatFaderDb}
                    onPreview={(value) => onMixPreview(track.id, { gain: faderDbGain(value) })}
                    onCommit={(value) => (master ? onMasterGain(faderDbGain(value)) : onTrackPatch(track.id, { gain: faderDbGain(value) }))}
                    onReset={() => (master ? onMasterGain(1) : onTrackPatch(track.id, { gain: 1 }))}
                />
                <AudioMeter trackId={track.id} register={registerMeter} className="h-[132px] self-center" />
            </div>
            <div className="flex shrink-0 items-center justify-center gap-1">
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
            {master ? (
                <span className="shrink-0 truncate text-center text-sm" style={{ color: theme.node.muted }}>
                    {t("canvas.audioStudio.trackTypeMaster")}
                </span>
            ) : (
                <Select
                    size="small"
                    variant="borderless"
                    className="w-full"
                    value={track.output && !audioRoutingCycle(tracks, track.id, track.output) ? track.output : undefined}
                    placeholder={t("canvas.audioStudio.trackTypeMaster")}
                    options={outputs.map((item) => ({ value: item.id, label: trackLabel(item) }))}
                    popupMatchSelectWidth={false}
                    styles={{ popup: { root: { zIndex: 1300 } } }}
                    aria-label={t("canvas.audioStudio.trackOutput")}
                    onChange={(value: string) => onTrackPatch(track.id, { output: value })}
                />
            )}
        </div>
    );
}

function MixerSlider({ label, value, min, max, step, vertical = false, linked = false, format, onPreview, onCommit, onReset }: { label: string; value: number; min: number; max: number; step: number; vertical?: boolean; linked?: boolean; format: (value: number) => string; onPreview: (value: number) => void; onCommit: (value: number) => void; onReset: () => void }) {
    const theme = useCanvasTheme();
    const { t } = useTranslation();
    const [draft, setDraft] = useState<number | null>(null);
    const current = draft ?? value;
    return (
        <div className={vertical ? "flex min-w-0 flex-1 flex-col items-center" : "flex w-full shrink-0 flex-col items-center"} onDoubleClick={linked ? undefined : onReset}>
            <div className="flex w-full shrink-0 items-center justify-between gap-1 text-sm" style={{ color: theme.node.muted }}>
                <span className="flex min-w-0 items-center gap-0.5">
                    {linked ? (
                        <span className="flex shrink-0" title={t("canvas.audioStudio.automationLink")} aria-hidden>
                            <Link2 className="size-2.5" />
                        </span>
                    ) : null}
                    <span className="truncate">{label}</span>
                </span>
                <span className="shrink-0 tabular-nums">{format(current)}</span>
            </div>
            <Slider
                vertical={vertical}
                className="!mx-0"
                style={vertical ? { height: FADER_HEIGHT } : undefined}
                min={min}
                max={max}
                step={step}
                value={current}
                disabled={linked}
                tooltip={{ formatter: (input) => format(input ?? 0) }}
                ariaLabelForHandle={label}
                onChange={(next) => {
                    setDraft(next);
                    onPreview(next);
                }}
                onChangeComplete={(next) => {
                    setDraft(null);
                    onCommit(next);
                }}
            />
        </div>
    );
}
