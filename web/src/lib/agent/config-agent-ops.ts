// The `config` agent namespace: the op union, its JSON Schema, pure AiConfig helpers and the
// snapshot redaction. This module is React-free; the /config page wires the helpers to the
// zustand store and owns the namespace registration.
//
// SECURITY: `redactConfig` is the only helper allowed in the published snapshot path; every raw
// `apiKey` becomes `{ hasKey, last4 }`. `revealConfigKeys` is the only helper that returns raw
// keys and is reachable exclusively through the deny-by-default `reveal_key` op.

import { nanoid } from "nanoid";

import i18n from "@/i18n";
import { OPENROUTER_BASE_URL, type AiConfig, type ModelCapability, type ModelChannel } from "@/stores/use-config-store";

export type ConfigChannelModelInput = string | { name: string; capability?: ModelCapability; script?: string };
export type ConfigChannelInput = { name?: string; baseUrl?: string; models?: ConfigChannelModelInput[] };
export type ConfigChannelPatch = { name?: string; baseUrl?: string; models?: ConfigChannelModelInput[] };

export type ConfigAgentOp =
    | { type: "set"; key: ConfigScalarKey; value: string }
    | { type: "channel.add"; channel?: ConfigChannelInput }
    | { type: "channel.update"; channelId: string; patch?: ConfigChannelPatch }
    | { type: "channel.remove"; channelId: string }
    | { type: "set_provider_key"; channelId: string; apiKey: string }
    | { type: "channel.add_model"; channelId: string; name: string; capability?: ModelCapability }
    | { type: "channel.remove_model"; channelId: string; name: string }
    | { type: "channel.set_model_capability"; channelId: string; name: string; capability: ModelCapability }
    | { type: "select_model"; capability: ModelCapability; value: string }
    | { type: "reveal_key"; channelId?: string }
    | { type: "import_credentials"; baseUrl?: string; apiKey?: string };

type ConfigAgentOpType = ConfigAgentOp["type"];
type ConfigChannelOp = Extract<ConfigAgentOp, { type: "channel.add" | "channel.update" | "channel.remove" | "set_provider_key" | "channel.add_model" | "channel.remove_model" | "channel.set_model_capability" }>;

/** Scalar AiConfig fields the `set` op may touch; channels stay on their dedicated ops. */
export const CONFIG_SCALAR_KEYS = [
    "model",
    "imageModel",
    "videoModel",
    "textModel",
    "audioModel",
    "speechModel",
    "audioVoice",
    "audioFormat",
    "audioSpeed",
    "audioInstructions",
    "videoSeconds",
    "vquality",
    "videoGenerateAudio",
    "videoWatermark",
    "videoMode",
    "systemPrompt",
    "reasoningEffort",
    "quality",
    "size",
    "background",
    "count",
    "canvasImageCount",
    "canvasBackgroundMode",
] as const;

export type ConfigScalarKey = (typeof CONFIG_SCALAR_KEYS)[number];

const SCALAR_ENUMS: Partial<Record<ConfigScalarKey, readonly string[]>> = {
    reasoningEffort: ["auto", "low", "medium", "high", "xhigh"],
    videoMode: ["frames", "reference"],
    canvasBackgroundMode: ["dots", "lines", "blank"],
};

export const CONFIG_MODEL_FIELDS: Record<ModelCapability, "textModel" | "imageModel" | "videoModel" | "audioModel" | "speechModel"> = {
    text: "textModel",
    image: "imageModel",
    video: "videoModel",
    audio: "audioModel",
    speech: "speechModel",
};

export const MODEL_CAPABILITIES: readonly ModelCapability[] = ["text", "image", "video", "audio", "speech"];

function isModelCapability(value: unknown): value is ModelCapability {
    return typeof value === "string" && (MODEL_CAPABILITIES as readonly string[]).includes(value);
}

export function isConfigScalarKey(key: unknown): key is ConfigScalarKey {
    return typeof key === "string" && (CONFIG_SCALAR_KEYS as readonly string[]).includes(key);
}

/** Whitelisted scalar write; throws on an unknown key, a non-string value or an out-of-enum value. */
export function normalizeConfigScalar(key: unknown, value: unknown): { key: ConfigScalarKey; value: string } {
    if (!isConfigScalarKey(key)) throw new Error(`不支持的配置项：${String(key)}`);
    if (typeof value !== "string") throw new Error(`配置项 ${key} 需要字符串值`);
    const allowed = SCALAR_ENUMS[key];
    if (allowed && !allowed.includes(value)) throw new Error(`配置项 ${key} 不支持取值：${value}`);
    return { key, value };
}

