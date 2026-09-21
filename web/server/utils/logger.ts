/** 管理 Canvas MCP 的终端 Debug 日志。 */
class Logger {
    readonly enabled = process.argv.includes("--debug");

    /** 输出 Debug 级别日志，仅在 --debug 模式生效。 */
    debug(message: string, details?: unknown) {
        if (this.enabled) this.write("DEBUG", message, details);
    }

    /** 输出 Info 级别日志。 */
    info(message: string, details?: unknown) {
        this.write("INFO", message, details);
    }

    /** 输出 Warn 级别日志。 */
    warn(message: string, details?: unknown) {
        this.write("WARN", message, details);
    }

    /** 输出 Error 级别日志。 */
    error(message: string, details?: unknown) {
        this.write("ERROR", message, details);
    }

    private write(level: string, message: string, details?: unknown) {
        const suffix = details === undefined ? "" : ` ${JSON.stringify(sanitize(details))}`;
        console.log(`${new Date().toISOString()} ${level} ${message}${suffix}`);
    }
}

/** 清理日志内容中的敏感数据和 Data URL。 */
function sanitize(value: unknown, key = ""): unknown {
    if (/token|authorization|api.?key|dataurl/i.test(key)) return "[REDACTED]";
    if (typeof value === "string" && value.startsWith("data:")) return `[DATA URL ${value.length} chars]`;
    if (value instanceof Error) return { name: value.name, message: value.message };
    if (!value || typeof value !== "object") return value;
    if (Array.isArray(value)) return value.map((item) => sanitize(item, key));
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([field, item]) => [field, sanitize(item, field)]));
}

export const logger = new Logger();
