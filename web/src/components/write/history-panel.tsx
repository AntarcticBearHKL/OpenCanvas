import { Popconfirm } from "antd";
import dayjs from "dayjs";
import { Camera, RotateCcw, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";

import { STUDIO_FLAT_BUTTON_CLASS } from "@/components/canvas/workspace/studio-chrome";
import { useCanvasTheme } from "@/hooks/use-canvas-theme";
import { docUnitFor, docUnitNodes } from "@/lib/write/outline";
import { useWriteUiStore } from "@/stores/use-write-ui-store";
import { useWritingProject, useWritingStore } from "@/stores/use-writing-store";

const CARD_CLASS = "flex w-52 max-w-[220px] shrink-0 flex-col gap-1 rounded-[2px] border p-2 text-sm";

export function HistoryPanel() {
    const { t } = useTranslation();
    const theme = useCanvasTheme();
    const projectId = useWriteUiStore((state) => state.projectId);
    const selectedOutlineId = useWriteUiStore((state) => state.selectedOutlineId);
    const project = useWritingProject(projectId ?? undefined);
    const snapshot = useWritingStore((state) => state.snapshot);
    const restoreRevision = useWritingStore((state) => state.restoreRevision);
    const deleteRevision = useWritingStore((state) => state.deleteRevision);

    if (!project) return null;
    const unit = docUnitFor(project, selectedOutlineId) ?? docUnitNodes(project)[0] ?? null;
    const revisions = unit ? project.revisions.filter((revision) => revision.outlineId === unit.id).slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt)) : [];

    return (
        <div className="flex min-h-0 flex-1 flex-col">
            <div className="flex shrink-0 items-center gap-2 px-3 py-1.5 text-sm">
                <span className="min-w-0 truncate" style={{ color: theme.node.muted }}>
                    {unit?.title ?? ""}
                </span>
                <button
                    type="button"
                    className={`${STUDIO_FLAT_BUTTON_CLASS} ml-auto`}
                    style={{ color: theme.node.text }}
                    disabled={!unit}
                    onClick={() => {
                        if (unit) snapshot(project.id, unit.id, t("writing.history.auto"));
                    }}
                >
                    <Camera className="size-3.5" />
                    {t("writing.history.snapshotNow")}
                </button>
            </div>
            {unit ? (
                <div className="thin-scrollbar flex min-h-0 flex-1 gap-2 overflow-x-auto px-3 pb-2">
                    <div className={CARD_CLASS} style={{ borderColor: theme.node.activeStroke, background: theme.node.panel, color: theme.node.text }}>
                        <span className="text-sm font-medium" style={{ color: theme.node.text }}>
                            {t("writing.history.current")}
                        </span>
                        <span className="text-xs tabular-nums" style={{ color: theme.node.muted }}>
                            {t("writing.history.words", { count: project.docs[unit.id]?.wordCount ?? 0 })}
                        </span>
                    </div>
                    {revisions.map((revision) => (
                        <div key={revision.id} className={CARD_CLASS} style={{ borderColor: theme.node.stroke, background: theme.node.panel, color: theme.node.text }}>
                            <span className="truncate font-medium">{revision.label}</span>
                            <span className="text-xs tabular-nums" style={{ color: theme.node.muted }}>
                                {dayjs(revision.createdAt).format("MM-DD HH:mm")}
                            </span>
                            <span className="text-xs tabular-nums" style={{ color: theme.node.muted }}>
                                {t("writing.history.words", { count: revision.wordCount })}
                            </span>
                            <div className="mt-auto flex items-center gap-1 pt-1">
                                <Popconfirm title={t("writing.history.restoreConfirm")} okText={t("writing.common.confirm")} cancelText={t("writing.common.cancel")} onConfirm={() => restoreRevision(project.id, revision.id)}>
                                    <button type="button" className={STUDIO_FLAT_BUTTON_CLASS} style={{ color: theme.node.accent }}>
                                        <RotateCcw className="size-3.5" />
                                        {t("writing.history.restore")}
                                    </button>
                                </Popconfirm>
                                <Popconfirm title={t("writing.history.deleteConfirm")} okText={t("writing.common.confirm")} cancelText={t("writing.common.cancel")} onConfirm={() => deleteRevision(project.id, revision.id)}>
                                    <button type="button" className={STUDIO_FLAT_BUTTON_CLASS} style={{ color: theme.node.danger }}>
                                        <Trash2 className="size-3.5" />
                                        {t("writing.history.delete")}
                                    </button>
                                </Popconfirm>
                            </div>
                        </div>
                    ))}
                    {revisions.length ? null : <div className="m-auto text-sm" style={{ color: theme.node.muted }}>{t("writing.history.empty")}</div>}
                </div>
            ) : (
                <div className="flex flex-1 items-center justify-center text-sm" style={{ color: theme.node.muted }}>{t("writing.history.empty")}</div>
            )}
        </div>
    );
}
