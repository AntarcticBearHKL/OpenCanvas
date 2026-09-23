// Runtime configuration access layer.
// Priority: window.__RUNTIME_CONFIG__ (injected by the container entrypoint) > build-time VITE_ variables > defaults.
// This supports both configuring the same image with docker run -e and injecting values during custom builds.
//
// Each analytics provider has its own variable; configured providers are enabled independently and all are disabled by default.
// Only GA4 and Baidu are supported. Both accept IDs only, and script URLs are assembled in code without arbitrary scripts or inline JavaScript.

type RuntimeConfig = {
    ANALYTICS_GA4_ID?: string; // GA4 measurement ID (G-XXXX)
    ANALYTICS_BAIDU_ID?: string; // Baidu Analytics site ID
    AGENT_BRIDGE_URL?: string; // Base URL of the standalone local browser bridge / MCP service
    AGENT_TOKEN?: string; // Bearer token for the local bridge service
};

declare global {
    interface Window {
        __RUNTIME_CONFIG__?: RuntimeConfig;
    }
}

const runtime: RuntimeConfig = (typeof window !== "undefined" && window.__RUNTIME_CONFIG__) || {};

function read(key: keyof RuntimeConfig, buildTime: string | undefined, fallback = ""): string {
    const value = runtime[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof buildTime === "string" && buildTime.trim()) return buildTime.trim();
    return fallback;
}

export const ANALYTICS_GA4_ID = read("ANALYTICS_GA4_ID", import.meta.env.VITE_ANALYTICS_GA4_ID);
export const ANALYTICS_BAIDU_ID = read("ANALYTICS_BAIDU_ID", import.meta.env.VITE_ANALYTICS_BAIDU_ID);

// The browser bridge / MCP service is now a standalone local process (default 127.0.0.1:3210), so the app
// talks to a configurable base URL with a bearer token instead of the page origin.
// Both can be changed from Settings without a rebuild: the localStorage override wins over the build config.
export const AGENT_BRIDGE_URL_DEFAULT = "http://127.0.0.1:3210";
export const AGENT_BRIDGE_URL_STORAGE_KEY = "canvas-agent-url";
export const AGENT_TOKEN_STORAGE_KEY = "canvas-agent-token";

function readStorage(key: string): string {
    try {
        return localStorage.getItem(key) || "";
    } catch {
        return "";
    }
}

function writeStorage(key: string, value: string) {
    try {
        if (value) localStorage.setItem(key, value);
        else localStorage.removeItem(key);
    } catch {
    }
}

export function readAgentBridgeUrl(): string {
    return readStorage(AGENT_BRIDGE_URL_STORAGE_KEY) || read("AGENT_BRIDGE_URL", import.meta.env.VITE_AGENT_BRIDGE_URL, AGENT_BRIDGE_URL_DEFAULT);
}

export function setAgentBridgeUrl(url: string) {
    writeStorage(AGENT_BRIDGE_URL_STORAGE_KEY, url.trim());
}

export function readAgentToken(): string {
    return readStorage(AGENT_TOKEN_STORAGE_KEY) || read("AGENT_TOKEN", import.meta.env.VITE_AGENT_TOKEN);
}

export function setAgentToken(token: string) {
    writeStorage(AGENT_TOKEN_STORAGE_KEY, token.trim());
}

export const AGENT_BRIDGE_URL = readAgentBridgeUrl();
export const AGENT_TOKEN = readAgentToken();
