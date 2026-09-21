import type { Dispatch, SetStateAction } from "react";
import { Checkbox, Modal, Select, Slider } from "antd";
import { useTranslation } from "react-i18next";

import { ImageSettingsTheme } from "@/components/image-settings-panel";
import PsColorPicker from "@/components/canvas/workspace/ps-color-picker";
import { PsGradientStopsEditor } from "@/components/canvas/workspace/ps-param-editors";
import { commitBoardLayers, ensurePsLayerStyle, patchPsLayerStyle } from "@/components/canvas/workspace/ps-layer-ops";
import { useCanvasTheme } from "@/hooks/use-canvas-theme";
import { STUDIO_PANEL_LABEL_CLASS, STUDIO_PANEL_ROW_CLASS, STUDIO_PANEL_VALUE_CLASS } from "@/components/canvas/workspace/studio-chrome";
import { CANVAS_BLEND_MODES } from "@/lib/canvas/blend-modes";
import { PS_LAYER_STYLE_DEFAULTS, PS_LAYER_STYLE_NAME_KEYS, PS_LAYER_STYLE_TYPES, PS_PATTERN_KINDS } from "@/lib/canvas/ps-layer-styles";
import { smartCanvasLayers } from "@/lib/canvas/smart-canvas";
import { usePsAssetStore } from "@/stores/use-ps-asset-store";
import type { CanvasNodeData, CanvasPsLayer, CanvasPsLayerStyleType, CanvasPsParamValue } from "@/types/canvas";

type PsFxPanelProps = {
    board: CanvasNodeData;
    setNodes: Dispatch<SetStateAction<CanvasNodeData[]>>;
    layer: CanvasPsLayer | null;
    onClose: () => void;
};

type StyleControl =
    | { kind: "slider"; key: string; labelKey: string; min: number; max: number; suffix?: string; step?: number }
    | { kind: "select"; key: string; labelKey: string; options: { value: string; labelKey: string }[] }
    | { kind: "color"; key: string; labelKey: string }
    | { kind: "checkbox"; key: string; labelKey: string }
    | { kind: "pattern"; key: string; labelKey: string }
    | { kind: "gradient"; key: string; labelKey: string };

const ROW_CLASS = STUDIO_PANEL_ROW_CLASS;
const LABEL_CLASS = STUDIO_PANEL_LABEL_CLASS;
const VALUE_CLASS = "w-10 shrink-0 text-right text-[11px] tabular-nums";
const BLEND_OPTIONS = CANVAS_BLEND_MODES.map((mode) => ({ value: mode.id, labelKey: `canvas.blendModes.${mode.id}` }));
const POSITION_OPTIONS = [
    { value: "outside", labelKey: "canvas.ps.fx.optOutside" },
    { value: "inside", labelKey: "canvas.ps.fx.optInside" },
    { value: "center", labelKey: "canvas.ps.fx.optCenter" },
];

