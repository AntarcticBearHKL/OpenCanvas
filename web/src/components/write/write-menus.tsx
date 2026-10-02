import { Dropdown, type MenuProps } from "antd";
import { Check, ChevronDown } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { DockWindowMenu } from "@/components/canvas/dock/dock-window-menu";
import type { DockLayout, DockPanelDef } from "@/components/canvas/dock/dock-layout";
import { STUDIO_MENU_BUTTON_CLASS } from "@/components/canvas/workspace/studio-chrome";
import { PromptDialog } from "@/components/write/prompt-dialog";
import { useCanvasTheme } from "@/hooks/use-canvas-theme";
import { findNode } from "@/lib/write/outline";
import { useWriteUiStore } from "@/stores/use-write-ui-store";
import { useWritingProject, useWritingStore } from "@/stores/use-writing-store";

type WriteMenusProps = {
    defs: DockPanelDef[];
    layout: DockLayout;
    onToggle: (id: string) => void;
    onReset: () => void;
};

export function WriteMenus({ defs, layout, onToggle, onReset }: WriteMenusProps) {
    const { t } = useTranslation();
    const theme = useCanvasTheme();
    const projectId = useWriteUiStore((state) => state.projectId);
    const selectedOutlineId = useWriteUiStore((state) => state.selectedOutlineId);
    const focusMode = useWriteUiStore((state) => state.focusMode);
    const setFocusMode = useWriteUiStore((state) => state.setFocusMode);
    const setEditorCommand = useWriteUiStore((state) => state.setEditorCommand);
    const project = useWritingProject(projectId ?? undefined);
    const removeOutlineNode = useWritingStore((state) => state.removeOutlineNode);
    const [promptOpen, setPromptOpen] = useState(false);

    if (!project) return null;
    const node = findNode(project.outline, selectedOutlineId);

    const label = (text: string, hint = ""): NonNullable<MenuProps["items"]>[number] => ({
        key: text,
        label: (
            <span className="flex w-full min-w-[180px] items-center justify-between gap-6">
                <span>{text}</span>
                {hint ? <span className="text-xs" style={{ color: theme.node.muted }}>{hint}</span> : null}
            </span>
        ),
    });
    const plain = (text: string): NonNullable<MenuProps["items"]>[number] => ({ key: text, label: text });
    const toggleRow = (text: string, on: boolean): NonNullable<MenuProps["items"]>[number] => ({ key: text, label: <span className="flex w-full min-w-[160px] items-center gap-2">{on ? <Check className="size-3.5" /> : <span className="size-3.5" />}<span>{text}</span></span> });

    const undo = t("writing.menu.undo");
    const redo = t("writing.menu.redo");
    const bold = t("writing.menu.bold");
    const italic = t("writing.menu.italic");
    const strike = t("writing.menu.strike");
    const h2 = t("writing.menu.h2");
    const h3 = t("writing.menu.h3");
    const bullet = t("writing.menu.bulletList");
    const ordered = t("writing.menu.orderedList");
    const quote = t("writing.menu.quote");
    const divider = t("writing.menu.divider");
    const deleteNode = t("writing.outline.deleteNode");
    const focus = t("writing.editor.focus");
    const exitFocus = t("writing.editor.exitFocus");

    const editorCommandByLabel: Record<string, string> = { [undo]: "undo", [redo]: "redo", [bold]: "bold", [italic]: "italic", [strike]: "strike", [h2]: "h2", [h3]: "h3", [bullet]: "bullet", [ordered]: "ordered", [quote]: "quote", [divider]: "divider" };

    const menuItems: { id: string; title: string; items: MenuProps["items"] }[] = [
        {
            id: "edit",
            title: t("writing.menu.edit"),
            items: [label(undo, "Ctrl+Z"), label(redo, "Ctrl+Shift+Z"), { type: "divider" }, { key: deleteNode, label: deleteNode, disabled: !node, danger: true }],
        },
        { id: "format", title: t("writing.menu.format"), items: [label(bold, "Ctrl+B"), label(italic, "Ctrl+I"), label(strike, "Ctrl+Shift+S"), { type: "divider" }, plain(h2), plain(h3), { type: "divider" }, plain(bullet), plain(ordered), plain(quote), plain(divider)] },
        { id: "view", title: t("writing.menu.view"), items: [toggleRow(focusMode ? exitFocus : focus, focusMode)] },
    ];

    const onMenuClick = (key: string) => {
        const command = editorCommandByLabel[key];
        if (command) {
            setEditorCommand(command);
            return;
        }
        if (key === deleteNode && node) {
            removeOutlineNode(project.id, node.id);
            return;
        }
        if (key === focus || key === exitFocus) {
            setFocusMode(!focusMode);
            return;
        }
    };

    return (
        <>
            {menuItems.map((menu) => (
                <Dropdown key={menu.id} placement="bottomLeft" styles={{ root: { zIndex: 1300 } }} menu={{ items: menu.items, onClick: ({ key }) => onMenuClick(String(key)) }}>
                    <button type="button" className={STUDIO_MENU_BUTTON_CLASS} aria-haspopup="menu" aria-label={menu.title}>
                        {menu.title}
                        <ChevronDown className="size-3" />
                    </button>
                </Dropdown>
            ))}
            <button type="button" className={STUDIO_MENU_BUTTON_CLASS} aria-haspopup="dialog" onClick={() => setPromptOpen(true)}>
                {t("writing.menu.prompt")}
            </button>
            <DockWindowMenu defs={defs} layout={layout} onToggle={onToggle} onReset={onReset} />
            <PromptDialog open={promptOpen} onClose={() => setPromptOpen(false)} />
        </>
    );
}
