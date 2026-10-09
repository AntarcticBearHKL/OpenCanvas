import { Layers, MonitorPlay, Palette, SlidersHorizontal, Sparkles } from "lucide-react";

import type { DockPanelDef } from "@/components/canvas/dock/dock-layout";

/** Texture studio panels: dockable tabs on the left / right, labels resolved via i18n. */
export const TEXTURE_DOCK_PANELS: DockPanelDef[] = [
    { id: "layers", labelKey: "textureStudio.panels.layers", icon: Layers, dock: "left" },
    { id: "params", labelKey: "textureStudio.panels.params", icon: SlidersHorizontal, dock: "left" },
    { id: "output", labelKey: "textureStudio.panels.output", icon: MonitorPlay, dock: "right" },
    { id: "effects", labelKey: "textureStudio.panels.effects", icon: Sparkles, dock: "right" },
    { id: "gradient", labelKey: "textureStudio.panels.gradient", icon: Palette, dock: "right" },
];
