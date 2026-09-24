import { useEffect, useRef, useState, type HTMLAttributes, type PointerEvent as ReactPointerEvent, type ReactNode, type Ref } from "react";
import { useTranslation } from "react-i18next";

import { DockTabs } from "@/components/canvas/dock/dock-tabs";
import { DOCK_EDGES, dockClampSize, dockDefaultLayout, dockLoadLayout, dockMovePanel, dockRevealPanel, dockSaveLayout, dockSetActive, dockSetSize, dockTogglePanel, type DockEdge, type DockLayout, type DockPanelDef } from "@/components/canvas/dock/dock-layout";
import { useCanvasTheme } from "@/hooks/use-canvas-theme";

export type DockEdgeProps = { ref?: Ref<HTMLElement> } & HTMLAttributes<HTMLElement>;

type DockAreaProps = {
    defs: DockPanelDef[];
    layout: DockLayout;
    renderPanel: (id: string) => ReactNode;
    onActivate: (edge: DockEdge, id: string) => void;
    onMove: (id: string, edge: DockEdge) => void;
    onResize: (edge: DockEdge, size: number) => void;
    /** Layout direction of the centre region; the audio studio stacks it on narrow screens. */
    rowClassName?: string;
    /** Per-edge display/positioning classes; defaults to a plain in-flow flex column. */
    edgeClassName?: Partial<Record<DockEdge, string>>;
    edgeProps?: Partial<Record<DockEdge, DockEdgeProps>>;
    children: ReactNode;
};

type ResizeState = { edge: DockEdge; startX: number; startY: number; size: number };
type DragState = { id: string; moved: boolean; startX: number; startY: number };

const DRAG_THRESHOLD = 6;
const DROP_ZONE_CLASS = "pointer-events-none absolute rounded-[2px] border border-dashed";
const SPLITTER_CLASS = "group/splitter relative shrink-0 before:absolute before:inset-0 before:m-auto before:transition hover:before:bg-hover";
/** Below these widths the docks give width back to the centre surface instead of keeping the saved size. */
const DOCK_WIDTH_STEPS: { query: string; side: number; bottom: number }[] = [
    { query: "(max-width: 1023px)", side: 208, bottom: 160 },
    { query: "(max-width: 1439px)", side: 240, bottom: 200 },
];
const dockWidthLimits = () => DOCK_WIDTH_STEPS.find((step) => window.matchMedia(step.query).matches) ?? null;

export function useDockLayout(studio: string, defs: DockPanelDef[]) {
    const [layout, setLayout] = useState<DockLayout>(() => dockLoadLayout(studio, defs));
    const commit = (next: DockLayout) => {
        dockSaveLayout(studio, next);
        setLayout(next);
    };
    return {
        layout,
        toggle: (id: string) => commit(dockTogglePanel(layout, defs, id)),
        reveal: (id: string) => commit(dockRevealPanel(layout, defs, id)),
        move: (id: string, edge: DockEdge) => commit(dockMovePanel(layout, id, edge)),
        activate: (edge: DockEdge, id: string) => commit(dockSetActive(layout, edge, id)),
        resize: (edge: DockEdge, size: number) => commit(dockSetSize(layout, edge, size)),
        reset: () => commit(dockDefaultLayout(defs)),
    };
}

