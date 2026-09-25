#!/usr/bin/env node
// Mock VST bridge host for developing and testing the browser side without the native host.
//
// Speaks the frozen protocol v1 exactly:
//   POST /rpc    auth: allowlisted Origin + `Authorization: Bearer <token>`
//   GET  /audio  auth: allowlisted Origin + `?token=<token>`; chunked 16-byte-LE-header frames
//                with a planar Float32 body (48000 Hz, 256 frames, 2 channels, 440 Hz sine).
//
// Env:
//   VST_BRIDGE_PORT      default 3211
//   VST_BRIDGE_TOKEN     default "dev-vst-token"
//   VST_ALLOWED_ORIGINS  default "http://localhost:3000,http://127.0.0.1:3000"

import { createServer } from "node:http";

import {
    VST_CHANNELS,
    VST_FRAMES_PER_BLOCK,
    VST_SAMPLE_RATE,
    frameByteLength,
    hashInstanceId,
    writeFrame,
} from "../src/lib/canvas/audio-vst-protocol.ts";

const PORT = Number(process.env.VST_BRIDGE_PORT || 3211);
const HOST = "127.0.0.1";
const TOKEN = process.env.VST_BRIDGE_TOKEN || "dev-vst-token";
const ALLOWED_ORIGINS = (process.env.VST_ALLOWED_ORIGINS || "http://localhost:3000,http://127.0.0.1:3000")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
const SINE_HZ = 440;
const SINE_AMPLITUDE = 0.5;

const PLUGINS = [
    {
        id: "mock.synth.one",
        name: "Mock Synth One",
        vendor: "Mock Labs",
        version: "1.0.0",
        category: "Instrument",
        subCategories: ["Synth"],
        path: "/mock/Mock Synth One.vst3",
        packaging: "bundle",
        isInstrument: true,
    },
];

const PARAMS = [
    { id: 0, name: "Cutoff", value: 0.5, min: 0, max: 1, unit: "Hz" },
    { id: 1, name: "Resonance", value: 0.2, min: 0, max: 1 },
];

let loadCount = 0;

function setCors(res, origin) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
}

function sendJson(res, status, body) {
    const payload = JSON.stringify(body);
    res.writeHead(status, { "content-type": "application/json", "content-length": Buffer.byteLength(payload) });
    res.end(payload);
}

function originAllowed(origin) {
    return typeof origin === "string" && ALLOWED_ORIGINS.includes(origin);
}

function bearerToken(req) {
    const header = req.headers.authorization || "";
    return header.startsWith("Bearer ") ? header.slice(7) : "";
}

function log(line) {
    console.log(`[vst-mock-host] ${line}`);
}

function handleRpc(req, res, origin) {
    if (!originAllowed(origin)) {
        log(`/rpc rejected: Origin "${origin}" is not allowlisted`);
        sendJson(res, 403, { error: { code: "origin-denied", message: "Origin is not allowlisted" } });
        return;
    }
    if (bearerToken(req) !== TOKEN) {
        log("/rpc rejected: missing or invalid bearer token");
        sendJson(res, 401, { error: { code: "unauthorized", message: "Missing or invalid token" } });
        return;
    }
    let raw = "";
    req.on("data", (chunk) => {
        raw += chunk;
    });
    req.on("end", () => {
        let message;
        try {
            message = JSON.parse(raw || "{}");
        } catch {
            sendJson(res, 400, { error: { code: "bad-json", message: "Request body is not JSON" } });
            return;
        }
        const id = typeof message.id === "number" ? message.id : 0;
        const reply = (extra) => sendJson(res, 200, { id, ok: true, ...extra });
        switch (message.type) {
            case "hello":
                return reply({ protocol: 1, host: "vst-mock-host", version: "1.0.0" });
            case "scan":
                return reply({ plugins: PLUGINS });
            case "load":
                loadCount += 1;
                return reply({ instanceId: `mock-instance-${loadCount}` });
            case "unload":
                return reply({});
            case "noteOn":
            case "noteOff":
                return reply({});
            case "paramList":
                return reply({ params: PARAMS });
            case "paramSet":
                return reply({});
            case "editorOpen":
                return reply({ opened: true });
            case "editorClose":
                return reply({});
            case "getState":
                return reply({ state: { mock: true } });
            case "setState":
                return reply({});
            case "audioStart":
            case "audioStop":
                return reply({});
            default:
                return sendJson(res, 200, { id, ok: false, error: { code: "unknown-command", message: `Unknown command: ${String(message.type)}` } });
        }
    });
}

