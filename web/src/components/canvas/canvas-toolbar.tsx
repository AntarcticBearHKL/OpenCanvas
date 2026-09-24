import type { CSSProperties, MouseEvent as ReactMouseEvent, ReactNode, RefObject } from "react";
import { useEffect, useRef, useState } from "react";
import { Button, Modal } from "antd";
import { AlignLeft, AudioLines, Clapperboard, Compass, Download, Focus, FolderDown, FolderInput, Hand, HelpCircle, LayoutDashboard, ListTree, Loader2, MessageSquareText, Mic, MousePointer2, Music2, Puzzle, Redo2, SlidersHorizontal, SlidersVertical, Sparkles, Trash2, Undo2, Video, ZoomIn } from "lucide-react";

import { canvasThemes, type CanvasTheme } from "@/lib/canvas-theme";
import { useCanvasTheme } from "@/hooks/use-canvas-theme";
import { getNodePluginId, listNodeDefinitions, useNodeRegistryVersion } from "@/lib/canvas/node-registry";
import { useThemeStore } from "@/stores/use-theme-store";
import { useTranslation } from "react-i18next";
import { CanvasNodeType, type CanvasNodeMetadata, type CanvasNodeTypeId } from "@/types/canvas";

export function CanvasToolbar({
    selectedCount,
    canvasTool,
    canUndo,
    canRedo,
    scale,
    isMiniMapOpen,
    onAddNode,
    onAddExtensionNode,
    onExport,
    onUndo,
    onRedo,
    onDelete,
    onCanvasToolChange,
    onScaleChange,
    onResetViewport,
    onToggleMiniMap,
    isNodeListOpen,
    onToggleNodeList,
}: {
    selectedCount: number;
    canvasTool: "select" | "pan";
    canUndo: boolean;
    canRedo: boolean;
    scale: number;
    isMiniMapOpen: boolean;
    onAddNode: (type: CanvasNodeTypeId, metadata?: CanvasNodeMetadata) => void;
    onAddExtensionNode: (type: string) => void;
    onExport: () => Promise<void>;
    onUndo: () => void;
    onRedo: () => void;
    onDelete: () => void;
    onCanvasToolChange: (tool: "select" | "pan") => void;
    onScaleChange: (scale: number) => void;
    onResetViewport: () => void;
    onToggleMiniMap: () => void;
    isNodeListOpen: boolean;
    onToggleNodeList: () => void;
}) {
    const wrapRef = useRef<HTMLDivElement>(null);
    const { t } = useTranslation();
    const rootRef = useRef<HTMLDivElement>(null);
    const colorTheme = useThemeStore((state) => state.theme);
    const theme = canvasThemes[colorTheme];
    const [hovered, setHovered] = useState<string | null>(null);
    const [tipX, setTipX] = useState(0);
    const [extensionsOpen, setExtensionsOpen] = useState(false);
    const [extPanelX, setExtPanelX] = useState(0);
    const [zoomOpen, setZoomOpen] = useState(false);
    const [zoomPanelX, setZoomPanelX] = useState(0);
    const [shortcutsOpen, setShortcutsOpen] = useState(false);
    const [createMenu, setCreateMenu] = useState<"prompt" | "generator" | "input" | "modifiers" | null>(null);
    const [createMenuX, setCreateMenuX] = useState(0);
    const [exporting, setExporting] = useState(false);
    // Keep extension plugin nodes synchronized with registry changes.
    useNodeRegistryVersion();
    const extensionDefs = listNodeDefinitions().filter((def) => def.showInCreateMenu !== false && getNodePluginId(def.type) !== "builtin");
    const dockStyle = { borderColor: theme.toolbar.border, color: theme.toolbar.item };
    const hoverStyle = { background: theme.toolbar.itemHover, color: theme.toolbar.activeText };
    const activeStyle = { background: theme.toolbar.activeBg, color: theme.toolbar.activeText };
    // Tips share the band above the dock with the create/extensions/zoom panels, so hide them while a panel is open.
    const tip = hovered && !createMenu && !extensionsOpen && !zoomOpen ? toolLabel(hovered, t) : "";
    const createMenuItems: Record<"prompt" | "generator" | "input" | "modifiers", { type: CanvasNodeType; label: string; icon: ReactNode; metadata?: CanvasNodeMetadata }[]> = {
        prompt: [
            { type: CanvasNodeType.Prompt, label: t("canvas.nodeTypes.prompt"), icon: <MessageSquareText className="size-4" /> },
            { type: CanvasNodeType.MusicPrompt, label: t("canvas.nodeTypes.musicPrompt"), icon: <Music2 className="size-4" /> },
            { type: CanvasNodeType.SpeechPrompt, label: t("canvas.nodeTypes.speechPrompt"), icon: <AlignLeft className="size-4" /> },
            { type: CanvasNodeType.VideoPrompt, label: t("canvas.nodeTypes.videoPrompt"), icon: <Clapperboard className="size-4" /> },
        ],
        generator: [
            { type: CanvasNodeType.ImageGeneration, label: t("canvas.nodeTypes.imageGeneration"), icon: <Sparkles className="size-4" /> },
            { type: CanvasNodeType.MusicGeneration, label: t("canvas.nodeTypes.musicGeneration"), icon: <AudioLines className="size-4" /> },
            { type: CanvasNodeType.SpeechGeneration, label: t("canvas.nodeTypes.speechGeneration"), icon: <Mic className="size-4" /> },
            { type: CanvasNodeType.VideoGeneration, label: t("canvas.nodeTypes.videoGeneration"), icon: <Video className="size-4" /> },
        ],
        input: [
            { type: CanvasNodeType.Assets, label: t("canvas.nodeTypes.assets"), icon: <FolderInput className="size-4" /> },
            { type: CanvasNodeType.Recording, label: t("canvas.nodeTypes.recording"), icon: <Mic className="size-4" /> },
        ],
        modifiers: [{ type: CanvasNodeType.ImageModifier, label: t("canvas.nodeTypes.imageModifier"), icon: <SlidersHorizontal className="size-4" /> }],
    };

    // Close toolbar popovers when clicking outside the toolbar and its panels, or when pressing Escape.
    useEffect(() => {
        if (!extensionsOpen && !zoomOpen && !createMenu) return;
        const closePanels = () => {
            setExtensionsOpen(false);
            setZoomOpen(false);
            setCreateMenu(null);
        };
        const handlePointerDown = (event: PointerEvent) => {
            if (rootRef.current && !rootRef.current.contains(event.target as Node)) closePanels();
        };
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") closePanels();
        };
        document.addEventListener("pointerdown", handlePointerDown, true);
        document.addEventListener("keydown", handleKeyDown);
        return () => {
            document.removeEventListener("pointerdown", handlePointerDown, true);
            document.removeEventListener("keydown", handleKeyDown);
        };
    }, [extensionsOpen, zoomOpen, createMenu]);

    return (
        <div ref={rootRef} className="pointer-events-none absolute bottom-5 left-0 right-0 z-50 flex justify-center px-3">
            {tip ? <DockTip label={tip} x={tipX} theme={theme} /> : null}
            <div ref={wrapRef} className={`thin-scrollbar pointer-events-auto flex h-14 max-w-full items-center gap-1 overflow-x-auto rounded-xl border px-2 [&>*]:shrink-0 glass-surface`} style={dockStyle}>
                <ToolbarButton
                    id="tool-export"
                    label={t("canvas.exportCanvas")}
                    disabled={exporting}
                    hovered={hovered}
                    hoverStyle={hoverStyle}
                    wrapRef={wrapRef}
                    onTipX={setTipX}
                    onHover={setHovered}
                    onClick={async () => {
                        setExporting(true);
                        try {
                            await onExport();
                        } finally {
                            setExporting(false);
                        }
                    }}
                >
                    {exporting ? <Loader2 className="size-4.5 animate-spin" /> : <Download className="size-4.5" />}
                </ToolbarButton>
                <Divider theme={theme} />
                <ToolbarButton id={`tool-${canvasTool}`} label={t(`canvas.toolbar.${canvasTool}`)} active hovered={hovered} activeStyle={activeStyle} hoverStyle={hoverStyle} wrapRef={wrapRef} onTipX={setTipX} onHover={setHovered} onClick={() => onCanvasToolChange(canvasTool === "select" ? "pan" : "select")}>
                    {canvasTool === "select" ? <MousePointer2 className="size-4.5" /> : <Hand className="size-4.5" />}
                </ToolbarButton>
                <ToolbarButton id="tool-undo" label={t("canvas.undo")} disabled={!canUndo} hovered={hovered} hoverStyle={hoverStyle} wrapRef={wrapRef} onTipX={setTipX} onHover={setHovered} onClick={onUndo}>
                    <Undo2 className="size-4.5" />
                </ToolbarButton>
                <ToolbarButton id="tool-redo" label={t("canvas.redo")} disabled={!canRedo} hovered={hovered} hoverStyle={hoverStyle} wrapRef={wrapRef} onTipX={setTipX} onHover={setHovered} onClick={onRedo}>
                    <Redo2 className="size-4.5" />
                </ToolbarButton>
                <Divider theme={theme} />
                <ToolbarButton
                    id="tool-input-group"
                    label={t("canvas.toolbar.inputOutputGroup")}
                    active={createMenu === "input"}
                    hovered={hovered}
                    activeStyle={activeStyle}
                    hoverStyle={hoverStyle}
                    wrapRef={wrapRef}
                    onTipX={setTipX}
                    onHover={setHovered}
                    onClick={(event) => {
                        setCreateMenuX(getTipX(wrapRef.current, event.currentTarget));
                        setExtensionsOpen(false);
                        setZoomOpen(false);
                        setCreateMenu((value) => (value === "input" ? null : "input"));
                    }}
                >
                    <FolderDown className="size-4.5" />
                </ToolbarButton>
                <ToolbarButton
                    id="tool-prompt-group"
                    label={t("canvas.toolbar.promptGroup")}
                    active={createMenu === "prompt"}
                    hovered={hovered}
                    activeStyle={activeStyle}
                    hoverStyle={hoverStyle}
                    wrapRef={wrapRef}
                    onTipX={setTipX}
                    onHover={setHovered}
                    onClick={(event) => {
                        setCreateMenuX(getTipX(wrapRef.current, event.currentTarget));
                        setExtensionsOpen(false);
                        setZoomOpen(false);
                        setCreateMenu((value) => (value === "prompt" ? null : "prompt"));
                    }}
                >
                    <MessageSquareText className="size-4.5" />
                </ToolbarButton>
                <ToolbarButton
                    id="tool-modifiers-group"
                    label={t("canvas.toolbar.modifiersGroup")}
                    active={createMenu === "modifiers"}
                    hovered={hovered}
                    activeStyle={activeStyle}
                    hoverStyle={hoverStyle}
                    wrapRef={wrapRef}
                    onTipX={setTipX}
                    onHover={setHovered}
                    onClick={(event) => {
                        setCreateMenuX(getTipX(wrapRef.current, event.currentTarget));
                        setExtensionsOpen(false);
                        setZoomOpen(false);
                        setCreateMenu((value) => (value === "modifiers" ? null : "modifiers"));
                    }}
                >
                    <SlidersHorizontal className="size-4.5" />
                </ToolbarButton>
                <ToolbarButton
                    id="tool-generator-group"
                    label={t("canvas.toolbar.generatorGroup")}
                    active={createMenu === "generator"}
                    hovered={hovered}
                    activeStyle={activeStyle}
                    hoverStyle={hoverStyle}
                    wrapRef={wrapRef}
                    onTipX={setTipX}
                    onHover={setHovered}
                    onClick={(event) => {
                        setCreateMenuX(getTipX(wrapRef.current, event.currentTarget));
                        setExtensionsOpen(false);
                        setZoomOpen(false);
                        setCreateMenu((value) => (value === "generator" ? null : "generator"));
                    }}
                >
                    <Sparkles className="size-4.5" />
                </ToolbarButton>
                <Divider theme={theme} />
                <ToolbarButton id="tool-audio-project" label={t("canvas.nodeTypes.audioProject")} hovered={hovered} hoverStyle={hoverStyle} wrapRef={wrapRef} onTipX={setTipX} onHover={setHovered} onClick={() => onAddNode(CanvasNodeType.AudioProject)}>
                    <SlidersVertical className="size-4.5" />
                </ToolbarButton>
                <ToolbarButton id="tool-smart-canvas" label={t("canvas.nodeTypes.smartCanvas")} hovered={hovered} hoverStyle={hoverStyle} wrapRef={wrapRef} onTipX={setTipX} onHover={setHovered} onClick={() => onAddNode(CanvasNodeType.SmartCanvas)}>
                    <LayoutDashboard className="size-4.5" />
                </ToolbarButton>
                {extensionDefs.length ? (
                    <ToolbarButton
                        id="tool-extensions"
                        label={t("canvas.toolbar.extensions")}
                        active={extensionsOpen}
                        hovered={hovered}
                        activeStyle={activeStyle}
                        hoverStyle={hoverStyle}
                        wrapRef={wrapRef}
                        onTipX={setTipX}
                        onHover={setHovered}
                        onClick={(event) => {
                            setExtPanelX(getTipX(wrapRef.current, event.currentTarget));
                            setZoomOpen(false);
                            setExtensionsOpen((value) => !value);
                        }}
                    >
                        <Puzzle className="size-4.5" />
                    </ToolbarButton>
                ) : null}
                <Divider theme={theme} />
                <ToolbarButton
                    id="tool-zoom"
                    label={t("canvas.toolbar.zoom")}
                    active={zoomOpen}
                    hovered={hovered}
                    activeStyle={activeStyle}
                    hoverStyle={hoverStyle}
                    wrapRef={wrapRef}
                    onTipX={setTipX}
                    onHover={setHovered}
                    onClick={(event) => {
                        setZoomPanelX(getTipX(wrapRef.current, event.currentTarget));
                        setExtensionsOpen(false);
                        setZoomOpen((value) => !value);
                    }}
                >
                    <ZoomIn className="size-4.5" />
                </ToolbarButton>
                <ToolbarButton
                    id="tool-node-list"
                    label={t("canvas.nodeList.title")}
                    active={isNodeListOpen}
                    hovered={hovered}
                    activeStyle={activeStyle}
                    hoverStyle={hoverStyle}
                    wrapRef={wrapRef}
                    onTipX={setTipX}
                    onHover={setHovered}
                    onClick={onToggleNodeList}
                >
                    <ListTree className="size-4.5" />
                </ToolbarButton>
                {selectedCount ? (
                    <>
                        <Divider theme={theme} />
                        <ToolbarButton id="tool-delete" label={t("canvas.deleteSelected")} hovered={hovered} hoverStyle={hoverStyle} wrapRef={wrapRef} onTipX={setTipX} onHover={setHovered} onClick={onDelete} danger>
                            <Trash2 className="size-4.5" />
                        </ToolbarButton>
                    </>
                ) : null}
            </div>

            {createMenu ? (
                <div
                    className="pointer-events-auto absolute bottom-[72px] z-30 w-[220px] -translate-x-1/2 rounded-xl border p-2 glass-raised"
                    style={{ left: createMenuX || "50%", borderColor: theme.toolbar.border, color: theme.toolbar.item }}
                >
                    <div className="px-1.5 pb-1.5 text-sm font-medium" style={{ color: theme.node.label }}>{t(createMenu === "prompt" ? "canvas.toolbar.promptGroup" : createMenu === "generator" ? "canvas.toolbar.generatorGroup" : createMenu === "modifiers" ? "canvas.toolbar.modifiersGroup" : "canvas.toolbar.inputOutputGroup")}</div>
                    <div className="grid gap-0.5">
                        {createMenuItems[createMenu].map((item) => (
                            <button
                                key={`${item.type}-${item.label}`}
                                type="button"
                                className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-sm transition"
                                style={{ color: theme.toolbar.item }}
                                onMouseEnter={(event) => (event.currentTarget.style.background = theme.toolbar.itemHover)}
                                onMouseLeave={(event) => (event.currentTarget.style.background = "transparent")}
                                onClick={() => {
                                    onAddNode(item.type, item.metadata);
                                    setCreateMenu(null);
                                }}
                            >
                                <span className="grid size-7 shrink-0 place-items-center rounded-md text-base" style={{ background: theme.toolbar.itemHover }}>
                                    {item.icon}
                                </span>
                                <span className="min-w-0 flex-1 truncate">{item.label}</span>
                            </button>
                        ))}
                    </div>
                </div>
            ) : null}

            {extensionsOpen && extensionDefs.length ? (
                <div
                    className="thin-scrollbar pointer-events-auto absolute bottom-[72px] z-30 max-h-[50vh] w-[240px] -translate-x-1/2 overflow-y-auto rounded-xl border p-2 glass-raised"
                    style={{ left: extPanelX || "50%", borderColor: theme.toolbar.border, color: theme.toolbar.item }}
                >
                    <div className="px-1.5 pb-1.5 text-sm font-medium" style={{ color: theme.node.label }}>{t("canvas.toolbar.extensions")}</div>
                    <div className="grid gap-0.5">
                        {extensionDefs.map((def) => (
                            <button
                                key={def.type}
                                type="button"
                                className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-sm transition"
                                style={{ color: theme.toolbar.item }}
                                onMouseEnter={(event) => (event.currentTarget.style.background = theme.toolbar.itemHover)}
                                onMouseLeave={(event) => (event.currentTarget.style.background = "transparent")}
                                onClick={() => {
                                    onAddExtensionNode(def.type);
                                    setExtensionsOpen(false);
                                }}
                            >
                                <span className="grid size-7 shrink-0 place-items-center rounded-md text-base" style={{ background: theme.toolbar.itemHover }}>
                                    {def.icon}
                                </span>
                                <span className="min-w-0 flex-1 truncate">{def.title}</span>
                            </button>
                        ))}
                    </div>
                </div>
            ) : null}

            {zoomOpen ? (
                <div
                    className="pointer-events-auto absolute bottom-[72px] z-30 w-[248px] -translate-x-1/2 rounded-xl border p-2.5 glass-raised"
                    style={{ left: zoomPanelX || "50%", borderColor: theme.toolbar.border, color: theme.toolbar.item }}
                >
                    <div className="flex items-center justify-between gap-3 px-1 pb-2">
                        <span className="text-sm font-medium" style={{ color: theme.node.text }}>{t("canvas.toolbar.zoom")}</span>
                        <span className="text-xs tabular-nums" style={{ color: theme.node.muted }}>{Math.round(scale * 100)}%</span>
                    </div>
                    <input
                        type="range"
                        min="5"
                        max="500"
                        step="1"
                        value={Math.round(scale * 100)}
                        className="w-full"
                        style={{ accentColor: theme.node.activeStroke }}
                        onChange={(event) => onScaleChange(Number(event.target.value) / 100)}
                        aria-label={t("canvas.toolbar.zoom")}
                    />
                    <div className="mt-2 grid gap-0.5">
                        <PanelAction icon={<Focus className="size-4" />} label={t("canvas.resetView")} theme={theme} onClick={onResetViewport} />
                        <PanelAction
                            icon={<Compass className="size-4" />}
                            label={isMiniMapOpen ? t("canvas.miniMapClose") : t("canvas.miniMapOpen")}
                            active={isMiniMapOpen}
                            theme={theme}
                            onClick={onToggleMiniMap}
                        />
                        <PanelAction
                            icon={<HelpCircle className="size-4" />}
                            label={t("canvas.shortcuts")}
                            theme={theme}
                            onClick={() => {
                                setZoomOpen(false);
                                setShortcutsOpen(true);
                            }}
                        />
                    </div>
                </div>
            ) : null}

            <Modal title={t("canvas.shortcuts")} open={shortcutsOpen} onCancel={() => setShortcutsOpen(false)} footer={null} centered>
                <div className="space-y-3 border-t pt-4 text-sm" style={{ borderColor: theme.node.stroke }}>
                    <Shortcut label={`Ctrl / Space + ${t("canvas.shortcut.drag")}`} value={t("canvas.shortcut.toggleTool")} />
                    <Shortcut label={t("canvas.shortcut.wheel")} value={t("canvas.shortcut.zoom")} />
                    <Shortcut label={t("canvas.shortcut.drag")} value={t("canvas.shortcut.boxSelect")} />
                    <Shortcut label={`Shift / Cmd + ${t("canvas.shortcut.click")}`} value={t("canvas.shortcut.addSelection")} />
                    <Shortcut label="Ctrl / Cmd + C / V" value={t("canvas.shortcut.copyPasteNodes")} />
                    <Shortcut label="Delete / Backspace" value={t("canvas.shortcut.delete")} />
                </div>
            </Modal>
        </div>
    );
}

