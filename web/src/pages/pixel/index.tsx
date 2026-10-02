import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Button, Dropdown, Empty, Input, InputNumber, Modal, Select, type MenuProps } from "antd";
import { Check, Clock, FolderInput, FolderKanban, Pencil, Plus, Trash2, X } from "lucide-react";

import PixelStudio, { type PixelStudioImageSource } from "@/components/canvas/workspace/pixel-studio";
import { useCanvasStore } from "@/stores/canvas/use-canvas-store";
import { usePixelStore } from "@/stores/use-pixel-store";
import { CanvasNodeType } from "@/types/canvas";

const SIZE_PRESETS = [
    { id: "16", label: "16 × 16", width: 16, height: 16 },
    { id: "32", label: "32 × 32", width: 32, height: 32 },
    { id: "64", label: "64 × 64", width: 64, height: 64 },
    { id: "128", label: "128 × 128", width: 128, height: 128 },
    { id: "256", label: "256 × 256", width: 256, height: 256 },
    { id: "512", label: "512 × 512", width: 512, height: 512 },
    { id: "custom", label: "Custom Size", width: 64, height: 64 },
];

export default function PixelStudioPage() {
    const navigate = useNavigate();
    const { id } = useParams<{ id: string }>();

    const projects = usePixelStore((state) => state.projects);
    const hydrated = usePixelStore((state) => state.hydrated);
    const groups = usePixelStore((state) => state.groups);
    const createProject = usePixelStore((state) => state.createProject);
    const renameProject = usePixelStore((state) => state.renameProject);
    const deleteProject = usePixelStore((state) => state.deleteProject);
    const updateProject = usePixelStore((state) => state.updateProject);
    const createGroup = usePixelStore((state) => state.createGroup);
    const renameGroup = usePixelStore((state) => state.renameGroup);
    const deleteGroup = usePixelStore((state) => state.deleteGroup);
    const setProjectGroup = usePixelStore((state) => state.setProjectGroup);

    const canvasProjects = useCanvasStore((state) => state.projects);

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
    const [presetId, setPresetId] = useState("64");
    const [customWidth, setCustomWidth] = useState(64);
    const [customHeight, setCustomHeight] = useState(64);

    const currentProject = useMemo(() => {
        if (!id) return null;
        return projects.find((project) => project.id === id) || null;
    }, [id, projects]);

    // Canvas image nodes stay available as import sources, resolved once here instead of tying the studio to node documents.
    const images = useMemo<PixelStudioImageSource[]>(() => {
        const list: PixelStudioImageSource[] = [];
        for (const project of canvasProjects) {
            for (const node of project.nodes || []) {
                if (node.type !== CanvasNodeType.Image || (!node.metadata?.content && !node.metadata?.storageKey)) continue;
                list.push({ id: node.id, title: node.title, storageKey: node.metadata?.storageKey, content: node.metadata?.content });
            }
        }
        return list;
    }, [canvasProjects]);

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

    const handleSubmitCreate = () => {
        const preset = SIZE_PRESETS.find((item) => item.id === presetId) || SIZE_PRESETS[2];
        const width = preset.id === "custom" ? Math.max(1, Math.round(customWidth)) : preset.width;
        const height = preset.id === "custom" ? Math.max(1, Math.round(customHeight)) : preset.height;
        const groupId = createGroupId || selectedGroup?.id || groups[0]?.id;
        const newId = createProject(newTitle.trim() || undefined, { width, height }, groupId);
        if (groupId) setSelectedGroupId(groupId);
        setCreateOpen(false);
        navigate(`/pixel/${newId}`);
    };

    // Editor view.
    if (id) {
        if (!currentProject) {
            return (
                <div className="flex h-full flex-1 flex-col items-center justify-center gap-3 bg-background p-8 text-center">
                    <Empty description="Pixel canvas not found or has been deleted" />
                    <Button type="primary" onClick={() => navigate("/pixel")}>
                        Back to Pixel Library
                    </Button>
                </div>
            );
        }
        return (
            <div className="relative flex h-full flex-col overflow-hidden bg-background">
                <PixelStudio project={currentProject} images={images} onUpdate={(patch) => updateProject(currentProject.id, patch)} onBack={() => navigate("/pixel")} />
            </div>
        );
    }

    // Library view.
    return (
        <main className="flex h-full min-h-0 bg-background text-foreground">
            <aside className="glass-surface flex w-60 shrink-0 flex-col border-r border-border">
                <div className="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-border px-4">
                    <p className="text-sm font-semibold uppercase tracking-widest text-muted-foreground" style={{ margin: 0 }}>
                        Pixel Groups
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

            <section className="flex min-w-0 flex-1 flex-col overflow-hidden">
                <div className="glass-surface flex h-14 shrink-0 items-center justify-between border-b border-border px-6">
                    <div className="flex items-center gap-3">
                        <h1 className="text-base font-semibold text-foreground" style={{ margin: 0 }}>{selectedGroup ? selectedGroup.name : "Pixel Canvases"}</h1>
                        <span className="rounded-full bg-brand-soft px-2 py-0.5 text-xs font-medium text-brand">
                            {groupProjects.length} {groupProjects.length === 1 ? "canvas" : "canvases"}
                        </span>
                    </div>
                    <Button
                        type="primary"
                        icon={<Plus className="size-4" />}
                        disabled={!hydrated}
                        onClick={() => {
                            setNewTitle("");
                            setPresetId("64");
                            setCustomWidth(64);
                            setCustomHeight(64);
                            setCreateGroupId(selectedGroup?.id || groups[0]?.id || null);
                            setCreateOpen(true);
                        }}
                    >
                        New Pixel Canvas
                    </Button>
                </div>

                <div className="thin-scrollbar flex-1 overflow-y-auto p-6">
                    {groupProjects.length === 0 ? (
                        <div className="flex h-96 flex-col items-center justify-center gap-4 text-center">
                            <Empty
                                image={Empty.PRESENTED_IMAGE_SIMPLE}
                                description={
                                    <div className="space-y-1">
                                        <p className="text-base font-medium text-foreground">No pixel canvases in this group</p>
                                        <p className="text-sm text-muted-foreground">Click "New Pixel Canvas" to start drawing in "{selectedGroup?.name || "this group"}".</p>
                                    </div>
                                }
                            />
                            <Button type="primary" icon={<Plus className="size-4" />} onClick={() => { setCreateGroupId(selectedGroup?.id || groups[0]?.id || null); setCreateOpen(true); }}>
                                New Pixel Canvas
                            </Button>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                            {groupProjects.map((project) => {
                                const doc = project.doc;
                                const otherGroups = groups.filter((group) => group.id !== project.groupId);
                                const moveItems: MenuProps["items"] = otherGroups.map((group) => ({
                                    key: group.id,
                                    label: group.name,
                                    onClick: () => setProjectGroup(project.id, group.id),
                                }));

                                return (
                                    <div
                                        key={project.id}
                                        onClick={() => navigate(`/pixel/${project.id}`)}
                                        className="group relative flex cursor-pointer flex-col justify-between overflow-hidden rounded-xl border border-border bg-card p-4 transition-all hover:border-brand hover:shadow-md"
                                    >
                                        <div>
                                            <div className="flex items-start justify-between gap-2">
                                                <div className="min-w-0 flex-1">
                                                    <h3 className="truncate text-sm font-semibold text-foreground transition group-hover:text-brand">{project.title}</h3>
                                                    <p className="mt-0.5 text-xs text-muted-foreground">
                                                        {doc?.width || 64} × {doc?.height || 64}
                                                    </p>
                                                </div>
                                                <div className="flex items-center gap-1" onClick={(event) => event.stopPropagation()}>
                                                    {armedProjectId === project.id ? (
                                                        <Button type="text" size="small" danger className="!h-7 !px-2 !text-xs font-semibold" onClick={() => deleteProjectArmed(project.id)} onPointerLeave={() => setArmedProjectId(null)} title="Click again to confirm delete">
                                                            Confirm Delete
                                                        </Button>
                                                    ) : (
                                                        <>
                                                            <Button type="text" size="small" shape="circle" icon={<Pencil className="size-3.5" />} className="text-muted-foreground opacity-0 transition group-hover:opacity-100 hover:text-foreground" onClick={() => setRenaming({ id: project.id, title: project.title })} title="Rename" />
                                                            {otherGroups.length > 0 && (
                                                                <Dropdown menu={{ items: moveItems }} trigger={["click"]} placement="bottomRight" open={moveMenuProjectId === project.id} onOpenChange={(open) => setMoveMenuProjectId(open ? project.id : null)}>
                                                                    <Button type="text" size="small" shape="circle" icon={<FolderInput className="size-3.5" />} className={`text-muted-foreground transition hover:text-foreground ${moveMenuProjectId === project.id ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`} title="Move to Group" />
                                                                </Dropdown>
                                                            )}
                                                            <Button type="text" size="small" shape="circle" icon={<Trash2 className="size-3.5" />} className="text-muted-foreground opacity-0 transition group-hover:opacity-100 hover:text-danger" onClick={() => setArmedProjectId(project.id)} title="Delete canvas" />
                                                        </>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                        <div className="mt-4 flex items-center justify-between border-t border-border/60 pt-2 text-[11px] text-muted-foreground">
                                            <span className="flex items-center gap-1">
                                                <Clock className="size-3" />
                                                {doc?.fps || 10} FPS
                                            </span>
                                            <span className="font-medium text-brand opacity-0 transition group-hover:opacity-100">Open Editor →</span>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </section>

            <Modal title="New Pixel Canvas" open={createOpen} onCancel={() => setCreateOpen(false)} onOk={handleSubmitCreate} okText="Create" cancelText="Cancel" destroyOnHidden>
                <div className="space-y-4 py-3">
                    <div>
                        <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Group</label>
                        <Select value={createGroupId || selectedGroup?.id || groups[0]?.id} onChange={setCreateGroupId} className="w-full" options={groups.map((group) => ({ label: group.name, value: group.id }))} />
                    </div>
                    <div>
                        <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Name</label>
                        <Input placeholder={`Pixel Canvas ${projects.length + 1}`} value={newTitle} onChange={(event) => setNewTitle(event.target.value)} onPressEnter={handleSubmitCreate} autoFocus />
                    </div>
                    <div>
                        <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Pixel Size</label>
                        <div className="grid grid-cols-3 gap-2">
                            {SIZE_PRESETS.map((preset) => {
                                const active = presetId === preset.id;
                                return (
                                    <button
                                        key={preset.id}
                                        type="button"
                                        onClick={() => setPresetId(preset.id)}
                                        className={`rounded-lg border p-2.5 text-center text-xs transition ${active ? "border-brand bg-brand-soft font-medium text-brand" : "border-border text-foreground hover:bg-hover"}`}
                                    >
                                        {preset.label}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                    {presetId === "custom" && (
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Width (px)</label>
                                <InputNumber min={1} max={4096} value={customWidth} onChange={(value) => setCustomWidth(Number(value) || 1)} className="w-full" />
                            </div>
                            <div>
                                <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Height (px)</label>
                                <InputNumber min={1} max={4096} value={customHeight} onChange={(value) => setCustomHeight(Number(value) || 1)} className="w-full" />
                            </div>
                        </div>
                    )}
                </div>
            </Modal>

            <Modal title="Rename Pixel Canvas" open={Boolean(renaming)} onCancel={() => setRenaming(null)} onOk={() => { if (renaming && renaming.title.trim()) renameProject(renaming.id, renaming.title.trim()); setRenaming(null); }} okText="Save" cancelText="Cancel">
                <div className="py-2">
                    <Input value={renaming?.title || ""} onChange={(event) => setRenaming((prev) => (prev ? { ...prev, title: event.target.value } : null))} onPressEnter={() => { if (renaming && renaming.title.trim()) renameProject(renaming.id, renaming.title.trim()); setRenaming(null); }} autoFocus />
                </div>
            </Modal>
        </main>
    );
}
