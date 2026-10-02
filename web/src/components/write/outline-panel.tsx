import { Input } from "antd";
import { Check, FileText, Plus, Search, Trash2 } from "lucide-react";
import { useMemo, useState, type DragEvent } from "react";
import { useTranslation } from "react-i18next";

import { STUDIO_FLAT_BUTTON_CLASS, STUDIO_ICON_BUTTON_CLASS, STUDIO_LIST_ROW_CLASS } from "@/components/canvas/workspace/studio-chrome";
import { useCanvasTheme } from "@/hooks/use-canvas-theme";
import { flattenOutline, outlineStats } from "@/lib/write/outline";
import { useWriteUiStore } from "@/stores/use-write-ui-store";
import { useWritingProject, useWritingStore } from "@/stores/use-writing-store";
import type { OutlineNode } from "@/types/writing";

type DropZone = "before" | "after";

export function OutlinePanel() {
    const { t } = useTranslation();
    const theme = useCanvasTheme();
    const projectId = useWriteUiStore((state) => state.projectId);
    const selectedOutlineId = useWriteUiStore((state) => state.selectedOutlineId);
    const outlineQuery = useWriteUiStore((state) => state.outlineQuery);
    const selectOutline = useWriteUiStore((state) => state.selectOutline);
    const setOutlineQuery = useWriteUiStore((state) => state.setOutlineQuery);
    const addOutlineNode = useWritingStore((state) => state.addOutlineNode);
    const updateOutlineNode = useWritingStore((state) => state.updateOutlineNode);
    const removeOutlineNode = useWritingStore((state) => state.removeOutlineNode);
    const moveOutlineNode = useWritingStore((state) => state.moveOutlineNode);
    const project = useWritingProject(projectId ?? undefined);
    const [renaming, setRenaming] = useState<{ id: string; title: string } | null>(null);
    const [draggingId, setDraggingId] = useState<string | null>(null);
    const [dropHint, setDropHint] = useState<{ id: string; zone: DropZone } | null>(null);
    const [armedDeleteId, setArmedDeleteId] = useState<string | null>(null);

    const outline = project?.outline ?? [];
    const query = outlineQuery.trim().toLowerCase();
    const nodes = useMemo(() => flattenOutline(outline), [outline]);
    const visibleNodes = useMemo(
        () => (query ? nodes.filter((node) => node.title.toLowerCase().includes(query) || node.summary.toLowerCase().includes(query)) : nodes),
        [nodes, query],
    );

    if (!project) return null;

    const stats = outlineStats(project);
    const createNode = () => addOutlineNode(project.id);
    const commitRename = () => {
        if (!renaming) return;
        const title = renaming.title.trim();
        if (title) updateOutlineNode(project.id, renaming.id, { title });
        setRenaming(null);
    };
    const confirmDelete = (node: OutlineNode) => {
        if (armedDeleteId !== node.id) {
            setArmedDeleteId(node.id);
            return;
        }
        setArmedDeleteId(null);
        removeOutlineNode(project.id, node.id);
    };
    const zoneFor = (event: DragEvent<HTMLDivElement>): DropZone => {
        const rect = event.currentTarget.getBoundingClientRect();
        return (event.clientY - rect.top) / Math.max(1, rect.height) < 0.5 ? "before" : "after";
    };
    const handleDragOver = (event: DragEvent<HTMLDivElement>, node: OutlineNode) => {
        if (!draggingId || draggingId === node.id) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
        const zone = zoneFor(event);
        setDropHint((prev) => (prev?.id === node.id && prev.zone === zone ? prev : { id: node.id, zone }));
    };
    const handleDrop = (event: DragEvent<HTMLDivElement>, node: OutlineNode) => {
        event.preventDefault();
        const dragged = draggingId;
        setDraggingId(null);
        setDropHint(null);
        if (!dragged || dragged === node.id) return;
        const ordered = flattenOutline(project.outline.filter((item) => item.id !== dragged));
        const at = ordered.findIndex((item) => item.id === node.id);
        if (at < 0) return;
        moveOutlineNode(project.id, dragged, zoneFor(event) === "after" ? at + 1 : at);
    };

    return (
        <div className="flex min-h-0 flex-1 flex-col text-sm" style={{ background: theme.toolbar.panel, color: theme.node.text }}>
            <div className="flex shrink-0 items-center gap-1.5 px-2 pb-1.5 pt-2">
                <Input
                    size="small"
                    allowClear
                    className="min-w-0 flex-1"
                    value={outlineQuery}
                    placeholder={t("writing.outline.searchPlaceholder")}
                    prefix={<Search className="size-3.5" style={{ color: theme.node.muted }} />}
                    onChange={(event) => setOutlineQuery(event.target.value)}
                />
                <button type="button" className={STUDIO_FLAT_BUTTON_CLASS} style={{ color: theme.node.text }} aria-label={t("writing.common.add")} title={t("writing.common.add")} onClick={createNode}>
                    <Plus className="size-3.5" />
                    {t("writing.common.add")}
                </button>
            </div>
            <div className="thin-scrollbar min-h-0 flex-1 overflow-y-auto px-1.5 pb-1">
                {visibleNodes.length ? (
                    visibleNodes.map((node) => {
                        const doc = project.docs[node.id];
                        const selected = selectedOutlineId === node.id;
                        const hint = dropHint?.id === node.id ? dropHint.zone : null;
                        const armed = armedDeleteId === node.id;
                        return (
                            <div
                                key={node.id}
                                className="relative"
                                draggable={renaming?.id !== node.id}
                                onDragStart={(event) => {
                                    setDraggingId(node.id);
                                    event.dataTransfer.effectAllowed = "move";
                                    event.dataTransfer.setData("text/plain", node.id);
                                }}
                                onDragEnd={() => {
                                    setDraggingId(null);
                                    setDropHint(null);
                                }}
                                onDragOver={(event) => handleDragOver(event, node)}
                                onDragLeave={(event) => {
                                    if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
                                    setDropHint((prev) => (prev?.id === node.id ? null : prev));
                                }}
                                onDrop={(event) => handleDrop(event, node)}
                            >
                                {hint === "before" ? <span aria-hidden className="pointer-events-none absolute inset-x-1 top-0 z-10 h-0.5 rounded-full" style={{ background: theme.node.activeStroke }} /> : null}
                                <div
                                    className={`${STUDIO_LIST_ROW_CLASS} group cursor-pointer`}
                                    style={{ background: selected ? theme.toolbar.activeBg : "transparent", color: selected ? theme.toolbar.activeText : theme.node.text }}
                                    onClick={() => selectOutline(node.id)}
                                    onDoubleClick={() => selectOutline(node.id)}
                                >
                                    <FileText className="size-3.5 shrink-0" style={{ color: theme.node.muted }} />
                                    {renaming?.id === node.id ? (
                                        <input
                                            autoFocus
                                            value={renaming.title}
                                            aria-label={node.title}
                                            className="min-w-0 flex-1 rounded-md bg-transparent px-1 text-sm outline-none"
                                            style={{ boxShadow: `inset 0 0 0 1px ${theme.node.activeStroke}` }}
                                            onChange={(event) => setRenaming({ id: node.id, title: event.target.value })}
                                            onBlur={commitRename}
                                            onClick={(event) => event.stopPropagation()}
                                            onDoubleClick={(event) => event.stopPropagation()}
                                            onKeyDown={(event) => {
                                                event.stopPropagation();
                                                if (event.key === "Enter") event.currentTarget.blur();
                                                if (event.key === "Escape") setRenaming(null);
                                            }}
                                        />
                                    ) : (
                                        <button type="button" className="min-w-0 flex-1 truncate text-left" onDoubleClick={(event) => { event.stopPropagation(); setRenaming({ id: node.id, title: node.title }); }}>
                                            {node.title}
                                        </button>
                                    )}
                                    <span className="shrink-0 text-xs tabular-nums" style={{ color: theme.node.muted }}>
                                        {doc ? t("writing.outline.words", { count: doc.wordCount }) : t("writing.outline.noDoc")}
                                    </span>
                                    <div
                                        className={`absolute inset-y-0 right-0.5 flex items-center gap-0.5 pl-7 pr-0.5 transition ${armed ? "opacity-100" : "pointer-events-none opacity-0 group-hover:pointer-events-auto group-hover:opacity-100 focus-within:pointer-events-auto focus-within:opacity-100"}`}
                                        style={{ background: `linear-gradient(to right, transparent, ${selected ? theme.toolbar.activeBg : theme.toolbar.panel} 28px)` }}
                                        onDoubleClick={(event) => event.stopPropagation()}
                                    >
                                        <button
                                            type="button"
                                            className={STUDIO_ICON_BUTTON_CLASS}
                                            style={{ color: armed ? theme.node.danger : "inherit" }}
                                            aria-label={armed ? t("writing.common.confirm") : t("writing.outline.deleteNode")}
                                            title={armed ? t("writing.common.confirm") : t("writing.outline.deleteNode")}
                                            onClick={(event) => { event.stopPropagation(); confirmDelete(node); }}
                                            onPointerLeave={() => setArmedDeleteId((current) => (current === node.id ? null : current))}
                                        >
                                            {armed ? <Check className="size-4" /> : <Trash2 className="size-4" />}
                                        </button>
                                    </div>
                                </div>
                                {hint === "after" ? <span aria-hidden className="pointer-events-none absolute inset-x-1 bottom-0 z-10 h-0.5 rounded-full" style={{ background: theme.node.activeStroke }} /> : null}
                            </div>
                        );
                    })
                ) : (
                    <p className="px-2 py-6 text-center text-sm" style={{ color: theme.node.muted }}>
                        {t("writing.outline.empty")}
                    </p>
                )}
            </div>
            <footer className="shrink-0 border-t px-2.5 py-1.5 text-xs" style={{ borderColor: theme.toolbar.border, color: theme.node.muted }}>
                <div className="flex items-center gap-2">
                    <span className="tabular-nums">{t("writing.outline.units", { count: stats.units })}</span>
                    <span className="tabular-nums">{t("writing.outline.words", { count: stats.words })}</span>
                </div>
                <p className="pt-0.5 text-xs" style={{ color: theme.node.muted }}>{t("writing.outline.dragHint")}</p>
            </footer>
        </div>
    );
}
