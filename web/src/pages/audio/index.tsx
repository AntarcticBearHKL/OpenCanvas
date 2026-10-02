import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { App, Button, Dropdown, Empty, Input, InputNumber, Modal, Select, type MenuProps } from "antd";
import { ArrowLeft, AudioWaveform, Check, Clock, FolderInput, FolderKanban, Pencil, Plus, Share2, Trash2, X } from "lucide-react";
import { saveAs } from "file-saver";
import { nanoid } from "nanoid";
import { useTranslation } from "react-i18next";

import AudioStudio from "@/components/canvas/workspace/audio-studio";
import { StudioOutputModal } from "@/components/studio/studio-output-modal";
import { NODE_DEFAULT_SIZE } from "@/constant/canvas";
import { canvasThemes } from "@/lib/canvas-theme";
import { encodeWavBlob, renderAudioMixdown } from "@/lib/canvas/audio-mixdown";
import { audioMetadata } from "@/lib/canvas/canvas-node-factory";
import {
    audioProjectAutomation,
    audioProjectClips,
    audioProjectDuration,
    audioProjectMasterGain,
    audioProjectMidiRegions,
    audioProjectPpqn,
    audioProjectTempo,
    audioProjectTracks,
} from "@/lib/canvas/audio-project";
import { uploadMediaFile } from "@/services/file-storage";
import { useAudioStore } from "@/stores/use-audio-store";
import { useCanvasStore } from "@/stores/canvas/use-canvas-store";
import { useThemeStore } from "@/stores/use-theme-store";
import { CanvasNodeType, type CanvasAudioClip, type CanvasNodeData } from "@/types/canvas";