function handleAudio(req, res, url) {
    const origin = req.headers.origin;
    if (!originAllowed(origin)) {
        log(`/audio rejected: Origin "${origin}" is not allowlisted`);
        setCors(res, origin || "null");
        sendJson(res, 403, { error: { code: "origin-denied", message: "Origin is not allowlisted" } });
        return;
    }
    if (url.searchParams.get("token") !== TOKEN) {
        log("/audio rejected: missing or invalid token query");
        setCors(res, origin);
        sendJson(res, 401, { error: { code: "unauthorized", message: "Missing or invalid token" } });
        return;
    }

    const instance = url.searchParams.get("instance") || "mock-instance";
    const instanceHash = hashInstanceId(instance);
    const bytesPerFrame = frameByteLength(VST_CHANNELS, VST_FRAMES_PER_BLOCK);
    const left = new Float32Array(VST_FRAMES_PER_BLOCK);
    const right = new Float32Array(VST_FRAMES_PER_BLOCK);

    log(`/audio streaming instance="${instance}" (hash=${instanceHash})`);
    res.writeHead(200, { "content-type": "application/octet-stream", "cache-control": "no-store", ...(origin ? { "Access-Control-Allow-Origin": origin, Vary: "Origin" } : {}) });

    let seq = 0;
    let phase = 0;
    let sent = 0;
    let closed = false;
    const startedAt = Date.now();
    const phaseStep = (2 * Math.PI * SINE_HZ) / VST_SAMPLE_RATE;

    const writeBlock = () => {
        // A fresh buffer per block: `res.write` may retain the chunk until it drains, so reusing one
        // buffer would overwrite queued frames before they are flushed.
        const bytes = new Uint8Array(bytesPerFrame);
        const view = new DataView(bytes.buffer);
        for (let i = 0; i < VST_FRAMES_PER_BLOCK; i++) {
            const sample = SINE_AMPLITUDE * Math.sin(phase);
            left[i] = sample;
            right[i] = sample;
            phase += phaseStep;
            if (phase > 2 * Math.PI) phase -= 2 * Math.PI;
        }
        writeFrame(view, 0, { instanceHash, seq, channels: VST_CHANNELS, framesPerChannel: VST_FRAMES_PER_BLOCK }, [left, right]);
        seq += 1;
        res.write(bytes);
    };

    // Pace to real time so the browser jitter buffer sees a realistic stream.
    const timer = setInterval(() => {
        const target = Math.floor(((Date.now() - startedAt) / 1000) * VST_SAMPLE_RATE / VST_FRAMES_PER_BLOCK);
        let budget = 16;
        while (sent < target && budget > 0) {
            writeBlock();
            sent += 1;
            budget -= 1;
        }
    }, 4);

    const stop = () => {
        if (closed) return;
        closed = true;
        clearInterval(timer);
        res.end();
    };
    req.on("close", stop);
    res.on("close", stop);
}

const server = createServer((req, res) => {
    const url = new URL(req.url || "/", `http://${HOST}:${PORT}`);
    const origin = req.headers.origin;
    if (origin && originAllowed(origin)) setCors(res, origin);

    if (req.method === "OPTIONS") {
        if (!originAllowed(origin)) {
            log(`OPTIONS rejected: Origin "${origin}" is not allowlisted`);
            sendJson(res, 403, { error: { code: "origin-denied", message: "Origin is not allowlisted" } });
            return;
        }
        res.writeHead(204, {
            "access-control-allow-methods": "POST, GET, OPTIONS",
            "access-control-allow-headers": "authorization, content-type",
            "access-control-max-age": "600",
        });
        res.end();
        return;
    }
    if (url.pathname === "/rpc" && req.method === "POST") {
        handleRpc(req, res, origin);
        return;
    }
    if (url.pathname === "/audio" && req.method === "GET") {
        handleAudio(req, res, url);
        return;
    }
    sendJson(res, 404, { error: { code: "not-found", message: `No route for ${req.method} ${url.pathname}` } });
});

server.listen(PORT, HOST, () => {
    log(`listening on http://${HOST}:${PORT}`);
    log(`origin allowlist: ${ALLOWED_ORIGINS.join(", ")}`);
    log(`token: ${TOKEN} (env VST_BRIDGE_TOKEN)`);
});
