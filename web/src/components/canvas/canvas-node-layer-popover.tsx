import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Eye, EyeOff, Lock, Unlock } from "lucide-react";
import { useTranslation } from "react-i18next";

import { useCanvasTheme } from "@/hooks/use-canvas-theme";
import { filterNodesByType, isNodeHidden, isNodeLocked } from "@/lib/canvas/canvas-node-geometry";
import { getNodeDefinition } from "@/lib/canvas/node-registry";
import { CanvasNodeType, type CanvasNodeData } from "@/types/canvas";

type CanvasNodeListPanelProps = {
    node?: CanvasNodeData | null;
    nodes: CanvasNodeData[];
    onMove?: (direction: "up" | "down") => void;
    onToggleFlag: (nodeId: string, flag: "locked" | "hidden") => void;
    onBulkRename: (ids: string[], title: string) => void;
    maxListHeight?: number;
};

export function CanvasNodeLayerPopover(props: CanvasNodeListPanelProps) {
    return (
        <div className="absolute bottom-full left-0 right-0 z-10 pb-2" onMouseDown={(event) => event.stopPropagation()} onPointerDown={(event) => event.stopPropagation()}>
            <div className="canvas-node-layer-popover mx-auto w-[250px]">
                <CanvasNodeListPanel {...props} maxListHeight={132} />
            </div>
        </div>
    );
}

