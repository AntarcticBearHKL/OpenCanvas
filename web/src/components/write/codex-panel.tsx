import { Plus, Search, Trash2, X } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Input, Popconfirm, Select } from "antd";

import { STUDIO_FLAT_BUTTON_CLASS, STUDIO_LIST_ROW_CLASS, STUDIO_PANEL_LABEL_CLASS, STUDIO_PANEL_ROW_CLASS, STUDIO_TOOL_BUTTON_CLASS } from "@/components/canvas/workspace/studio-chrome";
import { useCanvasTheme } from "@/hooks/use-canvas-theme";
import { CODEX_META } from "@/lib/write/presets";
import { useWriteUiStore } from "@/stores/use-write-ui-store";
import { useWritingProject, useWritingStore } from "@/stores/use-writing-store";
import { CODEX_KINDS, type CodexEntry, type CodexKind } from "@/types/writing";

type FieldRow = { key: string; value: string };

const parseList = (value: string) =>
    value
        .split(/[,，]/)
        .map((item) => item.trim())
        .filter(Boolean);

function FieldEditor({ fields, onChange }: { fields: Record<string, string>; onChange: (fields: Record<string, string>) => void }) {
    const { t } = useTranslation();
    const theme = useCanvasTheme();
    const [rows, setRows] = useState<FieldRow[]>(() => Object.entries(fields).map(([key, value]) => ({ key, value })));

    const commit = (next: FieldRow[]) => {
        const record: Record<string, string> = {};
        next.forEach((row) => {
            if (row.key.trim()) record[row.key.trim()] = row.value;
        });
        onChange(record);
    };

    const patchRow = (index: number, patch: Partial<FieldRow>) => setRows((items) => items.map((row, i) => (i === index ? { ...row, ...patch } : row)));

    const removeRow = (index: number) => {
        const next = rows.filter((_, i) => i !== index);
        setRows(next);
        commit(next);
    };

    return (
        <div className="py-1">
            <div className="flex items-center gap-1.5">
                <span className="text-sm" style={{ color: theme.node.muted }}>
                    {t("writing.codex.fields")}
                </span>
                <button type="button" className={`${STUDIO_FLAT_BUTTON_CLASS} ml-auto`} style={{ color: theme.node.muted }} onClick={() => setRows((items) => [...items, { key: "", value: "" }])}>
                    <Plus className="size-3" />
                    {t("writing.codex.addField")}
                </button>
            </div>
            {rows.map((row, index) => (
                <div key={index} className="flex min-w-0 items-center gap-1 py-0.5">
                    <Input size="small" variant="borderless" className="w-20 shrink-0" placeholder={t("writing.codex.fieldKey")} value={row.key} onChange={(event) => patchRow(index, { key: event.target.value })} onBlur={() => commit(rows)} />
                    <Input size="small" variant="borderless" className="min-w-0 flex-1" placeholder={t("writing.codex.fieldValue")} value={row.value} onChange={(event) => patchRow(index, { value: event.target.value })} onBlur={() => commit(rows)} />
                    <button type="button" className={STUDIO_TOOL_BUTTON_CLASS} style={{ color: theme.node.muted }} onClick={() => removeRow(index)} aria-label={t("writing.common.delete")}>
                        <X className="size-3" />
                    </button>
                </div>
            ))}
        </div>
    );
}

