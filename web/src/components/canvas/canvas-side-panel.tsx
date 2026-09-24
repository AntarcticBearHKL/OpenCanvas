import { useState, type PointerEvent as ReactPointerEvent } from "react";
import { PanelLeftClose } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { useTranslation } from "react-i18next";

import { useCanvasTheme } from "@/hooks/use-canvas-theme";
import { CANVAS_SIDE_PANEL_MAX_WIDTH, CANVAS_SIDE_PANEL_MIN_WIDTH, CANVAS_SIDE_PANEL_MOTION_MS, useCanvasSidePanelStore } from "@/stores/use-canvas-side-panel-store";

import { CanvasSwitcherTab } from "./canvas-switcher";

const PANEL_MOTION_SECONDS = CANVAS_SIDE_PANEL_MOTION_MS / 1000;
const PANEL_EASE = [0.22, 1, 0.36, 1] as const;

export function CanvasSidePanel() {
    const { t } = useTranslation();
    const theme = useCanvasTheme();
    const width = useCanvasSidePanelStore((state) => state.width);
    const panelOpen = useCanvasSidePanelStore((state) => state.panelOpen);
    const panelMounted = useCanvasSidePanelStore((state) => state.panelMounted);
    const panelClosing = useCanvasSidePanelStore((state) => state.panelClosing);
    const setWidth = useCanvasSidePanelStore((state) => state.setWidth);
    const closePanel = useCanvasSidePanelStore((state) => state.closePanel);
    const [resizing, setResizing] = useState(false);
    const reduceMotion = useReducedMotion();

    const startResize = (event: ReactPointerEvent<HTMLButtonElement>) => {
        event.preventDefault();
        const startX = event.clientX;
        const startWidth = width;
        let nextWidth = startWidth;
        const onMove = (moveEvent: PointerEvent) => {
            nextWidth = Math.min(CANVAS_SIDE_PANEL_MAX_WIDTH, Math.max(CANVAS_SIDE_PANEL_MIN_WIDTH, startWidth + moveEvent.clientX - startX));
            setWidth(nextWidth);
        };
        const onUp = () => {
            localStorage.setItem("canvas-side-panel-width", String(nextWidth));
            window.removeEventListener("pointermove", onMove);
            window.removeEventListener("pointerup", onUp);
            setResizing(false);
        };
        setResizing(true);
        window.addEventListener("pointermove", onMove);
        window.addEventListener("pointerup", onUp);
    };

    if (!panelMounted) return null;

    return (
        <motion.div
            className="relative z-[60] flex h-full shrink-0 max-md:absolute max-md:bottom-0 max-md:left-0 max-md:top-16 max-md:h-auto max-md:max-w-[85vw]"
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: panelOpen ? width + 1 : 0, opacity: panelOpen ? 1 : 0 }}
            transition={{ duration: resizing || reduceMotion ? 0 : PANEL_MOTION_SECONDS, ease: PANEL_EASE }}
            style={{ overflow: "clip", pointerEvents: panelClosing ? "none" : undefined }}
        >
            <motion.aside
                className="relative flex h-full shrink-0 flex-col overflow-hidden border-r max-md:max-w-[85vw] glass-surface"
                initial={{ x: -48 }}
                animate={{ x: panelClosing ? -28 : 0 }}
                transition={{ duration: resizing || reduceMotion ? 0 : PANEL_MOTION_SECONDS, ease: PANEL_EASE }}
                style={{ width, borderColor: theme.toolbar.border, color: theme.node.text }}
                data-canvas-no-zoom
            >
                <div className="flex items-center px-3 pt-3.5 md:hidden">
                    <button type="button" onClick={closePanel} className="ml-auto grid size-7 place-items-center rounded-[2px] transition hover:bg-hover" aria-label={t("canvas.collapsePanel")}>
                        <PanelLeftClose className="size-4" />
                    </button>
                </div>
                <div className="mt-2 min-h-0 flex-1 overflow-hidden">
                    <CanvasSwitcherTab theme={theme} />
                </div>
                <button type="button" className="absolute inset-y-0 right-0 z-40 w-4 translate-x-1/2 cursor-col-resize" onPointerDown={startResize} aria-label={t("canvas.sidePanel.resize")} />
            </motion.aside>
        </motion.div>
    );
}
