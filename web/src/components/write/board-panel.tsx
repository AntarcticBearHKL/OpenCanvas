import { useRef, useState, type DragEvent } from "react";
import { useTranslation } from "react-i18next";

import { useCanvasTheme } from "@/hooks/use-canvas-theme";
import { docUnitFor, docUnitNodes, findNode, siblingNodes } from "@/lib/write/outline";
import { levelOf } from "@/lib/write/presets";
import { useWriteUiStore } from "@/stores/use-write-ui-store";
import { useWritingProject, useWritingStore } from "@/stores/use-writing-store";
import { OUTLINE_STATUSES, type OutlineNode, type OutlineStatus } from "@/types/writing";

export function BoardPanel() {
    const { t } = useTranslation();
    const theme = useCanvasTheme();
    const projectId = useWriteUiStore((state) => state.projectId);
    const selectedOutlineId = useWriteUiStore((state) => state.selectedOutlineId);
    const selectOutline = useWriteUiStore((state) => state.selectOutline);
    const project = useWritingProject(projectId ?? undefined);
    const updateOutlineNode = useWritingStore((state) => state.updateOutlineNode);
    const moveOutlineNode = useWritingStore((state) => state.moveOutlineNode);
    const [dragId, setDragId] = useState<string | null>(null);
    const [overStatus, setOverStatus] = useState<OutlineStatus | null>(null);
    const draggingRef = useRef(false);

    if (!project) return null;
    const units = docUnitNodes(project);

    const endDrag = () => {
        setDragId(null);
        setOverStatus(null);
        setTimeout(() => {
            draggingRef.current = false;
        }, 0);
    };

    const dropOnCard = (event: DragEvent<HTMLButtonElement>, target: OutlineNode) => {
        event.preventDefault();
        event.stopPropagation();
        const dragged = units.find((node) => node.id === dragId) ?? null;
        endDrag();
        if (!dragged || dragged.id === target.id) return;
        if (dragged.status !== target.status) {
            updateOutlineNode(project.id, dragged.id, { status: target.status });
            return;
        }
        const rest = project.outline.filter((node) => node.id !== dragged.id);
        const siblings = siblingNodes(rest, target.parentId);
        const index = siblings.findIndex((node) => node.id === target.id);
        if (index >= 0) moveOutlineNode(project.id, dragged.id, target.parentId, index);
    };

    const dropOnColumn = (event: DragEvent<HTMLElement>, status: OutlineStatus) => {
        event.preventDefault();
        const dragged = units.find((node) => node.id === dragId) ?? null;
        endDrag();
        if (dragged && dragged.status !== status) updateOutlineNode(project.id, dragged.id, { status });
    };

    return (
        <div className="flex min-h-0 flex-1 flex-col">
            <div className="flex shrink-0 items-center px-3 py-1.5 text-xs" style={{ color: theme.node.muted }}>
                <span className="truncate">{t("writing.board.dragHint")}</span>
            </div>
            {units.length ? (
                <div className="thin-scrollbar flex min-h-0 flex-1 gap-2 overflow-x-auto px-2 pb-2">
                    {OUTLINE_STATUSES.map((status) => {
                        const cards = units.filter((node) => node.status === status);
                        return (
                            <section
                                key={status}
                                className="flex w-52 shrink-0 flex-col overflow-hidden rounded-[2px] border"
                                style={{ borderColor: theme.toolbar.border, background: overStatus === status ? theme.toolbar.activeBg : theme.canvas.background }}
                                onDragOver={(event) => {
                                    if (!dragId) return;
                                    event.preventDefault();
                                    event.dataTransfer.dropEffect = "move";
                                    setOverStatus(status);
                                }}
                                onDragLeave={(event) => {
                                    if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
                                    setOverStatus((current) => (current === status ? null : current));
                                }}
                                onDrop={(event) => dropOnColumn(event, status)}
                            >
                                <header className="flex shrink-0 items-center gap-1.5 border-b px-2 py-1.5 text-sm font-medium" style={{ borderColor: theme.toolbar.border, color: theme.node.label }}>
                                    <span className="truncate">{t(`writing.status.${status}`)}</span>
                                    <span className="ml-auto shrink-0 tabular-nums" style={{ color: theme.node.muted }}>{cards.length}</span>
                                </header>
                                <div className="thin-scrollbar flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto p-1.5">
                                    {cards.map((node) => {
                                        const level = levelOf(project.template, node.kind);
                                        const parent = findNode(project.outline, node.parentId);
                                        return (
                                            <button
                                                key={node.id}
                                                type="button"
                                                draggable
                                                onDragStart={(event) => {
                                                    draggingRef.current = true;
                                                    setDragId(node.id);
                                                    event.dataTransfer.effectAllowed = "move";
                                                    event.dataTransfer.setData("text/plain", node.id);
                                                }}
                                                onDragEnd={endDrag}
                                                onDragOver={(event) => {
                                                    if (!dragId) return;
                                                    event.preventDefault();
                                                    event.dataTransfer.dropEffect = "move";
                                                    setOverStatus(status);
                                                }}
                                                onDrop={(event) => dropOnCard(event, node)}
                                                onClick={() => {
                                                    if (draggingRef.current) return;
                                                    selectOutline(docUnitFor(project, node.id)?.id ?? node.id);
                                                }}
                                                className={`flex w-full shrink-0 cursor-grab flex-col gap-1 rounded-[2px] border p-1.5 text-left text-sm transition active:cursor-grabbing ${dragId === node.id ? "scale-[.98] border-dashed" : ""}`}
                                                style={{ borderColor: selectedOutlineId === node.id ? theme.node.activeStroke : theme.node.stroke, background: theme.node.panel, color: theme.node.text }}
                                            >
                                                <span className="flex min-w-0 items-center gap-1.5">
                                                    {level ? <level.icon className="size-3.5 shrink-0" style={{ color: level.color }} /> : null}
                                                    <span className="min-w-0 flex-1 truncate font-medium">{node.title}</span>
                                                </span>
                                                {parent ? (
                                                    <span className="truncate text-sm" style={{ color: theme.node.muted }}>
                                                        {parent.title}
                                                    </span>
                                                ) : null}
                                                <span className="text-xs tabular-nums" style={{ color: theme.node.muted }}>
                                                    {t("writing.board.words", { count: project.docs[node.id]?.wordCount ?? 0 })}
                                                </span>
                                            </button>
                                        );
                                    })}
                                </div>
                            </section>
                        );
                    })}
                </div>
            ) : (
                <div className="flex flex-1 items-center justify-center text-sm" style={{ color: theme.node.muted }}>{t("writing.board.empty")}</div>
            )}
        </div>
    );
}
