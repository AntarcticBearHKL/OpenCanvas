import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { App, Button, Dropdown, Empty, Input, Modal, Select, type MenuProps } from "antd";
import { Check, FolderInput, FolderKanban, Pencil, Plus, Trash2, X } from "lucide-react";
import dayjs from "dayjs";
import { useTranslation } from "react-i18next";

import { WriteStudio } from "@/components/write/write-studio";
import { useWriteUiStore } from "@/stores/use-write-ui-store";
import { useWritingStore, type WriteProject } from "@/stores/use-writing-store";

export default function WritePage() {
    const { message } = App.useApp();
    const { t } = useTranslation();
    const navigate = useNavigate();
    const { id } = useParams<{ id: string }>();

    const setProject = useWriteUiStore((state) => state.setProject);
    const selectedGroupId = useWriteUiStore((state) => state.selectedGroupId);
    const setSelectedGroupId = useWriteUiStore((state) => state.setSelectedGroupId);

    const hydrated = useWritingStore((state) => state.hydrated);
    const projects = useWritingStore((state) => state.projects);
    const groups = useWritingStore((state) => state.groups);
    const createProject = useWritingStore((state) => state.createProject);
    const renameProject = useWritingStore((state) => state.renameProject);
    const deleteProjects = useWritingStore((state) => state.deleteProjects);
    const setProjectGroup = useWritingStore((state) => state.setProjectGroup);
    const createGroup = useWritingStore((state) => state.createGroup);
    const renameGroup = useWritingStore((state) => state.renameGroup);
    const deleteGroup = useWritingStore((state) => state.deleteGroup);

    // Dialog & UI states
    const [createOpen, setCreateOpen] = useState(false);
    const [newTitle, setNewTitle] = useState("");
    const [createGroupId, setCreateGroupId] = useState<string | null>(null);

    const [renamingProject, setRenamingProject] = useState<{ id: string; title: string } | null>(null);
    const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
    const [editingGroupName, setEditingGroupName] = useState("");

    // Armed deletion confirmation states
    const [armedGroupId, setArmedGroupId] = useState<string | null>(null);
    const [armedProjectId, setArmedProjectId] = useState<string | null>(null);
    const [moveMenuProjectId, setMoveMenuProjectId] = useState<string | null>(null);

    useEffect(() => {
        setProject(id ?? null);
    }, [id, setProject]);

    // Ensure selectedGroupId always points to a valid group
    useEffect(() => {
        if (!hydrated || groups.length === 0) return;
        if (selectedGroupId && groups.some((g) => g.id === selectedGroupId)) return;
        setSelectedGroupId(groups[0].id);
    }, [hydrated, groups, selectedGroupId, setSelectedGroupId]);

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

    const selectedGroup = groups.find((group) => group.id === selectedGroupId) ?? groups[0] ?? null;
    const groupProjects = selectedGroup ? projects.filter((project) => project.groupId === selectedGroup.id) : [];

    const removeGroup = (groupId: string) => {
        if (armedGroupId !== groupId) {
            setArmedGroupId(groupId);
            return;
        }
        setArmedGroupId(null);
        setEditingGroupId(null);
        deleteGroup(groupId);
        message.success("Group deleted");
    };

    const handleCreateProject = () => {
        const title = newTitle.trim() || "Untitled Project";
        const targetGroupId = createGroupId || selectedGroup?.id || groups[0]?.id || null;
        const newId = createProject(title, targetGroupId);
        setCreateOpen(false);
        navigate(`/write/${newId}`);
    };

    return (
        <main className="flex h-full min-h-0 bg-background text-foreground">
            {/* Sidebar: Groups */}
            <aside className="glass-surface flex w-60 shrink-0 flex-col border-r border-border">
                <div className="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-border px-4">
                    <p className="text-sm font-semibold uppercase tracking-widest text-muted-foreground" style={{ margin: 0 }}>
                        Writing Groups
                    </p>
                    <Button
                        type="text"
                        size="small"
                        shape="circle"
                        icon={<Plus className="size-4" />}
                        disabled={!hydrated}
                        onClick={() => {
                            const newGId = createGroup();
                            setSelectedGroupId(newGId);
                        }}
                        title="New Group"
                    />
                </div>

                <div className="min-h-0 flex-1 space-y-1 overflow-y-auto p-2 thin-scrollbar">
                    {groups.map((group) => (
                        <div key={group.id}>
                            {editingGroupId === group.id ? (
                                <div className="flex h-9 items-center gap-1 rounded-lg bg-muted px-2">
                                    <Input
                                        size="small"
                                        className="min-w-0 flex-1"
                                        value={editingGroupName}
                                        onChange={(e) => setEditingGroupName(e.target.value)}
                                        onKeyDown={(e) => {
                                            if (e.key === "Enter") {
                                                if (editingGroupId) renameGroup(editingGroupId, editingGroupName);
                                                setEditingGroupId(null);
                                            }
                                            if (e.key === "Escape") setEditingGroupId(null);
                                        }}
                                        autoFocus
                                    />
                                    <Button
                                        type="text"
                                        size="small"
                                        shape="circle"
                                        icon={<Check className="size-3.5" />}
                                        onClick={() => {
                                            if (editingGroupId) renameGroup(editingGroupId, editingGroupName);
                                            setEditingGroupId(null);
                                        }}
                                    />
                                    <Button
                                        type="text"
                                        size="small"
                                        shape="circle"
                                        icon={<X className="size-3.5" />}
                                        onClick={() => setEditingGroupId(null)}
                                    />
                                </div>
                            ) : (
                                <div
                                    className={`group flex h-9 items-center rounded-lg px-2.5 transition ${
                                        selectedGroupId === group.id
                                            ? "bg-brand-soft text-brand font-medium"
                                            : "text-muted-foreground hover:bg-hover hover:text-foreground"
                                    }`}
                                >
                                    <button
                                        type="button"
                                        onClick={() => setSelectedGroupId(group.id)}
                                        className="flex h-full min-w-0 flex-1 items-center gap-2 text-left text-sm"
                                    >
                                        <FolderKanban className="size-4 shrink-0 opacity-70" />
                                        <span className="min-w-0 flex-1 truncate">{group.name}</span>
                                        <span
                                            className={`shrink-0 text-xs ${
                                                selectedGroupId === group.id ? "text-brand/70" : "text-muted-foreground"
                                            } group-hover:hidden`}
                                        >
                                            {projects.filter((p) => p.groupId === group.id).length}
                                        </span>
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
                                            title="Rename"
                                        />
                                        <Button
                                            type="text"
                                            size="small"
                                            shape={armedGroupId === group.id ? "default" : "circle"}
                                            danger={armedGroupId === group.id}
                                            className={armedGroupId === group.id ? "!px-2 !text-xs font-medium" : undefined}
                                            icon={armedGroupId === group.id ? <Check className="size-3.5" /> : <Trash2 className="size-3.5" />}
                                            onClick={() => removeGroup(group.id)}
                                            onPointerLeave={() => setArmedGroupId(null)}
                                            aria-label={armedGroupId === group.id ? "Click again to confirm delete" : "Delete group"}
                                            title={armedGroupId === group.id ? "Click again to confirm delete" : "Delete group"}
                                        >
                                            {armedGroupId === group.id ? "Confirm" : null}
                                        </Button>
                                    </div>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            </aside>

            {/* Main Area: Projects List */}
            <section className="flex min-w-0 flex-1 flex-col overflow-hidden">
                {/* Header */}
                <div className="glass-surface flex h-14 shrink-0 items-center justify-between border-b border-border px-6">
                    <div className="flex items-center gap-3">
                        <h1 className="text-base font-semibold text-foreground" style={{ margin: 0 }}>
                            {selectedGroup ? selectedGroup.name : "Writing Projects"}
                        </h1>
                        <span className="rounded-full bg-brand-soft px-2 py-0.5 text-xs text-brand font-medium">
                            {groupProjects.length} {groupProjects.length === 1 ? "project" : "projects"}
                        </span>
                    </div>

                    <div className="flex items-center gap-2">
                        <Button
                            type="primary"
                            icon={<Plus className="size-4" />}
                            onClick={() => {
                                setNewTitle("");
                                setCreateGroupId(selectedGroup?.id || groups[0]?.id || null);
                                setCreateOpen(true);
                            }}
                        >
                            New Project
                        </Button>
                    </div>
                </div>

                {/* Grid of Projects */}
                <div className="thin-scrollbar flex-1 overflow-y-auto p-6">
                    {groupProjects.length === 0 ? (
                        <div className="flex h-96 flex-col items-center justify-center gap-4 text-center">
                            <Empty
                                image={Empty.PRESENTED_IMAGE_SIMPLE}
                                description={
                                    <div className="space-y-1">
                                        <p className="text-base font-medium text-foreground">No projects in this group</p>
                                        <p className="text-sm text-muted-foreground">
                                            Click "New Project" to write novels, screenplays, and world lore in "{selectedGroup?.name || "this group"}".
                                        </p>
                                    </div>
                                }
                            />
                            <Button
                                type="primary"
                                icon={<Plus className="size-4" />}
                                onClick={() => {
                                    setNewTitle("");
                                    setCreateGroupId(selectedGroup?.id || groups[0]?.id || null);
                                    setCreateOpen(true);
                                }}
                            >
                                Create Project
                            </Button>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                            {groupProjects.map((project) => {
                                const otherGroups = groups.filter((g) => g.id !== project.groupId);
                                const moveItems: MenuProps["items"] = otherGroups.map((g) => ({
                                    key: g.id,
                                    label: g.name,
                                    onClick: () => {
                                        setProjectGroup(project.id, g.id);
                                        message.success(`Moved to "${g.name}"`);
                                    },
                                }));

                                const unitCount = project.outline.length;

                                return (
                                    <div
                                        key={project.id}
                                        onClick={() => navigate(`/write/${project.id}`)}
                                        className="group relative flex flex-col justify-between overflow-hidden rounded-xl border border-border bg-card p-4 transition-all hover:border-brand hover:shadow-md cursor-pointer"
                                    >
                                        <div>
                                            {/* Title & Metadata */}
                                            <div className="flex items-start justify-between gap-2">
                                                <div className="min-w-0 flex-1">
                                                    <h3 className="truncate text-sm font-semibold text-foreground group-hover:text-brand transition">
                                                        {project.title}
                                                    </h3>
                                                    <p className="mt-0.5 text-xs text-muted-foreground">
                                                        {unitCount} {unitCount === 1 ? "unit" : "units"} · {dayjs(project.updatedAt).format("YYYY-MM-DD")}
                                                    </p>
                                                </div>

                                                <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                                                    {armedProjectId === project.id ? (
                                                        <Button
                                                            type="text"
                                                            size="small"
                                                            danger
                                                            className="!h-7 !px-2 !text-xs font-semibold animate-in fade-in"
                                                            onClick={() => {
                                                                setArmedProjectId(null);
                                                                deleteProjects([project.id]);
                                                            }}
                                                            onPointerLeave={() => setArmedProjectId(null)}
                                                        >
                                                            Confirm
                                                        </Button>
                                                    ) : (
                                                        <>
                                                            <Button
                                                                type="text"
                                                                size="small"
                                                                shape="circle"
                                                                icon={<Pencil className="size-3.5" />}
                                                                className="text-muted-foreground opacity-0 transition group-hover:opacity-100 hover:text-foreground"
                                                                onClick={() => setRenamingProject({ id: project.id, title: project.title })}
                                                                title="Rename"
                                                            />
                                                            {otherGroups.length > 0 && (
                                                                <Dropdown
                                                                    menu={{ items: moveItems }}
                                                                    trigger={["click"]}
                                                                    placement="bottomRight"
                                                                    open={moveMenuProjectId === project.id}
                                                                    onOpenChange={(open) => setMoveMenuProjectId(open ? project.id : null)}
                                                                >
                                                                    <Button
                                                                        type="text"
                                                                        size="small"
                                                                        shape="circle"
                                                                        icon={<FolderInput className="size-3.5" />}
                                                                        className={`text-muted-foreground transition hover:text-foreground ${
                                                                            moveMenuProjectId === project.id ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                                                                        }`}
                                                                        title="Move to Group"
                                                                    />
                                                                </Dropdown>
                                                            )}
                                                            <Button
                                                                type="text"
                                                                size="small"
                                                                shape="circle"
                                                                icon={<Trash2 className="size-3.5" />}
                                                                className="text-muted-foreground opacity-0 transition group-hover:opacity-100 hover:text-danger"
                                                                onClick={() => setArmedProjectId(project.id)}
                                                                title="Delete project"
                                                            />
                                                        </>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </section>

            {/* Create Project Modal */}
            <Modal
                open={createOpen}
                title="New Writing Project"
                onCancel={() => setCreateOpen(false)}
                footer={[
                    <Button key="cancel" onClick={() => setCreateOpen(false)}>
                        Cancel
                    </Button>,
                    <Button key="create" type="primary" onClick={handleCreateProject}>
                        Create Project
                    </Button>,
                ]}
            >
                <div className="space-y-4 py-2">
                    <div>
                        <label className="mb-1.5 block text-xs font-medium text-foreground">Project Title</label>
                        <Input
                            placeholder="e.g. The Last Citadel"
                            value={newTitle}
                            onChange={(e) => setNewTitle(e.target.value)}
                            autoFocus
                            onPressEnter={handleCreateProject}
                        />
                    </div>
                    <div>
                        <label className="mb-1.5 block text-xs font-medium text-foreground">Target Group</label>
                        <Select
                            className="w-full"
                            value={createGroupId || selectedGroup?.id || groups[0]?.id || ""}
                            onChange={(val) => setCreateGroupId(val)}
                            options={groups.map((g) => ({
                                value: g.id,
                                label: g.name,
                            }))}
                        />
                    </div>
                </div>
            </Modal>

            {/* Rename Project Modal */}
            <Modal
                open={!!renamingProject}
                title="Rename Project"
                onCancel={() => setRenamingProject(null)}
                footer={[
                    <Button key="cancel" onClick={() => setRenamingProject(null)}>
                        Cancel
                    </Button>,
                    <Button
                        key="ok"
                        type="primary"
                        onClick={() => {
                            if (renamingProject && renamingProject.title.trim()) {
                                renameProject(renamingProject.id, renamingProject.title.trim());
                            }
                            setRenamingProject(null);
                        }}
                    >
                        Save
                    </Button>,
                ]}
            >
                <div className="py-2">
                    <label className="mb-1.5 block text-xs font-medium text-foreground">Project Name</label>
                    <Input
                        value={renamingProject?.title || ""}
                        onChange={(e) =>
                            setRenamingProject((prev) => (prev ? { ...prev, title: e.target.value } : null))
                        }
                        onPressEnter={() => {
                            if (renamingProject && renamingProject.title.trim()) {
                                renameProject(renamingProject.id, renamingProject.title.trim());
                            }
                            setRenamingProject(null);
                        }}
                        autoFocus
                    />
                </div>
            </Modal>
        </main>
    );
}
