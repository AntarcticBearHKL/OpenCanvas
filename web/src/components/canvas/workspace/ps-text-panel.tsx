import { useState, type Dispatch, type SetStateAction } from "react";
import { InputNumber, Segmented, Select, Slider, Switch } from "antd";
import { useTranslation } from "react-i18next";

import { ImageSettingsTheme } from "@/components/image-settings-panel";
import PsColorPicker from "@/components/canvas/workspace/ps-color-picker";
import { commitBoardLayers, patchPsLayer } from "@/components/canvas/workspace/ps-layer-ops";
import { useCanvasTheme } from "@/hooks/use-canvas-theme";
import { STUDIO_PANEL_LABEL_CLASS, STUDIO_PANEL_ROW_CLASS } from "@/components/canvas/workspace/studio-chrome";
import { PS_FONT_FAMILIES, PS_TEXT_ALIGNS, PS_TEXT_ALIGN_NAME_KEYS, PS_TEXT_CASES, PS_TEXT_CASE_NAME_KEYS, PS_TEXT_WARP_NAME_KEYS, PS_TEXT_WARP_STYLES, psTextFontSize, psTextParagraph, psTextWarpDefault } from "@/lib/canvas/ps-text";
import { psTextRenderStyle, smartCanvasLayers } from "@/lib/canvas/smart-canvas";
import type { CanvasNodeData, CanvasPsLayer, CanvasPsPath, CanvasPsTextCase, CanvasPsTextWarpStyle } from "@/types/canvas";

type PsTextPanelProps = { board: CanvasNodeData; setNodes: Dispatch<SetStateAction<CanvasNodeData[]>>; layer: CanvasPsLayer; paths: CanvasPsPath[] };

const ROW_CLASS = STUDIO_PANEL_ROW_CLASS;
const LABEL_CLASS = STUDIO_PANEL_LABEL_CLASS;
const TOGGLE_CLASS = "grid size-6 shrink-0 place-items-center rounded-md text-sm font-semibold transition hover:bg-hover";