function ToolbarButton({
    id,
    label,
    active,
    hovered,
    activeStyle,
    hoverStyle,
    wrapRef,
    onTipX,
    onHover,
    onClick,
    disabled = false,
    danger = false,
    children,
}: {
    id: string;
    label: string;
    active?: boolean;
    hovered: string | null;
    activeStyle?: CSSProperties;
    hoverStyle: CSSProperties;
    wrapRef: RefObject<HTMLDivElement | null>;
    onTipX: (x: number) => void;
    onHover: (id: string | null) => void;
    onClick?: (event: ReactMouseEvent<HTMLElement>) => void;
    disabled?: boolean;
    danger?: boolean;
    children: ReactNode;
}) {
    const theme = useCanvasTheme();

    return (
        <Button
            type="text"
            aria-label={label}
            className="!h-8 !w-8 !min-w-8 !p-0 transition"
            disabled={disabled}
            style={active ? activeStyle : hovered === id && !disabled ? hoverStyle : { color: danger ? theme.node.danger : theme.toolbar.item, opacity: disabled ? 0.35 : 1 }}
            icon={children}
            onMouseEnter={(event) => {
                onHover(id);
                onTipX(getTipX(wrapRef.current, event.currentTarget));
            }}
            onMouseLeave={() => onHover(null)}
            onClick={onClick}
        />
    );
}

