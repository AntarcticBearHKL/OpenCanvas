import { useEffect, useMemo, useState } from "react";
import { Button, Input, InputNumber, Modal, Segmented, Tabs } from "antd";
import { ImagePlus, Sparkles } from "lucide-react";
import { useTranslation } from "react-i18next";

import { readImageMeta } from "@/lib/image-utils";
import { MAX_UPSCALE_LONG_EDGE, MIN_UPSCALE_LONG_EDGE, resolveUpscaleSize, type ImageUpscaleAlgorithm, type ImageUpscaleParams } from "@/lib/canvas/canvas-image-data";
import { useCanvasTheme } from "@/hooks/use-canvas-theme";
import { modelOptionLabel, useEffectiveConfig } from "@/stores/use-config-store";

export type CanvasImageResolutionPayload = ({ kind: "algorithm" } & ImageUpscaleParams) | { kind: "ai"; prompt: string };

type ResolutionTab = "upscale" | "downscale" | "ai";

const algorithms: ImageUpscaleAlgorithm[] = ["high", "bilinear", "nearest"];

const upscaleTargets = [
    { label: "1K", value: 1024 },
    { label: "2K", value: 2048 },
    { label: "4K", value: MAX_UPSCALE_LONG_EDGE },
];

const downscaleTargets = [1024, 768, 512];

const defaultParams: ImageUpscaleParams = {
    targetLongEdge: 2048,
    algorithm: "high",
};

