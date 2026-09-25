// VST3 plugin-editor end-to-end: a real Chrome page (served by the reused Vite dev server on port 3000)
// seeds a canvas with one vst3 instrument track (Retrologue) + one MIDI region, opens the piano roll,
// presses Play to unlock the audio context and build the bridge, waits until the new 「打开插件界面」
// action reports ready, clicks it through the real UI and proves the native host actually opened the
// plugin window (`editorOpen` -> `{ ok: true, opened: true }`), then closes it again via `editorClose`.
// With the host stopped, a reload must leave the action not offered and the failed attach must surface
// as a hint without a single uncaught page error.
//
// Same CDP approach as `e2e/vst-picker.mjs`: real Chrome over the DevTools protocol, no Playwright. The
// dev server on port 3000 is REUSED and never started or stopped; the VST host and Chrome are started
// here and stopped before exit (port 3211 is checked free, and any editor opened is closed first).
//
//   node e2e/vst-editor.mjs
//
// Env: E2E_BASE (default http://127.0.0.1:3000), E2E_CDP_PORT (default 9336),
//      E2E_VST_HOST (default http://127.0.0.1:3211), E2E_VST_HOST_EXE, E2E_VST_TOKEN,
//      E2E_VST_ORIGINS, E2E_VST_PLUGIN_ID, E2E_VST_PLUGIN_NAME.

import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { execFileSync, spawn } from "node:child_process";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";

