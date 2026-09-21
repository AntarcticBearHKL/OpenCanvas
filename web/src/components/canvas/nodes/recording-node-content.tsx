import { useCallback, useEffect, useRef, useState } from "react";
import { Mic, Square } from "lucide-react";
import { useTranslation } from "react-i18next";

import { formatAudioTime } from "@/lib/canvas/audio-waveform";
import { useCanvasTheme } from "@/hooks/use-canvas-theme";

type RecordingState = "idle" | "requesting" | "recording" | "saving" | "saved" | "denied" | "noMic" | "unsupported" | "noData" | "failed";

export function RecordingNodeContent({ onRecorded }: { onRecorded: (blob: Blob) => Promise<void> }) {
    const { t } = useTranslation();
    const theme = useCanvasTheme();
    const [state, setState] = useState<RecordingState>("idle");
    const [elapsedMs, setElapsedMs] = useState(0);
    const recorderRef = useRef<MediaRecorder | null>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const chunksRef = useRef<Blob[]>([]);
    const timerRef = useRef<number | null>(null);
    const mountedRef = useRef(true);

    const releaseStream = useCallback(() => {
        streamRef.current?.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        recorderRef.current = null;
        if (timerRef.current !== null) window.clearInterval(timerRef.current);
        timerRef.current = null;
    }, []);

    useEffect(() => {
        mountedRef.current = true;
        return () => {
            mountedRef.current = false;
            releaseStream();
        };
    }, [releaseStream]);

    const start = useCallback(async () => {
        if (typeof MediaRecorder === "undefined" || !navigator.mediaDevices?.getUserMedia) {
            setState("unsupported");
            return;
        }
        setState("requesting");
        let stream: MediaStream;
        try {
            stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        } catch (error) {
            const name = error instanceof DOMException ? error.name : "";
            setState(name === "NotAllowedError" || name === "SecurityError" ? "denied" : name === "NotFoundError" || name === "OverconstrainedError" ? "noMic" : "failed");
            return;
        }
        if (!mountedRef.current) {
            stream.getTracks().forEach((track) => track.stop());
            return;
        }

        const recorder = new MediaRecorder(stream);
        streamRef.current = stream;
        recorderRef.current = recorder;
        chunksRef.current = [];
        recorder.ondataavailable = (event) => {
            if (event.data.size) chunksRef.current.push(event.data);
        };
        recorder.onerror = () => {
            releaseStream();
            setState("failed");
        };
        recorder.onstop = () => {
            const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
            releaseStream();
            setElapsedMs(0);
            if (!blob.size) {
                setState("noData");
                return;
            }
            setState("saving");
            void onRecorded(blob).then(
                () => setState("saved"),
                () => setState("failed"),
            );
        };
        recorder.start();
        setElapsedMs(0);
        const startedAt = Date.now();
        timerRef.current = window.setInterval(() => setElapsedMs(Date.now() - startedAt), 250);
        setState("recording");
    }, [onRecorded, releaseStream]);

    const stop = useCallback(() => {
        if (recorderRef.current?.state === "recording") recorderRef.current.stop();
    }, []);

    const recording = state === "recording";
    const busy = state === "requesting" || state === "saving";

    return (
        <div className="flex h-full w-full flex-col items-center justify-center gap-3 px-5 text-center" style={{ color: theme.node.text }}>
            <button
                type="button"
                disabled={busy}
                className="grid size-14 place-items-center rounded-full transition hover:bg-black/5 disabled:opacity-50 dark:hover:bg-white/10"
                style={{ color: recording ? "#f87171" : theme.node.text }}
                aria-label={t(recording ? "canvas.recording.stop" : "canvas.recording.start")}
                title={t(recording ? "canvas.recording.stop" : "canvas.recording.start")}
                onClick={(event) => {
                    event.stopPropagation();
                    if (recording) stop();
                    else void start();
                }}
                onMouseDown={(event) => event.stopPropagation()}
                onPointerDown={(event) => event.stopPropagation()}
            >
                {recording ? <Square className="size-5 fill-current" /> : <Mic className="size-6" />}
            </button>
            <span className="text-xl tabular-nums" style={{ color: theme.node.text }}>
                {formatAudioTime(elapsedMs / 1000)}
            </span>
            <span className="text-[11px] leading-4" style={{ color: state === "idle" || state === "recording" ? theme.node.muted : theme.node.text }}>
                {t(`canvas.recording.status.${state}`)}
            </span>
            {state === "idle" ? (
                <span className="text-[10px] leading-4" style={{ color: theme.node.placeholder }}>
                    {t("canvas.recording.hint")}
                </span>
            ) : null}
        </div>
    );
}
