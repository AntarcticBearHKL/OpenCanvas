import { Dropdown, type MenuProps } from "antd";
import { Check, ChevronDown } from "lucide-react";
import { useTranslation } from "react-i18next";

import { dockIsVisible, type DockLayout, type DockPanelDef } from "@/components/canvas/dock/dock-layout";

const MENU_BUTTON_CLASS = "flex h-6 shrink-0 items-center gap-0.5 rounded-md px-1.5 text-xs transition hover:bg-black/5 dark:hover:bg-white/10";
const ITEM_CLASS = "flex w-full min-w-[190px] items-center gap-2";

export function DockWindowMenu({ defs, layout, onToggle, onReset }: { defs: DockPanelDef[]; layout: DockLayout; onToggle: (id: string) => void; onReset: () => void }) {
    const { t } = useTranslation();
    const items: MenuProps["items"] = [
        ...defs.map((def) => {
            const Icon = def.icon;
            const visible = dockIsVisible(layout, def.id);
            return {
                key: def.id,
                label: (
                    <span className={ITEM_CLASS}>
                        <Check className={visible ? "size-3.5 shrink-0" : "size-3.5 shrink-0 opacity-0"} />
                        <Icon className="size-3.5 shrink-0 opacity-60" />
                        <span>{t(def.labelKey)}</span>
                    </span>
                ),
            };
        }),
        { type: "divider" as const },
        { key: "reset", label: t("canvas.dock.reset") },
    ];
    return (
        <Dropdown placement="bottomLeft" styles={{ root: { zIndex: 1300 } }} menu={{ items, onClick: ({ key }) => (key === "reset" ? onReset() : onToggle(key)) }}>
            <button type="button" className={MENU_BUTTON_CLASS} aria-label={t("canvas.dock.window")} aria-haspopup="menu">
                {t("canvas.dock.window")}
                <ChevronDown className="size-3" />
            </button>
        </Dropdown>
    );
}
