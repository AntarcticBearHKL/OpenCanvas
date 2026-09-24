import { Plus, Sparkles, X } from "lucide-react";
import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Input, Select } from "antd";

import { STUDIO_FLAT_BUTTON_CLASS, STUDIO_PANEL_LABEL_CLASS, STUDIO_PANEL_ROW_CLASS } from "@/components/canvas/workspace/studio-chrome";
import { useWriteAi } from "@/components/write/use-write-ai";
import { useCanvasTheme } from "@/hooks/use-canvas-theme";
import { docUnitFor, findNode, isExpandable } from "@/lib/write/outline";
import { levelOf } from "@/lib/write/presets";
import { useWriteUiStore } from "@/stores/use-write-ui-store";
import { useWritingProject, useWritingStore } from "@/stores/use-writing-store";
import { OUTLINE_STATUSES, type CodexKind, type OutlineNode, type OutlineStatus } from "@/types/writing";

function InspectorSection({ title, children }: { title: string; children: ReactNode }) {
    const theme = useCanvasTheme();
    return (
        <section className="border-b px-3 py-2" style={{ borderColor: theme.toolbar.border }}>
            <div className="pb-1 text-sm font-medium" style={{ color: theme.node.label }}>
                {title}
            </div>
            {children}
        </section>
    );
}

function LinkChip({ label, onRemove }: { label: string; onRemove: () => void }) {
    const { t } = useTranslation();
    const theme = useCanvasTheme();
    return (
        <span className="flex min-w-0 items-center gap-1 rounded-[2px] border px-1.5 py-0.5 text-sm" style={{ borderColor: theme.toolbar.border, color: theme.node.text }}>
            <span className="truncate">{label}</span>
            <button type="button" className="shrink-0 text-muted-foreground transition hover:text-danger" aria-label={t("writing.common.delete")} onClick={onRemove}>
                <X className="size-3" />
            </button>
        </span>
    );
}

function TagEditor({ tags, onChange }: { tags: string[]; onChange: (tags: string[]) => void }) {
    const { t } = useTranslation();
    const theme = useCanvasTheme();
    const [draft, setDraft] = useState("");

    const add = () => {
        const value = draft.trim();
        if (!value) return;
        setDraft("");
        if (!tags.includes(value)) onChange([...tags, value]);
    };

    return (
        <>
            {tags.length ? (
                <div className="flex flex-wrap items-center gap-1 pb-1">
                    {tags.map((tag) => (
                        <LinkChip key={tag} label={tag} onRemove={() => onChange(tags.filter((item) => item !== tag))} />
                    ))}
                </div>
            ) : null}
            <div className="flex items-center gap-1">
                <Input
                    size="small"
                    variant="borderless"
                    className="min-w-0 flex-1"
                    placeholder={t("writing.inspector.tagPlaceholder")}
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    onKeyDown={(event) => {
                        if (event.key === "Enter") {
                            event.preventDefault();
                            add();
                        }
                    }}
                />
                <button type="button" className={STUDIO_FLAT_BUTTON_CLASS} style={{ color: theme.node.muted }} onClick={add}>
                    <Plus className="size-3" />
                    {t("writing.inspector.addTag")}
                </button>
            </div>
        </>
    );
}

