import { useEffect, useRef, type PointerEvent as ReactPointerEvent } from "react";

import { useCanvasTheme } from "@/hooks/use-canvas-theme";
import { psPathData } from "@/lib/canvas/ps-path";
import { psSelectionEdges } from "@/components/canvas/workspace/ps-selection";
import type { CanvasPsPath } from "@/types/canvas";

export type PsDraft =
    | { kind: "rect"; x: number; y: number; width: number; height: number; ellipse: boolean }
    | { kind: "path"; d: string }
    | { kind: "line"; x1: number; y1: number; x2: number; y2: number }
    | null;

export type PsGuideAxis = "x" | "y";
export type PsGuides = { x: number[]; y: number[] };
export type PsSnapLines = { x: number[]; y: number[] };

type PsTheme = ReturnType<typeof useCanvasTheme>;

const ANT_LIMIT = 12000;
const ANT_TICK_MS = 120;
const ANT_DASH = 8;
const RULER_SIZE = 20;
const RULER_BASE_TICK = 100;
const RULER_MIN_SPACING = 56;
export const PS_GRID_SIZE = 50;

export function PsMarchingAnts({ selection, version, width, height, theme, visible }: { selection: HTMLCanvasElement | null; version: number; width: number; height: number; theme: PsTheme; visible: boolean }) {
    const ref = useRef<HTMLCanvasElement>(null);
    const phaseRef = useRef(0);
    const stroke = theme.node.activeStroke;
    const alternate = theme.toolbar.panel;

    useEffect(() => {
        const canvas = ref.current;
        if (!canvas || !selection || !visible) return;
        canvas.width = Math.max(1, Math.round(width));
        canvas.height = Math.max(1, Math.round(height));
        const context = canvas.getContext("2d");
        if (!context) return;
        const edges = psSelectionEdges({ canvas: selection }, ANT_LIMIT);
        if (!edges.length) return;
        const paint = () => {
            const phase = phaseRef.current;
            context.clearRect(0, 0, canvas.width, canvas.height);
            for (const pass of [0, 1]) {
                context.fillStyle = pass ? alternate : stroke;
                context.beginPath();
                for (const pixel of edges) {
                    const x = pixel % canvas.width;
                    const y = (pixel - x) / canvas.width;
                    if ((((x + y + phase) / ANT_DASH) | 0) % 2 !== pass) continue;
                    context.rect(x, y, 1, 1);
                }
                context.fill();
            }
        };
        paint();
        const timer = window.setInterval(() => {
            phaseRef.current = (phaseRef.current + 2) % (ANT_DASH * 2);
            paint();
        }, ANT_TICK_MS);
        return () => window.clearInterval(timer);
    }, [selection, version, width, height, visible, stroke, alternate]);

    if (!selection || !visible) return null;
    return <canvas ref={ref} className="pointer-events-none absolute inset-0 z-10" style={{ width: "100%", height: "100%" }} />;
}

export function PsRulers({
    view,
    size,
    theme,
    onGuidePointerDown,
    onGuidePointerMove,
    onGuidePointerUp,
}: {
    view: { x: number; y: number; k: number };
    size: { w: number; h: number };
    theme: PsTheme;
    onGuidePointerDown: (axis: PsGuideAxis, event: ReactPointerEvent<HTMLDivElement>) => void;
    onGuidePointerMove: (event: ReactPointerEvent<HTMLDivElement>) => void;
    onGuidePointerUp: (event: ReactPointerEvent<HTMLDivElement>) => void;
}) {
    const step = RULER_BASE_TICK * Math.max(1, Math.ceil(RULER_MIN_SPACING / (RULER_BASE_TICK * view.k)));
    const ticksX: number[] = [];
    for (let value = Math.floor(-view.x / view.k / step) * step; view.x + value * view.k <= size.w; value += step) ticksX.push(value);
    const ticksY: number[] = [];
    for (let value = Math.floor(-view.y / view.k / step) * step; view.y + value * view.k <= size.h; value += step) ticksY.push(value);
    const surface = { borderColor: theme.toolbar.border, color: theme.node.muted };

    return (
        <>
            <div className="absolute left-0 top-0 z-30 border-r border-b glass-surface" style={{ ...surface, width: RULER_SIZE, height: RULER_SIZE }} />
            <div
                data-ruler="top"
                className="absolute z-30 cursor-ns-resize border-b select-none glass-surface"
                style={{ ...surface, left: RULER_SIZE, top: 0, width: Math.max(size.w - RULER_SIZE, 0), height: RULER_SIZE }}
                onPointerDown={(event) => onGuidePointerDown("y", event)}
                onPointerMove={onGuidePointerMove}
                onPointerUp={onGuidePointerUp}
                onPointerCancel={onGuidePointerUp}
            >
                {ticksX.map((value) => (
                    <span key={value} className="absolute top-0" style={{ left: view.x + value * view.k - RULER_SIZE + 4, fontSize: 12, lineHeight: `${RULER_SIZE}px` }}>
                        {value}
                    </span>
                ))}
            </div>
            <div
                data-ruler="left"
                className="absolute z-30 cursor-ew-resize border-r select-none glass-surface"
                style={{ ...surface, left: 0, top: RULER_SIZE, width: RULER_SIZE, height: Math.max(size.h - RULER_SIZE, 0) }}
                onPointerDown={(event) => onGuidePointerDown("x", event)}
                onPointerMove={onGuidePointerMove}
                onPointerUp={onGuidePointerUp}
                onPointerCancel={onGuidePointerUp}
            >
                {ticksY.map((value) => (
                    <span key={value} className="absolute left-0" style={{ top: view.y + value * view.k - RULER_SIZE + 4, fontSize: 12, writingMode: "vertical-rl" }}>
                        {value}
                    </span>
                ))}
            </div>
        </>
    );
}

