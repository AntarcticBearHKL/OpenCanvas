import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { App, Button, Empty, Input, Spin } from "antd";
import { Check, FolderKanban, FolderPlus, Pencil, Plus, Trash2, X } from "lucide-react";
import { useTranslation } from "react-i18next";

import { CanvasProjectCard } from "@/components/canvas/canvas-project-row";
import { cleanupUnusedCanvasImages } from "@/services/image-storage";
import { useCanvasStore } from "@/stores/canvas/use-canvas-store";
import { useCanvasUiStore } from "@/stores/canvas/use-canvas-ui-store";

export default function CanvasPage() {
    const { modal } = App.useApp();
    const { t } = useTranslation();
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const autoOpenRef = useRef(false);
    const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
    const [editingGroupName, setEditingGroupName] = useState("");
    const hydrated = useCanvasStore((state) => state.hydrated);
    const projects = useCanvasStore((state) => state.projects);
    const groups = useCanvasStore((state) => state.groups);
    const createProject = useCanvasStore((state) => state.createProject);
    const createGroup = useCanvasStore((state) => state.createGroup);
    const renameGroup = useCanvasStore((state) => state.renameGroup);
    const deleteGroup = useCanvasStore((state) => state.deleteGroup);
    const [armedGroupId, setArmedGroupId] = useState<string | null>(null);
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
    const addGroup = () => {
        setSelectedGroupId(createGroup());
    };
    const saveGroupName = () => {
        if (editingGroupId) renameGroup(editingGroupId, editingGroupName);
        setEditingGroupId(null);
    };
    const removeGroup = (id: string) => {
        if (armedGroupId !== id) {
            setArmedGroupId(id);
            return;
        }
        setArmedGroupId(null);
        setEditingGroupId(null);
        deleteGroup(id);
        cleanupUnusedCanvasImages();
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
                                <div className="flex h-9 items-center gap-1 rounded-xl border-b border-border bg-muted px-2">
                                    <Input
                                        size="small"
                                        className="min-w-0 flex-1 rounded-md"
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
                                            {projects.filter((project) => project.groupId === group.id).length}
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
                                            aria-label={t("canvas.group.rename")}
                                            title={t("canvas.group.rename")}
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
                                            aria-label={armedGroupId === group.id ? t("canvas.project.confirmDelete") : t("canvas.group.delete")}
                                            title={armedGroupId === group.id ? t("canvas.project.confirmDelete") : t("canvas.group.delete")}
                                        >
                                            {armedGroupId === group.id ? t("canvas.project.confirmDelete") : null}
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
                        <h1 className="text-base font-semibold text-foreground" style={{ margin: 0 }}>{selectedGroup?.name ?? t("canvas.group.none")}</h1>
                        {selectedGroup ? <span className="rounded-full bg-brand-soft px-2 py-0.5 text-xs text-brand font-medium">{groupProjects.length} {groupProjects.length === 1 ? "canvas" : "canvases"}</span> : null}
                    </div>
                    <div className="flex items-center gap-2">
                        <Button disabled={!hydrated || !selectedGroup} type="primary" icon={<Plus className="size-4" />} onClick={createAndEnter}>
                            {t("canvas.create")}
                        </Button>
                    </div>
                </div>

                <div className="thin-scrollbar flex-1 overflow-y-auto p-6">
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
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                            {groupProjects.map((project) => (
                                <CanvasProjectCard key={project.id} project={project} />
                            ))}
                        </div>
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
        </main>
    );
}
