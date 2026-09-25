import {
    decodeRpc,
    encodeRpc,
    VST_BRIDGE_DEFAULT_URL,
    VstError,
    type VstCommand,
    type VstEditorResult,
    type VstHelloResult,
    type VstLoadParams,
    type VstNoteOffParams,
    type VstNoteOnParams,
    type VstParam,
    type VstParamSetParams,
    type VstPlugin,
    type VstRpcSuccess,
} from "@/lib/canvas/audio-vst-protocol";

// Worklet source as a bundled ES module URL. `?worker&url` (not `?url`) is required here so Vite
// transpiles the TypeScript and bundles its imports; `?url` would ship the raw .ts.
import workletUrl from "./audio-vst.worklet.ts?worker&url";

export { VST_WORKLET_PROCESSOR, VstError } from "@/lib/canvas/audio-vst-protocol";

/** Bundled URL of the `canvas-vst-source` AudioWorkletProcessor module (pass to `audioWorklet.addModule`). */
export const VST_WORKLET_URL: string = workletUrl;

// ---------------------------------------------------------------------------
// Runtime configuration — mirrors `constant/runtime-config.ts` for the VST host
// (127.0.0.1:3211 by default), which is a separate process with its own token.
// ---------------------------------------------------------------------------

type VstRuntimeConfig = { VST_BRIDGE_URL?: string; VST_TOKEN?: string };
type VstRuntimeWindow = Window & { __RUNTIME_CONFIG__?: VstRuntimeConfig };

export const VST_BRIDGE_URL_STORAGE_KEY = "canvas-vst-url";
export const VST_TOKEN_STORAGE_KEY = "canvas-vst-token";

function readRuntimeConfig(): VstRuntimeConfig {
    if (typeof window === "undefined") return {};
    return (window as VstRuntimeWindow).__RUNTIME_CONFIG__ ?? {};
}

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
    } catch {}
}

/** Storage override > injected runtime config > build-time env > default. */
export function readVstBridgeUrl(): string {
    const stored = readStorage(VST_BRIDGE_URL_STORAGE_KEY);
    if (stored.trim()) return stored.trim();
    const runtime = readRuntimeConfig().VST_BRIDGE_URL;
    if (typeof runtime === "string" && runtime.trim()) return runtime.trim();
    const buildTime = (import.meta.env as Record<string, string | undefined>).VITE_VST_BRIDGE_URL;
    if (typeof buildTime === "string" && buildTime.trim()) return buildTime.trim();
    return VST_BRIDGE_DEFAULT_URL;
}

export function setVstBridgeUrl(url: string) {
    writeStorage(VST_BRIDGE_URL_STORAGE_KEY, url.trim());
}

export function readVstToken(): string {
    const stored = readStorage(VST_TOKEN_STORAGE_KEY);
    if (stored.trim()) return stored.trim();
    const runtime = readRuntimeConfig().VST_TOKEN;
    if (typeof runtime === "string" && runtime.trim()) return runtime.trim();
    const buildTime = (import.meta.env as Record<string, string | undefined>).VITE_VST_TOKEN;
    if (typeof buildTime === "string" && buildTime.trim()) return buildTime.trim();
    return "";
}

