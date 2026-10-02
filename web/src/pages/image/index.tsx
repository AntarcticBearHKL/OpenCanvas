import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { App, Button, Dropdown, Empty, Input, Modal, Select, type MenuProps } from "antd";
import { ArrowLeft, Check, Clock, FolderInput, FolderKanban, Image as ImageIcon, Pencil, Plus, Share2, Trash2, X } from "lucide-react";
import { saveAs } from "file-saver";
import { nanoid } from "nanoid";
import { useTranslation } from "react-i18next";

import ImageStudio from "@/components/canvas/workspace/image-studio";
import { StudioOutputModal } from "@/components/studio/studio-output-modal";
import { NODE_DEFAULT_SIZE } from "@/constant/canvas";
import { canvasThemes } from "@/lib/canvas-theme";
import { fitNodeSize } from "@/lib/canvas/canvas-node-size";
import { imageMetadata } from "@/lib/canvas/canvas-node-factory";
import { composeSmartCanvas } from "@/lib/canvas/smart-canvas";
import { uploadImage } from "@/services/image-storage";
import { useCanvasStore } from "@/stores/canvas/use-canvas-store";
import { IMAGE_PRESETS, useImageStore, type ImagePreset, type ImageProject } from "@/stores/use-image-store";
import { useThemeStore } from "@/stores/use-theme-store";
import { CanvasNodeType, type CanvasNodeData } from "@/types/canvas";

