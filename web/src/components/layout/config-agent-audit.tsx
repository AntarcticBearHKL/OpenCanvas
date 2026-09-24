import { useState } from "react";
import { Button, Empty, Input, Switch } from "antd";
import { Eraser, RotateCcw } from "lucide-react";
import { useTranslation } from "react-i18next";

import { AGENT_BRIDGE_URL_DEFAULT, setAgentBridgeUrl, setAgentToken } from "@/constant/runtime-config";
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
            <AgentBridgeSettings />
            <div>
                <div className="text-sm font-semibold">{t("config.agent.title")}</div>
                <div className="mt-1 text-sm text-muted-foreground">{t("config.agent.permissionHint")}</div>
            </div>
            <section className="overflow-hidden rounded-xl border border-border dark:border-border glass-card">
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
            <section className="overflow-hidden rounded-xl border border-border dark:border-border glass-card">
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

function AgentBridgeSettings() {
    const url = useAgentStore((state) => state.url);
    const token = useAgentStore((state) => state.token);
    const connected = useAgentStore((state) => state.connected);
    const activity = useAgentStore((state) => state.activity);
    const connectError = useAgentStore((state) => state.connectError);
    const setAgentState = useAgentStore((state) => state.setAgentState);
    const [draftUrl, setDraftUrl] = useState(url);
    const [draftToken, setDraftToken] = useState(token);
    const [saved, setSaved] = useState(false);

    const save = () => {
        const nextUrl = draftUrl.trim() || AGENT_BRIDGE_URL_DEFAULT;
        const nextToken = draftToken.trim();
        setAgentBridgeUrl(nextUrl);
        setAgentToken(nextToken);
        setAgentState({ url: nextUrl, token: nextToken, enabled: true, connected: false, connectError: "", activity: "正在连接…" });
        setSaved(true);
    };

    return (
        <section className="overflow-hidden rounded-xl border border-border dark:border-border glass-card">
            <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3 dark:border-border">
                <div className="text-sm font-semibold">本地 Agent 连接</div>
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <span className={`size-1.5 rounded-full ${connected ? "bg-success" : "bg-warning"}`} />
                    {connected ? "已连接" : activity}
                </span>
            </div>
            <div className="space-y-3 px-4 py-3">
                <label className="block">
                    <span className="mb-1 block text-sm text-muted-foreground">服务地址</span>
                    <Input value={draftUrl} onChange={(event) => { setDraftUrl(event.target.value); setSaved(false); }} placeholder={AGENT_BRIDGE_URL_DEFAULT} />
                </label>
                <label className="block">
                    <span className="mb-1 block text-sm text-muted-foreground">访问令牌</span>
                    <Input.Password value={draftToken} onChange={(event) => { setDraftToken(event.target.value); setSaved(false); }} placeholder="未设置可留空" />
                </label>
                <div className="flex items-center justify-between gap-3">
                    <span className={`min-w-0 truncate text-xs ${connectError ? "text-danger" : "text-muted-foreground"}`}>{connectError || (saved ? "已保存，正在重新连接" : "地址与令牌保存在本地浏览器，无需重新构建")}</span>
                    <Button size="small" type="primary" onClick={save}>
                        保存并重连
                    </Button>
                </div>
            </div>
        </section>
    );
}

function AuditRow({ record, replayAgentEntry }: { record: AgentAuditEntry; replayAgentEntry?: (id: string) => boolean }) {
    const { t } = useTranslation();
    return (
        <div className="flex items-center justify-between gap-4 px-4 py-3">
            <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium">{t("config.agent.opCount", { count: record.ops.length })}</span>
                    {record.blocked ? <span className="text-xs font-medium text-danger">{t("config.agent.blockedCount", { count: record.blocked })}</span> : null}
                    {record.replayedFrom ? <span className="rounded-md border border-border px-1.5 py-0.5 text-xs text-muted-foreground dark:border-border">{t("config.agent.replayed")}</span> : null}
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
