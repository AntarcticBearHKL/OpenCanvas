import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Input, Slider } from "antd";
import { Check, Plus, Save, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";

import { ImageSettingsTheme } from "@/components/image-settings-panel";
import PsColorPicker, { PsColorFields } from "@/components/canvas/workspace/ps-color-picker";
import { psBrushPreview, psCanvasToBlob } from "@/components/canvas/workspace/ps-paint";
import { psSelectionBounds } from "@/components/canvas/workspace/ps-selection";
import { STUDIO_FLAT_BUTTON_CLASS, STUDIO_PANEL_LABEL_CLASS, STUDIO_PANEL_ROW_CLASS, STUDIO_PANEL_VALUE_CLASS } from "@/components/canvas/workspace/studio-chrome";
import { useCanvasTheme } from "@/hooks/use-canvas-theme";
import { createCanvasContext } from "@/lib/canvas/canvas-2d";
import { renderPsDocument, renderPsLayerBitmap } from "@/lib/canvas/smart-canvas";
import { psExpandGradientStops, psBrushPresetName, psGradientPresetName, usePsAssetStore, type PsBrushPreset, type PsGradientPreset, type PsGradientStopPreset, type PsPatternPreset } from "@/stores/use-ps-asset-store";
import { resolveImageUrl, uploadImage } from "@/services/image-storage";
import type { CanvasNodeData, CanvasPsLayer } from "@/types/canvas";

export type PsGradientPick = { color: string; position: number }[];

const ROW_CLASS = STUDIO_PANEL_ROW_CLASS;
const LABEL_CLASS = STUDIO_PANEL_LABEL_CLASS;
const VALUE_CLASS = STUDIO_PANEL_VALUE_CLASS;
const FLAT_BUTTON_CLASS = STUDIO_FLAT_BUTTON_CLASS;
const TILE_CLASS = "size-9 shrink-0 rounded-md border";

function psGradientCss(stops: PsGradientStopPreset[]) {
    return `linear-gradient(to right, ${psExpandGradientStops(stops)
        .map((stop) => `${stop.color} ${Math.round(stop.position * 100)}%`)
        .join(", ")})`;
}

export function PsGradientsPanel({ foreground, background, onPick }: { foreground: string; background: string; onPick: (stops: PsGradientPick) => void }) {
    const { t } = useTranslation();
    const theme = useCanvasTheme();
    const gradients = usePsAssetStore((state) => state.gradients);
    const saveGradient = usePsAssetStore((state) => state.saveGradient);
    const removeGradient = usePsAssetStore((state) => state.removeGradient);
    const [editingId, setEditingId] = useState("");
    const [name, setName] = useState("");
    const [selected, setSelected] = useState(0);
    const [stops, setStops] = useState<PsGradientStopPreset[]>([{ color: foreground, position: 0, midpoint: 0.5 }, { color: "#ffffff", position: 1, midpoint: 0.5 }]);
    const barRef = useRef<HTMLDivElement>(null);
    const index = Math.min(selected, stops.length - 1);

    const dynamic: { key: string; label: string; stops: PsGradientStopPreset[] }[] = [
        { key: "transparent", label: t("canvas.ps.gradientForegroundTransparent"), stops: [{ color: foreground, position: 0, midpoint: 0.5 }, { color: `${foreground}00`, position: 1, midpoint: 0.5 }] },
        { key: "pair", label: t("canvas.ps.gradientForegroundBackground"), stops: [{ color: foreground, position: 0, midpoint: 0.5 }, { color: background, position: 1, midpoint: 0.5 }] },
    ];
    const load = (preset: PsGradientPreset) => {
        setEditingId(preset.id);
        setName(psGradientPresetName(preset));
        setStops(preset.stops.map((stop) => ({ ...stop })));
        setSelected(0);
    };
    const update = (next: { color?: string; position?: number; midpoint?: number }) => {
        setStops((prev) => prev.map((stop, item) => (item === index ? { ...stop, ...next } : stop)));
    };
    const dragStop = (event: ReactPointerEvent<HTMLButtonElement>, item: number) => {
        event.stopPropagation();
        event.currentTarget.setPointerCapture(event.pointerId);
        setSelected(item);
        const move = (clientX: number) => {
            const box = barRef.current?.getBoundingClientRect();
            if (!box) return;
            setStops((prev) => prev.map((stop, position) => (position === item ? { ...stop, position: Math.min(1, Math.max(0, (clientX - box.left) / Math.max(1, box.width))) } : stop)));
        };
        move(event.clientX);
        const onMove = (moveEvent: PointerEvent) => move(moveEvent.clientX);
        const onUp = () => {
            window.removeEventListener("pointermove", onMove);
            window.removeEventListener("pointerup", onUp);
        };
        window.addEventListener("pointermove", onMove);
        window.addEventListener("pointerup", onUp);
    };

    return (
        <ImageSettingsTheme theme={theme}>
            <div className="thin-scrollbar min-h-0 flex-1 overflow-y-auto px-2 pb-2 text-sm" style={{ color: theme.node.text }}>
                {dynamic.map((item) => (
                    <button key={item.key} type="button" className="flex w-full items-center gap-2 border-b px-1 py-1 transition hover:bg-hover" style={{ borderColor: theme.toolbar.border }} onClick={() => { setStops(item.stops.map((stop) => ({ ...stop }))); setEditingId(""); setName(item.label); onPick(psExpandGradientStops(item.stops)); }}>
                        <span className="h-4 w-16 shrink-0 rounded-md border" style={{ borderColor: theme.toolbar.border, background: psGradientCss(item.stops) }} />
                        <span className="min-w-0 flex-1 truncate text-left">{item.label}</span>
                    </button>
                ))}
                {gradients.map((preset) => (
                    <div key={preset.id} className="flex w-full items-center gap-1.5 border-b px-1 py-1" style={{ borderColor: theme.toolbar.border }}>
                        <button type="button" className="flex min-w-0 flex-1 items-center gap-2 transition hover:opacity-80" onClick={() => { load(preset); onPick(psExpandGradientStops(preset.stops)); }}>
                            <span className="h-4 w-16 shrink-0 rounded-md border" style={{ borderColor: theme.toolbar.border, background: psGradientCss(preset.stops) }} />
                            <span className="min-w-0 flex-1 truncate text-left">{psGradientPresetName(preset)}</span>
                        </button>
                        <button type="button" className={FLAT_BUTTON_CLASS} style={{ color: theme.node.muted }} aria-label={t("canvas.ps.presetDelete")} title={t("canvas.ps.presetDelete")} onClick={() => removeGradient(preset.id)}>
                            <Trash2 className="size-3" />
                        </button>
                    </div>
                ))}
                <div className="mt-1 border-t pt-1.5" style={{ borderColor: theme.toolbar.border }}>
                    <div
                        ref={barRef}
                        className="relative h-5 w-full cursor-copy rounded-md border"
                        style={{ borderColor: theme.toolbar.border, background: psGradientCss(stops) }}
                        onPointerDown={(event) => {
                            const box = barRef.current?.getBoundingClientRect();
                            if (!box) return;
                            setStops((prev) => [...prev, { color: prev[index].color, position: Math.min(1, Math.max(0, (event.clientX - box.left) / box.width)), midpoint: 0.5 }]);
                        }}
                    >
                        {stops.map((stop, item) => (
                            <button
                                key={item}
                                type="button"
                                className="absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border"
                                style={{ left: `${stop.position * 100}%`, background: stop.color, borderColor: item === index ? theme.node.activeStroke : theme.toolbar.border }}
                                aria-label={`${t("canvas.ps.gradientStops")} ${item + 1}`}
                                onPointerDown={(event) => dragStop(event, item)}
                                onDoubleClick={(event) => {
                                    event.stopPropagation();
                                    if (stops.length <= 2) return;
                                    setStops((prev) => prev.filter((_, keep) => keep !== item));
                                    setSelected(0);
                                }}
                            />
                        ))}
                    </div>
                    <div className={ROW_CLASS}>
                        <span className={LABEL_CLASS} style={{ color: theme.node.label }}>
                            {t("canvas.ps.gradientStops")}
                        </span>
                        <PsColorPicker value={stops[index].color} ariaLabel={t("canvas.ps.color")} onChange={(hex) => update({ color: hex })} />
                        <Slider className="!mx-0 min-w-0 flex-1" min={0} max={100} value={Math.round(stops[index].position * 100)} ariaLabelForHandle={t("canvas.ps.gradientStop")} onChange={(value) => update({ position: value / 100 })} />
                        <span className={VALUE_CLASS} style={{ color: theme.node.text }}>
                            {Math.round(stops[index].position * 100)}%
                        </span>
                    </div>
                    <div className={ROW_CLASS}>
                        <span className={LABEL_CLASS} style={{ color: theme.node.label }}>
                            {t("canvas.ps.gradientMidpoint")}
                        </span>
                        <Slider className="!mx-0 min-w-0 flex-1" min={1} max={99} value={Math.round((stops[index].midpoint ?? 0.5) * 100)} ariaLabelForHandle={t("canvas.ps.gradientMidpoint")} onChange={(value) => update({ midpoint: value / 100 })} />
                        <span className={VALUE_CLASS} style={{ color: theme.node.text }}>
                            {Math.round((stops[index].midpoint ?? 0.5) * 100)}%
                        </span>
                    </div>
                    <div className={ROW_CLASS}>
                        <Input size="small" value={name} maxLength={32} placeholder={t("canvas.ps.presetName")} aria-label={t("canvas.ps.presetName")} onChange={(event) => setName(event.target.value)} />
                        <button
                            type="button"
                            className={FLAT_BUTTON_CLASS}
                            style={{ color: theme.node.text }}
                            onClick={() => {
                                const id = saveGradient({ id: editingId || undefined, name: name.trim() || t("canvas.ps.gradientNew"), stops });
                                setEditingId(id);
                                onPick(psExpandGradientStops(stops));
                            }}
                        >
                            <Save className="size-3" />
                            {t("canvas.ps.presetSave")}
                        </button>
                    </div>
                </div>
            </div>
        </ImageSettingsTheme>
    );
}

export function PsPatternsPanel({ board, layers, nodes, selection, selected, onPick, onFill, onForeground }: { board: CanvasNodeData; layers: CanvasPsLayer[]; nodes: CanvasNodeData[]; selection: HTMLCanvasElement | null; selected: CanvasPsLayer | null; onPick: (preset: PsPatternPreset) => void; onFill: (preset: PsPatternPreset) => void; onForeground: (hex: string) => void }) {
    const { t } = useTranslation();
    const theme = useCanvasTheme();
    const patterns = usePsAssetStore((state) => state.patterns);
    const addPattern = usePsAssetStore((state) => state.addPattern);
    const removePattern = usePsAssetStore((state) => state.removePattern);
    const [urls, setUrls] = useState<Record<string, string>>({});
    const [pickedId, setPickedId] = useState("");

    useEffect(() => {
        let active = true;
        void Promise.all(patterns.map(async (preset) => [preset.id, await resolveImageUrl(preset.storageKey)] as const)).then((entries) => {
            if (active) setUrls(Object.fromEntries(entries));
        });
        return () => {
            active = false;
        };
    }, [patterns]);

    const define = async () => {
        let blob: Blob | null = null;
        let name = t("canvas.ps.patternFromLayer");
        if (selection) {
            const bounds = psSelectionBounds({ canvas: selection });
            const { canvas } = await renderPsDocument(board, nodes, { width: board.width, height: board.height });
            if (canvas && bounds) {
                const cropped = createCanvasContext(bounds.width, bounds.height);
                if (cropped.context) {
                    cropped.context.drawImage(canvas, bounds.x, bounds.y, bounds.width, bounds.height, 0, 0, bounds.width, bounds.height);
                    blob = await psCanvasToBlob(cropped.canvas);
                    name = t("canvas.ps.patternFromSelection");
                }
            }
        } else if (selected) {
            const canvas = await renderPsLayerBitmap(selected, layers, nodes, board.metadata?.boardPaths ?? []);
            blob = canvas ? await psCanvasToBlob(canvas) : null;
        }
        if (!blob) return;
        const uploaded = await uploadImage(blob);
        if (!uploaded.storageKey) return;
        addPattern({ name, storageKey: uploaded.storageKey, width: uploaded.width, height: uploaded.height });
    };

    return (
        <div className="thin-scrollbar min-h-0 flex-1 overflow-y-auto px-2 pb-2 text-sm" style={{ color: theme.node.text }}>
            <div className="flex items-center gap-1.5 py-1">
                <button type="button" className={FLAT_BUTTON_CLASS} style={{ color: theme.node.text }} disabled={!selected && !selection} onClick={() => void define()}>
                    <Plus className="size-3" />
                    {t("canvas.ps.patternDefine")}
                </button>
                <span className="min-w-0 flex-1 truncate" style={{ color: theme.node.muted }}>
                    {selection ? t("canvas.ps.patternSelectionHint") : selected ? t("canvas.ps.patternLayerHint") : t("canvas.ps.patternNeedTarget")}
                </span>
            </div>
            {patterns.length ? (
                <div className="flex flex-wrap gap-1">
                    {patterns.map((preset) => (
                        <div key={preset.id} className="relative">
                            <button type="button" className="block" aria-label={preset.name} title={preset.name} onClick={() => { setPickedId(preset.id); onPick(preset); }}>
                                <img src={urls[preset.id] || ""} alt="" className={TILE_CLASS} style={{ borderColor: pickedId === preset.id ? theme.node.activeStroke : theme.toolbar.border, objectFit: "cover" }} />
                            </button>
                            <button type="button" className="absolute -right-1 -top-1 grid size-4 place-items-center rounded-md border" style={{ background: theme.toolbar.panel, borderColor: theme.toolbar.border, color: theme.node.muted }} aria-label={t("canvas.ps.presetDelete")} onClick={() => removePattern(preset.id)}>
                                <Trash2 className="size-2.5" />
                            </button>
                        </div>
                    ))}
                </div>
            ) : (
                <p style={{ color: theme.node.muted }}>{t("canvas.ps.patternEmpty")}</p>
            )}
            <div className="mt-1 flex items-center gap-1.5">
                <button type="button" className={FLAT_BUTTON_CLASS} style={{ color: theme.node.text }} disabled={!pickedId} onClick={() => { const preset = patterns.find((item) => item.id === pickedId); if (preset) onFill(preset); }}>
                    {t("canvas.ps.patternFillLayer")}
                </button>
                <span className="min-w-0 flex-1 truncate" style={{ color: theme.node.muted }}>
                    {t("canvas.ps.patternFillHint")}
                </span>
            </div>
            <div className="mt-1.5 flex items-center gap-1.5 border-t pt-1.5" style={{ borderColor: theme.toolbar.border }}>
                <span className="shrink-0" style={{ color: theme.node.muted }}>
                    {t("canvas.ps.colorForeground")}
                </span>
                <PsColorPicker value="#000000" ariaLabel={t("canvas.ps.colorForeground")} onChange={onForeground} />
            </div>
        </div>
    );
}

function PsBrushPreviewCanvas({ brush, color }: { brush: PsBrushPreset; color: string }) {
    const ref = useRef<HTMLCanvasElement>(null);
    useEffect(() => {
        if (ref.current) psBrushPreview(ref.current, { ...brush, tolerance: 0, color }, color);
    }, [brush, color]);
    return <canvas ref={ref} width={148} height={28} className="pointer-events-none" />;
}

export function PsBrushesPanel({ brush, color, onChange }: { brush: PsBrushPreset; color: string; onChange: (preset: PsBrushPreset) => void }) {
    const { t } = useTranslation();
    const theme = useCanvasTheme();
    const brushes = usePsAssetStore((state) => state.brushes);
    const saveBrush = usePsAssetStore((state) => state.saveBrush);
    const removeBrush = usePsAssetStore((state) => state.removeBrush);
    const [editingId, setEditingId] = useState("");
    const [name, setName] = useState("");
    const slider = (key: keyof PsBrushPreset, labelKey: string, min: number, max: number, suffix = "", scale = 1) => (
        <div className={ROW_CLASS} key={key}>
            <span className={LABEL_CLASS} style={{ color: theme.node.label }}>
                {t(labelKey)}
            </span>
            <Slider className="!mx-0 min-w-0 flex-1" min={min} max={max} value={Math.round((brush[key] as number) * scale)} ariaLabelForHandle={t(labelKey)} onChange={(value) => onChange({ ...brush, [key]: value / scale })} />
            <span className={VALUE_CLASS} style={{ color: theme.node.text }}>
                {Math.round((brush[key] as number) * scale)}
                {suffix}
            </span>
        </div>
    );

    return (
        <ImageSettingsTheme theme={theme}>
            <div className="thin-scrollbar min-h-0 flex-1 overflow-y-auto px-2 pb-2 text-sm" style={{ color: theme.node.text }}>
                {brushes.map((preset) => {
                    const active = preset.id === editingId;
                    return (
                        <div key={preset.id} className="flex items-center gap-1.5 border-b px-1 transition hover:bg-hover" style={active ? { background: theme.toolbar.activeBg, color: theme.toolbar.activeText, borderColor: theme.toolbar.border, boxShadow: `inset 2px 0 0 0 ${theme.node.accent}` } : { borderColor: theme.toolbar.border }}>
                            <button type="button" className="flex min-w-0 flex-1 items-center gap-1.5 py-0.5" aria-label={psBrushPresetName(preset)} title={psBrushPresetName(preset)} onClick={() => { setEditingId(preset.id); setName(psBrushPresetName(preset)); onChange(preset); }}>
                                {active ? <Check className="size-3 shrink-0" /> : <span className="size-3 shrink-0" />}
                                <PsBrushPreviewCanvas brush={preset} color={theme.node.text} />
                                <span className="min-w-0 flex-1 truncate text-left">{psBrushPresetName(preset)}</span>
                            </button>
                            <button type="button" className={FLAT_BUTTON_CLASS} style={{ color: "inherit" }} aria-label={t("canvas.ps.presetDelete")} title={t("canvas.ps.presetDelete")} onClick={() => removeBrush(preset.id)}>
                                <Trash2 className="size-3" />
                            </button>
                        </div>
                    );
                })}
                <div className="mt-1 border-t pt-1" style={{ borderColor: theme.toolbar.border }}>
                    {slider("size", "canvas.ps.brushSize", 1, 400, "px")}
                    {slider("hardness", "canvas.ps.brushHardness", 0, 100, "%", 100)}
                    {slider("opacity", "canvas.ps.brushOpacity", 1, 100, "%", 100)}
                    {slider("spacing", "canvas.ps.brushSpacing", 2, 100, "%", 100)}
                    {slider("scatter", "canvas.ps.brushScatter", 0, 100, "%", 100)}
                    {slider("angle", "canvas.ps.brushAngle", -180, 180, "°")}
                    {slider("roundness", "canvas.ps.brushRoundness", 5, 100, "%", 100)}
                    {slider("dynamics", "canvas.ps.brushDynamics", 0, 100, "%", 100)}
                    {slider("texture", "canvas.ps.brushTexture", 0, 100, "%", 100)}
                    <div className={ROW_CLASS}>
                        <Input size="small" value={name} maxLength={32} placeholder={t("canvas.ps.presetName")} aria-label={t("canvas.ps.presetName")} onChange={(event) => setName(event.target.value)} />
                        <button type="button" className={FLAT_BUTTON_CLASS} style={{ color: theme.node.text }} onClick={() => setEditingId(saveBrush({ ...brush, id: editingId || undefined, name: name.trim() || t("canvas.ps.brushNew") }))}>
                            <Save className="size-3" />
                            {t("canvas.ps.presetSave")}
                        </button>
                    </div>
                </div>
            </div>
        </ImageSettingsTheme>
    );
}

export function PsColorPanelBody({ foreground, background, onForeground, onBackground }: { foreground: string; background: string; onForeground: (hex: string) => void; onBackground: (hex: string) => void }) {
    const { t } = useTranslation();
    const theme = useCanvasTheme();
    const swatches = usePsAssetStore((state) => state.swatches);
    const addSwatch = usePsAssetStore((state) => state.addSwatch);
    const removeSwatch = usePsAssetStore((state) => state.removeSwatch);
    return (
        <ImageSettingsTheme theme={theme}>
            <div className="thin-scrollbar min-h-0 flex-1 overflow-y-auto px-2 py-1.5">
                <div className="flex min-w-0 flex-wrap items-start gap-x-4 gap-y-2">
                    <PsColorFields layout="row" value={foreground} onChange={onForeground} background={background} onBackground={onBackground} ariaLabel={t("canvas.ps.colorForeground")} />
                    <div className="min-w-[180px] flex-1">
                    <div className="flex items-center gap-1.5 pb-1">
                        <span className="min-w-0 flex-1 truncate text-sm" style={{ color: theme.node.label }}>
                            {t("canvas.ps.swatches")}
                        </span>
                        <button type="button" className={FLAT_BUTTON_CLASS} style={{ color: theme.node.text }} onClick={() => addSwatch(foreground)}>
                            <Plus className="size-3" />
                            {t("canvas.ps.swatchAdd")}
                        </button>
                    </div>
                    <div className="flex flex-wrap gap-1">
                        {swatches.map((color, index) => (
                            <button
                                key={`${color}-${index}`}
                                type="button"
                                className="size-5 shrink-0 rounded-md border"
                                style={{ background: color, borderColor: theme.toolbar.border }}
                                aria-label={color}
                                title={`${color} · ${t("canvas.ps.swatchRemoveHint")}`}
                                onClick={() => onForeground(color)}
                                onContextMenu={(event) => {
                                    event.preventDefault();
                                    removeSwatch(index);
                                }}
                            />
                        ))}
                    </div>
                    <p className="pt-1 text-xs" style={{ color: theme.node.muted }}>
                        {t("canvas.ps.swatchRemoveHint")}
                    </p>
                    </div>
                </div>
            </div>
        </ImageSettingsTheme>
    );
}