export function PsGrid({ theme, view }: { theme: PsTheme; view: { x: number; y: number; k: number } }) {
    const offsetX = ((view.x % (PS_GRID_SIZE * view.k)) + PS_GRID_SIZE * view.k) % (PS_GRID_SIZE * view.k);
    const offsetY = ((view.y % (PS_GRID_SIZE * view.k)) + PS_GRID_SIZE * view.k) % (PS_GRID_SIZE * view.k);
    return (
        <div
            className="pointer-events-none absolute inset-0"
            style={{
                backgroundImage: `linear-gradient(${theme.node.stroke}44 1px, transparent 1px), linear-gradient(90deg, ${theme.node.stroke}44 1px, transparent 1px)`,
                backgroundSize: `${PS_GRID_SIZE * view.k}px ${PS_GRID_SIZE * view.k}px`,
                backgroundPosition: `${offsetX}px ${offsetY}px`,
            }}
        />
    );
}

export function PsGuides({ guides, draft, theme, onPointerDown, onPointerMove, onPointerUp }: { guides: PsGuides; draft: { axis: PsGuideAxis; value: number } | null; theme: PsTheme; onPointerDown: (axis: PsGuideAxis, value: number, event: ReactPointerEvent<HTMLDivElement>) => void; onPointerMove: (event: ReactPointerEvent<HTMLDivElement>) => void; onPointerUp: (event: ReactPointerEvent<HTMLDivElement>) => void }) {
    const line = (axis: PsGuideAxis, value: number, index: number, active: boolean) => (
        <div
            key={`${axis}-${index}`}
            className="absolute z-20"
            style={{
                cursor: axis === "x" ? "ew-resize" : "ns-resize",
                background: theme.node.activeStroke,
                opacity: active ? 0.9 : 1,
                left: axis === "x" ? value : 0,
                top: axis === "y" ? value : 0,
                width: axis === "x" ? 1 : "100%",
                height: axis === "y" ? 1 : "100%",
            }}
            onPointerDown={(event) => onPointerDown(axis, value, event)}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
        />
    );
    return (
        <>
            {guides.x.map((value, index) => line("x", value, index, false))}
            {guides.y.map((value, index) => line("y", value, index, false))}
            {draft ? line(draft.axis, draft.value, -1, true) : null}
        </>
    );
}

export function PsDraftOverlay({ draft, width, height, theme }: { draft: PsDraft; width: number; height: number; theme: PsTheme }) {
    if (!draft) return null;
    if (draft.kind === "rect") {
        return (
            <div
                className="pointer-events-none absolute z-10"
                style={{ left: draft.x, top: draft.y, width: draft.width, height: draft.height, border: `1px dashed ${theme.node.activeStroke}`, borderRadius: draft.ellipse ? "50%" : undefined }}
            />
        );
    }
    return (
        <svg className="pointer-events-none absolute inset-0 z-10" viewBox={`0 0 ${Math.max(1, width)} ${Math.max(1, height)}`} preserveAspectRatio="none">
            {draft.kind === "path" ? (
                <path d={draft.d} fill="none" stroke={theme.node.activeStroke} strokeWidth={1} strokeDasharray="4 4" />
            ) : (
                <g>
                    <line x1={draft.x1} y1={draft.y1} x2={draft.x2} y2={draft.y2} stroke={theme.node.activeStroke} strokeWidth={1} strokeDasharray="4 4" />
                    <circle cx={draft.x1} cy={draft.y1} r={3} fill={theme.node.activeStroke} />
                </g>
            )}
        </svg>
    );
}

