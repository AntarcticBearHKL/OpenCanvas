import { saveAs } from "file-saver";
import { ArrowLeft, Download, FileText, Focus, History, Info, LayoutGrid, Library } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";

import { DockArea, useDockLayout } from "@/components/canvas/dock/dock-panel";
import type { DockPanelDef } from "@/components/canvas/dock/dock-layout";
import { STUDIO_BAR_CLASS, STUDIO_DIVIDER_CLASS, STUDIO_ICON_BUTTON_CLASS, STUDIO_OPTIONS_CLASS } from "@/components/canvas/workspace/studio-chrome";
import { WriteMenus } from "@/components/write/write-menus";
import { BoardPanel } from "@/components/write/board-panel";
import { CodexPanel } from "@/components/write/codex-panel";
import { HistoryPanel } from "@/components/write/history-panel";
import { InspectorPanel } from "@/components/write/inspector-panel";
import { OutlinePanel } from "@/components/write/outline-panel";
import { ProseEditor } from "@/components/write/prose-editor";
import { useCanvasTheme } from "@/hooks/use-canvas-theme";
import { fountainFileName, toFountain } from "@/lib/write/fountain";
import { WRITE_TEMPLATES } from "@/lib/write/presets";
import { useWriteUiStore } from "@/stores/use-write-ui-store";
import { useWritingProject, useWritingStore, writeProjectWordCount } from "@/stores/use-writing-store";

const WRITE_DOCK_PANELS: DockPanelDef[] = [
    { id: "outline", labelKey: "writing.panel.outline", icon: FileText, dock: "left" },
    { id: "codex", labelKey: "writing.panel.codex", icon: Library, dock: "left" },
    { id: "inspector", labelKey: "writing.panel.inspector", icon: Info, dock: "right" },
    { id: "board", labelKey: "writing.panel.board", icon: LayoutGrid, dock: "bottom" },
    { id: "history", labelKey: "writing.panel.history", icon: History, dock: "bottom" },
];

function renderWritePanel(id: string) {
    if (id === "outline") return <OutlinePanel />;
    if (id === "codex") return <CodexPanel />;
    if (id === "inspector") return <InspectorPanel />;
    if (id === "board") return <BoardPanel />;
    if (id === "history") return <HistoryPanel />;
    return null;
}

export function WriteStudio() {
    const { t } = useTranslation();
    const theme = useCanvasTheme();
    const navigate = useNavigate();
    const projectId = useWriteUiStore((state) => state.projectId);
    const setProject = useWriteUiStore((state) => state.setProject);
    const focusMode = useWriteUiStore((state) => state.focusMode);
    const setFocusMode = useWriteUiStore((state) => state.setFocusMode);
    const project = useWritingProject(projectId ?? undefined);
    const renameProject = useWritingStore((state) => state.renameProject);
    const dock = useDockLayout("write", WRITE_DOCK_PANELS);
    const [title, setTitle] = useState(project?.title ?? "");

    useEffect(() => {
        setTitle(project?.title ?? "");
    }, [project?.id, project?.title]);

    useEffect(() => {
        if (projectId && !project) setProject(null);
    }, [project, projectId, setProject]);

    if (!project) return null;

    const saveTitle = () => {
        if (title.trim() && title !== project.title) renameProject(project.id, title);
    };

    return (
        <main className="flex min-h-0 min-w-0 flex-1 flex-col" style={{ background: theme.canvas.background, color: theme.node.text }}>
            <header className={`${STUDIO_BAR_CLASS} h-10 shrink-0`} style={{ borderBottom: `1px solid ${theme.toolbar.border}` }}>
                <button
                    type="button"
                    className={STUDIO_ICON_BUTTON_CLASS}
                    onClick={() => navigate("/write")}
                    aria-label={t("writing.studio.back")}
                    title={t("writing.studio.back")}
                >
                    <ArrowLeft className="size-4" />
                </button>
                <input
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    onBlur={saveTitle}
                    onKeyDown={(event) => {
                        if (event.key === "Enter") event.currentTarget.blur();
                    }}
                    className="min-w-0 max-w-[280px] flex-1 bg-transparent text-sm font-semibold outline-none"
                    style={{ color: theme.node.text }}
                    aria-label={t("writing.studio.titleLabel")}
                />
                <span className="shrink-0 text-sm" style={{ color: theme.node.muted }}>{t(WRITE_TEMPLATES[project.template].labelKey)}</span>
                <span className={STUDIO_DIVIDER_CLASS} style={{ background: theme.toolbar.border }} />
                <span className="shrink-0 text-sm tabular-nums" style={{ color: theme.node.muted }}>
                    {t("writing.studio.wordCount", { count: writeProjectWordCount(project) })}
                </span>
                <div className="ml-auto flex items-center gap-1">
                    <button
                        type="button"
                        className={STUDIO_ICON_BUTTON_CLASS}
                        onClick={() => setFocusMode(!focusMode)}
                        aria-label={t(focusMode ? "writing.editor.exitFocus" : "writing.editor.focus")}
                        title={t(focusMode ? "writing.editor.exitFocus" : "writing.editor.focus")}
                    >
                        <Focus className="size-4" />
                    </button>
                    <button
                        type="button"
                        className={STUDIO_ICON_BUTTON_CLASS}
                        onClick={() => saveAs(new Blob([toFountain(project)], { type: "text/plain;charset=utf-8" }), fountainFileName(project))}
                        aria-label={t("writing.export.fountain")}
                        title={t("writing.export.fountain")}
                    >
                        <Download className="size-4" />
                    </button>
                </div>
            </header>
            <div className={STUDIO_OPTIONS_CLASS} style={{ color: theme.node.muted, borderColor: theme.toolbar.border }}>
                <WriteMenus defs={WRITE_DOCK_PANELS} layout={dock.layout} onToggle={dock.toggle} onReset={dock.reset} />
            </div>
            {focusMode ? (
                <div className="flex min-h-0 min-w-0 flex-1 flex-col">
                    <ProseEditor />
                </div>
            ) : (
                <DockArea defs={WRITE_DOCK_PANELS} layout={dock.layout} renderPanel={renderWritePanel} onActivate={dock.activate} onMove={dock.move} onResize={dock.resize}>
                    <ProseEditor />
                </DockArea>
            )}
        </main>
    );
}