const STYLE_CONTROLS: Record<CanvasPsLayerStyleType, StyleControl[]> = {
    stroke: [
        { kind: "slider", key: "size", labelKey: "canvas.ps.fx.size", min: 1, max: 250, suffix: "px" },
        { kind: "select", key: "position", labelKey: "canvas.ps.fx.position", options: POSITION_OPTIONS },
        { kind: "color", key: "color", labelKey: "canvas.ps.fx.color" },
        { kind: "slider", key: "opacity", labelKey: "canvas.ps.opacity", min: 0, max: 100, suffix: "%" },
        { kind: "select", key: "blendMode", labelKey: "canvas.ps.blendMode", options: BLEND_OPTIONS },
    ],
    "drop-shadow": [
        { kind: "color", key: "color", labelKey: "canvas.ps.fx.color" },
        { kind: "slider", key: "opacity", labelKey: "canvas.ps.opacity", min: 0, max: 100, suffix: "%" },
        { kind: "slider", key: "angle", labelKey: "canvas.ps.angle", min: -180, max: 180, suffix: "°" },
        { kind: "slider", key: "distance", labelKey: "canvas.ps.fx.distance", min: 0, max: 250, suffix: "px" },
        { kind: "slider", key: "spread", labelKey: "canvas.ps.fx.spread", min: 0, max: 100, suffix: "%" },
        { kind: "slider", key: "size", labelKey: "canvas.ps.fx.size", min: 0, max: 250, suffix: "px" },
        { kind: "select", key: "blendMode", labelKey: "canvas.ps.blendMode", options: BLEND_OPTIONS },
    ],
    "inner-shadow": [
        { kind: "color", key: "color", labelKey: "canvas.ps.fx.color" },
        { kind: "slider", key: "opacity", labelKey: "canvas.ps.opacity", min: 0, max: 100, suffix: "%" },
        { kind: "slider", key: "angle", labelKey: "canvas.ps.angle", min: -180, max: 180, suffix: "°" },
        { kind: "slider", key: "distance", labelKey: "canvas.ps.fx.distance", min: 0, max: 250, suffix: "px" },
        { kind: "slider", key: "spread", labelKey: "canvas.ps.fx.spread", min: 0, max: 100, suffix: "%" },
        { kind: "slider", key: "size", labelKey: "canvas.ps.fx.size", min: 0, max: 250, suffix: "px" },
        { kind: "select", key: "blendMode", labelKey: "canvas.ps.blendMode", options: BLEND_OPTIONS },
    ],
    "outer-glow": [
        { kind: "color", key: "color", labelKey: "canvas.ps.fx.color" },
        { kind: "slider", key: "opacity", labelKey: "canvas.ps.opacity", min: 0, max: 100, suffix: "%" },
        { kind: "slider", key: "spread", labelKey: "canvas.ps.fx.spread", min: 0, max: 100, suffix: "%" },
        { kind: "slider", key: "size", labelKey: "canvas.ps.fx.size", min: 0, max: 250, suffix: "px" },
        { kind: "select", key: "blendMode", labelKey: "canvas.ps.blendMode", options: BLEND_OPTIONS },
    ],
    "inner-glow": [
        { kind: "color", key: "color", labelKey: "canvas.ps.fx.color" },
        { kind: "slider", key: "opacity", labelKey: "canvas.ps.opacity", min: 0, max: 100, suffix: "%" },
        { kind: "slider", key: "spread", labelKey: "canvas.ps.fx.spread", min: 0, max: 100, suffix: "%" },
        { kind: "slider", key: "size", labelKey: "canvas.ps.fx.size", min: 0, max: 250, suffix: "px" },
        { kind: "select", key: "blendMode", labelKey: "canvas.ps.blendMode", options: BLEND_OPTIONS },
    ],
    bevel: [
        { kind: "select", key: "style", labelKey: "canvas.ps.fx.style", options: [{ value: "inner", labelKey: "canvas.ps.fx.optInner" }, { value: "emboss", labelKey: "canvas.ps.fx.optEmboss" }, { value: "outer", labelKey: "canvas.ps.fx.optOuter" }] },
        { kind: "select", key: "direction", labelKey: "canvas.ps.fx.direction", options: [{ value: "up", labelKey: "canvas.ps.fx.optUp" }, { value: "down", labelKey: "canvas.ps.fx.optDown" }] },
        { kind: "slider", key: "depth", labelKey: "canvas.ps.fx.depth", min: 1, max: 1000, suffix: "%" },
        { kind: "slider", key: "size", labelKey: "canvas.ps.fx.size", min: 0, max: 250, suffix: "px" },
        { kind: "slider", key: "soften", labelKey: "canvas.ps.fx.soften", min: 0, max: 100, suffix: "px" },
        { kind: "slider", key: "angle", labelKey: "canvas.ps.angle", min: -180, max: 180, suffix: "°" },
        { kind: "color", key: "highlightColor", labelKey: "canvas.ps.fx.highlightColor" },
        { kind: "slider", key: "highlightOpacity", labelKey: "canvas.ps.fx.highlightOpacity", min: 0, max: 100, suffix: "%" },
        { kind: "color", key: "shadowColor", labelKey: "canvas.ps.fx.shadowColor" },
        { kind: "slider", key: "shadowOpacity", labelKey: "canvas.ps.fx.shadowOpacity", min: 0, max: 100, suffix: "%" },
    ],
    satin: [
        { kind: "color", key: "color", labelKey: "canvas.ps.fx.color" },
        { kind: "slider", key: "opacity", labelKey: "canvas.ps.opacity", min: 0, max: 100, suffix: "%" },
        { kind: "slider", key: "angle", labelKey: "canvas.ps.angle", min: -180, max: 180, suffix: "°" },
        { kind: "slider", key: "distance", labelKey: "canvas.ps.fx.distance", min: 0, max: 250, suffix: "px" },
        { kind: "slider", key: "size", labelKey: "canvas.ps.fx.size", min: 0, max: 250, suffix: "px" },
        { kind: "select", key: "blendMode", labelKey: "canvas.ps.blendMode", options: BLEND_OPTIONS },
    ],
    "color-overlay": [
        { kind: "color", key: "color", labelKey: "canvas.ps.fx.color" },
        { kind: "slider", key: "opacity", labelKey: "canvas.ps.opacity", min: 0, max: 100, suffix: "%" },
        { kind: "select", key: "blendMode", labelKey: "canvas.ps.blendMode", options: BLEND_OPTIONS },
    ],
    "gradient-overlay": [
        { kind: "gradient", key: "stops", labelKey: "canvas.ps.adjust.gradientStops" },
        { kind: "slider", key: "angle", labelKey: "canvas.ps.angle", min: -180, max: 180, suffix: "°" },
        { kind: "slider", key: "scale", labelKey: "canvas.ps.fx.scale", min: 10, max: 300, suffix: "%" },
        { kind: "checkbox", key: "reverse", labelKey: "canvas.ps.gradientReverse" },
        { kind: "slider", key: "opacity", labelKey: "canvas.ps.opacity", min: 0, max: 100, suffix: "%" },
        { kind: "select", key: "blendMode", labelKey: "canvas.ps.blendMode", options: BLEND_OPTIONS },
    ],
    "pattern-overlay": [
        { kind: "select", key: "pattern", labelKey: "canvas.ps.fx.pattern", options: PS_PATTERN_KINDS.map((kind) => ({ value: kind, labelKey: `canvas.ps.fx.pattern${kind[0].toUpperCase()}${kind.slice(1)}` })) },
        { kind: "pattern", key: "patternKey", labelKey: "canvas.ps.fx.patternSaved" },
        { kind: "slider", key: "scale", labelKey: "canvas.ps.fx.scale", min: 10, max: 300, suffix: "%" },
        { kind: "slider", key: "angle", labelKey: "canvas.ps.angle", min: -180, max: 180, suffix: "°" },
        { kind: "slider", key: "opacity", labelKey: "canvas.ps.opacity", min: 0, max: 100, suffix: "%" },
        { kind: "select", key: "blendMode", labelKey: "canvas.ps.blendMode", options: BLEND_OPTIONS },
    ],
};

