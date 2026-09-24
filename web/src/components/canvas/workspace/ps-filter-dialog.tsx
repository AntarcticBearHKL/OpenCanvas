import { useEffect, useRef, useState, type Dispatch, type PointerEvent as ReactPointerEvent, type SetStateAction } from "react";
import { Modal, Select, Slider, Switch } from "antd";
import { useTranslation } from "react-i18next";

import { ImageSettingsTheme } from "@/components/image-settings-panel";
import { commitBoardLayers, rasterizePsLayer } from "@/components/canvas/workspace/ps-layer-ops";
import { psCanvasToBlob } from "@/components/canvas/workspace/ps-paint";
import { applyPsFilter, PS_FILTER_BY_TYPE, psFilterLayerBitmap, psFilterMask, psFilterParams, psLiquifyPush, psLoadFilterSource, psMixFiltered, type PsFilterParams, type PsFilterType } from "@/components/canvas/workspace/ps-filters";
import type { PsSelection } from "@/components/canvas/workspace/ps-selection";
import { useCanvasTheme } from "@/hooks/use-canvas-theme";
import { createCanvasContext } from "@/lib/canvas/canvas-2d";
import { smartCanvasLayers } from "@/lib/canvas/smart-canvas";
import { resolveImageUrl, uploadImage } from "@/services/image-storage";
import type { CanvasNodeData, CanvasPsLayer } from "@/types/canvas";

type PsFilterDialogProps = {
    board: CanvasNodeData;
    setNodes: Dispatch<SetStateAction<CanvasNodeData[]>>;
    nodes: CanvasNodeData[];
    layer: CanvasPsLayer | null;
    selection: PsSelection | null;
    type: PsFilterType;
    onClose: () => void;
    onApplied: (type: PsFilterType, params: PsFilterParams) => void;
};

type PsPreview = { data: ImageData; scale: number };

const PREVIEW_MAX_EDGE = 320;
const ROW_CLASS = "flex min-w-0 items-center gap-2 py-1";
const LABEL_CLASS = "w-24 shrink-0 text-sm";

