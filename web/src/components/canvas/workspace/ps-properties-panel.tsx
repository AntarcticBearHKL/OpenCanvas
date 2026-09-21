import { type Dispatch, type SetStateAction } from "react";
import { Input, InputNumber, Select, Slider } from "antd";
import { SlidersHorizontal } from "lucide-react";
import { useTranslation } from "react-i18next";

import { ImageSettingsTheme } from "@/components/image-settings-panel";
import PsAdjustmentEditor from "@/components/canvas/workspace/ps-adjustment-editor";
import PsColorPicker from "@/components/canvas/workspace/ps-color-picker";
import { commitBoardLayers, patchPsLayer, scalePsLayer, translatePsLayer } from "@/components/canvas/workspace/ps-layer-ops";
import { psBakeMask } from "@/components/canvas/workspace/ps-paint";
import { useCanvasTheme } from "@/hooks/use-canvas-theme";
import { STUDIO_FLAT_BUTTON_CLASS, STUDIO_PANEL_LABEL_CLASS, STUDIO_PANEL_ROW_CLASS } from "@/components/canvas/workspace/studio-chrome";
import { CANVAS_BLEND_MODES } from "@/lib/canvas/blend-modes";
import { PS_ADJUSTMENT_NAME_KEYS } from "@/lib/canvas/ps-adjustments";
import { PS_SHAPE_KINDS, psLayerBox, psTextRenderStyle, smartCanvasLayers } from "@/lib/canvas/smart-canvas";
import { resolveImageUrl, uploadImage } from "@/services/image-storage";
import type { CanvasNodeData, CanvasPsLayer, CanvasPsShapeKind } from "@/types/canvas";

type PsPropertiesPanelProps = {
    board: CanvasNodeData;
    setNodes: Dispatch<SetStateAction<CanvasNodeData[]>>;
    selected: CanvasPsLayer | null;
    onAddMask: () => void;
};

const FIELD_CLASS = STUDIO_PANEL_ROW_CLASS;
const FLAT_BUTTON_CLASS = STUDIO_FLAT_BUTTON_CLASS;
const SHAPE_LABELS: Record<CanvasPsShapeKind, string> = { rectangle: "canvas.ps.shapeRectangle", "rounded-rectangle": "canvas.ps.shapeRounded", ellipse: "canvas.ps.shapeEllipse", polygon: "canvas.ps.shapePolygon", line: "canvas.ps.shapeLine" };

