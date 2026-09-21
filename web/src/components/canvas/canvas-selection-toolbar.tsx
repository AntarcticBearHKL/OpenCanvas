import { useEffect, useState, type ReactNode } from "react";
import { AlignHorizontalDistributeCenter, AlignHorizontalJustifyCenter, AlignHorizontalJustifyEnd, AlignHorizontalJustifyStart, AlignVerticalDistributeCenter, AlignVerticalJustifyCenter, AlignVerticalJustifyEnd, AlignVerticalJustifyStart, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";

import { useCanvasTheme } from "@/hooks/use-canvas-theme";
import { frostedSurfaceClass } from "@/lib/canvas-theme";
import type { AlignAxis } from "@/lib/canvas/alignment";
import { nodeBounds } from "@/lib/canvas/canvas-node-geometry";
import type { CanvasNodeData, ViewportTransform } from "@/types/canvas";
import { canvasFloatingBarClass, canvasFloatingBarStyle, CanvasFloatingToolbarAction } from "./canvas-floating-toolbar";

const SELECTION_PAD = 14;

const ALIGN_ACTIONS: { axis: AlignAxis; label: string; icon: ReactNode; distribute?: boolean }[] = [
    { axis: "left", label: "left", icon: <AlignHorizontalJustifyStart className="size-4" /> },
    { axis: "center-x", label: "centerX", icon: <AlignHorizontalJustifyCenter className="size-4" /> },
    { axis: "right", label: "right", icon: <AlignHorizontalJustifyEnd className="size-4" /> },
    { axis: "top", label: "top", icon: <AlignVerticalJustifyStart className="size-4" /> },
    { axis: "center-y", label: "centerY", icon: <AlignVerticalJustifyCenter className="size-4" /> },
    { axis: "bottom", label: "bottom", icon: <AlignVerticalJustifyEnd className="size-4" /> },
    { axis: "distribute-x", label: "distributeX", icon: <AlignHorizontalDistributeCenter className="size-4" />, distribute: true },
    { axis: "distribute-y", label: "distributeY", icon: <AlignVerticalDistributeCenter className="size-4" />, distribute: true },
];

type SelectionToolbarMenuItem = { key: string; label: string; icon: ReactNode; disabled?: boolean };

export function CanvasSelectionToolbar({
    nodes,
    viewport,
    showToolbar,
    onAlign,
    onDelete,
}: {
    nodes: CanvasNodeData[];
    viewport: ViewportTransform;
    showToolbar: boolean;
    onAlign: (axis: AlignAxis) => void;
    onDelete: () => void;
}) {
    const { t } = useTranslation();
    const theme = useCanvasTheme();
    const [menu, setMenu] = useState<"align" | "layout" | null>(null);

    useEffect(() => {
        if (!menu) return;
        const close = () => setMenu(null);
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") close();
        };
        window.addEventListener("pointerdown", close);
        window.addEventListener("keydown", handleKeyDown);
        return () => {
            window.removeEventListener("pointerdown", close);
            window.removeEventListener("keydown", handleKeyDown);
        };
    }, [menu]);

    useEffect(() => {
        if (!showToolbar) setMenu(null);
    }, [showToolbar]);

    if (nodes.length < 2) return null;

    const bounds = nodeBounds(nodes);
    const left = viewport.x + bounds.left * viewport.k - SELECTION_PAD;
    const top = viewport.y + bounds.top * viewport.k - SELECTION_PAD;
    const width = (bounds.right - bounds.left) * viewport.k + SELECTION_PAD * 2;
    const height = (bounds.bottom - bounds.top) * viewport.k + SELECTION_PAD * 2;
    const menuItems = (distribute: boolean): SelectionToolbarMenuItem[] =>
        ALIGN_ACTIONS.filter((action) => Boolean(action.distribute) === distribute).map((action) => ({ key: action.axis, label: t(`canvas.align.${action.label}`), icon: action.icon, disabled: distribute && nodes.length < 3 }));
    const runAlign = (key: string) => {
        setMenu(null);
        onAlign(key as AlignAxis);
    };

    return (
        <>
            <svg className="pointer-events-none absolute z-[65] overflow-visible" style={{ left, top, width, height }}>
                <rect
                    x={1}
                    y={1}
                    width={Math.max(width - 2, 0)}
                    height={Math.max(height - 2, 0)}
                    rx={16}
                    ry={16}
                    fill={theme.canvas.selectionFill}
                    stroke={theme.canvas.selectionStroke}
                    strokeOpacity={0.55}
                    strokeWidth={1.5}
                    strokeDasharray="7 5"
                    strokeLinecap="round"
                />
            </svg>
            {showToolbar ? (
                <div
                    className={canvasFloatingBarClass}
                    style={{ ...canvasFloatingBarStyle(theme), left: left + width / 2, top: top - 8 }}
                    onMouseDown={(event) => event.stopPropagation()}
                    onPointerDown={(event) => event.stopPropagation()}
                >
                    <CanvasFloatingToolbarAction
                        title={t("canvas.align.title")}
                        label={t("canvas.align.title")}
                        icon={<AlignHorizontalJustifyStart className="size-4" />}
                        active={menu === "align"}
                        onClick={() => setMenu((current) => (current === "align" ? null : "align"))}
                    />
                    <CanvasFloatingToolbarAction
                        title={t("canvas.layout.title")}
                        label={t("canvas.layout.title")}
                        icon={<AlignHorizontalDistributeCenter className="size-4" />}
                        active={menu === "layout"}
                        onClick={() => setMenu((current) => (current === "layout" ? null : "layout"))}
                    />
                    <CanvasFloatingToolbarAction title={t("canvas.deleteSelected")} label={t("canvas.deleteSelected")} icon={<Trash2 className="size-4" />} danger onClick={() => (setMenu(null), onDelete())} />
                    {menu === "align" ? <SelectionToolbarMenu items={menuItems(false)} onSelect={runAlign} /> : null}
                    {menu === "layout" ? <SelectionToolbarMenu items={menuItems(true)} onSelect={runAlign} /> : null}
                </div>
            ) : null}
        </>
    );
}

function SelectionToolbarMenu({ items, onSelect }: { items: SelectionToolbarMenuItem[]; onSelect: (key: string) => void }) {
    const theme = useCanvasTheme();
    return (
        <div
            className={`absolute bottom-full left-1/2 z-10 mb-2 w-44 -translate-x-1/2 rounded-2xl border p-1.5 ${frostedSurfaceClass}`}
            style={{ background: theme.toolbar.panel, borderColor: theme.toolbar.border, color: theme.toolbar.item }}
            onMouseDown={(event) => event.stopPropagation()}
            onPointerDown={(event) => event.stopPropagation()}
        >
            {items.map((item) => (
                <button
                    key={item.key}
                    type="button"
                    className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-sm transition disabled:opacity-40"
                    style={{ color: theme.toolbar.item }}
                    disabled={item.disabled}
                    onMouseEnter={(event) => (event.currentTarget.style.background = item.disabled ? "transparent" : theme.toolbar.itemHover)}
                    onMouseLeave={(event) => (event.currentTarget.style.background = "transparent")}
                    onClick={() => onSelect(item.key)}
                >
                    {item.icon}
                    <span className="min-w-0 flex-1 truncate">{item.label}</span>
                </button>
            ))}
        </div>
    );
}