function channelModelName(item: ConfigChannelModelInput): string {
    if (typeof item === "string") return item.trim();
    return typeof item.name === "string" ? item.name.trim() : "";
}

function channelModels(input: ConfigChannelModelInput[] | undefined): ModelChannel["models"] {
    const seen = new Set<string>();
    const models: ModelChannel["models"] = [];
    (Array.isArray(input) ? input : []).forEach((item) => {
        const name = channelModelName(item);
        if (!name || seen.has(name)) return;
        seen.add(name);
        const capability = typeof item === "string" || !isModelCapability(item.capability) ? "text" : item.capability;
        const script = typeof item === "string" || typeof item.script !== "string" ? "" : item.script.trim();
        models.push({ name, capability, ...(script ? { script } : {}) });
    });
    return models;
}

function createChannel(input?: ConfigChannelInput): ModelChannel {
    return {
        id: nanoid(),
        name: input?.name?.trim() || i18n.t("config.channels.newName"),
        baseUrl: input?.baseUrl?.trim() || OPENROUTER_BASE_URL,
        apiKey: "",
        apiFormat: "openai",
        models: channelModels(input?.models),
    };
}

function patchChannel(channel: ModelChannel, patch?: ConfigChannelPatch): ModelChannel {
    const next = { ...channel };
    if (patch?.name !== undefined) next.name = patch.name.trim() || channel.name;
    if (patch?.baseUrl !== undefined) next.baseUrl = patch.baseUrl.trim() || channel.baseUrl;
    if (patch?.models !== undefined) next.models = channelModels(patch.models);
    return next;
}

function updateChannel(config: AiConfig, channelId: string, update: (channel: ModelChannel) => ModelChannel): ModelChannel[] {
    const index = config.channels.findIndex((channel) => channel.id === channelId);
    if (index < 0) throw new Error(`未找到渠道：${channelId}`);
    const channels = config.channels.slice();
    channels[index] = update(channels[index]);
    return channels;
}

/** Pure channel-op fold; returns the next `channels` array for `updateConfig("channels", ...)`. */
export function applyConfigChannelOp(config: AiConfig, op: ConfigChannelOp): ModelChannel[] {
    switch (op.type) {
        case "channel.add":
            return [...config.channels, createChannel(op.channel)];
        case "channel.update":
            return updateChannel(config, op.channelId, (channel) => patchChannel(channel, op.patch));
        case "channel.remove":
            return config.channels.filter((channel) => channel.id !== op.channelId);
        case "set_provider_key":
            return updateChannel(config, op.channelId, (channel) => ({ ...channel, apiKey: op.apiKey }));
        case "channel.add_model":
            return updateChannel(config, op.channelId, (channel) => {
                const name = op.name.trim();
                if (!name) throw new Error("模型名称不能为空");
                const capability = isModelCapability(op.capability) ? op.capability : "text";
                const exists = channel.models.some((model) => model.name === name);
                const models = exists
                    ? channel.models.map((model) => (model.name === name ? { ...model, capability } : model))
                    : [...channel.models, { name, capability }];
                return { ...channel, models };
            });
        case "channel.remove_model":
            return updateChannel(config, op.channelId, (channel) => ({ ...channel, models: channel.models.filter((model) => model.name !== op.name) }));
        case "channel.set_model_capability":
            return updateChannel(config, op.channelId, (channel) => {
                if (!isModelCapability(op.capability)) throw new Error(`不支持的模型能力：${String(op.capability)}`);
                if (!channel.models.some((model) => model.name === op.name)) throw new Error(`未找到模型：${op.name}`);
                return { ...channel, models: channel.models.map((model) => (model.name === op.name ? { ...model, capability: op.capability } : model)) };
            });
    }
}

export type ConfigRevealedKeys = { channels: { id: string; name: string; apiKey: string }[] };

/** The only helper that returns raw keys; reachable exclusively through the deny-by-default `reveal_key` op. */
export function revealConfigKeys(config: AiConfig, channelId?: string): ConfigRevealedKeys {
    const channels = config.channels.map((channel) => ({ id: channel.id, name: channel.name, apiKey: channel.apiKey }));
    if (!channelId) return { channels };
    const channel = channels.find((item) => item.id === channelId);
    if (!channel) throw new Error(`未找到渠道：${channelId}`);
    return { channels: [channel] };
}

