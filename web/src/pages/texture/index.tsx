import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Button, Dropdown, Empty, Input, Modal, Select, type MenuProps } from "antd";
import { Boxes, Check, FolderInput, FolderKanban, Pencil, Plus, Trash2, X } from "lucide-react";
import { useTranslation } from "react-i18next";

import { TextureStudio } from "./components/texture-studio";
import { useTextureStore } from "@/stores/use-texture-store";

export default function TexturePage() {
    const navigate = useNavigate();
    const { t } = useTranslation();
    const { id } = useParams<{ id: string }>();

    const projects = useTextureStore((state) => state.projects);
    const hydrated = useTextureStore((state) => state.hydrated);
    const groups = useTextureStore((state) => state.groups);
    const createProject = useTextureStore((state) => state.createProject);
    const renameProject = useTextureStore((state) => state.renameProject);
    const deleteProject = useTextureStore((state) => state.deleteProject);
    const updateProject = useTextureStore((state) => state.updateProject);
    const createGroup = useTextureStore((state) => state.createGroup);
    const renameGroup = useTextureStore((state) => state.renameGroup);
    const deleteGroup = useTextureStore((state) => state.deleteGroup);
    const setProjectGroup = useTextureStore((state) => state.setProjectGroup);

    const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
    const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
    const [editingGroupName, setEditingGroupName] = useState("");
    const [armedGroupId, setArmedGroupId] = useState<string | null>(null);
    const [armedProjectId, setArmedProjectId] = useState<string | null>(null);
    const [moveMenuProjectId, setMoveMenuProjectId] = useState<string | null>(null);
    const [renaming, setRenaming] = useState<{ id: string; title: string } | null>(null);

    const [createOpen, setCreateOpen] = useState(false);
    const [createGroupId, setCreateGroupId] = useState<string | null>(null);
    const [newTitle, setNewTitle] = useState("");

    const currentProject = useMemo(() => {
        if (!id) return null;
        return projects.find((project) => project.id === id) || null;
    }, [id, projects]);

    useEffect(() => {
        if (groups.length > 0 && (!selectedGroupId || !groups.some((group) => group.id === selectedGroupId))) {
            setSelectedGroupId(groups[0].id);
        }
    }, [groups, selectedGroupId]);

    const selectedGroup = groups.find((group) => group.id === selectedGroupId) || groups[0] || null;
    const groupProjects = selectedGroup ? projects.filter((project) => project.groupId === selectedGroup.id) : [];
    const groupCount = (groupId: string) => projects.filter((project) => project.groupId === groupId).length;

    const removeGroup = (groupId: string) => {
        if (armedGroupId !== groupId) {
            setArmedGroupId(groupId);
            return;
        }
        setArmedGroupId(null);
        setEditingGroupId(null);
        deleteGroup(groupId);
        if (selectedGroupId === groupId) setSelectedGroupId(groups.find((group) => group.id !== groupId)?.id ?? null);
    };

    const deleteProjectArmed = (projectId: string) => {
        if (armedProjectId !== projectId) {
            setArmedProjectId(projectId);
            return;
        }
        setArmedProjectId(null);
        deleteProject(projectId);
    };

    const openCreate = () => {
        setNewTitle("");
        setCreateGroupId(selectedGroup?.id || groups[0]?.id || null);
        setCreateOpen(true);
    };

    const handleSubmitCreate = () => {
        const groupId = createGroupId || selectedGroup?.id || groups[0]?.id;
        const newId = createProject(newTitle.trim() || undefined, groupId);
        if (groupId) setSelectedGroupId(groupId);
        setCreateOpen(false);
        navigate(`/texture/${newId}`);
    };

    // Editor view.
    if (id) {
        if (!currentProject) {
            return (
                <div className="flex h-full flex-1 flex-col items-center justify-center gap-3 bg-background p-8 text-center">
                    <Empty description={t("textureStudio.empty")} />
                    <Button type="primary" onClick={() => navigate("/texture")}>
                        {t("textureStudio.back")}
                    </Button>
                </div>
            );
        }
        return (
            <div className="relative flex h-full flex-col overflow-hidden bg-background">
                <TextureStudio project={currentProject} onBack={() => navigate("/texture")} onUpdate={(patch) => updateProject(currentProject.id, patch)} />
            </div>
        );
    }

    // Library view.
    return (
        <main className="flex h-full min-h-0 bg-background text-foreground">
            <aside className="glass-surface flex w-60 shrink-0 flex-col border-r border-border">
                <div className="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-border px-4">
                    <p className="text-sm font-semibold uppercase tracking-widest text-muted-foreground" style={{ margin: 0 }}>
                        Texture Groups
                    </p>
                    <Button
                        type="text"
                        size="small"
                        shape="circle"
                        icon={<Plus className="size-4" />}
                        disabled={!hydrated}
                        onClick={() => setSelectedGroupId(createGroup())}
                        title="New Group"
                    />
                </div>

                <div className="thin-scrollbar min-h-0 flex-1 space-y-1 overflow-y-auto p-2">
                    {groups.map((group) => (
                        <div key={group.id}>
                            {editingGroupId === group.id ? (
                                <div className="flex h-9 items-center gap-1 rounded-lg bg-muted px-2">
                                    <Input
                                        size="small"
                                        className="min-w-0 flex-1"
                                        value={editingGroupName}
                                        onChange={(event) => setEditingGroupName(event.target.value)}
                                        onKeyDown={(event) => {
                                            if (event.key === "Enter") {
                                                renameGroup(group.id, editingGroupName);
                                                setEditingGroupId(null);
                                            }
                                            if (event.key === "Escape") setEditingGroupId(null);
                                        }}
                                        autoFocus
                                    />
                                    <Button type="text" size="small" shape="circle" icon={<Check className="size-3.5" />} onClick={() => { renameGroup(group.id, editingGroupName); setEditingGroupId(null); }} />
                                    <Button type="text" size="small" shape="circle" icon={<X className="size-3.5" />} onClick={() => setEditingGroupId(null)} />
                                </div>
                            ) : (
                                <div className={`group flex h-9 items-center rounded-lg px-2.5 transition ${selectedGroupId === group.id ? "bg-brand-soft font-medium text-brand" : "text-muted-foreground hover:bg-hover hover:text-foreground"}`}>
                                    <button type="button" onClick={() => setSelectedGroupId(group.id)} className="flex h-full min-w-0 flex-1 items-center gap-2 text-left text-sm">
                                        <FolderKanban className="size-4 shrink-0 opacity-70" />
                                        <span className="min-w-0 flex-1 truncate">{group.name}</span>
                                        <span className={`shrink-0 text-xs ${selectedGroupId === group.id ? "text-brand/70" : "text-muted-foreground"} group-hover:hidden`}>{groupCount(group.id)}</span>
                                    </button>
                                    <div className="hidden shrink-0 items-center group-hover:flex">
                                        <Button type="text" size="small" shape="circle" icon={<Pencil className="size-3.5" />} onClick={() => { setEditingGroupId(group.id); setEditingGroupName(group.name); }} title="Rename" />
                                        <Button
                                            type="text"
                                            size="small"
                                            shape={armedGroupId === group.id ? "default" : "circle"}
                                            danger={armedGroupId === group.id}
                                            className={armedGroupId === group.id ? "!px-2 !text-xs font-medium" : undefined}
                                            icon={armedGroupId === group.id ? <Check className="size-3.5" /> : <Trash2 className="size-3.5" />}
                                            onClick={() => removeGroup(group.id)}
                                            onPointerLeave={() => setArmedGroupId(null)}
                                            title={armedGroupId === group.id ? "Click again to confirm delete" : "Delete Group"}
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

            <section className="flex min-w-0 flex-1 flex-col overflow-hidden">
                <div className="glass-surface flex h-14 shrink-0 items-center justify-between border-b border-border px-6">
                    <div className="flex items-center gap-3">
                        <h1 className="text-base font-semibold text-foreground" style={{ margin: 0 }}>{selectedGroup ? selectedGroup.name : t("textureStudio.title")}</h1>
                        <span className="rounded-full bg-brand-soft px-2 py-0.5 text-xs font-medium text-brand">
                            {groupProjects.length} textures
                        </span>
                    </div>
                    <Button type="primary" icon={<Plus className="size-4" />} disabled={!hydrated} onClick={openCreate}>
                        {t("textureStudio.newProject")}
                    </Button>
                </div>

                <div className="thin-scrollbar flex-1 overflow-y-auto p-6">
                    {groupProjects.length === 0 ? (
                        <div className="flex h-96 flex-col items-center justify-center gap-4 text-center">
                            <Empty
                                image={Empty.PRESENTED_IMAGE_SIMPLE}
                                description={
                                    <div className="space-y-1">
                                        <p className="text-base font-medium text-foreground">No textures in this group yet</p>
                                        <p className="text-sm text-muted-foreground">Click "{t("textureStudio.newProject")}" to create a texture in "{selectedGroup?.name || "this group"}".</p>
                                    </div>
                                }
                            />
                            <Button type="primary" icon={<Plus className="size-4" />} disabled={!hydrated} onClick={openCreate}>
                                {t("textureStudio.newProject")}
                            </Button>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                            {groupProjects.map((project) => {
                                const otherGroups = groups.filter((group) => group.id !== project.groupId);
                                const moveItems: MenuProps["items"] = otherGroups.map((group) => ({
                                    key: group.id,
                                    label: group.name,
                                    onClick: () => setProjectGroup(project.id, group.id),
                                }));

                                return (
                                    <div
                                        key={project.id}
                                        onClick={() => navigate(`/texture/${project.id}`)}
                                        className="group relative flex cursor-pointer flex-col justify-between overflow-hidden rounded-xl border border-border bg-card p-4 transition-all hover:border-brand hover:shadow-md"
                                    >
                                        <div className="flex items-start justify-between gap-2">
                                            <div className="flex min-w-0 flex-1 items-center gap-2">
                                                <Boxes className="size-4 shrink-0 text-muted-foreground" />
                                                <div className="min-w-0">
                                                    <h3 className="truncate text-sm font-semibold text-foreground transition group-hover:text-brand">{project.title}</h3>
                                                    <p className="mt-0.5 text-xs text-muted-foreground">
                                                        {project.state.resolution} × {project.state.resolution}
                                                    </p>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-1" onClick={(event) => event.stopPropagation()}>
                                                {armedProjectId === project.id ? (
                                                    <Button
                                                        type="text"
                                                        size="small"
                                                        danger
                                                        className="!h-7 !px-2 !text-xs font-semibold"
                                                        onClick={() => deleteProjectArmed(project.id)}
                                                        onPointerLeave={() => setArmedProjectId(null)}
                                                        title={t("textureStudio.delete")}
                                                    >
                                                        {t("textureStudio.delete")}
                                                    </Button>
                                                ) : (
                                                    <>
                                                        <Button
                                                            type="text"
                                                            size="small"
                                                            shape="circle"
                                                            icon={<Pencil className="size-3.5" />}
                                                            className="text-muted-foreground opacity-0 transition group-hover:opacity-100 hover:text-foreground"
                                                            onClick={() => setRenaming({ id: project.id, title: project.title })}
                                                            title={t("textureStudio.rename")}
                                                        />
                                                        {otherGroups.length > 0 && (
                                                            <Dropdown menu={{ items: moveItems }} trigger={["click"]} placement="bottomRight" open={moveMenuProjectId === project.id} onOpenChange={(open) => setMoveMenuProjectId(open ? project.id : null)}>
                                                                 <Button type="text" size="small" shape="circle" icon={<FolderInput className="size-3.5" />} className={`text-muted-foreground transition hover:text-foreground ${moveMenuProjectId === project.id ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`} title="Move to Group" />
                                                            </Dropdown>
                                                        )}
                                                        <Button
                                                            type="text"
                                                            size="small"
                                                            shape="circle"
                                                            icon={<Trash2 className="size-3.5" />}
                                                            className="text-muted-foreground opacity-0 transition group-hover:opacity-100 hover:text-danger"
                                                            onClick={() => setArmedProjectId(project.id)}
                                                            title={t("textureStudio.delete")}
                                                        />
                                                    </>
                                                )}
                                            </div>
                                        </div>
                                        <div className="mt-4 flex items-center justify-between border-t border-border/60 pt-2 text-[11px] text-muted-foreground">
                                            <span>{new Date(project.updatedAt).toLocaleDateString()}</span>
                                            <span className="font-medium text-brand opacity-0 transition group-hover:opacity-100">{t("textureStudio.open")} →</span>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </section>

            <Modal title={t("textureStudio.newProject")} open={createOpen} onCancel={() => setCreateOpen(false)} onOk={handleSubmitCreate} okText="Create" cancelText={t("common.cancel")} destroyOnHidden>
                <div className="space-y-4 py-3">
                    <div>
                        <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Group</label>
                        <Select value={createGroupId || selectedGroup?.id || groups[0]?.id} onChange={setCreateGroupId} className="w-full" options={groups.map((group) => ({ label: group.name, value: group.id }))} />
                    </div>
                    <div>
                        <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Name</label>
                        <Input placeholder={`Texture ${projects.length + 1}`} value={newTitle} onChange={(event) => setNewTitle(event.target.value)} onPressEnter={handleSubmitCreate} autoFocus />
                    </div>
                </div>
            </Modal>

            <Modal
                title={t("textureStudio.rename")}
                open={Boolean(renaming)}
                onCancel={() => setRenaming(null)}
                onOk={() => {
                    if (renaming && renaming.title.trim()) renameProject(renaming.id, renaming.title.trim());
                    setRenaming(null);
                }}
                okText={t("common.save")}
                cancelText={t("common.cancel")}
            >
                <div className="py-2">
                    <Input
                        value={renaming?.title || ""}
                        onChange={(event) => setRenaming((prev) => (prev ? { ...prev, title: event.target.value } : null))}
                        onPressEnter={() => {
                            if (renaming && renaming.title.trim()) renameProject(renaming.id, renaming.title.trim());
                            setRenaming(null);
                        }}
                        autoFocus
                    />
                </div>
            </Modal>
        </main>
    );
}
