import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { Input, InputNumber, Popover } from "antd";
import { ArrowLeftRight } from "lucide-react";
import { useTranslation } from "react-i18next";

import { useCanvasTheme } from "@/hooks/use-canvas-theme";
import { psHexToHsb, psHexToRgbTriple, psHsbToHex, psNormalizeHex, type PsHsb } from "@/lib/canvas/ps-color";

export type PsColorPickerProps = {
    value: string;
    onChange: (hex: string) => void;
    ariaLabel?: string;
    background?: string;
    onBackground?: (hex: string) => void;
};

const SWATCH_CLASS = "relative size-7 shrink-0 rounded-md border shadow-sm";
const CHECKER = "conic-gradient(#c8c8c8 90deg, #ffffff 90deg 180deg, #c8c8c8 180deg 270deg, #ffffff 270deg)";

function psRatio(event: { clientX: number; clientY: number }, element: HTMLElement) {
    const box = element.getBoundingClientRect();
    return { x: Math.min(1, Math.max(0, (event.clientX - box.left) / Math.max(1, box.width))), y: Math.min(1, Math.max(0, (event.clientY - box.top) / Math.max(1, box.height))) };
}

export function PsColorFields({ value, onChange, ariaLabel, background, onBackground, layout = "column" }: PsColorPickerProps & { layout?: "column" | "row" }) {
    const { t } = useTranslation();
    const theme = useCanvasTheme();
    const [hsb, setHsb] = useState<PsHsb>(() => psHexToHsb(value));
    const derived = psHsbToHex(hsb);
    const svRef = useRef<HTMLDivElement>(null);
    const hueRef = useRef<HTMLDivElement>(null);
    const rgb = psHexToRgbTriple(derived);

    useEffect(() => {
        if (psNormalizeHex(value) !== derived) setHsb(psHexToHsb(value));
    }, [value, derived]);

    const apply = (next: PsHsb) => {
        setHsb(next);
        onChange(psHsbToHex(next));
    };
    const drag = (event: ReactPointerEvent<HTMLDivElement>, target: "sv" | "hue") => {
        event.currentTarget.setPointerCapture(event.pointerId);
        const move = (clientX: number, clientY: number) => {
            const element = target === "sv" ? svRef.current : hueRef.current;
            if (!element) return;
            const ratio = psRatio({ clientX, clientY }, element);
            apply(target === "sv" ? { h: hsb.h, s: ratio.x * 100, b: (1 - ratio.y) * 100 } : { ...hsb, h: ratio.x * 360 });
        };
        move(event.clientX, event.clientY);
        const onMove = (moveEvent: PointerEvent) => move(moveEvent.clientX, moveEvent.clientY);
        const onUp = () => {
            window.removeEventListener("pointermove", onMove);
            window.removeEventListener("pointerup", onUp);
        };
        window.addEventListener("pointermove", onMove);
        window.addEventListener("pointerup", onUp);
    };
    const field = (label: string, node: ReactNode) => (
        <label className="flex min-w-0 flex-1 items-center gap-1">
            <span className="shrink-0 text-sm font-medium" style={{ color: theme.node.label }}>
                {label}
            </span>
            {node}
        </label>
    );

    const row = layout === "row";

    return (
        <div className={row ? "flex min-w-0 flex-wrap items-start gap-x-3" : "w-[228px] space-y-1.5"}>
            <div className={row ? "w-[228px] max-w-full shrink-0 space-y-1.5" : "contents"}>
            <div
                ref={svRef}
                role="slider"
                aria-label={t("canvas.ps.colorSaturationBrightness")}
                aria-valuenow={Math.round(hsb.b)}
                className={`relative w-full cursor-crosshair rounded-md border ${row ? "h-24" : "h-32"}`}
                style={{ borderColor: theme.toolbar.border, background: `linear-gradient(to top, #000000, transparent), linear-gradient(to right, #ffffff, ${psHsbToHex({ h: hsb.h, s: 100, b: 100 })})` }}
                onPointerDown={(event) => drag(event, "sv")}
            >
                <span className="pointer-events-none absolute size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow" style={{ left: `${hsb.s}%`, top: `${100 - hsb.b}%`, background: derived }} />
            </div>
            <div
                ref={hueRef}
                role="slider"
                aria-label={t("canvas.ps.colorHue")}
                aria-valuenow={Math.round(hsb.h)}
                className="relative h-3.5 w-full cursor-pointer rounded-md border"
                style={{ borderColor: theme.toolbar.border, background: "linear-gradient(to right, #ff0000, #ffff00, #00ff00, #00ffff, #0000ff, #ff00ff, #ff0000)" }}
                onPointerDown={(event) => drag(event, "hue")}
            >
                <span className="pointer-events-none absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow" style={{ left: `${(hsb.h / 360) * 100}%`, background: psHsbToHex({ h: hsb.h, s: 100, b: 100 }) }} />
            </div>
            <div className="flex items-center gap-1.5">
                {background !== undefined ? <PsForegroundBackground foreground={derived} background={background} onChange={onChange} onBackground={onBackground} /> : <span className={SWATCH_CLASS} style={{ background: derived, borderColor: theme.toolbar.border }} />}
                <span className="min-w-0 flex-1 text-right text-sm tabular-nums" style={{ color: theme.node.text }}>
                    {derived.toUpperCase()}
                </span>
            </div>
            </div>
            <div className={row ? "w-[280px] max-w-full shrink-0 space-y-1.5" : "contents"}>
            <div className="flex items-center gap-1.5">
                {field("H", <InputNumber size="small" className="!w-full" min={0} max={360} value={Math.round(hsb.h)} aria-label={t("canvas.ps.colorHue")} onChange={(input) => input !== null && apply({ ...hsb, h: input })} />)}
                {field("S", <InputNumber size="small" className="!w-full" min={0} max={100} value={Math.round(hsb.s)} aria-label={t("canvas.ps.colorSaturation")} onChange={(input) => input !== null && apply({ ...hsb, s: input })} />)}
                {field("B", <InputNumber size="small" className="!w-full" min={0} max={100} value={Math.round(hsb.b)} aria-label={t("canvas.ps.colorBrightness")} onChange={(input) => input !== null && apply({ ...hsb, b: input })} />)}
            </div>
            <div className="flex items-center gap-1.5">
                {field("R", <InputNumber size="small" className="!w-full" min={0} max={255} value={rgb[0]} aria-label={t("canvas.ps.colorRed")} onChange={(input) => input !== null && onChange(psHsbToHex({ ...hsb, ...psHsbFromRgb([input, rgb[1], rgb[2]]) }))} />)}
                {field("G", <InputNumber size="small" className="!w-full" min={0} max={255} value={rgb[1]} aria-label={t("canvas.ps.colorGreen")} onChange={(input) => input !== null && onChange(psHsbToHex({ ...hsb, ...psHsbFromRgb([rgb[0], input, rgb[2]]) }))} />)}
                {field("B", <InputNumber size="small" className="!w-full" min={0} max={255} value={rgb[2]} aria-label={t("canvas.ps.colorBlue")} onChange={(input) => input !== null && onChange(psHsbToHex({ ...hsb, ...psHsbFromRgb([rgb[0], rgb[1], input]) }))} />)}
            </div>
            <div className="flex items-center gap-1.5">
                {field(
                    "#",
                    <Input
                        size="small"
                        value={derived}
                        maxLength={7}
                        aria-label={t("canvas.ps.colorHex")}
                        onChange={(event) => {
                            const hex = psNormalizeHex(event.target.value);
                            if (hex) onChange(hex);
                        }}
                    />,
                )}
            </div>
            </div>
        </div>
    );
}

