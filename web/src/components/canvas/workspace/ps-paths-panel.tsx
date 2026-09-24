import { useState } from "react";
import { Check, Copy, Eye, EyeOff, Plus, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";

import { ImageSettingsTheme } from "@/components/image-settings-panel";
import PsColorPicker from "@/components/canvas/workspace/ps-color-picker";
import { useCanvasTheme } from "@/hooks/use-canvas-theme";
import { STUDIO_FLAT_BUTTON_CLASS } from "@/components/canvas/workspace/studio-chrome";
import { createPsPath, psPathData } from "@/lib/canvas/ps-path";
import type { CanvasPsPath } from "@/types/canvas";

const FLAT_BUTTON_CLASS = STUDIO_FLAT_BUTTON_CLASS;

function PsPathThumbnail({ path, color }: { path: CanvasPsPath; color: string }) {
    const points = path.anchors;
    if (!points.length) return <span className="size-7 shrink-0 rounded-md border border-dashed" />;
    const xs = points.map((point) => point.x);
    const ys = points.map((point) => point.y);
    const x = Math.min(...xs);
    const y = Math.min(...ys);
    const size = Math.max(1, Math.max(Math.max(...xs) - x, Math.max(...ys) - y));
    return (
        <svg viewBox={`${x - size * 0.1} ${y - size * 0.1} ${size * 1.2} ${size * 1.2}`} className="size-7 shrink-0">
            <path d={psPathData(path)} fill="none" stroke={color} strokeWidth={size * 0.08} vectorEffect="non-scaling-stroke" />
        </svg>
    );
}

export function PsPathsPanel({
    paths,
    activeId,
    onActive,
    onPaths,
    onSelection,
    onFill,
    onStroke,
    color,
    onColor,
}: {
    paths: CanvasPsPath[];
    activeId: string;
    onActive: (id: string) => void;
    onPaths: (paths: CanvasPsPath[]) => void;
    onSelection: (path: CanvasPsPath) => void;
    onFill: (path: CanvasPsPath) => void;
    onStroke: (path: CanvasPsPath) => void;
    color: string;
    onColor: (hex: string) => void;
}) {
    const { t } = useTranslation();
    const theme = useCanvasTheme();
    const [renamingId, setRenamingId] = useState("");
    const [nameDraft, setNameDraft] = useState("");
    const active = paths.find((path) => path.id === activeId);
    const patch = (id: string, next: Partial<CanvasPsPath>) => onPaths(paths.map((path) => (path.id === id ? { ...path, ...next } : path)));

    return (
        <ImageSettingsTheme theme={theme}>
            <div className="thin-scrollbar min-h-0 flex-1 overflow-y-auto px-2 pb-2 glass-card" style={{ color: theme.node.text }}>
                <div className="flex items-center gap-1 py-1">
                    <button
                        type="button"
                        className={FLAT_BUTTON_CLASS}
                        style={{ color: theme.node.text }}
                        onClick={() => {
                            const created = createPsPath(t("canvas.ps.pathName", { count: paths.length + 1 }));
                            onPaths([...paths, created]);
                            onActive(created.id);
                        }}
                    >
                        <Plus className="size-3" />
                        {t("canvas.ps.pathNew")}
                    </button>
                    <button
                        type="button"
                        className={FLAT_BUTTON_CLASS}
                        style={{ color: theme.node.muted }}
                        disabled={!active}
                        onClick={() => {
                            if (!active) return;
                            const copy = createPsPath(`${active.name} ${t("canvas.ps.duplicateSuffix")}`, active.anchors.map((anchor) => ({ ...anchor, handleIn: { ...anchor.handleIn }, handleOut: { ...anchor.handleOut } })), active.closed);
                            onPaths([...paths, copy]);
                            onActive(copy.id);
                        }}
                    >
                        <Copy className="size-3" />
                        {t("canvas.ps.pathDuplicate")}
                    </button>
                    <button type="button" className={FLAT_BUTTON_CLASS} style={{ color: theme.node.danger }} disabled={!active} onClick={() => active && onPaths(paths.filter((path) => path.id !== active.id))}>
                        <Trash2 className="size-3" />
                        {t("canvas.ps.pathDelete")}
                    </button>
                </div>
                {paths.length ? (
                    paths.map((path) => (
                        <div key={path.id} className="flex w-full items-center gap-1 border-b px-1 py-0.5 text-sm transition hover:bg-hover" style={path.id === activeId ? { background: theme.toolbar.activeBg, color: theme.toolbar.activeText, borderColor: theme.toolbar.border, boxShadow: `inset 2px 0 0 0 ${theme.node.accent}` } : { borderColor: theme.toolbar.border }}>
                            <button type="button" className="grid size-5 shrink-0 place-items-center rounded-md transition hover:bg-hover" aria-label={t("canvas.ps.pathVisibility")} title={t("canvas.ps.pathVisibility")} onClick={() => patch(path.id, { visible: !path.visible })}>
                                {path.visible ? <Eye className="size-3" /> : <EyeOff className="size-3" />}
                            </button>
                            <button type="button" className="flex min-w-0 flex-1 items-center gap-1.5 text-left" onClick={() => onActive(path.id)}>
                                <PsPathThumbnail path={path} color="currentColor" />
                                {renamingId === path.id ? (
                                    <input
                                        autoFocus
                                        className="min-w-0 flex-1 rounded-md border bg-transparent px-1 text-sm"
                                        style={{ borderColor: theme.toolbar.border, color: theme.node.text }}
                                        value={nameDraft}
                                        onChange={(event) => setNameDraft(event.target.value)}
                                        onBlur={() => {
                                            if (nameDraft.trim()) patch(path.id, { name: nameDraft.trim() });
                                            setRenamingId("");
                                        }}
                                    />
                                ) : (
                                    <span className="min-w-0 flex-1 truncate" onDoubleClick={() => { setRenamingId(path.id); setNameDraft(path.name); }}>
                                        {path.name}
                                    </span>
                                )}
                                {path.id === activeId ? <Check className="size-3 shrink-0" /> : null}
                            </button>
                        </div>
                    ))
                ) : (
                    <p className="pt-1 text-sm glass-card" style={{ color: theme.node.muted }}>
                        {t("canvas.ps.pathEmpty")}
                    </p>
                )}
                <div className="mt-1 flex flex-wrap items-center gap-1 border-t pt-1.5" style={{ borderColor: theme.toolbar.border }}>
                    <button type="button" className={FLAT_BUTTON_CLASS} style={{ color: theme.node.text }} disabled={!active || active.anchors.length < 2} onClick={() => active && onSelection(active)}>
                        {t("canvas.ps.pathMakeSelection")}
                    </button>
                    <button type="button" className={FLAT_BUTTON_CLASS} style={{ color: theme.node.text }} disabled={!active || active.anchors.length < 2} onClick={() => active && onFill(active)}>
                        {t("canvas.ps.pathFill")}
                    </button>
                    <button type="button" className={FLAT_BUTTON_CLASS} style={{ color: theme.node.text }} disabled={!active || active.anchors.length < 2} onClick={() => active && onStroke(active)}>
                        {t("canvas.ps.pathStroke")}
                    </button>
                </div>
                <div className="flex items-center gap-1.5 pt-1.5" style={{ color: theme.node.label }}>
                    <span className="shrink-0 text-sm font-medium">{t("canvas.ps.pathPaintColor")}</span>
                    <PsColorPicker value={color} ariaLabel={t("canvas.ps.pathPaintColor")} onChange={onColor} />
                </div>
                <p className="pt-1 text-sm" style={{ color: theme.node.muted }}>
                    {t("canvas.ps.pathHint")}
                </p>
            </div>
        </ImageSettingsTheme>
    );
}
