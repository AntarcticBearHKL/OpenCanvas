import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { App, Dropdown, InputNumber, Select, Slider, Tooltip, type MenuProps } from "antd";
import { ArrowLeft, ChevronDown, Circle, Copy, Download, Eraser, Eye, EyeOff, Film, FlipHorizontal2, FlipVertical2, Hand, ImagePlus, Layers, Maximize, Minus, MonitorPlay, Move, PaintBucket, Palette, Pause, Pencil, Pipette, Play, Plus, Redo2, Settings2, Square, SquareDashed, Trash2, Undo2, Wrench, ZoomIn, ZoomOut } from "lucide-react";
import { saveAs } from "file-saver";

import { DockArea, useDockLayout } from "@/components/canvas/dock/dock-panel";
import { DockWindowMenu } from "@/components/canvas/dock/dock-window-menu";
import type { DockPanelDef } from "@/components/canvas/dock/dock-layout";
import { STUDIO_MENU_BUTTON_CLASS } from "@/components/canvas/workspace/studio-chrome";
import i18n from "@/i18n";
import { registerAgentNamespace } from "@/lib/agent/action-registry";
import { registerScreenshotProvider } from "@/lib/agent/screenshot-registry";
import type { AgentOp } from "@/lib/agent/agent-ops";
import { applyPixelAgentOps, PIXEL_AGENT_ASYNC_TYPES, PIXEL_AGENT_OP_TYPES, PIXEL_AGENT_SCHEMA, type PixelAgentOp } from "@/lib/canvas/pixel-agent-ops";
import { addPixelFrame, addPixelLayer, duplicatePixelFrame, movePixelFrame, movePixelLayer, patchPixelFrame, patchPixelLayer, removePixelFrame, removePixelLayer, setDocBackground, setDocFps, setDocSize, setFrameCel, setPalette } from "@/lib/canvas/pixel/document";
import { createPixelHistory } from "@/lib/canvas/pixel/history";
import { blobToBuffer, bufferToCanvas, bufferToDataUrl, bufferToPngBlob, canvasToBuffer, importImageToBuffer, regionToPngDataUrl } from "@/lib/canvas/pixel/io";
import { blit, compositeLayers, drawEllipse, drawLine, drawRect, extractRegion, floodFill, getPixel, hexToRgba, makeBuffer, resizeNearest, rgbaToHex, setPixel, type Rgba } from "@/lib/canvas/pixel/raster";
import { resolveImageUrl, uploadImage } from "@/services/image-storage";
import type { PixelProject } from "@/stores/use-pixel-store";
import type { CanvasPixelBlend, CanvasPixelDoc } from "@/types/canvas";

export type PixelStudioImageSource = { id: string; title: string; storageKey?: string; content?: string };

type PixelStudioProps = {
    project: PixelProject;
    images: PixelStudioImageSource[];
    onUpdate: (patch: Partial<PixelProject>) => void;
    onBack: () => void;
};

type PixelTool = "pencil" | "eraser" | "bucket" | "line" | "rect" | "ellipse" | "eyedropper" | "select" | "move" | "hand";
type Point = { x: number; y: number };
type Rect = { x: number; y: number; w: number; h: number };
type View = { x: number; y: number; k: number };
type Draft = { canvas: HTMLCanvasElement } | null;

const PREVIEW_LIMIT = 1_048_576;
const RENDER_LIMIT = 8_388_608;
const BLENDS: CanvasPixelBlend[] = ["normal", "multiply", "screen", "overlay", "add"];
const BLEND_LABELS: Record<CanvasPixelBlend, string> = { normal: "Normal", multiply: "Multiply", screen: "Screen", overlay: "Overlay", add: "Add" };
const TOOLS: { id: PixelTool; icon: typeof Pencil; label: string; hotkey: string }[] = [
    { id: "pencil", icon: Pencil, label: "Pencil", hotkey: "B" },
    { id: "eraser", icon: Eraser, label: "Eraser", hotkey: "E" },
    { id: "bucket", icon: PaintBucket, label: "Bucket", hotkey: "G" },
    { id: "line", icon: Minus, label: "Line", hotkey: "L" },
    { id: "rect", icon: Square, label: "Rect", hotkey: "U" },
    { id: "ellipse", icon: Circle, label: "Ellipse", hotkey: "O" },
    { id: "eyedropper", icon: Pipette, label: "Eyedropper", hotkey: "I" },
    { id: "select", icon: SquareDashed, label: "Select", hotkey: "M" },
    { id: "move", icon: Move, label: "Move", hotkey: "V" },
    { id: "hand", icon: Hand, label: "Hand", hotkey: "H" },
];
const TOOL_HOTKEYS: Record<string, PixelTool> = Object.fromEntries(TOOLS.map((item) => [item.hotkey.toLowerCase(), item.id]));
const PIXEL_DOCK_PANELS: DockPanelDef[] = [
    { id: "tools", labelKey: "Tools", icon: Wrench, dock: "left" },
    { id: "palette", labelKey: "Palette", icon: Palette, dock: "left" },
    { id: "layers", labelKey: "Layers", icon: Layers, dock: "right" },
    { id: "frames", labelKey: "Frames", icon: Film, dock: "right" },
    { id: "properties", labelKey: "Properties", icon: Settings2, dock: "right" },
    { id: "preview", labelKey: "Preview", icon: MonitorPlay, dock: "bottom" },
];
const celKey = (frameId: string, layerId: string) => `${frameId}:${layerId}`;
const clampZoom = (value: number) => Math.max(0.05, Math.min(64, value));
const nextZoom = (previous: number, factor: number) => (factor > 1 ? (previous < 1 ? Math.min(1, previous * 2) : previous + Math.max(1, Math.round(previous * 0.25))) : previous <= 1 ? Math.max(0.05, previous / 2) : Math.max(1, previous - Math.max(1, Math.round(previous * 0.25))));
const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

