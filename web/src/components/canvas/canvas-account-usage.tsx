import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CircleUserRound, RotateCw } from "lucide-react";
import { Popover } from "antd";
import { useTranslation } from "react-i18next";

import { useCanvasTheme } from "@/hooks/use-canvas-theme";
import { fetchOpenRouterKeyUsage } from "@/services/api/openrouter-account";
import { useConfigStore } from "@/stores/use-config-store";
import { useGenerationCostStore } from "@/stores/use-generation-cost-store";

const QUERY_KEY = "openrouter-key-usage";

export function CanvasAccountUsage() {
    const { t } = useTranslation();
    const theme = useCanvasTheme();
    const apiKey = useConfigStore((state) => state.config.apiKey);
    const queryClient = useQueryClient();
    const recordCount = useGenerationCostStore((state) => state.records.length);
    const previousRecordCount = useRef(recordCount);
    const [open, setOpen] = useState(false);
    const query = useQuery({
        queryKey: [QUERY_KEY, apiKey],
        queryFn: () => fetchOpenRouterKeyUsage(apiKey),
        enabled: open && Boolean(apiKey),
        staleTime: 0,
    });

    useEffect(() => {
        if (recordCount === previousRecordCount.current) return;
        previousRecordCount.current = recordCount;
        void queryClient.invalidateQueries({ queryKey: [QUERY_KEY, apiKey] });
    }, [recordCount, apiKey, queryClient]);

    const amount = (value: number) => `$${value.toFixed(4)}`;
    const row = (label: string, value: string) => (
        <div key={label} className="flex items-center justify-between gap-3">
            <span style={{ color: theme.node.muted }}>{label}</span>
            <span className="tabular-nums">{value}</span>
        </div>
    );
    const usage = query.data;
    const content = (
        <div className="w-60 text-sm" style={{ color: theme.node.text }}>
            <div className="text-sm font-medium">{t("account.title")}</div>
            <div className="mt-0.5 text-sm leading-snug" style={{ color: theme.node.muted }}>
                {t("account.subtitle")}
            </div>
            <div className="mt-2 space-y-1">
                {!apiKey ? (
                    <p style={{ color: theme.node.muted }}>{t("account.missingKey")}</p>
                ) : query.isError ? (
                    <p style={{ color: theme.node.blocked }}>{query.error instanceof Error ? query.error.message : t("account.error")}</p>
                ) : query.isPending ? (
                    <p style={{ color: theme.node.muted }}>{t("account.loading")}</p>
                ) : usage ? (
                    <>
                        {row(t("account.total"), amount(usage.usage))}
                        {row(t("account.today"), amount(usage.usage_daily))}
                        {row(t("account.week"), amount(usage.usage_weekly))}
                        {row(t("account.month"), amount(usage.usage_monthly))}
                        {row(t("account.remaining"), usage.limit_remaining == null ? t("account.noLimit") : amount(usage.limit_remaining))}
                    </>
                ) : null}
            </div>
            <button
                type="button"
                disabled={!apiKey || query.isFetching}
                onClick={() => void query.refetch()}
                className="mt-2 flex w-full items-center justify-center gap-1 rounded-[2px] py-1 text-sm transition hover:bg-hover disabled:opacity-40 disabled:hover:bg-transparent dark:disabled:hover:bg-transparent"
                style={{ color: theme.node.text }}
            >
                <RotateCw className={`size-3.5 ${query.isFetching ? "animate-spin" : ""}`} />
                {t("account.refresh")}
            </button>
        </div>
    );

    return (
        <Popover
            open={open}
            onOpenChange={setOpen}
            trigger="click"
            placement="bottomRight"
            arrow={false}
            content={content}
            styles={{ content: { background: theme.toolbar.panel, border: `1px solid ${theme.toolbar.border}`, borderRadius: 16, padding: 14, color: theme.node.text } }}
        >
            <button
                type="button"
                className="inline-flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-[2px] text-muted-foreground transition-colors hover:bg-hover hover:text-foreground dark:text-muted-foreground hover:bg-hover dark:hover:text-white [&_svg]:size-4"
                style={{ color: theme.node.text }}
                aria-label={t("account.open")}
                title={t("account.open")}
            >
                <CircleUserRound className="size-4" />
            </button>
        </Popover>
    );
}
