import { App, Input, Popconfirm } from "antd";
import { ChevronRight, Circle, ListPlus, Loader2, Plus, Search, Sparkles, Trash2 } from "lucide-react";
import { useMemo, useState, type DragEvent } from "react";
import { useTranslation } from "react-i18next";

import { STUDIO_FLAT_BUTTON_CLASS, STUDIO_ICON_BUTTON_CLASS, STUDIO_LIST_ROW_CLASS, STUDIO_TOOL_BUTTON_CLASS } from "@/components/canvas/workspace/studio-chrome";
import { useWriteAi } from "@/components/write/use-write-ai";
import { useCanvasTheme } from "@/hooks/use-canvas-theme";
import { descendantIds, docUnitFor, findNode, flattenOutline, isExpandable, outlineStats, siblingNodes } from "@/lib/write/outline";
import { WRITE_TEMPLATES, childKindOf, defaultKindFor, isDocUnitKind, levelOf } from "@/lib/write/presets";
import { useWriteUiStore } from "@/stores/use-write-ui-store";
import { useWritingProject, useWritingStore } from "@/stores/use-writing-store";
import type { OutlineNode, OutlineStatus } from "@/types/writing";

type DropZone = "before" | "after" | "inside";

export function OutlinePanel() {
    const { t } = useTranslation();
    const { message } = App.useApp();
    const theme = useCanvasTheme();
    const projectId = useWriteUiStore((state) => state.projectId);
    const selectedOutlineId = useWriteUiStore((state) => state.selectedOutlineId);
    const collapsedIds = useWriteUiStore((state) => state.collapsedIds);
    const outlineQuery = useWriteUiStore((state) => state.outlineQuery);
    const selectOutline = useWriteUiStore((state) => state.selectOutline);
    const toggleCollapsed = useWriteUiStore((state) => state.toggleCollapsed);
    const setOutlineQuery = useWriteUiStore((state) => state.setOutlineQuery);
    const addOutlineNode = useWritingStore((state) => state.addOutlineNode);
    const updateOutlineNode = useWritingStore((state) => state.updateOutlineNode);
    const removeOutlineNode = useWritingStore((state) => state.removeOutlineNode);
    const moveOutlineNode = useWritingStore((state) => state.moveOutlineNode);
    const project = useWritingProject(projectId ?? undefined);
    const { state: aiState, expandOutline } = useWriteAi();
    const [renaming, setRenaming] = useState<{ id: string; title: string } | null>(null);
    const [draggingId, setDraggingId] = useState<string | null>(null);
    const [dropHint, setDropHint] = useState<{ id: string; zone: DropZone } | null>(null);
    const [expandingId, setExpandingId] = useState<string | null>(null);

    const outline = project?.outline ?? [];
    const query = outlineQuery.trim().toLowerCase();
    const rows = useMemo(() => flattenOutline(outline, new Set<string>(query ? [] : collapsedIds)), [outline, collapsedIds, query]);
    const parentIds = useMemo(() => new Set(outline.map((node) => node.parentId).filter((id): id is string => Boolean(id))), [outline]);
    const visibleRows = useMemo(() => {
        if (!query) return rows;
        const keep = new Set<string>();
        rows.forEach(({ node }) => {
            if (!node.title.toLowerCase().includes(query) && !node.summary.toLowerCase().includes(query)) return;
            keep.add(node.id);
            let parentId = node.parentId;
            while (parentId && !keep.has(parentId)) {
                keep.add(parentId);
                parentId = findNode(outline, parentId)?.parentId ?? null;
            }
        });
        return rows.filter(({ node }) => keep.has(node.id));
    }, [rows, query, outline]);

    if (!project) return null;

    const stats = outlineStats(project);
    const unitLabelKey = levelOf(project.template, WRITE_TEMPLATES[project.template].docUnitKind)?.labelKey ?? "";
    const chipClass = (status: OutlineStatus) => {
        if (status === "done") return "bg-success-soft text-success";
        if (status === "revised") return "bg-info-soft text-info";
        if (status === "draft") return "bg-warning-soft text-warning";
        return "bg-brand-soft text-brand";
    };
    const createRoot = () => addOutlineNode(project.id, null, defaultKindFor(project.template), t("writing.outline.newChild"));
    const createChild = (node: OutlineNode) => {
        addOutlineNode(project.id, node.id, childKindOf(project.template, node.kind) ?? defaultKindFor(project.template), t("writing.outline.newChild"));
        if (collapsedIds.includes(node.id)) toggleCollapsed(node.id);
    };
    const createSibling = (node: OutlineNode) => addOutlineNode(project.id, node.parentId, node.kind, t("writing.outline.newChild"), node.id);
    const commitRename = () => {
        if (!renaming) return;
        const title = renaming.title.trim();
        if (title) updateOutlineNode(project.id, renaming.id, { title });
        setRenaming(null);
    };
    const runExpand = async (node: OutlineNode) => {
        setExpandingId(node.id);
        const ok = await expandOutline(node.id);
        setExpandingId(null);
        if (!ok) message.error(t("writing.outline.expandFailed"));
    };
    const canDrop = (node: OutlineNode) => (draggingId ? draggingId !== node.id && !descendantIds(project.outline, draggingId).has(node.id) : false);
    const zoneFor = (event: DragEvent<HTMLDivElement>, node: OutlineNode): DropZone => {
        const rect = event.currentTarget.getBoundingClientRect();
        const ratio = (event.clientY - rect.top) / Math.max(1, rect.height);
        if (ratio < 0.25) return "before";
        if (ratio > 0.75) return "after";
        return childKindOf(project.template, node.kind) ? "inside" : "after";
    };
    const handleDragOver = (event: DragEvent<HTMLDivElement>, node: OutlineNode) => {
        if (!canDrop(node)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
        const zone = zoneFor(event, node);
        setDropHint((prev) => (prev?.id === node.id && prev.zone === zone ? prev : { id: node.id, zone }));
    };
    const handleDrop = (event: DragEvent<HTMLDivElement>, node: OutlineNode) => {
        event.preventDefault();
        const dragged = draggingId;
        setDraggingId(null);
        setDropHint(null);
        if (!dragged || dragged === node.id || descendantIds(project.outline, dragged).has(node.id)) return;
        const zone = zoneFor(event, node);
        const rest = project.outline.filter((item) => item.id !== dragged);
        if (zone === "inside") {
            moveOutlineNode(project.id, dragged, node.id, siblingNodes(rest, node.id).length);
            if (collapsedIds.includes(node.id)) toggleCollapsed(node.id);
            return;
        }
        const siblings = siblingNodes(rest, node.parentId);
        const at = siblings.findIndex((item) => item.id === node.id);
        moveOutlineNode(project.id, dragged, node.parentId, zone === "after" ? at + 1 : at);
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
                <button type="button" className={STUDIO_FLAT_BUTTON_CLASS} style={{ color: theme.node.text }} aria-label={t("writing.common.add")} title={t("writing.common.add")} onClick={createRoot}>
                    <Plus className="size-3.5" />
                    {t("writing.common.add")}
                </button>
            </div>
            <div className="thin-scrollbar min-h-0 flex-1 overflow-y-auto px-1.5 pb-1">
                {visibleRows.length ? (
                    visibleRows.map(({ node, depth }) => {
                        const level = levelOf(project.template, node.kind);
                        const KindIcon = level?.icon ?? Circle;
                        const doc = project.docs[node.id];
                        const selected = selectedOutlineId === node.id;
                        const collapsed = collapsedIds.includes(node.id);
                        const hint = dropHint?.id === node.id ? dropHint.zone : null;
                        const expanding = expandingId === node.id;
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
                                    style={{ paddingLeft: 8 + depth * 12, background: selected ? theme.toolbar.activeBg : "transparent", color: selected ? theme.toolbar.activeText : theme.node.text, boxShadow: hint === "inside" ? `inset 0 0 0 1px ${theme.node.activeStroke}` : undefined }}
                                    onClick={() => selectOutline(node.id)}
                                    onDoubleClick={() => selectOutline(docUnitFor(project, node.id)?.id ?? node.id)}
                                >
                                    {parentIds.has(node.id) ? (
                                        <button type="button" className={STUDIO_TOOL_BUTTON_CLASS} style={{ color: "inherit" }} aria-expanded={!collapsed} aria-label={node.title} onClick={(event) => { event.stopPropagation(); toggleCollapsed(node.id); }}>
                                            <ChevronRight className={`size-3.5 transition-transform ${collapsed ? "" : "rotate-90"}`} />
                                        </button>
                                    ) : (
                                        <span aria-hidden className="size-6 shrink-0" />
                                    )}
                                    <KindIcon className="size-3.5 shrink-0" style={{ color: level?.color }} />
                                    {renaming?.id === node.id ? (
                                        <input
                                            autoFocus
                                            value={renaming.title}
                                            aria-label={node.title}
                                            className="min-w-0 flex-1 rounded-[2px] bg-transparent px-1 text-sm outline-none"
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
                                    {expanding ? <Loader2 className="size-3 shrink-0 animate-spin" style={{ color: theme.node.muted }} /> : null}
                                    <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-xs font-medium leading-none ${chipClass(node.status)}`}>
                                        {t(`writing.status.${node.status}`)}
                                    </span>
                                    {isDocUnitKind(project.template, node.kind) ? (
                                        <span className="shrink-0 text-xs tabular-nums" style={{ color: theme.node.muted }}>
                                            {doc ? t("writing.outline.words", { count: doc.wordCount }) : t("writing.outline.noDoc")}
                                        </span>
                                    ) : null}
                                    <div
                                        className={`absolute inset-y-0 right-0.5 flex items-center gap-0.5 pl-7 pr-0.5 transition ${expanding ? "opacity-100" : "pointer-events-none opacity-0 group-hover:pointer-events-auto group-hover:opacity-100 focus-within:pointer-events-auto focus-within:opacity-100"}`}
                                        style={{ background: `linear-gradient(to right, transparent, ${selected ? theme.toolbar.activeBg : theme.toolbar.panel} 28px)` }}
                                        onDoubleClick={(event) => event.stopPropagation()}
                                    >
                                        <button type="button" className={STUDIO_ICON_BUTTON_CLASS} style={{ color: "inherit" }} aria-label={t("writing.outline.addChild")} title={t("writing.outline.addChild")} onClick={(event) => { event.stopPropagation(); createChild(node); }}>
                                            <Plus className="size-4" />
                                        </button>
                                        <button type="button" className={STUDIO_ICON_BUTTON_CLASS} style={{ color: "inherit" }} aria-label={t("writing.outline.addSibling")} title={t("writing.outline.addSibling")} onClick={(event) => { event.stopPropagation(); createSibling(node); }}>
                                            <ListPlus className="size-4" />
                                        </button>
                                        {isExpandable(project, node) ? (
                                            <button type="button" className={STUDIO_ICON_BUTTON_CLASS} style={{ color: "inherit" }} disabled={aiState.running} aria-label={t("writing.outline.expand")} title={t("writing.outline.expand")} onClick={(event) => { event.stopPropagation(); void runExpand(node); }}>
                                                {expanding ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
                                            </button>
                                        ) : null}
                                        <Popconfirm title={t("writing.outline.deleteConfirm")} placement="left" okButtonProps={{ danger: true }} onConfirm={() => removeOutlineNode(project.id, node.id)}>
                                            <button type="button" className={STUDIO_ICON_BUTTON_CLASS} style={{ color: "inherit" }} aria-label={t("writing.outline.deleteNode")} title={t("writing.outline.deleteNode")} onClick={(event) => event.stopPropagation()}>
                                                <Trash2 className="size-4" />
                                            </button>
                                        </Popconfirm>
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
                    <span className="tabular-nums">
                        {stats.units} {t(unitLabelKey)}
                    </span>
                    <span className="tabular-nums">{t("writing.outline.words", { count: stats.words })}</span>
                </div>
                <p className="pt-0.5 text-xs" style={{ color: theme.node.muted }}>{t("writing.outline.dragHint")}</p>
            </footer>
        </div>
    );
}
