import { Fragment, useEffect, useRef, useState, type CSSProperties, type HTMLAttributes, type PointerEvent as ReactPointerEvent, type ReactNode, type Ref } from "react";
import { useTranslation } from "react-i18next";

import { DockTabs } from "@/components/canvas/dock/dock-tabs";
import { DOCK_MIN_GROUP_SIZE, DOCK_SPLIT_MIN, dockClampSize, dockDefaultLayout, dockLoadLayout, dockMovePanel, dockRevealPanel, dockSaveLayout, dockSetActive, dockSetSize, dockSetSplit, dockTogglePanel, type DockEdge, type DockGroup, type DockLayout, type DockPanelDef, type DockSide } from "@/components/canvas/dock/dock-layout";
import { useCanvasTheme } from "@/hooks/use-canvas-theme";

export type DockEdgeProps = { ref?: Ref<HTMLElement> } & HTMLAttributes<HTMLElement>;

type DockAreaProps = {
    defs: DockPanelDef[];
    layout: DockLayout;
    renderPanel: (id: string) => ReactNode;
    onActivate: (edge: DockEdge, groupIndex: number, id: string) => void;
    onMove: (id: string, edge: DockEdge, groupIndex: number) => void;
    onResize: (edge: DockEdge, size: number) => void;
    onSplit: (edge: DockSide, ratio: number) => void;
    /** Layout direction of the centre region; the audio studio stacks it on narrow screens. */
    rowClassName?: string;
    /** Per-edge display/positioning classes; defaults to a plain in-flow flex column. */
    edgeClassName?: Partial<Record<DockEdge, string>>;
    edgeProps?: Partial<Record<DockEdge, DockEdgeProps>>;
    children: ReactNode;
};

type ResizeState = { edge: DockEdge; startX: number; startY: number; size: number };
type SplitState = { edge: DockSide; startY: number; startRatio: number; height: number };
type DragState = { id: string; moved: boolean; startX: number; startY: number };
type DropTarget = { edge: DockEdge; groupIndex: number };

const DRAG_THRESHOLD = 6;
const DROP_ZONE_CLASS = "pointer-events-none absolute rounded-md border border-dashed";
const SPLITTER_CLASS = "group/splitter relative shrink-0 before:absolute before:inset-0 before:m-auto before:transition hover:before:bg-hover";
/** Below these widths the docks give width back to the centre surface instead of keeping the saved size. */
const DOCK_WIDTH_STEPS: { query: string; side: number; bottom: number }[] = [
    { query: "(max-width: 1023px)", side: 208, bottom: 160 },
    { query: "(max-width: 1439px)", side: 240, bottom: 200 },
];
const dockWidthLimits = () => DOCK_WIDTH_STEPS.find((step) => window.matchMedia(step.query).matches) ?? null;
/** The 0.2–0.8 ratio plus a minimum group height, both relative to the usable stacked height. */
const splitBounds = (height: number) => {
    const min = Math.min(0.5, Math.max(DOCK_SPLIT_MIN, height > 0 ? DOCK_MIN_GROUP_SIZE / height : DOCK_SPLIT_MIN));
    return { min, max: 1 - min };
};

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
        move: (id: string, edge: DockEdge, groupIndex = 0) => commit(dockMovePanel(layout, id, edge, groupIndex)),
        activate: (edge: DockEdge, groupIndex: number, id: string) => commit(dockSetActive(layout, edge, groupIndex, id)),
        resize: (edge: DockEdge, size: number) => commit(dockSetSize(layout, edge, size)),
        split: (edge: DockSide, ratio: number) => commit(dockSetSplit(layout, edge, ratio)),
        reset: () => commit(dockDefaultLayout(defs)),
    };
}

