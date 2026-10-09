import { Circle, Eraser, Film, Hand, Layers, Minus, MonitorPlay, Move, PaintBucket, Palette, Pencil, Pipette, Settings2, Square, SquareDashed, Wrench } from "lucide-react";

import type { DockPanelDef } from "@/components/canvas/dock/dock-layout";
import type { PixelProject } from "@/stores/use-pixel-store";
import type { CanvasPixelBlend } from "@/types/canvas";

export type PixelStudioImageSource = { id: string; title: string; storageKey?: string; content?: string };

export type PixelStudioProps = {
    project: PixelProject;
    images: PixelStudioImageSource[];
    onUpdate: (patch: Partial<PixelProject>) => void;
    onBack: () => void;
};

export type PixelTool = "pencil" | "eraser" | "bucket" | "line" | "rect" | "ellipse" | "eyedropper" | "select" | "move" | "hand";
export type Point = { x: number; y: number };
export type Rect = { x: number; y: number; w: number; h: number };
export type View = { x: number; y: number; k: number };
export type Draft = { canvas: HTMLCanvasElement } | null;

export const PREVIEW_LIMIT = 1_048_576;
export const RENDER_LIMIT = 16_777_216;
export const BLENDS: CanvasPixelBlend[] = ["normal", "multiply", "screen", "overlay", "add"];
export const BLEND_LABELS: Record<CanvasPixelBlend, string> = { normal: "Normal", multiply: "Multiply", screen: "Screen", overlay: "Overlay", add: "Add" };
export const TOOLS: { id: PixelTool; icon: typeof Pencil; label: string; hotkey: string }[] = [
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
export const TOOL_HOTKEYS: Record<string, PixelTool> = Object.fromEntries(TOOLS.map((item) => [item.hotkey.toLowerCase(), item.id]));
export const PIXEL_DOCK_PANELS: DockPanelDef[] = [
    { id: "tools", labelKey: "Tools", icon: Wrench, dock: "left" },
    { id: "palette", labelKey: "Palette", icon: Palette, dock: "left" },
    { id: "layers", labelKey: "Layers", icon: Layers, dock: "right" },
    { id: "frames", labelKey: "Frames", icon: Film, dock: "right" },
    { id: "properties", labelKey: "Properties", icon: Settings2, dock: "right" },
    { id: "preview", labelKey: "Preview", icon: MonitorPlay, dock: "bottom" },
];
export const celKey = (frameId: string, layerId: string) => `${frameId}:${layerId}`;
export const clampZoom = (value: number) => Math.max(0.05, Math.min(64, value));
export const nextZoom = (previous: number, factor: number) => (factor > 1 ? (previous < 1 ? Math.min(1, previous * 2) : previous + Math.max(1, Math.round(previous * 0.25))) : previous <= 1 ? Math.max(0.05, previous / 2) : Math.max(1, previous - Math.max(1, Math.round(previous * 0.25))));
export const clamp01 = (value: number) => Math.max(0, Math.min(1, value));
