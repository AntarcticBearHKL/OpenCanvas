import { useEffect, useRef, useState } from "react";
import { Segmented } from "antd";
import { ImageOff, ImagePlus, Loader2, SlidersHorizontal, Sparkles, Zap } from "lucide-react";
import { useTranslation } from "react-i18next";

import { useCanvasTheme } from "@/hooks/use-canvas-theme";
import {
    DEFAULT_IMAGE_MODIFIER_CURVE,
    DEFAULT_IMAGE_MODIFIER_PARAMS,
    IMAGE_MODIFIER_CURVE_GAP,
    IMAGE_MODIFIER_PARAMS,
    IMAGE_MODIFIER_TONE_PARAMS,
    drawImageModifierInto,
    formatImageModifierValue,
    imageModifierHistogram,
    loadImageElement,
    normalizeImageModifierCurve,
    normalizeImageModifierParams,
} from "@/lib/canvas/image-modifier";
import { resolveImageUrl } from "@/services/image-storage";
import type { CanvasImageModifierCurvePoint, CanvasImageModifierParamKey, CanvasImageModifierParams, CanvasNodeData } from "@/types/canvas";

const MODIFIER_DESIGN_WIDTH = 460;
const MODIFIER_DESIGN_HEIGHT = 644;
const PREVIEW_HEIGHT = 220;
const CURVE_HEIGHT = 150;
const CURVE_PADDING = 8;
const CURVE_POINT_RADIUS = 5;

type ImageModifierTab = "filters" | "tone" | "curve";