export function PsSnapLines({ lines, theme }: { lines: PsSnapLines; theme: PsTheme }) {
    if (!lines.x.length && !lines.y.length) return null;
    return (
        <>
            {lines.x.map((value) => (
                <div key={`snap-x-${value}`} className="pointer-events-none absolute top-0 bottom-0 z-20 w-px" style={{ left: value, background: theme.node.primary }} />
            ))}
            {lines.y.map((value) => (
                <div key={`snap-y-${value}`} className="pointer-events-none absolute left-0 right-0 z-20 h-px" style={{ top: value, background: theme.node.primary }} />
            ))}
        </>
    );
}

export function PsPathOverlay({
    path,
    theme,
    activeAnchor,
    interactive,
    onAnchorPointerDown,
    onHandlePointerDown,
    onPointerMove,
    onPointerUp,
}: {
    path: CanvasPsPath;
    theme: PsTheme;
    activeAnchor: number;
    interactive: boolean;
    onAnchorPointerDown: (index: number, event: ReactPointerEvent<HTMLDivElement>) => void;
    onHandlePointerDown: (index: number, kind: "in" | "out", event: ReactPointerEvent<HTMLDivElement>) => void;
    onPointerMove: (event: ReactPointerEvent<HTMLDivElement>) => void;
    onPointerUp: (event: ReactPointerEvent<HTMLDivElement>) => void;
}) {
    const size = 7;
    const cursor = interactive ? "crosshair" : "default";
    const dot = (index: number, kind: "in" | "out", x: number, y: number) => (
        <div
            key={`${kind}-${index}`}
            className={interactive ? "pointer-events-auto absolute rounded-full" : "absolute rounded-full"}
            style={{ width: size - 2, height: size - 2, left: x, top: y, transform: "translate(-50%, -50%)", background: theme.toolbar.panel, border: `1px solid ${theme.node.activeStroke}`, cursor }}
            onPointerDown={(event) => interactive && onHandlePointerDown(index, kind, event)}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
        />
    );
    return (
        <div className="pointer-events-none absolute inset-0 z-20">
            <svg className="absolute inset-0 h-full w-full overflow-visible">
                <path d={psPathData(path)} fill="none" stroke={theme.node.activeStroke} strokeWidth={1} />
            </svg>
            {path.anchors.map((anchor, index) => (
                <span key={`line-${index}`}>
                    {dot(index, "in", anchor.x + anchor.handleIn.x, anchor.y + anchor.handleIn.y)}
                    {dot(index, "out", anchor.x + anchor.handleOut.x, anchor.y + anchor.handleOut.y)}
                    <div
                        className={interactive ? "pointer-events-auto absolute" : "absolute"}
                        style={{ width: size, height: size, left: anchor.x, top: anchor.y, transform: "translate(-50%, -50%)", background: index === activeAnchor ? theme.node.activeStroke : theme.toolbar.panel, border: `1px solid ${theme.node.activeStroke}`, cursor: interactive ? "move" : "default" }}
                        onPointerDown={(event) => interactive && onAnchorPointerDown(index, event)}
                        onPointerMove={onPointerMove}
                        onPointerUp={onPointerUp}
                        onPointerCancel={onPointerUp}
                    />
                </span>
            ))}
        </div>
    );
}

export function PsTransformHandles({
    handles,
    theme,
    onPointerDown,
    onPointerMove,
    onPointerUp,
}: {
    handles: { index: number; point: { x: number; y: number } }[];
    theme: PsTheme;
    onPointerDown: (index: number, event: ReactPointerEvent<HTMLDivElement>) => void;
    onPointerMove: (event: ReactPointerEvent<HTMLDivElement>) => void;
    onPointerUp: (event: ReactPointerEvent<HTMLDivElement>) => void;
}) {
    const size = 8;
    return (
        <>
            {handles.map((handle) => (
                <div
                    key={handle.index}
                    className="pointer-events-auto absolute z-20 rounded-[2px]"
                    style={{ width: size, height: size, left: handle.point.x, top: handle.point.y, transform: "translate(-50%, -50%)", background: theme.toolbar.panel, border: `1px solid ${theme.node.activeStroke}`, cursor: "crosshair" }}
                    onPointerDown={(event) => onPointerDown(handle.index, event)}
                    onPointerMove={onPointerMove}
                    onPointerUp={onPointerUp}
                    onPointerCancel={onPointerUp}
                />
            ))}
        </>
    );
}