export function DockArea({ defs, layout, renderPanel, onActivate, onMove, onResize, rowClassName = "", edgeClassName, edgeProps, children }: DockAreaProps) {
    const { t } = useTranslation();
    const theme = useCanvasTheme();
    const areaRef = useRef<HTMLDivElement>(null);
    const resizeRef = useRef<ResizeState | null>(null);
    const dragRef = useRef<DragState | null>(null);
    // The splitter drag and the dragged panel stay in local state so neither re-renders the studio centre per frame.
    const [preview, setPreview] = useState<{ edge: DockEdge; size: number } | null>(null);
    const [drag, setDrag] = useState<{ id: string; x: number; y: number; target: DockEdge | null } | null>(null);
    const [limits, setLimits] = useState(dockWidthLimits);
    const fitSize = (edge: DockEdge, size: number) => (limits ? Math.min(size, edge === "bottom" ? limits.bottom : limits.side) : size);

    useEffect(() => {
        const apply = () => setLimits(dockWidthLimits());
        window.addEventListener("resize", apply);
        return () => window.removeEventListener("resize", apply);
    }, []);

    const delta = (state: ResizeState, event: { clientX: number; clientY: number }) =>
        state.edge === "bottom" ? state.startY - event.clientY : state.edge === "left" ? event.clientX - state.startX : state.startX - event.clientX;
    const beginResize = (event: ReactPointerEvent<HTMLDivElement>, edge: DockEdge) => {
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        resizeRef.current = { edge, startX: event.clientX, startY: event.clientY, size: layout.sizes[edge] };
    };
    const moveResize = (event: ReactPointerEvent<HTMLDivElement>) => {
        const state = resizeRef.current;
        if (state) setPreview({ edge: state.edge, size: fitSize(state.edge, dockClampSize(state.edge, state.size + delta(state, event))) });
    };
    const endResize = (event: ReactPointerEvent<HTMLDivElement>) => {
        const state = resizeRef.current;
        resizeRef.current = null;
        setPreview(null);
        if (state) onResize(state.edge, fitSize(state.edge, state.size + delta(state, event)));
    };

    const dropTarget = (clientX: number, clientY: number): DockEdge | null => {
        const rect = areaRef.current?.getBoundingClientRect();
        if (!rect || !rect.width || !rect.height) return null;
        if (clientY - rect.top > rect.height * 0.75) return "bottom";
        if (clientX - rect.left < rect.width * 0.25) return "left";
        if (rect.right - clientX < rect.width * 0.25) return "right";
        return null;
    };
    const beginPanelDrag = (event: ReactPointerEvent<HTMLButtonElement>, id: string) => {
        if (event.button !== 0) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        dragRef.current = { id, moved: false, startX: event.clientX, startY: event.clientY };
    };
    const movePanelDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
        const state = dragRef.current;
        if (!state) return;
        const moved = state.moved || Math.abs(event.clientX - state.startX) + Math.abs(event.clientY - state.startY) > DRAG_THRESHOLD;
        dragRef.current = { ...state, moved };
        if (moved) setDrag({ id: state.id, x: event.clientX, y: event.clientY, target: dropTarget(event.clientX, event.clientY) });
    };
    const endPanelDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
        const state = dragRef.current;
        dragRef.current = null;
        setDrag(null);
        if (!state?.moved) return;
        const target = dropTarget(event.clientX, event.clientY);
        if (target) onMove(state.id, target);
    };
    const tabHandlers = (id: string) => ({ onPointerDown: (event: ReactPointerEvent<HTMLButtonElement>) => beginPanelDrag(event, id), onPointerMove: movePanelDrag, onPointerUp: endPanelDrag, onPointerCancel: endPanelDrag });

    const column = (edge: DockEdge) => {
        const ids = layout.stacks[edge];
        if (!ids.length) return null;
        const active = ids.includes(layout.active[edge]) ? layout.active[edge] : ids[0];
        const side = edge !== "bottom";
        const size = fitSize(edge, preview?.edge === edge ? preview.size : layout.sizes[edge]);
        const splitter = (
            <div
                role="separator"
                aria-orientation={side ? "vertical" : "horizontal"}
                aria-label={t("canvas.dock.resize")}
                className={`${SPLITTER_CLASS} ${side ? "w-1.5 cursor-col-resize" : "h-1.5 cursor-row-resize"}`}
                onPointerDown={(event) => beginResize(event, edge)}
                onPointerMove={moveResize}
                onPointerUp={endResize}
                onPointerCancel={endResize}
            >
                <span aria-hidden className="absolute inset-0 m-auto" style={{ background: theme.toolbar.border, width: side ? 1 : "100%", height: side ? "100%" : 1 }} />
            </div>
        );
        return (
            <section
                {...edgeProps?.[edge]}
                className={`shrink-0 overflow-hidden ${side ? "flex-row" : "flex-col"} ${edgeClassName?.[edge] ?? "flex"}`}
                style={{ ...(side ? { width: size } : { height: size }), background: theme.toolbar.panel, ...edgeProps?.[edge]?.style }}
            >
                {edge === "left" ? null : splitter}
                <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
                    <DockTabs tabs={ids.map((id) => ({ id, label: t(defs.find((def) => def.id === id)?.labelKey ?? id), handlers: tabHandlers(id) }))} value={active} onChange={(id) => onActivate(edge, id)} />
                    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">{renderPanel(active)}</div>
                </div>
                {edge === "left" ? splitter : null}
            </section>
        );
    };

    return (
        <div ref={areaRef} className="relative flex min-h-0 min-w-0 flex-1 flex-col">
            <div className={`relative flex min-h-0 min-w-0 flex-1 ${rowClassName}`}>
                {column("left")}
                {children}
                {column("right")}
            </div>
            {column("bottom")}
            {drag ? (
                <div className="absolute inset-0 z-40">
                    {DOCK_EDGES.map((edge) => (
                        <span
                            key={edge}
                            aria-hidden
                            className={`${DROP_ZONE_CLASS} ${edge === "left" ? "inset-y-0 left-0 w-1/4" : edge === "right" ? "inset-y-0 right-0 w-1/4" : "inset-x-0 bottom-0 h-1/4"}`}
                            style={{ borderColor: theme.node.activeStroke, background: drag.target === edge ? theme.toolbar.activeBg : undefined }}
                        />
                    ))}
                    <span className="pointer-events-none fixed z-50 rounded-[2px] border px-2 py-1 text-xs" style={{ left: drag.x + 12, top: drag.y + 12, borderColor: theme.toolbar.border, background: theme.toolbar.panel, color: theme.node.text }}>
                        {t(defs.find((def) => def.id === drag.id)?.labelKey ?? drag.id)}
                    </span>
                </div>
            ) : null}
        </div>
    );
}
