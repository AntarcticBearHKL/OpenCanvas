import { useEffect, useState } from "react";
import { Button, Empty, Input, Switch } from "antd";
import { Eraser, RotateCcw } from "lucide-react";
import { useTranslation } from "react-i18next";

import { AGENT_BRIDGE_URL_DEFAULT, setAgentBridgeUrl } from "@/constant/runtime-config";
import { getAgentActions, replayAgentEntry, subscribeAgentActions } from "@/lib/agent/action-registry";
import { describeAgentOp } from "@/lib/agent/agent-permissions";
import { bindAgentClient, fetchAgentClients } from "@/services/api/canvas-agent";
import { useAgentAuditStore, type AgentAuditEntry } from "@/stores/use-agent-audit-store";
import { useAgentStore } from "@/stores/use-agent-store";

const RECENT_AUDIT_LIMIT = 20;

function useAgentNamespaces() {
    const [namespaces, setNamespaces] = useState(() => getAgentActions());
    useEffect(() => subscribeAgentActions(() => setNamespaces(getAgentActions())), []);
    return namespaces;
}

export function ConfigAgentAudit() {
    const { t } = useTranslation();
    const permissions = useAgentAuditStore((state) => state.permissions);
    const records = useAgentAuditStore((state) => state.records);
    const setPermission = useAgentAuditStore((state) => state.setPermission);
    const resetPermissions = useAgentAuditStore((state) => state.resetPermissions);
    const clear = useAgentAuditStore((state) => state.clear);
    const namespaces = useAgentNamespaces();

    return (
        <div className="space-y-3">
            <AgentStatus />
            <AgentMcpToggle />
            <AgentBridgeSettings />
            <AgentTargets />
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
                    {namespaces.map((action) => (
                        <div key={action.ns}>
                            <div className="px-4 py-2 text-xs font-medium text-muted-foreground">{action.title}</div>
                            {action.ops.map((type) => {
                                const key = `${action.ns}:${type}`;
                                return (
                                    <div key={key} className="flex items-center justify-between gap-3 px-4 py-2.5">
                                        <span className="text-sm">{t(`config.agent.ops.${type}`, { defaultValue: key })}</span>
                                        <Switch size="small" checked={permissions[key] !== false} onChange={(allowed) => setPermission(key, allowed)} />
                                    </div>
                                );
                            })}
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
                            <AuditRow key={record.id} record={record} />
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
    const { t } = useTranslation();
    const url = useAgentStore((state) => state.url);
    const setAgentState = useAgentStore((state) => state.setAgentState);
    const [draftUrl, setDraftUrl] = useState(url);

    const commit = () => {
        const nextUrl = draftUrl.trim() || AGENT_BRIDGE_URL_DEFAULT;
        if (nextUrl === useAgentStore.getState().url) return;
        setAgentBridgeUrl(nextUrl);
        setAgentState({ url: nextUrl, connected: false, connectError: "" });
    };

    return (
        <section className="overflow-hidden rounded-xl border border-border dark:border-border glass-card">
            <div className="border-b border-border px-4 py-3 dark:border-border">
                <div className="text-sm font-semibold">Local Agent Connection</div>
            </div>
            <div className="space-y-2 px-4 py-3">
                <label className="block">
                    <span className="mb-1 block text-sm text-muted-foreground">Service URL</span>
                    <Input value={draftUrl} onChange={(event) => setDraftUrl(event.target.value)} onBlur={commit} onPressEnter={commit} placeholder={AGENT_BRIDGE_URL_DEFAULT} />
                </label>
                <div className="text-xs text-muted-foreground">{t("config.agent.autoSaveHint")}</div>
            </div>
        </section>
    );
}

function AgentTargets() {
    const { t } = useTranslation();
    const url = useAgentStore((state) => state.url);
    const clientId = useAgentStore((state) => state.clientId);
    const clients = useAgentStore((state) => state.clients);
    const boundClientId = useAgentStore((state) => state.boundClientId);
    const setAgentState = useAgentStore((state) => state.setAgentState);
    const [busy, setBusy] = useState(false);
    const endpoint = url.trim().replace(/\/$/, "");
    const shortId = (id: string) => id.slice(0, 8);

    const use = (id: string) => {
        if (!id) return;
        setBusy(true);
        bindAgentClient(endpoint, id)
            .then(() => fetchAgentClients(endpoint))
            .then((data) => setAgentState({ clients: data.clients || [], boundClientId: data.boundClientId || "" }))
            .catch(() => undefined)
            .finally(() => setBusy(false));
    };

    return (
        <section className="overflow-hidden rounded-xl border border-border dark:border-border glass-card">
            <div className="border-b border-border px-4 py-3 dark:border-border">
                <div className="text-sm font-semibold">{t("config.agent.targets")}</div>
            </div>
            {clients.length ? (
                <div className="divide-y divide-border dark:divide-border">
                    {clients.map((client) => (
                        <div key={client.clientId} className="flex items-center justify-between gap-3 px-4 py-2.5">
                            <span className="flex min-w-0 items-center gap-2">
                                <span className={`size-2 shrink-0 rounded-full bg-current ${client.bound ? "text-success" : "text-muted-foreground"}`} />
                                <span className="min-w-0 truncate text-sm">
                                    {client.clientId === clientId ? `${t("config.agent.currentPage")} · ` : ""}
                                    {client.title || t("config.agent.unknownPage")} · {shortId(client.clientId)}
                                </span>
                            </span>
                            <Button size="small" type={client.bound ? "default" : "primary"} disabled={client.bound || busy} onClick={() => use(client.clientId)}>
                                {client.bound ? t("config.agent.statusConnected") : t("config.agent.setAsTarget")}
                            </Button>
                        </div>
                    ))}
                </div>
            ) : (
                <div className="px-4 py-6 text-center text-xs text-muted-foreground">{t("config.agent.noPages")}</div>
            )}
        </section>
    );
}

function AgentMcpToggle() {
    const { t } = useTranslation();
    const mcpEnabled = useAgentAuditStore((state) => state.mcpEnabled);
    const setMcpEnabled = useAgentAuditStore((state) => state.setMcpEnabled);
    return (
        <section className="overflow-hidden rounded-xl border border-border dark:border-border glass-card">
            <div className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                    <div className="text-sm font-semibold">{t("config.agent.mcpEnabled")}</div>
                    <div className="mt-0.5 text-xs text-muted-foreground">{t("config.agent.mcpEnabledHint")}</div>
                </div>
                <Switch checked={mcpEnabled} onChange={setMcpEnabled} />
            </div>
        </section>
    );
}

function AgentStatus() {
    const { t } = useTranslation();
    const mcpEnabled = useAgentAuditStore((state) => state.mcpEnabled);
    const connected = useAgentStore((state) => state.connected);
    const clientId = useAgentStore((state) => state.clientId);
    const boundClientId = useAgentStore((state) => state.boundClientId);
    const clients = useAgentStore((state) => state.clients);
    const connectError = useAgentStore((state) => state.connectError);
    const isBoundHere = Boolean(clientId) && boundClientId === clientId;
    const state = !mcpEnabled ? "disconnected" : connected && isBoundHere ? "connected" : "connecting";
    const label = { disconnected: t("config.agent.statusDisconnected"), connecting: t("config.agent.statusConnecting"), connected: t("config.agent.statusConnected") }[state];
    const tone = { disconnected: "text-danger", connecting: "text-warning", connected: "text-success" }[state];
    const current = clients.find((client) => client.clientId === boundClientId);
    const detail = state === "connected" ? current?.title || t("config.agent.currentPage") : connectError;

    return (
        <section className="overflow-hidden rounded-xl border border-border dark:border-border glass-card">
            <div className="flex items-center gap-3 px-4 py-3.5">
                <span className={`size-2.5 shrink-0 rounded-full bg-current ${tone}`} />
                <span className={`text-sm font-semibold ${tone}`}>{label}</span>
                {detail ? <span className="ml-auto min-w-0 truncate text-xs text-muted-foreground">{detail}</span> : null}
            </div>
        </section>
    );
}

function AuditRow({ record }: { record: AgentAuditEntry }) {
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
            <Button size="small" type="text" icon={<RotateCcw className="size-3.5" />} disabled={!record.ops.length} onClick={() => replayAgentEntry(record.id)}>
                {t("config.agent.replay")}
            </Button>
        </div>
    );
}
