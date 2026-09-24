import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type PointerEvent as ReactPointerEvent, type SetStateAction } from "react";
import { Segmented, Select, Slider, Switch } from "antd";
import { ArrowLeft, Blend, Brush, CircleDashed, Contrast, Eraser, Grid3x3, Hand, History, ImagePlus, Lasso, LassoSelect, Layers, Layers2, Magnet, Maximize, Move, MousePointer2, PaintBucket, Palette, PenTool, Pipette, Rows3, Settings2, Sparkles, SquareDashed, Wand2, WandSparkles, ZoomIn, ZoomOut } from "lucide-react";
import { nanoid } from "nanoid";
import { useTranslation } from "react-i18next";

import { ImageSettingsTheme } from "@/components/image-settings-panel";
import { type DockPanelDef } from "@/components/canvas/dock/dock-layout";
import { DockArea, useDockLayout } from "@/components/canvas/dock/dock-panel";
import { DockWindowMenu } from "@/components/canvas/dock/dock-window-menu";
import { BoardLayersView, layerBlendStyle, psLayerFrame } from "@/components/canvas/smart-canvas-node";
import { SmartCanvasSettingsPopover } from "@/components/canvas/smart-canvas-settings-popover";
import { PsActionsPanel, usePsActionRecorder, type PsLayerCommand, type PsMenuCommand } from "@/components/canvas/workspace/ps-actions-panel";
import PsAdjustmentsPanel from "@/components/canvas/workspace/ps-adjustments-panel";
import { PsBrushesPanel, PsColorPanelBody, PsGradientsPanel, PsPatternsPanel } from "@/components/canvas/workspace/ps-asset-panels";
import { PsChannelPreview, PsChannelsPanel, type PsChannelView } from "@/components/canvas/workspace/ps-channels-panel";
import PsColorPicker from "@/components/canvas/workspace/ps-color-picker";
import PsFilterDialog from "@/components/canvas/workspace/ps-filter-dialog";
import { PsHistoryPanel, usePsHistory } from "@/components/canvas/workspace/ps-history-panel";
import PsLayersPanel from "@/components/canvas/workspace/ps-layers-panel";
import { PsMenus, type PsViewFlags } from "@/components/canvas/workspace/ps-menus";
import { PsDraftOverlay, PsGrid, PsGuides, PsMarchingAnts, PsPathOverlay, PsRulers, PsSnapLines, PsTransformHandles, type PsDraft, type PsGuideAxis, type PsGuides as PsGuidesState, type PsSnapLines as PsSnapLinesState } from "@/components/canvas/workspace/ps-overlays";
import { PsPathsPanel } from "@/components/canvas/workspace/ps-paths-panel";
import PsPropertiesPanel from "@/components/canvas/workspace/ps-properties-panel";
import PsTextPanel from "@/components/canvas/workspace/ps-text-panel";
import { psFilterLayerBitmap, type PsFilterParams, type PsFilterType } from "@/components/canvas/workspace/ps-filters";
import { addPsLayer, addPsLayerAbove, commitBoardLayers, duplicatePsLayer, findPsLayer, groupPsLayers, movePsLayerStep, patchPsLayer, psLayerCentre, rasterizePsLayer, removePsLayer, resizePsLayer, rotatePsLayer, translatePsLayer, ungroupPsLayer, type PsResizeCorner } from "@/components/canvas/workspace/ps-layer-ops";
import { psBucketFill, psBucketPattern, psCanvasToBlob, psPatternFillLayer, psBeginStroke, psBitmapSize, psColorLuminance, psCommitStroke, psDocToLayer, psDrawStroke, psGradientFill, psLoadBoardPixels, psLoadBoardSampler, psLoadLayerPixels, psSampleBoardPixel, psStrokeTo, type PsBoardSampler, type PsBrushOptions, type PsGradientStop, type PsPaintPoint, type PsStroke } from "@/components/canvas/workspace/ps-paint";
import { psAnchorOffset, psOffsetLayers, psResampleLayerBitmaps, psRotateLayers, psScaleLayers, psTrimBox, type PsCanvasAnchor } from "@/components/canvas/workspace/ps-image-ops";
import { psPaintPath, psPathPaintSource, psPathToSelection } from "@/components/canvas/workspace/ps-path-ops";
import { STUDIO_BAR_CLASS, STUDIO_DIVIDER_CLASS, STUDIO_ICON_BUTTON_CLASS, STUDIO_LABEL_CLASS, STUDIO_LIST_ROW_CLASS, STUDIO_OPTIONS_CLASS, STUDIO_TOOL_BUTTON_CLASS } from "@/components/canvas/workspace/studio-chrome";
import { psImageColorAt, psSelectionAll, psSelectionBlob, psSelectionBounds, psSelectionClear, psSelectionCombine, psSelectionCreate, psSelectionFeather, psSelectionInvert, psSelectionPolygon, psSelectionQuick, psSelectionRect, psSelectionToLayerSpace, psSelectionWand, type PsSelectionMode } from "@/components/canvas/workspace/ps-selection";
import { useCanvasTheme } from "@/hooks/use-canvas-theme";
import { CANVAS_BLEND_MODES } from "@/lib/canvas/blend-modes";
import { createPsPath, psPathAnchor } from "@/lib/canvas/ps-path";
import { PS_TRANSFORM_MODES, psApplyNumericTransform, psClearTransform, psMoveTransformHandle, psTransformHandlesDoc, type PsNumericTransform, type PsTransformMode } from "@/lib/canvas/ps-transform";
import { createPsAdjustmentLayer, createPsPixelLayer, createPsShapeLayer, psBoxUnion, psLayerBox, psTextRenderStyle, psTopLayers, renderPsLayerBitmap, smartCanvasBackground, smartCanvasBackgroundOpacity, smartCanvasFill, smartCanvasLayers, smartCanvasRatio, smartCanvasResolution, smartCanvasSizeForRatio } from "@/lib/canvas/smart-canvas";
import { PS_ADJUSTMENT_NAME_KEYS } from "@/lib/canvas/ps-adjustments";
import { inferMediaRatio } from "@/lib/media-size";
import { PS_BRUSH_DEFAULT, type PsActionStep, type PsBrushPreset, type PsPatternPreset } from "@/stores/use-ps-asset-store";
import { resolveImageUrl, uploadImage } from "@/services/image-storage";
import { CanvasNodeType, type CanvasNodeData, type CanvasNodeMetadata, type CanvasPsAdjustmentType, type CanvasPsLayer, type CanvasPsPath, type CanvasPsShapeKind } from "@/types/canvas";

type ImageStudioProps = {
    board: CanvasNodeData | null;
    boards: CanvasNodeData[];
    nodes: CanvasNodeData[];
    setNodes: Dispatch<SetStateAction<CanvasNodeData[]>>;
    onSelectBoard: (boardId: string) => void;
    onBoardChange: (boardId: string, patch: Partial<CanvasNodeMetadata>) => void;
    onOutput: (board: CanvasNodeData) => void;
    onBack: () => void;
};

type PsTool = "move" | "hand" | "brush" | "eraser" | "bucket" | "eyedropper" | "marquee" | "ellipse-marquee" | "lasso" | "polygon-lasso" | "wand" | "quick-select" | "gradient" | "shape" | "pen" | "direct-select";
type PsView = { x: number; y: number; k: number };
type PsGestureMode = "move" | "resize" | "rotate";
type PsGesture = {
    pointerId: number;
    mode: PsGestureMode;
    layerId: string;
    startLayers: CanvasPsLayer[];
    startClient: { x: number; y: number };
    startAngle: number;
    centre: { x: number; y: number };
    corner: PsResizeCorner;
    box: DOMRect;
    view: PsView;
};
type PsPaintGesture = { pointerId: number; layer: CanvasPsLayer; created: boolean; stroke: PsStroke; brush: PsBrushOptions; erase: boolean; maskTarget: boolean };
type PsSelectGesture =
    | { pointerId: number; tool: "marquee" | "ellipse-marquee"; start: PsPaintPoint; current: PsPaintPoint; mode: PsSelectionMode }
    | { pointerId: number; tool: "lasso"; points: PsPaintPoint[]; mode: PsSelectionMode };
type PsQuickGesture = { pointerId: number; target: HTMLCanvasElement; image: ImageData | null; sample: number[] | null; radius: number; erase: boolean };
type PsGradientGesture = { pointerId: number; from: PsPaintPoint; to: PsPaintPoint };
type PsShapeGesture = { pointerId: number; layer: CanvasPsLayer; start: PsPaintPoint };
type PsGuideGesture = { pointerId: number; axis: PsGuideAxis; index: number };
type PsPathGesture = { pointerId: number; index: number; kind: "anchor" | "in" | "out" };
type PsTransformGesture = { pointerId: number; handle: number; startLayers: CanvasPsLayer[] };
type PsSnapAxis = { diff: number; line: number } | null;

const FLAT_ACTION_CLASS = STUDIO_ICON_BUTTON_CLASS;
const TOOL_CLASS = STUDIO_TOOL_BUTTON_CLASS;
const LIST_ACTION_CLASS = STUDIO_LIST_ROW_CLASS;
const HANDLE_SCREEN_SIZE = 8;
const ROTATE_SCREEN_OFFSET = 26;
const SNAP_SCREEN_DISTANCE = 6;
const POLY_CLOSE_SCREEN_RADIUS = 10;
const ZOOM_MIN = 0.05;
const ZOOM_MAX = 8;
const ZOOM_STEP = 1.2;
const CORNERS: PsResizeCorner[] = ["nw", "ne", "sw", "se"];
const EMPTY_GUIDES: PsGuidesState = { x: [], y: [] };
const EMPTY_SNAP_LINES: PsSnapLinesState = { x: [], y: [] };
const SHAPE_NAME_KEYS: Record<CanvasPsShapeKind, string> = { rectangle: "canvas.ps.shapeRectangle", "rounded-rectangle": "canvas.ps.shapeRounded", ellipse: "canvas.ps.shapeEllipse", polygon: "canvas.ps.shapePolygon", line: "canvas.ps.shapeLine" };
const TOOLS: { id: PsTool; icon: typeof Move; labelKey: string; hotkey: string }[] = [
    { id: "move", icon: Move, labelKey: "canvas.ps.toolMove", hotkey: "V" },
    { id: "hand", icon: Hand, labelKey: "canvas.ps.toolHand", hotkey: "H" },
    { id: "pen", icon: PenTool, labelKey: "canvas.ps.toolPen", hotkey: "P" },
    { id: "direct-select", icon: MousePointer2, labelKey: "canvas.ps.toolDirectSelect", hotkey: "Shift+P" },
    { id: "marquee", icon: SquareDashed, labelKey: "canvas.ps.toolMarquee", hotkey: "M" },
    { id: "ellipse-marquee", icon: CircleDashed, labelKey: "canvas.ps.toolEllipseMarquee", hotkey: "Shift+M" },
    { id: "lasso", icon: Lasso, labelKey: "canvas.ps.toolLasso", hotkey: "L" },
    { id: "polygon-lasso", icon: LassoSelect, labelKey: "canvas.ps.toolPolygonLasso", hotkey: "Shift+L" },
    { id: "wand", icon: Wand2, labelKey: "canvas.ps.toolWand", hotkey: "W" },
    { id: "quick-select", icon: Sparkles, labelKey: "canvas.ps.toolQuickSelect", hotkey: "A" },
    { id: "brush", icon: Brush, labelKey: "canvas.ps.toolBrush", hotkey: "B" },
    { id: "eraser", icon: Eraser, labelKey: "canvas.ps.toolEraser", hotkey: "E" },
    { id: "bucket", icon: PaintBucket, labelKey: "canvas.ps.toolBucket", hotkey: "G" },
    { id: "gradient", icon: WandSparkles, labelKey: "canvas.ps.toolGradient", hotkey: "Shift+G" },
    { id: "shape", icon: SquareDashed, labelKey: "canvas.ps.toolShape", hotkey: "U" },
    { id: "eyedropper", icon: Pipette, labelKey: "canvas.ps.toolEyedropper", hotkey: "I" },
];
const SELECTION_TOOLS: PsTool[] = ["marquee", "ellipse-marquee", "lasso", "polygon-lasso", "wand", "quick-select"];
const PAINT_TOOLS: PsTool[] = ["brush", "eraser", "bucket", "eyedropper"];
const RING_TOOLS: PsTool[] = ["brush", "eraser", "quick-select"];
const COLOR_TOOLS: PsTool[] = ["brush", "bucket", "eyedropper"];
const BRUSH_SIZE_MIN = 1;
const BRUSH_SIZE_MAX = 400;
const TOOL_LABELS = Object.fromEntries(TOOLS.map((item) => [item.id, item.labelKey])) as Record<PsTool, string>;
const TOOL_HOTKEYS: Record<string, PsTool> = { v: "move", h: "hand", p: "pen", m: "marquee", l: "lasso", w: "wand", a: "quick-select", b: "brush", e: "eraser", g: "bucket", u: "shape", i: "eyedropper" };
const PS_DOCK_PANELS: DockPanelDef[] = [
    { id: "layers", labelKey: "canvas.ps.layers", icon: Layers, dock: "right" },
    { id: "channels", labelKey: "canvas.ps.channels", icon: Layers2, dock: "right" },
    { id: "paths", labelKey: "canvas.ps.paths", icon: PenTool, dock: "right" },
    { id: "history", labelKey: "canvas.ps.history", icon: History, dock: "right" },
    { id: "actions", labelKey: "canvas.ps.actions", icon: Rows3, dock: "right" },
    { id: "properties", labelKey: "canvas.ps.properties", icon: Settings2, dock: "left" },
    { id: "adjustments", labelKey: "canvas.ps.adjustments", icon: Contrast, dock: "left" },
    { id: "color", labelKey: "canvas.ps.color", icon: Palette, dock: "bottom" },
    { id: "gradients", labelKey: "canvas.ps.gradients", icon: Blend, dock: "bottom" },
    { id: "patterns", labelKey: "canvas.ps.patterns", icon: Grid3x3, dock: "bottom" },
    { id: "brushes", labelKey: "canvas.ps.brushes", icon: Brush, dock: "bottom" },
];
const PATH_HIT_SCREEN_RADIUS = 8;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const angleAt = (point: { x: number; y: number }, centre: { x: number; y: number }) => (Math.atan2(point.y - centre.y, point.x - centre.x) * 180) / Math.PI;
const boxBetween = (a: PsPaintPoint, b: PsPaintPoint) => ({ x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), width: Math.abs(b.x - a.x), height: Math.abs(b.y - a.y) });
const pointsPath = (points: PsPaintPoint[], cursor?: PsPaintPoint) => {
    const all = cursor ? [...points, cursor] : points;
    return all.length ? `M ${all.map((point) => `${point.x} ${point.y}`).join(" L ")}` : "";
};
const selectionMode = (event: { shiftKey: boolean; altKey: boolean }): PsSelectionMode => (event.shiftKey ? "add" : event.altKey ? "subtract" : "replace");
const layerFrame = (layers: CanvasPsLayer[], layer: CanvasPsLayer) => {
    if (layer.kind !== "group") return psLayerFrame(layer);
    const box = psLayerBox(layers, layer);
    return { left: box.x, top: box.y, width: box.width, height: box.height };
};

