import { useCanvasTheme } from "@/hooks/use-canvas-theme";
import type { ViewportTransform } from "@/types/canvas";

const RULER_THICKNESS = 20;
const MIN_TICK_SPACING = 56;
const BASE_TICK = 100;
const TOP_BAR_HEIGHT = 56;

export function CanvasRulers({ viewport, viewportSize }: { viewport: ViewportTransform; viewportSize: { width: number; height: number } }) {
    const theme = useCanvasTheme();
    const step = BASE_TICK * Math.max(1, Math.ceil(MIN_TICK_SPACING / (BASE_TICK * viewport.k)));
    const ticksX: number[] = [];
    for (let value = Math.floor(-viewport.x / viewport.k / step) * step; ; value += step) {
        const screen = viewport.x + value * viewport.k;
        if (screen > viewportSize.width) break;
        if (screen >= RULER_THICKNESS) ticksX.push(value);
    }
    const ticksY: number[] = [];
    for (let value = Math.floor(-viewport.y / viewport.k / step) * step; ; value += step) {
        const screen = viewport.y + value * viewport.k;
        if (screen > viewportSize.height) break;
        if (screen >= TOP_BAR_HEIGHT) ticksY.push(value);
    }
    const surface = { background: theme.toolbar.panel, borderColor: theme.toolbar.border, color: theme.node.text };

    return (
        <>
            <div data-ruler="left" className="pointer-events-none absolute left-0 z-[75] border-r" style={{ ...surface, top: TOP_BAR_HEIGHT, width: RULER_THICKNESS, height: Math.max(viewportSize.height - TOP_BAR_HEIGHT, 0) }}>
                {ticksY.map((value) => (
                    <span key={value} className="absolute left-0 opacity-60" style={{ top: viewport.y + value * viewport.k - TOP_BAR_HEIGHT + 4, fontSize: 10, writingMode: "vertical-rl" }}>
                        {value}
                    </span>
                ))}
            </div>
            <div data-ruler="top" className="pointer-events-none absolute z-[75] border-b" style={{ ...surface, top: TOP_BAR_HEIGHT, left: RULER_THICKNESS, width: Math.max(viewportSize.width - RULER_THICKNESS, 0), height: RULER_THICKNESS }}>
                {ticksX.map((value) => (
                    <span key={value} className="absolute top-0 opacity-60" style={{ left: viewport.x + value * viewport.k + 4 - RULER_THICKNESS, fontSize: 10, lineHeight: `${RULER_THICKNESS}px` }}>
                        {value}
                    </span>
                ))}
            </div>
        </>
    );
}