export function ImageModifierNodeContent({
    node,
    onParamsChange,
    onCurveChange,
    onEmitChange,
    onGenerate,
    onClearSource,
}: {
    node: CanvasNodeData;
    onParamsChange: (params: CanvasImageModifierParams) => void;
    onCurveChange: (curve: CanvasImageModifierCurvePoint[]) => void;
    onEmitChange: (emit: boolean) => void;
    onGenerate: () => Promise<void>;
    onClearSource: () => void;
}) {
    const theme = useCanvasTheme();
    const { t } = useTranslation();
    const source = node.metadata?.modifierSource;
    const params = normalizeImageModifierParams(node.metadata?.modifierParams);
    const curve = normalizeImageModifierCurve(node.metadata?.modifierCurve);
    const emit = Boolean(node.metadata?.modifierEmit);
    const error = node.metadata?.modifierError;
    const [sourceUrl, setSourceUrl] = useState("");
    const [loadFailed, setLoadFailed] = useState(false);
    const [baking, setBaking] = useState(false);
    const [tab, setTab] = useState<ImageModifierTab>("filters");
    const [histogram, setHistogram] = useState<Uint32Array | null>(null);
    const previewRef = useRef<HTMLCanvasElement | null>(null);
    const curveRef = useRef<HTMLCanvasElement | null>(null);
    const dragRef = useRef<number | null>(null);
    const frameRef = useRef(0);

    useEffect(() => {
        let active = true;
        setLoadFailed(false);
        if (!source?.content && !source?.storageKey) {
            setSourceUrl("");
            return;
        }
        void resolveImageUrl(source.storageKey, source.content || "").then((url) => {
            if (!active) return;
            setSourceUrl(url);
            if (!url) setLoadFailed(true);
        });
        return () => {
            active = false;
        };
    }, [source?.content, source?.storageKey]);

    useEffect(() => {
        let active = true;
        setHistogram(null);
        if (!sourceUrl) return;
        void imageModifierHistogram(sourceUrl)
            .then((value) => {
                if (active) setHistogram(value);
            })
            .catch(() => undefined);
        return () => {
            active = false;
        };
    }, [sourceUrl]);

    useEffect(() => {
        let active = true;
        if (!sourceUrl) return;
        void loadImageElement(sourceUrl)
            .then((image) => {
                const canvas = previewRef.current;
                const context = canvas?.getContext("2d");
                if (!active || !canvas || !context) return;
                const scale = Math.min(canvas.width / image.naturalWidth, canvas.height / image.naturalHeight);
                const width = Math.max(1, Math.round(image.naturalWidth * scale));
                const height = Math.max(1, Math.round(image.naturalHeight * scale));
                context.clearRect(0, 0, canvas.width, canvas.height);
                drawImageModifierInto(context, image, { x: (canvas.width - width) / 2, y: (canvas.height - height) / 2, width, height }, params, curve);
            })
            .catch(() => undefined);
        return () => {
            active = false;
        };
    }, [sourceUrl, params, curve]);

    useEffect(() => {
        const canvas = curveRef.current;
        const context = canvas?.getContext("2d");
        if (!canvas || !context) return;
        const width = canvas.width;
        const height = canvas.height;
        const innerWidth = width - CURVE_PADDING * 2;
        const innerHeight = height - CURVE_PADDING * 2;
        const first = curve[0];
        const lastPoint = curve[curve.length - 1];
        context.clearRect(0, 0, width, height);
        context.fillStyle = theme.node.fill;
        context.fillRect(0, 0, width, height);
        context.fillStyle = theme.node.muted;
        context.globalAlpha = 0.15;
        context.fillRect(CURVE_PADDING, CURVE_PADDING, first.x * innerWidth, innerHeight);
        context.fillRect(CURVE_PADDING + lastPoint.x * innerWidth, CURVE_PADDING, (1 - lastPoint.x) * innerWidth, innerHeight);
        context.globalAlpha = 1;
        if (histogram) {
            let peak = 0;
            for (let index = 0; index < histogram.length; index++) peak = Math.max(peak, histogram[index]);
            if (peak > 0) {
                context.fillStyle = theme.node.muted;
                context.globalAlpha = 0.35;
                for (let index = 0; index < histogram.length; index++) {
                    const barHeight = (histogram[index] / peak) * innerHeight;
                    if (barHeight <= 0) continue;
                    context.fillRect(CURVE_PADDING + (index / 256) * innerWidth, CURVE_PADDING + innerHeight - barHeight, innerWidth / 256 + 0.5, barHeight);
                }
                context.globalAlpha = 1;
            }
        }
        context.strokeStyle = theme.node.stroke;
        context.lineWidth = 1;
        context.strokeRect(CURVE_PADDING + 0.5, CURVE_PADDING + 0.5, innerWidth - 1, innerHeight - 1);
        context.strokeStyle = theme.node.activeStroke;
        context.lineWidth = 1.5;
        context.beginPath();
        for (let step = 0; step <= 64; step++) {
            const x = step / 64;
            const y = curveSample(curve, Math.min(lastPoint.x, Math.max(first.x, x)));
            const px = CURVE_PADDING + x * innerWidth;
            const py = CURVE_PADDING + (1 - y) * innerHeight;
            if (step === 0) context.moveTo(px, py);
            else context.lineTo(px, py);
        }
        context.stroke();
        context.fillStyle = theme.node.activeStroke;
        curve.forEach((point) => {
            context.beginPath();
            context.arc(CURVE_PADDING + point.x * innerWidth, CURVE_PADDING + (1 - point.y) * innerHeight, CURVE_POINT_RADIUS, 0, Math.PI * 2);
            context.fill();
        });
    }, [curve, histogram, theme]);

    const hasSource = Boolean(source?.content || source?.storageKey);
    const showImage = hasSource && Boolean(sourceUrl) && !loadFailed;
    const layoutScale = Math.min(Math.max(node.width - 4, 1) / MODIFIER_DESIGN_WIDTH, Math.max(node.height - 4, 1) / MODIFIER_DESIGN_HEIGHT);

    const updateCurvePoint = (index: number, x: number, y: number) => {
        const next = curve.map((point) => ({ ...point }));
        const last = next.length - 1;
        const minX = index === 0 ? 0 : next[index - 1].x + IMAGE_MODIFIER_CURVE_GAP;
        const maxX = index === last ? 1 : next[index + 1].x - IMAGE_MODIFIER_CURVE_GAP;
        next[index].x = Math.min(maxX, Math.max(minX, x));
        next[index].y = index === 0 ? 0 : index === last ? 1 : Math.min(1, Math.max(next[index - 1].y, y));
        if (index === 0 || index === last) onParamsChange({ ...params, blackPoint: Math.round(next[0].x * 255), whitePoint: Math.round(next[last].x * 255) });
        onCurveChange(next);
    };

    const toneParamValue = (key: CanvasImageModifierParamKey) => (key === "blackPoint" ? Math.round(curve[0].x * 255) : key === "whitePoint" ? Math.round(curve[curve.length - 1].x * 255) : params[key]);

    const changeToneParam = (key: CanvasImageModifierParamKey, value: number) => {
        if (key === "blackPoint") updateCurvePoint(0, value / 255, 0);
        else if (key === "whitePoint") updateCurvePoint(curve.length - 1, value / 255, 1);
        else {
            const next = { ...params };
            next[key] = value;
            onParamsChange(next);
        }
    };

    const handleCurvePointer = (event: React.PointerEvent<HTMLCanvasElement>) => {
        const canvas = curveRef.current;
        if (!canvas) return;
        const rect = canvas.getBoundingClientRect();
        const innerWidth = canvas.width - CURVE_PADDING * 2;
        const innerHeight = canvas.height - CURVE_PADDING * 2;
        const x = (event.clientX - rect.left) * (canvas.width / rect.width);
        const y = (event.clientY - rect.top) * (canvas.height / rect.height);
        if (dragRef.current == null) {
            let nearest = 0;
            let nearestDistance = Infinity;
            curve.forEach((point, index) => {
                const distance = Math.hypot(CURVE_PADDING + point.x * innerWidth - x, CURVE_PADDING + (1 - point.y) * innerHeight - y);
                if (distance < nearestDistance) {
                    nearestDistance = distance;
                    nearest = index;
                }
            });
            if (nearestDistance > 24) return;
            dragRef.current = nearest;
            canvas.setPointerCapture(event.pointerId);
        }
        const index = dragRef.current;
        if (index == null) return;
        const nextX = (x - CURVE_PADDING) / innerWidth;
        const nextY = 1 - (y - CURVE_PADDING) / innerHeight;
        if (frameRef.current) cancelAnimationFrame(frameRef.current);
        frameRef.current = requestAnimationFrame(() => updateCurvePoint(index, nextX, nextY));
    };

    const endCurveDrag = (event: React.PointerEvent<HTMLCanvasElement>) => {
        if (frameRef.current) {
            cancelAnimationFrame(frameRef.current);
            frameRef.current = 0;
        }
        if (dragRef.current == null) return;
        dragRef.current = null;
        curveRef.current?.releasePointerCapture(event.pointerId);
    };

    return (
        <div className="absolute inset-0 overflow-hidden" onWheel={(event) => event.stopPropagation()}>
            <div
                className="absolute left-1/2 top-1/2 flex flex-col justify-center gap-2 p-4 text-left"
                style={{ width: MODIFIER_DESIGN_WIDTH, height: MODIFIER_DESIGN_HEIGHT, transform: `translate(-50%, -50%) scale(${layoutScale})`, color: theme.node.text }}
            >
                <div className="flex h-7 shrink-0 items-center gap-1">
                    <SlidersHorizontal className="size-3.5 shrink-0" style={{ color: theme.node.muted }} />
                    <span className="min-w-0 flex-1 truncate text-xs font-semibold" style={{ color: theme.node.text }}>
                        {t("canvas.nodeTypes.imageModifier")}
                    </span>
                    <button
                        type="button"
                        className="flex h-6 shrink-0 items-center rounded-md px-2 text-[10px] font-medium transition hover:bg-black/5 dark:hover:bg-white/10"
                        style={{ color: theme.node.muted }}
                        onClick={() => {
                            onParamsChange(DEFAULT_IMAGE_MODIFIER_PARAMS);
                            onCurveChange(DEFAULT_IMAGE_MODIFIER_CURVE.map((point) => ({ ...point })));
                        }}
                        onMouseDown={(event) => event.stopPropagation()}
                    >
                        {t("canvas.imageModifier.reset")}
                    </button>
                </div>

                {emit ? null : (
                    <div className="relative flex h-[220px] shrink-0 items-center justify-center overflow-hidden rounded-xl" style={{ background: theme.node.fill }}>
                        {showImage ? (
                            <canvas ref={previewRef} width={428} height={PREVIEW_HEIGHT} className="h-full w-full" />
                        ) : (
                            <div className="flex flex-col items-center gap-2 px-4 text-center" style={{ color: theme.node.placeholder }}>
                                {loadFailed ? <ImageOff className="size-6 opacity-40" /> : <ImagePlus className="size-6 opacity-40" />}
                                <span className="text-[11px] leading-5">{loadFailed ? t("canvas.imageModifier.sourceLoadFailed") : hasSource ? t("canvas.imageModifier.rendering") : t("canvas.imageModifier.empty")}</span>
                                {loadFailed ? (
                                    <button
                                        type="button"
                                        className="flex h-6 items-center rounded-md px-2 text-[10px] font-medium transition hover:bg-black/5 dark:hover:bg-white/10"
                                        style={{ color: theme.node.text }}
                                        onClick={onClearSource}
                                        onMouseDown={(event) => event.stopPropagation()}
                                    >
                                        {t("canvas.imageModifier.clear")}
                                    </button>
                                ) : null}
                            </div>
                        )}
                        {!showImage ? <div className="pointer-events-none absolute inset-0 rounded-xl border border-dashed" style={{ borderColor: theme.node.stroke }} /> : null}
                    </div>
                )}

                <div className="shrink-0" onMouseDown={(event) => event.stopPropagation()}>
                    <Segmented
                        block
                        size="small"
                        value={tab}
                        onChange={(value) => setTab(value as ImageModifierTab)}
                        options={[
                            { label: t("canvas.imageModifier.tabFilters"), value: "filters" },
                            { label: t("canvas.imageModifier.tabTone"), value: "tone" },
                            { label: t("canvas.imageModifier.tabCurve"), value: "curve" },
                        ]}
                    />
                </div>

                <div className="h-48 shrink-0" onMouseDown={(event) => event.stopPropagation()}>
                    {tab === "filters" ? (
                        <div className="grid h-full grid-cols-2 content-center gap-2">
                            {IMAGE_MODIFIER_PARAMS.map((spec) => (
                                <label key={spec.key} className="flex h-8 flex-col justify-between">
                                    <span className="flex min-w-0 items-center justify-between gap-1 text-[10px] leading-4" style={{ color: theme.node.muted }}>
                                        <span className="truncate">{t(spec.labelKey)}</span>
                                        <span className="shrink-0 tabular-nums">{formatImageModifierValue(spec, params[spec.key])}</span>
                                    </span>
                                    <input
                                        type="range"
                                        min={spec.min}
                                        max={spec.max}
                                        step={spec.step}
                                        value={params[spec.key]}
                                        className="m-0 h-4 w-full"
                                        style={{ accentColor: theme.node.activeStroke }}
                                        aria-label={t(spec.labelKey)}
                                        onChange={(event) => {
                                            const next = { ...params };
                                            next[spec.key] = Number(event.target.value);
                                            onParamsChange(next);
                                        }}
                                    />
                                </label>
                            ))}
                        </div>
                    ) : tab === "tone" ? (
                        <div className="grid h-full grid-cols-2 content-center gap-2">
                            {IMAGE_MODIFIER_TONE_PARAMS.map((spec) => (
                                <label key={spec.key} className="flex h-8 flex-col justify-between">
                                    <span className="flex min-w-0 items-center justify-between gap-1 text-[10px] leading-4" style={{ color: theme.node.muted }}>
                                        <span className="truncate">{t(spec.labelKey)}</span>
                                        <span className="shrink-0 tabular-nums">{formatImageModifierValue(spec, toneParamValue(spec.key))}</span>
                                    </span>
                                    <input
                                        type="range"
                                        min={spec.min}
                                        max={spec.max}
                                        step={spec.step}
                                        value={toneParamValue(spec.key)}
                                        className="m-0 h-4 w-full"
                                        style={{ accentColor: theme.node.activeStroke }}
                                        aria-label={t(spec.labelKey)}
                                        onChange={(event) => changeToneParam(spec.key, Number(event.target.value))}
                                    />
                                </label>
                            ))}
                        </div>
                    ) : (
                        <div className="flex h-full flex-col justify-center gap-2">
                            <div className="flex h-4 shrink-0 items-center justify-between text-[10px] leading-4" style={{ color: theme.node.muted }}>
                                <span className="truncate">{t("canvas.imageModifier.curve")}</span>
                                <button
                                    type="button"
                                    className="flex h-4 shrink-0 items-center rounded px-1.5 font-medium transition hover:bg-black/5 dark:hover:bg-white/10"
                                    style={{ color: theme.node.muted }}
                                    onClick={() => onCurveChange(DEFAULT_IMAGE_MODIFIER_CURVE.map((point) => ({ ...point })))}
                                    onMouseDown={(event) => event.stopPropagation()}
                                >
                                    {t("canvas.imageModifier.curveReset")}
                                </button>
                            </div>
                            <canvas
                                ref={curveRef}
                                width={428}
                                height={CURVE_HEIGHT}
                                className="h-[150px] w-full shrink-0 cursor-crosshair touch-none rounded-xl"
                                title={t("canvas.imageModifier.curveHint")}
                                onPointerDown={(event) => {
                                    event.stopPropagation();
                                    handleCurvePointer(event);
                                }}
                                onPointerMove={(event) => {
                                    if (dragRef.current == null) return;
                                    event.stopPropagation();
                                    handleCurvePointer(event);
                                }}
                                onPointerUp={endCurveDrag}
                                onPointerCancel={endCurveDrag}
                                onMouseDown={(event) => event.stopPropagation()}
                            />
                        </div>
                    )}
                </div>

                <div className="flex h-4 shrink-0 items-center text-[10px] leading-4" onMouseDown={(event) => event.stopPropagation()}>
                    <span className="truncate" style={{ color: error ? "#f87171" : theme.node.muted }}>
                        {error || (emit ? t("canvas.imageModifier.emitHint") : t("canvas.imageModifier.dropHint"))}
                    </span>
                </div>

                <button
                    type="button"
                    className="flex h-9 w-full shrink-0 items-center justify-between rounded-lg border px-3 text-[11px] font-medium transition hover:bg-black/5 dark:hover:bg-white/10"
                    style={{ borderColor: emit ? theme.node.activeStroke : theme.node.stroke, color: emit ? theme.node.activeStroke : theme.node.muted }}
                    title={t("canvas.imageModifier.emitTitle")}
                    onClick={() => onEmitChange(!emit)}
                    onMouseDown={(event) => event.stopPropagation()}
                >
                    <span className="flex min-w-0 items-center gap-1.5">
                        <Zap className="size-3.5 shrink-0" />
                        <span className="truncate">{emit ? t("canvas.imageModifier.emitOn") : t("canvas.imageModifier.emitOff")}</span>
                    </span>
                    <span className="size-2 shrink-0 rounded-full" style={{ background: emit ? theme.node.activeStroke : theme.node.stroke }} />
                </button>

                <button
                    type="button"
                    disabled={!hasSource || baking || loadFailed}
                    onClick={() => {
                        setBaking(true);
                        void onGenerate().finally(() => setBaking(false));
                    }}
                    className="flex h-9 w-full shrink-0 items-center justify-center gap-1.5 rounded-lg border text-xs font-semibold transition hover:bg-black/5 disabled:opacity-40 dark:hover:bg-white/10"
                    style={{ borderColor: theme.node.stroke, color: theme.node.text }}
                >
                    {baking ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
                    {baking ? t("canvas.imageModifier.baking") : t("canvas.imageModifier.generate")}
                </button>
            </div>
        </div>
    );
}

function curveSample(points: CanvasImageModifierCurvePoint[], value: number): number {
    const last = points.length - 1;
    const x = Math.min(1, Math.max(0, value));
    let index = 0;
    while (index < last - 1 && x > points[index + 1].x) index += 1;
    const width = points[index + 1].x - points[index].x;
    const t = width > 0 ? (x - points[index].x) / width : 0;
    const t2 = t * t;
    const t3 = t2 * t;
    const slopeA = index === 0 ? (points[1].y - points[0].y) / (points[1].x - points[0].x) : (points[index + 1].y - points[index - 1].y) / (points[index + 1].x - points[index - 1].x);
    const slopeB = index + 1 === last ? (points[last].y - points[last - 1].y) / (points[last].x - points[last - 1].x) : (points[index + 2].y - points[index].y) / (points[index + 2].x - points[index].x);
    return (2 * t3 - 3 * t2 + 1) * points[index].y + (t3 - 2 * t2 + t) * width * slopeA + (-2 * t3 + 3 * t2) * points[index + 1].y + (t3 - t2) * width * slopeB;
}
