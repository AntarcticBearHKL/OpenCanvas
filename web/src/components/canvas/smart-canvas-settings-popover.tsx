import { useEffect, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import { Settings2 } from "lucide-react";
import { Button, ColorPicker, Segmented, Select, Slider } from "antd";
import { useTranslation } from "react-i18next";

import { ImageSettingsTheme } from "@/components/image-settings-panel";
import { canvasThemes, frostedSurfaceClass } from "@/lib/canvas-theme";
import { useCanvasTheme } from "@/hooks/use-canvas-theme";
import { mediaRatioOptions } from "@/lib/media-size";
import type { SmartCanvasResolution } from "@/lib/canvas/smart-canvas";

type SmartCanvasSettingsPatch = {
    boardRatio?: string;
    boardResolution?: SmartCanvasResolution;
    boardBackground?: string;
    boardBackgroundOpacity?: number;
};

type SmartCanvasSettingsPopoverProps = {
    ratio: string;
    resolution: SmartCanvasResolution;
    background: string;
    backgroundOpacity: number;
    onChange: (patch: SmartCanvasSettingsPatch) => void;
};

const ratioOptions = mediaRatioOptions.filter((item) => item.value !== "auto").map((item) => ({ value: item.value, label: item.value }));
const resolutionOptions: { label: string; value: SmartCanvasResolution }[] = [
    { label: "1K", value: "1k" },
    { label: "2K", value: "2k" },
    { label: "4K", value: "4k" },
];

export function SmartCanvasSettingsPopover({ ratio, resolution, background, backgroundOpacity, onChange }: SmartCanvasSettingsPopoverProps) {
    const { t } = useTranslation();
    const theme = useCanvasTheme();
    const buttonRef = useRef<HTMLSpanElement>(null);
    const panelRef = useRef<HTMLDivElement>(null);
    const [open, setOpen] = useState(false);
    const [buttonRect, setButtonRect] = useState<DOMRect | null>(null);

    useEffect(() => {
        if (!open) return;
        const syncPosition = () => setButtonRect(buttonRef.current?.getBoundingClientRect() || null);
        const closeOnOutsidePointer = (event: PointerEvent) => {
            const target = event.target;
            if (!(target instanceof Node)) return;
            if (buttonRef.current?.contains(target) || panelRef.current?.contains(target)) return;
            if (document.activeElement instanceof HTMLElement && panelRef.current?.contains(document.activeElement)) document.activeElement.blur();
            setOpen(false);
        };

        syncPosition();
        window.addEventListener("resize", syncPosition);
        window.addEventListener("scroll", syncPosition, true);
        window.addEventListener("pointerdown", closeOnOutsidePointer, true);
        return () => {
            window.removeEventListener("resize", syncPosition);
            window.removeEventListener("scroll", syncPosition, true);
            window.removeEventListener("pointerdown", closeOnOutsidePointer, true);
        };
    }, [open]);

    return (
        <>
            <span ref={buttonRef} className="inline-flex min-w-0">
                <Button size="small" type="text" className="!h-8 !max-w-[180px] !justify-start !rounded-full !px-2.5 hover:bg-black/5 dark:hover:bg-white/10" style={{ color: theme.node.text }} icon={<Settings2 className="size-3.5" />} onClick={() => setOpen(!open)}>
                    <span className="truncate">
                        {ratio} · {resolution.toUpperCase()}
                    </span>
                </Button>
            </span>
            {open && buttonRect ? <SmartCanvasSettingsPortal buttonRect={buttonRect} panelRef={panelRef} theme={theme} ratio={ratio} resolution={resolution} background={background} backgroundOpacity={backgroundOpacity} onChange={onChange} /> : null}
        </>
    );
}

function SmartCanvasSettingsPortal({
    buttonRect,
    panelRef,
    theme,
    ratio,
    resolution,
    background,
    backgroundOpacity,
    onChange,
}: {
    buttonRect: DOMRect;
    panelRef: RefObject<HTMLDivElement | null>;
    theme: (typeof canvasThemes)[keyof typeof canvasThemes];
    ratio: string;
    resolution: SmartCanvasResolution;
    background: string;
    backgroundOpacity: number;
    onChange: (patch: SmartCanvasSettingsPatch) => void;
}) {
    const { t } = useTranslation();
    const width = 356;
    const gap = 8;
    const margin = 12;
    const left = buttonRect.left;
    const backgroundOptions = [
        { label: t("canvas.smartCanvas.bgTransparent"), value: "transparent" },
        { label: t("canvas.smartCanvas.bgWhite"), value: "#ffffff" },
        { label: t("canvas.smartCanvas.bgBlack"), value: "#000000" },
    ];
    const style = {
        position: "fixed",
        zIndex: 1200,
        width,
        left: Math.max(margin, Math.min(window.innerWidth - width - margin, left)),
        top: buttonRect.bottom + gap,
        maxHeight: Math.max(260, window.innerHeight - buttonRect.bottom - margin * 2),
        background: theme.toolbar.panel,
        border: `1px solid ${theme.toolbar.border}`,
        borderRadius: 16,
        padding: 18,
        overflowY: "auto",
        color: theme.node.text,
    } as const;

    return createPortal(
        <div ref={panelRef} className={`canvas-smart-canvas-settings-popover ${frostedSurfaceClass}`} style={style} onPointerDown={(event) => event.stopPropagation()} onMouseDown={(event) => event.stopPropagation()} onClick={(event) => event.stopPropagation()}>
            <ImageSettingsTheme theme={theme}>
                <div className="space-y-4">
                    <div className="space-y-2.5">
                        <div className="text-xs font-medium" style={{ color: theme.node.muted }}>
                            {t("canvas.smartCanvas.ratio")}
                        </div>
                        <Select className="w-full" value={ratio} options={ratioOptions} onChange={(value) => onChange({ boardRatio: value })} />
                    </div>
                    <div className="space-y-2.5">
                        <div className="text-xs font-medium" style={{ color: theme.node.muted }}>
                            {t("canvas.smartCanvas.resolution")}
                        </div>
                        <Segmented
                            block
                            value={resolution}
                            options={resolutionOptions}
                            onChange={(value) => {
                                const next = resolutionOptions.find((option) => option.value === value)?.value;
                                if (next) onChange({ boardResolution: next });
                            }}
                        />
                    </div>
                    <div className="space-y-2.5">
                        <div className="text-xs font-medium" style={{ color: theme.node.muted }}>
                            {t("canvas.smartCanvas.background")}
                        </div>
                        <Segmented block value={backgroundOptions.some((option) => option.value === background) ? background : undefined} options={backgroundOptions} onChange={(value) => onChange({ boardBackground: value })} />
                        <div className="flex items-center justify-between">
                            <span className="text-xs" style={{ color: theme.node.muted }}>
                                {t("canvas.smartCanvas.bgCustom")}
                            </span>
                            <ColorPicker
                                getPopupContainer={() => panelRef.current || document.body}
                                value={background === "transparent" ? "#ffffff" : background}
                                disabledAlpha
                                onChangeComplete={(color) => onChange({ boardBackground: color.toHexString() })}
                            />
                        </div>
                        <div className="flex items-center justify-between gap-3">
                            <span className="shrink-0 text-xs" style={{ color: theme.node.muted }}>
                                {t("canvas.smartCanvas.backgroundOpacity")}
                            </span>
                            <Slider
                                className="!mx-0 !w-[180px]"
                                min={0}
                                max={100}
                                step={1}
                                value={Math.round(backgroundOpacity * 100)}
                                tooltip={{ formatter: (value) => `${value}%` }}
                                ariaLabelForHandle={t("canvas.smartCanvas.backgroundOpacity")}
                                onChange={(value) => onChange({ boardBackgroundOpacity: value / 100 })}
                            />
                        </div>
                    </div>
                </div>
            </ImageSettingsTheme>
        </div>,
        document.body,
    );
}
