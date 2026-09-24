import { useState, type ReactNode } from "react";
import { Button, Dropdown, InputNumber, Modal, Switch, type MenuProps } from "antd";
import { Check, ChevronDown } from "lucide-react";
import { useTranslation } from "react-i18next";

import { ImageSettingsTheme } from "@/components/image-settings-panel";
import { STUDIO_MENU_BUTTON_CLASS } from "@/components/canvas/workspace/studio-chrome";
import { useCanvasTheme } from "@/hooks/use-canvas-theme";
import { PS_FILTER_BY_TYPE, PS_FILTER_GROUPS, PS_FILTERS, type PsFilterType } from "@/components/canvas/workspace/ps-filters";
import type { PsCanvasAnchor } from "@/components/canvas/workspace/ps-image-ops";
import { PS_NUMERIC_TRANSFORM_DEFAULT, PS_TRANSFORM_MODES, type PsNumericTransform, type PsTransformMode } from "@/lib/canvas/ps-transform";

export type PsViewFlags = { rulers: boolean; grid: boolean; guides: boolean; snap: boolean };

type PsMenusProps = {
    disabled: boolean;
    canCrop: boolean;
    width: number;
    height: number;
    view: PsViewFlags;
    lastFilter: PsFilterType | "";
    canFilter: boolean;
    canTransform: boolean;
    lastTransform: boolean;
    onViewChange: (patch: Partial<PsViewFlags>) => void;
    onSelectAll: () => void;
    onDeselect: () => void;
    onInverse: () => void;
    onFeather: () => void;
    onImageSize: (width: number, height: number) => void;
    onCanvasSize: (width: number, height: number, anchor: PsCanvasAnchor) => void;
    onRotate: (degrees: number) => void;
    onCrop: () => void;
    onTrim: () => void;
    onClearGuides: () => void;
    onFilter: (type: PsFilterType) => void;
    onRepeatFilter: () => void;
    onTransform: (mode: PsTransformMode) => void;
    onNumericTransform: (params: PsNumericTransform) => void;
    onRepeatTransform: () => void;
    onClearTransform: () => void;
};

const MENU_BUTTON_CLASS = STUDIO_MENU_BUTTON_CLASS;
export const PS_MENU_POPUP = { className: "glass-raised", style: { background: "var(--glass-strong)" } };
const ANCHORS: PsCanvasAnchor[][] = [
    ["top-left", "top", "top-right"],
    ["left", "center", "right"],
    ["bottom-left", "bottom", "bottom-right"],
];

