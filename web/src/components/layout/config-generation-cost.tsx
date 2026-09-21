import { Button, Empty } from "antd";
import { Eraser } from "lucide-react";
import { useTranslation } from "react-i18next";

import { formatUsd, priceModelId, type GenerationCostUnit } from "@/lib/canvas/generation-cost";
import { useGenerationCostStore, type GenerationCostRecord } from "@/stores/use-generation-cost-store";

const RECENT_COST_LIMIT = 20;

export function ConfigGenerationCost() {
    const { t } = useTranslation();
    const records = useGenerationCostStore((state) => state.records);
    const clear = useGenerationCostStore((state) => state.clear);
    const priced = records.filter((record) => record.priced);
    const total = priced.reduce((sum, record) => sum + record.usd, 0);

    if (!records.length) return <Empty className="py-10" image={Empty.PRESENTED_IMAGE_SIMPLE} description={t("config.cost.empty")} />;

    return (
        <div className="space-y-3">
            <section className="rounded-lg border border-border p-4 dark:border-border">
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                        <div className="text-xs text-muted-foreground">{t("config.cost.total")}</div>
                        <div className="mt-1 text-2xl font-semibold tabular-nums">{formatUsd(total)}</div>
                        <div className="mt-1 text-xs text-muted-foreground">{t("config.cost.records", { count: records.length })}</div>
                        <div className="mt-1 text-xs text-muted-foreground">{t("config.cost.unpricedNote", { count: records.length - priced.length })}</div>
                    </div>
                    <Button icon={<Eraser className="size-4" />} onClick={clear}>
                        {t("config.cost.clear")}
                    </Button>
                </div>
            </section>
            <section className="overflow-hidden rounded-lg border border-border">
                <div className="border-b border-border px-4 py-3 text-sm font-semibold dark:border-border">{t("config.cost.byModel")}</div>
                <div className="divide-y divide-border dark:divide-border">
                    {groupByModel(records).map((group) => (
                        <div key={group.model} className="flex items-center justify-between gap-4 px-4 py-3 text-sm">
                            <div className="min-w-0">
                                <div className="truncate font-medium">{group.model}</div>
                                <div className="mt-0.5 text-xs text-muted-foreground">{t("config.cost.records", { count: group.count })}</div>
                            </div>
                            <div className="shrink-0 font-medium tabular-nums">{group.pricedCount ? formatUsd(group.usd) : t("config.cost.unpriced")}</div>
                        </div>
                    ))}
                </div>
            </section>
            <section className="overflow-hidden rounded-lg border border-border">
                <div className="border-b border-border px-4 py-3 text-sm font-semibold dark:border-border">{t("config.cost.recent")}</div>
                <div className="divide-y divide-border dark:divide-border">
                    {records.slice(0, RECENT_COST_LIMIT).map((record) => (
                        <div key={record.id} className="flex items-center justify-between gap-4 px-4 py-3 text-sm">
                            <div className="min-w-0">
                                <div className="truncate font-medium">{priceModelId(record.model) || record.model}</div>
                                <div className="mt-0.5 truncate text-xs text-muted-foreground">
                                    {new Date(record.at).toLocaleString()} · {record.quantity} {t(unitLabelKey(record.unit))}
                                </div>
                            </div>
                            <div className="shrink-0 font-medium tabular-nums">{record.priced ? `${record.source === "estimate" ? "~" : ""}${formatUsd(record.usd)}` : t("config.cost.unpriced")}</div>
                        </div>
                    ))}
                </div>
            </section>
        </div>
    );
}

function groupByModel(records: GenerationCostRecord[]) {
    const groups = new Map<string, { model: string; count: number; usd: number; pricedCount: number }>();
    records.forEach((record) => {
        const model = priceModelId(record.model) || record.model;
        const group = groups.get(model) || { model, count: 0, usd: 0, pricedCount: 0 };
        group.count += 1;
        if (record.priced) {
            group.usd += record.usd;
            group.pricedCount += 1;
        }
        groups.set(model, group);
    });
    return [...groups.values()];
}

function unitLabelKey(unit: GenerationCostUnit) {
    if (unit === "video-second") return "config.cost.unitVideoSecond";
    if (unit === "call") return "config.cost.unitCall";
    if (unit === "audio-clip") return "config.cost.unitAudioClip";
    if (unit === "audio-byte") return "config.cost.unitAudioByte";
    return "config.cost.unitImage";
}