export default function PsFxPanel({ board, setNodes, layer, onClose }: PsFxPanelProps) {
    const { t } = useTranslation();
    const theme = useCanvasTheme();
    const layers = smartCanvasLayers(board);
    const styles = layer?.styles || [];
    const commit = (next: CanvasPsLayer[]) => commitBoardLayers(setNodes, board.id, next);
    return (
        <Modal open={Boolean(layer)} title={t("canvas.ps.fxTitle")} footer={null} width={380} onCancel={onClose}>
            <ImageSettingsTheme theme={theme}>
                {layer ? (
                    <div className="thin-scrollbar max-h-[65vh] overflow-y-auto pr-1">
                        {PS_LAYER_STYLE_TYPES.map((type) => {
                            const style = styles.find((item) => item.type === type);
                            return (
                                <div key={type} className="border-b py-1 last:border-b-0" style={{ borderColor: theme.toolbar.border }}>
                                    <div className="flex items-center py-0.5 text-xs" style={{ color: theme.node.text }}>
                                        <Checkbox
                                            checked={Boolean(style?.enabled)}
                                            aria-label={t(PS_LAYER_STYLE_NAME_KEYS[type])}
                                            onChange={(event) => commit(style ? patchPsLayerStyle(layers, layer.id, style.id, { enabled: event.target.checked }) : ensurePsLayerStyle(layers, layer.id, type))}
                                        >
                                            {t(PS_LAYER_STYLE_NAME_KEYS[type])}
                                        </Checkbox>
                                    </div>
                                    {style?.enabled ? (
                                        <div className="pl-6">
                                            {STYLE_CONTROLS[type].map((control) => (
                                                <StyleControlRow
                                                    key={control.key}
                                                    control={control}
                                                    value={style.params[control.key] ?? PS_LAYER_STYLE_DEFAULTS[type][control.key]}
                                                    onChange={(value) => commit(patchPsLayerStyle(layers, layer.id, style.id, { params: { [control.key]: value } }))}
                                                />
                                            ))}
                                        </div>
                                    ) : null}
                                </div>
                            );
                        })}
                    </div>
                ) : null}
            </ImageSettingsTheme>
        </Modal>
    );
}

