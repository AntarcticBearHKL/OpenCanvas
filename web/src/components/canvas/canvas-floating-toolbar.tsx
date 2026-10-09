import type { CSSProperties, ReactNode } from "react";
import { Tooltip } from "antd";

import { type CanvasTheme } from "@/lib/canvas-theme";
import { useCanvasTheme } from "@/hooks/use-canvas-theme";

export const canvasFloatingBarClass = `absolute z-[70] flex h-11 -translate-x-1/2 -translate-y-full items-center gap-0.5 rounded-full border px-1.5`;

export function canvasFloatingBarStyle(theme: CanvasTheme): CSSProperties {
    return {
        background: theme.toolbar.surface,
        borderColor: theme.toolbar.surfaceStroke,
        boxShadow: theme.toolbar.surfaceShadow,
        color: theme.toolbar.itemText,
    };
}

export function CanvasFloatingToolbarDivider() {
    return <span className="mx-1 h-5 w-px shrink-0 bg-current opacity-20" aria-hidden />;
}

export function CanvasFloatingToolbarAction({ title, label, icon, onClick, showLabel = true, active = false, danger = false }: { title: string; label?: string; icon: ReactNode; onClick: () => void; showLabel?: boolean; active?: boolean; danger?: boolean }) {
    const theme = useCanvasTheme();
    const hasText = showLabel && Boolean(label);
    return (
        <Tooltip title={title} placement="top" mouseEnterDelay={0.2}>
            <button type="button" className="group relative flex h-11 items-center whitespace-nowrap px-0.5" style={{ color: danger ? theme.node.danger : theme.toolbar.itemText }} onClick={onClick} aria-label={title}>
                <span
                    className={`flex h-8 items-center rounded-full transition ${hasText ? "gap-2 px-2.5" : "w-8 justify-center"} group-hover:bg-hover`}
                    style={active ? { background: theme.toolbar.accentBg, color: theme.toolbar.accentText } : undefined}
                >
                    {icon}
                    {hasText ? <span className="text-[13px] font-medium">{label}</span> : null}
                </span>
            </button>
        </Tooltip>
    );
}
