import { type ReactNode } from "react";
import { Select, Slider, Switch } from "antd";
import { useTranslation } from "react-i18next";

import { PsCurveEditor, PsGradientStopsEditor } from "@/components/canvas/workspace/ps-param-editors";
import PsColorPicker from "@/components/canvas/workspace/ps-color-picker";
import { useCanvasTheme } from "@/hooks/use-canvas-theme";
import { STUDIO_PANEL_LABEL_CLASS, STUDIO_PANEL_ROW_CLASS, STUDIO_PANEL_VALUE_CLASS } from "@/components/canvas/workspace/studio-chrome";
import { PS_CHANNEL_MIXER_DEFAULT, PS_CURVE_IDENTITY, PS_GRADIENT_MAP_DEFAULT } from "@/lib/canvas/ps-adjustments";
import type { CanvasPsAdjustmentType, CanvasPsParamValue } from "@/types/canvas";

type PsAdjustmentEditorProps = {
    type: CanvasPsAdjustmentType;
    params: Record<string, CanvasPsParamValue>;
    onChange: (patch: Record<string, CanvasPsParamValue>) => void;
};

const ROW_CLASS = STUDIO_PANEL_ROW_CLASS;
const LABEL_CLASS = STUDIO_PANEL_LABEL_CLASS;
const VALUE_CLASS = "w-9 shrink-0 text-right text-sm tabular-nums";
const number = (params: Record<string, CanvasPsParamValue>, key: string, fallback: number) => (typeof params[key] === "number" ? (params[key] as number) : fallback);
const text = (params: Record<string, CanvasPsParamValue>, key: string, fallback: string) => (typeof params[key] === "string" ? (params[key] as string) : fallback);
const numbers = (params: Record<string, CanvasPsParamValue>, key: string, fallback: number[]) => (Array.isArray(params[key]) && typeof params[key][0] !== "string" ? (params[key] as number[]) : fallback);
const strings = (params: Record<string, CanvasPsParamValue>, key: string, fallback: string[]) => (Array.isArray(params[key]) && typeof params[key][0] === "string" ? (params[key] as string[]) : fallback);