function Divider({ theme }: { theme: CanvasTheme }) {
    return <div className="mx-1 h-6 w-px" style={{ background: theme.toolbar.border }} />;
}

function PanelAction({ icon, label, active, onClick, theme }: { icon: ReactNode; label: string; active?: boolean; onClick: () => void; theme: CanvasTheme }) {
    return (
        <button
            type="button"
            className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-sm transition"
            style={active ? { background: theme.toolbar.activeBg, color: theme.toolbar.activeText } : { color: theme.toolbar.item }}
            onMouseEnter={(event) => {
                if (!active) event.currentTarget.style.background = theme.toolbar.itemHover;
            }}
            onMouseLeave={(event) => {
                if (!active) event.currentTarget.style.background = "transparent";
            }}
            onClick={onClick}
        >
            {icon}
            <span className="min-w-0 flex-1 truncate">{label}</span>
        </button>
    );
}

function DockTip({ label, x, theme }: { label: string; x: number; theme: CanvasTheme }) {
    return (
        <span className="absolute bottom-[calc(100%+8px)] -translate-x-1/2 rounded-md px-2 py-1 text-xs" style={{ left: x, background: theme.node.text, color: theme.node.panel }}>
            {label}
        </span>
    );
}

function Shortcut({ label, value }: { label: ReactNode; value: string }) {
    const theme = useCanvasTheme();
    return (
        <div className="flex items-center justify-between gap-4">
            <span className="text-base font-medium">{label}</span>
            <span style={{ color: theme.node.muted }}>{value}</span>
        </div>
    );
}