export function PsMenus({
    disabled,
    canCrop,
    width,
    height,
    view,
    lastFilter,
    canFilter,
    canTransform,
    lastTransform,
    onViewChange,
    onSelectAll,
    onDeselect,
    onInverse,
    onFeather,
    onImageSize,
    onCanvasSize,
    onRotate,
    onCrop,
    onTrim,
    onClearGuides,
    onFilter,
    onRepeatFilter,
    onTransform,
    onNumericTransform,
    onRepeatTransform,
    onClearTransform,
}: PsMenusProps) {
    const { t } = useTranslation();
    const theme = useCanvasTheme();
    const [dialog, setDialog] = useState<"" | "size" | "canvas" | "rotate" | "transform">("");
    const [form, setForm] = useState({ width: 1, height: 1, constrain: true, anchor: "center" as PsCanvasAnchor, angle: 0, transform: { ...PS_NUMERIC_TRANSFORM_DEFAULT } });
    const openDialog = (kind: "size" | "canvas" | "rotate") => {
        setForm((prev) => ({ ...prev, width: Math.max(1, Math.round(width)), height: Math.max(1, Math.round(height)), constrain: true, anchor: "center", angle: 0 }));
        setDialog(kind);
    };
    const item = (label: string, hint = ""): ReactNode => (
        <span className="flex w-full min-w-[180px] items-center justify-between gap-6">
            <span>{label}</span>
            {hint ? <span className="text-xs" style={{ color: theme.node.muted }}>{hint}</span> : null}
        </span>
    );
    const toggle = (label: string, active: boolean): ReactNode => (
        <span className="flex w-full min-w-[160px] items-center gap-2">
            {active ? <Check className="size-3.5" /> : <span className="size-3.5" />}
            <span>{label}</span>
        </span>
    );

    const selectItems: MenuProps["items"] = [
        { key: "all", label: item(t("canvas.ps.selectAll"), "Ctrl+A") },
        { key: "deselect", label: item(t("canvas.ps.deselect"), "Ctrl+D") },
        { key: "inverse", label: item(t("canvas.ps.selectInverse"), "Ctrl+Shift+I") },
        { type: "divider" },
        { key: "feather", label: item(t("canvas.ps.selectFeather")) },
    ];
    const imageItems: MenuProps["items"] = [
        { key: "size", label: item(t("canvas.ps.imageSize")) },
        { key: "canvas", label: item(t("canvas.ps.canvasSize")) },
        { type: "divider" },
        { key: "rotate-cw", label: item(t("canvas.ps.rotateCw")) },
        { key: "rotate-ccw", label: item(t("canvas.ps.rotateCcw")) },
        { key: "rotate-180", label: item(t("canvas.ps.rotate180")) },
        { key: "rotate-any", label: item(t("canvas.ps.rotateArbitrary")) },
        { type: "divider" },
        { key: "crop", label: item(t("canvas.ps.cropSelection")), disabled: !canCrop },
        { key: "trim", label: item(t("canvas.ps.trim")) },
    ];
    const viewItems: MenuProps["items"] = [
        { key: "rulers", label: toggle(t("canvas.ps.viewRulers"), view.rulers) },
        { key: "grid", label: toggle(t("canvas.ps.viewGrid"), view.grid) },
        { key: "guides", label: toggle(t("canvas.ps.viewGuides"), view.guides) },
        { key: "snap", label: toggle(t("canvas.ps.viewSnap"), view.snap) },
        { type: "divider" },
        { key: "clear-guides", label: item(t("canvas.ps.clearGuides")) },
    ];
    const filterItems: MenuProps["items"] = [
        { key: "repeat", label: item(lastFilter ? t("canvas.ps.filterLast", { name: t(PS_FILTER_BY_TYPE.get(lastFilter)?.labelKey || "") }) : t("canvas.ps.filterNone")), disabled: !lastFilter || !canFilter },
        { type: "divider" },
        ...PS_FILTER_GROUPS.flatMap((group, index) => {
            const entries = PS_FILTERS.filter((filter) => filter.group === group).map((filter) => ({ key: filter.type, label: t(filter.labelKey), disabled: !canFilter }));
            return index ? [{ type: "divider" as const }, ...entries] : entries;
        }),
    ];
    const onSelectClick: MenuProps["onClick"] = ({ key }) => {
        if (key === "all") onSelectAll();
        if (key === "deselect") onDeselect();
        if (key === "inverse") onInverse();
        if (key === "feather") onFeather();
    };
    const onImageClick: MenuProps["onClick"] = ({ key }) => {
        if (key === "size") openDialog("size");
        if (key === "canvas") openDialog("canvas");
        if (key === "rotate-any") openDialog("rotate");
        if (key === "rotate-cw") onRotate(90);
        if (key === "rotate-ccw") onRotate(-90);
        if (key === "rotate-180") onRotate(180);
        if (key === "crop") onCrop();
        if (key === "trim") onTrim();
    };
    const onViewClick: MenuProps["onClick"] = ({ key }) => {
        if (key === "rulers") onViewChange({ rulers: !view.rulers });
        if (key === "grid") onViewChange({ grid: !view.grid });
        if (key === "guides") onViewChange({ guides: !view.guides });
        if (key === "snap") onViewChange({ snap: !view.snap });
        if (key === "clear-guides") onClearGuides();
    };
    const onFilterClick: MenuProps["onClick"] = ({ key }) => {
        if (key === "repeat") onRepeatFilter();
        else onFilter(key as PsFilterType);
    };
    const editItems: MenuProps["items"] = [
        { key: "free", label: item(t("canvas.ps.transformFree"), "Ctrl+T"), disabled: !canTransform },
        { type: "divider" },
        ...PS_TRANSFORM_MODES.filter((mode) => mode !== "free").map((mode) => ({ key: mode, label: t(`canvas.ps.transform.${mode}`), disabled: !canTransform })),
        { type: "divider" },
        { key: "numeric", label: item(t("canvas.ps.transformNumeric")), disabled: !canTransform },
        { key: "repeat", label: item(t("canvas.ps.transformRepeat"), "Ctrl+Shift+T"), disabled: !lastTransform || !canTransform },
        { key: "clear", label: t("canvas.ps.transformClear"), disabled: !lastTransform || !canTransform },
    ];
    const onEditClick: MenuProps["onClick"] = ({ key }) => {
        if (key === "numeric") setDialog("transform");
        else if (key === "repeat") onRepeatTransform();
        else if (key === "clear") onClearTransform();
        else onTransform(key as PsTransformMode);
    };
    const renderMenu = (label: string, items: MenuProps["items"], onClick: MenuProps["onClick"]) => (
        <Dropdown menu={{ ...PS_MENU_POPUP, items, onClick }} placement="bottomLeft" disabled={disabled} styles={{ root: { zIndex: 1300 } }}>
            <Button size="small" type="text" className={MENU_BUTTON_CLASS} style={{ color: theme.node.text }} disabled={disabled}>
                {label}
                <ChevronDown className="size-3" />
            </Button>
        </Dropdown>
    );

    return (
        <>
            <span className="flex shrink-0 items-center gap-0.5">
                {renderMenu(t("canvas.ps.selectMenu"), selectItems, onSelectClick)}
                {renderMenu(t("canvas.ps.editMenu"), editItems, onEditClick)}
                {renderMenu(t("canvas.ps.imageMenu"), imageItems, onImageClick)}
                {renderMenu(t("canvas.ps.filterMenu"), filterItems, onFilterClick)}
                {renderMenu(t("canvas.ps.viewMenu"), viewItems, onViewClick)}
            </span>

            <Modal open={dialog === "size" || dialog === "canvas"} title={t(dialog === "size" ? "canvas.ps.imageSizeTitle" : "canvas.ps.canvasSizeTitle")} okText={t("canvas.ps.apply")} cancelText={t("canvas.ps.cancel")} onCancel={() => setDialog("")} onOk={() => { if (dialog === "size") onImageSize(Math.round(form.width), Math.round(form.height)); else onCanvasSize(Math.round(form.width), Math.round(form.height), form.anchor); setDialog(""); }} classNames={{ container: "glass-raised" }} styles={{ container: { background: "var(--glass-strong)" } }}>
                <ImageSettingsTheme theme={theme}>
                    <div className="flex flex-wrap items-center gap-2 py-2 text-sm" style={{ color: theme.node.text }}>
                        <InputNumber size="small" min={1} max={8192} value={form.width} aria-label={t("canvas.ps.width")} onChange={(value) => value !== null && setForm((prev) => ({ ...prev, width: Math.max(1, value), height: prev.constrain && dialog === "size" ? Math.max(1, Math.round((value * prev.height) / Math.max(1, prev.width))) : prev.height }))} />
                        <span>×</span>
                        <InputNumber size="small" min={1} max={8192} value={form.height} aria-label={t("canvas.ps.height")} onChange={(value) => value !== null && setForm((prev) => ({ ...prev, height: Math.max(1, value), width: prev.constrain && dialog === "size" ? Math.max(1, Math.round((value * prev.width) / Math.max(1, prev.height))) : prev.width }))} />
                    </div>
                    {dialog === "size" ? (
                        <div className="flex items-center gap-2 text-sm" style={{ color: theme.node.muted }}>
                            <Switch size="small" checked={form.constrain} onChange={(value) => setForm((prev) => ({ ...prev, constrain: value }))} />
                            {t("canvas.ps.constrainProportions")}
                        </div>
                    ) : (
                        <div className="space-y-1.5 py-1">
                            <span className="text-sm font-medium" style={{ color: theme.node.label }}>
                                {t("canvas.ps.anchor")}
                            </span>
                            <div className="grid w-fit grid-cols-3 gap-0.5">
                                {ANCHORS.flat().map((anchor) => (
                                    <button
                                        key={anchor}
                                        type="button"
                                        aria-label={anchor}
                                        className="size-6 rounded-[3px] border"
                                        style={{ borderColor: form.anchor === anchor ? theme.node.accent : theme.toolbar.border, background: form.anchor === anchor ? theme.node.accentSoft : "transparent" }}
                                        onClick={() => setForm((prev) => ({ ...prev, anchor }))}
                                    />
                                ))}
                            </div>
                        </div>
                    )}
                </ImageSettingsTheme>
            </Modal>

            <Modal
                open={dialog === "rotate"}
                title={t("canvas.ps.rotationTitle")}
                okText={t("canvas.ps.apply")}
                cancelText={t("canvas.ps.cancel")}
                onCancel={() => setDialog("")}
                onOk={() => {
                    onRotate(form.angle);
                    setDialog("");
                }}
                classNames={{ container: "glass-raised" }}
                styles={{ container: { background: "var(--glass-strong)" } }}
            >
                <ImageSettingsTheme theme={theme}>
                    <div className="flex items-center gap-2 py-2 text-sm" style={{ color: theme.node.text }}>
                        <InputNumber size="small" min={-180} max={180} value={form.angle} aria-label={t("canvas.ps.angle")} onChange={(value) => value !== null && setForm((prev) => ({ ...prev, angle: value }))} />
                        <span>°</span>
                    </div>
                </ImageSettingsTheme>
            </Modal>

            <Modal
                open={dialog === "transform"}
                title={t("canvas.ps.transformNumericTitle")}
                okText={t("canvas.ps.apply")}
                cancelText={t("canvas.ps.cancel")}
                onCancel={() => setDialog("")}
                onOk={() => {
                    onNumericTransform(form.transform);
                    setDialog("");
                }}
                classNames={{ container: "glass-raised" }}
                styles={{ container: { background: "var(--glass-strong)" } }}
            >
                <ImageSettingsTheme theme={theme}>
                    <div className="grid grid-cols-2 gap-1.5 py-2 text-sm" style={{ color: theme.node.text }}>
                        {(
                            [
                                ["dx", t("canvas.ps.transformDx")],
                                ["dy", t("canvas.ps.transformDy")],
                                ["scaleX", t("canvas.ps.transformScaleX")],
                                ["scaleY", t("canvas.ps.transformScaleY")],
                                ["rotation", t("canvas.ps.rotation")],
                                ["skewX", t("canvas.ps.transformSkewX")],
                                ["skewY", t("canvas.ps.transformSkewY")],
                            ] as [keyof PsNumericTransform, string][]
                        ).map(([key, label]) => (
                            <label key={key} className="flex min-w-0 items-center gap-1.5">
                                <span className="w-16 shrink-0" style={{ color: theme.node.label }}>
                                    {label}
                                </span>
                                <InputNumber size="small" className="!w-full" min={-8192} max={8192} value={form.transform[key]} aria-label={label} onChange={(value) => value !== null && setForm((prev) => ({ ...prev, transform: { ...prev.transform, [key]: value } }))} />
                            </label>
                        ))}
                    </div>
                </ImageSettingsTheme>
            </Modal>
        </>
    );
}