export default function PixelStudio({ project, images, onUpdate, onBack }: PixelStudioProps) {
    const { message } = App.useApp();
    const doc = project.doc;
    const docRef = useRef<CanvasPixelDoc>(doc);
    docRef.current = doc;

    const containerRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const previewRef = useRef<HTMLCanvasElement>(null);
    const snapRef = useRef<HTMLCanvasElement>(null);
    const checkerOverlayRef = useRef<HTMLDivElement>(null);
    const docCanvasRef = useRef<HTMLCanvasElement | null>(null);
    const gestureRef = useRef<{ base: View; next: View | null; active: boolean; zoomTimer: number | null }>({ base: { x: 0, y: 0, k: 1 }, next: null, active: false, zoomTimer: null });
    const checkerRef = useRef<CanvasPattern | null>(null);
    const buffersRef = useRef(new Map<string, Uint8ClampedArray>());
    const pendingRef = useRef(new Map<string, Promise<Uint8ClampedArray>>());
    const dirtyRef = useRef(new Set<string>());
    const historyRef = useRef(createPixelHistory<CanvasPixelDoc>());
    const draftRef = useRef<Draft>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const [, force] = useState(0);
    const bumpRef = useRef(() => undefined as void);
    const bump = useCallback(() => force((version) => version + 1), []);
    bumpRef.current = bump;

    const [activeFrameId, setActiveFrameId] = useState(doc.frames[0]?.id ?? "");
    const [activeLayerId, setActiveLayerId] = useState(doc.layers.at(-1)?.id ?? "");
    const [tool, setTool] = useState<PixelTool>("pencil");
    const [color, setColor] = useState(doc.palette[0] ?? "#000000");
    const [brushSize, setBrushSize] = useState(1);
    const [tolerance, setTolerance] = useState(0);
    const [filled, setFilled] = useState(true);
    const [symmetryX, setSymmetryX] = useState(false);
    const [symmetryY, setSymmetryY] = useState(false);
    const [showGrid, setShowGrid] = useState(false);
    const [spaceHeld, setSpaceHeld] = useState(false);
    const [playing, setPlaying] = useState(false);
    const [selection, setSelection] = useState<Rect | null>(null);
    const [view, setView] = useState<View>({ x: 0, y: 0, k: 1 });
    const viewRef = useRef(view);
    viewRef.current = view;
    const [size, setSize] = useState({ w: 0, h: 0 });
    const [importFit, setImportFit] = useState<"contain" | "stretch" | "nearest">("contain");
    const [sizeW, setSizeW] = useState(doc.width);
    const [sizeH, setSizeH] = useState(doc.height);
    const [customBg, setCustomBg] = useState("#ffffff");
    const dock = useDockLayout("pixel-studio", PIXEL_DOCK_PANELS);

    const panRef = useRef<{ pointerId: number; startX: number; startY: number; view: View } | null>(null);
    const paintRef = useRef<{ pointerId: number; tool: PixelTool; frameId: string; layerId: string; start: Point; last: Point; current: Point } | null>(null);
    const selectRef = useRef<{ pointerId: number; start: Point; current: Point } | null>(null);
    const moveRef = useRef<{ pointerId: number; start: Point; orig: Uint8ClampedArray; region: Uint8ClampedArray; rect: Rect; dx: number; dy: number } | null>(null);
    const fittedRef = useRef("");
    const actionsRef = useRef({ undo: () => undefined as void, redo: () => undefined as void, flush: () => undefined as void });
    const applyOpsRef = useRef<(ops: AgentOp[]) => Record<string, unknown> | void>(() => undefined);

    const persist = useCallback(
        (next: CanvasPixelDoc) => {
            docRef.current = next;
            onUpdate({ doc: next });
        },
        [onUpdate],
    );

    const loadCel = useCallback((frameId: string, layerId: string) => {
        const key = celKey(frameId, layerId);
        const cached = buffersRef.current.get(key);
        if (cached) return Promise.resolve(cached);
        const pending = pendingRef.current.get(key);
        if (pending) return pending;
        const { width, height } = docRef.current;
        const cel = docRef.current.frames.find((frame) => frame.id === frameId)?.cels[layerId];
        const promise = (async () => {
            let buffer: Uint8ClampedArray | null = null;
            if (cel?.storageKey) {
                try {
                    const url = await resolveImageUrl(cel.storageKey);
                    if (url) buffer = await blobToBuffer(await (await fetch(url)).blob(), width, height);
                } catch {
                    buffer = null;
                }
            }
            if (!buffer) buffer = makeBuffer(width, height);
            buffersRef.current.set(key, buffer);
            bumpRef.current();
            return buffer;
        })().finally(() => pendingRef.current.delete(key));
        pendingRef.current.set(key, promise);
        return promise;
    }, []);

    const flushDirty = useCallback(async () => {
        const keys = Array.from(dirtyRef.current);
        dirtyRef.current.clear();
        if (!keys.length) return;
        let next = docRef.current;
        const { width, height } = next;
        for (const key of keys) {
            const [frameId, layerId] = key.split(":");
            const buffer = buffersRef.current.get(key);
            if (!buffer) continue;
            try {
                const uploaded = await uploadImage(await bufferToPngBlob(buffer, width, height));
                if (uploaded.storageKey) next = setFrameCel(next, frameId, layerId, uploaded.storageKey);
            } catch {
                // Keep the previous cel on upload failure; the in-memory edit stays until the next commit.
            }
        }
        persist(next);
        historyRef.current.push(next);
        bump();
    }, [persist]);
    actionsRef.current.flush = () => void flushDirty();

    const undo = useCallback(() => {
        const previous = historyRef.current.undo();
        if (!previous) return;
        persist(previous);
        buffersRef.current.clear();
        pendingRef.current.clear();
        docCanvasRef.current = null;
        bump();
    }, [persist]);
    const redo = useCallback(() => {
        const next = historyRef.current.redo();
        if (!next) return;
        persist(next);
        buffersRef.current.clear();
        pendingRef.current.clear();
        docCanvasRef.current = null;
        bump();
    }, [persist]);
    actionsRef.current.undo = undo;
    actionsRef.current.redo = redo;

    const applyDoc = useCallback(
        (next: CanvasPixelDoc) => {
            persist(next);
            historyRef.current.push(next);
            bump();
        },
        [persist],
    );

    const clearActiveLayer = useCallback(() => {
        const buffer = buffersRef.current.get(celKey(activeFrameId, activeLayerId));
        if (!buffer) return;
        buffer.fill(0);
        dirtyRef.current.add(celKey(activeFrameId, activeLayerId));
        void flushDirty();
        bump();
    }, [activeFrameId, activeLayerId, flushDirty]);

    useEffect(() => {
        historyRef.current = createPixelHistory<CanvasPixelDoc>();
        historyRef.current.reset(docRef.current);
        buffersRef.current.clear();
        pendingRef.current.clear();
        draftRef.current = null;
        setSelection(null);
        setActiveFrameId(docRef.current.frames[0]?.id ?? "");
        setActiveLayerId(docRef.current.layers.at(-1)?.id ?? "");
        setSizeW(docRef.current.width);
        setSizeH(docRef.current.height);
    }, [project.id]);

    useEffect(() => {
        if (!doc.frames.some((frame) => frame.id === activeFrameId)) setActiveFrameId(doc.frames[0]?.id ?? "");
        if (!doc.layers.some((layer) => layer.id === activeLayerId)) setActiveLayerId(doc.layers.at(-1)?.id ?? "");
    }, [doc, activeFrameId, activeLayerId]);

    useEffect(() => {
        const element = containerRef.current;
        if (!element) return;
        const observer = new ResizeObserver((entries) => {
            const rect = entries[0]?.contentRect;
            if (rect) setSize({ w: rect.width, h: rect.height });
        });
        observer.observe(element);
        return () => observer.disconnect();
    }, []);

    useEffect(() => {
        const canvas = document.createElement("canvas");
        canvas.width = 16;
        canvas.height = 16;
        const context = canvas.getContext("2d");
        if (!context) return;
        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, 16, 16);
        context.fillStyle = "#d0d0d0";
        context.fillRect(0, 0, 8, 8);
        context.fillRect(8, 8, 8, 8);
        checkerRef.current = context.createPattern(canvas, "repeat");
    }, []);

    const fit = useCallback(() => {
        const element = containerRef.current;
        if (!element) return;
        const w = element.clientWidth;
        const h = element.clientHeight;
        if (!w || !h) return;
        const k0 = Math.min(w / doc.width, h / doc.height) * 0.9;
        const k = k0 >= 1 ? Math.max(1, Math.floor(k0)) : Math.max(0.05, k0);
        setView({ k, x: (w - doc.width * k) / 2, y: (h - doc.height * k) / 2 });
    }, [doc.width, doc.height]);

    const setZoom = useCallback(
        (k: number) => {
            const element = containerRef.current;
            const w = element?.clientWidth ?? size.w;
            const h = element?.clientHeight ?? size.h;
            const next = clampZoom(k);
            setView({ k: next, x: (w - doc.width * next) / 2, y: (h - doc.height * next) / 2 });
        },
        [doc.width, doc.height, size.w, size.h],
    );

    useEffect(() => {
        if (!playing || doc.frames.length < 2) return;
        const index = Math.max(0, doc.frames.findIndex((frame) => frame.id === activeFrameId));
        const timer = window.setTimeout(() => {
            setActiveFrameId(doc.frames[(index + 1) % doc.frames.length].id);
        }, Math.max(20, doc.frames[index]?.durationMs ?? 100));
        return () => window.clearTimeout(timer);
    }, [playing, activeFrameId, doc]);

    // Repaint whenever view state changes; async cel loads call bump() to re-enter.
    useEffect(() => {
        const canvas = canvasRef.current;
        const container = containerRef.current;
        if (!canvas || !container) return;
        const dpr = window.devicePixelRatio || 1;
        const cw = container.clientWidth;
        const ch = container.clientHeight;
        if (canvas.width !== Math.round(cw * dpr) || canvas.height !== Math.round(ch * dpr)) {
            canvas.width = Math.round(cw * dpr);
            canvas.height = Math.round(ch * dpr);
        }
        const context = canvas.getContext("2d");
        if (!context) return;
        context.setTransform(dpr, 0, 0, dpr, 0, 0);
        context.imageSmoothingEnabled = false;
        context.clearRect(0, 0, cw, ch);
        const fitKey = `${project.id}:${doc.width}x${doc.height}`;
        if (fittedRef.current !== fitKey && cw > 0 && ch > 0) {
            fittedRef.current = fitKey;
            const k0 = Math.min(cw / doc.width, ch / doc.height) * 0.9;
            const k = k0 >= 1 ? Math.max(1, Math.floor(k0)) : Math.max(0.05, k0);
            const next = { k, x: (cw - doc.width * k) / 2, y: (ch - doc.height * k) / 2 };
            if (next.k !== view.k || next.x !== view.x || next.y !== view.y) {
                setView(next);
                return;
            }
        }
        const { x, y, k } = view;
        const dw = doc.width * k;
        const dh = doc.height * k;
        if (checkerRef.current) {
            context.fillStyle = checkerRef.current;
            context.fillRect(x, y, dw, dh);
        }
        const ready: { buffer: Uint8ClampedArray; opacity: number; blend: CanvasPixelBlend; visible: boolean }[] = [];
        doc.layers.forEach((layer) => {
            const buffer = buffersRef.current.get(celKey(activeFrameId, layer.id));
            if (buffer) ready.push({ buffer, opacity: layer.opacity, blend: layer.blend, visible: layer.visible });
            else void loadCel(activeFrameId, layer.id);
        });
        let composite: Uint8ClampedArray | null = null;
        let compositeCanvas: HTMLCanvasElement | null = null;
        if (ready.length && doc.width * doc.height <= RENDER_LIMIT) {
            composite = compositeLayers(ready, doc.width, doc.height, doc.background);
            compositeCanvas = bufferToCanvas(composite, doc.width, doc.height);
            docCanvasRef.current = compositeCanvas;
            context.drawImage(compositeCanvas, x, y, dw, dh);
        }
        const preview = previewRef.current;
        if (preview && composite) {
            if (preview.width !== doc.width || preview.height !== doc.height) {
                preview.width = doc.width;
                preview.height = doc.height;
            }
            const pctx = preview.getContext("2d");
            if (pctx) {
                pctx.imageSmoothingEnabled = false;
                pctx.clearRect(0, 0, doc.width, doc.height);
                if (compositeCanvas) pctx.drawImage(compositeCanvas, 0, 0);
            }
        }
        if (draftRef.current) context.drawImage(draftRef.current.canvas, x, y, dw, dh);
        if (showGrid && k >= 4) {
            context.strokeStyle = "rgba(127,127,127,0.35)";
            context.lineWidth = 1;
            context.beginPath();
            for (let gx = 0; gx <= doc.width; gx++) {
                const px = Math.round(x + gx * k) + 0.5;
                context.moveTo(px, y);
                context.lineTo(px, y + dh);
            }
            for (let gy = 0; gy <= doc.height; gy++) {
                const py = Math.round(y + gy * k) + 0.5;
                context.moveTo(x, py);
                context.lineTo(x + dw, py);
            }
            context.stroke();
        }
        if (selection) {
            context.save();
            context.setLineDash([4, 3]);
            context.strokeStyle = "#000000";
            context.strokeRect(x + selection.x * k + 0.5, y + selection.y * k + 0.5, selection.w * k - 1, selection.h * k - 1);
            context.strokeStyle = "#ffffff";
            context.lineDashOffset = 4;
            context.strokeRect(x + selection.x * k + 0.5, y + selection.y * k + 0.5, selection.w * k - 1, selection.h * k - 1);
            context.restore();
        }
        if (symmetryX || symmetryY) {
            context.save();
            context.strokeStyle = "rgba(236,72,153,0.6)";
            context.lineWidth = 1;
            context.beginPath();
            if (symmetryX) {
                const px = Math.round(x + dw / 2) + 0.5;
                context.moveTo(px, y);
                context.lineTo(px, y + dh);
            }
            if (symmetryY) {
                const py = Math.round(y + dh / 2) + 0.5;
                context.moveTo(x, py);
                context.lineTo(x + dw, py);
            }
            context.stroke();
            context.restore();
        }
        const snap = snapRef.current;
        if (snap && !gestureRef.current.active) {
            snap.style.display = "none";
            snap.style.transform = "none";
            canvas.style.visibility = "";
        }
        const overlay = checkerOverlayRef.current;
        if (overlay && !gestureRef.current.active) {
            overlay.style.display = "none";
            overlay.style.transform = "none";
        }
    });

    const docPoint = (event: { clientX: number; clientY: number }): Point => {
        const rect = containerRef.current?.getBoundingClientRect();
        if (!rect) return { x: 0, y: 0 };
        return { x: Math.floor((event.clientX - rect.left - view.x) / view.k), y: Math.floor((event.clientY - rect.top - view.y) / view.k) };
    };

    const zoomAt = (clientX: number, clientY: number, factor: number) => {
        const rect = containerRef.current?.getBoundingClientRect();
        if (!rect) return;
        setView((prev) => {
            const k = nextZoom(prev.k, factor);
            const ratio = k / prev.k;
            return { k, x: clientX - rect.left - (clientX - rect.left - prev.x) * ratio, y: clientY - rect.top - (clientY - rect.top - prev.y) * ratio };
        });
    };

    const beginGesture = useCallback((base: View) => {
        const canvas = canvasRef.current;
        const snap = snapRef.current;
        const docCanvas = docCanvasRef.current;
        if (!canvas || !snap || !docCanvas) return;
        if (snap.width !== docCanvas.width || snap.height !== docCanvas.height) {
            snap.width = docCanvas.width;
            snap.height = docCanvas.height;
        }
        const sctx = snap.getContext("2d");
        if (!sctx) return;
        sctx.setTransform(1, 0, 0, 1, 0, 0);
        sctx.clearRect(0, 0, snap.width, snap.height);
        sctx.drawImage(docCanvas, 0, 0);
        snap.style.left = `${base.x}px`;
        snap.style.top = `${base.y}px`;
        snap.style.width = `${docCanvas.width * base.k}px`;
        snap.style.height = `${docCanvas.height * base.k}px`;
        snap.style.transform = "none";
        snap.style.display = "block";
        const overlay = checkerOverlayRef.current;
        if (overlay) {
            overlay.style.left = `${base.x}px`;
            overlay.style.top = `${base.y}px`;
            overlay.style.width = `${docCanvas.width * base.k}px`;
            overlay.style.height = `${docCanvas.height * base.k}px`;
            overlay.style.backgroundPosition = `${((base.x % 16) + 16) % 16}px ${((base.y % 16) + 16) % 16}px`;
            overlay.style.transform = "none";
            overlay.style.display = "block";
        }
        canvas.style.visibility = "hidden";
        gestureRef.current.base = base;
        gestureRef.current.next = null;
        gestureRef.current.active = true;
    }, []);

    const applyGesture = useCallback((next: View) => {
        const snap = snapRef.current;
        if (!snap) return;
        const base = gestureRef.current.base;
        const transform = `translate(${next.x - base.x}px, ${next.y - base.y}px) scale(${next.k / base.k})`;
        snap.style.transform = transform;
        const overlay = checkerOverlayRef.current;
        if (overlay) overlay.style.transform = transform;
    }, []);

    const endGesture = useCallback((next: View) => {
        gestureRef.current.active = false;
        gestureRef.current.next = null;
        setView(next);
    }, []);

    const cancelGesture = useCallback(() => {
        const snap = snapRef.current;
        if (snap) {
            snap.style.display = "none";
            snap.style.transform = "none";
        }
        const overlay = checkerOverlayRef.current;
        if (overlay) {
            overlay.style.display = "none";
            overlay.style.transform = "none";
        }
        const canvas = canvasRef.current;
        if (canvas) canvas.style.visibility = "";
        gestureRef.current.active = false;
        gestureRef.current.next = null;
    }, []);

    useEffect(() => {
        const element = containerRef.current;
        if (!element) return;
        const onWheel = (event: WheelEvent) => {
            event.preventDefault();
            const rect = element.getBoundingClientRect();
            if (!gestureRef.current.active) beginGesture(viewRef.current);
            const gesture = gestureRef.current;
            const current = gesture.next ?? gesture.base;
            const k = nextZoom(current.k, event.deltaY < 0 ? 1.25 : 0.8);
            const ratio = k / current.k;
            const mx = event.clientX - rect.left;
            const my = event.clientY - rect.top;
            const next = { k, x: mx - (mx - current.x) * ratio, y: my - (my - current.y) * ratio };
            gesture.next = next;
            applyGesture(next);
            if (gesture.zoomTimer) window.clearTimeout(gesture.zoomTimer);
            gesture.zoomTimer = window.setTimeout(() => {
                gesture.zoomTimer = null;
                endGesture(gesture.next ?? gesture.base);
            }, 160);
        };
        element.addEventListener("wheel", onWheel, { passive: false });
        return () => element.removeEventListener("wheel", onWheel);
    }, [beginGesture, applyGesture, endGesture]);

    const sampleColor = (point: Point) => {
        for (let index = doc.layers.length - 1; index >= 0; index--) {
            const layer = doc.layers[index];
            if (!layer.visible) continue;
            const buffer = buffersRef.current.get(celKey(activeFrameId, layer.id));
            if (!buffer) continue;
            const [r, g, b, a] = getPixel(buffer, doc.width, doc.height, point.x, point.y);
            if (a > 0) return rgbaToHex([r, g, b, a]);
        }
        return "";
    };

    const paintAt = (buffer: Uint8ClampedArray, from: Point, to: Point) => {
        const rgba: Rgba = tool === "eraser" ? [0, 0, 0, 0] : hexToRgba(color);
        const stamp = (ax: number, ay: number, bx: number, by: number) => {
            for (let oy = 0; oy < brushSize; oy++) {
                for (let ox = 0; ox < brushSize; ox++) {
                    if (from.x === to.x && from.y === to.y) setPixel(buffer, doc.width, doc.height, ax + ox, ay + oy, rgba);
                    else drawLine(buffer, doc.width, doc.height, ax + ox, ay + oy, bx + ox, by + oy, rgba);
                }
            }
        };
        stamp(from.x, from.y, to.x, to.y);
        if (symmetryX) stamp(doc.width - 1 - from.x, from.y, doc.width - 1 - to.x, to.y);
        if (symmetryY) stamp(from.x, doc.height - 1 - from.y, to.x, doc.height - 1 - to.y);
        if (symmetryX && symmetryY) stamp(doc.width - 1 - from.x, doc.height - 1 - from.y, doc.width - 1 - to.x, doc.height - 1 - to.y);
        dirtyRef.current.add(celKey(activeFrameId, activeLayerId));
    };

    const drawShape = (buffer: Uint8ClampedArray, shape: PixelTool, a: Point, b: Point, rgba: Rgba) => {
        if (shape === "line") drawLine(buffer, doc.width, doc.height, a.x, a.y, b.x, b.y, rgba);
        if (shape === "rect") drawRect(buffer, doc.width, doc.height, Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x) + 1, Math.abs(b.y - a.y) + 1, rgba, filled);
        if (shape === "ellipse") drawEllipse(buffer, doc.width, doc.height, a.x, a.y, Math.abs(b.x - a.x), Math.abs(b.y - a.y), rgba, filled);
    };

    const drawShapeWithSymmetry = (buffer: Uint8ClampedArray, shape: PixelTool, a: Point, b: Point, rgba: Rgba) => {
        drawShape(buffer, shape, a, b, rgba);
        const mx = (p: Point): Point => ({ x: doc.width - 1 - p.x, y: p.y });
        const my = (p: Point): Point => ({ x: p.x, y: doc.height - 1 - p.y });
        const mxy = (p: Point): Point => ({ x: doc.width - 1 - p.x, y: doc.height - 1 - p.y });
        if (symmetryX) drawShape(buffer, shape, mx(a), mx(b), rgba);
        if (symmetryY) drawShape(buffer, shape, my(a), my(b), rgba);
        if (symmetryX && symmetryY) drawShape(buffer, shape, mxy(a), mxy(b), rgba);
    };

    const updatePreview = (a: Point, b: Point) => {
        if (doc.width * doc.height > PREVIEW_LIMIT) {
            draftRef.current = null;
            return;
        }
        const buffer = makeBuffer(doc.width, doc.height);
        drawShapeWithSymmetry(buffer, tool === "rect" ? "rect" : tool === "ellipse" ? "ellipse" : "line", a, b, hexToRgba(color));
        draftRef.current = { canvas: bufferToCanvas(buffer, doc.width, doc.height) };
        bump();
    };

    const restoreRegion = (buffer: Uint8ClampedArray, orig: Uint8ClampedArray, x: number, y: number, w: number, h: number) => {
        for (let row = 0; row < h; row++) {
            const py = y + row;
            if (py < 0 || py >= doc.height) continue;
            const start = Math.max(0, x);
            const end = Math.min(doc.width, x + w);
            if (end <= start) continue;
            buffer.set(orig.subarray((py * doc.width + start) * 4, (py * doc.width + end) * 4), (py * doc.width + start) * 4);
        }
    };

    const clearRegion = (buffer: Uint8ClampedArray, rect: Rect) => {
        for (let row = 0; row < rect.h; row++) {
            for (let col = 0; col < rect.w; col++) setPixel(buffer, doc.width, doc.height, rect.x + col, rect.y + row, [0, 0, 0, 0]);
        }
    };

    const onPointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
        const element = event.currentTarget;
        if (event.button === 1 || tool === "hand" || spaceHeld) {
            element.setPointerCapture(event.pointerId);
            panRef.current = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, view: { ...view } };
            beginGesture(view);
            event.preventDefault();
            return;
        }
        if (event.button !== 0) return;
        const point = docPoint(event);
        const key = celKey(activeFrameId, activeLayerId);
        const buffer = buffersRef.current.get(key);
        if (tool === "eyedropper") {
            const picked = sampleColor(point);
            if (picked) setColor(picked);
            return;
        }
        if (tool === "select") {
            element.setPointerCapture(event.pointerId);
            selectRef.current = { pointerId: event.pointerId, start: point, current: point };
            setSelection({ x: Math.max(0, point.x), y: Math.max(0, point.y), w: 1, h: 1 });
            return;
        }
        if (tool === "move") {
            if (!selection || !buffer) return;
            element.setPointerCapture(event.pointerId);
            moveRef.current = { pointerId: event.pointerId, start: point, orig: new Uint8ClampedArray(buffer), region: extractRegion(buffer, doc.width, doc.height, selection.x, selection.y, selection.w, selection.h), rect: { ...selection }, dx: 0, dy: 0 };
            return;
        }
        if (!buffer) {
            void loadCel(activeFrameId, activeLayerId);
            return;
        }
        element.setPointerCapture(event.pointerId);
        if (tool === "bucket") {
            floodFill(buffer, doc.width, doc.height, point.x, point.y, hexToRgba(color), tolerance);
            dirtyRef.current.add(key);
            void flushDirty();
            bump();
            return;
        }
        paintRef.current = { pointerId: event.pointerId, tool, frameId: activeFrameId, layerId: activeLayerId, start: point, last: point, current: point };
        if (tool === "pencil" || tool === "eraser") paintAt(buffer, point, point);
        else updatePreview(point, point);
        bump();
    };

    const onPointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
        const pan = panRef.current;
        if (pan && pan.pointerId === event.pointerId) {
            const next = { ...pan.view, x: pan.view.x + (event.clientX - pan.startX), y: pan.view.y + (event.clientY - pan.startY) };
            if (gestureRef.current.active) {
                gestureRef.current.next = next;
                applyGesture(next);
            } else {
                setView(next);
            }
            return;
        }
        const paint = paintRef.current;
        if (paint && paint.pointerId === event.pointerId) {
            const point = docPoint(event);
            const buffer = buffersRef.current.get(celKey(paint.frameId, paint.layerId));
            if (!buffer) return;
            paint.current = point;
            if (paint.tool === "pencil" || paint.tool === "eraser") {
                paintAt(buffer, paint.last, point);
                paint.last = point;
            } else {
                updatePreview(paint.start, point);
            }
            bump();
            return;
        }
        const select = selectRef.current;
        if (select && select.pointerId === event.pointerId) {
            const point = docPoint(event);
            select.current = point;
            setSelection({ x: Math.min(select.start.x, point.x), y: Math.min(select.start.y, point.y), w: Math.abs(point.x - select.start.x) + 1, h: Math.abs(point.y - select.start.y) + 1 });
            return;
        }
        const move = moveRef.current;
        if (move && move.pointerId === event.pointerId) {
            const point = docPoint(event);
            const buffer = buffersRef.current.get(celKey(activeFrameId, activeLayerId));
            if (!buffer) return;
            const dx = point.x - move.start.x;
            const dy = point.y - move.start.y;
            const ux = Math.min(move.rect.x, move.rect.x + dx);
            const uy = Math.min(move.rect.y, move.rect.y + dy);
            restoreRegion(buffer, move.orig, ux, uy, move.rect.w + Math.abs(dx) + 1, move.rect.h + Math.abs(dy) + 1);
            clearRegion(buffer, move.rect);
            blit(buffer, doc.width, doc.height, move.region, move.rect.w, move.rect.h, move.rect.x + dx, move.rect.y + dy);
            move.dx = dx;
            move.dy = dy;
            setSelection({ ...move.rect, x: move.rect.x + dx, y: move.rect.y + dy });
            bump();
        }
    };

    const onPointerUp = (event: ReactPointerEvent<HTMLCanvasElement>) => {
        const pan = panRef.current;
        panRef.current = null;
        if (pan && gestureRef.current.active) {
            if (gestureRef.current.next) endGesture(gestureRef.current.next);
            else cancelGesture();
        }
        const paint = paintRef.current;
        if (paint && paint.pointerId === event.pointerId) {
            paintRef.current = null;
            if (paint.tool === "pencil" || paint.tool === "eraser") {
                void flushDirty();
            } else {
                const buffer = buffersRef.current.get(celKey(paint.frameId, paint.layerId));
                if (buffer) {
                    drawShapeWithSymmetry(buffer, paint.tool, paint.start, paint.current, hexToRgba(color));
                    dirtyRef.current.add(celKey(paint.frameId, paint.layerId));
                    void flushDirty();
                }
                draftRef.current = null;
            }
            bump();
            return;
        }
        if (selectRef.current?.pointerId === event.pointerId) {
            selectRef.current = null;
            return;
        }
        const move = moveRef.current;
        if (move && move.pointerId === event.pointerId) {
            moveRef.current = null;
            setSelection({ ...move.rect, x: move.rect.x + move.dx, y: move.rect.y + move.dy });
            dirtyRef.current.add(celKey(activeFrameId, activeLayerId));
            void flushDirty();
            bump();
        }
    };

    useEffect(() => {
        const isTyping = (target: EventTarget | null) => target instanceof HTMLElement && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
        const onKeyDown = (event: KeyboardEvent) => {
            if (isTyping(event.target)) return;
            if (event.code === "Space") {
                event.preventDefault();
                setSpaceHeld(true);
                return;
            }
            if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
                event.preventDefault();
                if (event.shiftKey) actionsRef.current.redo();
                else actionsRef.current.undo();
                return;
            }
            if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "y") {
                event.preventDefault();
                actionsRef.current.redo();
                return;
            }
            const next = TOOL_HOTKEYS[event.key.toLowerCase()];
            if (next) setTool(next);
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

    const activeLayer = doc.layers.find((layer) => layer.id === activeLayerId);

    const compositeFrame = useCallback(
        async (frameId: string) => {
            const current = docRef.current;
            const layers: { buffer: Uint8ClampedArray; opacity: number; blend: CanvasPixelBlend; visible: boolean }[] = [];
            for (const layer of current.layers) {
                const buffer = buffersRef.current.get(celKey(frameId, layer.id)) ?? (await loadCel(frameId, layer.id));
                layers.push({ buffer, opacity: layer.opacity, blend: layer.blend, visible: layer.visible });
            }
            return compositeLayers(layers, current.width, current.height, current.background);
        },
        [loadCel],
    );

    const doExport = useCallback(
        async (format: "png" | "spritesheet", scale = 1) => {
            try {
                const current = docRef.current;
                if (format === "png") {
                    const buffer = await compositeFrame(activeFrameId);
                    saveAs(await bufferToPngBlob(buffer, current.width, current.height), `${project.title || "pixel"}.png`);
                } else {
                    const canvas = document.createElement("canvas");
                    canvas.width = current.width * current.frames.length;
                    canvas.height = current.height;
                    const context = canvas.getContext("2d");
                    if (!context) return;
                    context.imageSmoothingEnabled = false;
                    for (let index = 0; index < current.frames.length; index++) {
                        const buffer = await compositeFrame(current.frames[index].id);
                        context.drawImage(bufferToCanvas(buffer, current.width, current.height), index * current.width, 0);
                    }
                    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob((value) => resolve(value), "image/png"));
                    if (blob) saveAs(blob, `${project.title || "pixel"}-sheet.png`);
                }
                message.success("Exported");
            } catch {
                message.error("Export failed");
            }
        },
        [activeFrameId, compositeFrame, message, project.title],
    );

    const doImport = useCallback(
        async (source: string | Blob, fit: "contain" | "stretch" | "nearest") => {
            try {
                const current = docRef.current;
                const imported = await importImageToBuffer(source, current.width, current.height, fit);
                const frameId = activeFrameId;
                const layerId = activeLayerId;
                const buffer = buffersRef.current.get(celKey(frameId, layerId)) ?? (await loadCel(frameId, layerId));
                buffer.set(imported);
                dirtyRef.current.add(celKey(frameId, layerId));
                await flushDirty();
                message.success("Image imported");
            } catch {
                message.error("Import failed");
            }
        },
        [activeFrameId, activeLayerId, flushDirty, loadCel, message],
    );

    const importFile = (file: File) => void doImport(file, importFit);
    const importNode = async (sourceKey: string, content: string) => {
        const url = await resolveImageUrl(sourceKey, content);
        if (url) void doImport(url, importFit);
    };

    const changeSize = (width: number, height: number) => {
        const current = docRef.current;
        const nextWidth = Math.max(1, Math.round(width));
        const nextHeight = Math.max(1, Math.round(height));
        if (nextWidth === current.width && nextHeight === current.height) return;
        buffersRef.current.forEach((buffer, key) => {
            buffersRef.current.set(key, resizeNearest(buffer, current.width, current.height, nextWidth, nextHeight));
            dirtyRef.current.add(key);
        });
        const next = setDocSize(current, nextWidth, nextHeight);
        docRef.current = next;
        persist(next);
        historyRef.current.push(next);
        void flushDirty();
        bump();
    };

    applyOpsRef.current = (ops) => {
        const structural: PixelAgentOp[] = [];
        const pixelOps: AgentOp[] = [];
        const asyncOps: AgentOp[] = [];
        (ops || []).forEach((op) => {
            if (!op?.type) return;
            if (PIXEL_AGENT_OP_TYPES.includes(op.type)) structural.push(op as PixelAgentOp);
            else if (op.type === "image.load" || op.type === "export") asyncOps.push(op);
            else pixelOps.push(op);
        });

        let next = docRef.current;
        if (structural.length) next = applyPixelAgentOps({ doc: next }, structural).doc;

        const notes: string[] = [];
        const dirtyKeys: string[] = [];
        let read: string | undefined;
        const frameDefault = activeFrameId;
        const layerDefault = activeLayerId;

        pixelOps.forEach((op) => {
            const frameId = typeof op.frameId === "string" ? op.frameId : frameDefault;
            const layerId = typeof op.layerId === "string" ? op.layerId : layerDefault;
            const key = celKey(frameId, layerId);
            const buffer = buffersRef.current.get(key);
            if (!buffer) {
                notes.push(`Layer not loaded yet: ${key}`);
                void loadCel(frameId, layerId);
                return;
            }
            const width = next.width;
            const height = next.height;
            if (op.type === "pixels.set") {
                const points = Array.isArray(op.points) ? (op.points as { x: number; y: number; color: string }[]) : [];
                points.forEach((point) => setPixel(buffer, width, height, Number(point.x), Number(point.y), hexToRgba(String(point.color))));
                dirtyKeys.push(key);
            }
            if (op.type === "fill") {
                floodFill(buffer, width, height, Number(op.x), Number(op.y), hexToRgba(String(op.color)), typeof op.tolerance === "number" ? op.tolerance : 0);
                dirtyKeys.push(key);
            }
            if (op.type === "shape") {
                const shape = String(op.shape);
                const a = { x: Number(op.x), y: Number(op.y) };
                const b = shape === "line" ? { x: Number(op.x2 ?? op.x), y: Number(op.y2 ?? op.y) } : shape === "rect" ? { x: a.x + Number(op.width ?? 0), y: a.y + Number(op.height ?? 0) } : { x: a.x + Number(op.rx ?? op.width ?? 0), y: a.y + Number(op.ry ?? op.height ?? 0) };
                const rgba = hexToRgba(String(op.color));
                if (shape === "line") drawLine(buffer, width, height, a.x, a.y, b.x, b.y, rgba);
                else if (shape === "rect") drawRect(buffer, width, height, Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x) + 1, Math.abs(b.y - a.y) + 1, rgba, op.filled !== false);
                else drawEllipse(buffer, width, height, a.x, a.y, Math.abs(b.x - a.x), Math.abs(b.y - a.y), rgba, op.filled !== false);
                dirtyKeys.push(key);
            }
            if (op.type === "region.get") {
                read = regionToPngDataUrl(buffer, width, height, Number(op.x), Number(op.y), Number(op.width), Number(op.height));
            }
            if (op.type === "region.set") {
                const data = String(op.data ?? "");
                const img = new Image();
                img.src = data.startsWith("data:") ? data : `data:image/png;base64,${data}`;
                void img
                    .decode()
                    .catch(() => undefined)
                    .then(() => {
                        const rw = Number(op.width);
                        const rh = Number(op.height);
                        const patch = document.createElement("canvas");
                        patch.width = rw;
                        patch.height = rh;
                        const context = patch.getContext("2d");
                        if (!context) return;
                        context.imageSmoothingEnabled = false;
                        context.clearRect(0, 0, rw, rh);
                        context.drawImage(img, 0, 0, rw, rh);
                        blit(buffer, width, height, canvasToBuffer(patch), rw, rh, Number(op.x), Number(op.y));
                        dirtyRef.current.add(key);
                        void flushDirty();
                        bump();
                    });
                notes.push("region.set applied asynchronously");
            }
        });

        if (structural.length) {
            docRef.current = next;
            persist(next);
            historyRef.current.push(next);
        }
        if (dirtyKeys.length) {
            dirtyKeys.forEach((key) => dirtyRef.current.add(key));
            void flushDirty();
        }
        asyncOps.forEach((op) => {
            if (op.type === "image.load") {
                const source = typeof op.dataUrl === "string" ? op.dataUrl : typeof op.storageKey === "string" ? op.storageKey : "";
                const fit = op.fit === "stretch" || op.fit === "nearest" ? op.fit : "contain";
                if (source) void (source.startsWith("image:") ? importNode(source, "") : doImport(source, fit));
            }
            if (op.type === "export") void doExport(op.format === "spritesheet" ? "spritesheet" : "png", Number(op.scale) || 1);
        });
        bump();
        return { doc: next, ...(read ? { read } : {}), ...(notes.length ? { notes } : {}) };
    };

    useEffect(() => {
        const unregister = registerAgentNamespace({
            ns: "pixel",
            title: i18n.t("agent.namespace.pixel.title"),
            description: i18n.t("agent.namespace.pixel.description"),
            ops: [...PIXEL_AGENT_OP_TYPES, ...PIXEL_AGENT_ASYNC_TYPES],
            schema: PIXEL_AGENT_SCHEMA,
            applyOps: (ops) => applyOpsRef.current(ops),
        });
        return unregister;
    }, []);

    const screenshotRef = useRef({ frameId: activeFrameId, composite: compositeFrame });
    screenshotRef.current = { frameId: activeFrameId, composite: compositeFrame };

    useEffect(() => {
        return registerScreenshotProvider("pixel", async () => {
            const current = docRef.current;
            const buffer = await screenshotRef.current.composite(screenshotRef.current.frameId);
            const dataUrl = bufferToDataUrl(buffer, current.width, current.height, 1);
            return { studio: "pixel", dataUrl, mimeType: "image/png", width: current.width, height: current.height };
        });
    }, []);

    const imageNodes = useMemo(() => images.filter((item) => item.content || item.storageKey), [images]);

    const renderMenu = (label: string, items: MenuProps["items"], onClick: MenuProps["onClick"]) => (
        <Dropdown key={label} menu={{ items, onClick }} placement="bottomLeft" styles={{ root: { zIndex: 1300 } }}>
            <button type="button" className={STUDIO_MENU_BUTTON_CLASS}>
                {label}
                <ChevronDown className="size-3" />
            </button>
        </Dropdown>
    );

    const toolButton = (id: PixelTool, Icon: typeof Pencil, label: string, hotkey: string) => (
        <Tooltip key={id} title={`${label} (${hotkey})`}>
            <button type="button" onClick={() => setTool(id)} className={`grid size-7 place-items-center rounded-md transition hover:bg-hover ${tool === id ? "bg-brand-soft text-brand" : "text-muted-foreground"}`}>
                <Icon className="size-4" />
            </button>
        </Tooltip>
    );

    const renderPanel = (id: string): ReactNode => {
        if (id === "tools") {
            return (
                <div className="thin-scrollbar flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-2">
                    <div className="grid grid-cols-5 gap-1">{TOOLS.map((item) => toolButton(item.id, item.icon, item.label, item.hotkey))}</div>
                    <div className="space-y-2 border-t border-border pt-2 text-xs">
                        <label className="flex items-center gap-2">
                            <span className="w-16 shrink-0 text-muted-foreground">Brush</span>
                            <div className="flex-1"><Slider min={1} max={32} value={brushSize} onChange={setBrushSize} tooltip={{ open: false }} /></div>
                            <span className="w-6 text-right tabular-nums text-muted-foreground">{brushSize}</span>
                        </label>
                        <label className="flex items-center gap-2">
                            <span className="w-16 shrink-0 text-muted-foreground">Tolerance</span>
                            <div className="flex-1"><Slider min={0} max={255} value={tolerance} onChange={setTolerance} tooltip={{ open: false }} /></div>
                            <span className="w-7 text-right tabular-nums text-muted-foreground">{tolerance}</span>
                        </label>
                        {(tool === "rect" || tool === "ellipse") && (
                            <label className="flex items-center gap-2">
                                <span className="w-16 shrink-0 text-muted-foreground">Filled</span>
                                <input type="checkbox" checked={filled} onChange={(event) => setFilled(event.target.checked)} />
                            </label>
                        )}
                        <div className="flex items-center gap-2">
                            <span className="w-16 shrink-0 text-muted-foreground">Mirror</span>
                            <button type="button" onClick={() => setSymmetryX((value) => !value)} className={`grid size-7 place-items-center rounded-md transition hover:bg-hover ${symmetryX ? "bg-brand-soft text-brand" : "text-muted-foreground"}`} title="Mirror X">
                                <FlipHorizontal2 className="size-4" />
                            </button>
                            <button type="button" onClick={() => setSymmetryY((value) => !value)} className={`grid size-7 place-items-center rounded-md transition hover:bg-hover ${symmetryY ? "bg-brand-soft text-brand" : "text-muted-foreground"}`} title="Mirror Y">
                                <FlipVertical2 className="size-4" />
                            </button>
                        </div>
                        <label className="flex items-center gap-2">
                            <span className="w-16 shrink-0 text-muted-foreground">Grid</span>
                            <input type="checkbox" checked={showGrid} onChange={(event) => setShowGrid(event.target.checked)} />
                        </label>
                    </div>
                </div>
            );
        }
        if (id === "palette") {
            return (
                <div className="thin-scrollbar flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-2">
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-muted-foreground">Colors</span>
                        <label className="grid size-6 cursor-pointer place-items-center rounded transition hover:bg-hover" title="Add color">
                            <Plus className="size-3.5" />
                            <input type="color" value={color} onChange={(event) => applyDoc(setPalette(docRef.current, [...docRef.current.palette, event.target.value]))} className="hidden" />
                        </label>
                    </div>
                    <div className="grid grid-cols-8 gap-1">
                        {doc.palette.map((swatch, index) => (
                            <button
                                key={`${swatch}-${index}`}
                                type="button"
                                onClick={() => setColor(swatch)}
                                onContextMenu={(event) => { event.preventDefault(); if (docRef.current.palette.length > 1) applyDoc(setPalette(docRef.current, docRef.current.palette.filter((_, position) => position !== index))); }}
                                className={`aspect-square rounded border ${color.toLowerCase() === swatch.toLowerCase() ? "border-brand ring-1 ring-brand" : "border-border"}`}
                                style={{ background: swatch }}
                                title={`${swatch} (right-click to remove)`}
                            />
                        ))}
                    </div>
                    <label className="mt-1 flex items-center gap-2 text-xs">
                        <span className="text-muted-foreground">Color</span>
                        <input type="color" value={color} onChange={(event) => setColor(event.target.value)} className="size-6 cursor-pointer rounded border border-border bg-transparent p-0" />
                    </label>
                </div>
            );
        }
        if (id === "layers") {
            return (
                <div className="thin-scrollbar flex min-h-0 flex-1 flex-col overflow-y-auto">
                    <div className="flex items-center justify-end gap-1 border-b border-border px-2 py-1">
                        <button type="button" onClick={() => applyDoc(addPixelLayer(docRef.current))} className="grid size-6 place-items-center rounded transition hover:bg-hover" title="Add layer"><Plus className="size-3.5" /></button>
                        <button type="button" onClick={() => applyDoc(removePixelLayer(docRef.current, activeLayerId))} className="grid size-6 place-items-center rounded transition hover:bg-hover" title="Delete layer"><Trash2 className="size-3.5" /></button>
                    </div>
                    <div className="p-1">
                        {doc.layers.slice().reverse().map((layer) => (
                            <div key={layer.id} className={`flex items-center gap-1.5 rounded-md px-1.5 py-1 text-sm ${layer.id === activeLayerId ? "bg-brand-soft text-brand" : "hover:bg-hover"}`}>
                                <button type="button" onClick={() => applyDoc(patchPixelLayer(docRef.current, layer.id, { visible: !layer.visible }))} className="grid size-5 place-items-center">
                                    {layer.visible ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5 opacity-50" />}
                                </button>
                                <button type="button" onClick={() => setActiveLayerId(layer.id)} className="min-w-0 flex-1 truncate text-left">{layer.name || layer.id}</button>
                                <button type="button" onClick={() => applyDoc(movePixelLayer(docRef.current, layer.id, "forward"))} className="grid size-5 place-items-center opacity-70 hover:opacity-100" title="Move up">↑</button>
                                <button type="button" onClick={() => applyDoc(movePixelLayer(docRef.current, layer.id, "backward"))} className="grid size-5 place-items-center opacity-70 hover:opacity-100" title="Move down">↓</button>
                            </div>
                        ))}
                    </div>
                    {activeLayer && (
                        <div className="mt-auto flex flex-col gap-2 border-t border-border p-2 text-xs">
                            <label className="flex items-center gap-2">
                                <span className="w-14 shrink-0 text-muted-foreground">Opacity</span>
                                <div className="flex-1"><Slider min={0} max={100} value={Math.round(activeLayer.opacity * 100)} onChange={(value) => applyDoc(patchPixelLayer(docRef.current, activeLayer.id, { opacity: clamp01(value / 100) }))} tooltip={{ open: false }} /></div>
                            </label>
                            <label className="flex items-center gap-2">
                                <span className="w-14 shrink-0 text-muted-foreground">Blend</span>
                                <Select size="small" className="flex-1" value={activeLayer.blend} onChange={(value) => applyDoc(patchPixelLayer(docRef.current, activeLayer.id, { blend: value }))} options={BLENDS.map((blend) => ({ value: blend, label: BLEND_LABELS[blend] }))} />
                            </label>
                        </div>
                    )}
                </div>
            );
        }
        if (id === "frames") {
            return (
                <div className="thin-scrollbar flex min-h-0 flex-1 flex-col overflow-y-auto">
                    <div className="flex items-center justify-between gap-2 border-b border-border px-2 py-1">
                        <span className="text-xs">FPS</span>
                        <InputNumber size="small" min={1} max={60} value={doc.fps} onChange={(value) => applyDoc(setDocFps(docRef.current, Number(value) || 1))} />
                        <span className="flex items-center gap-1">
                            <button type="button" onClick={() => applyDoc(addPixelFrame(docRef.current))} className="grid size-6 place-items-center rounded transition hover:bg-hover" title="Add frame"><Plus className="size-3.5" /></button>
                            <button type="button" onClick={() => applyDoc(removePixelFrame(docRef.current, activeFrameId))} className="grid size-6 place-items-center rounded transition hover:bg-hover" title="Delete frame"><Trash2 className="size-3.5" /></button>
                            <button type="button" onClick={() => applyDoc(duplicatePixelFrame(docRef.current, activeFrameId))} className="grid size-6 place-items-center rounded transition hover:bg-hover" title="Duplicate frame"><Copy className="size-3.5" /></button>
                        </span>
                    </div>
                    <div className="flex flex-wrap gap-1 p-2">
                        {doc.frames.map((frame, index) => (
                            <button key={frame.id} type="button" onClick={() => setActiveFrameId(frame.id)} className={`flex h-7 items-center gap-1 rounded border px-1.5 text-xs tabular-nums ${frame.id === activeFrameId ? "border-brand bg-brand-soft text-brand" : "border-border hover:bg-hover"}`} title={`${frame.durationMs} ms`}>
                                #{index + 1}
                            </button>
                        ))}
                    </div>
                    <div className="mt-auto flex items-center gap-2 border-t border-border p-2 text-xs">
                        <span className="text-muted-foreground">Duration</span>
                        <InputNumber size="small" min={20} max={5000} step={10} value={doc.frames.find((frame) => frame.id === activeFrameId)?.durationMs ?? 100} onChange={(value) => applyDoc(patchPixelFrame(docRef.current, activeFrameId, { durationMs: Number(value) || 100 }))} />
                    </div>
                </div>
            );
        }
        if (id === "properties") {
            return (
                <div className="thin-scrollbar flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-2 text-xs">
                    <div className="flex items-center gap-2">
                        <span className="w-16 shrink-0 text-muted-foreground">Size</span>
                        <InputNumber size="small" min={1} max={4096} value={sizeW} onChange={(value) => setSizeW(Number(value) || 1)} className="w-16" />
                        <span>×</span>
                        <InputNumber size="small" min={1} max={4096} value={sizeH} onChange={(value) => setSizeH(Number(value) || 1)} className="w-16" />
                        <button type="button" onClick={() => changeSize(sizeW, sizeH)} className="h-6 rounded border border-border px-2 transition hover:bg-hover">Apply</button>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="w-16 shrink-0 text-muted-foreground">Background</span>
                        <Select
                            size="small"
                            className="flex-1"
                            value={doc.background === "transparent" ? "transparent" : doc.background === "#ffffff" ? "#ffffff" : doc.background === "#000000" ? "#000000" : "custom"}
                            onChange={(value) => applyDoc(setDocBackground(docRef.current, value === "custom" ? customBg : value))}
                            options={[
                                { value: "transparent", label: "Transparent" },
                                { value: "#ffffff", label: "White" },
                                { value: "#000000", label: "Black" },
                                { value: "custom", label: "Custom" },
                            ]}
                        />
                        <input type="color" value={customBg} onChange={(event) => { setCustomBg(event.target.value); if (docRef.current.background !== "transparent") applyDoc(setDocBackground(docRef.current, event.target.value)); }} className="size-6 cursor-pointer rounded border border-border bg-transparent p-0" />
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="w-16 shrink-0 text-muted-foreground">Import</span>
                        <Select size="small" className="w-24" value={importFit} onChange={setImportFit} options={[{ value: "contain", label: "Fit" }, { value: "stretch", label: "Stretch" }, { value: "nearest", label: "Original" }]} />
                        <button type="button" onClick={() => fileInputRef.current?.click()} className="flex h-6 items-center gap-1 rounded border border-border px-2 transition hover:bg-hover"><ImagePlus className="size-3.5" />File</button>
                    </div>
                    {imageNodes.length > 0 && (
                        <div className="thin-scrollbar flex max-h-32 flex-col overflow-y-auto">
                            {imageNodes.map((image) => (
                                <button key={image.id} type="button" onClick={() => void importNode(image.storageKey || "", image.content || "")} className="flex w-full items-center gap-1.5 rounded px-1 py-1 text-left transition hover:bg-hover">
                                    <ImagePlus className="size-3.5 shrink-0 opacity-70" />
                                    <span className="min-w-0 flex-1 truncate">{image.title}</span>
                                </button>
                            ))}
                        </div>
                    )}
                    <div className="flex items-center gap-2">
                        <span className="w-16 shrink-0 text-muted-foreground">Export</span>
                        <button type="button" onClick={() => void doExport("png")} className="flex h-6 items-center gap-1 rounded border border-border px-2 transition hover:bg-hover"><Download className="size-3.5" />PNG</button>
                        <button type="button" onClick={() => void doExport("spritesheet")} className="flex h-6 items-center gap-1 rounded border border-border px-2 transition hover:bg-hover"><Download className="size-3.5" />Sheet</button>
                    </div>
                </div>
            );
        }
        if (id === "preview") {
            return (
                <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto p-2">
                    <canvas ref={previewRef} className="border border-border" style={{ imageRendering: "pixelated", maxWidth: "100%", maxHeight: "100%" }} />
                </div>
            );
        }
        return null;
    };

    const fileItems: MenuProps["items"] = [
        { key: "import", label: "Import Image…", icon: <ImagePlus className="size-3.5" /> },
        { type: "divider" },
        { key: "export", label: "Export PNG", icon: <Download className="size-3.5" /> },
        { key: "sheet", label: "Export Spritesheet", icon: <Download className="size-3.5" /> },
    ];
    const editItems: MenuProps["items"] = [
        { key: "undo", label: "Undo", icon: <Undo2 className="size-3.5" /> },
        { key: "redo", label: "Redo", icon: <Redo2 className="size-3.5" /> },
        { type: "divider" },
        { key: "clear", label: "Clear Layer", icon: <Trash2 className="size-3.5" /> },
        { key: "deselect", label: "Deselect", disabled: !selection },
    ];
    const viewItems: MenuProps["items"] = [
        { key: "grid", label: (showGrid ? "✓ " : "") + "Pixel Grid" },
        { key: "mirror-x", label: (symmetryX ? "✓ " : "") + "Mirror X" },
        { key: "mirror-y", label: (symmetryY ? "✓ " : "") + "Mirror Y" },
        { type: "divider" },
        { key: "zoom-in", label: "Zoom In", icon: <ZoomIn className="size-3.5" /> },
        { key: "zoom-out", label: "Zoom Out", icon: <ZoomOut className="size-3.5" /> },
        { key: "fit", label: "Fit", icon: <Maximize className="size-3.5" /> },
        { key: "actual", label: "Actual Size" },
    ];

    return (
        <div className="flex h-full min-h-0 flex-1 flex-col bg-background text-foreground">
            <div className="glass-surface flex h-11 shrink-0 items-center gap-1.5 border-b border-border px-3">
                <button type="button" onClick={onBack} className="grid size-7 place-items-center rounded-md transition hover:bg-hover" title="Back">
                    <ArrowLeft className="size-4" />
                </button>
                <span className="min-w-0 max-w-[220px] truncate text-sm font-semibold">{project.title}</span>
                <span className="mx-1 h-4 w-px bg-border" />
                <span className="flex shrink-0 items-center gap-0.5">
                    {renderMenu("File", fileItems, ({ key }) => {
                        if (key === "import") fileInputRef.current?.click();
                        if (key === "export") void doExport("png");
                        if (key === "sheet") void doExport("spritesheet");
                    })}
                    {renderMenu("Edit", editItems, ({ key }) => {
                        if (key === "undo") undo();
                        if (key === "redo") redo();
                        if (key === "clear") clearActiveLayer();
                        if (key === "deselect") setSelection(null);
                    })}
                    {renderMenu("View", viewItems, ({ key }) => {
                        if (key === "grid") setShowGrid((value) => !value);
                        if (key === "mirror-x") setSymmetryX((value) => !value);
                        if (key === "mirror-y") setSymmetryY((value) => !value);
                        if (key === "zoom-in") zoomAt(size.w / 2, size.h / 2, 1.25);
                        if (key === "zoom-out") zoomAt(size.w / 2, size.h / 2, 0.8);
                        if (key === "fit") fit();
                        if (key === "actual") setZoom(1);
                    })}
                    <DockWindowMenu defs={PIXEL_DOCK_PANELS} layout={dock.layout} onToggle={dock.toggle} onReset={dock.reset} />
                </span>
                <span className="min-w-0 flex-1" />
                <Tooltip title="Zoom out">
                    <button type="button" onClick={() => zoomAt(size.w / 2, size.h / 2, 0.8)} className="grid size-7 place-items-center rounded-md transition hover:bg-hover"><ZoomOut className="size-4" /></button>
                </Tooltip>
                <span className="w-11 shrink-0 text-center text-xs tabular-nums text-muted-foreground">{Math.round(view.k * 100)}%</span>
                <Tooltip title="Zoom in">
                    <button type="button" onClick={() => zoomAt(size.w / 2, size.h / 2, 1.25)} className="grid size-7 place-items-center rounded-md transition hover:bg-hover"><ZoomIn className="size-4" /></button>
                </Tooltip>
                <Tooltip title="Fit">
                    <button type="button" onClick={fit} className="grid size-7 place-items-center rounded-md transition hover:bg-hover"><Maximize className="size-4" /></button>
                </Tooltip>
                <span className="mx-1 h-4 w-px bg-border" />
                <Tooltip title={playing ? "Pause" : "Play"}>
                    <button type="button" onClick={() => setPlaying((value) => !value)} className="grid size-7 place-items-center rounded-md transition hover:bg-hover">{playing ? <Pause className="size-4" /> : <Play className="size-4" />}</button>
                </Tooltip>
                <button type="button" onClick={() => void doExport("png")} className="flex h-7 items-center gap-1 rounded-md px-2 text-sm transition hover:bg-hover">
                    <Download className="size-4" />
                    Export
                </button>
            </div>

            <div className="flex h-9 shrink-0 items-center gap-x-3 border-b border-border px-3 text-sm">
                <span className="text-muted-foreground">Brush</span>
                <div className="w-24"><Slider min={1} max={32} value={brushSize} onChange={setBrushSize} tooltip={{ open: false }} /></div>
                <span className="w-5 text-center tabular-nums text-muted-foreground">{brushSize}</span>
                <span className="text-muted-foreground">Tolerance</span>
                <div className="w-24"><Slider min={0} max={255} value={tolerance} onChange={setTolerance} tooltip={{ open: false }} /></div>
                <span className="w-7 text-center tabular-nums text-muted-foreground">{tolerance}</span>
                <span className="mx-1 h-4 w-px bg-border" />
                <div className="flex items-center gap-1">
                    {doc.palette.slice(0, 16).map((swatch) => (
                        <button key={swatch} type="button" onClick={() => setColor(swatch)} className={`size-5 rounded border ${color.toLowerCase() === swatch.toLowerCase() ? "border-brand ring-1 ring-brand" : "border-border"}`} style={{ background: swatch }} title={swatch} />
                    ))}
                </div>
                <label className="ml-2 flex items-center gap-1.5">
                    <span className="text-muted-foreground">Color</span>
                    <input type="color" value={color} onChange={(event) => setColor(event.target.value)} className="size-6 cursor-pointer rounded border border-border bg-transparent p-0" />
                </label>
            </div>

            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) importFile(file); event.target.value = ""; }} />

            <DockArea defs={PIXEL_DOCK_PANELS} layout={dock.layout} renderPanel={renderPanel} onActivate={dock.activate} onMove={dock.move} onResize={dock.resize} onSplit={dock.split}>
                <div ref={containerRef} className="relative min-h-0 min-w-0 flex-1 overflow-hidden" style={{ background: "rgba(127,127,127,0.06)" }}>
                    <div
                        ref={checkerOverlayRef}
                        className="pointer-events-none absolute"
                        style={{ display: "none", transformOrigin: "0 0", backgroundImage: "conic-gradient(#ffffff 0 25%, #d0d0d0 0 50%, #ffffff 0 75%, #d0d0d0 0)", backgroundSize: "16px 16px", imageRendering: "pixelated" }}
                    />
                    <canvas
                        ref={canvasRef}
                        className={`absolute inset-0 size-full ${tool === "hand" || spaceHeld ? "cursor-grab" : "cursor-crosshair"}`}
                        onPointerDown={onPointerDown}
                        onPointerMove={onPointerMove}
                        onPointerUp={onPointerUp}
                        onPointerCancel={onPointerUp}
                    />
                    <canvas ref={snapRef} className="pointer-events-none absolute" style={{ display: "none", transformOrigin: "0 0", imageRendering: "pixelated" }} />
                </div>
            </DockArea>
        </div>
    );
}