function StyleControlRow({ control, value, onChange }: { control: StyleControl; value: CanvasPsParamValue; onChange: (value: CanvasPsParamValue) => void }) {
    const { t } = useTranslation();
    const theme = useCanvasTheme();
    const patterns = usePsAssetStore((state) => state.patterns);
    const label = (
        <span className={LABEL_CLASS} style={{ color: theme.node.muted }}>
            {t(control.labelKey)}
        </span>
    );
    if (control.kind === "slider") {
        const current = typeof value === "number" ? value : control.min;
        return (
            <div className={ROW_CLASS} style={{ color: theme.node.muted }}>
                {label}
                <Slider className="!mx-0 min-w-0 flex-1" min={control.min} max={control.max} step={control.step ?? 1} value={current} tooltip={{ formatter: (input) => `${input}${control.suffix || ""}` }} ariaLabelForHandle={t(control.labelKey)} onChange={onChange} />
                <span className={VALUE_CLASS} style={{ color: theme.node.text }}>
                    {current}
                    {control.suffix || ""}
                </span>
            </div>
        );
    }
    if (control.kind === "select") {
        const current = typeof value === "string" ? value : control.options[0].value;
        return (
            <div className={ROW_CLASS} style={{ color: theme.node.muted }}>
                {label}
                <Select
                    size="small"
                    className="min-w-0 flex-1"
                    value={current}
                    options={control.options.map((option) => ({ value: option.value, label: t(option.labelKey) }))}
                    popupMatchSelectWidth={false}
                    styles={{ popup: { root: { zIndex: 1300 } } }}
                    aria-label={t(control.labelKey)}
                    onChange={onChange}
                />
            </div>
        );
    }
    if (control.kind === "pattern") {
        const current = typeof value === "string" ? value : "";
        return (
            <div className={ROW_CLASS} style={{ color: theme.node.muted }}>
                {label}
                <Select
                    size="small"
                    className="min-w-0 flex-1"
                    value={current}
                    options={[{ value: "", label: t("canvas.ps.none") }, ...patterns.map((pattern) => ({ value: pattern.storageKey, label: pattern.name }))]}
                    popupMatchSelectWidth={false}
                    styles={{ popup: { root: { zIndex: 1300 } } }}
                    aria-label={t(control.labelKey)}
                    onChange={onChange}
                />
            </div>
        );
    }
    if (control.kind === "color") {
        const current = typeof value === "string" ? value : "#000000";
        return (
            <div className={ROW_CLASS} style={{ color: theme.node.muted }}>
                {label}
                <PsColorPicker value={current} ariaLabel={t(control.labelKey)} onChange={onChange} />
            </div>
        );
    }
    if (control.kind === "checkbox") {
        return (
            <div className={ROW_CLASS} style={{ color: theme.node.muted }}>
                {label}
                <Checkbox checked={typeof value === "number" ? value >= 0.5 : Boolean(value)} aria-label={t(control.labelKey)} onChange={(event) => onChange(event.target.checked ? 1 : 0)} />
            </div>
        );
    }
    const stops = Array.isArray(value) && typeof value[0] === "string" ? (value as string[]) : ["#000000@0", "#ffffff@1"];
    return (
        <div className="py-0.5">
            <span className="text-[11px]" style={{ color: theme.node.muted }}>
                {t(control.labelKey)}
            </span>
            <PsGradientStopsEditor stops={stops} theme={theme} onChange={onChange} />
        </div>
    );
}
