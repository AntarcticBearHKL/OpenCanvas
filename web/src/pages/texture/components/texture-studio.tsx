import { useCallback, useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { Dropdown, message, Modal, Progress, type MenuProps } from "antd";
import { ArrowLeft, Bookmark, ChevronDown, Download, LayoutGrid, Maximize, Redo2, Sparkles, Undo2, ZoomIn, ZoomOut } from "lucide-react";
import { useTranslation } from "react-i18next";

import { DockArea, useDockLayout } from "@/components/canvas/dock/dock-panel";
import { DockWindowMenu } from "@/components/canvas/dock/dock-window-menu";
import { STUDIO_BAR_CLASS, STUDIO_FLAT_BUTTON_CLASS, STUDIO_ICON_BUTTON_CLASS, STUDIO_MENU_BUTTON_CLASS } from "@/components/canvas/workspace/studio-chrome";
import { StudioOutputModal } from "@/components/studio/studio-output-modal";
import {
    disposeRenderer,
    downloadPng,
    exportGif,
    exportSheet,
    exportToCanvasNode,
    generateNormalMap,
    packChannels,
    renderStateToCanvas,
} from "@/lib/texture/export";
import { decodeTextureShare, TextureHistory } from "@/lib/texture/history";
import { defaultParams } from "@/lib/texture/registry";
import { TextureRenderer } from "@/lib/texture/renderer";
import { createDefaultLayer, type ChannelConfig, type EditorState, type LayerState } from "@/lib/texture/types";
import type { TextureProject } from "@/stores/use-texture-store";

import { ChannelPackDialog } from "./channel-pack-dialog";
import { EffectsPanel } from "./effects-panel";
import { GradientEditor } from "./gradient-editor";
import { LayerList } from "./layer-list";
import { OutputPanel } from "./output-panel";
import { ParamsPanel } from "./params-panel";
import { PresetLibraryModal } from "./preset-library-modal";
import { SamplesModal } from "./samples-modal";
import { SheetExportDialog, type SheetExportOptions } from "./sheet-export-dialog";
import { TEXTURE_DOCK_PANELS } from "./texture-studio-shared";
import { TypeBrowser } from "./type-browser";

function activeTypeOf(state: EditorState): string {
    const layer = state.layers.find((item) => item.id === state.activeLayerId) ?? state.layers[0];
    return layer?.type ?? "texture";
}

function downloadBlob(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.download = filename;
    link.href = url;
    link.click();
    URL.revokeObjectURL(url);
}

function downloadJson(data: unknown, filename: string): void {
    downloadBlob(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }), filename);
}

function exportErrorText(error: unknown): string {
    const reason = error instanceof Error ? error.message : String(error);
    if (reason === "SHEET_TOO_LARGE") return "Export failed: sheet exceeds 8192px";
    return `Export failed: ${reason}`;
}

const PREVIEW_RESOLUTION = 512;

type View = { x: number; y: number; k: number };

const MIN_ZOOM = 0.05;
const MAX_ZOOM = 64;

const clampZoom = (value: number) => Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, value));

const HISTORY_SETTLE_MS = 350;

const CHECKERBOARD: CSSProperties = {
    backgroundColor: "#ffffff",
    backgroundImage:
        "linear-gradient(45deg, #cccccc 25%, transparent 25%), linear-gradient(-45deg, #cccccc 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #cccccc 75%), linear-gradient(-45deg, transparent 75%, #cccccc 75%)",
    backgroundSize: "20px 20px",
    backgroundPosition: "0 0, 0 10px, 10px -10px, -10px 0px",
};

const MENU_POPUP: Pick<MenuProps, "className" | "style"> = { className: "glass-raised", style: { background: "var(--glass-strong)" } };

function normalizeState(next: EditorState): EditorState {
    const layers = next.layers.length > 0 ? next.layers : [createDefaultLayer(1)];
    const maxId = layers.reduce((max, layer) => Math.max(max, layer.id), 0);
    const layerCounter = Math.max(next.layerCounter || 0, maxId, 1);
    const activeLayerId = layers.some((layer) => layer.id === next.activeLayerId) ? next.activeLayerId : layers[layers.length - 1].id;
    return { ...next, layers, layerCounter, activeLayerId };
}