export function CanvasNodeListPanel({ node, nodes, onMove, onToggleFlag, onBulkRename, maxListHeight = 240 }: CanvasNodeListPanelProps) {
    const theme = useCanvasTheme();
    const { t } = useTranslation();
    const [typeFilter, setTypeFilter] = useState("all");
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [titleDraft, setTitleDraft] = useState("");
    const stack = nodes.filter((item) => item.type !== CanvasNodeType.SmartCanvas);
    const stackIndex = node ? stack.findIndex((item) => item.id === node.id) : -1;
    const types = useMemo(() => Array.from(new Set(nodes.map((item) => item.type))), [nodes]);
    const listed = filterNodesByType(nodes, typeFilter);
    const canRaise = stackIndex >= 0 && moveTargetIndex(stack, stackIndex, 1) !== null;
    const canLower = stackIndex >= 0 && moveTargetIndex(stack, stackIndex, -1) !== null;
    const toggleSelected = (nodeId: string) =>
        setSelectedIds((current) => {
            const next = new Set(current);
            if (next.has(nodeId)) next.delete(nodeId);
            else next.add(nodeId);
            return next;
        });
    const applyRename = () => {
        if (!selectedIds.size || !titleDraft.trim()) return;
        onBulkRename([...selectedIds], titleDraft);
        setSelectedIds(new Set());
        setTitleDraft("");
    };

    return (
        <div className="rounded-none border p-2.5 text-sm glass-card" style={{ borderColor: theme.toolbar.border, color: theme.node.text }}>
            {stackIndex >= 0 ? (
                <>
                    <div className="text-center text-sm font-medium" style={{ color: theme.node.label }}>{t("canvas.nodeToolbar.layerCount", { current: stack.length - stackIndex, total: stack.length })}</div>
                    <div className="mt-2 grid grid-cols-2 gap-1.5">
                        <button
                            type="button"
                            className="flex h-8 items-center justify-center gap-1 rounded-[2px] text-sm transition hover:bg-hover disabled:opacity-30 disabled:hover:bg-transparent dark:disabled:hover:bg-transparent"
                            aria-label={t("canvas.nodeToolbar.bringForward")}
                            title={t("canvas.nodeToolbar.bringForward")}
                            disabled={!canRaise}
                            onClick={() => onMove?.("up")}
                        >
                            <ChevronLeft className="size-4" />
                            <span>{t("canvas.nodeToolbar.bringForward")}</span>
                        </button>
                        <button
                            type="button"
                            className="flex h-8 items-center justify-center gap-1 rounded-[2px] text-sm transition hover:bg-hover disabled:opacity-30 disabled:hover:bg-transparent dark:disabled:hover:bg-transparent"
                            aria-label={t("canvas.nodeToolbar.sendBackward")}
                            title={t("canvas.nodeToolbar.sendBackward")}
                            disabled={!canLower}
                            onClick={() => onMove?.("down")}
                        >
                            <ChevronRight className="size-4" />
                            <span>{t("canvas.nodeToolbar.sendBackward")}</span>
                        </button>
                    </div>
                    <div className="mt-2 text-center text-sm" style={{ color: theme.node.muted }}>{t("canvas.nodeToolbar.layerTie")}</div>
                </>
            ) : null}
            <div className="mt-2 flex items-center gap-2 border-t pt-2" style={{ borderColor: theme.toolbar.border }}>
                <select
                    value={typeFilter}
                    onChange={(event) => setTypeFilter(event.target.value)}
                    aria-label={t("canvas.nodeList.filter")}
                    className="h-7 min-w-0 flex-1 rounded-[2px] border bg-transparent px-1.5 text-sm outline-none"
                    style={{ borderColor: theme.toolbar.border, color: theme.node.text }}
                >
                    <option value="all">{t("canvas.nodeList.filterAll")}</option>
                    {types.map((type) => (
                        <option key={type} value={type}>
                            {t(`canvas.nodeTypes.${type}`, { defaultValue: getNodeDefinition(type)?.title || type })}
                        </option>
                    ))}
                </select>
                <span className="shrink-0 text-sm" style={{ color: theme.node.muted }}>{t("canvas.nodeList.selected", { count: selectedIds.size })}</span>
            </div>
            <div className="thin-scrollbar mt-1.5 overflow-y-auto" style={{ maxHeight: maxListHeight }}>
                {listed.length ? (
                    listed.map((item) => (
                        <div key={item.id} className="flex items-center gap-1.5 rounded-[2px] px-1 py-1 transition hover:bg-hover" style={selectedIds.has(item.id) ? { background: theme.toolbar.activeBg } : undefined}>
                            <input
                                type="checkbox"
                                className="size-3.5 shrink-0"
                                style={{ accentColor: theme.node.accent }}
                                checked={selectedIds.has(item.id)}
                                onChange={() => toggleSelected(item.id)}
                                aria-label={item.title || t("canvas.node.untitled")}
                            />
                            <span className="min-w-0 flex-1 truncate text-sm" style={{ color: isNodeHidden(item) ? theme.node.muted : theme.node.text }}>
                                {item.title || t("canvas.node.untitled")}
                            </span>
                            <button
                                type="button"
                                className="grid size-6 shrink-0 place-items-center rounded-[2px] transition hover:bg-hover hover:opacity-100"
                                style={{ color: isNodeLocked(item) ? theme.node.activeStroke : theme.node.text }}
                                aria-label={t(isNodeLocked(item) ? "canvas.nodeToolbar.unlock" : "canvas.nodeToolbar.lock")}
                                title={t(isNodeLocked(item) ? "canvas.nodeToolbar.unlock" : "canvas.nodeToolbar.lock")}
                                onClick={() => onToggleFlag(item.id, "locked")}
                            >
                                {isNodeLocked(item) ? <Lock className="size-3.5" /> : <Unlock className="size-3.5" />}
                            </button>
                            <button
                                type="button"
                                className="grid size-6 shrink-0 place-items-center rounded-[2px] transition hover:bg-hover hover:opacity-100"
                                style={{ color: isNodeHidden(item) ? theme.node.activeStroke : theme.node.text }}
                                aria-label={t(isNodeHidden(item) ? "canvas.nodeToolbar.show" : "canvas.nodeToolbar.hide")}
                                title={t(isNodeHidden(item) ? "canvas.nodeToolbar.show" : "canvas.nodeToolbar.hide")}
                                onClick={() => onToggleFlag(item.id, "hidden")}
                            >
                                {isNodeHidden(item) ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                            </button>
                        </div>
                    ))
                ) : (
                    <div className="py-3 text-center text-sm" style={{ color: theme.node.muted }}>{t("canvas.nodeList.empty")}</div>
                )}
            </div>
            <div className="mt-1.5 flex items-center gap-1.5 border-t pt-2" style={{ borderColor: theme.toolbar.border }}>
                <input
                    value={titleDraft}
                    onChange={(event) => setTitleDraft(event.target.value)}
                    onKeyDown={(event) => {
                        if (event.key === "Enter") applyRename();
                    }}
                    placeholder={t("canvas.nodeList.renamePlaceholder")}
                    aria-label={t("canvas.nodeList.renamePlaceholder")}
                    className="h-7 min-w-0 flex-1 rounded-[2px] border bg-transparent px-2 text-sm outline-none"
                    style={{ borderColor: theme.toolbar.border, color: theme.node.text }}
                />
                <button
                    type="button"
                    className="h-7 shrink-0 rounded-[2px] px-2 text-sm font-medium transition hover:bg-hover disabled:opacity-30 disabled:hover:bg-transparent dark:disabled:hover:bg-transparent"
                    disabled={!selectedIds.size || !titleDraft.trim()}
                    onClick={applyRename}
                >
                    {t("canvas.nodeList.rename")}
                </button>
            </div>
        </div>
    );
}

function moveTargetIndex(nodes: CanvasNodeData[], index: number, step: 1 | -1) {
    let target = index + step;
    while (target >= 0 && target < nodes.length && nodes[target].type === CanvasNodeType.SmartCanvas) target += step;
    return target >= 0 && target < nodes.length ? target : null;
}
