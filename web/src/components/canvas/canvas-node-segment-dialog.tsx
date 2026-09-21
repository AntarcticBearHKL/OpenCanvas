import { useEffect, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import { App, Button, Modal, Segmented } from "antd";
import { Download, MousePointer2, RotateCcw, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";

import { readImageMeta } from "@/lib/image-utils";
import { isMobileSamLoaded, segmentImageWithPoints, type SamPoint } from "@/lib/image/mobile-sam";
import { useCanvasTheme } from "@/hooks/use-canvas-theme";
import { useLocalModelStore } from "@/stores/use-local-model-store";

export type CanvasImageSegmentResult = { maskDataUrl: string; score: number };

export function CanvasNodeSegmentDialog({ dataUrl, open, onClose, onConfirm }: { dataUrl: string; open: boolean; onClose: () => void; onConfirm: (result: CanvasImageSegmentResult) => void }) {
    const { message } = App.useApp();
    const { t } = useTranslation();
    const theme = useCanvasTheme();
    const model = useLocalModelStore((state) => state.models["mobile-sam"]);
    const prepareModel = useLocalModelStore((state) => state.prepareModel);
    const [points, setPoints] = useState<SamPoint[]>([]);
    const [meta, setMeta] = useState<{ width: number; height: number } | null>(null);
    const [result, setResult] = useState<CanvasImageSegmentResult | null>(null);
    const [running, setRunning] = useState(false);
    const [ready, setReady] = useState(false);
    const [backgroundMode, setBackgroundMode] = useState(false);

    useEffect(() => {
        if (!open) return;
        setPoints([]);
        setResult(null);
        setRunning(false);
        setBackgroundMode(false);
        setReady(isMobileSamLoaded());
        setMeta(null);
        void readImageMeta(dataUrl).then(setMeta);
    }, [dataUrl, open]);

    const ensureModel = async () => {
        if (isMobileSamLoaded()) return true;
        const prepared = await prepareModel("mobile-sam", true);
        if (prepared) setReady(true);
        return prepared;
    };

    const addPoint = (event: ReactPointerEvent<HTMLImageElement>) => {
        if (!meta) return;
        event.preventDefault();
        const rect = event.currentTarget.getBoundingClientRect();
        const x = Math.min(meta.width - 1, Math.max(0, Math.round(((event.clientX - rect.left) / rect.width) * meta.width)));
        const y = Math.min(meta.height - 1, Math.max(0, Math.round(((event.clientY - rect.top) / rect.height) * meta.height)));
        const positive = event.button === 0 && !backgroundMode && !event.altKey;
        setPoints((current) => [...current, { x, y, positive }]);
        setResult(null);
    };

    const prepare = async () => {
        if (!(await ensureModel())) message.error(t("canvas.segment.prepareFailed"));
    };

    const run = async () => {
        setRunning(true);
        try {
            if (!(await ensureModel())) throw new Error(t("canvas.segment.prepareFailed"));
            const output = await segmentImageWithPoints(dataUrl, points);
            setResult({ maskDataUrl: output.maskDataUrl, score: output.score });
        } catch (error) {
            message.error(error instanceof Error ? error.message : t("canvas.segment.prepareFailed"));
        } finally {
            setRunning(false);
        }
    };

    const markerStyle = (point: SamPoint): CSSProperties => ({
        left: `${(point.x / (meta?.width || 1)) * 100}%`,
        top: `${(point.y / (meta?.height || 1)) * 100}%`,
        backgroundColor: point.positive === false ? "transparent" : theme.canvas.selectionStroke,
        borderColor: theme.canvas.selectionStroke,
    });

    return (
        <Modal title={null} open={open && Boolean(dataUrl)} onCancel={onClose} footer={null} width={860} centered destroyOnHidden>
            <div className="space-y-5">
                <h2 className="text-xl font-semibold">{t("canvas.segment.title")}</h2>
                <div className="grid gap-6 md:grid-cols-[minmax(260px,1fr)_320px]">
                    <div className="min-w-0 rounded-xl border p-4" style={{ borderColor: theme.node.stroke }}>
                        <div className="relative inline-block">
                            <img src={dataUrl} alt="" className="block max-h-[340px] w-auto max-w-full cursor-crosshair rounded-lg" draggable={false} onPointerDown={addPoint} onContextMenu={(event) => event.preventDefault()} />
                            {meta
                                ? points.map((point, index) => <span key={`${point.x}-${point.y}-${index}`} className="pointer-events-none absolute z-10 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2" style={markerStyle(point)} />)
                                : null}
                            {result ? (
                                <div
                                    className="pointer-events-none absolute inset-0 rounded-lg"
                                    style={{
                                        backgroundColor: theme.canvas.selectionStroke,
                                        maskImage: `url(${result.maskDataUrl})`,
                                        maskSize: "100% 100%",
                                        WebkitMaskImage: `url(${result.maskDataUrl})`,
                                        WebkitMaskSize: "100% 100%",
                                    }}
                                />
                            ) : null}
                        </div>
                        <div className="mt-3 text-xs opacity-60">{t("canvas.segment.hint")}</div>
                    </div>
                    <div className="min-w-0 space-y-4">
                        <Segmented
                            block
                            size="small"
                            value={backgroundMode ? "background" : "foreground"}
                            options={[
                                { label: t("canvas.segment.foreground"), value: "foreground" },
                                { label: t("canvas.segment.background"), value: "background" },
                            ]}
                            onChange={(value) => setBackgroundMode(value === "background")}
                        />
                        <div className="flex flex-wrap gap-2">
                            <Button icon={<RotateCcw className="size-4" />} disabled={!points.length} onClick={() => setPoints((current) => current.slice(0, -1))}>
                                {t("canvas.segment.undoPoint")}
                            </Button>
                            <Button
                                icon={<Trash2 className="size-4" />}
                                disabled={!points.length}
                                onClick={() => {
                                    setPoints([]);
                                    setResult(null);
                                }}
                            >
                                {t("canvas.segment.clearPoints")}
                            </Button>
                        </div>
                        {!ready ? (
                            <Button block icon={<Download className="size-4" />} loading={model.status === "downloading"} onClick={() => void prepare()}>
                                {model.status === "downloading" ? t("canvas.segment.preparing", { percent: model.percent }) : t("canvas.segment.prepare")}
                            </Button>
                        ) : null}
                        <div className="text-xs opacity-55">{points.length ? `${points.length}` : t("canvas.segment.empty")}</div>
                        <Button type="primary" block icon={<MousePointer2 className="size-4" />} loading={running} disabled={!ready || !points.length} onClick={() => void run()}>
                            {running ? t("canvas.segment.running") : t("canvas.segment.run")}
                        </Button>
                        {result ? (
                            <div className="space-y-2 rounded-xl border p-3" style={{ borderColor: theme.node.stroke }}>
                                <div className="text-sm font-medium opacity-75">{t("canvas.segment.result")}</div>
                                <div className="text-sm">{t("canvas.segment.score", { score: result.score.toFixed(3) })}</div>
                                <div
                                    className="grid place-items-center rounded-lg p-2"
                                    style={{ backgroundColor: theme.node.fill, backgroundImage: `repeating-conic-gradient(${theme.node.stroke} 0% 25%, transparent 0% 50%)`, backgroundSize: "12px 12px" }}
                                >
                                    <img src={result.maskDataUrl} alt="" className="max-h-[140px] max-w-full object-contain" draggable={false} />
                                </div>
                            </div>
                        ) : null}
                        <Button block disabled={!result} onClick={() => result && onConfirm(result)}>
                            {t("common.confirm")}
                        </Button>
                    </div>
                </div>
            </div>
        </Modal>
    );
}
