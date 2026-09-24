import { Dropdown, type MenuProps } from "antd";
import { ChevronsUpDown } from "lucide-react";
import { useEffect, useRef, useState, type ButtonHTMLAttributes, type WheelEvent } from "react";
import { useTranslation } from "react-i18next";

import { useCanvasTheme } from "@/hooks/use-canvas-theme";

type DockTab<T extends string> = { id: T; label: string; handlers?: ButtonHTMLAttributes<HTMLButtonElement> };

export function DockTabs<T extends string>({ tabs, value, onChange }: { tabs: DockTab<T>[]; value: T; onChange: (id: T) => void }) {
    const theme = useCanvasTheme();
    const { t } = useTranslation();
    const stripRef = useRef<HTMLDivElement>(null);
    const [overflowing, setOverflowing] = useState(false);

    useEffect(() => {
        const el = stripRef.current;
        if (!el) return;
        const measure = () => setOverflowing(el.scrollWidth - el.clientWidth > 2);
        measure();
        if (typeof ResizeObserver === "undefined") return;
        const observer = new ResizeObserver(measure);
        observer.observe(el);
        return () => observer.disconnect();
    }, [tabs]);

    useEffect(() => {
        const el = stripRef.current;
        const active = el?.querySelector<HTMLElement>(`[data-dock-tab="${value}"]`);
        if (!el || !active) return;
        const left = active.offsetLeft;
        const right = left + active.offsetWidth;
        if (left < el.scrollLeft) el.scrollLeft = Math.max(0, left - 8);
        else if (right > el.scrollLeft + el.clientWidth) el.scrollLeft = right - el.clientWidth + 8;
    }, [value, overflowing]);

    const onWheel = (event: WheelEvent<HTMLDivElement>) => {
        const el = stripRef.current;
        if (!overflowing || !el || Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
        event.stopPropagation();
        el.scrollLeft += event.deltaY;
    };

    const items: MenuProps["items"] = tabs.map((tab) => ({ key: tab.id, label: tab.label }));

    return (
        <div className="flex h-8 w-full min-w-0 shrink-0 select-none items-center border-b" style={{ borderColor: theme.toolbar.border }}>
            <div ref={stripRef} onWheel={onWheel} className="hide-scrollbar flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto px-1.5">
                {tabs.map((tab) => {
                    const active = tab.id === value;
                    return (
                        <button
                            key={tab.id}
                            type="button"
                            data-dock-tab={tab.id}
                            {...tab.handlers}
                            aria-pressed={active}
                            onClick={() => onChange(tab.id)}
                            className="min-w-0 shrink-0 cursor-pointer rounded-md px-2 py-1 text-xs font-medium transition"
                            style={active ? { background: theme.toolbar.accentBg, color: theme.toolbar.accentText, boxShadow: `inset 0 0 0 1px ${theme.node.accent}` } : { color: theme.toolbar.item }}
                            onMouseEnter={(event) => {
                                if (!active) event.currentTarget.style.background = theme.toolbar.itemHover;
                            }}
                            onMouseLeave={(event) => {
                                if (!active) event.currentTarget.style.background = "transparent";
                            }}
                        >
                            <span className="block max-w-[104px] truncate">{tab.label}</span>
                        </button>
                    );
                })}
            </div>
            {overflowing ? (
                <Dropdown
                    placement="bottomRight"
                    trigger={["click"]}
                    menu={{ items, selectedKeys: [value], onClick: ({ key }) => onChange(key as T) }}
                >
                    <button
                        type="button"
                        className="mr-1.5 grid size-6 shrink-0 cursor-pointer place-items-center rounded-md transition hover:bg-black/5 dark:hover:bg-white/10"
                        style={{ color: theme.toolbar.accentText, background: theme.toolbar.accentBg }}
                        aria-label={t("canvas.dock.more")}
                        title={t("canvas.dock.more")}
                        aria-haspopup="menu"
                    >
                        <ChevronsUpDown className="size-3.5" />
                    </button>
                </Dropdown>
            ) : null}
        </div>
    );
}