export default function AudioStudioPage() {
    const { t } = useTranslation();
    const { message } = App.useApp();
    const navigate = useNavigate();
    const { id } = useParams<{ id: string }>();

    const colorTheme = useThemeStore((state) => state.theme);
    const theme = canvasThemes[colorTheme];

    // Audio Project store
    const projects = useAudioStore((state) => state.projects);
    const groups = useAudioStore((state) => state.groups);
    const hydrated = useAudioStore((state) => state.hydrated);
    const createProject = useAudioStore((state) => state.createProject);
    const renameProject = useAudioStore((state) => state.renameProject);
    const deleteProject = useAudioStore((state) => state.deleteProject);
    const deleteProjects = useAudioStore((state) => state.deleteProjects);
    const updateProject = useAudioStore((state) => state.updateProject);
    const createGroup = useAudioStore((state) => state.createGroup);
    const renameGroup = useAudioStore((state) => state.renameGroup);
    const deleteGroup = useAudioStore((state) => state.deleteGroup);
    const setProjectGroup = useAudioStore((state) => state.setProjectGroup);

    // Canvas store (for resource pool & output target)
    const canvasProjects = useCanvasStore((state) => state.projects);
    const updateCanvasProject = useCanvasStore((state) => state.updateProject);
    const createCanvasProject = useCanvasStore((state) => state.createProject);

    // Dynamic recorded nodes in session
    const [recordedNodes, setRecordedNodes] = useState<CanvasNodeData[]>([]);

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
    const [newTempo, setNewTempo] = useState<number>(120);
    const [newMeter, setNewMeter] = useState<string>("4/4");

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

    // Resource pool: gather all audio nodes across all canvases with [Canvas Title / Audio Name] mapping + recorded nodes
    const resourcePoolNodes = useMemo(() => {
        const list: CanvasNodeData[] = [...recordedNodes];
        for (const proj of canvasProjects) {
            const canvasTitle = proj.title || "Untitled Canvas";
            for (const node of proj.nodes || []) {
                if ((node.type === CanvasNodeType.Audio || node.type === CanvasNodeType.Midi) && (node.metadata?.content || node.metadata?.storageKey)) {
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
    }, [canvasProjects, recordedNodes]);

    // Audio recording handler
    const handleAudioRecorded = useCallback(
        async (blob: Blob, take: { trackId: string; start: number; duration: number; name: string }) => {
            if (!currentProject) return;
            try {
                const uploaded = await uploadMediaFile(blob, "audio");
                const newAudioNode: CanvasNodeData = {
                    id: nanoid(),
                    type: CanvasNodeType.Audio,
                    title: take.name,
                    position: { x: 0, y: 0 },
                    width: 320,
                    height: 120,
                    metadata: {
                        content: uploaded.url,
                        storageKey: uploaded.storageKey,
                        durationMs: Math.round(take.duration * 1000),
                        canvasTitle: "Recorded Take",
                    },
                };
                setRecordedNodes((prev) => [newAudioNode, ...prev]);

                // Create a clip referencing this take's stored blob
                const newClip: CanvasAudioClip = {
                    id: nanoid(),
                    trackId: take.trackId,
                    storageKey: uploaded.storageKey,
                    content: uploaded.url,
                    sourceDurationMs: Math.round(take.duration * 1000),
                    name: take.name,
                    start: take.start,
                    duration: take.duration,
                    offset: 0,
                    gain: 1,
                    muted: false,
                };
                updateProject(currentProject.id, {
                    clips: [...(currentProject.clips || []), newClip],
                });
                message.success(t("canvas.audioStudio.recordSaved", { defaultValue: "Recording saved to track" }));
            } catch {
                message.error(t("canvas.audioStudio.recordFailed", { defaultValue: "Failed to save recording" }));
            }
        },
        [currentProject, message, t, updateProject],
    );

    // Studio output: Download mixdown
    const handleDownload = async (fileName: string) => {
        if (!currentProject) return;
        const tracks = audioProjectTracks(currentProject);
        const clips = audioProjectClips(currentProject);
        const regions = audioProjectMidiRegions(currentProject);
        const ppqn = audioProjectPpqn(currentProject);
        const tempo = audioProjectTempo(currentProject);

        if ((!clips.length && !regions.length) || audioProjectDuration(clips, regions, ppqn, tempo) <= 0) {
            message.warning(t("canvas.audioStudio.noContent", { defaultValue: "No audio content in current project" }));
            return;
        }

        try {
            const { audio, skipped } = await renderAudioMixdown({
                tracks,
                clips,
                regions,
                ppqn,
                tempo,
                masterGain: audioProjectMasterGain(currentProject),
                automation: audioProjectAutomation(currentProject),
            });
            if (skipped.length) {
                message.warning(
                    t("canvas.audioStudio.mixdownVstSkipped", {
                        tracks: skipped.map((r) => r.name || "Track").join(", "),
                    }),
                );
            }
            const blob = encodeWavBlob(audio);
            saveAs(blob, fileName.endsWith(".wav") ? fileName : `${fileName}.wav`);
            message.success("Audio mixdown downloaded successfully");
        } catch {
            message.error(t("canvas.audioStudio.mixdownFailed", { defaultValue: "Mixdown export failed" }));
        }
    };

    // Studio output: Export mixdown to selected canvas
    const handleExportToCanvas = async (targetCanvasId: string, nodeTitle: string) => {
        if (!currentProject) return;
        const tracks = audioProjectTracks(currentProject);
        const clips = audioProjectClips(currentProject);
        const regions = audioProjectMidiRegions(currentProject);
        const ppqn = audioProjectPpqn(currentProject);
        const tempo = audioProjectTempo(currentProject);

        if ((!clips.length && !regions.length) || audioProjectDuration(clips, regions, ppqn, tempo) <= 0) {
            message.warning(t("canvas.audioStudio.noContent", { defaultValue: "No audio content in current project" }));
            return;
        }

        try {
            const { audio, skipped } = await renderAudioMixdown({
                tracks,
                clips,
                regions,
                ppqn,
                tempo,
                masterGain: audioProjectMasterGain(currentProject),
                automation: audioProjectAutomation(currentProject),
            });
            if (skipped.length) {
                message.warning(
                    t("canvas.audioStudio.mixdownVstSkipped", {
                        tracks: skipped.map((r) => r.name || "Track").join(", "),
                    }),
                );
            }

            const wavBlob = encodeWavBlob(audio);
            const uploaded = await uploadMediaFile(wavBlob, "audio");

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

            const size = NODE_DEFAULT_SIZE[CanvasNodeType.Audio];
            const newNode: CanvasNodeData = {
                id: nanoid(),
                type: CanvasNodeType.Audio,
                title: nodeTitle || currentProject.title || "Audio Artwork",
                position: { x: 100, y: 100 },
                width: size.width,
                height: size.height,
                metadata: audioMetadata(uploaded),
            };

            updateCanvasProject(targetCanvas.id, {
                nodes: [...(targetCanvas.nodes || []), newNode],
            });
            message.success(`Successfully exported to canvas "${targetCanvas.title}"`);
        } catch {
            message.error(t("canvas.audioStudio.mixdownFailed", { defaultValue: "Mixdown export failed" }));
        }
    };

    // Handle create new project submit
    const handleSubmitCreate = () => {
        const [numerator, denominator] = newMeter.split("/").map(Number);
        const targetGId = createGroupId || selectedGroupId || (groups[0]?.id ?? null);
        const newId = createProject(newTitle.trim() || undefined, targetGId);
        updateProject(newId, {
            tempo: newTempo,
            timeSignature: { numerator, denominator },
        });
        if (targetGId) {
            setSelectedGroupId(targetGId);
        }
        setCreateOpen(false);
        navigate(`/audio/${newId}`);
    };

    // =========================================================================
    // 1. Editor View (when :id is present)
    // =========================================================================
    if (id) {
        if (!currentProject) {
            return (
                <div className="flex h-full flex-1 flex-col items-center justify-center gap-3 p-8 text-center bg-background">
                    <Empty description="Audio project not found or has been deleted" />
                    <Button type="primary" onClick={() => navigate("/audio")}>
                        Back to Audio Library
                    </Button>
                </div>
            );
        }

        return (
            <div className="relative flex h-full flex-col overflow-hidden bg-background">
                <AudioStudio
                    project={currentProject}
                    nodes={resourcePoolNodes}
                    onProjectChange={(patch) => updateProject(currentProject.id, patch)}
                    onOutput={async () => setOutputModalOpen(true)}
                    onExportStems={async () => {
                        message.info("Stem export started");
                    }}
                    onRecorded={handleAudioRecorded}
                    onBack={() => navigate("/audio")}
                />

                <StudioOutputModal
                    open={outputModalOpen}
                    onClose={() => setOutputModalOpen(false)}
                    title="Export Audio Artwork"
                    resourceType="audio"
                    defaultFileName={`${currentProject.title || "mixdown"}.wav`}
                    defaultNodeTitle={`${currentProject.title || "Audio"} - Mixdown`}
                    onDownload={handleDownload}
                    onOutputToCanvas={handleExportToCanvas}
                />
            </div>
        );
    }

    // =========================================================================
    // 2. Library Homepage View (/audio)
    // =========================================================================
    const selectedGroup = groups.find((g) => g.id === selectedGroupId) || groups[0] || null;
    const groupProjects = selectedGroup ? projects.filter((p) => p.groupId === selectedGroup.id) : [];

    return (
        <main className="flex h-full min-h-0 bg-background text-foreground">
            {/* Sidebar: Groups */}
            <aside className="glass-surface flex w-60 shrink-0 flex-col border-r border-border">
                <div className="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-border px-4">
                    <p className="text-sm font-semibold uppercase tracking-widest text-muted-foreground" style={{ margin: 0 }}>
                        Audio Groups
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
                                <div className="flex h-9 items-center gap-1 rounded-md bg-muted px-2">
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
                            {selectedGroup ? selectedGroup.name : "Audio Projects"}
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
                                setNewTempo(120);
                                setNewMeter("4/4");
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
                                            Click "New Project" to arrange and mix multi-track audio in "{selectedGroup?.name || "this group"}".
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
                                        onClick={() => navigate(`/audio/${project.id}`)}
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
                                                        {project.tracks?.length || 0} {project.tracks?.length === 1 ? "track" : "tracks"} · {project.clips?.length || 0} {project.clips?.length === 1 ? "clip" : "clips"}
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
                                                Open Studio →
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
                title="New Audio Project"
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
                            placeholder={`Audio Project ${projects.length + 1}`}
                            value={newTitle}
                            onChange={(e) => setNewTitle(e.target.value)}
                            onPressEnter={handleSubmitCreate}
                            autoFocus
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Initial Tempo (BPM)</label>
                            <InputNumber
                                min={20}
                                max={300}
                                value={newTempo}
                                onChange={(val) => val && setNewTempo(val)}
                                className="w-full"
                            />
                        </div>
                        <div>
                            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Time Signature</label>
                            <Select
                                value={newMeter}
                                onChange={setNewMeter}
                                className="w-full"
                                options={[
                                    { label: "4/4", value: "4/4" },
                                    { label: "3/4", value: "3/4" },
                                    { label: "2/4", value: "2/4" },
                                    { label: "6/8", value: "6/8" },
                                ]}
                            />
                        </div>
                    </div>
                </div>
            </Modal>

            {/* Rename Project Modal */}
            <Modal
                title="Rename Audio Project"
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