export default function PsTextPanel({ board, setNodes, layer, paths }: PsTextPanelProps) {
    const { t } = useTranslation();
    const theme = useCanvasTheme();
    const [tab, setTab] = useState<"character" | "paragraph">("character");
    const layers = smartCanvasLayers(board);
    const commit = (patch: Partial<CanvasPsLayer>) => commitBoardLayers(setNodes, board.id, patchPsLayer(layers, layer.id, patch));
    const paragraph = psTextParagraph(layer);
    const number = (label: string, key: keyof CanvasPsLayer, min: number, max: number, fallback: number, suffix = "") => (
        <div className={ROW_CLASS} key={String(key)}>
            <span className={LABEL_CLASS} style={{ color: theme.node.label }}>
                {label}
            </span>
            <InputNumber size="small" className="min-w-0 flex-1" min={min} max={max} value={Math.round((layer[key] as number | undefined) ?? fallback)} aria-label={label} onChange={(value) => value !== null && commit({ [key]: value } as Partial<CanvasPsLayer>)} />
            {suffix ? (
                <span className="shrink-0 text-sm" style={{ color: theme.node.muted }}>
                    {suffix}
                </span>
            ) : null}
        </div>
    );
    const toggle = (label: string, active: boolean, onChange: (next: boolean) => void) => (
        <button key={label} type="button" className={TOGGLE_CLASS} style={active ? { background: theme.toolbar.activeBg, color: theme.toolbar.activeText } : { color: theme.node.muted }} aria-label={label} title={label} aria-pressed={active} onClick={() => onChange(!active)}>
            {label}
        </button>
    );

    return (
        <ImageSettingsTheme theme={theme}>
            <div className="border-t glass-card" style={{ borderColor: theme.toolbar.border }}>
                <div className="flex items-center gap-0.5 px-2 py-1">
                    {(["character", "paragraph"] as const).map((item) => (
                        <button
                            key={item}
                            type="button"
                            className="rounded-md px-1.5 py-0.5 text-sm transition hover:bg-hover"
                            style={tab === item ? { background: theme.node.accentSoft, color: theme.node.accent, boxShadow: `inset 0 0 0 1px ${theme.node.accent}` } : { color: theme.node.muted }}
                            onClick={() => setTab(item)}
                        >
                            {t(item === "character" ? "canvas.ps.character" : "canvas.ps.paragraph")}
                        </button>
                    ))}
                </div>
                {tab === "character" ? (
                    <div className="px-2 pb-2">
                        <div className={ROW_CLASS}>
                            <span className={LABEL_CLASS} style={{ color: theme.node.label }}>
                                {t("canvas.ps.fontFamily")}
                            </span>
                            <Select size="small" className="min-w-0 flex-1" value={layer.fontFamily || "sans-serif"} options={PS_FONT_FAMILIES.map((family) => ({ value: family, label: family }))} popupMatchSelectWidth={false} styles={{ popup: { root: { zIndex: 1300 } } }} aria-label={t("canvas.ps.fontFamily")} onChange={(value) => commit({ fontFamily: value })} />
                        </div>
                        <div className={ROW_CLASS}>
                            <span className={LABEL_CLASS} style={{ color: theme.node.label }}>
                                {t("canvas.ps.fontSize")}
                            </span>
                            <InputNumber size="small" className="min-w-0 flex-1" min={1} max={512} value={Math.round(psTextFontSize(layer))} aria-label={t("canvas.ps.fontSize")} onChange={(value) => value !== null && commit({ fontSize: value })} />
                            <PsColorPicker value={psTextRenderStyle(layer).color} ariaLabel={t("canvas.ps.color")} onChange={(hex) => commit({ color: hex })} />
                            <span className="flex shrink-0 items-center gap-0.5">
                                {toggle("B", Boolean(layer.fauxBold), (next) => commit({ fauxBold: next }))}
                                {toggle("I", Boolean(layer.fauxItalic), (next) => commit({ fauxItalic: next }))}
                                {toggle("U", Boolean(layer.underline), (next) => commit({ underline: next }))}
                                {toggle("S", Boolean(layer.strikethrough), (next) => commit({ strikethrough: next }))}
                            </span>
                        </div>
                        {number(t("canvas.ps.tracking"), "tracking", -1000, 5000, 0)}
                        {number(t("canvas.ps.kerning"), "kerning", -200, 500, 0)}
                        {number(t("canvas.ps.leading"), "leading", 0, 800, 0, "px")}
                        {number(t("canvas.ps.baselineShift"), "baselineShift", -400, 400, 0, "px")}
                        <div className={ROW_CLASS}>
                            <span className={LABEL_CLASS} style={{ color: theme.node.label }}>
                                {t("canvas.ps.textScale")}
                            </span>
                            <InputNumber size="small" className="min-w-0 flex-1" min={1} max={1000} value={Math.round(layer.textScaleX ?? 100)} aria-label={`${t("canvas.ps.textScale")} X`} onChange={(value) => value !== null && commit({ textScaleX: value })} />
                            <InputNumber size="small" className="min-w-0 flex-1" min={1} max={1000} value={Math.round(layer.textScaleY ?? 100)} aria-label={`${t("canvas.ps.textScale")} Y`} onChange={(value) => value !== null && commit({ textScaleY: value })} />
                        </div>
                        <div className={ROW_CLASS}>
                            <span className={LABEL_CLASS} style={{ color: theme.node.label }}>
                                {t("canvas.ps.textCase")}
                            </span>
                            <Select size="small" className="min-w-0 flex-1" value={layer.textCase || "none"} options={PS_TEXT_CASES.map((item) => ({ value: item, label: t(PS_TEXT_CASE_NAME_KEYS[item]) }))} popupMatchSelectWidth={false} styles={{ popup: { root: { zIndex: 1300 } } }} aria-label={t("canvas.ps.textCase")} onChange={(value: CanvasPsTextCase) => commit({ textCase: value })} />
                        </div>
                    </div>
                ) : (
                    <div className="px-2 pb-2">
                        <div className={ROW_CLASS}>
                            <span className={LABEL_CLASS} style={{ color: theme.node.label }}>
                                {t("canvas.ps.align")}
                            </span>
                            <Segmented
                                size="small"
                                value={paragraph.align}
                                options={PS_TEXT_ALIGNS.map((align) => ({ value: align, label: t(PS_TEXT_ALIGN_NAME_KEYS[align]) }))}
                                onChange={(value) => commit({ paragraph: { ...paragraph, align: value as typeof paragraph.align } })}
                            />
                        </div>
                        {[
                            { key: "indentLeft" as const, label: t("canvas.ps.indentLeft") },
                            { key: "indentRight" as const, label: t("canvas.ps.indentRight") },
                            { key: "indentFirst" as const, label: t("canvas.ps.indentFirst") },
                            { key: "spaceBefore" as const, label: t("canvas.ps.spaceBefore") },
                            { key: "spaceAfter" as const, label: t("canvas.ps.spaceAfter") },
                        ].map((item) => (
                            <div className={ROW_CLASS} key={item.key}>
                                <span className={LABEL_CLASS} style={{ color: theme.node.label }}>
                                    {item.label}
                                </span>
                                <InputNumber size="small" className="min-w-0 flex-1" min={0} max={800} value={paragraph[item.key]} aria-label={item.label} onChange={(value) => value !== null && commit({ paragraph: { ...paragraph, [item.key]: value } })} />
                            </div>
                        ))}
                        <div className={ROW_CLASS}>
                            <span className={LABEL_CLASS} style={{ color: theme.node.label }}>
                                {t("canvas.ps.hyphenate")}
                            </span>
                            <Switch size="small" checked={paragraph.hyphenate} onChange={(checked) => commit({ paragraph: { ...paragraph, hyphenate: checked } })} />
                        </div>
                    </div>
                )}
                <div className="border-t px-2 pb-2 pt-1" style={{ borderColor: theme.toolbar.border }}>
                    <div className={ROW_CLASS}>
                        <span className={LABEL_CLASS} style={{ color: theme.node.label }}>
                            {t("canvas.ps.textPath")}
                        </span>
                        <Select
                            size="small"
                            className="min-w-0 flex-1"
                            value={layer.textPathId || ""}
                            options={[{ value: "", label: t("canvas.ps.none") }, ...paths.map((path) => ({ value: path.id, label: path.name }))]}
                            popupMatchSelectWidth={false}
                            styles={{ popup: { root: { zIndex: 1300 } } }}
                            aria-label={t("canvas.ps.textPath")}
                            onChange={(value) => commit({ textPathId: value || undefined })}
                        />
                    </div>
                    <div className={ROW_CLASS}>
                        <span className={LABEL_CLASS} style={{ color: theme.node.label }}>
                            {t("canvas.ps.textWarp")}
                        </span>
                        <Select
                            size="small"
                            className="min-w-0 flex-1"
                            value={layer.textWarp?.style || ""}
                            options={[{ value: "", label: t("canvas.ps.none") }, ...PS_TEXT_WARP_STYLES.map((style) => ({ value: style, label: t(PS_TEXT_WARP_NAME_KEYS[style]) }))]}
                            popupMatchSelectWidth={false}
                            styles={{ popup: { root: { zIndex: 1300 } } }}
                            aria-label={t("canvas.ps.textWarp")}
                            onChange={(value: CanvasPsTextWarpStyle | "") => commit({ textWarp: value ? { ...psTextWarpDefault(), ...(layer.textWarp ?? {}), style: value } : undefined })}
                        />
                    </div>
                    {layer.textWarp ? (
                        <>
                            {[
                                { key: "bend" as const, label: t("canvas.ps.warpBend") },
                                { key: "horizontal" as const, label: t("canvas.ps.warpHorizontal") },
                                { key: "vertical" as const, label: t("canvas.ps.warpVertical") },
                            ].map((item) => (
                                <div className={ROW_CLASS} key={item.key}>
                                    <span className={LABEL_CLASS} style={{ color: theme.node.label }}>
                                        {item.label}
                                    </span>
                                    <Slider className="!mx-0 min-w-0 flex-1" min={-100} max={100} value={layer.textWarp?.[item.key] ?? 0} ariaLabelForHandle={item.label} onChange={(value) => commit({ textWarp: { ...(layer.textWarp ?? psTextWarpDefault()), [item.key]: value } })} />
                                    <span className="w-8 shrink-0 text-right text-xs tabular-nums" style={{ color: theme.node.text }}>
                                        {layer.textWarp?.[item.key] ?? 0}
                                    </span>
                                </div>
                            ))}
                        </>
                    ) : null}
                </div>
            </div>
        </ImageSettingsTheme>
    );
}