function toolLabel(id: string, t: (key: string) => string) {
    if (id === "tool-export") return t("canvas.exportCanvas");
    if (id === "tool-select") return t("canvas.toolbar.select");
    if (id === "tool-pan") return t("canvas.toolbar.pan");
    if (id === "tool-undo") return t("canvas.undo");
    if (id === "tool-redo") return t("canvas.redo");
    if (id === "tool-prompt-group") return t("canvas.toolbar.promptGroup");
    if (id === "tool-generator-group") return t("canvas.toolbar.generatorGroup");
    if (id === "tool-modifiers-group") return t("canvas.toolbar.modifiersGroup");
    if (id === "tool-audio-project") return t("canvas.nodeTypes.audioProject");
    if (id === "tool-smart-canvas") return t("canvas.nodeTypes.smartCanvas");
    if (id === "tool-input-group") return t("canvas.toolbar.inputOutputGroup");
    if (id === "tool-extensions") return t("canvas.toolbar.extensions");
    if (id === "tool-zoom") return t("canvas.toolbar.zoom");
    if (id === "tool-node-list") return t("canvas.nodeList.title");
    if (id === "tool-delete") return t("canvas.deleteSelected");
    return "";
}

function getTipX(wrap: HTMLDivElement | null, target: HTMLElement) {
    if (!wrap) return 0;
    const wrapBox = wrap.parentElement?.getBoundingClientRect() || wrap.getBoundingClientRect();
    const box = target.getBoundingClientRect();
    return box.left - wrapBox.left + box.width / 2;
}
