export const PROVIDER_PRESETS: { id: string; name: string; baseUrl: string }[] = [
    { id: "openrouter", name: "OpenRouter", baseUrl: "https://openrouter.ai/api/v1" },
    { id: "openai", name: "OpenAI", baseUrl: "https://api.openai.com/v1" },
    { id: "groq", name: "Groq", baseUrl: "https://api.groq.com/openai/v1" },
    { id: "deepseek", name: "DeepSeek", baseUrl: "https://api.deepseek.com/v1" },
    { id: "gemini", name: "Google Gemini", baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai" },
    { id: "moonshot", name: "Moonshot", baseUrl: "https://api.moonshot.cn/v1" },
    { id: "zhipu", name: "Zhipu GLM", baseUrl: "https://open.bigmodel.cn/api/paas/v4" },
    { id: "siliconflow", name: "SiliconFlow", baseUrl: "https://api.siliconflow.cn/v1" },
    { id: "cohere", name: "Cohere", baseUrl: "https://api.cohere.ai/compatibility/v1" },
    { id: "ollama", name: "Ollama (local)", baseUrl: "http://localhost:11434/v1" },
];

export async function fetchProviderModels(baseUrl: string, apiKey: string) {
    const url = `${baseUrl.trim().replace(/\/+$/, "")}/models`;
    const response = await fetch(url, { headers: apiKey.trim() ? { Authorization: `Bearer ${apiKey.trim()}` } : undefined });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = (await response.json()) as { data?: { id?: string }[] };
    return (data.data || []).map((item) => item.id?.trim()).filter((id): id is string => Boolean(id));
}