export default function PsAdjustmentEditor({ type, params, onChange }: PsAdjustmentEditorProps) {
    const { t } = useTranslation();
    const theme = useCanvasTheme();
    const channelOptions = (includeRgb: boolean) => [
        ...(includeRgb ? [{ value: "rgb", label: t("canvas.ps.adjust.optRgb") }] : []),
        { value: "red", label: t("canvas.ps.adjust.optRed") },
        { value: "green", label: t("canvas.ps.adjust.optGreen") },
        { value: "blue", label: t("canvas.ps.adjust.optBlue") },
    ];
    const rangeOptions = ["reds", "yellows", "greens", "cyans", "blues", "magentas", "whites", "neutrals", "blacks"].map((range) => ({ value: range, label: t(`canvas.ps.adjust.${range}`) }));
    const toneOptions = ["shadows", "midtones", "highlights"].map((tone) => ({ value: tone, label: t(`canvas.ps.adjust.opt${tone[0].toUpperCase()}${tone.slice(1)}`) }));
    const row = (labelKey: string, children: ReactNode) => (
        <div className={ROW_CLASS} style={{ color: theme.node.label }}>
            <span className={LABEL_CLASS}>{t(labelKey)}</span>
            {children}
        </div>
    );
    const slider = (labelKey: string, key: string, min: number, max: number, fallback: number, suffix = "", step = 1) => {
        const value = number(params, key, fallback);
        return row(
            labelKey,
            <>
                <Slider className="!mx-0 min-w-0 flex-1" min={min} max={max} step={step} value={value} tooltip={{ formatter: (input) => `${input}${suffix}` }} ariaLabelForHandle={t(labelKey)} onChange={(input) => onChange({ [key]: input })} />
                <span className={VALUE_CLASS} style={{ color: theme.node.text }}>
                    {value}
                    {suffix}
                </span>
            </>,
        );
    };
    const select = (labelKey: string, key: string, fallback: string, options: { value: string; label: string }[]) =>
        row(
            labelKey,
            <Select size="small" className="min-w-0 flex-1" value={text(params, key, fallback)} options={options} popupMatchSelectWidth={false} styles={{ popup: { root: { zIndex: 1300 } } }} aria-label={t(labelKey)} onChange={(value) => onChange({ [key]: value })} />,
        );
    const color = (labelKey: string, key: string, fallback: string) =>
        row(
            labelKey,
            <PsColorPicker value={text(params, key, fallback)} ariaLabel={t(labelKey)} onChange={(hex) => onChange({ [key]: hex })} />,
        );
    const toggle = (labelKey: string, key: string, fallback: number) =>
        row(
            labelKey,
            <Switch size="small" checked={number(params, key, fallback) >= 0.5} onChange={(value) => onChange({ [key]: value ? 1 : 0 })} />,
        );
    const triple = (labelKey: string, key: string, labels: string[], min: number, max: number) => {
        const values = numbers(params, key, [0, 0, 0]);
        return (
            <div className="py-1">
                <span className="text-sm font-medium" style={{ color: theme.node.label }}>
                    {t(labelKey)}
                </span>
                {labels.map((item, index) => (
                    <div key={item} className="flex min-w-0 items-center gap-2 py-0.5">
                        <span className="w-10 shrink-0 text-sm" style={{ color: theme.node.label }}>
                            {t(item)}
                        </span>
                        <Slider
                            className="!mx-0 min-w-0 flex-1"
                            min={min}
                            max={max}
                            step={1}
                            value={values[index] ?? 0}
                            ariaLabelForHandle={t(item)}
                            onChange={(input) => {
                                const next = [...values];
                                next[index] = input;
                                onChange({ [key]: next });
                            }}
                        />
                        <span className={VALUE_CLASS} style={{ color: theme.node.text }}>
                            {values[index] ?? 0}
                        </span>
                    </div>
                ))}
            </div>
        );
    };

    if (type === "brightness-contrast") return <>{slider("canvas.ps.adjust.brightness", "brightness", -150, 150, 0)}{slider("canvas.ps.adjust.contrast", "contrast", -100, 100, 0)}</>;
    if (type === "levels")
        return (
            <>
                {select("canvas.ps.adjust.channel", "channel", "rgb", channelOptions(true))}
                {slider("canvas.ps.adjust.inputBlack", "inBlack", 0, 254, 0)}
                {slider("canvas.ps.adjust.inputWhite", "inWhite", 1, 255, 255)}
                {slider("canvas.ps.adjust.gamma", "gamma", 0.1, 9.99, 1, "", 0.01)}
                {slider("canvas.ps.adjust.outputBlack", "outBlack", 0, 255, 0)}
                {slider("canvas.ps.adjust.outputWhite", "outWhite", 0, 255, 255)}
            </>
        );
    if (type === "curves")
        return (
            <>
                {select("canvas.ps.adjust.channel", "channel", "rgb", channelOptions(true))}
                <PsCurveEditor points={numbers(params, "points", PS_CURVE_IDENTITY)} theme={theme} onChange={(points) => onChange({ points })} />
                <button type="button" className="mt-1 rounded-[2px] px-2 py-0.5 text-sm transition hover:bg-hover" style={{ color: theme.node.text }} onClick={() => onChange({ points: [...PS_CURVE_IDENTITY] })}>
                    {t("canvas.ps.adjust.curveReset")}
                </button>
            </>
        );
    if (type === "exposure") return <>{slider("canvas.ps.adjust.exposure", "exposure", -5, 5, 0, " EV", 0.05)}{slider("canvas.ps.adjust.offset", "offset", -0.5, 0.5, 0, "", 0.01)}{slider("canvas.ps.adjust.gamma", "gamma", 0.1, 9.99, 1, "", 0.01)}</>;
    if (type === "vibrance") return <>{slider("canvas.ps.adjust.vibrance", "vibrance", -100, 100, 0)}{slider("canvas.ps.adjust.saturation", "saturation", -100, 100, 0)}</>;
    if (type === "hue-saturation")
        return (
            <>
                {select("canvas.ps.adjust.channel", "channel", "master", [{ value: "master", label: t("canvas.ps.adjust.optMaster") }, ...rangeOptions.slice(0, 6)])}
                {slider("canvas.ps.adjust.hue", "hue", -180, 180, 0, "°")}
                {slider("canvas.ps.adjust.saturation", "saturation", -100, 100, 0)}
                {slider("canvas.ps.adjust.lightness", "lightness", -100, 100, 0)}
            </>
        );
    if (type === "color-balance") {
        const tone = text(params, "tone", "midtones");
        const labels = ["canvas.ps.adjust.cyanRed", "canvas.ps.adjust.magentaGreen", "canvas.ps.adjust.yellowBlue"];
        return (
            <>
                {select("canvas.ps.adjust.tone", "tone", "midtones", toneOptions)}
                {triple(`canvas.ps.adjust.${tone === "shadows" ? "shadows" : tone === "highlights" ? "highlights" : "midtones"}`, tone, labels, -100, 100)}
                {toggle("canvas.ps.adjust.preserveLuminosity", "preserve", 1)}
            </>
        );
    }
    if (type === "black-white")
        return (
            <>
                {slider("canvas.ps.adjust.reds", "reds", -200, 300, 40)}
                {slider("canvas.ps.adjust.yellows", "yellows", -200, 300, 60)}
                {slider("canvas.ps.adjust.greens", "greens", -200, 300, 40)}
                {slider("canvas.ps.adjust.cyans", "cyans", -200, 300, 60)}
                {slider("canvas.ps.adjust.blues", "blues", -200, 300, 20)}
                {slider("canvas.ps.adjust.magentas", "magentas", -200, 300, 80)}
            </>
        );
    if (type === "photo-filter")
        return (
            <>
                {color("canvas.ps.adjust.filterColor", "color", "#ec8a00")}
                {slider("canvas.ps.adjust.density", "density", 0, 100, 25, "%")}
                {toggle("canvas.ps.adjust.preserveLuminosity", "preserve", 1)}
            </>
        );
    if (type === "channel-mixer") {
        const output = text(params, "output", "red");
        const index = output === "green" ? 1 : output === "blue" ? 2 : 0;
        const values = numbers(params, "values", PS_CHANNEL_MIXER_DEFAULT);
        const setValue = (offset: number, input: number) => {
            const next = [...values];
            next[index * 4 + offset] = input;
            onChange({ values: next });
        };
        const labels = ["canvas.ps.adjust.optRed", "canvas.ps.adjust.optGreen", "canvas.ps.adjust.optBlue", "canvas.ps.adjust.constant"];
        return (
            <>
                {select("canvas.ps.adjust.outputChannel", "output", "red", channelOptions(false))}
                {toggle("canvas.ps.adjust.monochrome", "monochrome", 0)}
                {labels.map((item, offset) => (
                    <div key={item} className={ROW_CLASS} style={{ color: theme.node.muted }}>
                        <span className={LABEL_CLASS}>{t(item)}</span>
                        <Slider className="!mx-0 min-w-0 flex-1" min={-200} max={200} step={1} value={values[index * 4 + offset] ?? 0} ariaLabelForHandle={t(item)} onChange={(input) => setValue(offset, input)} />
                        <span className={VALUE_CLASS} style={{ color: theme.node.text }}>
                            {values[index * 4 + offset] ?? 0}%
                        </span>
                    </div>
                ))}
            </>
        );
    }
    if (type === "gradient-map")
        return (
            <>
                <PsGradientStopsEditor stops={strings(params, "stops", PS_GRADIENT_MAP_DEFAULT)} theme={theme} onChange={(stops) => onChange({ stops })} />
                {toggle("canvas.ps.gradientReverse", "reverse", 0)}
            </>
        );
    if (type === "invert") return <>{select("canvas.ps.adjust.channel", "channel", "rgb", channelOptions(true))}</>;
    if (type === "posterize") return <>{slider("canvas.ps.adjust.levels", "levels", 2, 255, 4)}</>;
    if (type === "threshold") return <>{slider("canvas.ps.adjust.threshold", "level", 1, 255, 128)}</>;
    const range = number(params, "range", 0);
    const values = numbers(params, "values", Array.from({ length: 36 }, () => 0));
    const setValue = (offset: number, input: number) => {
        const next = [...values];
        next[range * 4 + offset] = input;
        onChange({ values: next });
    };
    return (
        <>
            {row(
                "canvas.ps.adjust.colorRange",
                <Select
                    size="small"
                    className="min-w-0 flex-1"
                    value={String(range)}
                    options={rangeOptions.map((option, index) => ({ ...option, value: String(index) }))}
                    popupMatchSelectWidth={false}
                    styles={{ popup: { root: { zIndex: 1300 } } }}
                    aria-label={t("canvas.ps.adjust.colorRange")}
                    onChange={(value) => onChange({ range: Number(value) })}
                />,
            )}
            {select("canvas.ps.adjust.method", "method", "relative", [{ value: "relative", label: t("canvas.ps.adjust.optRelative") }, { value: "absolute", label: t("canvas.ps.adjust.optAbsolute") }])}
            {["canvas.ps.adjust.cyan", "canvas.ps.adjust.magenta", "canvas.ps.adjust.yellow", "canvas.ps.adjust.black"].map((item, offset) => (
                <div key={item} className={ROW_CLASS} style={{ color: theme.node.muted }}>
                    <span className={LABEL_CLASS}>{t(item)}</span>
                    <Slider className="!mx-0 min-w-0 flex-1" min={-100} max={100} step={1} value={values[range * 4 + offset] ?? 0} ariaLabelForHandle={t(item)} onChange={(input) => setValue(offset, input)} />
                    <span className={VALUE_CLASS} style={{ color: theme.node.text }}>
                        {values[range * 4 + offset] ?? 0}%
                    </span>
                </div>
            ))}
        </>
    );
}
