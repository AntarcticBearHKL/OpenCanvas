import { useEffect, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import { Bold, Italic, Type } from "lucide-react";
import { Button, ColorPicker, InputNumber, Segmented, Select } from "antd";
import { useTranslation } from "react-i18next";

import { ImageSettingsTheme } from "@/components/image-settings-panel";
import { type CanvasTheme } from "@/lib/canvas-theme";
import { useCanvasTheme } from "@/hooks/use-canvas-theme";
import { clampFontSize, clampLineHeight, resolveTextStyle, TEXT_FONT_FAMILIES, TEXT_FONT_SIZE_MAX, TEXT_FONT_SIZE_MIN, TEXT_LINE_HEIGHT_MAX, TEXT_LINE_HEIGHT_MIN, type TextAlign } from "@/lib/canvas/text-style";
import type { CanvasNodeMetadata } from "@/types/canvas";

type CanvasTextStylePopoverProps = {
    metadata?: CanvasNodeMetadata;
    onChange: (patch: Partial<CanvasNodeMetadata>) => void;
};

export function CanvasTextStylePopover({ metadata, onChange }: CanvasTextStylePopoverProps) {
    const { t } = useTranslation();
    const theme = useCanvasTheme();
    const buttonRef = useRef<HTMLButtonElement>(null);
    const panelRef = useRef<HTMLDivElement>(null);
    const [open, setOpen] = useState(false);
    const [buttonRect, setButtonRect] = useState<DOMRect | null>(null);

    useEffect(() => {
        if (!open) return;
        const syncPosition = () => setButtonRect(buttonRef.current?.getBoundingClientRect() || null);
        const closeOnOutsidePointer = (event: PointerEvent) => {
            const target = event.target;
            if (!(target instanceof Node) || buttonRef.current?.contains(target) || panelRef.current?.contains(target)) return;
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
            <button ref={buttonRef} type="button" className="group relative flex h-12 items-center whitespace-nowrap px-1.5" style={{ color: theme.node.text }} aria-label={t("canvas.nodeToolbar.textStyle")} onClick={() => setOpen((current) => !current)}>
                <span className="flex h-9 items-center gap-2 rounded-[2px] px-2.5 transition group-hover:bg-hover" style={open ? { background: theme.toolbar.activeBg, color: theme.toolbar.activeText } : undefined}>
                    <Type className="size-4" />
                    <span>{t("canvas.nodeToolbar.textStyle")}</span>
                </span>
            </button>
            {open && buttonRect ? createPortal(<CanvasTextStylePanel panelRef={panelRef} buttonRect={buttonRect} theme={theme} metadata={metadata} onChange={onChange} />, document.body) : null}
        </>
    );
}

function CanvasTextStylePanel({ panelRef, buttonRect, theme, metadata, onChange }: { panelRef: RefObject<HTMLDivElement | null>; buttonRect: DOMRect; theme: CanvasTheme; metadata?: CanvasNodeMetadata; onChange: CanvasTextStylePopoverProps["onChange"] }) {
    const { t } = useTranslation();
    const style = resolveTextStyle(metadata);
    const width = 300;
    const gap = 8;
    const margin = 12;
    const left = Math.max(margin, Math.min(window.innerWidth - width - margin, buttonRect.left + buttonRect.width / 2 - width / 2));
    const alignOptions: { label: string; value: TextAlign }[] = [
        { label: t("canvas.textStyle.alignLeft"), value: "left" },
        { label: t("canvas.textStyle.alignCenter"), value: "center" },
        { label: t("canvas.textStyle.alignRight"), value: "right" },
    ];
    const panelStyle = {
        position: "fixed",
        zIndex: 1200,
        width,
        left,
        ...(buttonRect.bottom + 320 > window.innerHeight ? { bottom: window.innerHeight - buttonRect.top + gap } : { top: buttonRect.bottom + gap }),
        border: `1px solid ${theme.toolbar.border}`,
        borderRadius: 16,
        padding: 16,
        color: theme.node.text,
    } as const;
    const labelClass = "text-sm";

    return (
        <div ref={panelRef} className="canvas-text-style-popover glass-raised" style={panelStyle} onPointerDown={(event) => event.stopPropagation()} onMouseDown={(event) => event.stopPropagation()} onClick={(event) => event.stopPropagation()}>
            <ImageSettingsTheme theme={theme}>
                <div className="space-y-3">
                    <div className="text-sm font-medium" style={{ color: theme.node.muted }}>
                        {t("canvas.textStyle.title")}
                    </div>
                    <div className="space-y-1.5">
                        <div className={labelClass} style={{ color: theme.node.muted }}>
                            {t("canvas.textStyle.fontFamily")}
                        </div>
                        <Select
                            className="w-full"
                            size="small"
                            allowClear
                            value={style.fontFamily}
                            options={TEXT_FONT_FAMILIES}
                            placeholder={t("canvas.textStyle.fontFamily")}
                            getPopupContainer={() => panelRef.current || document.body}
                            onChange={(value) => onChange({ fontFamily: value || "" })}
                        />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                            <div className={labelClass} style={{ color: theme.node.muted }}>
                                {t("canvas.textStyle.fontSize")}
                            </div>
                            <InputNumber className="w-full" size="small" min={TEXT_FONT_SIZE_MIN} max={TEXT_FONT_SIZE_MAX} step={1} value={style.fontSize} onChange={(value) => value != null && onChange({ fontSize: clampFontSize(value) })} />
                        </div>
                        <div className="space-y-1.5">
                            <div className={labelClass} style={{ color: theme.node.muted }}>
                                {t("canvas.textStyle.lineHeight")}
                            </div>
                            <InputNumber
                                className="w-full"
                                size="small"
                                min={TEXT_LINE_HEIGHT_MIN}
                                max={TEXT_LINE_HEIGHT_MAX}
                                step={0.05}
                                precision={2}
                                value={style.lineHeight}
                                onChange={(value) => value != null && onChange({ lineHeight: clampLineHeight(value) })}
                            />
                        </div>
                    </div>
                    <div className="space-y-1.5">
                        <div className={labelClass} style={{ color: theme.node.muted }}>
                            {t("canvas.textStyle.align")}
                        </div>
                        <div className="flex items-center gap-2">
                            <Button
                                size="small"
                                type="text"
                                className="!h-8 !w-8 !min-w-8 !p-0"
                                title={t("canvas.textStyle.bold")}
                                aria-label={t("canvas.textStyle.bold")}
                                style={style.bold ? { background: theme.toolbar.activeBg, color: theme.toolbar.activeText } : { color: theme.node.text }}
                                icon={<Bold className="size-3.5" />}
                                onClick={() => onChange({ fontWeight: style.bold ? "normal" : "bold" })}
                            />
                            <Button
                                size="small"
                                type="text"
                                className="!h-8 !w-8 !min-w-8 !p-0"
                                title={t("canvas.textStyle.italic")}
                                aria-label={t("canvas.textStyle.italic")}
                                style={style.italic ? { background: theme.toolbar.activeBg, color: theme.toolbar.activeText } : { color: theme.node.text }}
                                icon={<Italic className="size-3.5" />}
                                onClick={() => onChange({ italic: !style.italic })}
                            />
                            <Segmented className="min-w-0 flex-1" block size="small" value={style.align} options={alignOptions} onChange={(value) => onChange({ textAlign: value as TextAlign })} />
                        </div>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                        <div className={labelClass} style={{ color: theme.node.muted }}>
                            {t("canvas.textStyle.color")}
                        </div>
                        <div className="flex items-center gap-1.5">
                            <Button size="small" type="text" className="!h-7 !px-1.5 !text-sm" style={{ color: theme.node.muted }} onClick={() => onChange({ textColor: "" })}>
                                {t("canvas.textStyle.colorReset")}
                            </Button>
                            <ColorPicker size="small" value={style.color || theme.node.text} disabledAlpha getPopupContainer={() => panelRef.current || document.body} onChangeComplete={(color) => onChange({ textColor: color.toHexString() })} />
                        </div>
                    </div>
                </div>
            </ImageSettingsTheme>
        </div>
    );
}
