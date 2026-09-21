import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Slider } from "antd";
import { useTranslation } from "react-i18next";

import PsColorPicker from "@/components/canvas/workspace/ps-color-picker";
import { useCanvasTheme } from "@/hooks/use-canvas-theme";
import { STUDIO_PANEL_LABEL_CLASS, STUDIO_PANEL_ROW_CLASS, STUDIO_PANEL_VALUE_CLASS } from "@/components/canvas/workspace/studio-chrome";
import { psFormatGradientStop, psHexToRgb, psParseGradientStops } from "@/lib/canvas/ps-adjustments";

const ROW_CLASS = STUDIO_PANEL_ROW_CLASS;
const LABEL_CLASS = STUDIO_PANEL_LABEL_CLASS;
const VALUE_CLASS = "w-9 shrink-0 text-right text-[11px] tabular-nums";

const psSortPairs = (list: number[]) => {
    const items = Array.from({ length: Math.floor(list.length / 2) }, (_, index) => ({ x: list[index * 2], y: list[index * 2 + 1] }));
    items.sort((a, b) => a.x - b.x);
    return items.flatMap((item) => [item.x, item.y]);
};

export function PsCurveEditor({ points, theme, onChange }: { points: number[]; theme: ReturnType<typeof useCanvasTheme>; onChange: (points: number[]) => void }) {
    const svgRef = useRef<SVGSVGElement>(null);
    const [dragIndex, setDragIndex] = useState(-1);
    const pairs = Array.from({ length: Math.floor(points.length / 2) }, (_, index) => ({ x: points[index * 2], y: points[index * 2 + 1] }));
    const positionAt = (event: { clientX: number; clientY: number }) => {
        const box = svgRef.current?.getBoundingClientRect();
        if (!box) return { x: 0, y: 0 };
        return { x: Math.min(255, Math.max(0, Math.round(((event.clientX - box.left) / box.width) * 255))), y: Math.min(255, Math.max(0, Math.round((1 - (event.clientY - box.top) / box.height) * 255))) };
    };
    return (
        <svg
            ref={svgRef}
            viewBox="0 0 255 255"
            className="h-36 w-full touch-none rounded-md border"
            style={{ borderColor: theme.toolbar.border, background: theme.toolbar.panel, cursor: "crosshair" }}
            onPointerMove={(event: ReactPointerEvent<SVGSVGElement>) => {
                if (dragIndex < 0) return;
                const point = positionAt(event);
                const next = [...points];
                next[dragIndex * 2] = point.x;
                next[dragIndex * 2 + 1] = point.y;
                onChange(next);
            }}
            onPointerUp={() => setDragIndex(-1)}
            onPointerCancel={() => setDragIndex(-1)}
            onPointerDown={(event) => {
                const point = positionAt(event);
                onChange(psSortPairs([...points, point.x, point.y]));
            }}
        >
            {[64, 128, 192].map((value) => (
                <line key={`v${value}`} x1={value} y1={0} x2={value} y2={255} stroke={theme.toolbar.border} strokeWidth={1} />
            ))}
            {[64, 128, 192].map((value) => (
                <line key={`h${value}`} x1={0} y1={value} x2={255} y2={value} stroke={theme.toolbar.border} strokeWidth={1} />
            ))}
            <polyline points={pairs.map((point) => `${point.x},${255 - point.y}`).join(" ")} fill="none" stroke={theme.node.activeStroke} strokeWidth={2} />
            {pairs.map((point, index) => (
                <circle
                    key={index}
                    cx={point.x}
                    cy={255 - point.y}
                    r={5}
                    fill={theme.toolbar.panel}
                    stroke={theme.node.activeStroke}
                    strokeWidth={2}
                    onPointerDown={(event) => {
                        event.stopPropagation();
                        svgRef.current?.setPointerCapture(event.pointerId);
                        setDragIndex(index);
                    }}
                    onDoubleClick={(event) => {
                        event.stopPropagation();
                        if (pairs.length <= 2) return;
                        onChange(psSortPairs(pairs.filter((_, item) => item !== index).flatMap((item) => [item.x, item.y])));
                    }}
                />
            ))}
        </svg>
    );
}

export function PsGradientStopsEditor({ stops: source, theme, onChange }: { stops: string[]; theme: ReturnType<typeof useCanvasTheme>; onChange: (stops: string[]) => void }) {
    const { t } = useTranslation();
    const [selected, setSelected] = useState(0);
    const stops = source.length >= 2 ? source : ["#000000@0", "#ffffff@1"];
    const parsed = psParseGradientStops(stops);
    const colors = parsed.map((stop) => `${stop.color} ${Math.round(stop.position * 100)}%`).join(", ");
    const index = Math.min(selected, parsed.length - 1);
    const barRef = useRef<HTMLDivElement>(null);
    const update = (next: { color?: string; position?: number }) => {
        const items = [...parsed];
        items[index] = { color: next.color ?? items[index].color, position: next.position ?? items[index].position };
        onChange(items.sort((a, b) => a.position - b.position).map((stop) => psFormatGradientStop(stop.color, stop.position)));
    };
    const addStop = (position: number) => {
        const [r, g, b] = psHexToRgb(parsed[index].color);
        const color = `#${[r, g, b].map((value) => value.toString(16).padStart(2, "0")).join("")}`;
        onChange([...parsed, { color, position }].sort((a, b) => a.position - b.position).map((stop) => psFormatGradientStop(stop.color, stop.position)));
    };
    return (
        <div className="py-1">
            <div
                ref={barRef}
                className="relative h-5 w-full cursor-copy rounded-sm border"
                style={{ borderColor: theme.toolbar.border, background: `linear-gradient(to right, ${colors})` }}
                onPointerDown={(event) => {
                    const box = barRef.current?.getBoundingClientRect();
                    if (!box) return;
                    addStop(Math.min(1, Math.max(0, (event.clientX - box.left) / box.width)));
                }}
            >
                {parsed.map((stop, item) => (
                    <button
                        key={`${stop.position}-${item}`}
                        type="button"
                        className="absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border"
                        style={{ left: `${stop.position * 100}%`, background: stop.color, borderColor: item === index ? theme.node.activeStroke : theme.toolbar.border, boxShadow: item === index ? `0 0 0 1px ${theme.node.activeStroke}` : undefined }}
                        aria-label={`${t("canvas.ps.adjust.gradientStops")} ${item + 1}`}
                        onPointerDown={(event) => {
                            event.stopPropagation();
                            setSelected(item);
                        }}
                        onDoubleClick={(event) => {
                            event.stopPropagation();
                            if (parsed.length <= 2) return;
                            onChange(parsed.filter((_, keep) => keep !== item).map((stop) => psFormatGradientStop(stop.color, stop.position)));
                        }}
                    />
                ))}
            </div>
            <div className={ROW_CLASS} style={{ color: theme.node.muted }}>
                <span className={LABEL_CLASS}>{t("canvas.ps.adjust.gradientStops")}</span>
                <PsColorPicker value={parsed[index].color} ariaLabel={t("canvas.ps.adjust.gradientStops")} onChange={(hex) => update({ color: hex })} />
                <Slider className="!mx-0 min-w-0 flex-1" min={0} max={100} step={1} value={Math.round(parsed[index].position * 100)} ariaLabelForHandle={t("canvas.ps.adjust.gradientStops")} onChange={(value) => update({ position: value / 100 })} />
                <span className={VALUE_CLASS} style={{ color: theme.node.text }}>
                    {Math.round(parsed[index].position * 100)}%
                </span>
            </div>
        </div>
    );
}