export function setVstToken(token: string) {
    writeStorage(VST_TOKEN_STORAGE_KEY, token.trim());
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

export type VstClientOptions = { baseUrl?: string; token?: string; fetch?: typeof fetch };

type HelloResult = VstRpcSuccess & VstHelloResult;
type ScanResult = VstRpcSuccess & { plugins: VstPlugin[] };
type LoadResult = VstRpcSuccess & { instanceId: string };
type ParamListResult = VstRpcSuccess & { params: VstParam[] };
type EditorRpcResult = VstRpcSuccess & { opened?: boolean };
type StateResult = VstRpcSuccess & { state?: unknown };

export type VstClient = {
    baseUrl: string;
    token: string;
    hello: () => Promise<VstHelloResult>;
    scan: () => Promise<VstPlugin[]>;
    load: (params: VstLoadParams) => Promise<{ instanceId: string }>;
    unload: (instanceId: string) => Promise<void>;
    noteOn: (params: VstNoteOnParams) => Promise<void>;
    noteOff: (params: VstNoteOffParams) => Promise<void>;
    paramList: (instanceId: string) => Promise<VstParam[]>;
    paramSet: (params: VstParamSetParams) => Promise<void>;
    openEditor: (instanceId: string) => Promise<VstEditorResult>;
    closeEditor: (instanceId: string) => Promise<void>;
    getState: (instanceId: string) => Promise<unknown>;
    setState: (instanceId: string, state: unknown) => Promise<void>;
    audioStart: (instanceId: string) => Promise<void>;
    audioStop: (instanceId: string) => Promise<void>;
    /** `GET /audio?instance=<id>&token=<token>` — feed to the streaming worker. */
    audioUrl: (instanceId: string) => string;
};

function normalizeBaseUrl(url: string): string {
    return (url || VST_BRIDGE_DEFAULT_URL).trim().replace(/\/+$/, "");
}

/**
 * Build a client bound to one host/token. A factory (not a module singleton) so HMR never leaks a
 * stale base URL, token or request counter across reloads.
 */
export function createVstClient(options: VstClientOptions = {}): VstClient {
    const baseUrl = normalizeBaseUrl(options.baseUrl ?? readVstBridgeUrl());
    const token = (options.token ?? readVstToken()).trim();
    const request = options.fetch ?? fetch;
    let nextId = 1;

    async function rpc<T extends VstRpcSuccess>(type: VstCommand, params: Record<string, unknown> = {}): Promise<T> {
        const id = nextId++;
        const headers: Record<string, string> = { "content-type": "application/json" };
        if (token) headers.authorization = `Bearer ${token}`;
        let response: Response;
        try {
            response = await request(`${baseUrl}/rpc`, { method: "POST", headers, body: encodeRpc({ id, type, ...params }) });
        } catch (error) {
            throw new VstError("unreachable", `VST host is not reachable at ${baseUrl}`, 0);
        }
        const text = await response.text();
        let decoded = null as ReturnType<typeof decodeRpc> | null;
        if (text) {
            try {
                decoded = decodeRpc(text);
            } catch {
                decoded = null;
            }
        }
        if (decoded && !decoded.ok) throw new VstError(decoded.error.code, decoded.error.message, response.status);
        if (!response.ok) throw new VstError(`http-${response.status}`, text.trim() || `VST host request failed (${response.status})`, response.status);
        if (!decoded) throw new VstError("bad-response", "VST host returned an empty response", response.status);
        return decoded as T;
    }

    return {
        baseUrl,
        token,
        hello: async () => {
            const result = await rpc<HelloResult>("hello");
            return { protocol: result.protocol, host: result.host, version: result.version };
        },
        scan: async () => (await rpc<ScanResult>("scan")).plugins ?? [],
        load: async (params) => {
            const result = await rpc<LoadResult>("load", { ...params });
            return { instanceId: result.instanceId };
        },
        unload: async (instanceId) => {
            await rpc("unload", { instanceId });
        },
        noteOn: async (params) => {
            await rpc("noteOn", { ...params });
        },
        noteOff: async (params) => {
            await rpc("noteOff", { ...params });
        },
        paramList: async (instanceId) => (await rpc<ParamListResult>("paramList", { instanceId })).params ?? [],
        paramSet: async (params) => {
            await rpc("paramSet", { ...params });
        },
        openEditor: async (instanceId) => {
            const result = await rpc<EditorRpcResult>("editorOpen", { instanceId });
            return { opened: result.opened === true };
        },
        closeEditor: async (instanceId) => {
            await rpc("editorClose", { instanceId });
        },
        getState: async (instanceId) => (await rpc<StateResult>("getState", { instanceId })).state,
        setState: async (instanceId, state) => {
            await rpc("setState", { instanceId, state });
        },
        audioStart: async (instanceId) => {
            await rpc("audioStart", { instanceId });
        },
        audioStop: async (instanceId) => {
            await rpc("audioStop", { instanceId });
        },
        audioUrl: (instanceId) => {
            const params = new URLSearchParams({ instance: instanceId });
            if (token) params.set("token", token);
            return `${baseUrl}/audio?${params.toString()}`;
        },
    };
}

/**
 * Create the streaming worker (module type) that owns `GET /audio`.
 * Selected via the same `new URL(..., import.meta.url)` form the repo already uses for workers.
 */
export function createVstStreamWorker(): Worker {
    return new Worker(new URL("./audio-vst.worker.ts", import.meta.url), { type: "module" });
}