export function InspectorPanel() {
    const { t } = useTranslation();
    const theme = useCanvasTheme();
    const projectId = useWriteUiStore((state) => state.projectId);
    const selectedOutlineId = useWriteUiStore((state) => state.selectedOutlineId);
    const project = useWritingProject(projectId ?? undefined);
    const updateOutlineNode = useWritingStore((state) => state.updateOutlineNode);
    const { expandOutline } = useWriteAi();
    const node = project ? findNode(project.outline, selectedOutlineId) : null;

    if (!project || !node) return <div className="thin-scrollbar min-h-0 flex-1 overflow-y-auto p-3 text-sm" style={{ color: theme.node.muted }}>{t("writing.inspector.empty")}</div>;

    const level = levelOf(project.template, node.kind);
    const unitId = docUnitFor(project, node.id)?.id ?? node.id;
    const words = project.docs[unitId]?.wordCount ?? 0;
    const versions = project.revisions.filter((revision) => revision.outlineId === unitId).length;
    const patch = (value: Partial<OutlineNode>) => updateOutlineNode(project.id, node.id, value);
    const codexOptions = (kind: CodexKind, linked: string[]) =>
        project.codex
            .filter((entry) => entry.kind === kind && !linked.includes(entry.id))
            .map((entry) => ({ value: entry.id, label: entry.name }));
    const nameOf = (id: string) => project.codex.find((entry) => entry.id === id)?.name ?? id;

    return (
        <div key={node.id} className="thin-scrollbar min-h-0 flex-1 overflow-y-auto text-sm" style={{ color: theme.node.text }}>
            <InspectorSection title={t("writing.inspector.basic")}>
                <div className={STUDIO_PANEL_ROW_CLASS}>
                    <span className={STUDIO_PANEL_LABEL_CLASS} style={{ color: theme.node.muted }}>
                        {t("writing.inspector.kind")}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm" style={{ color: theme.node.text }}>{level ? t(level.labelKey) : node.kind}</span>
                </div>
                <div className={STUDIO_PANEL_ROW_CLASS}>
                    <span className={STUDIO_PANEL_LABEL_CLASS} style={{ color: theme.node.muted }}>
                        {t("writing.inspector.title")}
                    </span>
                    <Input
                        size="small"
                        variant="borderless"
                        className="min-w-0 flex-1"
                        defaultValue={node.title}
                        onBlur={(event) => {
                            const value = event.target.value.trim();
                            if (value && value !== node.title) patch({ title: value });
                        }}
                    />
                </div>
                <div className={STUDIO_PANEL_ROW_CLASS}>
                    <span className={STUDIO_PANEL_LABEL_CLASS} style={{ color: theme.node.muted }}>
                        {t("writing.inspector.status")}
                    </span>
                    <Select
                        size="small"
                        variant="borderless"
                        className="min-w-0 flex-1"
                        value={node.status}
                        options={OUTLINE_STATUSES.map((status) => ({ value: status, label: t(`writing.status.${status}`) }))}
                        popupMatchSelectWidth={false}
                        styles={{ popup: { root: { zIndex: 1300 } } }}
                        aria-label={t("writing.inspector.status")}
                        onChange={(value: OutlineStatus) => patch({ status: value })}
                    />
                </div>
                <div className="flex min-w-0 items-start gap-1.5 py-1">
                    <span className={`${STUDIO_PANEL_LABEL_CLASS} pt-0.5`} style={{ color: theme.node.muted }}>
                        {t("writing.inspector.summary")}
                    </span>
                    <Input.TextArea
                        size="small"
                        variant="borderless"
                        autoSize={{ minRows: 2, maxRows: 6 }}
                        className="min-w-0 flex-1"
                        defaultValue={node.summary}
                        onBlur={(event) => {
                            if (event.target.value !== node.summary) patch({ summary: event.target.value });
                        }}
                    />
                </div>
            </InspectorSection>
            <InspectorSection title={t("writing.inspector.links")}>
                <div className="flex items-center gap-1.5 py-1">
                    <span className={STUDIO_PANEL_LABEL_CLASS} style={{ color: theme.node.muted }}>
                        {t("writing.inspector.characters")}
                    </span>
                    <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
                        {node.characterIds.map((id) => (
                            <LinkChip key={id} label={nameOf(id)} onRemove={() => patch({ characterIds: node.characterIds.filter((item) => item !== id) })} />
                        ))}
                        <Select
                            size="small"
                            variant="borderless"
                            className="min-w-24 flex-1"
                            value={null}
                            placeholder={t("writing.inspector.charactersAdd")}
                            options={codexOptions("character", node.characterIds)}
                            popupMatchSelectWidth={false}
                            styles={{ popup: { root: { zIndex: 1300 } } }}
                            aria-label={t("writing.inspector.charactersAdd")}
                            onChange={(value: string) => patch({ characterIds: [...node.characterIds, value] })}
                        />
                    </div>
                </div>
                <div className="flex items-center gap-1.5 py-1">
                    <span className={STUDIO_PANEL_LABEL_CLASS} style={{ color: theme.node.muted }}>
                        {t("writing.inspector.location")}
                    </span>
                    <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
                        {node.locationId ? <LinkChip label={nameOf(node.locationId)} onRemove={() => patch({ locationId: null })} /> : null}
                        <Select
                            size="small"
                            variant="borderless"
                            className="min-w-24 flex-1"
                            value={null}
                            placeholder={t("writing.inspector.locationAdd")}
                            options={codexOptions("location", node.locationId ? [node.locationId] : [])}
                            popupMatchSelectWidth={false}
                            styles={{ popup: { root: { zIndex: 1300 } } }}
                            aria-label={t("writing.inspector.locationAdd")}
                            onChange={(value: string) => patch({ locationId: value })}
                        />
                    </div>
                </div>
                <div className="flex items-center gap-1.5 py-1">
                    <span className={STUDIO_PANEL_LABEL_CLASS} style={{ color: theme.node.muted }}>
                        {t("writing.inspector.threads")}
                    </span>
                    <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
                        {node.threadIds.map((id) => (
                            <LinkChip key={id} label={nameOf(id)} onRemove={() => patch({ threadIds: node.threadIds.filter((item) => item !== id) })} />
                        ))}
                        <Select
                            size="small"
                            variant="borderless"
                            className="min-w-24 flex-1"
                            value={null}
                            placeholder={t("writing.inspector.threadsAdd")}
                            options={codexOptions("thread", node.threadIds)}
                            popupMatchSelectWidth={false}
                            styles={{ popup: { root: { zIndex: 1300 } } }}
                            aria-label={t("writing.inspector.threadsAdd")}
                            onChange={(value: string) => patch({ threadIds: [...node.threadIds, value] })}
                        />
                    </div>
                </div>
            </InspectorSection>
            <InspectorSection title={t("writing.inspector.tags")}>
                <TagEditor key={node.id} tags={node.tags} onChange={(tags) => patch({ tags })} />
            </InspectorSection>
            <InspectorSection title={t("writing.inspector.stats")}>
                <div className="flex items-center gap-3 py-0.5 text-xs tabular-nums" style={{ color: theme.node.muted }}>
                    <span>{t("writing.inspector.words", { count: words })}</span>
                    <span>{t("writing.inspector.version", { count: versions })}</span>
                </div>
                {isExpandable(project, node) ? (
                    <button type="button" className={STUDIO_FLAT_BUTTON_CLASS} style={{ color: theme.node.accent }} onClick={() => void expandOutline(node.id)}>
                        <Sparkles className="size-3.5" />
                        {t("writing.inspector.aiExpand")}
                    </button>
                ) : null}
            </InspectorSection>
        </div>
    );
}