export default function PsPropertiesPanel({ board, setNodes, selected, onAddMask }: PsPropertiesPanelProps) {
    const { t } = useTranslation();
    const theme = useCanvasTheme();
    const layers = smartCanvasLayers(board);
    const blendOptions = CANVAS_BLEND_MODES.map((mode) => ({ value: mode.id, label: t(`canvas.blendModes.${mode.id}`) }));
    const box = selected ? psLayerBox(layers, selected) : null;
    const shapeOptions = PS_SHAPE_KINDS.map((kind) => ({ value: kind, label: t(SHAPE_LABELS[kind]) }));

    const applyMask = async () => {
        if (!selected?.storageKey || !selected.maskStorageKey) return;
        const [sourceUrl, maskUrl] = await Promise.all([resolveImageUrl(selected.storageKey), resolveImageUrl(selected.maskStorageKey)]);
        if (!sourceUrl || !maskUrl) return;
        const blob = await psBakeMask(selected, sourceUrl, maskUrl);
        if (!blob) return;
        const uploaded = await uploadImage(blob);
        if (!uploaded.storageKey) return;
        commitBoardLayers(setNodes, board.id, patchPsLayer(layers, selected.id, { storageKey: uploaded.storageKey, maskStorageKey: undefined }));
    };

    return (
        <section className="flex min-h-0 flex-1 flex-col">
            <div className="flex shrink-0 items-center gap-1 px-2 py-1.5">
                <SlidersHorizontal className="size-3.5 shrink-0" style={{ color: theme.node.muted }} />
                <span className="min-w-0 flex-1 truncate text-xs font-medium">{t("canvas.ps.properties")}</span>
            </div>
            {!selected || !box ? (
                <p className="px-3 pb-3 text-[11px]" style={{ color: theme.node.placeholder }}>
                    {t("canvas.ps.selectionNone")}
                </p>
            ) : (
                <ImageSettingsTheme theme={theme}>
                    <div className="thin-scrollbar min-h-0 flex-1 overflow-y-auto px-2 pb-2">
                        <div className={FIELD_CLASS}>
                            <span className={STUDIO_PANEL_LABEL_CLASS} style={{ color: theme.node.muted }}>
                                {t("canvas.ps.name")}
                            </span>
                            <Input size="small" value={selected.name} maxLength={64} onChange={(event) => commitBoardLayers(setNodes, board.id, patchPsLayer(layers, selected.id, { name: event.target.value }))} />
                        </div>

                        {selected.kind === "adjustment" ? (
                            <div className="border-b py-1" style={{ borderColor: theme.toolbar.border }}>
                                <span className="text-[11px]" style={{ color: theme.node.muted }}>
                                    {t(selected.adjustment ? PS_ADJUSTMENT_NAME_KEYS[selected.adjustment] : "canvas.ps.adjustments")}
                                </span>
                                {selected.adjustment ? (
                                    <PsAdjustmentEditor
                                        type={selected.adjustment}
                                        params={selected.adjustmentParams || {}}
                                        onChange={(patch) => commitBoardLayers(setNodes, board.id, patchPsLayer(layers, selected.id, { adjustmentParams: { ...selected.adjustmentParams, ...patch } }))}
                                    />
                                ) : null}
                            </div>
                        ) : (
                            <>
                                <div className={FIELD_CLASS}>
                                    <span className={STUDIO_PANEL_LABEL_CLASS} style={{ color: theme.node.muted }}>
                                        {t("canvas.ps.position")}
                                    </span>
                                    <InputNumber size="small" className="min-w-0 flex-1" value={Math.round(box.x)} aria-label={`${t("canvas.ps.position")} X`} onChange={(value) => value !== null && commitBoardLayers(setNodes, board.id, translatePsLayer(layers, selected.id, value - box.x, 0))} />
                                    <InputNumber size="small" className="min-w-0 flex-1" value={Math.round(box.y)} aria-label={`${t("canvas.ps.position")} Y`} onChange={(value) => value !== null && commitBoardLayers(setNodes, board.id, translatePsLayer(layers, selected.id, 0, value - box.y))} />
                                </div>

                                <div className={FIELD_CLASS}>
                                    <span className={STUDIO_PANEL_LABEL_CLASS} style={{ color: theme.node.muted }}>
                                        {t("canvas.ps.size")}
                                    </span>
                                    <InputNumber size="small" className="min-w-0 flex-1" min={1} value={Math.round(box.width)} aria-label={`${t("canvas.ps.size")} W`} onChange={(value) => value !== null && commitBoardLayers(setNodes, board.id, scalePsLayer(layers, selected.id, Math.max(1, value) / Math.max(1, box.width), 1, box))} />
                                    <InputNumber size="small" className="min-w-0 flex-1" min={1} value={Math.round(box.height)} aria-label={`${t("canvas.ps.size")} H`} onChange={(value) => value !== null && commitBoardLayers(setNodes, board.id, scalePsLayer(layers, selected.id, 1, Math.max(1, value) / Math.max(1, box.height), box))} />
                                </div>

                                <div className={FIELD_CLASS}>
                                    <span className={STUDIO_PANEL_LABEL_CLASS} style={{ color: theme.node.muted }}>
                                        {t("canvas.ps.rotation")}
                                    </span>
                                    <InputNumber size="small" className="min-w-0 flex-1" value={Math.round(selected.rotation)} disabled={selected.kind === "group"} aria-label={t("canvas.ps.rotation")} onChange={(value) => value !== null && commitBoardLayers(setNodes, board.id, patchPsLayer(layers, selected.id, { rotation: value }))} />
                                </div>
                            </>
                        )}

                        <div className={FIELD_CLASS}>
                            <span className={STUDIO_PANEL_LABEL_CLASS} style={{ color: theme.node.muted }}>
                                {t("canvas.ps.blendMode")}
                            </span>
                            <Select size="small" className="min-w-0 flex-1" value={selected.blendMode} options={blendOptions} popupMatchSelectWidth={false} styles={{ popup: { root: { zIndex: 1300 } } }} aria-label={t("canvas.ps.blendMode")} onChange={(value) => commitBoardLayers(setNodes, board.id, patchPsLayer(layers, selected.id, { blendMode: value }))} />
                        </div>

                        <div className={FIELD_CLASS}>
                            <span className={STUDIO_PANEL_LABEL_CLASS} style={{ color: theme.node.muted }}>
                                {t("canvas.ps.opacity")}
                            </span>
                            <Slider className="!mx-0 min-w-0 flex-1" min={0} max={100} step={1} value={Math.round(selected.opacity * 100)} tooltip={{ formatter: (value) => `${value}%` }} ariaLabelForHandle={t("canvas.ps.opacity")} onChange={(value) => commitBoardLayers(setNodes, board.id, patchPsLayer(layers, selected.id, { opacity: value / 100 }))} />
                            <span className="w-8 shrink-0 text-right text-[11px] tabular-nums" style={{ color: theme.node.muted }}>
                                {Math.round(selected.opacity * 100)}%
                            </span>
                        </div>

                        <div className={FIELD_CLASS}>
                            <span className={STUDIO_PANEL_LABEL_CLASS} style={{ color: theme.node.muted }}>
                                {t("canvas.ps.mask")}
                            </span>
                            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-0.5">
                                {selected.maskStorageKey ? (
                                    <>
                                        <button type="button" className={FLAT_BUTTON_CLASS} style={{ color: theme.node.text }} disabled={!selected.storageKey} onClick={() => void applyMask()}>
                                            {t("canvas.ps.applyMask")}
                                        </button>
                                        <button type="button" className={FLAT_BUTTON_CLASS} style={{ color: theme.node.muted }} onClick={() => commitBoardLayers(setNodes, board.id, patchPsLayer(layers, selected.id, { maskStorageKey: undefined }))}>
                                            {t("canvas.ps.deleteMask")}
                                        </button>
                                    </>
                                ) : (
                                    <button type="button" className={FLAT_BUTTON_CLASS} style={{ color: theme.node.text }} disabled={selected.kind === "group"} onClick={onAddMask}>
                                        {t("canvas.ps.addMask")}
                                    </button>
                                )}
                            </div>
                        </div>

                        {selected.kind === "shape" ? (
                            <>
                                <div className={FIELD_CLASS}>
                                    <span className={STUDIO_PANEL_LABEL_CLASS} style={{ color: theme.node.muted }}>
                                        {t("canvas.ps.shapeType")}
                                    </span>
                                    <Select size="small" className="min-w-0 flex-1" value={selected.shape || "rectangle"} options={shapeOptions} popupMatchSelectWidth={false} styles={{ popup: { root: { zIndex: 1300 } } }} aria-label={t("canvas.ps.shapeType")} onChange={(value) => commitBoardLayers(setNodes, board.id, patchPsLayer(layers, selected.id, { shape: value }))} />
                                </div>
                                <div className={FIELD_CLASS}>
                                    <span className={STUDIO_PANEL_LABEL_CLASS} style={{ color: theme.node.muted }}>
                                        {t("canvas.ps.shapeFill")}
                                    </span>
                                    <PsColorPicker value={selected.shapeFill || "#000000"} ariaLabel={t("canvas.ps.shapeFill")} onChange={(hex) => commitBoardLayers(setNodes, board.id, patchPsLayer(layers, selected.id, { shapeFill: hex }))} />
                                </div>
                                <div className={FIELD_CLASS}>
                                    <span className={STUDIO_PANEL_LABEL_CLASS} style={{ color: theme.node.muted }}>
                                        {t("canvas.ps.shapeStroke")}
                                    </span>
                                    <PsColorPicker value={selected.shapeStroke || "#000000"} ariaLabel={t("canvas.ps.shapeStroke")} onChange={(hex) => commitBoardLayers(setNodes, board.id, patchPsLayer(layers, selected.id, { shapeStroke: hex }))} />
                                </div>
                                <div className={FIELD_CLASS}>
                                    <span className={STUDIO_PANEL_LABEL_CLASS} style={{ color: theme.node.muted }}>
                                        {t("canvas.ps.shapeStrokeWidth")}
                                    </span>
                                    <InputNumber size="small" className="min-w-0 flex-1" min={0} max={64} value={Math.round(selected.shapeStrokeWidth || 0)} aria-label={t("canvas.ps.shapeStrokeWidth")} onChange={(value) => value !== null && commitBoardLayers(setNodes, board.id, patchPsLayer(layers, selected.id, { shapeStrokeWidth: value }))} />
                                </div>
                                {selected.shape === "rounded-rectangle" ? (
                                    <div className={FIELD_CLASS}>
                                        <span className={STUDIO_PANEL_LABEL_CLASS} style={{ color: theme.node.muted }}>
                                            {t("canvas.ps.shapeRadius")}
                                        </span>
                                        <InputNumber size="small" className="min-w-0 flex-1" min={0} max={512} value={Math.round(selected.shapeRadius ?? 24)} aria-label={t("canvas.ps.shapeRadius")} onChange={(value) => value !== null && commitBoardLayers(setNodes, board.id, patchPsLayer(layers, selected.id, { shapeRadius: value }))} />
                                    </div>
                                ) : null}
                                {selected.shape === "polygon" ? (
                                    <div className={FIELD_CLASS}>
                                        <span className={STUDIO_PANEL_LABEL_CLASS} style={{ color: theme.node.muted }}>
                                            {t("canvas.ps.shapeSides")}
                                        </span>
                                        <InputNumber size="small" className="min-w-0 flex-1" min={3} max={24} value={Math.round(selected.shapeSides ?? 6)} aria-label={t("canvas.ps.shapeSides")} onChange={(value) => value !== null && commitBoardLayers(setNodes, board.id, patchPsLayer(layers, selected.id, { shapeSides: value }))} />
                                    </div>
                                ) : null}
                            </>
                        ) : null}

                        {selected.kind === "text" ? (
                            <>
                                <div className="py-1">
                                    <span className="text-[11px]" style={{ color: theme.node.muted }}>
                                        {t("canvas.ps.textContent")}
                                    </span>
                                    <Input.TextArea rows={3} className="mt-1" value={selected.text || ""} onChange={(event) => commitBoardLayers(setNodes, board.id, patchPsLayer(layers, selected.id, { text: event.target.value }))} />
                                </div>
                                <div className={FIELD_CLASS}>
                                    <span className={STUDIO_PANEL_LABEL_CLASS} style={{ color: theme.node.muted }}>
                                        {t("canvas.ps.fontSize")}
                                    </span>
                                    <InputNumber size="small" className="min-w-0 flex-1" min={1} value={Math.round(psTextRenderStyle(selected).fontSize)} aria-label={t("canvas.ps.fontSize")} onChange={(value) => value !== null && commitBoardLayers(setNodes, board.id, patchPsLayer(layers, selected.id, { fontSize: value }))} />
                                </div>
                                <div className={FIELD_CLASS}>
                                    <span className={STUDIO_PANEL_LABEL_CLASS} style={{ color: theme.node.muted }}>
                                        {t("canvas.ps.color")}
                                    </span>
                                    <PsColorPicker value={psTextRenderStyle(selected).color} ariaLabel={t("canvas.ps.color")} onChange={(hex) => commitBoardLayers(setNodes, board.id, patchPsLayer(layers, selected.id, { color: hex }))} />
                                </div>
                            </>
                        ) : null}
                    </div>
                </ImageSettingsTheme>
            )}
        </section>
    );
}
