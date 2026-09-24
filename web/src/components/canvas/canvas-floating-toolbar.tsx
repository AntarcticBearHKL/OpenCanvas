import type { CSSProperties, ReactNode } from "react";
import { Tooltip } from "antd";

import { type CanvasTheme } from "@/lib/canvas-theme";
import { useCanvasTheme } from "@/hooks/use-canvas-theme";

export const canvasFloatingBarClass = `absolute z-[70] flex h-12 -translate-x-1/2 -translate-y-full items-center overflow-visible rounded-xl border glass-raised`;

export function canvasFloatingBarStyle(theme: CanvasTheme): CSSProperties {
    return { borderColor: theme.toolbar.border, color: theme.node.text };
}

export function CanvasFloatingToolbarAction({ title, label, icon, onClick, showLabel = true, active = false, danger = false }: { title: string; label?: string; icon: ReactNode; onClick: () => void; showLabel?: boolean; active?: boolean; danger?: boolean }) {
    const theme = useCanvasTheme();
    const hasText = showLabel && Boolean(label);
    return (
        <Tooltip title={title} placement="top" mouseEnterDelay={0.2}>
            <button type="button" className="group relative flex h-12 items-center whitespace-nowrap px-1.5" style={{ color: danger ? theme.node.blocked : theme.node.text }} onClick={onClick} aria-label={title}>
                <span
                    className={`flex h-9 items-center ${hasText ? "gap-2 px-2.5" : "justify-center px-2"} rounded-md transition group-hover:bg-hover`}
                    style={active ? { background: theme.toolbar.accentBg, color: theme.toolbar.accentText } : undefined}
                >
                    {icon}
                    {hasText ? <span>{label}</span> : null}
                </span>
            </button>
        </Tooltip>
    );
}
