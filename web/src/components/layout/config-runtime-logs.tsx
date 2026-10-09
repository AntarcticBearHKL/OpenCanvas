import { useState } from "react";
import { App, Button, Empty, Select } from "antd";
import { saveAs } from "file-saver";
import { Copy, Download, Eraser } from "lucide-react";
import { useTranslation } from "react-i18next";

import { useRuntimeLogStore, type RuntimeLogCategory, type RuntimeLogEntry, type RuntimeLogLevel } from "@/stores/use-runtime-log-store";

const DISPLAY_LIMIT = 50;
const LOG_LEVELS: RuntimeLogLevel[] = ["info", "warn", "error"];
const LOG_CATEGORIES: RuntimeLogCategory[] = ["generation", "canvas", "agent", "system"];

export function ConfigRuntimeLogs() {
    const { t } = useTranslation();
    const { message } = App.useApp();
    const records = useRuntimeLogStore((state) => state.records);
    const clear = useRuntimeLogStore((state) => state.clear);
    const [level, setLevel] = useState<RuntimeLogLevel | "all">("all");
    const [category, setCategory] = useState<RuntimeLogCategory | "all">("all");

    const filtered = records.filter((entry) => (level === "all" || entry.level === level) && (category === "all" || entry.category === category));
    const visible = filtered.slice(0, DISPLAY_LIMIT);
    const text = formatRuntimeLogs(filtered);

    const copyLogs = () => {
        void navigator.clipboard.writeText(text).then(() => message.success(t("common.copied")));
    };

    const downloadLogs = () => {
        saveAs(new Blob([text], { type: "text/plain;charset=utf-8" }), "runtime-logs.txt");
    };

    return (
        <section className="overflow-hidden rounded-xl border border-border dark:border-border glass-card">
            <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3 dark:border-border">
                <div className="text-sm font-semibold">{t("config.logs.title")}</div>
                <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">{t("config.logs.filterLevel")}</span>
                    <Select
                        size="small"
                        className="w-24"
                        value={level}
                        onChange={(value) => setLevel(value as RuntimeLogLevel | "all")}
                        options={[{ value: "all", label: t("common.all") }, ...LOG_LEVELS.map((item) => ({ value: item, label: t(`config.logs.level.${item}`) }))]}
                    />
                    <span className="text-xs text-muted-foreground">{t("config.logs.filterCategory")}</span>
                    <Select
                        size="small"
                        className="w-28"
                        value={category}
                        onChange={(value) => setCategory(value as RuntimeLogCategory | "all")}
                        options={[{ value: "all", label: t("common.all") }, ...LOG_CATEGORIES.map((item) => ({ value: item, label: t(`config.logs.category.${item}`) }))]}
                    />
                    <Button size="small" icon={<Eraser className="size-3.5" />} disabled={!records.length} onClick={clear}>
                        {t("config.logs.clear")}
                    </Button>
                    <Button size="small" icon={<Copy className="size-3.5" />} disabled={!filtered.length} onClick={copyLogs}>
                        {t("config.logs.copy")}
                    </Button>
                    <Button size="small" icon={<Download className="size-3.5" />} disabled={!filtered.length} onClick={downloadLogs}>
                        {t("common.download")}
                    </Button>
                </div>
            </div>
            {visible.length ? (
                <div className="divide-y divide-border dark:divide-border">
                    {visible.map((entry) => (
                        <RuntimeLogRow key={entry.id} entry={entry} />
                    ))}
                </div>
            ) : (
                <div className="py-8">
                    <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t("config.logs.empty")} />
                </div>
            )}
        </section>
    );
}

function RuntimeLogRow({ entry }: { entry: RuntimeLogEntry }) {
    const { t } = useTranslation();
    const tone = { info: "text-muted-foreground", warn: "text-warning", error: "text-danger" }[entry.level];

    return (
        <div className="px-4 py-2.5">
            <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className={`rounded-md bg-muted px-1.5 py-0.5 font-medium ${tone}`}>{t(`config.logs.level.${entry.level}`)}</span>
                <span className="rounded-md border border-border px-1.5 py-0.5 text-muted-foreground dark:border-border">{t(`config.logs.category.${entry.category}`)}</span>
                <span className="text-muted-foreground">{new Date(entry.at).toLocaleString()}</span>
                <span className="min-w-0 font-medium">{entry.action}</span>
            </div>
            <div className="mt-1 text-sm break-all">{entry.message}</div>
            {entry.detail ? (
                <details className="mt-1">
                    <summary className="cursor-pointer text-xs text-muted-foreground">{t("config.logs.detail")}</summary>
                    <div className="mt-1 whitespace-pre-wrap break-all font-mono text-[11px] text-muted-foreground">{entry.detail}</div>
                </details>
            ) : null}
        </div>
    );
}

function formatRuntimeLogs(entries: RuntimeLogEntry[]) {
    return entries
        .map((entry) => {
            const head = `[${new Date(entry.at).toLocaleString()}] [${entry.level.toUpperCase()}] [${entry.category}] ${entry.action}: ${entry.message}`;
            return entry.detail ? `${head}\n${entry.detail}` : head;
        })
        .join("\n");
}
