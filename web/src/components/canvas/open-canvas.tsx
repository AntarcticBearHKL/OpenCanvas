import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

import { type CanvasBackgroundMode } from "@/lib/canvas-theme";
import { isCanvasOverlayTarget } from "@/lib/canvas/canvas-overlays";
import { setViewportSignal } from "@/lib/canvas/viewport-signal";
import { useCanvasTheme } from "@/hooks/use-canvas-theme";
import type { ViewportTransform } from "@/types/canvas";

const GRID_SIZE = 48;

type OpenCanvasProps = {
    containerRef: React.RefObject<HTMLDivElement | null>;
    viewport: ViewportTransform;
    tool: "select" | "pan";
    backgroundMode?: CanvasBackgroundMode;
    onViewportChange: (viewport: ViewportTransform) => void;
    onCanvasMouseDown?: (event: React.PointerEvent<HTMLDivElement>) => void;
    onCanvasDeselect?: () => void;
    onDrop?: (event: React.DragEvent<HTMLDivElement>) => void;
    children: React.ReactNode;
};

export function OpenCanvas({ containerRef, viewport, tool, backgroundMode = "dots", onViewportChange, onCanvasMouseDown, onCanvasDeselect, onDrop, children }: OpenCanvasProps) {
    const theme = useCanvasTheme();
    const panState = useRef({
        isPanning: false,
        startX: 0,
        startY: 0,
        initialX: 0,
        initialY: 0,
        hasMoved: false,
        startedOnBackground: false,
    });
    const scaleRef = useRef(viewport.k);
    const viewportRef = useRef(viewport);
    const wheelRef = useRef({ delta: 0, clientX: 0, clientY: 0 });
    const zoomMarkerRef = useRef<number | null>(null);
    const frameRef = useRef<number | null>(null);
    const nextViewportRef = useRef<ViewportTransform | null>(null);
    const contentRef = useRef<HTMLDivElement>(null);
    const gridRef = useRef<HTMLDivElement>(null);
    const [isSpacePressed, setIsSpacePressed] = useState(false);
    const [isControlPressed, setIsControlPressed] = useState(false);
    const [isPanning, setIsPanning] = useState(false);

    // Pan / zoom run entirely on the compositor: the transform and grid are written straight to the DOM while a
    // gesture is active, so React never re-renders the canvas tree per frame. State is committed once on release.
    const applyViewport = useCallback((next: ViewportTransform) => {
        const content = contentRef.current;
        if (content) content.style.transform = `translate(${next.x}px, ${next.y}px) scale(${next.k})`;
        const grid = gridRef.current;
        if (grid) {
            const gridSize = GRID_SIZE * next.k;
            grid.style.backgroundSize = `${gridSize}px ${gridSize}px`;
            grid.style.backgroundPosition = `${next.x % gridSize}px ${next.y % gridSize}px`;
        }
        setViewportSignal(next);
    }, []);

    useLayoutEffect(() => {
        scaleRef.current = viewport.k;
        viewportRef.current = viewport;
        applyViewport(viewport);
    }, [viewport, applyViewport]);

    useEffect(
        () => () => {
            if (frameRef.current) cancelAnimationFrame(frameRef.current);
            if (zoomMarkerRef.current) window.clearTimeout(zoomMarkerRef.current);
        },
        [],
    );

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Control") setIsControlPressed(true);
            if (event.code !== "Space") return;
            const target = event.target instanceof Element ? event.target : null;
            if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLSelectElement || target?.closest("[contenteditable='true']")) return;
            event.preventDefault();
            setIsSpacePressed(true);
        };

        const handleKeyUp = (event: KeyboardEvent) => {
            if (event.code === "Space") {
                const target = event.target instanceof Element ? event.target : null;
                if (!(event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLSelectElement || target?.closest("[contenteditable='true']"))) event.preventDefault();
                setIsSpacePressed(false);
            }
            if (event.key === "Control") setIsControlPressed(false);
        };

        const handleBlur = () => {
            setIsSpacePressed(false);
            setIsControlPressed(false);
            panState.current.isPanning = false;
            setIsPanning(false);
            document.body.style.cursor = "";
        };

        window.addEventListener("keydown", handleKeyDown);
        window.addEventListener("keyup", handleKeyUp);
        window.addEventListener("blur", handleBlur);
        return () => {
            window.removeEventListener("keydown", handleKeyDown);
            window.removeEventListener("keyup", handleKeyUp);
            window.removeEventListener("blur", handleBlur);
        };
    }, []);

    const handleWheel = (event: React.WheelEvent<HTMLDivElement>) => {
        if (isCanvasOverlayTarget(event.target)) return;
        const container = containerRef.current;
        if (!container) return;

        const wheel = wheelRef.current;
        wheel.delta += -event.deltaY;
        wheel.clientX = event.clientX;
        wheel.clientY = event.clientY;

        container.dataset.canvasZooming = "true";
        if (zoomMarkerRef.current) window.clearTimeout(zoomMarkerRef.current);
        zoomMarkerRef.current = window.setTimeout(() => {
            zoomMarkerRef.current = null;
            delete containerRef.current?.dataset.canvasZooming;
            onViewportChange(viewportRef.current);
        }, 160);

        if (frameRef.current) return;
        frameRef.current = requestAnimationFrame(() => {
            frameRef.current = null;
            const rect = containerRef.current?.getBoundingClientRect();
            if (!rect) return;
            const pending = wheelRef.current;
            const delta = pending.delta;
            pending.delta = 0;
            if (!delta) return;
            const current = viewportRef.current;
            const factor = Math.pow(1.1, delta / 100);
            const newScale = Math.min(Math.max(current.k * factor, 0.05), 5);
            const mouseX = pending.clientX - rect.left;
            const mouseY = pending.clientY - rect.top;
            const worldX = (mouseX - current.x) / current.k;
            const worldY = (mouseY - current.y) / current.k;
            const next = {
                x: mouseX - worldX * newScale,
                y: mouseY - worldY * newScale,
                k: newScale,
            };
            scaleRef.current = next.k;
            viewportRef.current = next;
            applyViewport(next);
        });
    };

    const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
        const target = event.target instanceof Element ? event.target : null;
        if (isCanvasOverlayTarget(event.target)) return;
        if (target?.closest("[data-connection-create-menu]")) return;
        const isBackgroundClick = !target?.closest("[data-node-id],[data-connection-id]");
        const temporaryTool = event.ctrlKey || isSpacePressed;
        const activeTool = temporaryTool ? (tool === "select" ? "pan" : "select") : tool;
        const shouldPan = event.button === 1 || (event.button === 0 && activeTool === "pan" && isBackgroundClick);

        if (shouldPan) {
            event.preventDefault();
            event.currentTarget.setPointerCapture(event.pointerId);
            panState.current = {
                isPanning: true,
                startX: event.clientX,
                startY: event.clientY,
                initialX: viewportRef.current.x,
                initialY: viewportRef.current.y,
                hasMoved: false,
                startedOnBackground: isBackgroundClick,
            };
            setIsPanning(true);
            document.body.style.cursor = "grabbing";
            return;
        }

        if (event.button === 0 && isBackgroundClick) {
            event.preventDefault();
            event.currentTarget.setPointerCapture(event.pointerId);
            onCanvasMouseDown?.(event);
        }
    };

    useEffect(() => {
        const handlePointerMove = (event: PointerEvent) => {
            if (!panState.current.isPanning) return;

            const dx = event.clientX - panState.current.startX;
            const dy = event.clientY - panState.current.startY;
            if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
                panState.current.hasMoved = true;
            }

            const next = {
                x: panState.current.initialX + dx,
                y: panState.current.initialY + dy,
                k: scaleRef.current,
            };
            nextViewportRef.current = next;
            viewportRef.current = next;
            if (frameRef.current) return;
            frameRef.current = requestAnimationFrame(() => {
                frameRef.current = null;
                const pending = nextViewportRef.current;
                if (pending) applyViewport(pending);
            });
        };

        const handlePointerUp = () => {
            if (!panState.current.isPanning) return;

            if (!panState.current.hasMoved && panState.current.startedOnBackground) {
                onCanvasDeselect?.();
            }
            const final = nextViewportRef.current;
            if (panState.current.hasMoved && final) {
                applyViewport(final);
                onViewportChange(final);
            }
            panState.current.isPanning = false;
            setIsPanning(false);
            document.body.style.cursor = "";
        };

        window.addEventListener("pointermove", handlePointerMove);
        window.addEventListener("pointerup", handlePointerUp);
        window.addEventListener("pointercancel", handlePointerUp);
        return () => {
            window.removeEventListener("pointermove", handlePointerMove);
            window.removeEventListener("pointerup", handlePointerUp);
            window.removeEventListener("pointercancel", handlePointerUp);
            document.body.style.cursor = "";
        };
    }, [applyViewport, onCanvasDeselect, onViewportChange]);

    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        // Prevent canvas scrolling from moving the page while preserving native scrolling inside overlays and dialogs.
        const preventWheelScroll = (event: WheelEvent) => {
            if (isCanvasOverlayTarget(event.target)) return;
            event.preventDefault();
        };
        container.addEventListener("wheel", preventWheelScroll, { passive: false });
        return () => container.removeEventListener("wheel", preventWheelScroll);
    }, [containerRef]);

    const temporaryTool = isControlPressed || isSpacePressed;
    const activeTool = temporaryTool ? (tool === "select" ? "pan" : "select") : tool;
    const cursor = isPanning ? "grabbing" : activeTool === "pan" ? "grab" : undefined;
    const dotSize = viewport.k < 0.12 ? 0.8 : 1.15;
    const gridImage =
        backgroundMode === "dots" ? `radial-gradient(circle, ${theme.canvas.dot} ${dotSize}px, transparent ${dotSize + 0.2}px)` : backgroundMode === "blank" ? undefined : `linear-gradient(${theme.canvas.line} 1px, transparent 1px), linear-gradient(90deg, ${theme.canvas.line} 1px, transparent 1px)`;

    return (
        <div
            ref={containerRef}
            className="relative h-full w-full select-none overflow-hidden"
            style={{ background: theme.canvas.background, cursor }}
            onPointerDown={handlePointerDown}
            onWheel={handleWheel}
            onDragOver={(event) => event.preventDefault()}
            onDrop={onDrop}
        >
            {gridImage ? <div ref={gridRef} className="pointer-events-none absolute inset-0 opacity-40" style={{ backgroundImage: gridImage }} /> : null}
            <div ref={contentRef} className="absolute origin-top-left" style={{ willChange: "transform" }}>
                {children}
            </div>
        </div>
    );
}
