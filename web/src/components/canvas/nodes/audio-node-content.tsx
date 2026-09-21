import { useEffect, useRef, useState } from "react";
import { GripHorizontal, Music2, Pause, Play } from "lucide-react";
import { useTranslation } from "react-i18next";

import { AUDIO_WAVEFORM_BARS, formatAudioTime, getCachedAudioPeaks, loadAudioPeaks, peakBars, type AudioPeaks } from "@/lib/canvas/audio-waveform";
import type { CanvasTheme } from "@/lib/canvas-theme";
import type { CanvasNodeData } from "@/types/canvas";

type AudioNodeContentProps = { node: CanvasNodeData; theme: CanvasTheme };

const PLACEHOLDER_PEAKS = Array.from({ length: AUDIO_WAVEFORM_BARS }, () => 0.08);

export function AudioNodeContent({ node, theme }: AudioNodeContentProps) {
    const { t } = useTranslation();
    const content = node.metadata?.content;

    if (!content)
        return (
            <div className="flex h-full w-full flex-col items-center justify-center gap-2" style={{ color: theme.node.placeholder }}>
                <Music2 className="size-7 opacity-35" />
                <span className="text-sm">{t("canvas.node.emptyAudio")}</span>
            </div>
        );

    const key = node.metadata?.storageKey || content;
    return <AudioTrack key={key} content={content} cacheKey={key} durationMs={node.metadata?.durationMs} title={node.title} theme={theme} />;
}

function AudioTrack({ content, cacheKey, durationMs, title, theme }: { content: string; cacheKey: string; durationMs?: number; title?: string; theme: CanvasTheme }) {
    const { t } = useTranslation();
    const audioRef = useRef<HTMLAudioElement>(null);
    const trackRef = useRef<HTMLDivElement>(null);
    const [peaks, setPeaks] = useState<AudioPeaks | null>(() => getCachedAudioPeaks(cacheKey));
    const [playing, setPlaying] = useState(false);
    const [current, setCurrent] = useState(0);
    const [duration, setDuration] = useState((durationMs || 0) / 1000);
    const [dragging, setDragging] = useState(false);

    useEffect(() => {
        let active = true;
        void loadAudioPeaks(cacheKey, content).then((value) => {
            if (active && value) setPeaks(value);
        });
        return () => {
            active = false;
        };
    }, [cacheKey, content]);

    useEffect(() => {
        const audio = audioRef.current;
        if (!audio) return;
        const sync = () => {
            setCurrent(audio.currentTime || 0);
            if (Number.isFinite(audio.duration)) setDuration(audio.duration);
        };
        const handlePlay = () => setPlaying(true);
        const handlePause = () => setPlaying(false);
        const handleEnded = () => {
            audio.currentTime = 0;
            setCurrent(0);
            setPlaying(false);
        };
        audio.addEventListener("timeupdate", sync);
        audio.addEventListener("loadedmetadata", sync);
        audio.addEventListener("durationchange", sync);
        audio.addEventListener("play", handlePlay);
        audio.addEventListener("pause", handlePause);
        audio.addEventListener("ended", handleEnded);
        sync();
        return () => {
            audio.removeEventListener("timeupdate", sync);
            audio.removeEventListener("loadedmetadata", sync);
            audio.removeEventListener("durationchange", sync);
            audio.removeEventListener("play", handlePlay);
            audio.removeEventListener("pause", handlePause);
            audio.removeEventListener("ended", handleEnded);
        };
    }, []);

    const ratio = duration > 0 ? Math.min(1, current / duration) : 0;
    const bars = peaks ? peakBars(peaks, AUDIO_WAVEFORM_BARS) : PLACEHOLDER_PEAKS;

    const togglePlay = () => {
        const audio = audioRef.current;
        if (!audio) return;
        if (audio.paused) void audio.play().catch(() => setPlaying(false));
        else audio.pause();
    };

    const seek = (clientX: number) => {
        const track = trackRef.current;
        const audio = audioRef.current;
        if (!track || !audio || !Number.isFinite(audio.duration) || audio.duration <= 0) return;
        const rect = track.getBoundingClientRect();
        const next = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
        audio.currentTime = next * audio.duration;
        setCurrent(audio.currentTime);
    };

    const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
        event.stopPropagation();
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        setDragging(true);
        seek(event.clientX);
    };

    const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
        if (dragging) seek(event.clientX);
    };

    const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
        if (!dragging) return;
        seek(event.clientX);
        setDragging(false);
        if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    };

    return (
        <div className="flex h-full w-full flex-col justify-center gap-2.5 px-4 py-3" style={{ color: theme.node.text }}>
            <div className="flex h-6 w-full shrink-0 items-center gap-1.5" style={{ color: theme.node.muted }}>
                <GripHorizontal className="size-3.5 shrink-0" />
                {title ? <span className="truncate text-[11px]">{title}</span> : null}
            </div>
            <div className="flex items-center gap-2">
                <button
                    type="button"
                    className="grid size-7 shrink-0 place-items-center rounded-full transition-colors hover:bg-black/5 dark:hover:bg-white/10"
                    style={{ color: theme.node.text }}
                    aria-label={t(playing ? "canvas.node.pauseAudio" : "canvas.node.playAudio")}
                    onClick={(event) => {
                        event.stopPropagation();
                        togglePlay();
                    }}
                    onMouseDown={(event) => event.stopPropagation()}
                    onPointerDown={(event) => event.stopPropagation()}
                >
                    {playing ? <Pause className="size-4 fill-current" /> : <Play className="size-4 fill-current" />}
                </button>
                <span className="text-[11px] tabular-nums" style={{ color: theme.node.muted }}>
                    {formatAudioTime(current)} / {formatAudioTime(duration)}
                </span>
            </div>
            <div
                ref={trackRef}
                data-canvas-no-zoom
                className={`relative flex min-h-8 w-full flex-1 touch-none select-none items-center ${dragging ? "cursor-grabbing" : "cursor-ew-resize"}`}
                title={t("canvas.node.seekAudio")}
                aria-label={t("canvas.node.seekAudio")}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={() => setDragging(false)}
            >
                <div className="flex h-full w-full items-center gap-px">
                    {bars.map((peak, index) => (
                        <span key={index} className="min-h-[2px] flex-1 rounded-full" style={{ height: `${Math.max(peak, 0.08) * 100}%`, background: (index + 1) / AUDIO_WAVEFORM_BARS <= ratio ? theme.node.text : theme.node.faint }} />
                    ))}
                </div>
                <div className="pointer-events-none absolute inset-y-0 w-0.5 -translate-x-1/2 rounded-full transition-[left] duration-75 motion-reduce:transition-none" style={{ left: `${ratio * 100}%`, background: theme.node.text }} />
                {dragging ? <div className="pointer-events-none absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full" style={{ left: `${ratio * 100}%`, background: theme.node.text }} /> : null}
            </div>
            <audio ref={audioRef} src={content} preload="metadata" className="hidden" />
        </div>
    );
}