export function CodexPanel() {
    const { t } = useTranslation();
    const theme = useCanvasTheme();
    const projectId = useWriteUiStore((state) => state.projectId);
    const codexKind = useWriteUiStore((state) => state.codexKind);
    const setCodexKind = useWriteUiStore((state) => state.setCodexKind);
    const selectedCodexId = useWriteUiStore((state) => state.selectedCodexId);
    const selectCodex = useWriteUiStore((state) => state.selectCodex);
    const project = useWritingProject(projectId ?? undefined);
    const addCodexEntry = useWritingStore((state) => state.addCodexEntry);
    const updateCodexEntry = useWritingStore((state) => state.updateCodexEntry);
    const removeCodexEntry = useWritingStore((state) => state.removeCodexEntry);
    const [query, setQuery] = useState("");
    const selected = project?.codex.find((entry) => entry.id === selectedCodexId) ?? null;

    const entries = useMemo(() => {
        const keyword = query.trim().toLowerCase();
        return (project?.codex ?? [])
            .filter((entry) => codexKind === "all" || entry.kind === codexKind)
            .filter((entry) => !keyword || [entry.name, ...entry.aliases, entry.summary, ...entry.tags].join(" ").toLowerCase().includes(keyword));
    }, [project?.codex, codexKind, query]);

    if (!project) return null;

    const kindOptions: { value: CodexKind | "all"; label: string }[] = [
        { value: "all", label: t("writing.common.all") },
        ...CODEX_KINDS.map((kind) => ({ value: kind, label: t(CODEX_META[kind].labelKey) })),
    ];

    const commit = (patch: Partial<CodexEntry>) => {
        if (selected) updateCodexEntry(project.id, selected.id, patch);
    };

    const addEntry = () => selectCodex(addCodexEntry(project.id, codexKind === "all" ? "character" : codexKind));

    return (
        <div className="thin-scrollbar min-h-0 flex-1 overflow-y-auto text-sm" style={{ color: theme.node.text }}>
            <div className="flex items-center gap-1 px-2 pt-2">
                <Select
                    size="small"
                    variant="borderless"
                    className="min-w-0 flex-1"
                    value={codexKind}
                    options={kindOptions}
                    popupMatchSelectWidth={false}
                    styles={{ popup: { root: { zIndex: 1300 } } }}
                    aria-label={t("writing.panel.codex")}
                    onChange={(value: CodexKind | "all") => setCodexKind(value)}
                />
                <span className="shrink-0 text-xs tabular-nums" style={{ color: theme.node.muted }}>{t("writing.codex.count", { count: entries.length })}</span>
                <button type="button" className={STUDIO_FLAT_BUTTON_CLASS} style={{ color: theme.node.text }} onClick={addEntry} aria-label={t("writing.codex.add")} title={t("writing.codex.add")}>
                    <Plus className="size-3.5" />
                </button>
            </div>
            <div className="px-2 py-1.5">
                <Input size="small" allowClear prefix={<Search className="size-3.5" style={{ color: theme.node.muted }} />} placeholder={t("writing.codex.searchPlaceholder")} value={query} onChange={(event) => setQuery(event.target.value)} />
            </div>
            {entries.length ? (
                <div className="px-1.5 pb-1">
                    {entries.map((entry) => {
                        const meta = CODEX_META[entry.kind];
                        const Icon = meta.icon;
                        const active = entry.id === selected?.id;
                        return (
                            <button key={entry.id} type="button" className={STUDIO_LIST_ROW_CLASS} style={active ? { background: theme.toolbar.activeBg, color: theme.toolbar.activeText } : undefined} onClick={() => selectCodex(entry.id)}>
                                <Icon className="size-3.5 shrink-0" style={{ color: meta.color }} />
                                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                                    <span className="flex min-w-0 items-center gap-1">
                                        <span className="truncate">{entry.name}</span>
                                        {entry.aliases.slice(0, 2).map((alias) => (
                                            <span key={alias} className="max-w-16 shrink-0 truncate rounded-[2px] border px-1 text-xs" style={{ borderColor: theme.toolbar.border, color: theme.node.muted }}>
                                                {alias}
                                            </span>
                                        ))}
                                    </span>
                                    {entry.summary ? <span className="line-clamp-1" style={{ color: theme.node.muted }}>{entry.summary}</span> : null}
                                </span>
                            </button>
                        );
                    })}
                </div>
            ) : (
                <div className="px-3 py-6 text-center" style={{ color: theme.node.muted }}>{t("writing.codex.empty")}</div>
            )}
            {selected ? (
                <div key={selected.id} className="mt-1 border-t px-2 pb-4 pt-1.5" style={{ borderColor: theme.toolbar.border }}>
                    <div className={STUDIO_PANEL_ROW_CLASS}>
                        <span className={STUDIO_PANEL_LABEL_CLASS} style={{ color: theme.node.muted }}>
                            {t("writing.codex.name")}
                        </span>
                        <Input
                            size="small"
                            variant="borderless"
                            className="min-w-0 flex-1"
                            defaultValue={selected.name}
                            onBlur={(event) => {
                                const value = event.target.value.trim();
                                if (value && value !== selected.name) commit({ name: value });
                            }}
                        />
                    </div>
                    <div className={STUDIO_PANEL_ROW_CLASS}>
                        <span className={STUDIO_PANEL_LABEL_CLASS} style={{ color: theme.node.muted }}>
                            {t("writing.codex.aliases")}
                        </span>
                        <Input
                            size="small"
                            variant="borderless"
                            className="min-w-0 flex-1"
                            defaultValue={selected.aliases.join(", ")}
                            onBlur={(event) => {
                                const aliases = parseList(event.target.value);
                                if (aliases.join() !== selected.aliases.join()) commit({ aliases });
                            }}
                        />
                    </div>
                    <div className="flex min-w-0 items-start gap-1.5 py-1">
                        <span className={`${STUDIO_PANEL_LABEL_CLASS} pt-0.5`} style={{ color: theme.node.muted }}>
                            {t("writing.codex.summary")}
                        </span>
                        <Input.TextArea
                            size="small"
                            variant="borderless"
                            autoSize={{ minRows: 2, maxRows: 6 }}
                            className="min-w-0 flex-1"
                            defaultValue={selected.summary}
                            onBlur={(event) => {
                                if (event.target.value !== selected.summary) commit({ summary: event.target.value });
                            }}
                        />
                    </div>
                    <div className={STUDIO_PANEL_ROW_CLASS}>
                        <span className={STUDIO_PANEL_LABEL_CLASS} style={{ color: theme.node.muted }}>
                            {t("writing.codex.tags")}
                        </span>
                        <Input
                            size="small"
                            variant="borderless"
                            className="min-w-0 flex-1"
                            defaultValue={selected.tags.join(", ")}
                            onBlur={(event) => {
                                const tags = parseList(event.target.value);
                                if (tags.join() !== selected.tags.join()) commit({ tags });
                            }}
                        />
                    </div>
                    <FieldEditor key={selected.id} fields={selected.fields} onChange={(fields) => updateCodexEntry(project.id, selected.id, { fields })} />
                    <div className="flex justify-end pt-2">
                        <Popconfirm
                            title={t("writing.codex.deleteConfirm")}
                            okText={t("writing.common.delete")}
                            cancelText={t("writing.common.cancel")}
                            onConfirm={() => {
                                removeCodexEntry(project.id, selected.id);
                                selectCodex(null);
                            }}
                        >
                            <button type="button" className={STUDIO_FLAT_BUTTON_CLASS} style={{ color: theme.node.danger }}>
                                <Trash2 className="size-3.5" />
                                {t("writing.codex.delete")}
                            </button>
                        </Popconfirm>
                    </div>
                </div>
            ) : null}
        </div>
    );
}