function psHsbFromRgb(rgb: [number, number, number]) {
    const { h, s, b } = psHexToHsb(`#${rgb.map((value) => Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, "0")).join("")}`);
    return { h, s, b };
}

export function PsForegroundBackground({ foreground, background, onChange, onBackground }: { foreground: string; background: string; onChange?: (hex: string) => void; onBackground?: (hex: string) => void }) {
    const { t } = useTranslation();
    const theme = useCanvasTheme();
    return (
        <div className="flex shrink-0 items-center gap-1">
            <span className="relative block size-8 shrink-0">
                <button
                    type="button"
                    className="absolute bottom-0 right-0 size-5 rounded-md border shadow-sm"
                    style={{ background, borderColor: theme.toolbar.border }}
                    aria-label={t("canvas.ps.colorBackground")}
                    title={t("canvas.ps.colorBackground")}
                    onClick={() => onBackground?.(foreground)}
                />
                <button
                    type="button"
                    className="absolute left-0 top-0 size-5 rounded-md border shadow-sm"
                    style={{ background: foreground, borderColor: theme.toolbar.border }}
                    aria-label={t("canvas.ps.colorForeground")}
                    title={t("canvas.ps.colorForeground")}
                    onClick={() => onChange?.(background)}
                />
            </span>
            <button type="button" className="grid size-6 shrink-0 place-items-center rounded-md transition hover:bg-hover" style={{ color: theme.node.muted }} aria-label={t("canvas.ps.colorSwap")} title={t("canvas.ps.colorSwap")} onClick={() => { onChange?.(background); onBackground?.(foreground); }}>
                <ArrowLeftRight className="size-3" />
            </button>
            <button type="button" className="grid size-6 shrink-0 place-items-center rounded-md transition hover:bg-hover" style={{ color: theme.node.muted }} aria-label={t("canvas.ps.colorReset")} title={t("canvas.ps.colorReset")} onClick={() => { onChange?.("#000000"); onBackground?.("#ffffff"); }}>
                <span className="flex items-center">
                    <span className="size-2.5 rounded-md border border-black/40 bg-black" />
                    <span className="size-2.5 rounded-md border border-black/40 bg-white" />
                </span>
            </button>
        </div>
    );
}

export default function PsColorPicker({ value, onChange, ariaLabel, background, onBackground }: PsColorPickerProps) {
    const { t } = useTranslation();
    const theme = useCanvasTheme();
    const hex = psNormalizeHex(value) || "#000000";
    return (
        <Popover trigger="click" placement="bottomRight" classNames={{ container: "glass-raised" }} styles={{ root: { zIndex: 1300 }, container: { background: "var(--glass-strong)", borderRadius: 0 } }} content={<PsColorFields value={hex} onChange={onChange} ariaLabel={ariaLabel} background={background} onBackground={onBackground} />}>
            <button type="button" className="relative size-6 shrink-0 rounded-md border" style={{ borderColor: theme.toolbar.border, backgroundImage: CHECKER, backgroundSize: "6px 6px" }} aria-label={ariaLabel || t("canvas.ps.color")} title={ariaLabel || t("canvas.ps.color")}>
                <span className="absolute inset-0 rounded-md" style={{ background: hex }} />
            </button>
        </Popover>
    );
}
