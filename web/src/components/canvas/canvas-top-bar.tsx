import { useEffect, useRef } from "react";
import { Frame, House, LayoutGrid, Music2, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { Tooltip } from "antd";
import { useTranslation } from "react-i18next";

import { UserStatusActions } from "@/components/layout/user-status-actions";
import { canvasThemes, frostedSurfaceClass } from "@/lib/canvas-theme";
import { useCanvasSidePanelStore } from "@/stores/use-canvas-side-panel-store";
import { useThemeStore } from "@/stores/use-theme-store";
import { CANVAS_WORKSPACES, type CanvasWorkspace } from "@/types/canvas";

const WORKSPACE_ICONS = { canvas: LayoutGrid, image: Frame, audio: Music2 };

export function CanvasTopBar({
    title,
    titleDraft,
    isTitleEditing,
    onTitleDraftChange,
    onStartTitleEditing,
    onFinishTitleEditing,
    onCancelTitleEditing,
    onProjects,
    workspace,
    onWorkspaceChange,
}: {
    title: string;
    titleDraft: string;
    isTitleEditing: boolean;
    onTitleDraftChange: (value: string) => void;
    onStartTitleEditing: () => void;
    onFinishTitleEditing: () => void;
    onCancelTitleEditing: () => void;
    onProjects: () => void;
    workspace: CanvasWorkspace;
    onWorkspaceChange: (workspace: CanvasWorkspace) => void;
}) {
    const colorTheme = useThemeStore((state) => state.theme);
    const { t } = useTranslation();
    const theme = canvasThemes[colorTheme];
    const titleRef = useRef<HTMLDivElement>(null);
    const sidePanelOpen = useCanvasSidePanelStore((state) => state.panelOpen);
    const toggleSidePanel = useCanvasSidePanelStore((state) => state.togglePanel);

    useEffect(() => {
        if (!isTitleEditing) return;
        const close = (event: PointerEvent) => {
            if (!titleRef.current?.contains(event.target as Node)) onFinishTitleEditing();
        };
        document.addEventListener("pointerdown", close, true);
        return () => document.removeEventListener("pointerdown", close, true);
    }, [isTitleEditing, onFinishTitleEditing]);

    return (
        <div className="pointer-events-none absolute left-0 right-0 top-0 z-[80]">
            <div className={`pointer-events-none flex h-14 w-full items-center justify-between gap-2 border-b px-3 ${frostedSurfaceClass}`} style={{ background: theme.toolbar.panel, borderColor: theme.toolbar.border }}>
                <div className="pointer-events-auto flex min-w-0 items-center gap-1">
                    <Tooltip title={sidePanelOpen ? t("canvas.collapsePanel") : t("canvas.expandPanel")}>
                        <button
                            type="button"
                            onClick={toggleSidePanel}
                            aria-label={sidePanelOpen ? t("canvas.collapsePanel") : t("canvas.expandPanel")}
                            className="grid size-7 place-items-center rounded-full transition hover:bg-black/5 dark:hover:bg-white/10"
                            style={{ color: theme.node.text }}
                        >
                            {sidePanelOpen ? <PanelLeftClose className="size-4" /> : <PanelLeftOpen className="size-4" />}
                        </button>
                    </Tooltip>
                    <Tooltip title={t("canvas.projects")}>
                        <button type="button" onClick={onProjects} aria-label={t("canvas.projects")} className="grid size-7 place-items-center rounded-full transition hover:bg-black/5 dark:hover:bg-white/10" style={{ color: theme.node.text }}>
                            <House className="size-4" />
                        </button>
                    </Tooltip>

                    <div ref={titleRef} className="flex min-w-0 items-center gap-2 px-1">
                        {isTitleEditing ? (
                            <input
                                autoFocus
                                value={titleDraft}
                                onChange={(event) => onTitleDraftChange(event.target.value)}
                                onBlur={onFinishTitleEditing}
                                onKeyDown={(event) => {
                                    if (event.key === "Enter") onFinishTitleEditing();
                                    if (event.key === "Escape") onCancelTitleEditing();
                                }}
                                className="max-w-[88px] bg-transparent p-0 text-left text-lg font-semibold tracking-normal outline-none sm:max-w-[160px] lg:max-w-[280px]"
                                style={{ color: theme.node.text }}
                            />
                        ) : (
                            <button
                                type="button"
                                className="max-w-[88px] truncate border-b border-dashed border-transparent text-left text-lg font-semibold tracking-normal transition hover:border-current sm:max-w-[160px] lg:max-w-[280px]"
                                onDoubleClick={onStartTitleEditing}
                                title={t("canvas.renameHint")}
                            >
                                {title}
                            </button>
                        )}
                    </div>
                </div>

                <div className="pointer-events-auto flex min-w-0 flex-1 items-center justify-center gap-0.5 px-1">
                    {CANVAS_WORKSPACES.map((item) => {
                        const Icon = WORKSPACE_ICONS[item];
                        const active = workspace === item;
                        return (
                            <button
                                key={item}
                                type="button"
                                className="flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-1 text-xs transition hover:bg-black/5 sm:px-2.5 dark:hover:bg-white/10"
                                style={active ? { background: theme.toolbar.activeBg, color: theme.toolbar.activeText } : { color: theme.node.muted }}
                                aria-current={active ? "page" : undefined}
                                aria-label={t(`canvas.workspace.${item}`)}
                                title={t(`canvas.workspace.${item}`)}
                                onClick={() => onWorkspaceChange(item)}
                            >
                                <Icon className="size-3.5 shrink-0" />
                                <span className="hidden sm:inline">{t(`canvas.workspace.${item}`)}</span>
                            </button>
                        );
                    })}
                </div>

                <div className="pointer-events-auto flex shrink-0 items-center gap-1.5 pr-1">
                    <UserStatusActions variant="canvas" />
                </div>
            </div>
        </div>
    );
}
