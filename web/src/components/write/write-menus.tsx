import { Dropdown, type MenuProps } from "antd";
import { Check, ChevronDown } from "lucide-react";
import { useTranslation } from "react-i18next";

import { DockWindowMenu } from "@/components/canvas/dock/dock-window-menu";
import type { DockLayout, DockPanelDef } from "@/components/canvas/dock/dock-layout";
import { STUDIO_DIVIDER_CLASS, STUDIO_HINT_CLASS, STUDIO_LABEL_CLASS, STUDIO_MENU_BUTTON_CLASS } from "@/components/canvas/workspace/studio-chrome";
import { useCanvasTheme } from "@/hooks/use-canvas-theme";
import { childKindOf, defaultKindFor } from "@/lib/write/presets";
import { docUnitFor, findNode } from "@/lib/write/outline";
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
    const setCollapsed = useWriteUiStore((state) => state.setCollapsed);
    const project = useWritingProject(projectId ?? undefined);
    const addOutlineNode = useWritingStore((state) => state.addOutlineNode);
    const removeOutlineNode = useWritingStore((state) => state.removeOutlineNode);
    const snapshot = useWritingStore((state) => state.snapshot);

    if (!project) return null;
    const node = findNode(project.outline, selectedOutlineId);
    const unit = docUnitFor(project, selectedOutlineId);
    const parents = project.outline.filter((candidate) => project.outline.some((child) => child.parentId === candidate.id)).map((candidate) => candidate.id);

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
    const snapshotNow = t("writing.history.snapshotNow");
    const deleteNode = t("writing.outline.deleteNode");
    const addChild = t("writing.outline.addChild");
    const addSibling = t("writing.outline.addSibling");
    const insertCodex = t("writing.menu.insertCodex");
    const collapseAll = t("writing.menu.collapseAll");
    const expandAll = t("writing.menu.expandAll");
    const focus = t("writing.editor.focus");
    const exitFocus = t("writing.editor.exitFocus");

    const editorCommandByLabel: Record<string, string> = { [undo]: "undo", [redo]: "redo", [bold]: "bold", [italic]: "italic", [strike]: "strike", [h2]: "h2", [h3]: "h3", [bullet]: "bullet", [ordered]: "ordered", [quote]: "quote", [divider]: "divider" };

    const menuItems: { id: string; title: string; items: MenuProps["items"] }[] = [
        {
            id: "edit",
            title: t("writing.menu.edit"),
            items: [label(undo, "Ctrl+Z"), label(redo, "Ctrl+Shift+Z"), { type: "divider" }, plain(snapshotNow), { type: "divider" }, { key: deleteNode, label: deleteNode, disabled: !node, danger: true }],
        },
        {
            id: "insert",
            title: t("writing.menu.insert"),
            items: [
                { key: addChild, label: addChild, disabled: !node },
                { key: addSibling, label: addSibling, disabled: !node },
                { type: "divider" },
                {
                    key: insertCodex,
                    label: insertCodex,
                    children: project.codex.length
                        ? project.codex.slice(0, 24).map((codexEntry) => ({ key: `codex:${codexEntry.name}`, label: codexEntry.name }))
                        : [{ key: "codex-empty", label: t("writing.menu.noCodex"), disabled: true }],
                },
            ],
        },
        { id: "format", title: t("writing.menu.format"), items: [label(bold, "Ctrl+B"), label(italic, "Ctrl+I"), label(strike, "Ctrl+Shift+S"), { type: "divider" }, plain(h2), plain(h3), { type: "divider" }, plain(bullet), plain(ordered), plain(quote), plain(divider)] },
        { id: "view", title: t("writing.menu.view"), items: [toggleRow(focusMode ? exitFocus : focus, focusMode), { type: "divider" }, plain(collapseAll), plain(expandAll)] },
    ];

    const onMenuClick = (key: string) => {
        if (key.startsWith("codex:")) {
            setEditorCommand(`insert:${key.slice(6)}`);
            return;
        }
        const command = editorCommandByLabel[key];
        if (command) {
            setEditorCommand(command);
            return;
        }
        if (key === snapshotNow) {
            if (unit) snapshot(project.id, unit.id, t("writing.history.auto"));
            return;
        }
        if (key === addChild && node) {
            addOutlineNode(project.id, node.id, childKindOf(project.template, node.kind) ?? defaultKindFor(project.template), t("writing.outline.newChild"));
            return;
        }
        if (key === addSibling && node) {
            addOutlineNode(project.id, node.parentId, node.kind, t("writing.outline.newChild"), node.id);
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
        if (key === collapseAll) {
            setCollapsed(parents);
            return;
        }
        if (key === expandAll) setCollapsed([]);
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
            <DockWindowMenu defs={defs} layout={layout} onToggle={onToggle} onReset={onReset} />
            <span className={STUDIO_DIVIDER_CLASS} style={{ background: theme.toolbar.border }} />
            <span className={`${STUDIO_LABEL_CLASS} max-w-[240px] truncate`}>{node ? node.title : t("writing.common.none")}</span>
            <span className={STUDIO_HINT_CLASS} style={{ color: theme.node.muted }}>
                {node ? t(`writing.outlineKind.${node.kind}`) : ""}
                {unit ? ` · ${t("writing.studio.wordCount", { count: project.docs[unit.id]?.wordCount ?? 0 })}` : ""}
            </span>
        </>
    );
}
