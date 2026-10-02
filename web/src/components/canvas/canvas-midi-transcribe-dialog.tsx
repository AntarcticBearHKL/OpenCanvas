import { Button, Modal, Progress, Radio } from "antd";
import { FileMusic } from "lucide-react";
import { useTranslation } from "react-i18next";

import type { TranscriptionStage } from "@/services/midi-transcription";
import type { CanvasNodeData } from "@/types/canvas";

const STAGE_KEYS: Record<TranscriptionStage, string> = {
    decode: "canvas.midiTranscribe.stageDecode",
    separate: "canvas.midiTranscribe.stageSeparate",
    transcribe: "canvas.midiTranscribe.stageTranscribe",
    build: "canvas.midiTranscribe.stageBuild",
};

type CanvasMidiTranscribeDialogProps = {
    open: boolean;
    node: CanvasNodeData | null;
    highQuality: boolean;
    onHighQualityChange: (value: boolean) => void;
    running: boolean;
    stage: TranscriptionStage | null;
    progress: number;
    failed: boolean;
    onStart: () => void;
    onClose: () => void;
};

/** Audio → MIDI options, progress and cancellation; the transcription itself runs in the canvas page handler. */
export function CanvasMidiTranscribeDialog({ open, node, highQuality, onHighQualityChange, running, stage, progress, failed, onStart, onClose }: CanvasMidiTranscribeDialogProps) {
    const { t } = useTranslation();

    return (
        <Modal
            title={
                <span className="flex items-center gap-2">
                    <FileMusic className="size-4" />
                    {t("canvas.midiTranscribe.title", { defaultValue: "音频转 MIDI" })}
                </span>
            }
            open={open && Boolean(node)}
            centered
            footer={null}
            onCancel={onClose}
            classNames={{ container: "glass-raised" }}
            styles={{ container: { background: "var(--glass-strong)" } }}
        >
            <div className="flex flex-col gap-4">
                <Radio.Group className="flex flex-col gap-2" value={highQuality ? "high" : "standard"} onChange={(event) => onHighQualityChange(event.target.value === "high")} disabled={running}>
                    <Radio value="high">
                        <span className="font-medium">{t("canvas.midiTranscribe.highQuality", { defaultValue: "高精度" })}</span>
                        <span className="ml-2 text-xs opacity-70">{t("canvas.midiTranscribe.highQualityHint", { defaultValue: "分离音轨，首次需下载约 166MB" })}</span>
                    </Radio>
                    <Radio value="standard">
                        <span className="font-medium">{t("canvas.midiTranscribe.standard", { defaultValue: "标准（快）" })}</span>
                        <span className="ml-2 text-xs opacity-70">{t("canvas.midiTranscribe.standardHint", { defaultValue: "直接转录单轨，速度更快" })}</span>
                    </Radio>
                </Radio.Group>

                {running || failed ? (
                    <div className="flex flex-col gap-2">
                        <Progress percent={Math.min(100, Math.max(0, Math.round(progress)))} size="small" status={failed ? "exception" : running ? "active" : "success"} />
                        <span className="text-xs opacity-70">{failed ? t("canvas.midiTranscribe.failed", { defaultValue: "转换失败，请重试" }) : stage ? t(STAGE_KEYS[stage], { defaultValue: "" }) : ""}</span>
                    </div>
                ) : null}

                <div className="flex justify-end gap-2">
                    <Button onClick={onClose}>{t("canvas.midiTranscribe.cancel", { defaultValue: "取消" })}</Button>
                    {running ? null : (
                        <Button type="primary" onClick={onStart}>
                            {t("canvas.midiTranscribe.start", { defaultValue: "开始转换" })}
                        </Button>
                    )}
                </div>
            </div>
        </Modal>
    );
}
