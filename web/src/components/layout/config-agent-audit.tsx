import { Button, Empty, Switch } from "antd";
import { Eraser, RotateCcw } from "lucide-react";
import { useTranslation } from "react-i18next";

import { AGENT_OP_TYPES, describeAgentOp } from "@/lib/canvas/agent-permissions";
import { useAgentAuditStore, type AgentAuditEntry } from "@/stores/use-agent-audit-store";
import { useAgentStore } from "@/stores/use-agent-store";

const RECENT_AUDIT_LIMIT = 20;

export function ConfigAgentAudit() {
    const { t } = useTranslation();
    const permissions = useAgentAuditStore((state) => state.permissions);
    const records = useAgentAuditStore((state) => state.records);
    const setPermission = useAgentAuditStore((state) => state.setPermission);
    const resetPermissions = useAgentAuditStore((state) => state.resetPermissions);
    const clear = useAgentAuditStore((state) => state.clear);
    const replayAgentEntry = useAgentStore((state) => state.canvasContext?.replayAgentEntry);

    return (
        <div className="space-y-3">
            <div>
                <div className="text-sm font-semibold">{t("config.agent.title")}</div>
                <div className="mt-1 text-xs text-muted-foreground">{t("config.agent.permissionHint")}</div>
            </div>
            <section className="overflow-hidden rounded-lg border border-border dark:border-border">
                <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3 dark:border-border">
                    <div className="text-sm font-semibold">{t("config.agent.permissions")}</div>
                    <Button size="small" icon={<RotateCcw className="size-3.5" />} onClick={resetPermissions}>
                        {t("config.agent.reset")}
                    </Button>
                </div>
                <div className="divide-y divide-border dark:divide-border">
                    {AGENT_OP_TYPES.map((type) => (
                        <div key={type} className="flex items-center justify-between gap-3 px-4 py-2.5">
                            <span className="text-sm">{t(`config.agent.ops.${type}`)}</span>
                            <Switch size="small" checked={permissions[type] !== false} onChange={(allowed) => setPermission(type, allowed)} />
                        </div>
                    ))}
                </div>
            </section>
            <section className="overflow-hidden rounded-lg border border-border dark:border-border">
                <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3 dark:border-border">
                    <div className="text-sm font-semibold">{t("config.agent.audit")}</div>
                    <Button size="small" icon={<Eraser className="size-3.5" />} disabled={!records.length} onClick={clear}>
                        {t("config.agent.clear")}
                    </Button>
                </div>
                {records.length ? (
                    <div className="divide-y divide-border dark:divide-border">
                        {records.slice(0, RECENT_AUDIT_LIMIT).map((record) => (
                            <AuditRow key={record.id} record={record} replayAgentEntry={replayAgentEntry} />
                        ))}
                    </div>
                ) : (
                    <div className="py-8">
                        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t("config.agent.auditEmpty")} />
                    </div>
                )}
            </section>
        </div>
    );
}

function AuditRow({ record, replayAgentEntry }: { record: AgentAuditEntry; replayAgentEntry?: (id: string) => boolean }) {
    const { t } = useTranslation();
    return (
        <div className="flex items-center justify-between gap-4 px-4 py-3">
            <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium">{t("config.agent.opCount", { count: record.ops.length })}</span>
                    {record.blocked ? <span className="text-xs text-muted-foreground">{t("config.agent.blockedCount", { count: record.blocked })}</span> : null}
                    {record.replayedFrom ? <span className="rounded border border-border px-1.5 py-0.5 text-[11px] text-muted-foreground dark:border-border">{t("config.agent.replayed")}</span> : null}
                </div>
                <div className="mt-0.5 truncate text-xs text-muted-foreground">{new Date(record.at).toLocaleString()}</div>
                <div className="mt-0.5 truncate text-xs text-muted-foreground">{record.ops.slice(0, 2).map(describeAgentOp).join(" · ")}</div>
            </div>
            <Button size="small" type="text" icon={<RotateCcw className="size-3.5" />} disabled={!replayAgentEntry || !record.ops.length} onClick={() => replayAgentEntry?.(record.id)}>
                {t("config.agent.replay")}
            </Button>
        </div>
    );
}
