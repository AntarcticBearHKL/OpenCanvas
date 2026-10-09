import { useCallback, useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import { Checkbox, ColorPicker } from "antd";
import { Plus, RotateCcw, Trash2 } from "lucide-react";

import type { GradientStop, LayerState } from "@/lib/texture/types";

/** Preset ramp definitions mirrored from the original editor. */
const PRESETS: { name: string; stops: GradientStop[] }[] = [
    {
        name: "B/W",
        stops: [
            { position: 0, color: "#000000" },
            { position: 1, color: "#ffffff" },
        ],
    },
    {
        name: "Fire",
        stops: [
            { position: 0, color: "#000000" },
            { position: 0.25, color: "#8b0000" },
            { position: 0.5, color: "#ff4400" },
            { position: 0.75, color: "#ff8800" },
            { position: 0.9, color: "#ffcc00" },
            { position: 1, color: "#ffffff" },
        ],
    },
    {
        name: "Water",
        stops: [
            { position: 0, color: "#000d1a" },
            { position: 0.3, color: "#003366" },
            { position: 0.6, color: "#0077cc" },
            { position: 0.85, color: "#44bbff" },
            { position: 1, color: "#ccf0ff" },
        ],
    },
    {
        name: "Plasma",
        stops: [
            { position: 0, color: "#000022" },
            { position: 0.2, color: "#6600cc" },
            { position: 0.4, color: "#cc0066" },
            { position: 0.6, color: "#ff6600" },
            { position: 0.8, color: "#ffff00" },
            { position: 1, color: "#ffffff" },
        ],
    },
    {
        name: "Lava",
        stops: [
            { position: 0, color: "#0a0000" },
            { position: 0.3, color: "#3d0000" },
            { position: 0.5, color: "#cc2200" },
            { position: 0.7, color: "#ff6600" },
            { position: 0.9, color: "#ffaa00" },
            { position: 1, color: "#ffee88" },
        ],
    },
    {
        name: "Ice",
        stops: [
            { position: 0, color: "#000011" },
            { position: 0.3, color: "#001133" },
            { position: 0.6, color: "#88ddff" },
            { position: 0.85, color: "#ccf4ff" },
            { position: 1, color: "#ffffff" },
        ],
    },
    {
        name: "Nature",
        stops: [
            { position: 0, color: "#111100" },
            { position: 0.3, color: "#224400" },
            { position: 0.55, color: "#44aa11" },
            { position: 0.8, color: "#88ee44" },
            { position: 1, color: "#eeffcc" },
        ],
    },
    {
        name: "Neon",
        stops: [
            { position: 0, color: "#000000" },
            { position: 0.25, color: "#ff0066" },
            { position: 0.5, color: "#00ffcc" },
            { position: 0.75, color: "#ff00ff" },
            { position: 1, color: "#ffffff" },
        ],
    },
    {
        name: "Sunset",
        stops: [
            { position: 0, color: "#0a0a2a" },
            { position: 0.3, color: "#7a0066" },
            { position: 0.55, color: "#ff5500" },
            { position: 0.75, color: "#ffaa00" },
            { position: 1, color: "#ffe0aa" },
        ],
    },
    {
        name: "Gold",
        stops: [
            { position: 0, color: "#111100" },
            { position: 0.3, color: "#442200" },
            { position: 0.6, color: "#cc8800" },
            { position: 0.85, color: "#ffdd44" },
            { position: 1, color: "#fff8cc" },
        ],
    },
    {
        name: "Rainbow",
        stops: [
            { position: 0, color: "#ff0000" },
            { position: 0.17, color: "#ff8800" },
            { position: 0.33, color: "#ffff00" },
            { position: 0.5, color: "#00ff00" },
            { position: 0.67, color: "#0088ff" },
            { position: 0.83, color: "#8800ff" },
            { position: 1, color: "#ff00ff" },
        ],
    },
    {
        name: "Toxic",
        stops: [
            { position: 0, color: "#000000" },
            { position: 0.3, color: "#003300" },
            { position: 0.6, color: "#00cc33" },
            { position: 0.85, color: "#99ff00" },
            { position: 1, color: "#eeffaa" },
        ],
    },
    {
        name: "Aurora",
        stops: [
            { position: 0, color: "#000511" },
            { position: 0.2, color: "#001133" },
            { position: 0.45, color: "#003355" },
            { position: 0.65, color: "#00aa88" },
            { position: 0.85, color: "#44ffaa" },
            { position: 1, color: "#aaffee" },
        ],
    },
    {
        name: "Blood",
        stops: [
            { position: 0, color: "#000000" },
            { position: 0.3, color: "#220000" },
            { position: 0.6, color: "#880000" },
            { position: 0.85, color: "#cc2200" },
            { position: 1, color: "#ff6644" },
        ],
    },
    {
        name: "Hologram",
        stops: [
            { position: 0, color: "#000000" },
            { position: 0.2, color: "#003344" },
            { position: 0.4, color: "#0088cc" },
            { position: 0.6, color: "#00eeff" },
            { position: 0.8, color: "#88ffff" },
            { position: 1, color: "#eeffff" },
        ],
    },
    {
        name: "Desert",
        stops: [
            { position: 0, color: "#1a0d00" },
            { position: 0.3, color: "#8b4513" },
            { position: 0.6, color: "#daa520" },
            { position: 0.85, color: "#f5deb3" },
            { position: 1, color: "#fff8f0" },
        ],
    },
];

const STRIP_HEIGHT = "1.5rem";
/** Half the 10px handle width, used to center the handle on its stop. */
const HANDLE_OFFSET = 5;
/** Press-and-hold before a handle starts dragging, in ms. */
const DRAG_DELAY = 220;
/** Clicking within this distance of an existing stop is ignored. */
const MIN_STOP_DISTANCE = 0.02;
const RESET_STOPS: GradientStop[] = [
    { position: 0, color: "#000000" },
    { position: 1, color: "#ffffff" },
];

function clamp01(value: number): number {
    return Math.min(1, Math.max(0, value));
}

function sortStops(stops: GradientStop[]): GradientStop[] {
    return [...stops].sort((a, b) => a.position - b.position);
}

function stripBackground(stops: GradientStop[]): string {
    const parts = sortStops(stops).map((stop) => `${stop.color} ${Math.round(clamp01(stop.position) * 100)}%`);
    return `linear-gradient(90deg, ${parts.join(", ")})`;
}

/** Sample the interpolated color of the ramp at a 0..1 position. */
function sampleGradientColor(stops: GradientStop[], position: number): string {
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 1;
    const context = canvas.getContext("2d");
    if (!context) return "#808080";
    const gradient = context.createLinearGradient(0, 0, 256, 0);
    sortStops(stops).forEach((stop) => gradient.addColorStop(clamp01(stop.position), stop.color));
    context.fillStyle = gradient;
    context.fillRect(0, 0, 256, 1);
    const [red, green, blue] = context.getImageData(Math.floor(position * 255), 0, 1, 1).data;
    return `#${red.toString(16).padStart(2, "0")}${green.toString(16).padStart(2, "0")}${blue.toString(16).padStart(2, "0")}`;
}

/** Midpoint of the widest gap between stops, for the "Add Stop" button. */
function gapPosition(stops: GradientStop[]): number {
    const points = sortStops(stops).map((stop) => clamp01(stop.position));
    if (points.length < 2) return 0.5;
    let bestPosition = 0.5;
    let bestGap = -1;
    for (let index = 0; index < points.length - 1; index += 1) {
        const gap = points[index + 1] - points[index];
        if (gap > bestGap) {
            bestGap = gap;
            bestPosition = (points[index] + points[index + 1]) / 2;
        }
    }
    return bestPosition;
}

export function GradientEditor({ layer, onChange }: { layer: LayerState; onChange: (patch: Partial<LayerState>) => void }) {
    const [selectedStop, setSelectedStop] = useState<number | null>(null);
    const stripRef = useRef<HTMLDivElement | null>(null);
    const dragTimer = useRef<number | null>(null);
    const dragging = useRef(false);
    const pendingDblClick = useRef(false);
    const layerRef = useRef(layer);
    layerRef.current = layer;
    const onChangeRef = useRef(onChange);
    onChangeRef.current = onChange;

    const clearDragTimer = useCallback(() => {
        if (dragTimer.current !== null) {
            window.clearTimeout(dragTimer.current);
            dragTimer.current = null;
        }
    }, []);

    useEffect(() => clearDragTimer, [clearDragTimer]);

    const applyStops = (stops: GradientStop[]) => {
        onChangeRef.current({ gradStops: stops });
    };

    const replaceStop = (index: number, patch: Partial<GradientStop>) => {
        applyStops(layerRef.current.gradStops.map((stop, position) => (position === index ? { ...stop, ...patch } : stop)));
    };

    const addStop = (position: number) => {
        const stops = layerRef.current.gradStops;
        if (stops.some((stop) => Math.abs(stop.position - position) < MIN_STOP_DISTANCE)) return;
        const next = [...stops, { position, color: sampleGradientColor(stops, position) }];
        applyStops(next);
        setSelectedStop(next.length - 1);
    };

    const handleStripClick = (event: ReactMouseEvent<HTMLDivElement>) => {
        const rect = stripRef.current?.getBoundingClientRect();
        if (!rect || rect.width === 0) return;
        addStop(clamp01((event.clientX - rect.left) / rect.width));
    };

    const handleAddStop = () => {
        addStop(gapPosition(layerRef.current.gradStops));
    };

    const handleStopMouseDown = (event: ReactMouseEvent<HTMLDivElement>, index: number) => {
        event.stopPropagation();
        setSelectedStop(index);
        pendingDblClick.current = false;
        clearDragTimer();
        dragTimer.current = window.setTimeout(() => {
            dragTimer.current = null;
            if (pendingDblClick.current) return;
            dragging.current = true;
            const onMove = (moveEvent: MouseEvent) => {
                if (!dragging.current) return;
                const rect = stripRef.current?.getBoundingClientRect();
                if (!rect || rect.width === 0) return;
                replaceStop(index, { position: clamp01((moveEvent.clientX - rect.left) / rect.width) });
            };
            const onUp = () => {
                dragging.current = false;
                document.removeEventListener("mousemove", onMove);
                document.removeEventListener("mouseup", onUp);
            };
            document.addEventListener("mousemove", onMove);
            document.addEventListener("mouseup", onUp);
        }, DRAG_DELAY);
        const onEarlyUp = () => {
            clearDragTimer();
            document.removeEventListener("mouseup", onEarlyUp);
        };
        document.addEventListener("mouseup", onEarlyUp);
    };

    const handleStopDoubleClick = (event: ReactMouseEvent<HTMLDivElement>, index: number) => {
        event.stopPropagation();
        pendingDblClick.current = true;
        if (layerRef.current.gradStops.length <= 2) return;
        applyStops(layerRef.current.gradStops.filter((_, position) => position !== index));
        setSelectedStop(null);
    };

    const selected = selectedStop !== null ? layer.gradStops[selectedStop] : undefined;
    const canDelete = selected !== undefined && layer.gradStops.length > 2;

    const handleDelete = () => {
        if (!canDelete || selectedStop === null) return;
        applyStops(layerRef.current.gradStops.filter((_, position) => position !== selectedStop));
        setSelectedStop(null);
    };

    const handleReset = () => {
        applyStops(RESET_STOPS.map((stop) => ({ ...stop })));
        setSelectedStop(null);
    };

    const handlePreset = (preset: (typeof PRESETS)[number]) => {
        applyStops(preset.stops.map((stop) => ({ ...stop })));
        setSelectedStop(null);
    };

    return (
        <div className="space-y-3 px-3 py-3">
            <div className="flex items-center justify-between gap-2">
                <Checkbox checked={layer.gradEnable} onChange={(event) => onChange({ gradEnable: event.target.checked })}>
                    <span className="text-xs font-semibold text-foreground">Gradient</span>
                </Checkbox>
                <button
                    type="button"
                    onClick={handleAddStop}
                    className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-muted-foreground transition hover:bg-hover hover:text-foreground"
                >
                    <Plus className="size-3.5" />
                    Add Stop
                </button>
            </div>

            <div className="relative w-full" style={{ height: STRIP_HEIGHT }}>
                <div
                    ref={stripRef}
                    onClick={handleStripClick}
                    className="absolute inset-0 cursor-crosshair rounded border border-border"
                    style={{ background: stripBackground(layer.gradStops) }}
                    title="Click to add a stop"
                />
                <div className="pointer-events-none absolute inset-0">
                    {layer.gradStops.map((stop, index) => (
                        <div
                            key={index}
                            onMouseDown={(event) => handleStopMouseDown(event, index)}
                            onDoubleClick={(event) => handleStopDoubleClick(event, index)}
                            title={`${stop.color} · ${Math.round(clamp01(stop.position) * 100)}%`}
                            className={`pointer-events-auto absolute top-0 h-6 w-2.5 cursor-ew-resize rounded-sm border-2 ${
                                selectedStop === index ? "border-brand" : "border-foreground/40"
                            }`}
                            style={{ left: `calc(${clamp01(stop.position) * 100}% - ${HANDLE_OFFSET}px)`, background: stop.color }}
                        />
                    ))}
                </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
                <span className="text-[11px] text-muted-foreground">Stop Color</span>
                <ColorPicker
                    className="shrink-0"
                    size="small"
                    value={selected ? selected.color : "#000000"}
                    disabled={selected === undefined}
                    disabledAlpha
                    onChange={(color) => {
                        if (selectedStop === null || selected === undefined) return;
                        replaceStop(selectedStop, { color: color.toHexString() });
                    }}
                />
                <span className="flex-1" />
                <button
                    type="button"
                    disabled={!canDelete}
                    onClick={handleDelete}
                    title="Delete selected stop"
                    className="flex items-center gap-1 rounded border border-border px-1.5 py-1 text-[11px] text-muted-foreground transition hover:bg-hover hover:text-danger disabled:cursor-not-allowed disabled:opacity-40"
                >
                    <Trash2 className="size-3.5" />
                    Delete
                </button>
                <button
                    type="button"
                    onClick={handleReset}
                    title="Reset to black to white"
                    className="flex items-center gap-1 rounded border border-border px-1.5 py-1 text-[11px] text-muted-foreground transition hover:bg-hover hover:text-foreground"
                >
                    <RotateCcw className="size-3.5" />
                    Reset
                </button>
            </div>

            <div className="space-y-1">
                <span className="text-[11px] text-muted-foreground">Presets</span>
                <div className="grid max-h-32 grid-cols-4 gap-1 overflow-y-auto pr-1">
                    {PRESETS.map((preset) => (
                        <button
                            key={preset.name}
                            type="button"
                            title={preset.name}
                            onClick={() => handlePreset(preset)}
                            className="flex flex-col items-center gap-1 rounded-md border border-border px-1 py-1 text-[10px] text-muted-foreground transition hover:border-brand hover:bg-hover hover:text-foreground"
                        >
                            <span className="h-3.5 w-full rounded-sm border border-border/60" style={{ background: stripBackground(preset.stops) }} />
                            <span className="w-full truncate text-center">{preset.name}</span>
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
}
