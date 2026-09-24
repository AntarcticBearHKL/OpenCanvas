import { useState } from "react";
import { Button, Collapse, Form, Input, Select } from "antd";
import { Plus, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { nanoid } from "nanoid";

import { PROVIDER_PRESETS } from "@/lib/provider-presets";
import { decodeChannelModel, OPENROUTER_BASE_URL, useConfigStore, type ModelChannel } from "@/stores/use-config-store";

const MODEL_FIELDS = ["textModel", "imageModel", "audioModel", "speechModel", "videoModel"] as const;

export function ConfigProviders() {
    const { t } = useTranslation();
    const config = useConfigStore((state) => state.config);
    const updateConfig = useConfigStore((state) => state.updateConfig);
    const channels = config.channels;
    const [activeKeys, setActiveKeys] = useState<string[]>(() => (channels[0] ? [channels[0].id] : []));
    const [confirmId, setConfirmId] = useState<string | null>(null);

    const commit = (next: ModelChannel[]) => updateConfig("channels", next);
    const patch = (id: string, value: Partial<ModelChannel>) => commit(channels.map((channel) => (channel.id === id ? { ...channel, ...value } : channel)));
    const remove = (id: string) => {
        commit(channels.filter((channel) => channel.id !== id));
        for (const field of MODEL_FIELDS) if (decodeChannelModel(config[field])?.channelId === id) updateConfig(field, "");
        setConfirmId(null);
    };
    const add = () => {
        const id = nanoid();
        commit([...channels, { id, name: t("config.channels.newName"), baseUrl: OPENROUTER_BASE_URL, apiKey: "", apiFormat: "openai", models: [] }]);
        setActiveKeys((keys) => [...keys, id]);
    };

    return (
        <div className="space-y-3">
            <div className="flex items-start justify-between gap-3">
                <div>
                    <div className="text-sm font-semibold">{t("config.providers.title")}</div>
                    <div className="mt-1 text-sm text-muted-foreground">{t("config.providers.description")}</div>
                </div>
                <Button type="primary" icon={<Plus className="size-4" />} onClick={add}>
                    {t("config.providers.add")}
                </Button>
            </div>
            <Collapse
                className="glass-card !rounded-none [&_.ant-collapse-item]:!rounded-none [&_.ant-collapse-header]:!rounded-none [&_.ant-collapse-content]:!rounded-none [&_.ant-collapse-panel]:!bg-transparent !bg-[var(--glass)]"
                activeKey={activeKeys}
                onChange={(keys) => setActiveKeys(keys as string[])}
                items={channels.map((channel) => ({
                    key: channel.id,
                    label: (
                        <span className="flex min-w-0 items-center gap-2">
                            <span className="truncate text-sm font-medium">{channel.name}</span>
                            <span className="shrink-0 text-xs text-muted-foreground">{t("config.providers.modelCount", { count: channel.models.length })}</span>
                        </span>
                    ),
                    extra: (
                        <Button
                            danger
                            type="text"
                            size="small"
                            disabled={channels.length <= 1}
                            icon={<Trash2 className="size-4" />}
                            onClick={(event) => {
                                event.stopPropagation();
                                if (confirmId === channel.id) remove(channel.id);
                                else setConfirmId(channel.id);
                            }}
                            onBlur={() => setConfirmId((current) => (current === channel.id ? null : current))}
                        >
                            {t(confirmId === channel.id ? "config.providers.deleteConfirm" : "config.providers.delete")}
                        </Button>
                    ),
                    children: (
                        <Form layout="vertical" requiredMark={false}>
                            <div className="grid gap-3 md:grid-cols-2">
                                <Form.Item label={t("config.providers.preset")} className="mb-0 md:col-span-2">
                                    <Select
                                        value={PROVIDER_PRESETS.find((preset) => preset.baseUrl === channel.baseUrl)?.id}
                                        placeholder={t("config.providers.presetPlaceholder")}
                                        onChange={(value) => {
                                            const preset = PROVIDER_PRESETS.find((item) => item.id === value);
                                            if (preset) patch(channel.id, { name: preset.name, baseUrl: preset.baseUrl });
                                        }}
                                        options={PROVIDER_PRESETS.map((preset) => ({ value: preset.id, label: preset.name }))}
                                    />
                                </Form.Item>
                                <Form.Item label={t("config.providers.name")} className="mb-0">
                                    <Input value={channel.name} onChange={(event) => patch(channel.id, { name: event.target.value })} />
                                </Form.Item>
                                <Form.Item label={t("config.providers.baseUrl")} className="mb-0">
                                    <Input value={channel.baseUrl} onChange={(event) => patch(channel.id, { baseUrl: event.target.value })} placeholder="https://..." />
                                </Form.Item>
                                <Form.Item label={t("config.providers.apiKey")} className="mb-0 md:col-span-2">
                                    <Input.Password value={channel.apiKey} onChange={(event) => patch(channel.id, { apiKey: event.target.value })} placeholder="sk-..." />
                                </Form.Item>
                            </div>
                        </Form>
                    ),
                }))}
            />
        </div>
    );
}