export function TextureStudio({
    project,
    onBack,
    onUpdate,
}: {
    project: TextureProject;
    onBack: () => void;
    onUpdate?: (patch: Partial<TextureProject>) => void;
}) {
    const { t } = useTranslation();
    const [state, setState] = useState<EditorState>(project.state);
    const stateRef = useRef<EditorState>(project.state);
    const onUpdateRef = useRef(onUpdate);
    onUpdateRef.current = onUpdate;

    const canvasRef = useRef<HTMLCanvasElement>(null);
    const rendererRef = useRef<TextureRenderer | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const [view, setView] = useState<View>({ x: 0, y: 0, k: 1 });
    const viewRef = useRef(view);
    viewRef.current = view;
    const panRef = useRef<{ pointerId: number; startX: number; startY: number; view: View } | null>(null);
    const [panning, setPanning] = useState(false);
    const [ready, setReady] = useState(false);
    const renderRafRef = useRef<number | null>(null);
    const commitRafRef = useRef<number | null>(null);
    const pendingRef = useRef<EditorState | null>(null);

    const historyRef = useRef<TextureHistory | null>(null);
    if (historyRef.current === null) historyRef.current = new TextureHistory(project.state);
    const historyTimerRef = useRef<number | null>(null);
    const [historyFlags, setHistoryFlags] = useState({ undo: false, redo: false });

    const [sheetOpen, setSheetOpen] = useState(false);
    const [channelOpen, setChannelOpen] = useState(false);
    const [outputOpen, setOutputOpen] = useState(false);
    const [gifOpen, setGifOpen] = useState(false);
    const [gifProgress, setGifProgress] = useState(0);
    const [browserOpen, setBrowserOpen] = useState(false);
    const [samplesOpen, setSamplesOpen] = useState(false);
    const [presetsOpen, setPresetsOpen] = useState(false);

    const dock = useDockLayout("texture-studio", TEXTURE_DOCK_PANELS);

    const requestRender = useCallback(() => {
        if (renderRafRef.current != null) return;
        renderRafRef.current = requestAnimationFrame(() => {
            renderRafRef.current = null;
            const renderer = rendererRef.current;
            if (!renderer || !renderer.ready) return;
            const current = stateRef.current;
            renderer.render({ ...current, resolution: PREVIEW_RESOLUTION }, current.layers);
        });
    }, []);

    const setZoomLevel = useCallback((level: number) => {
        const element = containerRef.current;
        if (!element) return;
        const width = element.clientWidth;
        const height = element.clientHeight;
        if (width === 0 || height === 0) return;
        const k = clampZoom(level);
        setView({ k, x: (width - PREVIEW_RESOLUTION * k) / 2, y: (height - PREVIEW_RESOLUTION * k) / 2 });
    }, []);

    const fitView = useCallback(() => {
        const element = containerRef.current;
        if (!element) return;
        setZoomLevel(Math.min((element.clientWidth - 48) / PREVIEW_RESOLUTION, (element.clientHeight - 48) / PREVIEW_RESOLUTION));
    }, [setZoomLevel]);

    const zoomAt = useCallback((clientX: number, clientY: number, factor: number) => {
        const element = containerRef.current;
        if (!element) return;
        const rect = element.getBoundingClientRect();
        setView((previous) => {
            const k = clampZoom(previous.k * factor);
            const ratio = k / previous.k;
            const mx = clientX - rect.left;
            const my = clientY - rect.top;
            return { k, x: mx - (mx - previous.x) * ratio, y: my - (my - previous.y) * ratio };
        });
    }, []);

    const zoomAtCenter = useCallback(
        (factor: number) => {
            const element = containerRef.current;
            if (!element) return;
            const rect = element.getBoundingClientRect();
            zoomAt(rect.left + rect.width / 2, rect.top + rect.height / 2, factor);
        },
        [zoomAt],
    );

    const onViewportPointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
        const middleButton = event.button === 1;
        const altLeft = event.button === 0 && event.altKey;
        if (!middleButton && !altLeft) return;
        if (middleButton) event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        panRef.current = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, view: viewRef.current };
        setPanning(true);
    }, []);

    const onViewportPointerMove = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
        const pan = panRef.current;
        if (!pan || pan.pointerId !== event.pointerId) return;
        setView({ ...pan.view, x: pan.view.x + (event.clientX - pan.startX), y: pan.view.y + (event.clientY - pan.startY) });
    }, []);

    const onViewportPointerUp = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
        const pan = panRef.current;
        if (!pan || pan.pointerId !== event.pointerId) return;
        panRef.current = null;
        setPanning(false);
        if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    }, []);

    useEffect(() => {
        const element = containerRef.current;
        if (!element) return;
        const onWheel = (event: WheelEvent) => {
            event.preventDefault();
            zoomAt(event.clientX, event.clientY, event.deltaY < 0 ? 1.25 : 0.8);
        };
        const onMouseDown = (event: MouseEvent) => {
            if (event.button === 1) event.preventDefault();
        };
        element.addEventListener("mousedown", onMouseDown);
        element.addEventListener("wheel", onWheel, { passive: false });
        return () => {
            element.removeEventListener("mousedown", onMouseDown);
            element.removeEventListener("wheel", onWheel);
        };
    }, [zoomAt]);

    useEffect(() => {
        const frame = requestAnimationFrame(fitView);
        return () => cancelAnimationFrame(frame);
    }, [fitView]);

    const syncHistoryFlags = useCallback(() => {
        const stack = historyRef.current;
        setHistoryFlags({ undo: stack ? stack.canUndo() : false, redo: stack ? stack.canRedo() : false });
    }, []);

    const cancelHistoryTimer = useCallback(() => {
        if (historyTimerRef.current != null) {
            window.clearTimeout(historyTimerRef.current);
            historyTimerRef.current = null;
        }
    }, []);

    const scheduleHistoryRecord = useCallback(() => {
        cancelHistoryTimer();
        historyTimerRef.current = window.setTimeout(() => {
            historyTimerRef.current = null;
            historyRef.current?.record(stateRef.current);
            syncHistoryFlags();
        }, HISTORY_SETTLE_MS);
    }, [cancelHistoryTimer, syncHistoryFlags]);

    const replaceState = useCallback(
        (next: EditorState) => {
            const normalized = normalizeState(structuredClone(next));
            stateRef.current = normalized;
            pendingRef.current = normalized;
            setState(normalized);
            onUpdateRef.current?.({ state: normalized });
            requestRender();
        },
        [requestRender],
    );

    const applyState = useCallback(
        (next: EditorState) => {
            const stack = historyRef.current;
            cancelHistoryTimer();
            stack?.record(stateRef.current);
            replaceState(next);
            stack?.record(stateRef.current);
            syncHistoryFlags();
        },
        [cancelHistoryTimer, replaceState, syncHistoryFlags],
    );

    const undo = useCallback(() => {
        const previous = historyRef.current?.undo();
        if (!previous) return;
        cancelHistoryTimer();
        replaceState(previous);
        syncHistoryFlags();
    }, [cancelHistoryTimer, replaceState, syncHistoryFlags]);

    const redo = useCallback(() => {
        const next = historyRef.current?.redo();
        if (!next) return;
        cancelHistoryTimer();
        replaceState(next);
        syncHistoryFlags();
    }, [cancelHistoryTimer, replaceState, syncHistoryFlags]);

    // All edits funnel through here: mutate immutably, coalesce into one rAF commit.
    const updateState = useCallback(
        (mutator: (previous: EditorState) => EditorState) => {
            const next = mutator(stateRef.current);
            stateRef.current = next;
            pendingRef.current = next;
            if (commitRafRef.current == null) {
                commitRafRef.current = requestAnimationFrame(() => {
                    commitRafRef.current = null;
                    const latest = pendingRef.current;
                    if (!latest) return;
                    setState(latest);
                    onUpdateRef.current?.({ state: latest });
                });
            }
            scheduleHistoryRecord();
            requestRender();
        },
        [requestRender, scheduleHistoryRecord],
    );

    // Adopt external state when the open project changes.
    useEffect(() => {
        stateRef.current = project.state;
        pendingRef.current = project.state;
        setState(project.state);
        cancelHistoryTimer();
        historyRef.current?.reset(project.state);
        syncHistoryFlags();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [project.id]);

    // Create the WebGL2 renderer once; dispose on unmount.
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const renderer = new TextureRenderer(canvas);
        rendererRef.current = renderer;
        setReady(renderer.ready);
        // StrictMode's mount/remount can drop the rAF-triggered first paint, so render once synchronously.
        if (renderer.ready) renderer.render({ ...stateRef.current, resolution: PREVIEW_RESOLUTION }, stateRef.current.layers);
        requestRender();
        return () => {
            if (renderRafRef.current != null) {
                cancelAnimationFrame(renderRafRef.current);
                renderRafRef.current = null;
            }
            renderer.dispose();
            rendererRef.current = null;
        };
    }, [requestRender]);

    useEffect(() => {
        if (ready) requestRender();
    }, [ready, requestRender]);

    useEffect(() => {
        requestRender();
    }, [state, requestRender]);

    // Animation loop: advance time and re-render while enabled.
    useEffect(() => {
        if (!state.animate) return;
        let raf = 0;
        let last = performance.now();
        let lastUi = last;
        const loop = (now: number) => {
            const delta = Math.min(0.1, (now - last) / 1000);
            last = now;
            const current = stateRef.current;
            const next = { ...current, time: current.time + delta * current.animSpeed };
            stateRef.current = next;
            pendingRef.current = next;
            requestRender();
            if (now - lastUi > 100) {
                lastUi = now;
                setState(next);
            }
            raf = requestAnimationFrame(loop);
        };
        raf = requestAnimationFrame(loop);
        return () => {
            cancelAnimationFrame(raf);
            onUpdateRef.current?.({ state: stateRef.current });
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [state.animate, requestRender]);

    useEffect(() => {
        const onKeyDown = (event: KeyboardEvent) => {
            if (!event.ctrlKey && !event.metaKey) return;
            const target = event.target;
            if (target instanceof HTMLElement && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
            const key = event.key.toLowerCase();
            if (key === "z" && !event.shiftKey) {
                event.preventDefault();
                undo();
            } else if (key === "y" || (key === "z" && event.shiftKey)) {
                event.preventDefault();
                redo();
            }
        };
        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, [undo, redo]);

    useEffect(() => {
        const { hash } = window.location;
        if (!hash.startsWith("#tc=")) return;
        const shared = decodeTextureShare(hash.slice(4));
        if (shared) {
            applyState(shared);
            message.success("Shared state loaded");
        } else {
            message.error("Invalid share link");
        }
        window.history.replaceState(null, "", window.location.pathname + window.location.search);
    }, [applyState]);

    const activeLayer = state.layers.find((layer) => layer.id === state.activeLayerId) ?? state.layers[0];
    const activeType = activeLayer?.type ?? "texture";

    const renderPixels = useCallback(() => {
        const current = stateRef.current;
        const canvas = document.createElement("canvas");
        canvas.width = current.resolution;
        canvas.height = current.resolution;
        const renderer = new TextureRenderer(canvas);
        renderer.render(current, current.layers);
        const pixels = renderer.readPixels();
        return { ...pixels, dispose: () => renderer.dispose() };
    }, []);

    const handleExportPng = useCallback(() => {
        const current = stateRef.current;
        let canvas: HTMLCanvasElement | null = null;
        try {
            canvas = renderStateToCanvas(current, current.layers);
            downloadPng(canvas, `texture_${activeTypeOf(current)}_${current.resolution}px.png`);
            message.success("PNG exported");
        } catch (error) {
            message.error(exportErrorText(error));
        } finally {
            if (canvas) disposeRenderer(canvas);
        }
    }, []);

    const handleExportNormal = useCallback(() => {
        let pixels: ReturnType<typeof renderPixels> | null = null;
        try {
            const current = stateRef.current;
            pixels = renderPixels();
            const normal = generateNormalMap(pixels);
            downloadPng(normal, `normal_${activeTypeOf(current)}_${current.resolution}px.png`);
            message.success("Normal map exported");
        } catch (error) {
            message.error(exportErrorText(error));
        } finally {
            pixels?.dispose();
        }
    }, [renderPixels]);

    const handleChannelConfirm = useCallback(
        (config: ChannelConfig) => {
            let pixels: ReturnType<typeof renderPixels> | null = null;
            try {
                const current = stateRef.current;
                pixels = renderPixels();
                const normalContext = generateNormalMap(pixels).getContext("2d");
                if (!normalContext) throw new Error("CHANNEL_CONTEXT_UNAVAILABLE");
                const normalImage = normalContext.getImageData(0, 0, pixels.width, pixels.height);
                const packed = packChannels(pixels, { data: new Uint8Array(normalImage.data.buffer), width: pixels.width, height: pixels.height }, config);
                downloadPng(packed, `channelpack_${activeTypeOf(current)}_${current.resolution}px.png`);
                message.success("Channel pack exported");
            } catch (error) {
                message.error(exportErrorText(error));
            } finally {
                pixels?.dispose();
                setChannelOpen(false);
            }
        },
        [renderPixels],
    );

    const handleSheetConfirm = useCallback((config: SheetExportOptions) => {
        try {
            const current = stateRef.current;
            const suffix = `${activeTypeOf(current)}_${current.resolution}px`;
            const { canvas, metadata } = exportSheet(current, current.layers, config);
            downloadPng(canvas, `sheet_${suffix}.png`);
            if (config.saveMetadata) {
                downloadJson({ ...metadata, image: { ...metadata.image, file: `sheet_${suffix}.png` } }, `sheet_${suffix}.json`);
            }
            message.success("Sheet exported");
            setSheetOpen(false);
        } catch (error) {
            message.error(exportErrorText(error));
        }
    }, []);

    const handleExportGif = useCallback(() => {
        const current = stateRef.current;
        setGifProgress(0);
        setGifOpen(true);
        try {
            exportGif(
                current,
                current.layers,
                (pct) => setGifProgress(pct),
                (blob) => {
                    if (blob) {
                        downloadBlob(blob, `texture_anim_${current.resolution}px.gif`);
                        message.success("GIF exported");
                    } else {
                        message.error("Export failed: GIF encoding failed");
                    }
                    setGifOpen(false);
                },
            );
        } catch (error) {
            message.error(exportErrorText(error));
            setGifOpen(false);
        }
    }, []);

    const handleDownload = useCallback((fileName: string) => {
        const current = stateRef.current;
        let canvas: HTMLCanvasElement | null = null;
        try {
            canvas = renderStateToCanvas(current, current.layers);
            downloadPng(canvas, fileName.endsWith(".png") ? fileName : `${fileName}.png`);
            message.success("PNG exported");
        } catch (error) {
            message.error(exportErrorText(error));
        } finally {
            if (canvas) disposeRenderer(canvas);
        }
    }, []);

    const handleOutputToCanvas = useCallback(async (targetCanvasId: string, nodeTitle: string) => {
        const current = stateRef.current;
        try {
            await exportToCanvasNode(current, current.layers, targetCanvasId, nodeTitle);
            message.success("Saved to canvas");
        } catch (error) {
            message.error(exportErrorText(error));
        }
    }, []);

    const exportMenu: MenuProps = {
        items: [
            { key: "png", label: "Export PNG" },
            { key: "normal", label: "Export Normal Map" },
            { key: "channel", label: "Channel Pack" },
            { key: "sheet", label: "Sprite Sheet" },
            { key: "gif", label: "Export GIF" },
            { type: "divider" },
            { key: "canvas", label: "Save to Canvas" },
        ],
        onClick: ({ key }) => {
            if (key === "png") handleExportPng();
            else if (key === "normal") handleExportNormal();
            else if (key === "channel") setChannelOpen(true);
            else if (key === "sheet") setSheetOpen(true);
            else if (key === "gif") handleExportGif();
            else if (key === "canvas") setOutputOpen(true);
        },
    };

    const updateLayer = useCallback(
        (patch: Partial<LayerState>) => {
            updateState((previous) => ({
                ...previous,
                layers: previous.layers.map((layer) => (layer.id === previous.activeLayerId ? { ...layer, ...patch } : layer)),
            }));
        },
        [updateState],
    );

    const selectLayer = (id: number) => updateState((previous) => ({ ...previous, activeLayerId: id }));
    const toggleVisible = (id: number) =>
        updateState((previous) => ({
            ...previous,
            layers: previous.layers.map((layer) => (layer.id === id ? { ...layer, visible: !layer.visible } : layer)),
        }));
    const addLayer = () =>
        updateState((previous) => {
            const nextId = previous.layerCounter + 1;
            return { ...previous, layerCounter: nextId, activeLayerId: nextId, layers: [...previous.layers, createDefaultLayer(nextId, "Circle")] };
        });
    const deleteLayer = (id: number) =>
        updateState((previous) => {
            if (previous.layers.length <= 1) return previous;
            const layers = previous.layers.filter((layer) => layer.id !== id);
            const activeLayerId = previous.activeLayerId === id ? layers[layers.length - 1].id : previous.activeLayerId;
            return { ...previous, layers, activeLayerId };
        });
    const moveLayer = (id: number, direction: 1 | -1) =>
        updateState((previous) => {
            const index = previous.layers.findIndex((layer) => layer.id === id);
            const target = index + direction;
            if (index < 0 || target < 0 || target >= previous.layers.length) return previous;
            const layers = previous.layers.slice();
            const [moved] = layers.splice(index, 1);
            layers.splice(target, 0, moved);
            return { ...previous, layers };
        });

    const toggleBlackBackground = (checked: boolean) => updateState((previous) => ({ ...previous, blackBackground: checked }));
    const toggleCheckerboard = (checked: boolean) => updateState((previous) => ({ ...previous, checkerboard: checked }));

    const patchState = useCallback((patch: Partial<EditorState>) => updateState((previous) => ({ ...previous, ...patch })), [updateState]);
    const patchPost = useCallback((patch: Partial<EditorState["postEffects"]>) => updateState((previous) => ({ ...previous, postEffects: { ...previous.postEffects, ...patch } })), [updateState]);

    const editItems: MenuProps["items"] = [
        { key: "undo", label: "Undo (Ctrl+Z)", disabled: !historyFlags.undo, icon: <Undo2 className="size-3.5" /> },
        { key: "redo", label: "Redo (Ctrl+Shift+Z)", disabled: !historyFlags.redo, icon: <Redo2 className="size-3.5" /> },
        { type: "divider" },
        { key: "reset-transform", label: "Reset Transform" },
        { key: "reset-params", label: "Reset Parameters" },
    ];

    const viewItems: MenuProps["items"] = [
        { key: "black", label: `${state.blackBackground ? "✓ " : ""}Black Background` },
        { key: "checker", label: `${state.checkerboard ? "✓ " : ""}Checkerboard` },
        { type: "divider" },
        { key: "zoom-in", label: "Zoom In", icon: <ZoomIn className="size-3.5" /> },
        { key: "zoom-out", label: "Zoom Out", icon: <ZoomOut className="size-3.5" /> },
        { key: "fit", label: "Fit to Window", icon: <Maximize className="size-3.5" /> },
        { key: "actual", label: "Actual Size" },
        { type: "divider" },
        { key: "browser", label: "Browse Types", icon: <LayoutGrid className="size-3.5" /> },
        { key: "samples", label: "Built-in Samples", icon: <Sparkles className="size-3.5" /> },
        { key: "presets", label: "Preset Library", icon: <Bookmark className="size-3.5" /> },
    ];

    const renderMenu = (label: string, items: MenuProps["items"], onClick: MenuProps["onClick"]) => (
        <Dropdown key={label} menu={{ ...MENU_POPUP, items, onClick }} placement="bottomLeft" styles={{ root: { zIndex: 1300 } }}>
            <button type="button" className={STUDIO_MENU_BUTTON_CLASS}>
                {label}
                <ChevronDown className="size-3" />
            </button>
        </Dropdown>
    );

    const renderPanel = (id: string): ReactNode => {
        const body =
            id === "layers" ? (
                <LayerList
                    layers={state.layers}
                    activeLayerId={state.activeLayerId}
                    onSelect={selectLayer}
                    onToggleVisible={toggleVisible}
                    onAdd={addLayer}
                    onDelete={deleteLayer}
                    onMove={moveLayer}
                />
            ) : id === "params" ? (
                activeLayer ? <ParamsPanel layer={activeLayer} onChange={updateLayer} /> : null
            ) : id === "output" ? (
                <OutputPanel state={state} onChange={patchState} />
            ) :             id === "effects" ? (
                <EffectsPanel state={state} onPostChange={patchPost} />
            ) : id === "gradient" ? (
                activeLayer ? <GradientEditor layer={activeLayer} onChange={updateLayer} /> : null
            ) : null;
        return <div className="thin-scrollbar min-h-0 flex-1 overflow-y-auto">{body}</div>;
    };

    return (
        <div className="flex h-full min-h-0 flex-1 flex-col bg-background text-foreground">
            <div className={`${STUDIO_BAR_CLASS} h-11 glass-surface border-b border-border`}>
                <button
                    type="button"
                    onClick={onBack}
                    aria-label={t("textureStudio.back")}
                    title={t("textureStudio.back")}
                    className={`${STUDIO_ICON_BUTTON_CLASS} text-muted-foreground hover:text-foreground`}
                >
                    <ArrowLeft className="size-4" />
                </button>
                <h1 className="min-w-0 max-w-[220px] truncate text-sm font-semibold text-foreground" style={{ margin: 0 }}>
                    {project.title}
                </h1>
                <span className="h-5 w-px shrink-0 bg-border" />
                {renderMenu("Edit", editItems, ({ key }) => {
                    if (key === "undo") undo();
                    else if (key === "redo") redo();
                    else if (key === "reset-transform") updateLayer({ offsetX: 0, offsetY: 0, scaleX: 1, scaleY: 1, rotation: 0, scrollX: 0, scrollY: 0 });
                    else if (key === "reset-params" && activeLayer) updateLayer({ typeParams: defaultParams(activeLayer.type) });
                })}
                {renderMenu("View", viewItems, ({ key }) => {
                    if (key === "black") toggleBlackBackground(!state.blackBackground);
                    else if (key === "checker") toggleCheckerboard(!state.checkerboard);
                    else if (key === "zoom-in") zoomAtCenter(1.25);
                    else if (key === "zoom-out") zoomAtCenter(0.8);
                    else if (key === "fit") fitView();
                    else if (key === "actual") setZoomLevel(1);
                    else if (key === "browser") setBrowserOpen(true);
                    else if (key === "samples") setSamplesOpen(true);
                    else if (key === "presets") setPresetsOpen(true);
                })}
                <DockWindowMenu defs={TEXTURE_DOCK_PANELS} layout={dock.layout} onToggle={dock.toggle} onReset={dock.reset} />
                <div className="ml-auto flex items-center gap-1.5">
                    <Dropdown menu={{ ...MENU_POPUP, ...exportMenu }} trigger={["click"]} placement="bottomRight">
                        <button type="button" className={`${STUDIO_FLAT_BUTTON_CLASS} text-muted-foreground hover:text-foreground`}>
                            <Download className="size-3.5" />
                            Export
                            <ChevronDown className="size-3" />
                        </button>
                    </Dropdown>
                </div>
            </div>

            <DockArea defs={TEXTURE_DOCK_PANELS} layout={dock.layout} renderPanel={renderPanel} onActivate={dock.activate} onMove={dock.move} onResize={dock.resize} onSplit={dock.split}>
                <div className="relative min-h-0 min-w-0 flex-1 overflow-hidden">
                    <div
                        ref={containerRef}
                        className={`absolute inset-0 overflow-hidden ${panning ? "cursor-grabbing" : "cursor-default"}`}
                        style={{ background: "rgba(127,127,127,0.06)" }}
                        onPointerDown={onViewportPointerDown}
                        onPointerMove={onViewportPointerMove}
                        onPointerUp={onViewportPointerUp}
                        onPointerCancel={onViewportPointerUp}
                    >
                        <div className="absolute" style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.k})`, transformOrigin: "0 0" }}>
                            <div
                                style={
                                    state.checkerboard
                                        ? { width: PREVIEW_RESOLUTION, height: PREVIEW_RESOLUTION, ...CHECKERBOARD }
                                        : { width: PREVIEW_RESOLUTION, height: PREVIEW_RESOLUTION }
                                }
                            >
                                <canvas ref={canvasRef} width={PREVIEW_RESOLUTION} height={PREVIEW_RESOLUTION} className="block" />
                            </div>
                        </div>
                    </div>
                    <div className="pointer-events-none absolute inset-0 flex items-end justify-end p-3">
                        <div className="glass-surface pointer-events-auto flex items-center gap-0.5 rounded-md border border-border px-1 py-0.5 text-xs text-muted-foreground">
                            <button type="button" onClick={() => zoomAtCenter(0.8)} title="Zoom Out" className="grid size-6 place-items-center rounded transition hover:bg-hover hover:text-foreground">
                                <ZoomOut className="size-3.5" />
                            </button>
                            <span className="w-10 text-center tabular-nums">{Math.round(view.k * 100)}%</span>
                            <button type="button" onClick={() => zoomAtCenter(1.25)} title="Zoom In" className="grid size-6 place-items-center rounded transition hover:bg-hover hover:text-foreground">
                                <ZoomIn className="size-3.5" />
                            </button>
                            <button type="button" onClick={fitView} title="Fit to Window" className="grid size-6 place-items-center rounded transition hover:bg-hover hover:text-foreground">
                                <Maximize className="size-3.5" />
                            </button>
                        </div>
                    </div>
                </div>
            </DockArea>

            <TypeBrowser
                open={browserOpen}
                onClose={() => setBrowserOpen(false)}
                currentType={activeType}
                onSelect={(type) => updateLayer({ type, typeParams: defaultParams(type) })}
            />
            <SamplesModal open={samplesOpen} onClose={() => setSamplesOpen(false)} onApply={applyState} />
            <PresetLibraryModal open={presetsOpen} onClose={() => setPresetsOpen(false)} currentState={state} onApply={applyState} />
            <SheetExportDialog open={sheetOpen} onClose={() => setSheetOpen(false)} onConfirm={handleSheetConfirm} />
            <ChannelPackDialog open={channelOpen} onClose={() => setChannelOpen(false)} onConfirm={handleChannelConfirm} />
            <StudioOutputModal
                open={outputOpen}
                onClose={() => setOutputOpen(false)}
                title="Export Texture"
                resourceType="image"
                defaultFileName={`texture_${activeType}_${state.resolution}px.png`}
                defaultNodeTitle={project.title}
                onDownload={handleDownload}
                onOutputToCanvas={handleOutputToCanvas}
            />
            <Modal open={gifOpen} footer={null} closable={false} mask={{ closable: false }} centered width={360} title="Export GIF">
                <div className="space-y-3 py-2">
                    <Progress percent={gifProgress} status={gifProgress >= 100 ? "success" : "active"} />
                    <p className="text-xs text-muted-foreground">Rendering animation frames and encoding GIF, please wait…</p>
                </div>
            </Modal>
        </div>
    );
}
