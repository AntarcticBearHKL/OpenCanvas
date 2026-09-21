import type { CSSProperties, ReactNode } from "react";
import { Tooltip } from "antd";

import { frostedSurfaceClass, type CanvasTheme } from "@/lib/canvas-theme";
import { useCanvasTheme } from "@/hooks/use-canvas-theme";

export const canvasFloatingBarClass = `absolute z-[70] flex h-12 -translate-x-1/2 -translate-y-full items-center overflow-visible rounded-2xl border ${frostedSurfaceClass}`;

export function canvasFloatingBarStyle(theme: CanvasTheme): CSSProperties {
    return { background: theme.toolbar.panel, borderColor: theme.toolbar.border, color: theme.node.text };
}

export function CanvasFloatingToolbarAction({ title, label, icon, onClick, showLabel = true, active = false, danger = false }: { title: string; label?: string; icon: ReactNode; onClick: () => void; showLabel?: boolean; active?: boolean; danger?: boolean }) {
    const theme = useCanvasTheme();
    const hasText = showLabel && Boolean(label);
    return (
        <Tooltip title={title} placement="top" mouseEnterDelay={0.2}>
            <button type="button" className="group relative flex h-12 items-center whitespace-nowrap px-1.5" style={{ color: danger ? theme.node.blocked : theme.node.text }} onClick={onClick} aria-label={title}>
                <span
                    className={`flex h-9 items-center ${hasText ? "gap-2 px-2.5" : "justify-center px-2"} rounded-lg transition group-hover:bg-black/5 dark:group-hover:bg-white/10`}
                    style={active ? { background: theme.toolbar.activeBg, color: theme.toolbar.activeText } : undefined}
                >
                    {icon}
                    {hasText ? <span>{label}</span> : null}
                </span>
            </button>
        </Tooltip>
    );
}
