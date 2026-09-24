import { useMemo, useRef, useState, type Dispatch, type DragEvent, type ReactNode, type SetStateAction } from "react";
import { Dropdown, Select, Slider, type MenuProps } from "antd";
import { ChevronDown, ChevronRight, ChevronUp, Copy, Brush, Eye, EyeOff, Folder, FolderMinus, FolderPlus, Image as ImageIcon, ImagePlus, Layers, Lock, LockOpen, Shapes, SlidersHorizontal, Sparkles, Trash2, Type } from "lucide-react";
import { nanoid } from "nanoid";
import { useTranslation } from "react-i18next";

import { ImageSettingsTheme } from "@/components/image-settings-panel";
import { useResolvedBoardImageUrls, useResolvedPsLayerUrls } from "@/components/canvas/smart-canvas-node";
import PsFxPanel from "@/components/canvas/workspace/ps-fx-panel";
import type { PsLayerCommand } from "@/components/canvas/workspace/ps-actions-panel";
import { PS_MENU_POPUP } from "@/components/canvas/workspace/ps-menus";
import { addPsLayer, addPsLayerAbove, commitBoardLayers, duplicatePsLayer, findPsLayer, groupPsLayers, movePsLayerStep, movePsLayerTo, patchPsLayer, removePsLayer, ungroupPsLayer } from "@/components/canvas/workspace/ps-layer-ops";
import { useCanvasTheme } from "@/hooks/use-canvas-theme";
import { CANVAS_BLEND_MODES } from "@/lib/canvas/blend-modes";
import { PS_ADJUSTMENT_NAME_KEYS, PS_ADJUSTMENT_TYPES } from "@/lib/canvas/ps-adjustments";
import { createPsAdjustmentLayer, createPsImageLayer, createPsTextLayer, psGroupChildren, psLayerChildIds, psTopLayers, smartCanvasLayers } from "@/lib/canvas/smart-canvas";
import type { CanvasNodeData, CanvasPsAdjustmentType, CanvasPsLayer } from "@/types/canvas";

type PsLayersPanelProps = {
    board: CanvasNodeData;
    setNodes: Dispatch<SetStateAction<CanvasNodeData[]>>;
    imageNodes: CanvasNodeData[];
    selectedId: string;
    onSelect: (layerId: string) => void;
    maskTarget: boolean;
    maskView: boolean;
    onMaskTarget: (layerId: string, target: boolean, view: boolean) => void;
    onLayerCommand?: (command: PsLayerCommand) => void;
};

type DropPosition = "before" | "after" | "into";

const PANEL_ACTION_CLASS = "grid size-6 shrink-0 place-items-center rounded-[2px] transition hover:bg-hover disabled:opacity-25 disabled:hover:bg-transparent hover:bg-hover dark:disabled:hover:bg-transparent";
const ROW_ACTION_CLASS = "grid size-5 shrink-0 place-items-center rounded-[2px] transition hover:bg-hover";
const FOOTER_ACTION_CLASS = "flex h-6 min-w-0 items-center gap-1 rounded-[2px] px-1.5 text-sm transition hover:bg-hover disabled:opacity-30 disabled:hover:bg-transparent hover:bg-hover dark:disabled:hover:bg-transparent";

