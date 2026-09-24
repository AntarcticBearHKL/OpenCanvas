import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { App, Button, Empty, Input, Spin, Table } from "antd";
import { Check, Download, FileUp, FolderPlus, Pencil, Plus, Trash2, X } from "lucide-react";
import { useTranslation } from "react-i18next";

import { cn } from "@/lib/utils";
import { useCanvasProjectDelete } from "@/hooks/use-canvas-project-delete";
import { CanvasImportDialog } from "@/components/canvas/canvas-import-dialog";
import { CanvasProjectRow } from "@/components/canvas/canvas-project-row";
import { cleanupUnusedCanvasImages } from "@/services/image-storage";
import { useCanvasStore, type CanvasProject } from "@/stores/canvas/use-canvas-store";
import { useCanvasUiStore } from "@/stores/canvas/use-canvas-ui-store";
import { exportCanvasProjects } from "@/lib/canvas/canvas-export";

export default function CanvasPage() {
    const { modal } = App.useApp();
    const { t } = useTranslation();
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const [importOpen, setImportOpen] = useState(false);
    const autoOpenRef = useRef(false);
    const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
    const [editingGroupName, setEditingGroupName] = useState("");
    const [dragId, setDragId] = useState<string | null>(null);
    const [dropIndex, setDropIndex] = useState<number | null>(null);
    const draggingRef = useRef(false);
    const hydrated = useCanvasStore((state) => state.hydrated);
    const projects = useCanvasStore((state) => state.projects);
    const groups = useCanvasStore((state) => state.groups);
    const createProject = useCanvasStore((state) => state.createProject);
    const reorderProjects = useCanvasStore((state) => state.reorderProjects);
    const createGroup = useCanvasStore((state) => state.createGroup);
    const renameGroup = useCanvasStore((state) => state.renameGroup);
    const deleteGroup = useCanvasStore((state) => state.deleteGroup);
    const selectedIds = useCanvasUiStore((state) => state.selectedProjectIds);
    const { armedId, confirmDelete, cancel } = useCanvasProjectDelete();
    const selectedGroupId = useCanvasUiStore((state) => state.selectedGroupId);
    const setSelectedGroupId = useCanvasUiStore((state) => state.setSelectedGroupId);

    const selectedGroup = groups.find((group) => group.id === selectedGroupId) ?? null;
    const groupProjects = selectedGroup ? projects.filter((project) => project.groupId === selectedGroup.id) : [];

    const mode = searchParams.get("mode");
    const agentMode = mode === "new" || mode === "recent" || mode === "choose";
    const agentQuery = agentMode ? `?${searchParams.toString()}` : "";
    const enterProject = (id: string) => {
        navigate(`/canvas/${id}${agentQuery}`);
    };
    const createAndEnter = () => {
        if (!selectedGroup) return;
        enterProject(createProject(t("canvas.defaultTitle", { count: projects.length + 1 }), selectedGroup.id));
    };
    const handleDrop = () => {
        if (dragId && dropIndex !== null) {
            const ids = groupProjects.map((project) => project.id);
            const from = ids.indexOf(dragId);
            if (from >= 0) {
                ids.splice(from, 1);
                ids.splice(dropIndex > from ? dropIndex - 1 : dropIndex, 0, dragId);
                reorderProjects(ids);
            }
        }
        setDragId(null);
        setDropIndex(null);
    };
    const addGroup = () => {
        setSelectedGroupId(createGroup());
    };
    const saveGroupName = () => {
        if (editingGroupId) renameGroup(editingGroupId, editingGroupName);
        setEditingGroupId(null);
    };
    const removeGroup = (id: string) => {
        setEditingGroupId(null);
        modal.confirm({
            title: t("canvas.group.deleteTitle"),
            content: t("canvas.group.deleteDescription"),
            okText: t("common.delete"),
            okButtonProps: { danger: true },
            cancelText: t("common.cancel"),
            onOk: () => {
                deleteGroup(id);
                cleanupUnusedCanvasImages();
            },
        });
    };

    useEffect(() => {
        if (groups.some((group) => group.id === selectedGroupId)) return;
        setSelectedGroupId(groups[0]?.id ?? null);
    }, [groups, selectedGroupId, setSelectedGroupId]);

    useEffect(() => {
        if (!hydrated || autoOpenRef.current || (mode !== "new" && mode !== "recent")) return;
        autoOpenRef.current = true;
        const title = t("canvas.defaultTitle", { count: projects.length + 1 });
        if (mode === "recent" && projects[0]) return enterProject(projects[0].id);
        enterProject(createProject(title, groups[0]?.id ?? createGroup()));
    }, [createGroup, createProject, groups, hydrated, mode, projects, t]);

    if (hydrated && (mode === "new" || mode === "recent")) return <main className="flex h-full items-center justify-center bg-background text-sm text-muted-foreground">{t("canvas.opening")}</main>;

    return (
        <main className="flex h-full min-h-0 bg-background text-foreground dark:text-foreground">
            <aside className="flex w-60 shrink-0 flex-col border-r border-border glass-surface">
                <div className="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-border px-4">
                    <p className="text-sm font-semibold uppercase tracking-widest text-muted-foreground" style={{ margin: 0 }}>{t("canvas.library")}</p>
                    <Button type="text" size="small" shape="circle" icon={<Plus className="size-4" />} disabled={!hydrated} onClick={addGroup} aria-label={t("canvas.group.create")} title={t("canvas.group.create")} />
                </div>
                <div className="min-h-0 flex-1 space-y-1 overflow-y-auto p-2">
                    {groups.map((group) => (
                        <div key={group.id}>
                            {editingGroupId === group.id ? (
                                <div className="flex h-9 items-center gap-1 rounded-none border-b border-border bg-muted px-2">
                                    <Input
                                        size="small"
                                        className="min-w-0 flex-1 rounded-[2px]"
                                        value={editingGroupName}
                                        onChange={(event) => setEditingGroupName(event.target.value)}
                                        onKeyDown={(event) => {
                                            if (event.key === "Enter") saveGroupName();
                                            if (event.key === "Escape") setEditingGroupId(null);
                                        }}
                                        autoFocus
                                    />
                                    <Button type="text" size="small" shape="circle" icon={<Check className="size-3.5" />} onClick={saveGroupName} aria-label={t("common.save")} title={t("common.save")} />
                                    <Button type="text" size="small" shape="circle" icon={<X className="size-3.5" />} onClick={() => setEditingGroupId(null)} aria-label={t("common.cancel")} title={t("common.cancel")} />
                                </div>
                            ) : (
                                <div className={`group flex h-9 items-center rounded-none border-b border-border px-2 transition ${selectedGroupId === group.id ? "bg-brand-soft shadow-[inset_2px_0_0_0_var(--brand)]" : "hover:bg-hover"}`}>
                                    <button
                                        type="button"
                                        onClick={() => setSelectedGroupId(group.id)}
                                        className={`flex h-full min-w-0 flex-1 items-center gap-2 text-left text-sm ${selectedGroupId === group.id ? "font-medium text-foreground" : "text-muted-foreground"}`}
                                    >
                                        <span className="min-w-0 flex-1 truncate">{group.name}</span>
                                        <span className="shrink-0 text-xs text-muted-foreground group-hover:hidden dark:text-muted-foreground">{projects.filter((project) => project.groupId === group.id).length}</span>
                                    </button>
                                    <div className="hidden shrink-0 items-center group-hover:flex">
                                        <Button
                                            type="text"
                                            size="small"
                                            shape="circle"
                                            icon={<Pencil className="size-3.5" />}
                                            onClick={() => {
                                                setEditingGroupId(group.id);
                                                setEditingGroupName(group.name);
                                            }}
                                            aria-label={t("canvas.group.rename")}
                                            title={t("canvas.group.rename")}
                                        />
                                        <Button type="text" size="small" shape="circle" icon={<Trash2 className="size-3.5" />} onClick={() => removeGroup(group.id)} aria-label={t("canvas.group.delete")} title={t("canvas.group.delete")} />
                                    </div>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            </aside>

            <section className="flex min-w-0 flex-1 flex-col">
                <header className="shrink-0">
                    <div className="flex min-h-14 w-full flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-2 glass-surface">
                        <div className="flex min-w-0 items-center gap-2">
                            <h1 className="truncate text-lg font-semibold text-foreground" style={{ margin: 0 }}>{selectedGroup?.name ?? t("canvas.group.none")}</h1>
                            {selectedGroup ? <span className="shrink-0 text-xs text-muted-foreground">{t("canvas.group.count", { count: groupProjects.length })}</span> : null}
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                            {selectedIds.length ? (
                                <>
                                    <Button disabled={!hydrated} icon={<Download className="size-4" />} onClick={() => void exportCanvasProjects(projects.filter((project) => selectedIds.includes(project.id)), `${t("canvas.title")}-${selectedIds.length}`)}>
                                        {t("canvas.exportSelected")}
                                    </Button>
                                    <Button disabled={!hydrated} danger={armedId === "selected"} onClick={(event) => confirmDelete("selected", selectedIds, event.currentTarget)} onPointerLeave={cancel}>
                                        {armedId === "selected" ? t("canvas.project.confirmDelete") : t("canvas.deleteSelected")}
                                    </Button>
                                </>
                            ) : projects.length ? (
                                <Button disabled={!hydrated} danger={armedId === "all"} onClick={(event) => confirmDelete("all", projects.map((project) => project.id), event.currentTarget)} onPointerLeave={cancel}>
                                    {armedId === "all" ? t("canvas.project.confirmDelete") : t("canvas.deleteAll")}
                                </Button>
                            ) : null}
                            <Button disabled={!hydrated} icon={<FileUp className="size-4" />} onClick={() => setImportOpen(true)}>
                                {t("canvas.import")}
                            </Button>
                            <Button disabled={!hydrated || !selectedGroup} type="primary" icon={<Plus className="size-4" />} onClick={createAndEnter}>
                                {t("canvas.create")}
                            </Button>
                        </div>
                    </div>
                </header>

                <div className="min-h-0 flex-1 overflow-y-auto px-2 py-3 glass-card">
                    {!hydrated ? (
                        <div className="flex h-full items-center justify-center">
                            <Spin />
                        </div>
                    ) : !selectedGroup ? (
                        <div className="flex h-full items-center justify-center">
                            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t("canvas.group.createFirst")} className="py-16">
                                <Button type="primary" icon={<FolderPlus className="size-4" />} disabled={!hydrated} onClick={addGroup}>
                                    {t("canvas.group.create")}
                                </Button>
                            </Empty>
                        </div>
                    ) : groupProjects.length ? (
                        <Table<CanvasProject>
                            rowKey="id"
                            dataSource={groupProjects}
                            pagination={false}
                            className="[&_.ant-table]:!rounded-none [&_.ant-table]:!bg-transparent [&_.ant-table-container]:!rounded-none [&_.ant-table-thead>tr>th]:!rounded-none [&_.ant-table-thead>tr>th]:!bg-transparent"
                            rowClassName={(project, index) =>
                                cn(
                                    dragId === project.id && "[&>td]:bg-brand-soft",
                                    dropIndex === index && "[&>td]:border-t-2 [&>td]:border-t-primary",
                                    dropIndex === groupProjects.length && index === groupProjects.length - 1 && "[&>td]:border-b-2 [&>td]:border-b-primary",
                                )
                            }
                            onRow={(project, index = 0) => ({
                                draggable: true,
                                onDragStart: (event) => {
                                    draggingRef.current = true;
                                    setDragId(project.id);
                                    event.dataTransfer.effectAllowed = "move";
                                    event.dataTransfer.setData("text/plain", project.id);
                                },
                                onDragOver: (event) => {
                                    if (!dragId) return;
                                    event.preventDefault();
                                    event.dataTransfer.dropEffect = "move";
                                    const rect = event.currentTarget.getBoundingClientRect();
                                    setDropIndex(index + (event.clientY > rect.top + rect.height / 2 ? 1 : 0));
                                },
                                onDragEnd: () => {
                                    setDragId(null);
                                    setDropIndex(null);
                                    setTimeout(() => {
                                        draggingRef.current = false;
                                    }, 0);
                                },
                                onDrop: (event) => {
                                    event.preventDefault();
                                    handleDrop();
                                },
                                onClickCapture: (event) => {
                                    if (!draggingRef.current) return;
                                    event.stopPropagation();
                                    event.preventDefault();
                                },
                            })}
                            columns={[
                                {
                                    title: t("canvas.projects"),
                                    onHeaderCell: () => ({ style: { padding: "8px" } }),
                                    onCell: () => ({ style: { padding: 0 } }),
                                    render: (_, project) => <CanvasProjectRow project={project} />,
                                },
                            ]}
                        />
                    ) : (
                        <div className="flex h-full items-center justify-center">
                            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t("canvas.group.empty")} className="py-16">
                                <Button type="primary" icon={<Plus className="size-4" />} disabled={!hydrated} onClick={createAndEnter}>
                                    {t("canvas.create")}
                                </Button>
                            </Empty>
                        </div>
                    )}
                </div>
            </section>

            <CanvasImportDialog open={importOpen} onClose={() => setImportOpen(false)} />
        </main>
    );
}