export type ConfigKeyRedaction = { hasKey: boolean; last4: string };
export type ConfigRedactedChannel = Omit<ModelChannel, "apiKey"> & { apiKey: ConfigKeyRedaction };
export type ConfigRedactedState = Omit<AiConfig, "channels"> & { channels: ConfigRedactedChannel[] };

export function redactKey(apiKey: string): ConfigKeyRedaction {
    const key = typeof apiKey === "string" ? apiKey.trim() : "";
    return { hasKey: Boolean(key), last4: key.slice(-4) };
}

/** Snapshot-safe config: every raw apiKey becomes `{ hasKey, last4 }`, so snapshots never carry secrets. */
export function redactConfig(config: AiConfig): ConfigRedactedState {
    return {
        ...config,
        channels: config.channels.map(({ apiKey, ...channel }) => ({ ...channel, apiKey: redactKey(apiKey) })),
    };
}

const MODEL_CAPABILITY_ENUM = { type: "string", enum: ["text", "image", "video", "audio", "speech"] };
const CHANNEL_MODELS_SCHEMA = {
    type: "array",
    items: {
        oneOf: [
            { type: "string" },
            { type: "object", properties: { name: { type: "string" }, capability: MODEL_CAPABILITY_ENUM, script: { type: "string" } }, required: ["name"], additionalProperties: true },
        ],
    },
};

function configOpVariant(type: string, properties: Record<string, unknown>, required: string[] = [], description?: string) {
    return {
        type: "object",
        ...(description ? { description } : {}),
        properties: { ns: { const: "config" }, type: { const: type }, ...properties },
        required: ["ns", "type", ...required],
        additionalProperties: true,
    };
}

const CONFIG_OP_SPECS: { type: ConfigAgentOpType; required?: string[]; properties: Record<string, unknown>; description?: string }[] = [
    { type: "set", required: ["key", "value"], properties: { key: { type: "string", enum: CONFIG_SCALAR_KEYS }, value: { type: "string" } } },
    {
        type: "channel.add",
        properties: {
            channel: { type: "object", properties: { name: { type: "string" }, baseUrl: { type: "string" }, models: CHANNEL_MODELS_SCHEMA }, additionalProperties: true },
        },
    },
    {
        type: "channel.update",
        required: ["channelId"],
        properties: {
            channelId: { type: "string" },
            patch: { type: "object", properties: { name: { type: "string" }, baseUrl: { type: "string" }, models: CHANNEL_MODELS_SCHEMA }, additionalProperties: true },
        },
    },
    { type: "channel.remove", required: ["channelId"], properties: { channelId: { type: "string" } } },
    {
        type: "set_provider_key",
        required: ["channelId", "apiKey"],
        properties: { channelId: { type: "string" }, apiKey: { type: "string" } },
        description: "危险操作：写入渠道 API Key，默认权限拒绝。",
    },
    { type: "channel.add_model", required: ["channelId", "name"], properties: { channelId: { type: "string" }, name: { type: "string" }, capability: MODEL_CAPABILITY_ENUM } },
    { type: "channel.remove_model", required: ["channelId", "name"], properties: { channelId: { type: "string" }, name: { type: "string" } } },
    {
        type: "channel.set_model_capability",
        required: ["channelId", "name", "capability"],
        properties: { channelId: { type: "string" }, name: { type: "string" }, capability: MODEL_CAPABILITY_ENUM },
    },
    { type: "select_model", required: ["capability", "value"], properties: { capability: MODEL_CAPABILITY_ENUM, value: { type: "string" } } },
    { type: "reveal_key", properties: { channelId: { type: "string" } }, description: "危险操作：返回原始 API Key（省略 channelId 返回全部），默认权限拒绝，仅应在用户显式授权后调用。" },
    { type: "import_credentials", properties: { baseUrl: { type: "string" }, apiKey: { type: "string" } } },
];

export const CONFIG_AGENT_OP_TYPES: string[] = CONFIG_OP_SPECS.map((spec) => spec.type);

export const CONFIG_AGENT_SCHEMA: Record<string, unknown> = {
    type: "object",
    oneOf: CONFIG_OP_SPECS.map((spec) => configOpVariant(spec.type, spec.properties, spec.required, spec.description)),
};
