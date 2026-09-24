import { useState } from "react";
import { App, Button, Input, Select } from "antd";
import { Plus, RefreshCw, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";

import { ModelPicker } from "@/components/model-picker";
import { fetchProviderModels } from "@/lib/provider-presets";
import { decodeChannelModel, modelOptionLabel, selectableModelsByCapability, useConfigStore, type ModelCapability, type ModelChannel } from "@/stores/use-config-store";

const CAPABILITIES: ModelCapability[] = ["text", "image", "audio", "speech", "video"];

const MODEL_FIELDS: { capability: ModelCapability; field: "textModel" | "imageModel" | "audioModel" | "speechModel" | "videoModel" }[] = [
    { capability: "text", field: "textModel" },
    { capability: "image", field: "imageModel" },
    { capability: "audio", field: "audioModel" },
    { capability: "speech", field: "speechModel" },
    { capability: "video", field: "videoModel" },
];

const CAPABILITY_KEYWORDS: [ModelCapability, string[]][] = [
    ["video", ["video", "sora", "veo", "kling", "wan", "hailuo"]],
    ["speech", ["tts", "speech", "voice", "fish-audio", "sovits", "elevenlabs", "cosyvoice", "kokoro"]],
    ["audio", ["audio", "music", "sound", "lyria"]],
    ["image", ["seedream", "gpt-image", "image", "dall-e", "dalle", "imagen", "flux", "sdxl", "stable-diffusion", "midjourney"]],
];

function guessCapability(name: string): ModelCapability {
    const value = name.toLowerCase();
    return CAPABILITY_KEYWORDS.find(([, keywords]) => keywords.some((keyword) => value.includes(keyword)))?.[0] || "text";
}

export function ConfigModels() {
    const { message } = App.useApp();
    const { t } = useTranslation();
    const config = useConfigStore((state) => state.config);
    const updateConfig = useConfigStore((state) => state.updateConfig);

    const commitChannels = (channels: ModelChannel[]) => {
        updateConfig("channels", channels);
        for (const { capability, field } of MODEL_FIELDS) {
            const decoded = decodeChannelModel(config[field]);
            const channel = decoded && channels.find((item) => item.id === decoded.channelId);
            if (decoded && !channel?.models.some((model) => model.name === decoded.model && model.capability === capability)) updateConfig(field, "");
        }
    };

    const removeModel = (channelId: string, name: string) => commitChannels(config.channels.map((channel) => (channel.id === channelId ? { ...channel, models: channel.models.filter((model) => model.name !== name) } : channel)));

    const changeCapability = (channelId: string, name: string, capability: ModelCapability) =>
        commitChannels(config.channels.map((channel) => (channel.id === channelId ? { ...channel, models: channel.models.map((model) => (model.name === name ? { ...model, capability } : model)) } : channel)));

    const addModel = (channelId: string, name: string, capability: ModelCapability) => {
        const value = name.trim();
        if (!value) return;
        commitChannels(config.channels.map((channel) => (channel.id === channelId && !channel.models.some((model) => model.name === value) ? { ...channel, models: [...channel.models, { name: value, capability }] } : channel)));
    };

    const fetchModels = async (channelId: string) => {
        const channel = config.channels.find((item) => item.id === channelId);
        if (!channel) return;
        try {
            const ids = await fetchProviderModels(channel.baseUrl, channel.apiKey);
            const existing = new Set(channel.models.map((model) => model.name));
            const added = ids.filter((id) => !existing.has(id)).map((id) => ({ name: id, capability: guessCapability(id) }));
            commitChannels(config.channels.map((item) => (item.id === channel.id ? { ...item, models: [...item.models, ...added] } : item)));
            message.success(t("config.models.fetchSuccess", { count: added.length }));
        } catch {
            message.error(t("config.models.fetchFailed"));
        }
    };

    return (
        <div className="space-y-3">
            <div>
                <div className="text-sm font-semibold">{t("config.models.title")}</div>
                <div className="mt-1 text-sm text-muted-foreground">{t("config.models.description")}</div>
            </div>
            {MODEL_FIELDS.map(({ capability, field }) => {
                const models = selectableModelsByCapability(config, capability).flatMap((value) => {
                    const decoded = decodeChannelModel(value);
                    return decoded ? [{ value, decoded }] : [];
                });
                return (
                    <section key={capability} className="rounded-none border border-border p-4 dark:border-border glass-card">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <div className="text-sm font-semibold">{t(`settingsPanels.model.capabilities.${capability}`)}</div>
                            <div className="flex min-w-0 items-center gap-2">
                                <span className="shrink-0 text-sm text-muted-foreground">{t("config.models.defaultModel")}</span>
                                <ModelPicker config={config} value={config[field]} onChange={(model) => updateConfig(field, model)} capability={capability} className="max-w-[220px]" />
                            </div>
                        </div>
                        <div className="mt-3 space-y-2">
                            {models.map(({ value, decoded }) => (
                                <div key={value} className="flex items-center gap-2">
                                    <span className="min-w-0 flex-1 truncate text-sm" title={modelOptionLabel(config, value)}>
                                        {modelOptionLabel(config, value)}
                                    </span>
                                    <Select
                                        size="small"
                                        className="w-28 shrink-0"
                                        value={capability}
                                        aria-label={t("config.models.capability")}
                                        onChange={(next) => changeCapability(decoded.channelId, decoded.model, next)}
                                        options={CAPABILITIES.map((item) => ({ value: item, label: t(`settingsPanels.model.capabilities.${item}`) }))}
                                    />
                                    <Button size="small" type="text" danger icon={<Trash2 className="size-4" />} onClick={() => removeModel(decoded.channelId, decoded.model)} aria-label={t("config.models.remove")} />
                                </div>
                            ))}
                            {models.length ? null : <div className="text-sm text-muted-foreground">{t("config.models.empty")}</div>}
                        </div>
                        <AddModelRow onAdd={(channelId, name) => addModel(channelId, name, capability)} onFetch={fetchModels} />
                    </section>
                );
            })}
        </div>
    );
}

function AddModelRow({ onAdd, onFetch }: { onAdd: (channelId: string, name: string) => void; onFetch: (channelId: string) => void }) {
    const { t } = useTranslation();
    const channels = useConfigStore((state) => state.config.channels);
    const [channelId, setChannelId] = useState(channels[0]?.id || "");
    const [name, setName] = useState("");
    const channel = channels.find((item) => item.id === channelId) || channels[0];
    const submit = () => {
        if (!channel || !name.trim()) return;
        onAdd(channel.id, name);
        setName("");
    };

    return (
        <div className="mt-3 flex flex-wrap items-center gap-2">
            <Select size="small" className="w-40" value={channel?.id} onChange={setChannelId} placeholder={t("config.models.provider")} options={channels.map((item) => ({ value: item.id, label: item.name }))} />
            <Input size="small" className="w-56" value={name} onChange={(event) => setName(event.target.value)} onPressEnter={submit} placeholder={t("config.models.modelId")} />
            <Button size="small" type="primary" icon={<Plus className="size-3.5" />} onClick={submit} disabled={!channel || !name.trim()}>
                {t("config.models.addModel")}
            </Button>
            <Button size="small" icon={<RefreshCw className="size-3.5" />} disabled={!channel} onClick={() => channel && onFetch(channel.id)}>
                {t("config.models.fetchModels")}
            </Button>
        </div>
    );
}
