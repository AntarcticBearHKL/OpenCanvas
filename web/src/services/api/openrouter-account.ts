import axios from "axios";

import i18n from "@/i18n";
import { OPENROUTER_BASE_URL } from "@/stores/use-config-store";

type OpenRouterKeyUsage = {
    usage: number;
    usage_daily: number;
    usage_weekly: number;
    usage_monthly: number;
    limit: number | null;
    limit_remaining: number | null;
    limit_reset: string | null;
    is_free_tier: boolean;
};

type KeyUsagePayload = Partial<Record<keyof OpenRouterKeyUsage, unknown>>;

function toAmount(value: unknown): number {
    const amount = Number(value);
    return Number.isFinite(amount) ? amount : 0;
}

function toNullableAmount(value: unknown): number | null {
    if (value === null || value === undefined || value === "") return null;
    const amount = Number(value);
    return Number.isFinite(amount) ? amount : null;
}

export async function fetchOpenRouterKeyUsage(apiKey: string): Promise<OpenRouterKeyUsage> {
    const key = apiKey.trim();
    if (!key) throw new Error(i18n.t("account.missingKey"));
    try {
        const response = await axios.get<{ data?: KeyUsagePayload }>(`${OPENROUTER_BASE_URL}/key`, {
            headers: { Authorization: `Bearer ${key}` },
        });
        const data = response.data?.data || {};
        return {
            usage: toAmount(data.usage),
            usage_daily: toAmount(data.usage_daily),
            usage_weekly: toAmount(data.usage_weekly),
            usage_monthly: toAmount(data.usage_monthly),
            limit: toNullableAmount(data.limit),
            limit_remaining: toNullableAmount(data.limit_remaining),
            limit_reset: typeof data.limit_reset === "string" ? data.limit_reset : null,
            is_free_tier: data.is_free_tier === true,
        };
    } catch (error) {
        if (axios.isAxiosError(error)) {
            const status = error.response?.status;
            if (status === 401 || status === 403) throw new Error(i18n.t("account.authError"));
            if (!error.response) throw new Error(i18n.t("account.networkError"));
        }
        throw new Error(i18n.t("account.error"));
    }
}
