import type { Dispatch, SetStateAction } from "react";
import { Blend, Camera, CircleDot, Contrast, Droplets, Grid2x2, Palette, Paintbrush, Pipette, RefreshCw, Scale, SlidersHorizontal, Spline, Sun, SunMedium } from "lucide-react";
import { useTranslation } from "react-i18next";

import { addPsLayerAbove, commitBoardLayers, patchPsLayer } from "@/components/canvas/workspace/ps-layer-ops";
import { useCanvasTheme } from "@/hooks/use-canvas-theme";
import { PS_ADJUSTMENT_DEFAULTS, PS_ADJUSTMENT_NAME_KEYS, PS_ADJUSTMENT_TYPES, psCopyParams } from "@/lib/canvas/ps-adjustments";
import { createPsAdjustmentLayer, smartCanvasLayers } from "@/lib/canvas/smart-canvas";
import type { CanvasNodeData, CanvasPsAdjustmentType, CanvasPsLayer } from "@/types/canvas";

type PsAdjustmentsPanelProps = {
    board: CanvasNodeData;
    setNodes: Dispatch<SetStateAction<CanvasNodeData[]>>;
    selected: CanvasPsLayer | null;
    onSelect: (layerId: string) => void;
};

const ICONS: Record<CanvasPsAdjustmentType, typeof Sun> = {
    "brightness-contrast": Sun,
    levels: SlidersHorizontal,
    curves: Spline,
    exposure: SunMedium,
    vibrance: Droplets,
    "hue-saturation": Palette,
    "color-balance": Scale,
    "black-white": Contrast,
    "photo-filter": Camera,
    "channel-mixer": Blend,
    "gradient-map": Paintbrush,
    invert: RefreshCw,
    posterize: Grid2x2,
    threshold: CircleDot,
    "selective-color": Pipette,
};

export default function PsAdjustmentsPanel({ board, setNodes, selected, onSelect }: PsAdjustmentsPanelProps) {
    const { t } = useTranslation();
    const theme = useCanvasTheme();
    const layers = smartCanvasLayers(board);
    const pick = (type: CanvasPsAdjustmentType) => {
        const name = t(PS_ADJUSTMENT_NAME_KEYS[type]);
        if (selected?.kind === "adjustment") {
            commitBoardLayers(setNodes, board.id, patchPsLayer(layers, selected.id, { adjustment: type, adjustmentParams: psCopyParams(PS_ADJUSTMENT_DEFAULTS[type]), name }));
            return;
        }
        const layer = createPsAdjustmentLayer(board, type, name);
        commitBoardLayers(setNodes, board.id, addPsLayerAbove(layers, layer, selected?.id));
        onSelect(layer.id);
    };
    return (
        <section className="shrink-0 border-t" style={{ borderColor: theme.toolbar.border }}>
            <div className="flex shrink-0 items-center gap-1 px-2 py-1.5">
                <SlidersHorizontal className="size-3.5 shrink-0" style={{ color: theme.node.muted }} />
                <span className="min-w-0 flex-1 truncate text-xs font-medium">{t("canvas.ps.adjustments")}</span>
                <span className="max-w-[140px] shrink-0 truncate text-[11px]" style={{ color: theme.node.placeholder }}>
                    {t(selected?.kind === "adjustment" ? "canvas.ps.adjust.replaceHint" : "canvas.ps.adjust.addHint")}
                </span>
            </div>
            <div className="grid grid-cols-8 gap-0.5 px-2 pb-1.5">
                {PS_ADJUSTMENT_TYPES.map((type) => {
                    const Icon = ICONS[type];
                    const active = selected?.kind === "adjustment" && selected.adjustment === type;
                    return (
                        <button
                            key={type}
                            type="button"
                            className="grid h-7 place-items-center rounded-md transition hover:bg-black/5 dark:hover:bg-white/10"
                            style={active ? { background: theme.toolbar.activeBg, color: theme.toolbar.activeText } : { color: theme.node.muted }}
                            aria-label={t(PS_ADJUSTMENT_NAME_KEYS[type])}
                            title={t(PS_ADJUSTMENT_NAME_KEYS[type])}
                            onClick={() => pick(type)}
                        >
                            <Icon className="size-3.5" />
                        </button>
                    );
                })}
            </div>
        </section>
    );
}