export default function ImageStudioPage() {
    const { t } = useTranslation();
    const { message } = App.useApp();
    const navigate = useNavigate();
    const { id } = useParams<{ id: string }>();

    const colorTheme = useThemeStore((state) => state.theme);
    const theme = canvasThemes[colorTheme];

    // Image Project store
    const projects = useImageStore((state) => state.projects);
    const groups = useImageStore((state) => state.groups);
    const hydrated = useImageStore((state) => state.hydrated);
    const createProject = useImageStore((state) => state.createProject);
    const renameProject = useImageStore((state) => state.renameProject);
    const deleteProject = useImageStore((state) => state.deleteProject);
    const deleteProjects = useImageStore((state) => state.deleteProjects);
    const updateProject = useImageStore((state) => state.updateProject);
    const createGroup = useImageStore((state) => state.createGroup);
    const renameGroup = useImageStore((state) => state.renameGroup);
    const deleteGroup = useImageStore((state) => state.deleteGroup);
    const setProjectGroup = useImageStore((state) => state.setProjectGroup);

    // Canvas store (for resource pool & output target)
    const canvasProjects = useCanvasStore((state) => state.projects);
    const updateCanvasProject = useCanvasStore((state) => state.updateProject);
    const createCanvasProject = useCanvasStore((state) => state.createProject);

    // Library UI state
    const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
    const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
    const [editingGroupName, setEditingGroupName] = useState("");
    const [armedGroupId, setArmedGroupId] = useState<string | null>(null);
    const [armedProjectId, setArmedProjectId] = useState<string | null>(null);
    const [moveMenuProjectId, setMoveMenuProjectId] = useState<string | null>(null);

    const removeGroup = (groupId: string) => {
        if (armedGroupId !== groupId) {
            setArmedGroupId(groupId);
            return;
        }
        setArmedGroupId(null);
        setEditingGroupId(null);
        deleteGroup(groupId);
        if (selectedGroupId === groupId) {
            const remaining = groups.filter((g) => g.id !== groupId);
            setSelectedGroupId(remaining[0]?.id || null);
        }
    };

    // Create modal state
    const [createOpen, setCreateOpen] = useState(false);
    const [createGroupId, setCreateGroupId] = useState<string | null>(null);
    const [newTitle, setNewTitle] = useState("");
    const [selectedPresetId, setSelectedPresetId] = useState<string>("16:9");
    const [boardBg, setBoardBg] = useState<string>("#ffffff");
    const [resolution, setResolution] = useState<"1k" | "2k" | "4k">("2k");

    // Output modal state
    const [outputModalOpen, setOutputModalOpen] = useState(false);

    // Rename project modal state
    const [renamingProject, setRenamingProject] = useState<{ id: string; title: string } | null>(null);

    // Keep selected group valid
    useEffect(() => {
        if (groups.length > 0 && (!selectedGroupId || !groups.some((g) => g.id === selectedGroupId))) {
            setSelectedGroupId(groups[0].id);
        }
    }, [groups, selectedGroupId]);

    // Active project if in editor mode
    const currentProject = useMemo(() => {
        if (!id) return null;
        return projects.find((p) => p.id === id) || null;
    }, [id, projects]);

    // Resource pool: gather all image nodes across all canvases with [Canvas Title / Image Name] mapping
    const resourcePoolNodes = useMemo(() => {
        const list: CanvasNodeData[] = [];
        for (const proj of canvasProjects) {
            const canvasTitle = proj.title || "Untitled Canvas";
            for (const node of proj.nodes || []) {
                if (node.type === CanvasNodeType.Image && (node.metadata?.content || node.metadata?.storageKey)) {
                    list.push({
                        ...node,
                        metadata: {
                            ...node.metadata,
                            canvasTitle,
                        },
                    });
                }
            }
        }
        return list;
    }, [canvasProjects]);

    // Sync board changes to image store
    const handleBoardChange = useCallback(
        (patch: Partial<ImageProject>) => {
            if (!currentProject) return;
            updateProject(currentProject.id, patch);
        },
        [currentProject, updateProject],
    );

    // Studio output: Download composite image
    const handleDownload = async (fileName: string) => {
        if (!currentProject) return;
        const composite = await composeSmartCanvas(currentProject);
        if (!composite?.dataUrl) {
            message.error("Failed to render image, please try again");
            return;
        }
        saveAs(composite.dataUrl, fileName.endsWith(".png") ? fileName : `${fileName}.png`);
        message.success("Image artwork downloaded successfully");
    };

    // Studio output: Export composite image to selected canvas
    const handleExportToCanvas = async (targetCanvasId: string, nodeTitle: string) => {
        if (!currentProject) return;
        let targetCanvas = canvasProjects.find((p) => p.id === targetCanvasId);
        if (!targetCanvas) {
            if (canvasProjects.length === 0) {
                const newId = createCanvasProject("Default Canvas");
                targetCanvas = useCanvasStore.getState().projects.find((p) => p.id === newId) || undefined;
            } else {
                targetCanvas = canvasProjects[0];
            }
        }
        if (!targetCanvas) return;

        const composite = await composeSmartCanvas(currentProject);
        if (!composite?.dataUrl) {
            message.error("Failed to render image artwork");
            return;
        }

        const res = await fetch(composite.dataUrl);
        const blob = await res.blob();
        const file = new File([blob], `${nodeTitle || "image"}.png`, { type: "image/png" });
        const uploaded = await uploadImage(file);
        const naturalWidth = currentProject.width || 1024;
        const naturalHeight = currentProject.height || 1024;
        const imageDefault = NODE_DEFAULT_SIZE[CanvasNodeType.Image];
        const size = fitNodeSize(naturalWidth, naturalHeight, imageDefault.width, imageDefault.height);

        const newNode: CanvasNodeData = {
            id: nanoid(),
            type: CanvasNodeType.Image,
            title: nodeTitle || currentProject.title || "Image Artwork",
            position: { x: 80, y: 80 },
            width: size.width,
            height: size.height,
            metadata: {
                content: uploaded.url || composite.dataUrl,
                storageKey: uploaded.storageKey,
                status: "success",
                naturalWidth,
                naturalHeight,
                mimeType: "image/png",
            },
        };

        updateCanvasProject(targetCanvas.id, {
            nodes: [...(targetCanvas.nodes || []), newNode],
        });
        message.success(`Successfully exported to canvas "${targetCanvas.title}"`);
    };

    // Handle create new project submit
    const handleSubmitCreate = () => {
        const preset = IMAGE_PRESETS.find((p) => p.id === selectedPresetId) || IMAGE_PRESETS[0];
        const targetGId = createGroupId || selectedGroupId || (groups[0]?.id ?? null);
        const newId = createProject(
            newTitle.trim() || undefined,
            {
                width: preset.width,
                height: preset.height,
                boardRatio: preset.ratio,
                boardBackground: boardBg,
                boardResolution: resolution,
            },
            targetGId,
        );
        if (targetGId) {
            setSelectedGroupId(targetGId);
        }
        setCreateOpen(false);
        navigate(`/image/${newId}`);
    };

    // =========================================================================
    // 1. Editor View (when :id is present)
    // =========================================================================
    if (id) {
        if (!currentProject) {
            return (
                <div className="flex h-full flex-1 flex-col items-center justify-center gap-3 p-8 text-center bg-background">
                    <Empty description="Image project not found or has been deleted" />
                    <Button type="primary" onClick={() => navigate("/image")}>
                        Back to Image Library
                    </Button>
                </div>
            );
        }

        return (
            <div className="relative flex h-full flex-col overflow-hidden bg-background">
                <ImageStudio
                    board={currentProject}
                    nodes={resourcePoolNodes}
                    onBoardChange={handleBoardChange}
                    onOutput={() => setOutputModalOpen(true)}
                    onBack={() => navigate("/image")}
                />

                <StudioOutputModal
                    open={outputModalOpen}
                    onClose={() => setOutputModalOpen(false)}
                    title="Export Image Artwork"
                    resourceType="image"
                    defaultFileName={`${currentProject.title || "artwork"}.png`}
                    defaultNodeTitle={`${currentProject.title || "Image"} - Artwork`}
                    onDownload={handleDownload}
                    onOutputToCanvas={handleExportToCanvas}
                />
            </div>
        );
    }

    // =========================================================================
    // 2. Library Homepage View (/image)
    // =========================================================================
    const selectedGroup = groups.find((g) => g.id === selectedGroupId) || groups[0] || null;
    const groupProjects = selectedGroup ? projects.filter((p) => p.groupId === selectedGroup.id) : [];

    return (
        <main className="flex h-full min-h-0 bg-background text-foreground">
            {/* Sidebar: Groups */}
            <aside className="glass-surface flex w-60 shrink-0 flex-col border-r border-border">
                <div className="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-border px-4">
                    <p className="text-sm font-semibold uppercase tracking-widest text-muted-foreground" style={{ margin: 0 }}>
                        Image Groups
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
                            {selectedGroup ? selectedGroup.name : "Image Projects"}
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
                                setSelectedPresetId("16:9");
                                setBoardBg("#ffffff");
                                setResolution("2k");
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
                                            Click "New Project" to create multi-layer artwork in "{selectedGroup?.name || "this group"}".
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

                                return (
                                    <div
                                        key={project.id}
                                        onClick={() => navigate(`/image/${project.id}`)}
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
                                                        {project.width} × {project.height} · {project.boardResolution.toUpperCase()}
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
                                                                deleteProject(project.id);
                                                            }}
                                                            onPointerLeave={() => setArmedProjectId(null)}
                                                            title="Click again to confirm delete"
                                                        >
                                                            Confirm Delete
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

                                        {/* Footer updated time */}
                                        <div className="mt-4 flex items-center justify-between border-t border-border/60 pt-2 text-[11px] text-muted-foreground">
                                            <span className="flex items-center gap-1">
                                                <Clock className="size-3" />
                                                {new Date(project.updatedAt).toLocaleDateString()}
                                            </span>
                                            <span className="font-medium text-brand opacity-0 group-hover:opacity-100 transition">
                                                Open Editor →
                                            </span>
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
                title="New Image Project"
                open={createOpen}
                onCancel={() => setCreateOpen(false)}
                onOk={handleSubmitCreate}
                okText="Create"
                cancelText="Cancel"
                destroyOnClose
            >
                <div className="space-y-4 py-3">
                    <div>
                        <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Target Group</label>
                        <Select
                            value={createGroupId || selectedGroup?.id || groups[0]?.id}
                            onChange={setCreateGroupId}
                            className="w-full"
                            options={groups.map((g) => ({ label: g.name, value: g.id }))}
                        />
                    </div>

                    <div>
                        <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Project Name</label>
                        <Input
                            placeholder={`Image Project ${projects.length + 1}`}
                            value={newTitle}
                            onChange={(e) => setNewTitle(e.target.value)}
                            onPressEnter={handleSubmitCreate}
                            autoFocus
                        />
                    </div>

                    <div>
                        <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Aspect Ratio & Preset Size</label>
                        <div className="grid grid-cols-2 gap-2">
                            {IMAGE_PRESETS.map((preset) => {
                                const active = selectedPresetId === preset.id;
                                return (
                                    <button
                                        key={preset.id}
                                        type="button"
                                        onClick={() => setSelectedPresetId(preset.id)}
                                        className={`flex flex-col items-start rounded-lg border p-2.5 text-left transition ${
                                            active
                                                ? "border-brand bg-brand-soft text-brand font-medium"
                                                : "border-border hover:bg-hover text-foreground"
                                        }`}
                                    >
                                        <span className="text-xs font-semibold">{preset.name}</span>
                                        <span className="text-[11px] text-muted-foreground">
                                            {preset.width} × {preset.height} px
                                        </span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Background</label>
                            <Select
                                value={boardBg}
                                onChange={setBoardBg}
                                className="w-full"
                                options={[
                                    { label: "White (#FFFFFF)", value: "#ffffff" },
                                    { label: "Transparent", value: "transparent" },
                                    { label: "Black (#000000)", value: "#000000" },
                                ]}
                            />
                        </div>
                        <div>
                            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Resolution</label>
                            <Select
                                value={resolution}
                                onChange={setResolution}
                                className="w-full"
                                options={[
                                    { label: "1K Standard", value: "1k" },
                                    { label: "2K HD", value: "2k" },
                                    { label: "4K Ultra HD", value: "4k" },
                                ]}
                            />
                        </div>
                    </div>
                </div>
            </Modal>

            {/* Rename Project Modal */}
            <Modal
                title="Rename Image Project"
                open={Boolean(renamingProject)}
                onCancel={() => setRenamingProject(null)}
                onOk={() => {
                    if (renamingProject && renamingProject.title.trim()) {
                        renameProject(renamingProject.id, renamingProject.title.trim());
                    }
                    setRenamingProject(null);
                }}
                okText="Save"
                cancelText="Cancel"
            >
                <div className="py-2">
                    <Input
                        value={renamingProject?.title || ""}
                        onChange={(e) => setRenamingProject((prev) => (prev ? { ...prev, title: e.target.value } : null))}
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