export function CanvasNodeResolutionDialog({ dataUrl, open, onClose, onConfirm }: { dataUrl: string; open: boolean; onClose: () => void; onConfirm: (payload: CanvasImageResolutionPayload) => void }) {
    const { t } = useTranslation();
    const theme = useCanvasTheme();
    const config = useEffectiveConfig();
    const [tab, setTab] = useState<ResolutionTab>("upscale");
    const [params, setParams] = useState<ImageUpscaleParams>(defaultParams);
    const [downscaleTarget, setDownscaleTarget] = useState(downscaleTargets[0]);
    const [aiFactor, setAiFactor] = useState("2x");
    const [aiPrompt, setAiPrompt] = useState("");
    const [image, setImage] = useState<{ width: number; height: number } | null>(null);
    const sourceLongEdge = image ? Math.max(image.width, image.height) : 0;
    const targetLongEdge = tab === "upscale" ? params.targetLongEdge : downscaleTarget;
    const outputSize = useMemo(() => (image ? resolveUpscaleSize(image.width, image.height, targetLongEdge) : null), [image, targetLongEdge]);
    const canUpscale = Boolean(image && sourceLongEdge < params.targetLongEdge && params.targetLongEdge <= MAX_UPSCALE_LONG_EDGE);
    const canDownscale = Boolean(image && downscaleTarget >= MIN_UPSCALE_LONG_EDGE && downscaleTarget < sourceLongEdge);
    const reachedMax = Boolean(image && sourceLongEdge >= MAX_UPSCALE_LONG_EDGE);
    const aiModel = config.imageModel ? modelOptionLabel(config, config.imageModel) : "";

    useEffect(() => {
        if (!open) return;
        setTab("upscale");
        setParams(defaultParams);
        setDownscaleTarget(downscaleTargets[0]);
        setAiFactor("2x");
        setAiPrompt(t("canvas.editors.resolutionAiDefaultPrompt"));
        setImage(null);
    }, [dataUrl, open, t]);

    useEffect(() => {
        if (!open) return;
        void readImageMeta(dataUrl).then(setImage);
    }, [dataUrl, open]);

    useEffect(() => {
        if (!image) return;
        const nextUpscale = upscaleTargets.find((option) => sourceLongEdge < option.value)?.value || MAX_UPSCALE_LONG_EDGE;
        const nextDownscale = downscaleTargets.find((value) => value < sourceLongEdge) || Math.max(MIN_UPSCALE_LONG_EDGE, Math.floor(sourceLongEdge / 2));
        setParams((current) => ({ ...current, targetLongEdge: nextUpscale }));
        setDownscaleTarget(nextDownscale);
    }, [image, sourceLongEdge]);

    const renderAlgorithm = () => (
        <div className="space-y-2">
            <div className="font-medium" style={{ color: theme.node.label }}>{t("canvas.editors.algorithm")}</div>
            <div className="grid gap-1.5">
                {algorithms.map((algorithm) => {
                    const active = params.algorithm === algorithm;
                    return (
                        <button
                            key={algorithm}
                            type="button"
                            aria-pressed={active}
                            className="rounded-none border px-3 py-2 text-left transition hover:bg-hover"
                            style={{ borderColor: active ? theme.node.activeStroke : theme.node.stroke }}
                            onClick={() => setParams((current) => ({ ...current, algorithm }))}
                        >
                            <div className="text-sm font-medium">{t(`canvas.editors.${algorithm}`)}</div>
                            <div className="mt-0.5 text-sm" style={{ color: theme.node.muted }}>{t(`canvas.editors.${algorithm}Description`)}</div>
                        </button>
                    );
                })}
            </div>
        </div>
    );

    const renderOutputSize = () => (
        <div className="rounded-none border px-4 py-3 text-sm">
            <div className="flex items-center justify-between">
                <span className="font-medium" style={{ color: theme.node.label }}>{t("canvas.editors.outputSize")}</span>
                <span className="font-semibold">{outputSize ? `${outputSize.width} x ${outputSize.height} px` : t("canvas.editors.unknown")}</span>
            </div>
        </div>
    );

    const upscaleTab = (
        <div className="space-y-6 py-2">
            <div className="space-y-2">
                <div className="font-medium" style={{ color: theme.node.label }}>{t("canvas.editors.targetPixels")}</div>
                <Segmented
                    block
                    value={params.targetLongEdge}
                    options={upscaleTargets.map((option) => ({ label: `${option.label} · ${option.value}px`, value: option.value, disabled: Boolean(image && sourceLongEdge >= option.value) }))}
                    onChange={(value) => setParams((current) => ({ ...current, targetLongEdge: Number(value) }))}
                />
                {image && !canUpscale ? <div className="text-sm font-medium" style={{ color: theme.node.danger }}>{reachedMax ? t("canvas.editors.maxReached") : t("canvas.editors.targetReached")}</div> : null}
            </div>
            {renderAlgorithm()}
            {renderOutputSize()}
            <div className="flex justify-end">
                <Button type="primary" size="large" icon={<ImagePlus className="size-4" />} disabled={!canUpscale} onClick={() => onConfirm({ kind: "algorithm", ...params })}>
                    {t("canvas.editors.upscale")}
                </Button>
            </div>
        </div>
    );

    const downscaleTab = (
        <div className="space-y-6 py-2">
            <div className="space-y-2">
                <div className="font-medium" style={{ color: theme.node.label }}>{t("canvas.editors.targetPixels")}</div>
                <Segmented block value={downscaleTarget} options={downscaleTargets.map((value) => ({ label: `${value}px`, value }))} onChange={(value) => setDownscaleTarget(Number(value))} />
                <div className="flex items-center gap-3">
                    <span className="shrink-0 text-sm font-medium" style={{ color: theme.node.label }}>{t("canvas.editors.resolutionCustom")}</span>
                    <InputNumber className="w-full" min={MIN_UPSCALE_LONG_EDGE} max={MAX_UPSCALE_LONG_EDGE} precision={0} value={downscaleTarget} onChange={(value) => setDownscaleTarget(Number(value) || MIN_UPSCALE_LONG_EDGE)} />
                </div>
                {image && !canDownscale ? <div className="text-sm font-medium" style={{ color: theme.node.danger }}>{t("canvas.editors.resolutionDownscaleRequired")}</div> : null}
            </div>
            {renderAlgorithm()}
            {renderOutputSize()}
            <div className="flex justify-end">
                <Button type="primary" size="large" icon={<ImagePlus className="size-4" />} disabled={!canDownscale} onClick={() => onConfirm({ kind: "algorithm", targetLongEdge: downscaleTarget, algorithm: params.algorithm })}>
                    {t("canvas.editors.resolutionDownscale")}
                </Button>
            </div>
        </div>
    );

    const aiTab = (
        <div className="space-y-6 py-2">
            <div className="text-sm leading-6" style={{ color: theme.node.muted }}>{t("canvas.editors.resolutionAiHint")}</div>
            <div className="space-y-2">
                <div className="font-medium" style={{ color: theme.node.label }}>{t("canvas.editors.resolutionAiFactor")}</div>
                <Segmented block value={aiFactor} options={["2x", "4x"].map((value) => ({ label: value, value }))} onChange={(value) => setAiFactor(String(value))} />
            </div>
            <div className="space-y-2">
                <div className="font-medium" style={{ color: theme.node.label }}>{t("canvas.editors.resolutionAiPrompt")}</div>
                <Input.TextArea rows={5} value={aiPrompt} onChange={(event) => setAiPrompt(event.target.value)} />
            </div>
            <div className="rounded-none border px-4 py-3 text-sm">
                <div className="flex items-center justify-between gap-3">
                    <span className="shrink-0 font-medium" style={{ color: theme.node.label }}>{t("canvas.editors.resolutionAiModel")}</span>
                    <span className="min-w-0 truncate font-semibold">{aiModel || t("canvas.editors.resolutionAiModelEmpty")}</span>
                </div>
            </div>
            <div className="flex justify-end">
                <Button type="primary" size="large" icon={<Sparkles className="size-4" />} onClick={() => onConfirm({ kind: "ai", prompt: `${t("canvas.editors.resolutionAiFactorPrompt", { factor: aiFactor })}\n${aiPrompt.trim()}`.trim() })}>
                    {t("canvas.editors.resolutionAiConfirm")}
                </Button>
            </div>
        </div>
    );

    return (
        <Modal title={null} open={open && Boolean(dataUrl)} onCancel={onClose} footer={null} width={820} centered destroyOnHidden classNames={{ container: "glass-raised" }} styles={{ container: { background: "var(--glass-strong)" } }}>
            <div className="space-y-5">
                <div>
                    <h2 className="text-xl font-semibold">{t("canvas.imageTools.resolutionTitle")}</h2>
                </div>
                <div className="grid gap-6 md:grid-cols-[minmax(260px,1fr)_360px]">
                    <div className="min-w-0 rounded-none border p-4">
                        <div className="grid min-h-[280px] place-items-center rounded-[2px] bg-black/5">
                            <img src={dataUrl} alt="" className="max-h-[320px] max-w-full rounded-[2px] object-contain" draggable={false} />
                        </div>
                        <div className="mt-3 flex items-center justify-between text-sm">
                            <span className="font-medium" style={{ color: theme.node.label }}>{t("canvas.editors.source")}</span>
                            <span className="font-semibold">{image ? `${image.width} x ${image.height} px` : t("canvas.editors.loading")}</span>
                        </div>
                    </div>
                    <Tabs
                        className="min-w-0"
                        activeKey={tab}
                        onChange={(key) => setTab(key as ResolutionTab)}
                        items={[
                            { key: "upscale", label: t("canvas.editors.resolutionUpscaleTab"), children: upscaleTab },
                            { key: "downscale", label: t("canvas.editors.resolutionDownscaleTab"), children: downscaleTab },
                            { key: "ai", label: t("canvas.editors.resolutionAiTab"), children: aiTab },
                        ]}
                    />
                </div>
            </div>
        </Modal>
    );
}
