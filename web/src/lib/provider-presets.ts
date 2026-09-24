export type ProviderPresetModel = {
    name: string;
    capability: "text" | "image" | "audio" | "speech" | "video";
};

export type ProviderPreset = {
    id: string;
    name: string;
    baseUrl: string;
    textOnly: boolean;
    models: ProviderPresetModel[];
};

export const PROVIDER_PRESETS: ProviderPreset[] = [
    {
        id: "openrouter",
        name: "OpenRouter",
        baseUrl: "https://openrouter.ai/api/v1",
        textOnly: false,
        models: [
            { name: "deepseek/deepseek-v4-pro", capability: "text" },
            { name: "z-ai/glm-5.3", capability: "text" },
            { name: "qwen/qwen3-max", capability: "text" },
            { name: "moonshotai/kimi-k2-thinking", capability: "text" },
            { name: "openai/gpt-oss-120b", capability: "text" },
            { name: "openai/gpt-image-2.5-sunburst", capability: "image" },
            { name: "minimax/hailuo-3-max", capability: "video" },
            { name: "minimax/hailuo-3", capability: "video" },
            { name: "fish-audio/s2.1-pro", capability: "speech" },
            { name: "google/lyria-3-pro-preview", capability: "audio" },
        ],
    },
    {
        id: "deepseek",
        name: "DeepSeek",
        baseUrl: "https://api.deepseek.com/v1",
        textOnly: true,
        models: [
            { name: "deepseek-v4-pro", capability: "text" },
            { name: "deepseek-v4-flash", capability: "text" },
        ],
    },
    {
        id: "matilda",
        name: "Matilda (Maincode)",
        baseUrl: "/matilda/v1",
        textOnly: true,
        models: [{ name: "matilda", capability: "text" }],
    },
];

export function isTextOnlyBaseUrl(baseUrl: string): boolean {
    const normalized = baseUrl.trim().replace(/\/+$/, "").toLowerCase();
    return PROVIDER_PRESETS.some((preset) => preset.textOnly && preset.baseUrl.toLowerCase() === normalized);
}
