import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { App, Button, Empty, Input, Modal, Select, Spin, Table } from "antd";
import { saveAs } from "file-saver";
import { Check, Download, FilePlus2, FolderPlus, Pencil, Plus, Trash2, X } from "lucide-react";
import { useTranslation } from "react-i18next";

import { WriteProjectRow } from "@/components/write/write-project-row";
import { WriteStudio } from "@/components/write/write-studio";
import { useCanvasTheme } from "@/hooks/use-canvas-theme";
import { cn } from "@/lib/utils";
import { fountainFileName, toFountain } from "@/lib/write/fountain";
import { WRITE_TEMPLATES } from "@/lib/write/presets";
import { useWriteUiStore } from "@/stores/use-write-ui-store";
import { useWritingStore, type WriteProject } from "@/stores/use-writing-store";
import type { WriteTemplate } from "@/types/writing";

export default function WritePage() {
    const { modal } = App.useApp();
    const { t } = useTranslation();
    const navigate = useNavigate();
    const theme = useCanvasTheme();
    const { id } = useParams<{ id: string }>();
    const setProject = useWriteUiStore((state) => state.setProject);
    const hydrated = useWritingStore((state) => state.hydrated);
    const projects = useWritingStore((state) => state.projects);
    const groups = useWritingStore((state) => state.groups);
    const createProject = useWritingStore((state) => state.createProject);
    const deleteProjects = useWritingStore((state) => state.deleteProjects);
    const reorderProjects = useWritingStore((state) => state.reorderProjects);
    const createGroup = useWritingStore((state) => state.createGroup);
    const renameGroup = useWritingStore((state) => state.renameGroup);
    const deleteGroup = useWritingStore((state) => state.deleteGroup);
    const selectedIds = useWriteUiStore((state) => state.selectedWorkIds);
    const setWorksSelected = useWriteUiStore((state) => state.setWorksSelected);
    const selectedGroupId = useWriteUiStore((state) => state.selectedGroupId);
    const setSelectedGroupId = useWriteUiStore((state) => state.setSelectedGroupId);
    const [createOpen, setCreateOpen] = useState(false);
    const [draftTitle, setDraftTitle] = useState("");
    const [draftTemplate, setDraftTemplate] = useState<WriteTemplate>("novel");
    const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
    const [editingGroupName, setEditingGroupName] = useState("");
    const [dragId, setDragId] = useState<string | null>(null);
    const [dropIndex, setDropIndex] = useState<number | null>(null);
    const [armedId, setArmedId] = useState<string | null>(null);
    const draggingRef = useRef(false);

    useEffect(() => {
        setProject(id ?? null);
    }, [id, setProject]);

    useEffect(() => {
        if (groups.some((group) => group.id === selectedGroupId)) return;
        setSelectedGroupId(groups[0]?.id ?? null);
    }, [groups, selectedGroupId, setSelectedGroupId]);

    if (id) {
        const exists = projects.some((project) => project.id === id);
        if (!exists) {
            return (
                <div className="flex flex-1 items-center justify-center text-xs text-muted-foreground">
                    <Button type="text" onClick={() => navigate("/write")}>
                        {t("writing.studio.missing")}
                    </Button>
                </div>
            );
        }
        return <WriteStudio />;
    }

    const selectedGroup = groups.find((group) => group.id === selectedGroupId) ?? null;
    const groupProjects = selectedGroup ? projects.filter((project) => project.groupId === selectedGroup.id) : [];

    const openCreate = () => {
        setDraftTitle("");
        setDraftTemplate("novel");
        setCreateOpen(true);
    };
    const submitCreate = () => {
        const created = createProject(draftTitle, draftTemplate, selectedGroup?.id ?? null);
        setCreateOpen(false);
        navigate(`/write/${created}`);
    };
    const addGroup = () => {
        setSelectedGroupId(createGroup());
    };
    const saveGroupName = () => {
        if (editingGroupId) renameGroup(editingGroupId, editingGroupName);
        setEditingGroupId(null);
    };
    const removeGroup = (groupId: string) => {
        setEditingGroupId(null);
        modal.confirm({
            title: t("writing.group.deleteTitle"),
            content: t("writing.group.deleteDescription"),
            okText: t("writing.common.delete"),
            okButtonProps: { danger: true },
            cancelText: t("writing.common.cancel"),
            onOk: () => deleteGroup(groupId),
        });
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
    const exportSelected = () => {
        projects
            .filter((project) => selectedIds.includes(project.id))
            .forEach((project) => saveAs(new Blob([toFountain(project)], { type: "text/plain;charset=utf-8" }), fountainFileName(project)));
    };
    const deleteSelected = () => {
        if (armedId !== "selected") {
            setArmedId("selected");
            return;
        }
        setArmedId(null);
        deleteProjects(selectedIds);
        setWorksSelected([]);
    };
    const deleteAll = () => {
        if (armedId !== "all") {
            setArmedId("all");
            return;
        }
        setArmedId(null);
        deleteProjects(projects.map((project) => project.id));
        setWorksSelected([]);
    };

    return (
        <main className="flex h-full min-h-0 bg-background text-foreground dark:text-foreground">
            <aside className="glass-surface flex w-60 shrink-0 flex-col border-r border-border">
                <div className="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-border px-4">
                    <p className="text-sm font-semibold uppercase tracking-widest text-muted-foreground" style={{ margin: 0 }}>{t("writing.library.title")}</p>
                    <Button type="text" size="small" shape="circle" icon={<Plus className="size-4" />} disabled={!hydrated} onClick={addGroup} aria-label={t("writing.group.create")} title={t("writing.group.create")} />
                </div>
                <div className="min-h-0 flex-1 space-y-1 overflow-y-auto p-2">
                    {groups.map((group) => (
                        <div key={group.id}>
                            {editingGroupId === group.id ? (
                                <div className="flex h-9 items-center gap-1 rounded-[2px] bg-muted px-2">
                                    <Input
                                        size="small"
                                        className="min-w-0 flex-1"
                                        value={editingGroupName}
                                        onChange={(event) => setEditingGroupName(event.target.value)}
                                        onKeyDown={(event) => {
                                            if (event.key === "Enter") saveGroupName();
                                            if (event.key === "Escape") setEditingGroupId(null);
                                        }}
                                        autoFocus
                                    />
                                    <Button type="text" size="small" shape="circle" icon={<Check className="size-3.5" />} onClick={saveGroupName} aria-label={t("writing.common.confirm")} title={t("writing.common.confirm")} />
                                    <Button type="text" size="small" shape="circle" icon={<X className="size-3.5" />} onClick={() => setEditingGroupId(null)} aria-label={t("writing.common.cancel")} title={t("writing.common.cancel")} />
                                </div>
                            ) : (
                                <div className={`group flex h-9 items-center rounded-none border-b border-border px-2 transition ${selectedGroupId === group.id ? "bg-brand-soft" : "hover:bg-hover"}`} style={selectedGroupId === group.id ? { boxShadow: `inset 2px 0 0 0 ${theme.node.accent}` } : undefined}>
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
                                            aria-label={t("writing.group.rename")}
                                            title={t("writing.group.rename")}
                                        />
                                        <Button type="text" size="small" shape="circle" icon={<Trash2 className="size-3.5" />} onClick={() => removeGroup(group.id)} aria-label={t("writing.group.delete")} title={t("writing.group.delete")} />
                                    </div>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            </aside>

            <section className="flex min-w-0 flex-1 flex-col">
                <header className="glass-surface shrink-0">
                    <div className="flex min-h-14 w-full flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-2">
                        <div className="flex min-w-0 items-center gap-2">
                            <h1 className="truncate text-lg font-semibold text-foreground" style={{ margin: 0 }}>{selectedGroup?.name ?? t("writing.group.none")}</h1>
                            {selectedGroup ? <span className="shrink-0 text-xs text-muted-foreground">{t("writing.group.count", { count: groupProjects.length })}</span> : null}
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                            {selectedIds.length ? (
                                <>
                                    <Button disabled={!hydrated} icon={<Download className="size-4" />} onClick={exportSelected}>
                                        {t("writing.library.exportSelected")}
                                    </Button>
                                    <Button disabled={!hydrated} danger={armedId === "selected"} onClick={deleteSelected} onPointerLeave={() => setArmedId(null)}>
                                        {armedId === "selected" ? t("writing.library.confirmDelete") : t("writing.library.deleteSelected")}
                                    </Button>
                                </>
                            ) : projects.length ? (
                                <Button disabled={!hydrated} danger={armedId === "all"} onClick={deleteAll} onPointerLeave={() => setArmedId(null)}>
                                    {armedId === "all" ? t("writing.library.confirmDelete") : t("writing.library.deleteAll")}
                                </Button>
                            ) : null}
                            <Button disabled={!hydrated || !selectedGroup} type="primary" icon={<FilePlus2 className="size-4" />} onClick={openCreate}>
                                {t("writing.library.create")}
                            </Button>
                        </div>
                    </div>
                </header>

                <div className="min-h-0 flex-1 overflow-y-auto px-2 py-3">
                    {!hydrated ? (
                        <div className="flex h-full items-center justify-center">
                            <Spin />
                        </div>
                    ) : !selectedGroup ? (
                        <div className="glass-card flex h-full items-center justify-center rounded-none border">
                            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t("writing.group.createFirst")} className="py-16">
                                <Button type="primary" icon={<FolderPlus className="size-4" />} disabled={!hydrated} onClick={addGroup}>
                                    {t("writing.group.create")}
                                </Button>
                            </Empty>
                        </div>
                    ) : groupProjects.length ? (
                        <Table<WriteProject>
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
                                    title: t("writing.library.projects"),
                                    onHeaderCell: () => ({ style: { padding: "8px" } }),
                                    onCell: () => ({ style: { padding: 0 } }),
                                    render: (_, project) => <WriteProjectRow project={project} />,
                                },
                            ]}
                        />
                    ) : (
                        <div className="glass-card flex h-full items-center justify-center rounded-none border">
                            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t("writing.group.empty")} className="py-16">
                                <Button type="primary" icon={<FilePlus2 className="size-4" />} disabled={!hydrated} onClick={openCreate}>
                                    {t("writing.library.create")}
                                </Button>
                            </Empty>
                        </div>
                    )}
                </div>
            </section>

            <Modal
                open={createOpen}
                title={t("writing.library.create")}
                onCancel={() => setCreateOpen(false)}
                onOk={submitCreate}
                okText={t("writing.common.confirm")}
                cancelText={t("writing.common.cancel")}
                width={380}
                classNames={{ container: "glass-raised" }}
                styles={{ container: { background: "var(--glass-strong)" } }}
            >
                <div className="flex flex-col gap-3 pt-2">
                    <Input value={draftTitle} onChange={(event) => setDraftTitle(event.target.value)} placeholder={t("writing.library.titlePlaceholder")} onPressEnter={submitCreate} autoFocus />
                    <Select
                        value={draftTemplate}
                        onChange={(value) => setDraftTemplate(value)}
                        options={(Object.keys(WRITE_TEMPLATES) as WriteTemplate[]).map((key) => ({ value: key, label: t(WRITE_TEMPLATES[key].labelKey) }))}
                    />
                </div>
            </Modal>
        </main>
    );
}