export default function PsLayersPanel({ board, setNodes, imageNodes, selectedId, onSelect, maskTarget, maskView, onMaskTarget, onLayerCommand }: PsLayersPanelProps) {
    const { t } = useTranslation();
    const theme = useCanvasTheme();
    const layers = smartCanvasLayers(board);
    const [pickerOpen, setPickerOpen] = useState(false);
    const [renamingId, setRenamingId] = useState("");
    const [nameDraft, setNameDraft] = useState("");
    const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
    const [dropHint, setDropHint] = useState<{ id: string; position: DropPosition } | null>(null);
    const [fxOpen, setFxOpen] = useState(false);
    const dragIdRef = useRef("");
    const cancelRenameRef = useRef(false);
    const imageById = useMemo(() => new Map(imageNodes.map((node) => [node.id, node])), [imageNodes]);
    const sources = useMemo(
        () => layers.flatMap((layer) => {
            const node = layer.sourceNodeId ? imageById.get(layer.sourceNodeId) : undefined;
            return node ? [node] : [];
        }),
        [layers, imageById],
    );
    const urls = useResolvedBoardImageUrls(sources);
    const { urls: pixelUrls, masks } = useResolvedPsLayerUrls(layers);
    const selected = findPsLayer(layers, selectedId);
    const blendOptions = CANVAS_BLEND_MODES.map((mode) => ({ value: mode.id, label: t(`canvas.blendModes.${mode.id}`) }));
    const commit = (next: CanvasPsLayer[]) => commitBoardLayers(setNodes, board.id, next);
    const childIds = psLayerChildIds(layers);
    const groupTarget = selected?.kind === "group" ? selected.id : undefined;

    const rows = useMemo(() => {
        return [...psTopLayers(layers)].reverse().flatMap((layer) => {
            if (layer.kind !== "group") return [{ layer, child: false }];
            const children = collapsed.has(layer.id) ? [] : [...psGroupChildren(layers, layer)].reverse();
            return [{ layer, child: false }, ...children.map((child) => ({ layer: child, child: true }))];
        });
    }, [layers, collapsed]);

    const addImageLayer = (node: CanvasNodeData) => {
        const layer = createPsImageLayer(board, node);
        commit(addPsLayer(layers, layer, groupTarget));
        onSelect(layer.id);
        setPickerOpen(false);
    };

    const addTextLayer = () => {
        const layer = createPsTextLayer(board, t("canvas.ps.newText"), t("canvas.ps.textLayer"));
        commit(addPsLayer(layers, layer, groupTarget));
        onSelect(layer.id);
    };

    const addAdjustmentLayer = (type: CanvasPsAdjustmentType) => {
        const layer = createPsAdjustmentLayer(board, type, t(PS_ADJUSTMENT_NAME_KEYS[type]));
        commit(addPsLayerAbove(layers, layer, groupTarget || selected?.id));
        onSelect(layer.id);
    };
    const adjustmentItems: MenuProps["items"] = PS_ADJUSTMENT_TYPES.map((type) => ({ key: type, label: t(PS_ADJUSTMENT_NAME_KEYS[type]) }));

    const finishRename = () => {
        if (cancelRenameRef.current) {
            cancelRenameRef.current = false;
            setRenamingId("");
            return;
        }
        if (!renamingId) return;
        const name = nameDraft.trim();
        if (name) commit(patchPsLayer(layers, renamingId, { name }));
        setRenamingId("");
    };

    const dropPositionFor = (event: DragEvent<HTMLDivElement>, layer: CanvasPsLayer): DropPosition => {
        const box = event.currentTarget.getBoundingClientRect();
        const ratio = (event.clientY - box.top) / Math.max(1, box.height);
        if (layer.kind === "group" && ratio > 0.3 && ratio < 0.7) return "into";
        return ratio < 0.5 ? "after" : "before";
    };

    const dropRow = (event: DragEvent<HTMLDivElement>, layer: CanvasPsLayer) => {
        event.preventDefault();
        const dragId = dragIdRef.current;
        dragIdRef.current = "";
        setDropHint(null);
        if (!dragId || dragId === layer.id) return;
        commit(movePsLayerTo(layers, dragId, layer.id, dropPositionFor(event, layer)));
    };

    return (
        <section className="flex min-h-0 flex-col border-b" style={{ borderColor: theme.toolbar.border }}>
            <div className="flex shrink-0 flex-wrap items-center gap-0.5 px-2 py-1.5">
                <Layers className="mr-1 size-3.5 shrink-0" style={{ color: theme.node.muted }} />
                <span className="min-w-0 flex-1 truncate text-xs font-medium" style={{ color: theme.node.label }}>{t("canvas.ps.layers")}</span>
                <PanelAction label={t("canvas.ps.addImage")} onClick={() => setPickerOpen(!pickerOpen)}>
                    <ImagePlus className="size-3.5" />
                </PanelAction>
                <PanelAction label={t("canvas.ps.addText")} onClick={addTextLayer}>
                    <Type className="size-3.5" />
                </PanelAction>
                <PanelAction
                    label={t("canvas.ps.addGroup")}
                    disabled={!selected || selected.kind === "group" || childIds.has(selected.id)}
                    onClick={() => {
                        if (!selected) return;
                        const groupId = nanoid();
                        commit(groupPsLayers(layers, [selected.id], groupId, t("canvas.ps.groupLayer")));
    onLayerCommand?.("group");
                        onSelect(groupId);
                    }}
                >
                    <FolderPlus className="size-3.5" />
                </PanelAction>
                <PanelAction label={t("canvas.ps.ungroup")} disabled={selected?.kind !== "group"} onClick={() => { if (!selected) return; commit(ungroupPsLayer(layers, selected.id)); onLayerCommand?.("ungroup"); }}>
                    <FolderMinus className="size-3.5" />
                </PanelAction>
                <PanelAction
                    label={t("canvas.ps.duplicate")}
                    disabled={!selected}
                    onClick={() => {
                        if (!selected) return;
                        const copyId = nanoid();
                        commit(duplicatePsLayer(layers, selected.id, t("canvas.ps.duplicateSuffix"), copyId));
    onLayerCommand?.("duplicate");
                        onSelect(copyId);
                    }}
                >
                    <Copy className="size-3.5" />
                </PanelAction>
                <PanelAction label={t("canvas.ps.remove")} disabled={!selected} onClick={() => { if (!selected) return; commit(removePsLayer(layers, selected.id)); onLayerCommand?.("delete"); }}>
                    <Trash2 className="size-3.5" />
                </PanelAction>
                <PanelAction label={t("canvas.ps.moveUp")} disabled={!selected} onClick={() => { if (!selected) return; commit(movePsLayerStep(layers, selected.id, "forward")); onLayerCommand?.("forward"); }}>
                    <ChevronUp className="size-3.5" />
                </PanelAction>
                <PanelAction label={t("canvas.ps.moveDown")} disabled={!selected} onClick={() => { if (!selected) return; commit(movePsLayerStep(layers, selected.id, "backward")); onLayerCommand?.("backward"); }}>
                    <ChevronDown className="size-3.5" />
                </PanelAction>
            </div>

            <div className="shrink-0 px-2 pb-1.5">
                {selected ? (
                    <ImageSettingsTheme theme={theme}>
                        <div className="flex items-center gap-1.5">
                            <Select
                                size="small"
                                variant="borderless"
                                className="min-w-0 flex-1"
                                value={selected.blendMode}
                                options={blendOptions}
                                popupMatchSelectWidth={false}
                                styles={{ popup: { root: { zIndex: 1300 } } }}
                                aria-label={t("canvas.ps.blendMode")}
                                onChange={(value) => commit(patchPsLayer(layers, selected.id, { blendMode: value }))}
                            />
                            <Slider
                                className="!mx-0 !w-16"
                                min={0}
                                max={100}
                                step={1}
                                value={Math.round(selected.opacity * 100)}
                                tooltip={{ formatter: (value) => `${value}%` }}
                                ariaLabelForHandle={t("canvas.ps.opacity")}
                                onChange={(value) => commit(patchPsLayer(layers, selected.id, { opacity: value / 100 }))}
                            />
                            <span className="w-7 shrink-0 text-right text-xs tabular-nums" style={{ color: theme.node.text }}>
                                {Math.round(selected.opacity * 100)}%
                            </span>
                        </div>
                    </ImageSettingsTheme>
                ) : (
                    <p className="px-1 text-sm" style={{ color: theme.node.muted }}>
                        {t("canvas.ps.selectionNone")}
                    </p>
                )}
            </div>

            {pickerOpen ? (
                <div className="thin-scrollbar mx-2 mb-1 max-h-40 shrink-0 overflow-y-auto border p-1 glass-raised" style={{ borderColor: theme.toolbar.border }}>
                    {imageNodes.length ? (
                        imageNodes.map((node) => (
                            <button key={node.id} type="button" className="flex w-full items-center gap-2 border-b px-2 py-1.5 text-left text-sm transition hover:bg-hover" style={{ borderColor: theme.toolbar.border, color: theme.node.text }} onClick={() => addImageLayer(node)}>
                                <ImageIcon className="size-3.5 shrink-0" style={{ color: theme.node.muted }} />
                                <span className="min-w-0 flex-1 truncate">{node.title || t("canvas.node.untitled")}</span>
                            </button>
                        ))
                    ) : (
                        <p className="px-2 py-1 text-sm" style={{ color: theme.node.muted }}>
                            {t("canvas.ps.noImageNodes")}
                        </p>
                    )}
                </div>
            ) : null}

            <div className="thin-scrollbar min-h-0 flex-1 overflow-y-auto px-1 pb-1.5 glass-card">
                {rows.length ? (
                    rows.map(({ layer, child }) => {
                        const isSelected = layer.id === selectedId;
                        const drop = dropHint?.id === layer.id ? dropHint.position : null;
                        return (
                            <div
                                key={layer.id}
                                draggable
                                className={`flex items-center gap-1 py-1 pl-1 pr-0.5 transition hover:bg-hover ${child ? "ml-3" : ""}`}
                                style={{
                                    background: isSelected ? theme.toolbar.activeBg : undefined,
                                    color: isSelected ? theme.toolbar.activeText : theme.node.text,
                                    boxShadow: drop === "into" ? `inset 0 0 0 1px ${theme.node.activeStroke}` : isSelected ? `inset 2px 0 0 0 ${theme.node.accent}` : undefined,
                                    borderTop: drop === "after" ? `1px solid ${theme.node.activeStroke}` : "1px solid transparent",
                                    borderBottom: drop === "before" ? `1px solid ${theme.node.activeStroke}` : `1px solid ${theme.toolbar.border}`,
                                }}
                                onClick={() => {
                                    onSelect(layer.id);
                                    onMaskTarget(layer.id, false, false);
                                }}
                                onDoubleClick={() => {
                                    if (layer.kind === "adjustment") return;
                                    onSelect(layer.id);
                                    setFxOpen(true);
                                }}
                                onDragStart={(event) => {
                                    dragIdRef.current = layer.id;
                                    event.dataTransfer.effectAllowed = "move";
                                    event.dataTransfer.setData("text/plain", layer.id);
                                }}
                                onDragOver={(event) => {
                                    event.preventDefault();
                                    setDropHint({ id: layer.id, position: dropPositionFor(event, layer) });
                                }}
                                onDrop={(event) => dropRow(event, layer)}
                                onDragEnd={() => setDropHint(null)}
                            >
                                {layer.kind === "group" ? (
                                    <button
                                        type="button"
                                        className={ROW_ACTION_CLASS}
                                        aria-label={t("canvas.ps.toggleGroup")}
                                        title={t("canvas.ps.toggleGroup")}
                                        onClick={(event) => {
                                            event.stopPropagation();
                                            setCollapsed((prev) => {
                                                const next = new Set(prev);
                                                if (next.has(layer.id)) next.delete(layer.id);
                                                else next.add(layer.id);
                                                return next;
                                            });
                                        }}
                                    >
                                        {collapsed.has(layer.id) ? <ChevronRight className="size-3.5" /> : <ChevronDown className="size-3.5" />}
                                    </button>
                                ) : null}
                                <button
                                    type="button"
                                    className={ROW_ACTION_CLASS}
                                    aria-label={t(layer.hidden ? "canvas.ps.show" : "canvas.ps.hide")}
                                    title={t(layer.hidden ? "canvas.ps.show" : "canvas.ps.hide")}
                                    onClick={(event) => {
                                        event.stopPropagation();
                                        commit(patchPsLayer(layers, layer.id, { hidden: !layer.hidden }));
                                    }}
                                >
                                    {layer.hidden ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                                </button>
                                <button
                                    type="button"
                                    className="shrink-0 rounded-[2px]"
                                    aria-label={t("canvas.ps.layerTarget")}
                                    title={t("canvas.ps.layerTarget")}
                                    onClick={(event) => {
                                        event.stopPropagation();
                                        onSelect(layer.id);
                                        onMaskTarget(layer.id, false, false);
                                    }}
                                >
                                    <LayerThumb layer={layer} url={layer.kind === "pixel" ? pixelUrls[layer.id] : layer.sourceNodeId ? urls[layer.sourceNodeId] : undefined} theme={theme} active={isSelected && !maskTarget} />
                                </button>
                                {layer.maskStorageKey && masks[layer.id] ? (
                                    <button
                                        type="button"
                                        className="grid size-7 shrink-0 place-items-center overflow-hidden rounded-[2px]"
                                        style={{ background: theme.node.infoSoft, boxShadow: isSelected && maskTarget ? `inset 0 0 0 2px ${theme.node.info}` : undefined }}
                                        aria-label={t("canvas.ps.maskTarget")}
                                        title={t("canvas.ps.maskHint")}
                                        onClick={(event) => {
                                            event.stopPropagation();
                                            onSelect(layer.id);
                                            if (event.altKey) onMaskTarget(layer.id, maskTarget, !maskView);
                                            else onMaskTarget(layer.id, true, true);
                                        }}
                                    >
                                        <img src={masks[layer.id]} alt="" draggable={false} className="h-full w-full object-cover" />
                                    </button>
                                ) : null}
                                {renamingId === layer.id ? (
                                    <input
                                        autoFocus
                                        value={nameDraft}
                                        maxLength={64}
                                        className="h-5 min-w-0 flex-1 border-0 border-b border-dashed bg-transparent px-0 text-sm outline-none"
                                        style={{ borderColor: theme.node.muted, color: theme.node.text }}
                                        onChange={(event) => setNameDraft(event.target.value)}
                                        onBlur={finishRename}
                                        onKeyDown={(event) => {
                                            if (event.key === "Enter") finishRename();
                                            if (event.key === "Escape") {
                                                cancelRenameRef.current = true;
                                                setRenamingId("");
                                            }
                                        }}
                                    />
                                ) : (
                                    <span className="min-w-0 flex-1 truncate px-0.5 text-sm" style={layer.hidden ? { color: theme.node.muted } : undefined} title={t("canvas.ps.renameHint")} onDoubleClick={(event) => { event.stopPropagation(); setRenamingId(layer.id); setNameDraft(layer.name); }}>
                                        {layer.name || t("canvas.node.untitled")}
                                    </span>
                                )}
                                <button
                                    type="button"
                                    className={ROW_ACTION_CLASS}
                                    style={layer.locked ? { color: theme.node.danger } : undefined}
                                    aria-label={t(layer.locked ? "canvas.ps.unlock" : "canvas.ps.lock")}
                                    title={t(layer.locked ? "canvas.ps.unlock" : "canvas.ps.lock")}
                                    onClick={(event) => {
                                        event.stopPropagation();
                                        commit(patchPsLayer(layers, layer.id, { locked: !layer.locked }));
                                    }}
                                >
                                    {layer.locked ? <Lock className="size-3.5" /> : <LockOpen className="size-3.5" />}
                                </button>
                            </div>
                        );
                    })
                ) : null}
            </div>

            <div className="flex shrink-0 items-center gap-0.5 border-t px-2 py-1" style={{ borderColor: theme.toolbar.border }}>
                <Dropdown menu={{ ...PS_MENU_POPUP, items: adjustmentItems, onClick: ({ key }) => addAdjustmentLayer(key as CanvasPsAdjustmentType) }} placement="bottomLeft" styles={{ root: { zIndex: 1300 } }}>
                    <button type="button" className={FOOTER_ACTION_CLASS} style={{ color: theme.node.text }} aria-label={t("canvas.ps.addAdjustment")} title={t("canvas.ps.addAdjustment")}>
                        <SlidersHorizontal className="size-3.5" />
                        {t("canvas.ps.addAdjustment")}
                    </button>
                </Dropdown>
                <span className="min-w-0 flex-1" />
                <button
                    type="button"
                    className={FOOTER_ACTION_CLASS}
                    style={{ color: theme.node.text }}
                    disabled={!selected || selected.kind === "adjustment"}
                    aria-label={t("canvas.ps.layerStyle")}
                    title={t("canvas.ps.fxHint")}
                    onClick={() => setFxOpen(true)}
                >
                    <Sparkles className="size-3.5" />
                    {t("canvas.ps.layerStyle")}
                </button>
            </div>
            <PsFxPanel board={board} setNodes={setNodes} layer={fxOpen && selected && selected.kind !== "adjustment" ? selected : null} onClose={() => setFxOpen(false)} />
        </section>
    );
}

function LayerThumb({ layer, url, theme, active }: { layer: CanvasPsLayer; url?: string; theme: ReturnType<typeof useCanvasTheme>; active: boolean }) {
    const ring = active ? { boxShadow: `inset 0 0 0 2px ${theme.node.activeStroke}` } : undefined;
    if (layer.kind === "group" || layer.kind === "text") {
        const Icon = layer.kind === "group" ? Folder : Type;
        return (
            <span className="grid size-7 shrink-0 place-items-center overflow-hidden rounded-[2px]" style={ring}>
                <Icon className="size-3.5" style={{ color: theme.node.muted }} />
            </span>
        );
    }
    const Fallback = layer.kind === "pixel" ? Brush : layer.kind === "shape" ? Shapes : layer.kind === "adjustment" ? SlidersHorizontal : ImageIcon;
    return (
        <span className="grid size-7 shrink-0 place-items-center overflow-hidden rounded-[2px]" style={ring}>
            {url ? <img src={url} alt="" draggable={false} className="h-full w-full object-cover" /> : <Fallback className="size-3.5" style={{ color: theme.node.muted }} />}
        </span>
    );
}

function PanelAction({ label, disabled = false, onClick, children }: { label: string; disabled?: boolean; onClick: () => void; children: ReactNode }) {
    const theme = useCanvasTheme();
    return (
        <button type="button" className={PANEL_ACTION_CLASS} style={{ color: theme.node.label }} aria-label={label} title={label} disabled={disabled} onClick={onClick}>
            {children}
        </button>
    );
}