const BASE = process.env.E2E_BASE || "http://127.0.0.1:3000";
const PORT = Number(process.env.E2E_CDP_PORT || 9336);
const HOST_URL = process.env.E2E_VST_HOST || "http://127.0.0.1:3211";
const HOST_PORT = Number(new URL(HOST_URL).port || 3211);
const HOST_EXE = process.env.E2E_VST_HOST_EXE || fileURLToPath(new URL("../../vst-host/build/bin/vst-host.exe", import.meta.url));
const TOKEN = process.env.E2E_VST_TOKEN || `vst-editor-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
const ORIGINS = process.env.E2E_VST_ORIGINS || "http://localhost:3000,http://127.0.0.1:3000";
const PLUGIN_ID = process.env.E2E_VST_PLUGIN_ID || "CC3695D88FE74881B46E6CCFFB291CFF"; // Retrologue
const PLUGIN_NAME = process.env.E2E_VST_PLUGIN_NAME || "Retrologue";
const READY_TIMEOUT_MS = 90000;
const HARD_TIMEOUT_MS = 300000;
const ARTIFACTS = resolve("e2e", "artifacts", new Date().toISOString().replace(/[:.]/g, "-"));
const CHROME = ["C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe", "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/usr/bin/google-chrome"].find((path) => existsSync(path));

const CANVAS_STORE_KEY = "infinite-canvas:canvas_store";
const PROJECT_NODE_ID = "vst-editor-project";
const TRACK_ID = "t1";
const REGION_ID = "r1";
const SEED_NODE = {
    id: PROJECT_NODE_ID,
    type: "audio-project",
    title: "VST editor project",
    position: { x: 80, y: 80 },
    width: 900,
    height: 560,
    metadata: {
        audioPpqn: 960,
        audioTempo: 120,
        audioTracks: [
            { id: TRACK_ID, name: "VST track", type: "instrument", gain: 1, pan: 0, mute: false, solo: false, instrument: { kind: "vst3", pluginId: PLUGIN_ID, name: PLUGIN_NAME } },
            { id: "master", name: "Master", type: "master", gain: 1, pan: 0, mute: false, solo: false },
        ],
        audioMidiRegions: [{ id: REGION_ID, trackId: TRACK_ID, startTicks: 0, durationTicks: 960 * 8, name: "VST region", notes: [{ id: "n1", tick: 0, durationTicks: 960 * 4, pitch: 60, velocity: 0.8 }] }],
    },
};

// ---------------------------------------------------------------------------
// In-page scripts (executed over CDP; no npm browser deps)
// ---------------------------------------------------------------------------

// Installed on every new document via Page.addScriptToEvaluateOnNewDocument, so the `load` that the
// graph performs and the `editorOpen`/`editorClose` the UI performs are all observable from Node.
const RECORDER_SOURCE = `(() => {
    const calls = [];
    window.__vstEditorCalls = calls;
    const original = window.fetch.bind(window);
    window.fetch = async (input, init) => {
        const response = await original(input, init);
        try {
            const url = typeof input === "string" ? input : (input && input.url) || "";
            if (url.indexOf("/rpc") >= 0) {
                let request = null;
                if (init && typeof init.body === "string") request = JSON.parse(init.body);
                const payload = await response.clone().json().catch(() => null);
                calls.push({ type: request && request.type, instanceId: request && request.instanceId, ok: payload && payload.ok === true, opened: payload && payload.opened === true, error: payload && payload.error });
            }
        } catch {}
        return response;
    };
})()`;

const SEED_SCRIPT = `(async () => {
    const ARGS = ${JSON.stringify({ baseUrl: HOST_URL, token: TOKEN, node: SEED_NODE, storageKey: CANVAS_STORE_KEY })};
    const wait = (ms) => new Promise((resolveWait) => setTimeout(resolveWait, ms));
    localStorage.setItem("infinite-canvas:locale", "zh-CN");
    localStorage.setItem("canvas-vst-url", ARGS.baseUrl);
    localStorage.setItem("canvas-vst-token", ARGS.token);
    const store = (await import("/src/stores/canvas/use-canvas-store.ts")).useCanvasStore;
    const storage = (await import("/src/lib/localforage-storage.ts")).localForageStorage;
    const hydratedDeadline = Date.now() + 15000;
    while (!store.getState().hydrated && Date.now() < hydratedDeadline) await wait(100);
    const projectId = store.getState().createProject("VST editor e2e");
    store.getState().updateProject(projectId, { nodes: [ARGS.node], connections: [] });
    let persisted = false;
    const flushDeadline = Date.now() + 8000;
    while (!persisted && Date.now() < flushDeadline) {
        await wait(200);
        const raw = await storage.getItem(ARGS.storageKey);
        persisted = Boolean(raw && raw.includes(projectId));
    }
    return { projectId, hydrated: store.getState().hydrated, persisted };
})()`;

const REGION_EXISTS_SCRIPT = `Boolean(document.querySelector('[data-midi-region=${JSON.stringify(REGION_ID)}]'))`;

const OPEN_ROLL_SCRIPT = `(() => {
    const region = document.querySelector('[data-midi-region=${JSON.stringify(REGION_ID)}]');
    if (!region) return false;
    region.dispatchEvent(new MouseEvent("dblclick", { bubbles: true, cancelable: true, view: window }));
    return true;
})()`;

const PICKER_EXISTS_SCRIPT = `Boolean(document.querySelector("[data-roll-instrument] [role='combobox']"))`;

// Play unlocks the audio context and sets the studio's `unlocked` flag, which is what triggers the graph build.
const PLAY_SCRIPT = `(() => {
    const button = document.querySelector('button[aria-label="播放"]') || document.querySelector('button[aria-label="Play"]');
    if (!button) return { clicked: false, reason: "play button not found" };
    const disabled = button.disabled === true;
    button.click();
    return { clicked: true, disabled };
})()`;

const READ_EDITOR_SCRIPT = `(() => {
    const button = document.querySelector("[data-roll-vst-editor]");
    const hint = document.querySelector("[data-roll-vst-editor-hint]");
    const error = document.querySelector("[data-roll-vst-editor-error]");
    return {
        button: button ? { disabled: button.disabled === true, text: (button.textContent || "").trim() } : null,
        hint: hint ? (hint.textContent || "").trim() : "",
        error: error ? (error.textContent || "").trim() : "",
    };
})()`;

const CLICK_EDITOR_SCRIPT = `(() => {
    const button = document.querySelector("[data-roll-vst-editor]");
    if (!button) return { clicked: false, reason: "no plugin editor button" };
    const disabled = button.disabled === true;
    button.click();
    return { clicked: true, disabled };
})()`;

const READ_CALLS_SCRIPT = `window.__vstEditorCalls || []`;

const closeEditorScript = (instanceId) => `(async () => {
    const ARGS = ${JSON.stringify({ instanceId })};
    try {
        const client = (await import("/src/lib/canvas/audio-vst.ts")).createVstClient();
        await client.closeEditor(ARGS.instanceId);
        return { ok: true };
    } catch (error) {
        return { ok: false, error: String((error && error.message) || error) };
    }
})()`;

// ---------------------------------------------------------------------------
// CDP plumbing
// ---------------------------------------------------------------------------

function connect(wsUrl) {
    return new Promise((resolvePromise, rejectPromise) => {
        const socket = new WebSocket(wsUrl);
        socket.addEventListener("open", () => resolvePromise(socket));
        socket.addEventListener("error", () => rejectPromise(new Error("CDP socket error")));
    });
}

async function send(socket, id, method, params) {
    socket.send(JSON.stringify({ id, method, params }));
    while (true) {
        const message = await new Promise((resolvePromise) => socket.addEventListener("message", (event) => resolvePromise(event), { once: true }));
        const payload = JSON.parse(typeof message.data === "string" ? message.data : String(message.data));
        if (payload.id === id) return payload.result;
    }
}

function isPortFree(port, host = "127.0.0.1") {
    return new Promise((resolvePromise) => {
        const server = createServer();
        server.once("error", () => resolvePromise(false));
        server.listen(port, host, () => server.close(() => resolvePromise(true)));
    });
}

async function waitPortFree(port, timeoutMs) {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
        if (await isPortFree(port)) return true;
        if (Date.now() > deadline) return false;
        await delay(250);
    }
}

function portOwner(port) {
    try {
        const lines = execFileSync("netstat", ["-ano"], { encoding: "utf8" }).split(/\r?\n/);
        const row = lines.find((line) => line.includes(`:${port} `) && /LISTENING/i.test(line));
        if (!row) return "unknown";
        const pid = row.trim().split(/\s+/).pop();
        let name = "unknown";
        try {
            const csv = execFileSync("tasklist", ["/FI", `PID eq ${pid}`, "/FO", "CSV", "/NH"], { encoding: "utf8" }).trim().split(/\r?\n/)[0];
            name = csv.split('","')[0].replace(/^"/, "");
        } catch {}
        return `${name} (pid ${pid})`;
    } catch {
        return "unknown";
    }
}

// ---------------------------------------------------------------------------
// Process lifecycle — everything started here is stopped before the process exits.
// ---------------------------------------------------------------------------

const state = { host: null, chrome: null, socket: null, profile: "", instanceId: "" };
const hostOutput = [];

async function stopProcess(child, label) {
    if (!child || child.exitCode !== null) {
        if (child) console.log(`${label}: already exited (pid ${child.pid})`);
        return;
    }
    child.kill();
    for (let i = 0; i < 20 && child.exitCode === null; i++) await delay(150);
    if (child.exitCode === null && process.platform === "win32") {
        try {
            execFileSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore" });
        } catch {}
        for (let i = 0; i < 20 && child.exitCode === null; i++) await delay(150);
    }
    console.log(`${label}: stopped (pid ${child.pid})`);
}

// Belt and braces: the in-page close already ran, but if anything failed the host is asked directly
// before it is killed, so no native editor window is left behind on the desktop.
async function closeEditorOnHost(instanceId) {
    if (!instanceId || !state.host || state.host.exitCode !== null) return false;
    try {
        const response = await fetch(`${HOST_URL}/rpc`, {
            method: "POST",
            headers: { "content-type": "application/json", origin: new URL(BASE).origin, authorization: `Bearer ${TOKEN}` },
            body: JSON.stringify({ id: 9999, type: "editorClose", instanceId }),
        });
        const body = await response.json().catch(() => null);
        console.log(`editorClose safeguard: ${response.ok && body && body.ok === true ? "ok" : JSON.stringify(body)}`);
        return response.ok && body && body.ok === true;
    } catch (error) {
        console.log(`editorClose safeguard failed: ${error.message}`);
        return false;
    }
}

async function cleanup() {
    if (state.instanceId) await closeEditorOnHost(state.instanceId);
    if (state.socket) {
        state.socket.close();
        state.socket = null;
    }
    await stopProcess(state.chrome, "chrome");
    state.chrome = null;
    await stopProcess(state.host, "vst-host");
    state.host = null;
    if (state.profile) {
        rmSync(state.profile, { recursive: true, force: true });
        state.profile = "";
    }
    const free = await waitPortFree(HOST_PORT, 5000);
    console.log(free ? `port ${HOST_PORT} free: yes (vst-host stopped)` : `port ${HOST_PORT} free: NO — still occupied by ${portOwner(HOST_PORT)}`);
    return free;
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

async function hostScan() {
    const response = await fetch(`${HOST_URL}/rpc`, {
        method: "POST",
        headers: { "content-type": "application/json", origin: new URL(BASE).origin, authorization: `Bearer ${TOKEN}` },
        body: JSON.stringify({ id: 1, type: "scan" }),
    });
    const body = await response.json().catch(() => null);
    if (!response.ok || !body || body.ok !== true) throw new Error(`scan failed: ${response.status} ${JSON.stringify(body)}`);
    return (body.plugins || []).filter((plugin) => plugin.isInstrument);
}

async function run() {
    if (!CHROME) throw new Error("Chrome not found on this machine");
    if (!existsSync(HOST_EXE)) throw new Error(`vst-host executable not found at ${HOST_EXE} (build vst-host first)`);
    try {
        const app = await fetch(`${BASE}/`);
        if (!app.ok) throw new Error(String(app.status));
    } catch {
        throw new Error(`Dev server is not reachable at ${BASE} — start it (or set E2E_BASE) before running the VST editor E2E`);
    }
    if (!(await isPortFree(HOST_PORT))) throw new Error(`port ${HOST_PORT} is already in use by ${portOwner(HOST_PORT)} — stop it before running the VST editor E2E`);
    if (!(await isPortFree(PORT))) throw new Error(`CDP port ${PORT} is already in use by ${portOwner(PORT)} — set E2E_CDP_PORT to a free port`);

    mkdirSync(ARTIFACTS, { recursive: true });
    state.profile = join(tmpdir(), `opencanvas-vst-editor-e2e-${process.pid}`);
    rmSync(state.profile, { recursive: true, force: true });

    state.host = spawn(HOST_EXE, [], { env: { ...process.env, VST_HOST_TOKEN: TOKEN, VST_HOST_ORIGINS: ORIGINS }, stdio: ["ignore", "pipe", "pipe"] });
    state.host.stdout.on("data", (data) => hostOutput.push(String(data)));
    state.host.stderr.on("data", (data) => hostOutput.push(`[stderr] ${String(data)}`));

    let ready = false;
    let lastError = "";
    for (let attempt = 0; attempt < 60 && !ready; attempt++) {
        if (state.host.exitCode !== null) break;
        try {
            const response = await fetch(`${HOST_URL}/rpc`, {
                method: "POST",
                headers: { "content-type": "application/json", origin: new URL(BASE).origin, authorization: `Bearer ${TOKEN}` },
                body: JSON.stringify({ id: 0, type: "hello" }),
            });
            const body = await response.json().catch(() => null);
            ready = response.ok && body && body.ok === true;
            if (!ready) lastError = `${response.status} ${JSON.stringify(body)}`;
        } catch (error) {
            lastError = error.message;
            await delay(250);
        }
    }
    if (!ready) throw new Error(`vst-host did not become ready at ${HOST_URL}: ${lastError}\n${hostOutput.join("")}`);

    // Node-side scan warms the host's own cache so the later bridge attach is not the first load.
    const instruments = await hostScan();
    const target = instruments.find((plugin) => plugin.id === PLUGIN_ID);
    writeFileSync(join(ARTIFACTS, "scan.json"), JSON.stringify({ base: BASE, hostUrl: HOST_URL, instruments }, null, 2));

    state.chrome = spawn(CHROME, ["--headless=new", `--remote-debugging-port=${PORT}`, `--user-data-dir=${state.profile}`, "--no-first-run", "--window-size=1500,950", "--autoplay-policy=no-user-gesture-required", `${BASE}/canvas`], { stdio: "ignore" });

    let targets = [];
    for (let attempt = 0; attempt < 40; attempt++) {
        await delay(500);
        try {
            targets = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
            if (targets.some((item) => item.type === "page" && item.webSocketDebuggerUrl)) break;
        } catch {}
    }
    const page = targets.find((item) => item.type === "page" && item.webSocketDebuggerUrl);
    if (!page) throw new Error("Could not attach to a Chrome page target");

    state.socket = await connect(page.webSocketDebuggerUrl);
    let nextId = 1;
    await send(state.socket, nextId++, "Runtime.enable", {});
    await send(state.socket, nextId++, "Page.enable", {});
    await send(state.socket, nextId++, "Page.addScriptToEvaluateOnNewDocument", { source: RECORDER_SOURCE });
    const runtimeExceptions = [];
    const consoleErrors = [];
    let currentPhase = "startup";
    state.socket.addEventListener("message", (event) => {
        const payload = JSON.parse(typeof event.data === "string" ? event.data : String(event.data));
        if (payload.method === "Runtime.exceptionThrown") runtimeExceptions.push(`[${currentPhase}] ${payload.params.exceptionDetails?.exception?.description || payload.params.exceptionDetails?.text || "exception"}`);
        if (payload.method === "Runtime.consoleAPICalled" && payload.params.type === "error") consoleErrors.push(`[${currentPhase}] ${(payload.params.args || []).map((arg) => arg.value ?? arg.description ?? "").join(" ") || "console.error"}`);
    });
    await delay(2000);
    runtimeExceptions.length = 0;
    consoleErrors.length = 0;

    const exec = async (expression) => {
        const result = await send(state.socket, nextId++, "Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
        if (result?.exceptionDetails) {
            const detail = result.exceptionDetails.exception?.description || result.exceptionDetails.text || "evaluate failed";
            throw new Error(String(detail).split("\n").slice(0, 3).join(" | "));
        }
        return result?.result?.value;
    };
    const waitFor = async (probe, timeoutMs, label) => {
        const deadline = Date.now() + timeoutMs;
        let last = null;
        for (;;) {
            try {
                const value = await probe();
                if (value) return value;
                last = value;
            } catch (error) {
                last = error.message;
            }
            if (Date.now() > deadline) throw new Error(`${label} timed out (last: ${JSON.stringify(last)})`);
            await delay(250);
        }
    };
    const screenshot = async (name) => {
        try {
            const image = await send(state.socket, nextId++, "Page.captureScreenshot", { format: "png" });
            if (image?.data) writeFileSync(join(ARTIFACTS, name), Buffer.from(image.data, "base64"));
        } catch {}
    };

    // ---- Phase 1: bridge ready, open the plugin editor through the UI, close it ----
    currentPhase = "seed";
    const seed = await exec(SEED_SCRIPT);
    if (!seed || !seed.projectId || !seed.hydrated || !seed.persisted) throw new Error(`could not seed the canvas project: ${JSON.stringify(seed)}`);
    writeFileSync(join(ARTIFACTS, "seed.json"), JSON.stringify(seed, null, 2));

    currentPhase = "project page";
    await send(state.socket, nextId++, "Page.navigate", { url: `${BASE}/canvas/${seed.projectId}/audio` });
    await waitFor(async () => (await exec(REGION_EXISTS_SCRIPT)) === true, 40000, "audio studio region");

    currentPhase = "roll open";
    await exec(OPEN_ROLL_SCRIPT);
    await waitFor(async () => (await exec(PICKER_EXISTS_SCRIPT)) === true, 20000, "piano-roll instrument picker");

    currentPhase = "unlock audio";
    const play = await exec(PLAY_SCRIPT);
    if (!play || play.clicked !== true || play.disabled === true) throw new Error(`could not press Play to unlock the audio context: ${JSON.stringify(play)}`);

    currentPhase = "bridge ready";
    let readyState = null;
    try {
        readyState = await waitFor(
            async () => {
                const snapshot = await exec(READ_EDITOR_SCRIPT);
                return snapshot && snapshot.button && snapshot.button.disabled === false ? snapshot : null;
            },
            READY_TIMEOUT_MS,
            "「打开插件界面」 action",
        );
    } catch (error) {
        const state = await exec(READ_EDITOR_SCRIPT).catch(() => null);
        const calls = await exec(READ_CALLS_SCRIPT).catch(() => null);
        throw new Error(`${error.message} | state=${JSON.stringify(state)} calls=${JSON.stringify(calls)}`);
    }
    await screenshot("editor-phase1-ready.png");

    currentPhase = "editor click";
    const click = await exec(CLICK_EDITOR_SCRIPT);
    const editorCall = await waitFor(
        async () => {
            const calls = await exec(READ_CALLS_SCRIPT);
            const call = (calls || []).find((entry) => entry.type === "editorOpen");
            return call && call.ok === true && call.opened === true ? call : null;
        },
        20000,
        "editorOpen { ok: true, opened: true }",
    );
    state.instanceId = editorCall.instanceId || "";
    const afterOpen = await exec(READ_EDITOR_SCRIPT);
    await screenshot("editor-phase1-open.png");

    currentPhase = "editor close";
    const closed = await exec(closeEditorScript(state.instanceId));
    const closeCall = await waitFor(
        async () => {
            const calls = await exec(READ_CALLS_SCRIPT);
            const call = (calls || []).find((entry) => entry.type === "editorClose" && entry.instanceId === state.instanceId);
            return call && call.ok === true ? call : null;
        },
        15000,
        "editorClose ok",
    );
    const afterClose = await exec(READ_EDITOR_SCRIPT);
    const phase1 = { play, readyState, click, editorCall, afterOpen, closed, closeCall, afterClose };
    writeFileSync(join(ARTIFACTS, "phase1.json"), JSON.stringify(phase1, null, 2));

    // ---- Phase 2: with the host stopped, the action is not offered and nothing throws ----
    currentPhase = "host stop";
    await stopProcess(state.host, "vst-host (mid-run)");
    state.host = null;
    const hostStoppedFree = await waitPortFree(HOST_PORT, 5000);

    currentPhase = "phase2 reload";
    await send(state.socket, nextId++, "Page.reload", { ignoreCache: true });
    await waitFor(async () => (await exec(REGION_EXISTS_SCRIPT)) === true, 40000, "audio studio region after reload");
    currentPhase = "phase2 roll";
    await exec(OPEN_ROLL_SCRIPT);
    await waitFor(async () => (await exec(PICKER_EXISTS_SCRIPT)) === true, 20000, "piano-roll picker after reload");
    const beforePlay = await exec(READ_EDITOR_SCRIPT);

    currentPhase = "phase2 unlock";
    const playDown = await exec(PLAY_SCRIPT);
    if (!playDown || playDown.clicked !== true) throw new Error(`could not press Play with the host down: ${JSON.stringify(playDown)}`);
    const afterPlay = await waitFor(
        async () => {
            const snapshot = await exec(READ_EDITOR_SCRIPT);
            return snapshot && snapshot.hint.includes("插件加载失败") ? snapshot : null;
        },
        30000,
        "host-down failed hint",
    );
    await screenshot("editor-phase2.png");

    const devServerAnswers = await fetch(`${BASE}/`).then((response) => response.ok).catch(() => false);
    const phase2 = { hostStoppedFree, beforePlay, playDown, afterPlay, devServerAnswers };
    writeFileSync(join(ARTIFACTS, "phase2.json"), JSON.stringify(phase2, null, 2));

    // ------------------------------------------------------------------
    // Assertions
    // ------------------------------------------------------------------
    const results = [];
    const ok = (name, pass, detail = "") => results.push({ name, pass: !!pass, detail: String(detail) });

    ok("host scan lists the target plugin (Retrologue)", Boolean(target), `target=${target ? `${target.name} (${target.id})` : "missing"}`);
    ok("cursor project seeded with a vst3 instrument track + MIDI region", Boolean(seed?.persisted), `projectId=${seed?.projectId}`);
    ok(
        "bridge ready: 「打开插件界面」 is offered and enabled",
        readyState.button.text === "打开插件界面" && readyState.button.disabled === false,
        `button=${JSON.stringify(readyState.button)} hint=${JSON.stringify(readyState.hint)}`,
    );
    ok("action click delivered through the real UI", click.clicked === true && click.disabled === false, `click=${JSON.stringify(click)}`);
    ok(
        "openEditor resolved ok with opened:true and an instanceId",
        editorCall.ok === true && editorCall.opened === true && Boolean(editorCall.instanceId),
        `editorOpen=${JSON.stringify(editorCall)}`,
    );
    ok("no failure hint after a successful open", afterOpen.error === "" && afterOpen.button?.disabled === false, `afterOpen=${JSON.stringify(afterOpen)}`);
    ok("editorClose resolved ok for the same instance", closed.ok === true && closeCall.ok === true && closeCall.instanceId === state.instanceId, `closed=${JSON.stringify(closed)} closeCall=${JSON.stringify(closeCall)}`);
    ok("action stays ready and enabled after closing the editor", afterClose.button?.disabled === false && afterClose.error === "", `afterClose=${JSON.stringify(afterClose)}`);
    ok("host stopped and port 3211 released", hostStoppedFree === true, `portFree=${hostStoppedFree}`);
    ok("host down: action is not offered before the graph exists", beforePlay.button === null && beforePlay.hint === "", `beforePlay=${JSON.stringify(beforePlay)}`);
    ok(
        "host down: failed attach shows 「插件加载失败」 instead of the action",
        afterPlay.button === null && afterPlay.hint.includes("插件加载失败") && afterPlay.error === "",
        `afterPlay=${JSON.stringify(afterPlay)}`,
    );
    ok("no uncaught page errors", runtimeExceptions.length === 0, `runtimeExceptions=${JSON.stringify(runtimeExceptions)}`);
    // The two page loads emit React 19's deprecation warning about `element.ref` from a third-party
    // component before the piano roll mounts (tagged `[project page]` / `[phase2 reload]`), so only the
    // editor phases are asserted clean here.
    const editorConsoleErrors = consoleErrors.filter((entry) => !(entry.startsWith("[project page]") || entry.startsWith("[phase2 reload]")));
    ok("no console errors while using the action", editorConsoleErrors.length === 0, `editorConsoleErrors=${JSON.stringify(editorConsoleErrors)} all=${JSON.stringify(consoleErrors)}`);
    ok("dev server on 3000 still answers", devServerAnswers === true, `BASE=${BASE}`);

    let failed = 0;
    console.log("\nVST editor assertions (real UI -> graph bridge -> host editorOpen/editorClose -> host down):");
    for (const result of results) {
        if (result.pass) console.log(`  PASS  ${result.name}`);
        else {
            failed += 1;
            console.log(`  FAIL  ${result.name}  ->  ${result.detail}`);
        }
    }
    console.log(`\n${results.length - failed}/${results.length} assertions passed`);
    console.log(`editor: instanceId=${state.instanceId || "(none)"} opened=${editorCall?.opened} closeOk=${closed?.ok}`);
    console.log(`ready button: ${JSON.stringify(readyState.button)}`);
    console.log(`host-down state: ${JSON.stringify(afterPlay)}`);
    console.log(`console/page errors during run: runtime=${runtimeExceptions.length} console=${consoleErrors.length}`);
    console.log(`artifacts: ${ARTIFACTS}`);

    if (failed) {
        console.log(`\n--- phase 1 ---\n${JSON.stringify(phase1, null, 2)}`);
        console.log(`--- phase 2 ---\n${JSON.stringify(phase2, null, 2)}`);
        console.log(`--- host output ---\n${hostOutput.join("")}`);
        process.exitCode = 1;
    }
}

const watchdog = setTimeout(() => {
    console.error(`\nVST editor E2E hard timeout after ${HARD_TIMEOUT_MS / 1000}s — shutting down`);
    cleanup().then(() => process.exit(1));
}, HARD_TIMEOUT_MS);

run()
    .catch((error) => {
        console.error(`VST editor E2E failed: ${error.message}`);
        if (hostOutput.length) console.error(`--- host output ---\n${hostOutput.join("")}`);
        process.exitCode = 1;
    })
    .finally(async () => {
        clearTimeout(watchdog);
        const free = await cleanup();
        if (!free) process.exitCode = 1;
    });
