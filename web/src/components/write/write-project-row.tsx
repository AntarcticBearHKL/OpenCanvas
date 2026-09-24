import { BookOpen, Check, FolderInput, Pencil, Trash2, X } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button, Dropdown, Input } from "antd";
import dayjs from "dayjs";
import { useTranslation } from "react-i18next";

import { flattenOutline } from "@/lib/write/outline";
import { WRITE_TEMPLATES } from "@/lib/write/presets";
import { useWriteUiStore } from "@/stores/use-write-ui-store";
import { useWritingStore, writeProjectWordCount, type WriteProject } from "@/stores/use-writing-store";

export function WriteProjectRow({ project }: { project: WriteProject }) {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const groups = useWritingStore((state) => state.groups);
    const renameProject = useWritingStore((state) => state.renameProject);
    const setProjectGroup = useWritingStore((state) => state.setProjectGroup);
    const deleteProjects = useWritingStore((state) => state.deleteProjects);
    const selectedIds = useWriteUiStore((state) => state.selectedWorkIds);
    const setWorksSelected = useWriteUiStore((state) => state.setWorksSelected);
    const toggleSelected = useWriteUiStore((state) => state.toggleWorkSelected);
    const [editing, setEditing] = useState(false);
    const [draftTitle, setDraftTitle] = useState(project.title);
    const [armed, setArmed] = useState(false);
    const selected = selectedIds.includes(project.id);
    const open = () => navigate(`/write/${project.id}`);
    const startEditing = () => {
        setDraftTitle(project.title);
        setEditing(true);
    };
    const saveTitle = () => {
        renameProject(project.id, draftTitle);
        setEditing(false);
    };
    const remove = () => {
        if (!armed) {
            setArmed(true);
            return;
        }
        setArmed(false);
        deleteProjects([project.id]);
        setWorksSelected(selectedIds.filter((id) => id !== project.id));
    };

    return (
        <div
            className={`flex h-14 w-full cursor-pointer items-center gap-2 border-b border-border px-2 transition last:border-b-0 ${selected ? "bg-brand-soft hover:bg-brand-soft" : "hover:bg-hover"}`}
            onClick={() => !editing && open()}
        >
            <input
                type="checkbox"
                checked={selected}
                onClick={(event) => event.stopPropagation()}
                onChange={(event) => toggleSelected(project.id, event.target.checked)}
                className="size-4 shrink-0 accent-brand"
                aria-label={t("writing.library.select", { name: project.title })}
            />
            {editing ? (
                <Input className="min-w-0 flex-1" size="small" value={draftTitle} onChange={(event) => setDraftTitle(event.target.value)} onKeyDown={(event) => event.key === "Enter" && saveTitle()} autoFocus />
            ) : (
                <button
                    type="button"
                    className="min-w-0 shrink cursor-pointer truncate text-left text-sm font-medium text-foreground"
                    onClick={(event) => {
                        event.stopPropagation();
                        open();
                    }}
                >
                    {project.title}
                </button>
            )}
            <span className="shrink-0 rounded-md border border-border px-1.5 py-0.5 text-xs text-muted-foreground">{t(WRITE_TEMPLATES[project.template].labelKey)}</span>
            <p className="hidden shrink-0 whitespace-nowrap text-sm text-muted-foreground lg:block dark:text-muted-foreground" style={{ margin: 0 }}>
                {t("writing.studio.wordCount", { count: writeProjectWordCount(project) })}
                <span className="mx-1.5">·</span>
                {t("writing.library.nodes", { count: flattenOutline(project.outline).length })}
                <span className="mx-1.5">·</span>
                {t("writing.library.updated", { date: dayjs(project.updatedAt).format("MM-DD HH:mm") })}
            </p>
            <div className="min-w-0 flex-1" />
            <div className="flex shrink-0 items-center gap-1" onClick={(event) => event.stopPropagation()}>
                {editing ? (
                    <>
                        <Button type="text" size="small" shape="circle" icon={<Check className="size-4" />} onClick={saveTitle} aria-label={t("writing.common.confirm")} title={t("writing.common.confirm")} />
                        <Button type="text" size="small" shape="circle" icon={<X className="size-4" />} onClick={() => setEditing(false)} aria-label={t("writing.common.cancel")} title={t("writing.common.cancel")} />
                    </>
                ) : (
                    <>
                        <Button type="text" size="small" shape="circle" icon={<BookOpen className="size-4" />} onClick={open} aria-label={t("writing.library.open")} title={t("writing.library.open")} />
                        <Dropdown
                            trigger={["click"]}
                            menu={{
                                items: groups.map((group) => ({ key: group.id, label: group.name })),
                                selectable: true,
                                selectedKeys: [project.groupId ?? ""],
                                onClick: ({ key }) => setProjectGroup(project.id, key),
                            }}
                        >
                            <Button type="text" size="small" shape="circle" icon={<FolderInput className="size-4" />} aria-label={t("writing.group.move")} title={t("writing.group.move")} />
                        </Dropdown>
                        <Button type="text" size="small" shape="circle" icon={<Pencil className="size-4" />} onClick={startEditing} aria-label={t("writing.library.rename")} title={t("writing.library.rename")} />
                        <Button
                            type="text"
                            size="small"
                            shape={armed ? "default" : "circle"}
                            danger={armed}
                            className={armed ? "!px-2 !text-sm" : undefined}
                            icon={armed ? undefined : <Trash2 className="size-4" />}
                            onClick={remove}
                            onPointerLeave={() => setArmed(false)}
                            aria-label={t(armed ? "writing.library.confirmDelete" : "writing.library.delete")}
                            title={t(armed ? "writing.library.confirmDelete" : "writing.library.delete")}
                        >
                            {armed ? t("writing.library.confirmDelete") : null}
                        </Button>
                    </>
                )}
            </div>
        </div>
    );
}