export default function PsFilterDialog({ board, setNodes, nodes, layer, selection, type, onClose, onApplied }: PsFilterDialogProps) {
    const { t } = useTranslation();
    const theme = useCanvasTheme();
    const layers = smartCanvasLayers(board);
    const filter = PS_FILTER_BY_TYPE.get(type);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const previewRef = useRef<PsPreview | null>(null);
    const workRef = useRef<ImageData | null>(null);
    const strokesRef = useRef<{ x: number; y: number; dx: number; dy: number }[]>([]);
    const lastRef = useRef<{ x: number; y: number } | null>(null);
    const [params, setParams] = useState<PsFilterParams>(() => psFilterParams(type));
    const [size, setSize] = useState({ width: 0, height: 0 });
    const [ready, setReady] = useState(false);
    const [busy, setBusy] = useState(false);

    const draw = () => {
        const preview = previewRef.current;
        const context = canvasRef.current?.getContext("2d");
        if (!preview || !context) return;
        if (type === "liquify") {
            context.putImageData(workRef.current ?? preview.data, 0, 0);
            return;
        }
        const copy = new ImageData(new Uint8ClampedArray(preview.data.data), preview.data.width, preview.data.height);
        applyPsFilter(copy, type, params);
        context.putImageData(copy, 0, 0);
    };

    useEffect(() => {
        setParams(psFilterParams(type));
        strokesRef.current = [];
        workRef.current = null;
    }, [type]);

    useEffect(() => {
        if (!layer || layer.kind === "adjustment") return;
        let active = true;
        setReady(false);
        previewRef.current = null;
        void psLoadFilterSource(layer, layers, nodes).then((canvas) => {
            if (!active || !canvas) return;
            const scale = Math.min(1, PREVIEW_MAX_EDGE / Math.max(canvas.width, canvas.height));
            const width = Math.max(1, Math.round(canvas.width * scale));
            const height = Math.max(1, Math.round(canvas.height * scale));
            const small = createCanvasContext(width, height);
            if (!small.context) return;
            small.context.drawImage(canvas, 0, 0, width, height);
            const data = small.context.getImageData(0, 0, width, height);
            previewRef.current = { data, scale };
            workRef.current = new ImageData(new Uint8ClampedArray(data.data), width, height);
            setSize({ width, height });
            setReady(true);
        });
        return () => {
            active = false;
        };
    }, [layer, layers, nodes, type]);

    useEffect(() => {
        if (!ready) return;
        draw();
    }, [ready, params, type]);

    if (!filter || !layer || layer.kind === "adjustment") return null;
    const value = (key: string, fallback: number) => (typeof params[key] === "number" ? (params[key] as number) : fallback);
    const pointAt = (event: ReactPointerEvent<HTMLCanvasElement>) => {
        const box = event.currentTarget.getBoundingClientRect();
        return { x: ((event.clientX - box.left) / Math.max(1, box.width)) * size.width, y: ((event.clientY - box.top) / Math.max(1, box.height)) * size.height };
    };
    const apply = async () => {
        setBusy(true);
        try {
            const maskUrl = layer.maskStorageKey ? await resolveImageUrl(layer.maskStorageKey) : "";
            let blob: Blob | null = null;
            if (type === "liquify") {
                const full = await psLoadFilterSource(layer, layers, nodes);
                const fullContext = full?.getContext("2d");
                if (full && fullContext) {
                    const base = fullContext.getImageData(0, 0, full.width, full.height);
                    const work = new ImageData(new Uint8ClampedArray(base.data), full.width, full.height);
                    const scale = 1 / (previewRef.current?.scale || 1);
                    strokesRef.current.forEach((stroke) => psLiquifyPush(work, { x: stroke.x * scale, y: stroke.y * scale }, { x: stroke.dx * scale, y: stroke.dy * scale }, (value("size", 80) / 2) * scale, value("pressure", 60) / 100));
                    const mask = await psFilterMask(full.width, full.height, layer, selection, maskUrl || undefined);
                    fullContext.putImageData(psMixFiltered(base, work, mask), 0, 0);
                    blob = await psCanvasToBlob(full);
                }
            } else {
                blob = await psFilterLayerBitmap(layer, layers, nodes, type, params, { selection, maskUrl: maskUrl || undefined });
            }
            if (!blob) return;
            const uploaded = await uploadImage(blob);
            if (!uploaded.storageKey) return;
            commitBoardLayers(setNodes, board.id, rasterizePsLayer(layers, layer.id, uploaded.storageKey));
            onApplied(type, params);
            onClose();
        } finally {
            setBusy(false);
        }
    };
    return (
        <Modal open title={t(filter.labelKey)} okText={t("canvas.ps.apply")} cancelText={t("canvas.ps.cancel")} confirmLoading={busy} onCancel={onClose} onOk={() => void apply()} width={400} classNames={{ container: "glass-raised" }} styles={{ container: { background: "var(--glass-strong)" } }}>
            <ImageSettingsTheme theme={theme}>
                <div className="flex flex-col gap-2">
                    <div className="flex items-center justify-center rounded-[2px] border p-1 glass-card" style={{ borderColor: theme.toolbar.border }}>
                        <canvas
                            ref={canvasRef}
                            width={size.width || 1}
                            height={size.height || 1}
                            className={`max-h-56 w-full object-contain ${type === "liquify" ? "cursor-crosshair touch-none" : ""}`}
                            onPointerDown={(event) => {
                                if (type !== "liquify") return;
                                event.currentTarget.setPointerCapture(event.pointerId);
                                lastRef.current = pointAt(event);
                            }}
                            onPointerMove={(event) => {
                                if (type !== "liquify" || !lastRef.current) return;
                                const point = pointAt(event);
                                const delta = { x: point.x - lastRef.current.x, y: point.y - lastRef.current.y };
                                if (workRef.current) psLiquifyPush(workRef.current, point, delta, value("size", 80) / 2, value("pressure", 60) / 100);
                                strokesRef.current.push({ x: point.x, y: point.y, dx: delta.x, dy: delta.y });
                                lastRef.current = point;
                                draw();
                            }}
                            onPointerUp={() => {
                                lastRef.current = null;
                            }}
                            onPointerCancel={() => {
                                lastRef.current = null;
                            }}
                        />
                    </div>
                    {layer.kind !== "pixel" ? (
                        <p className="text-sm font-medium" style={{ color: theme.node.danger }}>
                            {t("canvas.ps.filterRasterize")}
                        </p>
                    ) : null}
                    {type === "liquify" ? (
                        <p className="text-sm" style={{ color: theme.node.muted }}>
                            {t("canvas.ps.filter.liquifyHint")}
                        </p>
                    ) : null}
                    {filter.controls.map((control) => (
                        <div key={control.key} className={ROW_CLASS} style={{ color: theme.node.label }}>
                            <span className={LABEL_CLASS}>{t(control.labelKey)}</span>
                            {control.kind === "slider" ? (
                                <>
                                    <Slider
                                        className="!mx-0 min-w-0 flex-1"
                                        min={control.min ?? 0}
                                        max={control.max ?? 100}
                                        step={control.step ?? 1}
                                        value={value(control.key, control.min ?? 0)}
                                        tooltip={{ formatter: (input) => `${input}${control.suffix || ""}` }}
                                        ariaLabelForHandle={t(control.labelKey)}
                                        onChange={(input) => setParams((prev) => ({ ...prev, [control.key]: input }))}
                                    />
                                    <span className="w-10 shrink-0 text-right text-sm tabular-nums" style={{ color: theme.node.text }}>
                                        {value(control.key, control.min ?? 0)}
                                        {control.suffix || ""}
                                    </span>
                                </>
                            ) : control.kind === "select" ? (
                                <Select
                                    size="small"
                                    className="min-w-0 flex-1"
                                    value={typeof params[control.key] === "string" ? (params[control.key] as string) : control.options?.[0]?.value}
                                    options={(control.options || []).map((option) => ({ value: option.value, label: t(option.labelKey) }))}
                                    popupMatchSelectWidth={false}
                                    styles={{ popup: { root: { zIndex: 1300 } } }}
                                    aria-label={t(control.labelKey)}
                                    onChange={(input) => setParams((prev) => ({ ...prev, [control.key]: input }))}
                                />
                            ) : (
                                <Switch size="small" checked={value(control.key, 1) >= 0.5} onChange={(input) => setParams((prev) => ({ ...prev, [control.key]: input ? 1 : 0 }))} />
                            )}
                        </div>
                    ))}
                    <div className="flex justify-end">
                        <button
                            type="button"
                            className="rounded-[2px] px-2 py-0.5 text-sm transition hover:bg-hover"
                            style={{ color: theme.node.text }}
                            onClick={() => {
                                setParams(psFilterParams(type));
                                strokesRef.current = [];
                                const preview = previewRef.current;
                                if (preview) workRef.current = new ImageData(new Uint8ClampedArray(preview.data.data), preview.data.width, preview.data.height);
                                draw();
                            }}
                        >
                            {t("canvas.ps.filterReset")}
                        </button>
                    </div>
                </div>
            </ImageSettingsTheme>
        </Modal>
    );
}
