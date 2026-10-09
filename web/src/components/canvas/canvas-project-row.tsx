import { useRef, useState, type DragEvent } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button, Dropdown, Input, type MenuProps } from "antd";
import { Check, Clock, Download, FolderInput, Pencil, Trash2, X } from "lucide-react";
import { useTranslation } from "react-i18next";

import { useCanvasProjectDelete } from "@/hooks/use-canvas-project-delete";
import { useCanvasStore, type CanvasProject } from "@/stores/canvas/use-canvas-store";
import { useCanvasUiStore } from "@/stores/canvas/use-canvas-ui-store";
import { exportCanvasProjects } from "@/lib/canvas/canvas-export";

let dragProjectId: string | null = null;

export function CanvasProjectCard({ project }: { project: CanvasProject }) {
    const { i18n, t } = useTranslation();
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const cardRef = useRef<HTMLDivElement>(null);
    const draggingRef = useRef(false);
    const [dragOver, setDragOver] = useState(false);
    const [moveMenuOpen, setMoveMenuOpen] = useState(false);
    const groups = useCanvasStore((state) => state.groups);
    const projects = useCanvasStore((state) => state.projects);
    const renameProject = useCanvasStore((state) => state.renameProject);
    const setProjectGroup = useCanvasStore((state) => state.setProjectGroup);
    const reorderProjects = useCanvasStore((state) => state.reorderProjects);
    const selectedIds = useCanvasUiStore((state) => state.selectedProjectIds);
    const editingId = useCanvasUiStore((state) => state.editingProjectId);
    const editingTitle = useCanvasUiStore((state) => state.editingProjectTitle);
    const startEditing = useCanvasUiStore((state) => state.startEditingProject);
    const setEditingTitle = useCanvasUiStore((state) => state.setEditingProjectTitle);
    const stopEditing = useCanvasUiStore((state) => state.stopEditingProject);
    const { armedId, confirmDelete, cancel } = useCanvasProjectDelete();
    const editing = editingId === project.id;
    const selected = selectedIds.includes(project.id);
    const armed = armedId === project.id;
    const open = () => {
        navigate(`/canvas/${project.id}${searchParams.toString() ? `?${searchParams.toString()}` : ""}`);
    };
    const saveTitle = () => {
        renameProject(project.id, editingTitle);
        stopEditing();
    };
    const drop = (event: DragEvent<HTMLDivElement>) => {
        event.preventDefault();
        setDragOver(false);
        if (!dragProjectId || dragProjectId === project.id) return;
        const ids = projects.filter((item) => item.groupId === project.groupId).map((item) => item.id);
        const from = ids.indexOf(dragProjectId);
        if (from < 0) return;
        ids.splice(from, 1);
        const rect = event.currentTarget.getBoundingClientRect();
        ids.splice(ids.indexOf(project.id) + (event.clientY > rect.top + rect.height / 2 ? 1 : 0), 0, dragProjectId);
        reorderProjects(ids);
        dragProjectId = null;
    };
    const otherGroups = groups.filter((group) => group.id !== project.groupId);
    const moveItems: MenuProps["items"] = otherGroups.map((group) => ({
        key: group.id,
        label: group.name,
        onClick: () => setProjectGroup(project.id, group.id),
    }));
    const cardClass = `group relative flex cursor-pointer flex-col justify-between overflow-hidden rounded-xl border p-4 transition-all ${
        selected ? "border-brand bg-brand-soft" : "border-border bg-card hover:border-brand hover:shadow-md"
    }${dragOver && !selected ? " border-brand" : ""}`;

    return (
        <div
            ref={cardRef}
            draggable
            onDragStart={(event) => {
                draggingRef.current = true;
                dragProjectId = project.id;
                event.dataTransfer.effectAllowed = "move";
                event.dataTransfer.setData("text/plain", project.id);
            }}
            onDragOver={(event) => {
                if (!dragProjectId || dragProjectId === project.id) return;
                event.preventDefault();
                event.dataTransfer.dropEffect = "move";
                setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={drop}
            onDragEnd={() => {
                dragProjectId = null;
                setDragOver(false);
                setTimeout(() => {
                    draggingRef.current = false;
                }, 0);
            }}
            onClickCapture={(event) => {
                if (!draggingRef.current) return;
                event.stopPropagation();
                event.preventDefault();
            }}
            onClick={() => !editing && open()}
            className={cardClass}
        >
            <div>
                <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                        {editing ? (
                            <Input className="w-full" size="small" value={editingTitle} onChange={(event) => setEditingTitle(event.target.value)} onKeyDown={(event) => event.key === "Enter" && saveTitle()} autoFocus />
                        ) : (
                            <h3 className="truncate text-sm font-semibold text-foreground transition group-hover:text-brand">{project.title}</h3>
                        )}
                        <p className="mt-0.5 text-xs text-muted-foreground">{t("canvas.project.stats", { nodes: project.nodes.length, connections: project.connections.length })}</p>
                    </div>
                    <div className="flex items-center gap-1" onClick={(event) => event.stopPropagation()}>
                        {editing ? (
                            <>
                                <Button type="text" size="small" shape="circle" icon={<Check className="size-3.5" />} onClick={saveTitle} aria-label={t("canvas.project.saveName")} title={t("canvas.project.saveName")} />
                                <Button type="text" size="small" shape="circle" icon={<X className="size-3.5" />} onClick={stopEditing} aria-label={t("canvas.project.cancelRename")} title={t("canvas.project.cancelRename")} />
                            </>
                        ) : (
                            <>
                                {!armed && otherGroups.length > 0 && (
                                    <Dropdown
                                        menu={{ items: moveItems }}
                                        trigger={["click"]}
                                        placement="bottomRight"
                                        open={moveMenuOpen}
                                        onOpenChange={setMoveMenuOpen}
                                    >
                                        <Button
                                            type="text"
                                            size="small"
                                            shape="circle"
                                            icon={<FolderInput className="size-3.5" />}
                                            className={`text-muted-foreground transition hover:text-foreground ${moveMenuOpen ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}
                                            title="Move to library"
                                        />
                                    </Dropdown>
                                )}
                                {!armed && (
                                    <Button
                                        type="text"
                                        size="small"
                                        shape="circle"
                                        icon={<Download className="size-3.5" />}
                                        className="text-muted-foreground opacity-0 transition group-hover:opacity-100 hover:text-foreground"
                                        onClick={() => void exportCanvasProjects([project], project.title || t("canvas.title"))}
                                        title="Export"
                                    />
                                )}
                                {!armed && (
                                    <Button
                                        type="text"
                                        size="small"
                                        shape="circle"
                                        icon={<Pencil className="size-3.5" />}
                                        className="text-muted-foreground opacity-0 transition group-hover:opacity-100 hover:text-foreground"
                                        onClick={() => startEditing(project.id, project.title)}
                                        title="Rename"
                                    />
                                )}
                                <Button
                                    type="text"
                                    size="small"
                                    shape={armed ? "default" : "circle"}
                                    danger={armed}
                                    className={armed ? "!h-7 !px-2 !text-xs font-semibold" : "text-muted-foreground opacity-0 transition group-hover:opacity-100 hover:text-danger"}
                                    icon={armed ? undefined : <Trash2 className="size-3.5" />}
                                    onClick={(event) => confirmDelete(project.id, [project.id], event.currentTarget)}
                                    onPointerLeave={cancel}
                                    title={armed ? "Click again to confirm delete" : "Delete canvas"}
                                >
                                    {armed ? "Confirm Delete" : null}
                                </Button>
                            </>
                        )}
                    </div>
                </div>
            </div>
            <div className="mt-4 flex items-center justify-between border-t border-border/60 pt-2 text-[11px] text-muted-foreground">
                <span className="flex items-center gap-1">
                    <Clock className="size-3" />
                    {new Date(project.updatedAt).toLocaleString(i18n.resolvedLanguage, { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}
                </span>
                <span className="font-medium text-brand opacity-0 transition group-hover:opacity-100">Open Editor →</span>
            </div>
        </div>
    );
}
