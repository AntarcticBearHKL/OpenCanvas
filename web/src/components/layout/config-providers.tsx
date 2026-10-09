import { useState } from "react";
import { Button, Collapse, Form, Input, Select } from "antd";
import { Plus, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { nanoid } from "nanoid";

import { isTextOnlyBaseUrl, PROVIDER_PRESETS } from "@/lib/provider-presets";
import { decodeChannelModel, OPENROUTER_BASE_URL, useConfigStore, type ModelCapability, type ModelChannel } from "@/stores/use-config-store";

const CAPABILITIES: ModelCapability[] = ["text", "image", "audio", "speech", "video"];

const MODEL_FIELDS: { capability: ModelCapability; field: "textModel" | "imageModel" | "audioModel" | "speechModel" | "videoModel" }[] = [
    { capability: "text", field: "textModel" },
    { capability: "image", field: "imageModel" },
    { capability: "audio", field: "audioModel" },
    { capability: "speech", field: "speechModel" },
    { capability: "video", field: "videoModel" },
];

export function ConfigProviders() {
    const { t } = useTranslation();
    const config = useConfigStore((state) => state.config);
    const updateConfig = useConfigStore((state) => state.updateConfig);
    const channels = config.channels;
    const [activeKeys, setActiveKeys] = useState<string[]>(() => (channels[0] ? [channels[0].id] : []));
    const [confirmId, setConfirmId] = useState<string | null>(null);

    const commit = (next: ModelChannel[]) => {
        updateConfig("channels", next);
        for (const { capability, field } of MODEL_FIELDS) {
            const decoded = decodeChannelModel(config[field]);
            const channel = decoded && next.find((item) => item.id === decoded.channelId);
            if (decoded && !channel?.models.some((model) => model.name === decoded.model && model.capability === capability)) updateConfig(field, "");
        }
    };
    const patch = (id: string, value: Partial<ModelChannel>) => commit(channels.map((channel) => (channel.id === id ? { ...channel, ...value } : channel)));
    const remove = (id: string) => {
        commit(channels.filter((channel) => channel.id !== id));
        setConfirmId(null);
    };
    const add = () => {
        const id = nanoid();
        commit([...channels, { id, name: t("config.channels.newName"), baseUrl: OPENROUTER_BASE_URL, apiKey: "", apiFormat: "openai", models: [] }]);
        setActiveKeys((keys) => [...keys, id]);
    };
    const addModel = (channelId: string, name: string, capability: ModelCapability) => {
        const value = name.trim();
        if (!value) return;
        commit(
            channels.map((channel) => {
                if (channel.id !== channelId || channel.models.some((model) => model.name === value)) return channel;
                return { ...channel, models: [...channel.models, { name: value, capability: isTextOnlyBaseUrl(channel.baseUrl) ? "text" : capability }] };
            }),
        );
    };
    const removeModel = (channelId: string, name: string) => commit(channels.map((channel) => (channel.id === channelId ? { ...channel, models: channel.models.filter((model) => model.name !== name) } : channel)));
    const changeCapability = (channelId: string, name: string, capability: ModelCapability) =>
        commit(channels.map((channel) => (channel.id === channelId ? { ...channel, models: channel.models.map((model) => (model.name === name ? { ...model, capability } : model)) } : channel)));

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
                                            if (preset) patch(channel.id, { name: preset.name, baseUrl: preset.baseUrl, models: channel.models.length ? channel.models : preset.models.map((model) => ({ ...model })) });
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
                            <div className="mt-4">
                                <div className="mb-2 text-sm">{t("config.providers.models")}</div>
                                <div className="space-y-2">
                                    {channel.models.map((model) => (
                                        <div key={model.name} className="flex items-center gap-2">
                                            <span className="min-w-0 flex-1 truncate text-sm" title={model.name}>
                                                {model.name}
                                            </span>
                                            {isTextOnlyBaseUrl(channel.baseUrl) ? (
                                                <span className="w-28 shrink-0 text-sm text-muted-foreground">{t("settingsPanels.model.capabilities.text")}</span>
                                            ) : (
                                                <Select
                                                    size="small"
                                                    className="w-28 shrink-0"
                                                    value={model.capability}
                                                    aria-label={t("config.models.capability")}
                                                    onChange={(next) => changeCapability(channel.id, model.name, next)}
                                                    options={CAPABILITIES.map((item) => ({ value: item, label: t(`settingsPanels.model.capabilities.${item}`) }))}
                                                />
                                            )}
                                            <Button size="small" type="text" danger icon={<Trash2 className="size-4" />} onClick={() => removeModel(channel.id, model.name)} aria-label={t("config.models.remove")} />
                                        </div>
                                    ))}
                                    {channel.models.length ? null : <div className="text-sm text-muted-foreground">{t("config.providers.noModels")}</div>}
                                    <AddModelRow channel={channel} onAdd={addModel} />
                                </div>
                            </div>
                        </Form>
                    ),
                }))}
            />
        </div>
    );
}

function AddModelRow({ channel, onAdd }: { channel: ModelChannel; onAdd: (channelId: string, name: string, capability: ModelCapability) => void }) {
    const { t } = useTranslation();
    const [name, setName] = useState("");
    const [capability, setCapability] = useState<ModelCapability>("text");
    const submit = () => {
        if (!name.trim()) return;
        onAdd(channel.id, name, capability);
        setName("");
    };

    return (
        <div className="flex flex-wrap items-center gap-2">
            <Input size="small" className="w-56" value={name} onChange={(event) => setName(event.target.value)} onPressEnter={submit} placeholder={t("config.models.modelId")} />
            {isTextOnlyBaseUrl(channel.baseUrl) ? null : (
                <Select
                    size="small"
                    className="w-28 shrink-0"
                    value={capability}
                    aria-label={t("config.models.capability")}
                    onChange={setCapability}
                    options={CAPABILITIES.map((item) => ({ value: item, label: t(`settingsPanels.model.capabilities.${item}`) }))}
                />
            )}
            <Button size="small" type="primary" icon={<Plus className="size-3.5" />} onClick={submit} disabled={!name.trim()}>
                {t("config.models.addModel")}
            </Button>
        </div>
    );
}
