import { useRuntimeLogStore, type RuntimeLogCategory, type RuntimeLogLevel } from "@/stores/use-runtime-log-store";

export type { RuntimeLogCategory, RuntimeLogLevel };

const MAX_LOG_TEXT = 4000;

/** Clamp a value (string / Error / arbitrary JSON) to a bounded string for the log detail field. */
export function truncateLogText(value: unknown, max = MAX_LOG_TEXT): string {
    if (value == null) return "";
    let text: string;
    if (typeof value === "string") text = value;
    else if (value instanceof Error) text = value.message;
    else {
        try {
            text = JSON.stringify(value);
        } catch {
            text = String(value);
        }
    }
    return text.length > max ? `${text.slice(0, max)}…（已截断 ${text.length - max} 字符）` : text;
}

/** Append one runtime log entry; the single entry point every operation / generation path uses. */
export function recordRuntimeLog(input: { level?: RuntimeLogLevel; category: RuntimeLogCategory; action: string; message: string; detail?: string }): string {
    return useRuntimeLogStore.getState().append({
        level: input.level || "info",
        category: input.category,
        action: input.action,
        message: input.message,
        detail: input.detail ? truncateLogText(input.detail) : undefined,
    });
}