export default function ImageStudio({ board, boards, nodes, setNodes, onSelectBoard, onBoardChange, onOutput, onBack }: ImageStudioProps) {
    const { t } = useTranslation();
    const theme = useCanvasTheme();
    const containerRef = useRef<HTMLDivElement>(null);
    const gestureRef = useRef<PsGesture | null>(null);
    const panRef = useRef<{ pointerId: number; startClient: { x: number; y: number }; startView: PsView } | null>(null);
    const paintRef = useRef<PsPaintGesture | null>(null);
    const pickRef = useRef<{ pointerId: number; sampler: PsBoardSampler | null } | null>(null);
    const selectRef = useRef<PsSelectGesture | null>(null);
    const quickRef = useRef<PsQuickGesture | null>(null);
    const quickPaintRef = useRef(0);
    const polyRef = useRef<PsPaintPoint[]>([]);
    const polyModeRef = useRef<PsSelectionMode>("replace");
    const gradientRef = useRef<PsGradientGesture | null>(null);
    const shapeRef = useRef<PsShapeGesture | null>(null);
    const guideRef = useRef<PsGuideGesture | null>(null);
    const pathRef = useRef<PsPathGesture | null>(null);
    const penDraftRef = useRef<CanvasPsPath | null>(null);
    const transformRef = useRef<PsTransformGesture | null>(null);
    const strokeCanvasRef = useRef<HTMLCanvasElement>(null);
    const cursorRef = useRef<HTMLDivElement>(null);
    const draftRef = useRef<CanvasPsLayer[] | null>(null);
    const fittedRef = useRef("");
    const userViewRef = useRef(false);
    const [selectedLayerId, setSelectedLayerId] = useState("");
    const [tool, setTool] = useState<PsTool>("move");
    const [paint, setPaint] = useState<PsBrushOptions & { background: string; stop: number }>({ ...PS_BRUSH_DEFAULT, tolerance: 32, color: "#000000", background: "#ffffff", stop: 1 });
    const [selectOptions, setSelectOptions] = useState({ feather: 0, antiAlias: true, contiguous: true, sampleAll: true });
    const [gradient, setGradient] = useState({ type: "linear" as "linear" | "radial", mode: "normal", opacity: 1, reverse: false });
    const [gradientStopsOption, setGradientStopsOption] = useState<{ color: string; position: number }[] | null>(null);
    const [pattern, setPattern] = useState<PsPatternPreset | null>(null);
    const [brushId, setBrushId] = useState("");
    const [brushName, setBrushName] = useState("");
    const [shapeOptions, setShapeOptions] = useState({ type: "rectangle" as CanvasPsShapeKind, fill: "#000000", stroke: "#000000", strokeWidth: 0 });
    const [strokeLayer, setStrokeLayer] = useState<CanvasPsLayer | null>(null);
    const [cursorInside, setCursorInside] = useState(false);
    const [spaceHeld, setSpaceHeld] = useState(false);
    const [view, setView] = useState<PsView>({ x: 0, y: 0, k: 1 });
    const [size, setSize] = useState({ w: 0, h: 0 });
    const [draftLayers, setDraftLayers] = useState<CanvasPsLayer[] | null>(null);
    const [editingTextId, setEditingTextId] = useState("");
    const [textDraft, setTextDraft] = useState("");
    const [selection, setSelection] = useState<HTMLCanvasElement | null>(null);
    const [selectionVersion, setSelectionVersion] = useState(0);
    const [gestureActive, setGestureActive] = useState(false);
    const [draft, setDraft] = useState<PsDraft>(null);
    const [maskTargetId, setMaskTargetId] = useState("");
    const [maskView, setMaskView] = useState(false);
    const [filterType, setFilterType] = useState<PsFilterType | "">("");
    const [lastFilter, setLastFilter] = useState<{ type: PsFilterType; params: PsFilterParams } | null>(null);
    const [viewFlags, setViewFlags] = useState<PsViewFlags>({ rulers: false, grid: false, guides: true, snap: true });
    const [guidesByBoard, setGuidesByBoard] = useState<Record<string, PsGuidesState>>({});
    const [guideDraft, setGuideDraft] = useState<{ axis: PsGuideAxis; value: number } | null>(null);
    const [snapLines, setSnapLines] = useState<PsSnapLinesState>(EMPTY_SNAP_LINES);
    const dock = useDockLayout("ps-image", PS_DOCK_PANELS);
    const [channelView, setChannelView] = useState<PsChannelView>("rgb");
    const [activePathId, setActivePathId] = useState("");
    const [penDraft, setPenDraft] = useState<CanvasPsPath | null>(null);
    const [transformMode, setTransformMode] = useState<PsTransformMode | null>(null);
    const [lastTransform, setLastTransform] = useState<PsNumericTransform | null>(null);

    const boardLayers = useMemo(() => (board ? smartCanvasLayers(board) : []), [board]);
    const layers = draftLayers ?? boardLayers;
    const paths = useMemo(() => board?.metadata?.boardPaths ?? [], [board]);
    const activePath = paths.find((path) => path.id === activePathId);
    const history = usePsHistory(board, boardLayers, setNodes);
    const recorder = usePsActionRecorder((step) => runActionStep(step));
    const commit = useCallback(
        (next: CanvasPsLayer[], name?: string) => {
            if (!board) return;
            if (name) history.label(name);
            commitBoardLayers(setNodes, board.id, next);
        },
        [board, history, setNodes],
    );
    const selected = findPsLayer(layers, selectedLayerId);
    const maskLayer = maskTargetId && maskTargetId === selected?.id && selected?.maskStorageKey ? selected : undefined;
    const paintTarget = maskLayer ?? (selected?.kind === "pixel" ? selected : undefined);
    const targetKey = maskLayer ? maskLayer.maskStorageKey : paintTarget?.storageKey;
    const painting = PAINT_TOOLS.includes(tool);
    const selecting = SELECTION_TOOLS.includes(tool);
    const interacting = painting || selecting || tool === "gradient" || tool === "shape";
    const ringTool = RING_TOOLS.includes(tool);
    const brushOptions = maskLayer ? { ...paint, color: "#ffffff" } : paint;
    const imageNodes = useMemo(() => nodes.filter((node) => node.type === CanvasNodeType.Image && Boolean(node.metadata?.content || node.metadata?.storageKey)), [nodes]);
    const visited = useMemo(() => new Set(board ? [board.id] : []), [board]);
    const maskViewLayer = maskView && selected?.maskStorageKey && selected.kind !== "group" ? selected : undefined;
    const viewBoard = useMemo(() => {
        if (!board) return board;
        let rendered = draftLayers;
        if (strokeLayer) {
            const base = draftLayers ?? boardLayers;
            rendered = base.map((layer) => (layer.id === strokeLayer.id ? { ...layer, storageKey: undefined } : layer));
        }
        if (maskViewLayer) {
            const base = rendered ?? boardLayers;
            rendered = base.map((layer) => (layer.id === maskViewLayer.id ? { ...layer, kind: "pixel", storageKey: layer.maskStorageKey, maskStorageKey: undefined, sourceNodeId: undefined } : layer));
        }
        return rendered ? { ...board, metadata: { ...board.metadata, boardLayers: rendered } } : board;
    }, [board, boardLayers, draftLayers, strokeLayer, maskViewLayer]);
    const backgroundFill = board ? smartCanvasFill(smartCanvasBackground(board) === "transparent" ? theme.toolbar.panel : smartCanvasBackground(board), smartCanvasBackgroundOpacity(board)) : "transparent";
    const handMode = tool === "hand" || spaceHeld;
    const guides = guidesByBoard[board?.id || ""] ?? EMPTY_GUIDES;

    useEffect(() => {
        if (!board && boards.length) onSelectBoard(boards[0].id);
    }, [board, boards, onSelectBoard]);

    useEffect(() => {
        if (!board) return;
        const layers = smartCanvasLayers(board);
        const visible = psTopLayers(layers).filter((layer) => !layer.hidden);
        if (!visible.length) return;
        const content = psBoxUnion(visible.map((layer) => psLayerBox(layers, layer)));
        if (!content) return;
        if (content.x + content.width <= board.width + 0.5 && content.y + content.height <= board.height + 0.5) return;
        const size = smartCanvasSizeForRatio(smartCanvasRatio(board));
        if (size.width + 0.5 < content.x + content.width || size.height + 0.5 < content.y + content.height) return;
        setNodes((prev) => prev.map((node) => (node.id === board.id ? { ...node, ...size, position: { x: node.position.x + node.width / 2 - size.width / 2, y: node.position.y + node.height / 2 - size.height / 2 } } : node)));
    }, [board, setNodes]);

    useEffect(() => {
        const element = containerRef.current;
        if (!element) return;
        const observer = new ResizeObserver((entries) => {
            const rect = entries[0]?.contentRect;
            if (rect) setSize({ w: rect.width, h: rect.height });
        });
        observer.observe(element);
        return () => observer.disconnect();
    }, [board?.id]);

    const applyDraft = useCallback((next: CanvasPsLayer[] | null) => {
        draftRef.current = next;
        setDraftLayers(next);
    }, []);

    const resetSelection = useCallback(() => {
        setSelection(null);
        setSelectionVersion((version) => version + 1);
        polyRef.current = [];
        setDraft(null);
    }, []);

    useEffect(() => {
        setSelectedLayerId("");
        setEditingTextId("");
        setMaskTargetId("");
        setMaskView(false);
        setFilterType("");
        applyDraft(null);
        resetSelection();
    }, [board?.id, applyDraft, resetSelection]);

    useEffect(() => {
        if (filterType && (!selected || selected.kind === "adjustment")) setFilterType("");
    }, [filterType, selected]);

    useEffect(() => {
        if (!layers.length || findPsLayer(layers, selectedLayerId)) return;
        const top = psTopLayers(layers).at(-1);
        setSelectedLayerId(top ? top.id : "");
    }, [layers, selectedLayerId]);

    const fit = useCallback(() => {
        if (!board || !size.w || !size.h) return;
        const k = clamp(Math.min(size.w / board.width, size.h / board.height) * 0.9, ZOOM_MIN, ZOOM_MAX);
        setView({ k, x: (size.w - board.width * k) / 2, y: (size.h - board.height * k) / 2 });
    }, [board, size.w, size.h]);

    useEffect(() => {
        if (!board || !size.w || !size.h) return;
        const key = `${board.id}:${board.width}x${board.height}`;
        if (fittedRef.current !== key) {
            fittedRef.current = key;
            userViewRef.current = false;
        } else if (userViewRef.current) {
            return;
        }
        fit();
    }, [board, size.w, size.h, fit]);

    const zoomAt = useCallback((cx: number, cy: number, factor: number) => {
        userViewRef.current = true;
        setView((prev) => {
            const k = clamp(prev.k * factor, ZOOM_MIN, ZOOM_MAX);
            const ratio = k / prev.k;
            return { k, x: cx - (cx - prev.x) * ratio, y: cy - (cy - prev.y) * ratio };
        });
    }, []);

    const zoomBy = (factor: number) => zoomAt(size.w / 2, size.h / 2, factor);

    useEffect(() => {
        const element = containerRef.current;
        if (!element) return;
        const onWheel = (event: WheelEvent) => {
            event.preventDefault();
            const rect = element.getBoundingClientRect();
            zoomAt(event.clientX - rect.left, event.clientY - rect.top, event.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP);
        };
        element.addEventListener("wheel", onWheel, { passive: false });
        return () => element.removeEventListener("wheel", onWheel);
    }, [zoomAt, board?.id]);

    const ensureSelection = useCallback(() => {
        if (!board) return null;
        return selection ?? psSelectionCreate(board.width, board.height)?.canvas ?? null;
    }, [board, selection]);

    const commitSelection = useCallback((next: HTMLCanvasElement) => {
        setSelection(next);
        setSelectionVersion((version) => version + 1);
    }, []);

    const selectAll = useCallback(() => {
        const target = ensureSelection();
        if (!target) return;
        psSelectionAll({ canvas: target });
        commitSelection(target);
    }, [commitSelection, ensureSelection]);

    const deselect = useCallback(() => {
        if (!selection) return;
        psSelectionClear({ canvas: selection });
        commitSelection(selection);
    }, [commitSelection, selection]);

    const invertSelection = useCallback(() => {
        const target = ensureSelection();
        if (!target) return;
        psSelectionInvert({ canvas: target });
        commitSelection(target);
    }, [commitSelection, ensureSelection]);

    const featherSelection = useCallback(() => {
        if (!selection || selectOptions.feather <= 0) return;
        psSelectionFeather({ canvas: selection }, selectOptions.feather);
        commitSelection(selection);
    }, [commitSelection, selectOptions.feather, selection]);

    const actionsRef = useRef<{ selectAll: () => void; deselect: () => void; invertSelection: () => void; featherSelection: () => void; finishPolygon: (points: PsPaintPoint[]) => void; transform: (mode: PsTransformMode) => void; repeatTransform: () => void; exitTransform: () => void; transformMode: () => PsTransformMode | null }>({ selectAll, deselect, invertSelection, featherSelection, finishPolygon: () => undefined, transform: () => undefined, repeatTransform: () => undefined, exitTransform: () => undefined, transformMode: () => null });
    useEffect(() => {
        actionsRef.current = { selectAll, deselect, invertSelection, featherSelection, finishPolygon: (points) => finishPolygon(points), transform: enterTransform, repeatTransform, exitTransform: () => setTransformMode(null), transformMode: () => transformMode };
    });

    useEffect(() => {
        const isTyping = (target: EventTarget | null) => target instanceof HTMLElement && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
        const onKeyDown = (event: KeyboardEvent) => {
            if (isTyping(event.target)) return;
            if (event.code === "Space") {
                event.preventDefault();
                setSpaceHeld(true);
            }
            if ((event.ctrlKey || event.metaKey) && !event.altKey) {
                if (event.key.toLowerCase() === "a") {
                    event.preventDefault();
                    menuRun("selectAll");
                    return;
                }
                if (!event.shiftKey && event.key.toLowerCase() === "d") {
                    event.preventDefault();
                    menuRun("deselect");
                    return;
                }
                if (event.shiftKey && event.key.toLowerCase() === "i") {
                    event.preventDefault();
                    menuRun("inverse");
                    return;
                }
                if (!event.shiftKey && event.key.toLowerCase() === "t") {
                    event.preventDefault();
                    actionsRef.current.transform("free");
                    return;
                }
                if (event.shiftKey && event.key.toLowerCase() === "t") {
                    event.preventDefault();
                    actionsRef.current.repeatTransform();
                    return;
                }
            }
            if (event.key === "Escape") {
                if (actionsRef.current.transformMode()) {
                    event.preventDefault();
                    actionsRef.current.exitTransform();
                    return;
                }
                if (polyRef.current.length) {
                    polyRef.current = [];
                    setDraft(null);
                    return;
                }
                setActivePathId("");
                setDraftPath(null);
            }
            if (event.key === "Enter" && polyRef.current.length > 2) {
                event.preventDefault();
                actionsRef.current.finishPolygon(polyRef.current);
                return;
            }
            if (event.shiftKey && event.key.toLowerCase() === "p") {
                setTool("direct-select");
                return;
            }
            if (event.shiftKey && event.key.toLowerCase() === "m") {
                setTool("ellipse-marquee");
                return;
            }
            if (event.shiftKey && event.key.toLowerCase() === "l") {
                setTool("polygon-lasso");
                return;
            }
            if (event.shiftKey && event.key.toLowerCase() === "g") {
                setTool("gradient");
                return;
            }
            const nextTool = TOOL_HOTKEYS[event.key.toLowerCase()];
            if (nextTool) setTool(nextTool);
            if (event.code === "BracketLeft" || event.code === "BracketRight") {
                event.preventDefault();
                setPaint((prev) => {
                    const step = prev.size < 10 ? 1 : prev.size < 100 ? 5 : 10;
                    return { ...prev, size: clamp(prev.size + (event.code === "BracketRight" ? step : -step), BRUSH_SIZE_MIN, BRUSH_SIZE_MAX) };
                });
            }
        };
        const onKeyUp = (event: KeyboardEvent) => {
            if (event.code === "Space") setSpaceHeld(false);
        };
        window.addEventListener("keydown", onKeyDown);
        window.addEventListener("keyup", onKeyUp);
        return () => {
            window.removeEventListener("keydown", onKeyDown);
            window.removeEventListener("keyup", onKeyUp);
        };
    }, []);

    const beginPan = (event: ReactPointerEvent<HTMLDivElement>) => {
        if (event.button !== 0) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        panRef.current = { pointerId: event.pointerId, startClient: { x: event.clientX, y: event.clientY }, startView: view };
    };

    const movePan = (event: ReactPointerEvent<HTMLDivElement>) => {
        const pan = panRef.current;
        if (!pan || pan.pointerId !== event.pointerId) return;
        userViewRef.current = true;
        setView((prev) => ({ ...prev, x: pan.startView.x + (event.clientX - pan.startClient.x), y: pan.startView.y + (event.clientY - pan.startClient.y) }));
    };

    const endPan = (event: ReactPointerEvent<HTMLDivElement>) => {
        const pan = panRef.current;
        if (!pan || pan.pointerId !== event.pointerId) return;
        panRef.current = null;
    };

    const snapTargets = useCallback(
        (axis: "x" | "y", movingId: string) => {
            if (!board) return [];
            const values = axis === "x" ? [0, board.width / 2, board.width, ...guides.x] : [0, board.height / 2, board.height, ...guides.y];
            layers.forEach((layer) => {
                if (layer.hidden || layer.id === movingId || layer.kind === "adjustment") return;
                const box = psLayerBox(layers, layer);
                values.push(axis === "x" ? box.x : box.y, axis === "x" ? box.x + box.width / 2 : box.y + box.height / 2, axis === "x" ? box.x + box.width : box.y + box.height);
            });
            return values;
        },
        [board, guides.x, guides.y, layers],
    );

    const snapAxis = (values: number[], targets: number[], threshold: number): PsSnapAxis => {
        let best: PsSnapAxis = null;
        targets.forEach((target) => {
            values.forEach((value) => {
                const diff = target - value;
                if (Math.abs(diff) <= threshold && (!best || Math.abs(diff) < Math.abs(best.diff))) best = { diff, line: target };
            });
        });
        return best;
    };

    const beginLayerGesture = (event: ReactPointerEvent<HTMLDivElement>, layer: CanvasPsLayer, mode: PsGestureMode, corner: PsResizeCorner = "se") => {
        if (!board || layer.locked || layer.kind === "adjustment") return;
        const element = containerRef.current;
        if (!element) return;
        event.stopPropagation();
        event.currentTarget.setPointerCapture(event.pointerId);
        const centre = psLayerCentre(boardLayers, layer);
        const box = element.getBoundingClientRect();
        const startDoc = { x: (event.clientX - box.left - view.x) / view.k, y: (event.clientY - box.top - view.y) / view.k };
        gestureRef.current = { pointerId: event.pointerId, mode, layerId: layer.id, startLayers: boardLayers, startClient: { x: event.clientX, y: event.clientY }, startAngle: angleAt(startDoc, centre), centre, corner, box, view };
    };

    const moveLayerGesture = (event: ReactPointerEvent<HTMLDivElement>) => {
        const gesture = gestureRef.current;
        if (!gesture || gesture.pointerId !== event.pointerId) return;
        if (gesture.mode === "move") {
            const dx = (event.clientX - gesture.startClient.x) / gesture.view.k;
            const dy = (event.clientY - gesture.startClient.y) / gesture.view.k;
            if (!dx && !dy) return;
            let next = translatePsLayer(gesture.startLayers, gesture.layerId, dx, dy);
            if (viewFlags.snap) {
                const moved = findPsLayer(next, gesture.layerId);
                if (moved) {
                    const box = psLayerBox(next, moved);
                    const threshold = SNAP_SCREEN_DISTANCE / gesture.view.k;
                    const snapX = snapAxis([box.x, box.x + box.width / 2, box.x + box.width], snapTargets("x", gesture.layerId), threshold);
                    const snapY = snapAxis([box.y, box.y + box.height / 2, box.y + box.height], snapTargets("y", gesture.layerId), threshold);
                    if (snapX || snapY) next = translatePsLayer(next, gesture.layerId, snapX?.diff ?? 0, snapY?.diff ?? 0);
                    setSnapLines({ x: snapX ? [snapX.line] : [], y: snapY ? [snapY.line] : [] });
                }
            }
            applyDraft(next);
            return;
        }
        let point = { x: (event.clientX - gesture.box.left - gesture.view.x) / gesture.view.k, y: (event.clientY - gesture.box.top - gesture.view.y) / gesture.view.k };
        if (gesture.mode === "resize") {
            if (viewFlags.snap) {
                const threshold = SNAP_SCREEN_DISTANCE / gesture.view.k;
                const snapX = snapAxis([point.x], snapTargets("x", gesture.layerId), threshold);
                const snapY = snapAxis([point.y], snapTargets("y", gesture.layerId), threshold);
                if (snapX || snapY) point = { x: point.x + (snapX?.diff ?? 0), y: point.y + (snapY?.diff ?? 0) };
                setSnapLines({ x: snapX ? [snapX.line] : [], y: snapY ? [snapY.line] : [] });
            }
            applyDraft(resizePsLayer(gesture.startLayers, gesture.layerId, point, gesture.corner));
            return;
        }
        const delta = angleAt(point, gesture.centre) - gesture.startAngle;
        applyDraft(rotatePsLayer(gesture.startLayers, gesture.layerId, event.shiftKey ? Math.round(delta / 15) * 15 : delta, gesture.centre));
    };

    const endLayerGesture = (event: ReactPointerEvent<HTMLDivElement>) => {
        const gesture = gestureRef.current;
        if (!gesture || gesture.pointerId !== event.pointerId) return;
        gestureRef.current = null;
        setSnapLines(EMPTY_SNAP_LINES);
        const current = draftRef.current;
        applyDraft(null);
        if (current && board) commit(current, t(gesture.mode === "move" ? "canvas.ps.historyMove" : gesture.mode === "resize" ? "canvas.ps.historyResize" : "canvas.ps.historyRotate"));
    };

    const commitText = () => {
        if (!board || !editingTextId) return;
        setEditingTextId("");
        commit(patchPsLayer(boardLayers, editingTextId, { text: textDraft }), t("canvas.ps.historyText"));
    };

    const docPoint = useCallback(
        (event: { clientX: number; clientY: number }): PsPaintPoint => {
            const box = containerRef.current?.getBoundingClientRect();
            if (!box) return { x: 0, y: 0 };
            return { x: (event.clientX - box.left - view.x) / view.k, y: (event.clientY - box.top - view.y) / view.k };
        },
        [view],
    );

    const sampleAt = (point: PsPaintPoint) => {
        const pick = pickRef.current;
        if (!pick?.sampler || !board) return;
        const color = psSampleBoardPixel(pick.sampler, board, point);
        if (color) setPaint((prev) => ({ ...prev, color }));
    };

    const activeLayerPixels = async () => {
        if (!board || !selected) return null;
        const sourceUrl =
            selected.kind === "pixel"
                ? await resolveImageUrl(selected.storageKey)
                : selected.kind === "image" && selected.sourceNodeId
                  ? await resolveImageUrl(nodes.find((node) => node.id === selected.sourceNodeId)?.metadata?.storageKey, nodes.find((node) => node.id === selected.sourceNodeId)?.metadata?.content || "")
                  : "";
        if (!sourceUrl) return null;
        return psLoadLayerPixels(selected, board.width, board.height, sourceUrl);
    };

    const pourLayer = async (layer: CanvasPsLayer, point: PsPaintPoint) => {
        if (!board) return;
        const patternUrl = pattern ? await resolveImageUrl(pattern.storageKey) : "";
        const blob = patternUrl
            ? await psBucketPattern(layer, point, patternUrl, paint.tolerance, { storageKey: targetKey, selection: selection ? { canvas: selection } : null, mask: Boolean(maskLayer) })
            : await psBucketFill(layer, point, paint.color, paint.tolerance, { storageKey: targetKey, selection: selection ? { canvas: selection } : null, mask: Boolean(maskLayer) });
        if (!blob) return;
        const uploaded = await uploadImage(blob);
        const patch = maskLayer ? { maskStorageKey: uploaded.storageKey } : { storageKey: uploaded.storageKey };
        commit(paintTarget ? patchPsLayer(boardLayers, layer.id, patch) : addPsLayer(boardLayers, { ...layer, ...patch }), t(pattern ? "canvas.ps.historyPatternFill" : "canvas.ps.historyBucket"));
        if (!paintTarget) setSelectedLayerId(layer.id);
    };

    const commitStroke = async (gesture: PsPaintGesture) => {
        const blob = await psCommitStroke(gesture.stroke, gesture.brush.opacity, gesture.erase);
        setStrokeLayer(null);
        if (!blob || !board) return;
        const uploaded = await uploadImage(blob);
        const patch = gesture.maskTarget ? { maskStorageKey: uploaded.storageKey } : { storageKey: uploaded.storageKey };
        commit(gesture.created ? addPsLayer(boardLayers, { ...gesture.layer, ...patch }) : patchPsLayer(boardLayers, gesture.layer.id, patch), t(gesture.maskTarget ? "canvas.ps.historyMaskPaint" : "canvas.ps.historyPaint"));
        if (gesture.created) setSelectedLayerId(gesture.layer.id);
    };

    const beginPaint = (event: ReactPointerEvent<HTMLDivElement>) => {
        if (!board) return;
        const point = docPoint(event);
        if (tool === "eyedropper") {
            event.currentTarget.setPointerCapture(event.pointerId);
            const pick = { pointerId: event.pointerId, sampler: null as PsBoardSampler | null };
            pickRef.current = pick;
            void psLoadBoardSampler(board, nodes).then((sampler) => {
                if (pickRef.current !== pick) return;
                pick.sampler = sampler;
                sampleAt(point);
            });
            return;
        }
        const layer = paintTarget ?? createPsPixelLayer(board, t("canvas.ps.pixelLayer"));
        if (tool === "bucket") {
            void pourLayer(layer, psDocToLayer(layer, point));
            return;
        }
        const stroke = psBeginStroke(layer, brushOptions, { storageKey: targetKey, selection: selection ? { canvas: selection } : null });
        if (!stroke) return;
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        paintRef.current = { pointerId: event.pointerId, layer, created: !paintTarget, stroke, brush: brushOptions, erase: maskLayer ? tool === "brush" : tool === "eraser", maskTarget: Boolean(maskLayer) };
        setGestureActive(true);
        setStrokeLayer(layer);
        psStrokeTo(stroke, psDocToLayer(layer, point), brushOptions);
        if (strokeCanvasRef.current) psDrawStroke(strokeCanvasRef.current, stroke, brushOptions.opacity, maskLayer ? tool === "brush" : tool === "eraser");
    };

    const movePaint = (event: ReactPointerEvent<HTMLDivElement>) => {
        const gesture = paintRef.current;
        if (gesture && gesture.pointerId === event.pointerId) {
            psStrokeTo(gesture.stroke, psDocToLayer(gesture.layer, docPoint(event)), gesture.brush);
            if (strokeCanvasRef.current) psDrawStroke(strokeCanvasRef.current, gesture.stroke, gesture.brush.opacity, gesture.erase);
            return;
        }
        if (pickRef.current?.pointerId === event.pointerId) sampleAt(docPoint(event));
    };

    const finishPaint = (event: ReactPointerEvent<HTMLDivElement>) => {
        if (pickRef.current?.pointerId === event.pointerId) {
            pickRef.current = null;
            return;
        }
        const gesture = paintRef.current;
        if (!gesture || gesture.pointerId !== event.pointerId) return;
        paintRef.current = null;
        setGestureActive(false);
        void commitStroke(gesture);
    };

    const wandSelect = async (point: PsPaintPoint, mode: PsSelectionMode) => {
        if (!board) return;
        const activePixels = selectOptions.sampleAll ? null : await activeLayerPixels();
        const image = activePixels ?? (await psLoadBoardPixels(board, nodes, board.width, board.height));
        if (!image) return;
        const shape = psSelectionWand(image, point, paint.tolerance, selectOptions.contiguous);
        if (!shape) return;
        const target = ensureSelection();
        if (!target) return;
        psSelectionCombine({ canvas: target }, shape, mode);
        commitSelection(target);
    };

    const finishPolygon = (points: PsPaintPoint[]) => {
        polyRef.current = [];
        setDraft(null);
        if (!board || points.length < 3) return;
        const target = ensureSelection();
        if (!target) return;
        psSelectionPolygon({ canvas: target }, points, selectOptions.feather, selectOptions.antiAlias, polyModeRef.current);
        commitSelection(target);
    };

    const addPolygonPoint = (point: PsPaintPoint, mode: PsSelectionMode) => {
        const points = polyRef.current;
        if (!points.length) polyModeRef.current = mode;
        const next = [...points, point];
        if (next.length > 2 && Math.hypot(point.x - next[0].x, point.y - next[0].y) <= POLY_CLOSE_SCREEN_RADIUS / view.k) {
            finishPolygon(next);
            return;
        }
        polyRef.current = next;
        setDraft({ kind: "path", d: pointsPath(next) });
    };

    const beginQuickSelect = async (event: ReactPointerEvent<HTMLDivElement>, point: PsPaintPoint, target: HTMLCanvasElement) => {
        if (!board) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        const gesture: PsQuickGesture = { pointerId: event.pointerId, target, image: null, sample: null, radius: Math.max(1, paint.size / 2), erase: event.altKey };
        quickRef.current = gesture;
        setGestureActive(true);
        const image = await psLoadBoardPixels(board, nodes, board.width, board.height);
        if (quickRef.current !== gesture) return;
        gesture.image = image;
        gesture.sample = image ? psImageColorAt(image, Math.floor(point.x), Math.floor(point.y)) : null;
        psSelectionQuick({ canvas: target }, image, point, gesture.radius, paint.tolerance, gesture.sample, gesture.erase);
    };

    const beginSelect = (event: ReactPointerEvent<HTMLDivElement>) => {
        if (!board) return;
        const point = docPoint(event);
        if (tool === "wand") {
            void wandSelect(point, selectionMode(event));
            return;
        }
        if (tool === "polygon-lasso") {
            addPolygonPoint(point, selectionMode(event));
            return;
        }
        const target = ensureSelection();
        if (!target) return;
        if (tool === "quick-select") {
            void beginQuickSelect(event, point, target);
            return;
        }
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        setGestureActive(true);
        if (tool === "lasso") selectRef.current = { pointerId: event.pointerId, tool: "lasso", points: [point], mode: selectionMode(event) };
        else if (tool === "marquee" || tool === "ellipse-marquee") selectRef.current = { pointerId: event.pointerId, tool, start: point, current: point, mode: selectionMode(event) };
    };

    const moveSelect = (event: ReactPointerEvent<HTMLDivElement>) => {
        const quick = quickRef.current;
        if (quick && quick.pointerId === event.pointerId) {
            psSelectionQuick({ canvas: quick.target }, quick.image, docPoint(event), quick.radius, paint.tolerance, quick.sample, quick.erase);
            const now = performance.now();
            if (now - quickPaintRef.current > 160) {
                quickPaintRef.current = now;
                setSelectionVersion((version) => version + 1);
            }
            return;
        }
        if (tool === "polygon-lasso" && polyRef.current.length) {
            setDraft({ kind: "path", d: pointsPath(polyRef.current, docPoint(event)) });
            return;
        }
        const gesture = selectRef.current;
        if (!gesture || gesture.pointerId !== event.pointerId) return;
        const point = docPoint(event);
        if (gesture.tool === "lasso") {
            gesture.points.push(point);
            setDraft({ kind: "path", d: pointsPath(gesture.points) });
            return;
        }
        gesture.current = point;
        setDraft({ kind: "rect", ...boxBetween(gesture.start, point), ellipse: gesture.tool === "ellipse-marquee" });
    };

    const finishSelect = (event: ReactPointerEvent<HTMLDivElement>) => {
        const quick = quickRef.current;
        if (quick && quick.pointerId === event.pointerId) {
            quickRef.current = null;
            setGestureActive(false);
            commitSelection(quick.target);
            return;
        }
        const gesture = selectRef.current;
        if (!gesture || gesture.pointerId !== event.pointerId) return;
        selectRef.current = null;
        setGestureActive(false);
        setDraft(null);
        if (!board) return;
        const target = ensureSelection();
        if (!target) return;
        if (gesture.tool === "lasso") psSelectionPolygon({ canvas: target }, gesture.points, selectOptions.feather, selectOptions.antiAlias, gesture.mode);
        else psSelectionRect({ canvas: target }, boxBetween(gesture.start, gesture.current), gesture.tool === "ellipse-marquee", selectOptions.feather, selectOptions.antiAlias, gesture.mode);
        commitSelection(target);
    };

    const gradientStops = (): PsGradientStop[] => {
        if (gradientStopsOption?.length) return gradientStopsOption;
        const position = clamp(paint.stop, 0, 1);
        if (!maskLayer) {
            return [
                { color: paint.color, position: 0 },
                { color: paint.background, position },
            ];
        }
        return [
            { color: `rgba(255,255,255,${psColorLuminance(paint.color)})`, position: 0 },
            { color: `rgba(255,255,255,${psColorLuminance(paint.background)})`, position },
        ];
    };

    const beginGradient = (event: ReactPointerEvent<HTMLDivElement>) => {
        if (!board) return;
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        const point = docPoint(event);
        gradientRef.current = { pointerId: event.pointerId, from: point, to: point };
        setGestureActive(true);
        setDraft({ kind: "line", x1: point.x, y1: point.y, x2: point.x, y2: point.y });
    };

    const moveGradient = (event: ReactPointerEvent<HTMLDivElement>) => {
        const gesture = gradientRef.current;
        if (!gesture || gesture.pointerId !== event.pointerId) return;
        gesture.to = docPoint(event);
        setDraft({ kind: "line", x1: gesture.from.x, y1: gesture.from.y, x2: gesture.to.x, y2: gesture.to.y });
    };

    const finishGradient = async (event: ReactPointerEvent<HTMLDivElement>) => {
        const gesture = gradientRef.current;
        if (!gesture || gesture.pointerId !== event.pointerId) return;
        gradientRef.current = null;
        setGestureActive(false);
        setDraft(null);
        if (!board) return;
        if (Math.hypot(gesture.to.x - gesture.from.x, gesture.to.y - gesture.from.y) < 2) return;
        const layer = paintTarget ?? createPsPixelLayer(board, t("canvas.ps.pixelLayer"));
        const blob = await psGradientFill(layer, { type: gradient.type, from: psDocToLayer(layer, gesture.from), to: psDocToLayer(layer, gesture.to), stops: gradientStops(), opacity: gradient.opacity, mode: gradient.mode, reverse: gradient.reverse }, { storageKey: targetKey, selection: selection ? { canvas: selection } : null });
        if (!blob) return;
        const uploaded = await uploadImage(blob);
        const patch = maskLayer ? { maskStorageKey: uploaded.storageKey } : { storageKey: uploaded.storageKey };
        commit(paintTarget ? patchPsLayer(boardLayers, layer.id, patch) : addPsLayer(boardLayers, { ...layer, ...patch }), t("canvas.ps.historyGradient"));
        if (!paintTarget) setSelectedLayerId(layer.id);
    };

    const beginShape = (event: ReactPointerEvent<HTMLDivElement>) => {
        if (!board) return;
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        const point = docPoint(event);
        const layer = createPsShapeLayer(shapeOptions.type, { x: point.x, y: point.y, width: 1, height: 1 }, t(SHAPE_NAME_KEYS[shapeOptions.type]), shapeOptions.fill, shapeOptions.stroke, shapeOptions.strokeWidth);
        shapeRef.current = { pointerId: event.pointerId, layer, start: point };
        setGestureActive(true);
        applyDraft(addPsLayer(boardLayers, layer));
    };

    const moveShape = (event: ReactPointerEvent<HTMLDivElement>) => {
        const gesture = shapeRef.current;
        if (!gesture || gesture.pointerId !== event.pointerId) return;
        const point = docPoint(event);
        const box = boxBetween(gesture.start, point);
        const square = event.shiftKey ? Math.max(box.width, box.height) : 0;
        const sized = square ? { x: point.x < gesture.start.x ? box.x + box.width - square : box.x, y: point.y < gesture.start.y ? box.y + box.height - square : box.y, width: square, height: square } : box;
        applyDraft(addPsLayer(boardLayers, { ...gesture.layer, ...sized }));
        setDraft({ kind: "rect", ...sized, ellipse: shapeOptions.type === "ellipse" });
    };

    const finishShape = async (event: ReactPointerEvent<HTMLDivElement>) => {
        const gesture = shapeRef.current;
        if (!gesture || gesture.pointerId !== event.pointerId) return;
        shapeRef.current = null;
        setGestureActive(false);
        setDraft(null);
        const current = draftRef.current;
        applyDraft(null);
        if (!current || !board) return;
        const created = findPsLayer(current, gesture.layer.id);
        if (!created || created.width < 2 || created.height < 2) return;
        let next = current;
        if (selection) {
            const maskCanvas = psSelectionToLayerSpace({ canvas: selection }, created, psBitmapSize(created.width), psBitmapSize(created.height));
            const blob = maskCanvas ? await psSelectionBlob(maskCanvas) : null;
            if (blob) {
                const uploaded = await uploadImage(blob);
                if (uploaded.storageKey) next = patchPsLayer(next, created.id, { maskStorageKey: uploaded.storageKey });
            }
        }
        commit(next, t("canvas.ps.historyShape"));
        setSelectedLayerId(gesture.layer.id);
    };

    const addMask = async () => {
        if (!board || !selected || selected.kind === "group") return;
        let maskKey = "";
        if (selection) {
            const maskCanvas = psSelectionToLayerSpace({ canvas: selection }, selected, psBitmapSize(selected.width), psBitmapSize(selected.height));
            const blob = maskCanvas ? await psSelectionBlob(maskCanvas) : null;
            if (blob) maskKey = (await uploadImage(blob)).storageKey || "";
        } else {
            const full = psSelectionCreate(selected.width, selected.height);
            if (full) {
                psSelectionAll(full);
                const blob = await psSelectionBlob(full.canvas);
                if (blob) maskKey = (await uploadImage(blob)).storageKey || "";
            }
        }
        if (!maskKey) return;
        commit(patchPsLayer(boardLayers, selected.id, { maskStorageKey: maskKey }), t("canvas.ps.historyMask"));
        setMaskTargetId(selected.id);
        setMaskView(true);
    };

    const openFilter = (type: PsFilterType) => {
        if (!selected || selected.kind === "adjustment") return;
        setFilterType(type);
    };

    const repeatFilter = async () => {
        if (!board || !selected || !lastFilter || selected.kind === "adjustment") return;
        const maskUrl = selected.maskStorageKey ? await resolveImageUrl(selected.maskStorageKey) : "";
        const blob = await psFilterLayerBitmap(selected, boardLayers, nodes, lastFilter.type, lastFilter.params, { selection: selection ? { canvas: selection } : null, maskUrl: maskUrl || undefined });
        if (!blob) return;
        const uploaded = await uploadImage(blob);
        if (!uploaded.storageKey) return;
        commit(rasterizePsLayer(boardLayers, selected.id, uploaded.storageKey), t("canvas.ps.historyFilter"));
    };

    const resizeDocument = (width: number, height: number) => {
        if (!board) return;
        const rounded = { width: Math.max(1, Math.round(width)), height: Math.max(1, Math.round(height)) };
        setNodes((prev) => prev.map((node) => (node.id === board.id ? { ...node, ...rounded, metadata: { ...node.metadata, boardRatio: inferMediaRatio(`${rounded.width}x${rounded.height}`) } } : node)));
    };

    const imageSize = async (width: number, height: number) => {
        if (!board) return;
        const resampled = await psResampleLayerBitmaps(psScaleLayers(boardLayers, width / Math.max(1, board.width), height / Math.max(1, board.height)));
        commit(resampled, t("canvas.ps.historyImageSize"));
        resizeDocument(width, height);
        resetSelection();
    };

    const canvasSize = (width: number, height: number, anchor: PsCanvasAnchor) => {
        if (!board) return;
        const offset = psAnchorOffset(anchor, board.width, board.height, width, height);
        commit(psOffsetLayers(boardLayers, offset.dx, offset.dy), t("canvas.ps.historyCanvasSize"));
        resizeDocument(width, height);
        resetSelection();
    };

    const rotateDocument = (degrees: number) => {
        if (!board) return;
        const result = psRotateLayers(boardLayers, degrees, board.width, board.height);
        commit(result.layers, t("canvas.ps.historyRotate"));
        resizeDocument(result.width, result.height);
        resetSelection();
    };

    const cropSelection = () => {
        if (!board || !selection) return;
        const bounds = psSelectionBounds({ canvas: selection });
        if (!bounds) return;
        commit(psOffsetLayers(boardLayers, -bounds.x, -bounds.y), t("canvas.ps.historyCrop"));
        resizeDocument(bounds.width, bounds.height);
        resetSelection();
    };

    const trimDocument = () => {
        if (!board) return;
        const box = psTrimBox(boardLayers, board.width, board.height);
        if (box.x === 0 && box.y === 0 && box.width === board.width && box.height === board.height) return;
        commit(psOffsetLayers(boardLayers, -box.x, -box.y), t("canvas.ps.historyTrim"));
        resizeDocument(box.width, box.height);
        resetSelection();
    };

    const setPaths = (next: CanvasPsPath[]) => {
        if (!board) return;
        onBoardChange(board.id, { boardPaths: next });
    };

    const setDraftPath = (next: CanvasPsPath | null) => {
        penDraftRef.current = next;
        setPenDraft(next);
    };

    const commitPath = (path: CanvasPsPath) => {
        setPaths(paths.some((item) => item.id === path.id) ? paths.map((item) => (item.id === path.id ? path : item)) : [...paths, path]);
        setActivePathId(path.id);
        setDraftPath(null);
    };

    const pathHit = (path: CanvasPsPath, point: PsPaintPoint) => {
        const radius = PATH_HIT_SCREEN_RADIUS / view.k;
        let index = -1;
        let kind: "anchor" | "in" | "out" = "anchor";
        let best = radius;
        path.anchors.forEach((anchor, item) => {
            const candidates: { kind: "anchor" | "in" | "out"; point: PsPaintPoint }[] = [
                { kind: "anchor", point: anchor },
                { kind: "in", point: { x: anchor.x + anchor.handleIn.x, y: anchor.y + anchor.handleIn.y } },
                { kind: "out", point: { x: anchor.x + anchor.handleOut.x, y: anchor.y + anchor.handleOut.y } },
            ];
            candidates.forEach((candidate) => {
                const distance = Math.hypot(candidate.point.x - point.x, candidate.point.y - point.y);
                if (distance <= best) {
                    best = distance;
                    index = item;
                    kind = candidate.kind;
                }
            });
        });
        return index < 0 ? null : { index, kind };
    };

    const beginPen = (event: ReactPointerEvent<HTMLDivElement>) => {
        if (!board) return;
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        const point = docPoint(event);
        const working = penDraftRef.current ?? activePath ?? createPsPath(t("canvas.ps.pathName", { count: paths.length + 1 }));
        const first = working.anchors[0];
        if (working.anchors.length > 2 && first && Math.hypot(point.x - first.x, point.y - first.y) <= POLY_CLOSE_SCREEN_RADIUS / view.k) {
            commitPath({ ...working, closed: true });
            return;
        }
        const anchors = [...working.anchors, psPathAnchor(point.x, point.y)];
        setDraftPath({ ...working, anchors });
        pathRef.current = { pointerId: event.pointerId, index: anchors.length - 1, kind: "anchor" };
        setGestureActive(true);
    };

    const beginDirectSelect = (event: ReactPointerEvent<HTMLDivElement>) => {
        const working = penDraftRef.current ?? activePath;
        if (!working) return;
        const hit = pathHit(working, docPoint(event));
        if (!hit) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        pathRef.current = { pointerId: event.pointerId, index: hit.index, kind: hit.kind };
        setDraftPath(working);
        setGestureActive(true);
    };

    const movePen = (event: ReactPointerEvent<HTMLDivElement>, penTool: boolean) => {
        const gesture = pathRef.current;
        const working = penDraftRef.current;
        if (!gesture || gesture.pointerId !== event.pointerId || !working) return;
        const point = docPoint(event);
        const anchors = working.anchors.map((anchor, index) => {
            if (index !== gesture.index) return anchor;
            if (gesture.kind === "anchor" && penTool) return { ...anchor, handleOut: { x: point.x - anchor.x, y: point.y - anchor.y }, handleIn: { x: anchor.x - point.x, y: anchor.y - point.y } };
            if (gesture.kind === "anchor") return { ...anchor, x: point.x, y: point.y };
            if (gesture.kind === "out") return { ...anchor, handleOut: { x: point.x - anchor.x, y: point.y - anchor.y }, handleIn: { x: anchor.x - point.x, y: anchor.y - point.y } };
            return { ...anchor, handleIn: { x: point.x - anchor.x, y: point.y - anchor.y } };
        });
        setDraftPath({ ...working, anchors });
    };

    const endPen = (event: ReactPointerEvent<HTMLDivElement>) => {
        const gesture = pathRef.current;
        if (!gesture || gesture.pointerId !== event.pointerId) return;
        pathRef.current = null;
        setGestureActive(false);
        const working = penDraftRef.current;
        if (working?.anchors.length) commitPath(working);
    };

    const pathSelection = (path: CanvasPsPath) => {
        const target = ensureSelection();
        if (!target) return;
        psPathToSelection(path, target, selectOptions.feather, selectOptions.antiAlias, "replace");
        commitSelection(target);
    };

    const pathPaint = async (path: CanvasPsPath, stroke: boolean) => {
        if (!board) return;
        const layer = paintTarget ?? createPsPixelLayer(board, t("canvas.ps.pixelLayer"));
        const blob = await psPaintPath(layer, path, paint.color, stroke ? paint.size : 0, psPathPaintSource(targetKey, selection ? { canvas: selection } : null));
        if (!blob) return;
        const uploaded = await uploadImage(blob);
        const patch = maskLayer ? { maskStorageKey: uploaded.storageKey } : { storageKey: uploaded.storageKey };
        commit(paintTarget ? patchPsLayer(boardLayers, layer.id, patch) : addPsLayer(boardLayers, { ...layer, ...patch }), t(stroke ? "canvas.ps.historyPathStroke" : "canvas.ps.historyPathFill"));
        if (!paintTarget) setSelectedLayerId(layer.id);
    };

    const fillPattern = async (preset: PsPatternPreset) => {
        if (!board) return;
        const url = await resolveImageUrl(preset.storageKey);
        if (!url) return;
        const layer = paintTarget ?? createPsPixelLayer(board, t("canvas.ps.pixelLayer"));
        const blob = await psPatternFillLayer(layer, url, { storageKey: targetKey, selection: selection ? { canvas: selection } : null });
        if (!blob) return;
        const uploaded = await uploadImage(blob);
        const patch = maskLayer ? { maskStorageKey: uploaded.storageKey } : { storageKey: uploaded.storageKey };
        commit(paintTarget ? patchPsLayer(boardLayers, layer.id, patch) : addPsLayer(boardLayers, { ...layer, ...patch }), t("canvas.ps.historyPatternFill"));
        if (!paintTarget) setSelectedLayerId(layer.id);
    };

    const beginTransform = (handle: number, event: ReactPointerEvent<HTMLDivElement>) => {
        if (!board || !selected || selected.locked || selected.kind === "adjustment") return;
        event.stopPropagation();
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        transformRef.current = { pointerId: event.pointerId, handle, startLayers: boardLayers };
        setGestureActive(true);
    };

    const moveTransform = (event: ReactPointerEvent<HTMLDivElement>) => {
        const gesture = transformRef.current;
        const mode = transformMode;
        if (!gesture || gesture.pointerId !== event.pointerId || !selected || !mode || mode === "free") return;
        const layer = findPsLayer(gesture.startLayers, selected.id);
        if (!layer) return;
        applyDraft(patchPsLayer(gesture.startLayers, layer.id, { transform: psMoveTransformHandle(layer, mode, gesture.handle, docPoint(event)) }));
    };

    const endTransform = (event: ReactPointerEvent<HTMLDivElement>) => {
        const gesture = transformRef.current;
        if (!gesture || gesture.pointerId !== event.pointerId) return;
        transformRef.current = null;
        setGestureActive(false);
        const current = draftRef.current;
        applyDraft(null);
        if (current) commit(current, t("canvas.ps.historyTransform"));
    };

    const enterTransform = (mode: PsTransformMode) => {
        if (!selected || selected.locked || selected.kind === "adjustment") return;
        setTransformMode(mode);
    };

    const numericTransform = (params: PsNumericTransform) => {
        if (!selected) return;
        setLastTransform(params);
        commit(psApplyNumericTransform(boardLayers, selected.id, params), t("canvas.ps.historyTransform"));
        recorder.record({ kind: "transform", params });
    };

    const repeatTransform = () => {
        if (!selected || !lastTransform) return;
        commit(psApplyNumericTransform(boardLayers, selected.id, lastTransform), t("canvas.ps.historyTransform"));
    };

    const clearTransform = () => {
        if (!selected) return;
        setTransformMode(null);
        commit(psClearTransform(boardLayers, selected.id), t("canvas.ps.historyTransform"));
    };

    const latestRef = useRef({ board, layers: boardLayers, selected, selection });
    latestRef.current = { board, layers: boardLayers, selected, selection };

    const applyFilterStep = async (type: PsFilterType, params: PsFilterParams) => {
        const latest = latestRef.current;
        if (!latest.board || !latest.selected || latest.selected.kind === "adjustment") return;
        const maskUrl = latest.selected.maskStorageKey ? await resolveImageUrl(latest.selected.maskStorageKey) : "";
        const blob = await psFilterLayerBitmap(latest.selected, latest.layers, nodes, type, params, { selection: latest.selection ? { canvas: latest.selection } : null, maskUrl: maskUrl || undefined });
        if (!blob) return;
        const uploaded = await uploadImage(blob);
        if (!uploaded.storageKey) return;
        commit(rasterizePsLayer(latest.layers, latest.selected.id, uploaded.storageKey), t("canvas.ps.historyFilter"));
    };

    const layerCommand = (command: PsLayerCommand) => {
        const latest = latestRef.current;
        if (!latest.board || !latest.selected) return;
        const id = latest.selected.id;
        const layers = latest.layers;
        const labels: Record<PsLayerCommand, string> = {
            duplicate: t("canvas.ps.duplicate"),
            delete: t("canvas.ps.remove"),
            forward: t("canvas.ps.moveUp"),
            backward: t("canvas.ps.moveDown"),
            group: t("canvas.ps.addGroup"),
            ungroup: t("canvas.ps.ungroup"),
            rasterize: t("canvas.ps.historyRasterize"),
        };
        if (command === "duplicate") commit(duplicatePsLayer(layers, id, t("canvas.ps.duplicateSuffix"), nanoid()), labels[command]);
        if (command === "delete") {
            commit(removePsLayer(layers, id), labels[command]);
            setSelectedLayerId("");
        }
        if (command === "forward" || command === "backward") commit(movePsLayerStep(layers, id, command), labels[command]);
        if (command === "group") commit(groupPsLayers(layers, [id], nanoid(), t("canvas.ps.groupLayer")), labels[command]);
        if (command === "ungroup") commit(ungroupPsLayer(layers, id), labels[command]);
        if (command === "rasterize") {
            void renderPsLayerBitmap(latest.selected, layers, nodes, latest.board.metadata?.boardPaths ?? []).then(async (canvas) => {
                const blob = canvas ? await psCanvasToBlob(canvas) : null;
                if (!blob) return;
                const uploaded = await uploadImage(blob);
                if (!uploaded.storageKey) return;
                commit(rasterizePsLayer(layers, id, uploaded.storageKey), labels[command]);
            });
        }
    };

    const menuCommands: Record<PsMenuCommand, () => void> = {
        selectAll,
        deselect,
        inverse: invertSelection,
        feather: featherSelection,
        crop: cropSelection,
        trim: trimDocument,
        rotateCw: () => rotateDocument(90),
        rotateCcw: () => rotateDocument(-90),
        rotate180: () => rotateDocument(180),
    };

    const menuRun = (command: PsMenuCommand) => {
        recorder.record({ kind: "menu", command });
        menuCommands[command]();
    };

    const runActionStep = async (step: PsActionStep) => {
        if (step.kind === "filter") await applyFilterStep(step.filter as PsFilterType, step.params as PsFilterParams);
        if (step.kind === "transform") numericTransform(step.params);
        if (step.kind === "layer") layerCommand(step.command as PsLayerCommand);
        if (step.kind === "menu") menuRun(step.command as PsMenuCommand);
        if (step.kind === "adjustment") {
            const latest = latestRef.current;
            if (!latest.board) return;
            const type = step.adjustment as CanvasPsAdjustmentType;
            const layer = createPsAdjustmentLayer(latest.board, type, t(PS_ADJUSTMENT_NAME_KEYS[type]));
            commit(addPsLayerAbove(latest.layers, layer, latest.selected?.id), t(PS_ADJUSTMENT_NAME_KEYS[type]));
            setSelectedLayerId(layer.id);
        }
    };

    const beginGuide = (axis: PsGuideAxis, event: ReactPointerEvent<HTMLDivElement>) => {
        event.stopPropagation();
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        const point = docPoint(event);
        guideRef.current = { pointerId: event.pointerId, axis, index: -1 };
        setGuideDraft({ axis, value: axis === "x" ? point.x : point.y });
    };

    const beginGuideDrag = (axis: PsGuideAxis, value: number, event: ReactPointerEvent<HTMLDivElement>) => {
        event.stopPropagation();
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        const index = axis === "x" ? guides.x.indexOf(value) : guides.y.indexOf(value);
        guideRef.current = { pointerId: event.pointerId, axis, index };
        setGuideDraft({ axis, value });
    };

    const moveGuide = (event: ReactPointerEvent<HTMLDivElement>) => {
        const gesture = guideRef.current;
        if (!gesture || gesture.pointerId !== event.pointerId) return;
        const point = docPoint(event);
        setGuideDraft({ axis: gesture.axis, value: gesture.axis === "x" ? point.x : point.y });
    };

    const endGuide = (event: ReactPointerEvent<HTMLDivElement>) => {
        const gesture = guideRef.current;
        if (!gesture || gesture.pointerId !== event.pointerId || !board) return;
        guideRef.current = null;
        setGuideDraft(null);
        const point = docPoint(event);
        const raw = gesture.axis === "x" ? point.x : point.y;
        const limit = gesture.axis === "x" ? board.width : board.height;
        setGuidesByBoard((prev) => {
            const current = prev[board.id] ?? EMPTY_GUIDES;
            const list = [...(gesture.axis === "x" ? current.x : current.y)];
            if (gesture.index >= 0) {
                if (raw >= 0 && raw <= limit) list[gesture.index] = Math.round(raw);
                else list.splice(gesture.index, 1);
            } else if (raw >= 0 && raw <= limit) {
                list.push(Math.round(raw));
            }
            return { ...prev, [board.id]: { ...current, [gesture.axis]: list } };
        });
    };

    const moveCursor = (event: ReactPointerEvent<HTMLDivElement>) => {
        const element = cursorRef.current;
        if (!element) return;
        const box = event.currentTarget.getBoundingClientRect();
        element.style.opacity = "1";
        element.style.transform = `translate(${event.clientX - box.left}px, ${event.clientY - box.top}px) translate(-50%, -50%)`;
    };

    if (!board) {
        return (
            <div className="flex min-h-0 min-w-0 flex-1 flex-col pt-14">
                <div className="flex shrink-0 items-center gap-1.5 px-3 py-2">
                    <button type="button" className={FLAT_ACTION_CLASS} aria-label={t("canvas.workspace.back")} title={t("canvas.workspace.back")} onClick={onBack} style={{ color: theme.node.text }}>
                        <ArrowLeft className="size-3.5" />
                    </button>
                    <span className="min-w-0 flex-1 truncate text-sm" style={{ color: theme.node.muted }}>
                        {t("canvas.workspace.image")}
                    </span>
                </div>
                <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 px-6 py-8 text-center">
                    <Layers className="size-7" style={{ color: theme.node.muted }} />
                    <p className="text-sm" style={{ color: theme.node.text }}>
                        {t("canvas.workspace.pickBoard")}
                    </p>
                    {boards.length ? (
                        <div className="flex w-full max-w-xs flex-col gap-0.5">
                            {boards.map((item) => (
                                <button key={item.id} type="button" className={LIST_ACTION_CLASS} style={{ color: theme.node.text }} onClick={() => onSelectBoard(item.id)}>
                                    <Layers className="size-3.5 shrink-0" style={{ color: theme.node.muted }} />
                                    <span className="min-w-0 flex-1 truncate">{item.title || t("canvas.node.untitled")}</span>
                                    <span className="shrink-0 tabular-nums" style={{ color: theme.node.muted }}>
                                        {smartCanvasLayers(item).length}
                                    </span>
                                </button>
                            ))}
                        </div>
                    ) : (
                        <p className="text-sm" style={{ color: theme.node.muted }}>
                            {t("canvas.workspace.noBoards")}
                        </p>
                    )}
                </div>
            </div>
        );
    }

    const editingLayer = findPsLayer(layers, editingTextId);
    const textStyle = editingLayer ? psTextRenderStyle(editingLayer) : null;
    const handleSize = HANDLE_SCREEN_SIZE / view.k;
    const canFilter = Boolean(selected && selected.kind !== "adjustment");
    const interactive = psTopLayers(layers).filter((layer) => !layer.hidden && layer.kind !== "adjustment");
    const ordered = selected && selected.kind !== "adjustment" && !interactive.some((layer) => layer.id === selected.id) && !selected.hidden ? [...interactive, selected] : [...interactive.filter((layer) => layer.id !== selected?.id), ...interactive.filter((layer) => layer.id === selected?.id)];
    const blendOptions = CANVAS_BLEND_MODES.map((mode) => ({ value: mode.id, label: t(`canvas.blendModes.${mode.id}`) }));
    const shapeTypeOptions = (Object.keys(SHAPE_NAME_KEYS) as CanvasPsShapeKind[]).map((kind) => ({ value: kind, label: t(SHAPE_NAME_KEYS[kind]) }));
    const hint =
        tool === "eyedropper"
            ? t("canvas.ps.eyedropperHint")
            : tool === "wand"
              ? t("canvas.ps.wandHint")
              : tool === "quick-select"
                ? t("canvas.ps.quickSelectHint")
                : tool === "polygon-lasso"
                  ? t("canvas.ps.polygonHint")
                  : tool === "lasso"
                    ? t("canvas.ps.lassoHint")
                    : tool === "marquee" || tool === "ellipse-marquee"
                      ? t("canvas.ps.marqueeHint")
                      : tool === "gradient"
                        ? t("canvas.ps.gradientHint")
                        : tool === "shape"
                          ? t("canvas.ps.shapeHint")
                          : tool === "pen"
                            ? t("canvas.ps.penHint")
                            : tool === "direct-select"
                              ? t("canvas.ps.directSelectHint")
                              : painting && !paintTarget
                                ? t("canvas.ps.paintAutoLayer")
                                : "";
    const transformHandles = transformMode && selected && transformMode !== "free" ? psTransformHandlesDoc(selected, transformMode) : [];
    const brush: PsBrushPreset = { id: brushId, name: brushName || t("canvas.ps.brushNew"), size: paint.size, hardness: paint.hardness, opacity: paint.opacity, spacing: paint.spacing ?? PS_BRUSH_DEFAULT.spacing, scatter: paint.scatter ?? 0, angle: paint.angle ?? 0, roundness: paint.roundness ?? 1, dynamics: paint.dynamics ?? 0, texture: paint.texture ?? 0 };
    const applyBrush = (preset: PsBrushPreset) => {
        setBrushId(preset.id);
        setBrushName(preset.name);
        setPaint((prev) => ({ ...prev, size: preset.size, hardness: preset.hardness, opacity: preset.opacity, spacing: preset.spacing, scatter: preset.scatter, angle: preset.angle, roundness: preset.roundness, dynamics: preset.dynamics, texture: preset.texture }));
    };
    const renderPsPanel = (panelId: string) => {
        if (panelId === "layers")
            return (
                <PsLayersPanel
                    board={board}
                    setNodes={setNodes}
                    imageNodes={imageNodes}
                    selectedId={selectedLayerId}
                    onSelect={setSelectedLayerId}
                    maskTarget={Boolean(maskLayer)}
                    maskView={maskView}
                    onMaskTarget={(layerId, target, nextView) => {
                        setMaskTargetId(target ? layerId : "");
                        setMaskView(nextView);
                    }}
                    onLayerCommand={layerCommand}
                />
            );
        if (panelId === "channels") return <PsChannelsPanel board={board} onBoardChange={onBoardChange} selection={selection} onLoadSelection={(next) => commitSelection(next.canvas)} view={channelView} onView={setChannelView} />;
        if (panelId === "paths")
            return (
                <PsPathsPanel
                    paths={paths}
                    activeId={activePathId}
                    onActive={(id) => {
                        setActivePathId(id);
                        setDraftPath(null);
                    }}
                    onPaths={setPaths}
                    onSelection={pathSelection}
                    onFill={(path) => void pathPaint(path, false)}
                    onStroke={(path) => void pathPaint(path, true)}
                    color={paint.color}
                    onColor={(hex) => setPaint((prev) => ({ ...prev, color: hex }))}
                />
            );
        if (panelId === "history") return <PsHistoryPanel history={history.state} onRestore={history.restore} onSnapshot={history.snapshot} />;
        if (panelId === "actions") return <PsActionsPanel recorder={recorder} />;
        if (panelId === "adjustments") return <PsAdjustmentsPanel board={board} setNodes={setNodes} selected={selected || null} onSelect={setSelectedLayerId} />;
        if (panelId === "properties")
            return (
                <>
                    <PsPropertiesPanel board={board} setNodes={setNodes} selected={selected || null} onAddMask={() => void addMask()} />
                    {selected?.kind === "text" ? <PsTextPanel board={board} setNodes={setNodes} layer={selected} paths={paths} /> : null}
                </>
            );
        if (panelId === "color") return <PsColorPanelBody foreground={paint.color} background={paint.background} onForeground={(hex) => setPaint((prev) => ({ ...prev, color: hex }))} onBackground={(hex) => setPaint((prev) => ({ ...prev, background: hex }))} />;
        if (panelId === "gradients") return <PsGradientsPanel foreground={paint.color} background={paint.background} onPick={(stops) => { setGradientStopsOption(stops); setTool("gradient"); }} />;
        if (panelId === "patterns")
            return (
                <PsPatternsPanel
                    board={board}
                    layers={boardLayers}
                    nodes={nodes}
                    selection={selection}
                    selected={selected || null}
                    onPick={(preset) => {
                        setPattern(preset);
                        setTool("bucket");
                    }}
                    onForeground={(hex) => setPaint((prev) => ({ ...prev, color: hex }))}
                    onFill={(preset) => void fillPattern(preset)}
                />
            );
        if (panelId === "brushes") return <PsBrushesPanel brush={brush} color={paint.color} onChange={applyBrush} />;
        return null;
    };

    return (
        <div className="flex min-h-0 min-w-0 flex-1 flex-col pt-14">
            <div className={`${STUDIO_BAR_CLASS} h-11 glass-surface`}>
                <button type="button" className={FLAT_ACTION_CLASS} aria-label={t("canvas.workspace.back")} title={t("canvas.workspace.back")} onClick={onBack} style={{ color: theme.node.text }}>
                    <ArrowLeft className="size-3.5" />
                </button>
                <Select
                    size="small"
                    variant="borderless"
                    className="min-w-[120px] max-w-[220px]"
                    value={board.id}
                    placeholder={t("canvas.workspace.pickBoard")}
                    options={boards.map((item) => ({ value: item.id, label: item.title || t("canvas.node.untitled") }))}
                    popupMatchSelectWidth={false}
                    styles={{ popup: { root: { zIndex: 1300 } } }}
                    aria-label={t("canvas.workspace.pickBoard")}
                    onChange={onSelectBoard}
                />
                <SmartCanvasSettingsPopover
                    ratio={smartCanvasRatio(board)}
                    resolution={smartCanvasResolution(board)}
                    background={smartCanvasBackground(board)}
                    backgroundOpacity={smartCanvasBackgroundOpacity(board)}
                    onChange={(patch) => {
                        onBoardChange(board.id, patch);
                        resetSelection();
                    }}
                />
                <span className={STUDIO_DIVIDER_CLASS} style={{ background: theme.toolbar.border }} />
                <span className="flex w-20 shrink-0 items-center gap-1">
                    <span className="w-12 shrink-0 text-center text-sm tabular-nums" style={{ color: theme.node.text }}>
                        {Math.round(view.k * 100)}%
                    </span>
                    <button type="button" className={FLAT_ACTION_CLASS} aria-label={t("canvas.ps.fit")} title={t("canvas.ps.fit")} onClick={fit} style={{ color: theme.node.text }}>
                        <Maximize className="size-3.5" />
                    </button>
                </span>
                <span className="min-w-0 flex-1" />
                <button type="button" className="flex h-7 shrink-0 items-center gap-1 rounded-full px-2.5 text-sm transition hover:bg-hover" style={{ color: theme.node.text }} onClick={() => onOutput(board)}>
                    <ImagePlus className="size-3.5" />
                    {t("canvas.smartCanvas.saveAsNode")}
                </button>
            </div>

            <div className={`${STUDIO_OPTIONS_CLASS} glass-surface`} style={{ color: theme.node.muted, borderColor: theme.toolbar.border }}>
                <ImageSettingsTheme theme={theme}>
                    <PsMenus
                        disabled={false}
                        canCrop={Boolean(selection)}
                        canFilter={canFilter}
                        lastFilter={lastFilter?.type || ""}
                        width={board.width}
                        height={board.height}
                        view={viewFlags}
                        onViewChange={(patch) => setViewFlags((prev) => ({ ...prev, ...patch }))}
                        canTransform={Boolean(selected && !selected.locked && selected.kind !== "adjustment")}
                        lastTransform={Boolean(lastTransform)}
                        onSelectAll={() => menuRun("selectAll")}
                        onDeselect={() => menuRun("deselect")}
                        onInverse={() => menuRun("inverse")}
                        onFeather={() => menuRun("feather")}
                        onImageSize={(width, height) => void imageSize(width, height)}
                        onCanvasSize={canvasSize}
                        onRotate={rotateDocument}
                        onCrop={() => menuRun("crop")}
                        onTrim={() => menuRun("trim")}
                        onClearGuides={() => setGuidesByBoard((prev) => ({ ...prev, [board.id]: EMPTY_GUIDES }))}
                        onFilter={openFilter}
                        onRepeatFilter={() => void repeatFilter()}
                        onTransform={enterTransform}
                        onNumericTransform={numericTransform}
                        onRepeatTransform={repeatTransform}
                        onClearTransform={clearTransform}
                    />
                    <DockWindowMenu defs={PS_DOCK_PANELS} layout={dock.layout} onToggle={dock.toggle} onReset={dock.reset} />
                    <span className={STUDIO_DIVIDER_CLASS} style={{ background: theme.toolbar.border }} />
                    <span className={`${STUDIO_LABEL_CLASS} w-20 truncate`} style={{ color: theme.node.text }}>
                        {t(TOOL_LABELS[tool])}
                    </span>
                    {ringTool ? (
                        <>
                            <OptionSlider label={t("canvas.ps.brushSize")} value={paint.size} min={BRUSH_SIZE_MIN} max={BRUSH_SIZE_MAX} suffix="px" onChange={(value) => setPaint((prev) => ({ ...prev, size: value }))} />
                            {tool === "quick-select" ? null : (
                                <>
                                    <OptionSlider label={t("canvas.ps.brushHardness")} value={Math.round(paint.hardness * 100)} min={0} max={100} suffix="%" onChange={(value) => setPaint((prev) => ({ ...prev, hardness: value / 100 }))} />
                                    <OptionSlider label={t("canvas.ps.brushOpacity")} value={Math.round(paint.opacity * 100)} min={1} max={100} suffix="%" onChange={(value) => setPaint((prev) => ({ ...prev, opacity: value / 100 }))} />
                                </>
                            )}
                            <span className="shrink-0">{t("canvas.ps.brushSizeHint")}</span>
                        </>
                    ) : null}
                    {selecting && tool !== "wand" && tool !== "quick-select" ? <OptionSlider label={t("canvas.ps.selectFeather")} value={selectOptions.feather} min={0} max={100} suffix="px" onChange={(value) => setSelectOptions((prev) => ({ ...prev, feather: value }))} /> : null}
                    {selecting && tool !== "wand" && tool !== "quick-select" ? <OptionToggle label={t("canvas.ps.selectAntiAlias")} checked={selectOptions.antiAlias} onChange={(value) => setSelectOptions((prev) => ({ ...prev, antiAlias: value }))} /> : null}
                    {tool === "wand" || tool === "quick-select" ? <OptionSlider label={t("canvas.ps.bucketTolerance")} value={paint.tolerance} min={0} max={255} onChange={(value) => setPaint((prev) => ({ ...prev, tolerance: value }))} /> : null}
                    {tool === "wand" ? (
                        <>
                            <OptionToggle label={t("canvas.ps.selectContiguous")} checked={selectOptions.contiguous} onChange={(value) => setSelectOptions((prev) => ({ ...prev, contiguous: value }))} />
                            <OptionToggle label={t("canvas.ps.selectSampleAll")} checked={selectOptions.sampleAll} onChange={(value) => setSelectOptions((prev) => ({ ...prev, sampleAll: value }))} />
                        </>
                    ) : null}
                    {tool === "bucket" ? <OptionSlider label={t("canvas.ps.bucketTolerance")} value={paint.tolerance} min={0} max={255} onChange={(value) => setPaint((prev) => ({ ...prev, tolerance: value }))} /> : null}
                    {tool === "gradient" ? (
                        <>
                            <Segmented size="small" value={gradient.type} options={[{ label: t("canvas.ps.gradientLinear"), value: "linear" }, { label: t("canvas.ps.gradientRadial"), value: "radial" }]} onChange={(value) => setGradient((prev) => ({ ...prev, type: value as "linear" | "radial" }))} />
                            <Select size="small" className="w-28" value={gradient.mode} options={blendOptions} popupMatchSelectWidth={false} styles={{ popup: { root: { zIndex: 1300 } } }} aria-label={t("canvas.ps.gradientMode")} onChange={(value) => setGradient((prev) => ({ ...prev, mode: value }))} />
                            <OptionSlider label={t("canvas.ps.brushOpacity")} value={Math.round(gradient.opacity * 100)} min={1} max={100} suffix="%" onChange={(value) => setGradient((prev) => ({ ...prev, opacity: value / 100 }))} />
                            <OptionSlider label={t("canvas.ps.gradientStop")} value={Math.round(paint.stop * 100)} min={0} max={100} suffix="%" onChange={(value) => setPaint((prev) => ({ ...prev, stop: value / 100 }))} />
                            <OptionToggle label={t("canvas.ps.gradientReverse")} checked={gradient.reverse} onChange={(value) => setGradient((prev) => ({ ...prev, reverse: value }))} />
                        </>
                    ) : null}
                    {tool === "shape" ? (
                        <>
                            <Select size="small" className="w-28" value={shapeOptions.type} options={shapeTypeOptions} popupMatchSelectWidth={false} styles={{ popup: { root: { zIndex: 1300 } } }} aria-label={t("canvas.ps.shapeType")} onChange={(value) => setShapeOptions((prev) => ({ ...prev, type: value }))} />
                            <PsColorPicker value={shapeOptions.fill} ariaLabel={t("canvas.ps.shapeFill")} onChange={(hex) => setShapeOptions((prev) => ({ ...prev, fill: hex }))} />
                            <PsColorPicker value={shapeOptions.stroke} ariaLabel={t("canvas.ps.shapeStroke")} onChange={(hex) => setShapeOptions((prev) => ({ ...prev, stroke: hex }))} />
                            <OptionSlider label={t("canvas.ps.shapeStrokeWidth")} value={shapeOptions.strokeWidth} min={0} max={64} onChange={(value) => setShapeOptions((prev) => ({ ...prev, strokeWidth: value }))} />
                        </>
                    ) : null}
                    {COLOR_TOOLS.includes(tool) ? <PsColorPicker value={paint.color} ariaLabel={t("canvas.ps.color")} onChange={(hex) => setPaint((prev) => ({ ...prev, color: hex }))} /> : null}
                    {tool === "pen" || tool === "direct-select" || tool === "bucket" ? (
                        <span className="flex shrink-0 items-center gap-1.5">
                            <span>{t("canvas.ps.pathActive", { name: activePath?.name || t("canvas.ps.none") })}</span>
                            {pattern ? <span>{t("canvas.ps.patternActive", { name: pattern.name })}</span> : null}
                            <button type="button" className="rounded-md px-1.5 py-0.5 transition hover:bg-hover" onClick={() => setPattern(null)}>
                                {t("canvas.ps.patternClear")}
                            </button>
                        </span>
                    ) : null}
                    {transformMode ? (
                        <>
                            <Segmented size="small" value={transformMode} options={PS_TRANSFORM_MODES.map((mode) => ({ value: mode, label: t(`canvas.ps.transform.${mode}`) }))} onChange={(value) => setTransformMode(value as PsTransformMode)} />
                            <button type="button" className="shrink-0 rounded-md px-1.5 py-0.5 transition hover:bg-hover" onClick={() => setTransformMode(null)}>
                                {t("canvas.ps.transformDone")}
                            </button>
                        </>
                    ) : null}
                    {tool === "gradient" ? (
                        <>
                            <PsColorPicker value={paint.color} ariaLabel={t("canvas.ps.color")} onChange={(hex) => setPaint((prev) => ({ ...prev, color: hex }))} />
                            <PsColorPicker value={paint.background} ariaLabel={t("canvas.ps.gradientBackground")} onChange={(hex) => setPaint((prev) => ({ ...prev, background: hex }))} />
                        </>
                    ) : null}
                </ImageSettingsTheme>
                <span className="min-w-0 flex-1 truncate">{hint}</span>
                {viewFlags.snap ? (
                    <span className="flex shrink-0 items-center gap-1">
                        <Magnet className="size-3" />
                        {t("canvas.ps.viewSnap")}
                    </span>
                ) : null}
            </div>

            <DockArea defs={PS_DOCK_PANELS} layout={dock.layout} renderPanel={renderPsPanel} onActivate={dock.activate} onMove={dock.move} onResize={dock.resize}>
                <div className="thin-scrollbar flex shrink-0 flex-col items-center gap-0.5 overflow-y-auto px-1.5 py-1.5 glass-surface">
                    {TOOLS.map((item) => {
                        const Icon = item.icon;
                        const active = tool === item.id;
                        return (
                            <button
                                key={item.id}
                                type="button"
                                className={TOOL_CLASS}
                                style={active ? { background: theme.node.accentSoft, color: theme.node.accent, boxShadow: `inset 0 0 0 1px ${theme.node.accent}` } : { color: theme.node.muted }}
                                aria-label={`${t(item.labelKey)} (${item.hotkey})`}
                                title={`${t(item.labelKey)} (${item.hotkey})`}
                                onClick={() => setTool(item.id)}
                            >
                                <Icon className="size-4" />
                            </button>
                        );
                    })}
                    <span className="my-0.5 h-px w-5 shrink-0" style={{ background: theme.toolbar.border }} />
                    <button type="button" className={TOOL_CLASS} style={{ color: theme.node.muted }} aria-label={t("canvas.ps.zoomIn")} title={t("canvas.ps.zoomIn")} onClick={() => zoomBy(ZOOM_STEP)}>
                        <ZoomIn className="size-4" />
                    </button>
                    <button type="button" className={TOOL_CLASS} style={{ color: theme.node.muted }} aria-label={t("canvas.ps.zoomOut")} title={t("canvas.ps.zoomOut")} onClick={() => zoomBy(1 / ZOOM_STEP)}>
                        <ZoomOut className="size-4" />
                    </button>
                </div>

                <div
                    ref={containerRef}
                    className="relative min-h-0 min-w-0 flex-1 overflow-hidden"
                    style={{ background: theme.canvas.background, cursor: handMode ? "grab" : interacting ? "crosshair" : "default" }}
                    onPointerEnter={() => setCursorInside(true)}
                    onPointerLeave={() => setCursorInside(false)}
                    onPointerDown={(event) => {
                        if (handMode || event.target === event.currentTarget) beginPan(event);
                    }}
                    onPointerMove={(event) => {
                        moveCursor(event);
                        movePan(event);
                    }}
                    onPointerUp={endPan}
                    onPointerCancel={endPan}
                >
                    {ringTool && (cursorInside || Boolean(strokeLayer)) ? (
                        <div ref={cursorRef} className="pointer-events-none absolute left-0 top-0 rounded-full" style={{ width: paint.size * view.k, height: paint.size * view.k, border: `1px solid ${theme.node.text}`, opacity: 0 }} />
                    ) : null}
                    <div
                        className="absolute overflow-hidden"
                        style={{ left: view.x, top: view.y, width: board.width, height: board.height, transform: `scale(${view.k})`, transformOrigin: "0 0", isolation: "isolate", backgroundColor: backgroundFill }}
                        onPointerDown={(event) => {
                            if (handMode) {
                                beginPan(event);
                                return;
                            }
                            if (transformMode) return;
                            if (tool === "pen") {
                                beginPen(event);
                                return;
                            }
                            if (tool === "direct-select") {
                                beginDirectSelect(event);
                                return;
                            }
                            if (selecting) {
                                beginSelect(event);
                                return;
                            }
                            if (tool === "gradient") {
                                beginGradient(event);
                                return;
                            }
                            if (tool === "shape") {
                                beginShape(event);
                                return;
                            }
                            if (painting) {
                                beginPaint(event);
                                return;
                            }
                            if (event.target === event.currentTarget) beginPan(event);
                        }}
                        onPointerMove={(event) => {
                            movePan(event);
                            movePaint(event);
                            moveSelect(event);
                            moveGradient(event);
                            moveShape(event);
                            movePen(event, tool === "pen");
                        }}
                        onPointerUp={(event) => {
                            endPan(event);
                            finishPaint(event);
                            finishSelect(event);
                            void finishGradient(event);
                            void finishShape(event);
                            endPen(event);
                        }}
                        onPointerCancel={(event) => {
                            endPan(event);
                            finishPaint(event);
                            finishSelect(event);
                            void finishGradient(event);
                            void finishShape(event);
                            endPen(event);
                        }}
                    >
                        {viewFlags.grid ? <PsGrid theme={theme} view={view} /> : null}
                        <BoardLayersView board={viewBoard!} nodes={nodes} visited={visited} />
                        <PsChannelPreview board={viewBoard!} nodes={nodes} channel={channelView} />
                        {strokeLayer ? (
                            <canvas
                                ref={strokeCanvasRef}
                                width={psBitmapSize(strokeLayer.width)}
                                height={psBitmapSize(strokeLayer.height)}
                                className="pointer-events-none absolute"
                                style={{ ...layerBlendStyle(strokeLayer), ...psLayerFrame(strokeLayer) }}
                            />
                        ) : null}
                        {viewFlags.guides ? <PsGuides guides={guides} draft={guideDraft} theme={theme} onPointerDown={beginGuideDrag} onPointerMove={moveGuide} onPointerUp={endGuide} /> : null}
                        <PsMarchingAnts selection={selection} version={selectionVersion} width={board.width} height={board.height} theme={theme} visible={!gestureActive || Boolean(quickRef.current)} />
                        <PsDraftOverlay draft={draft} width={board.width} height={board.height} theme={theme} />
                        <PsSnapLines lines={snapLines} theme={theme} />
                        {(tool === "pen" || tool === "direct-select") && (penDraft ?? activePath) ? (
                            <PsPathOverlay
                                path={(penDraft ?? activePath)!}
                                theme={theme}
                                activeAnchor={-1}
                                interactive={tool === "direct-select"}
                                onAnchorPointerDown={(index, event) => beginDirectSelect(event)}
                                onHandlePointerDown={(index, kind, event) => beginDirectSelect(event)}
                                onPointerMove={(event) => movePen(event, false)}
                                onPointerUp={endPen}
                            />
                        ) : null}
                        {transformHandles.length ? <PsTransformHandles handles={transformHandles} theme={theme} onPointerDown={beginTransform} onPointerMove={moveTransform} onPointerUp={endTransform} /> : null}
                        {interacting || tool === "pen" || tool === "direct-select"
                            ? null
                            : ordered.map((layer) => (
                                  <div
                                      key={layer.id}
                                      className="absolute"
                                      style={{ ...layerFrame(layers, layer), cursor: layer.locked ? "default" : "move" }}
                                      onPointerDown={(event) => {
                                          setSelectedLayerId(layer.id);
                                          setMaskTargetId("");
                                          setMaskView(false);
                                          beginLayerGesture(event, layer, "move");
                                      }}
                                      onPointerMove={moveLayerGesture}
                                      onPointerUp={endLayerGesture}
                                      onPointerCancel={endLayerGesture}
                                      onDoubleClick={() => {
                                          if (layer.kind !== "text" || layer.locked) return;
                                          setEditingTextId(layer.id);
                                          setTextDraft(layer.text || "");
                                      }}
                                  />
                              ))}
                        {interacting || !selected || selected.hidden || selected.kind === "adjustment" ? null : (
                            <div
                                className="pointer-events-none absolute"
                                style={selected.kind === "group" ? { ...layerFrame(layers, selected), border: `1px solid ${theme.node.activeStroke}` } : { ...psLayerFrame(selected), border: `1px solid ${theme.node.activeStroke}` }}
                            >
                                {selected.locked
                                    ? null
                                    : CORNERS.map((corner) => (
                                          <div
                                              key={corner}
                                              className="pointer-events-auto absolute rounded-md"
                                              style={{
                                                  width: handleSize,
                                                  height: handleSize,
                                                  left: corner.includes("w") ? 0 : "100%",
                                                  top: corner.includes("n") ? 0 : "100%",
                                                  transform: "translate(-50%, -50%)",
                                                  background: theme.toolbar.panel,
                                                  border: `1px solid ${theme.node.activeStroke}`,
                                                  cursor: corner === "nw" || corner === "se" ? "nwse-resize" : "nesw-resize",
                                              }}
                                              onPointerDown={(event) => beginLayerGesture(event, selected, "resize", corner)}
                                              onPointerMove={moveLayerGesture}
                                              onPointerUp={endLayerGesture}
                                              onPointerCancel={endLayerGesture}
                                          />
                                      ))}
                                {selected.locked || selected.kind === "group" ? null : (
                                    <div
                                        className="pointer-events-auto absolute left-1/2 rounded-full"
                                        style={{ width: handleSize, height: handleSize, top: -ROTATE_SCREEN_OFFSET / view.k, transform: "translate(-50%, -50%)", background: theme.toolbar.panel, border: `1px solid ${theme.node.activeStroke}`, cursor: "grab" }}
                                        onPointerDown={(event) => beginLayerGesture(event, selected, "rotate")}
                                        onPointerMove={moveLayerGesture}
                                        onPointerUp={endLayerGesture}
                                        onPointerCancel={endLayerGesture}
                                    />
                                )}
                            </div>
                        )}
                        {editingLayer && textStyle ? (
                            <textarea
                                autoFocus
                                wrap="off"
                                value={textDraft}
                                className="absolute border-0 bg-transparent p-0"
                                style={{ ...layerFrame(layers, editingLayer), fontSize: textStyle.fontSize, lineHeight: textStyle.lineHeight, color: textStyle.color, whiteSpace: "pre", resize: "none", overflow: "hidden", outline: `1px dashed ${theme.node.activeStroke}` }}
                                onChange={(event) => setTextDraft(event.target.value)}
                                onBlur={commitText}
                            />
                        ) : null}
                    </div>
                    {viewFlags.rulers ? <PsRulers view={view} size={size} theme={theme} onGuidePointerDown={beginGuide} onGuidePointerMove={moveGuide} onGuidePointerUp={endGuide} /> : null}
                </div>

            </DockArea>
            {filterType ? (
                <PsFilterDialog
                    board={board}
                    setNodes={setNodes}
                    nodes={nodes}
                    layer={selected || null}
                    selection={selection ? { canvas: selection } : null}
                    type={filterType}
                    onClose={() => setFilterType("")}
                    onApplied={(type, params) => {
                        if (type !== "liquify") setLastFilter({ type, params: { ...params } });
                    }}
                />
            ) : null}
        </div>
    );
}

function OptionSlider({ label, value, min, max, suffix = "", onChange }: { label: string; value: number; min: number; max: number; suffix?: string; onChange: (value: number) => void }) {
    const theme = useCanvasTheme();
    return (
        <label className="flex shrink-0 items-center gap-1.5">
            <span className="shrink-0" style={{ color: theme.node.label }}>{label}</span>
            <Slider className="!mx-0 !w-24" min={min} max={max} step={1} value={value} tooltip={{ formatter: (input) => `${input}${suffix}` }} ariaLabelForHandle={label} onChange={onChange} />
            <span className="w-9 shrink-0 text-sm tabular-nums" style={{ color: theme.node.text }}>
                {value}
                {suffix}
            </span>
        </label>
    );
}

function OptionToggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
    const theme = useCanvasTheme();
    return (
        <label className="flex shrink-0 items-center gap-1.5">
            <span className="shrink-0" style={{ color: theme.node.label }}>{label}</span>
            <Switch size="small" checked={checked} onChange={onChange} />
        </label>
    );
}