export function DockArea({ defs, layout, renderPanel, onActivate, onMove, onResize, onSplit, rowClassName = "", edgeClassName, edgeProps, children }: DockAreaProps) {
    const { t } = useTranslation();
    const theme = useCanvasTheme();
    const areaRef = useRef<HTMLDivElement>(null);
    const resizeRef = useRef<ResizeState | null>(null);
    const splitRef = useRef<SplitState | null>(null);
    const dragRef = useRef<DragState | null>(null);
    // The splitter drag and the dragged panel stay in local state so neither re-renders the studio centre per frame.
    const [preview, setPreview] = useState<{ edge: DockEdge; size: number } | null>(null);
    const [splitPreview, setSplitPreview] = useState<{ edge: DockSide; ratio: number } | null>(null);
    const [drag, setDrag] = useState<{ id: string; x: number; y: number; target: DropTarget | null } | null>(null);
    const [limits, setLimits] = useState(dockWidthLimits);
    const fitSize = (edge: DockEdge, size: number) => (limits ? Math.min(size, edge === "bottom" ? limits.bottom : limits.side) : size);

    useEffect(() => {
        const apply = () => setLimits(dockWidthLimits());
        window.addEventListener("resize", apply);
        return () => window.removeEventListener("resize", apply);
    }, []);

    const splitter = (orientation: "vertical" | "horizontal", label: string, className: string, handlers: Pick<HTMLAttributes<HTMLDivElement>, "onPointerDown" | "onPointerMove" | "onPointerUp" | "onPointerCancel">) => (
        <div role="separator" aria-orientation={orientation} aria-label={label} className={`${SPLITTER_CLASS} ${className}`} {...handlers}>
            <span aria-hidden className="absolute inset-0 m-auto" style={{ background: theme.toolbar.border, width: orientation === "vertical" ? 1 : "100%", height: orientation === "vertical" ? "100%" : 1 }} />
        </div>
    );

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

    const beginSplit = (event: ReactPointerEvent<HTMLDivElement>, edge: DockSide) => {
        event.preventDefault();
        const height = event.currentTarget.parentElement?.getBoundingClientRect().height ?? 0;
        if (!height) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        splitRef.current = { edge, startY: event.clientY, startRatio: layout.split[edge], height };
    };
    const moveSplit = (event: ReactPointerEvent<HTMLDivElement>) => {
        const state = splitRef.current;
        if (!state) return;
        const { min, max } = splitBounds(state.height);
        const ratio = state.startRatio + (event.clientY - state.startY) / state.height;
        setSplitPreview({ edge: state.edge, ratio: Math.min(max, Math.max(min, ratio)) });
    };
    const endSplit = (event: ReactPointerEvent<HTMLDivElement>) => {
        const state = splitRef.current;
        splitRef.current = null;
        setSplitPreview(null);
        if (!state) return;
        const { min, max } = splitBounds(state.height);
        const ratio = state.startRatio + (event.clientY - state.startY) / state.height;
        onSplit(state.edge, Math.min(max, Math.max(min, ratio)));
    };

    const dropTarget = (clientX: number, clientY: number): DropTarget | null => {
        const rect = areaRef.current?.getBoundingClientRect();
        if (!rect || !rect.width || !rect.height) return null;
        if (clientY - rect.top > rect.height * 0.75) return { edge: "bottom", groupIndex: 0 };
        const groupIndex = clientY - rect.top < rect.height / 2 ? 0 : 1;
        if (clientX - rect.left < rect.width * 0.25) return { edge: "left", groupIndex };
        if (rect.right - clientX < rect.width * 0.25) return { edge: "right", groupIndex };
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
        if (target) onMove(state.id, target.edge, target.groupIndex);
    };
    const tabHandlers = (id: string) => ({ onPointerDown: (event: ReactPointerEvent<HTMLButtonElement>) => beginPanelDrag(event, id), onPointerMove: movePanelDrag, onPointerUp: endPanelDrag, onPointerCancel: endPanelDrag });

    const groupView = (edge: DockEdge, group: DockGroup, groupIndex: number, style: CSSProperties) => {
        const active = group.panels.includes(group.active) ? group.active : group.panels[0];
        return (
            <div className="flex min-h-0 min-w-0 flex-col overflow-hidden" style={style}>
                <DockTabs
                    tabs={group.panels.map((id) => ({ id, label: t(defs.find((def) => def.id === id)?.labelKey ?? id), handlers: tabHandlers(id) }))}
                    value={active}
                    onChange={(id) => onActivate(edge, groupIndex, id)}
                />
                <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">{renderPanel(active)}</div>
            </div>
        );
    };

    const column = (edge: DockEdge) => {
        const groups = layout.groups[edge];
        if (!groups.length) return null;
        const side = edge !== "bottom";
        const size = fitSize(edge, preview?.edge === edge ? preview.size : layout.sizes[edge]);
        const ratio = edge === "bottom" ? 1 : splitPreview?.edge === edge ? splitPreview.ratio : layout.split[edge];
        const outerSplitter = splitter(side ? "vertical" : "horizontal", t("canvas.dock.resize"), side ? "w-1.5 cursor-col-resize" : "h-1.5 cursor-row-resize", {
            onPointerDown: (event) => beginResize(event, edge),
            onPointerMove: moveResize,
            onPointerUp: endResize,
            onPointerCancel: endResize,
        });
        return (
            <section
                {...edgeProps?.[edge]}
                className={`shrink-0 overflow-hidden ${side ? "flex-row" : "flex-col"} ${edgeClassName?.[edge] ?? "flex"}`}
                style={{ ...(side ? { width: size } : { height: size }), background: theme.toolbar.panel, ...edgeProps?.[edge]?.style }}
            >
                {edge === "left" ? null : outerSplitter}
                <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
                    {groups.map((group, index) => (
                        <Fragment key={index}>
                            {index > 0 && edge !== "bottom"
                                ? splitter("horizontal", t("canvas.dock.resizeSplit"), "h-1.5 cursor-row-resize", {
                                      onPointerDown: (event) => beginSplit(event, edge),
                                      onPointerMove: moveSplit,
                                      onPointerUp: endSplit,
                                      onPointerCancel: endSplit,
                                  })
                                : null}
                            {groupView(edge, group, index, groups.length === 1 ? { flex: "1 1 0%" } : index === 0 ? { flex: `0 0 ${ratio * 100}%`, minHeight: DOCK_MIN_GROUP_SIZE } : { flex: "1 1 0%", minHeight: DOCK_MIN_GROUP_SIZE })}
                        </Fragment>
                    ))}
                </div>
                {edge === "left" ? outerSplitter : null}
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
                    {(["left", "right"] as const).map((edge) => (
                        <Fragment key={edge}>
                            {[0, 1].map((groupIndex) => (
                                <span
                                    key={groupIndex}
                                    aria-hidden
                                    className={`${DROP_ZONE_CLASS} ${edge === "left" ? "left-0 w-1/4" : "right-0 w-1/4"} ${groupIndex === 0 ? "top-0 h-1/2" : "bottom-0 h-1/2"}`}
                                    style={{ borderColor: theme.node.activeStroke, background: drag.target?.edge === edge && drag.target.groupIndex === groupIndex ? theme.toolbar.activeBg : undefined }}
                                />
                            ))}
                        </Fragment>
                    ))}
                    <span
                        aria-hidden
                        className={`${DROP_ZONE_CLASS} inset-x-0 bottom-0 h-1/4`}
                        style={{ borderColor: theme.node.activeStroke, background: drag.target?.edge === "bottom" ? theme.toolbar.activeBg : undefined }}
                    />
                    <span className="pointer-events-none fixed z-50 rounded-md border px-2 py-1 text-xs" style={{ left: drag.x + 12, top: drag.y + 12, borderColor: theme.toolbar.border, background: theme.toolbar.panel, color: theme.node.text }}>
                        {t(defs.find((def) => def.id === drag.id)?.labelKey ?? drag.id)}
                    </span>
                </div>
            ) : null}
        </div>
    );
}
