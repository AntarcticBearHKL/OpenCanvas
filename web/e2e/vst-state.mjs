// VST3 plug-in state-persistence end-to-end: a real Chrome page (served by the reused Vite dev server on
// port 3000) seeds a canvas with one built-in-synth instrument track + one MIDI region, opens the piano
// roll and picks Retrologue through the real picker, which must assign a `stateKey` to the track. It then
// unlocks the audio context, opens the plug-in editor through the real toggle and closes it again — the
// close is the production "final save" trigger, so a state blob must land in localforage. The stored blob
// is compared with a fresh `getState`, `collectMediaStorageKeys` must see it from a document that contains
// that track, and after a full page reload the re-attach must call `setState` with exactly the same blob.
//
// Same CDP approach as `e2e/vst-editor.mjs`: real Chrome over the DevTools protocol, no Playwright. The
// dev server on port 3000 is REUSED and never started or stopped; the VST host and Chrome are started
// here and stopped before exit (port 3211 is checked free, and the editor is closed first).
//
//   node e2e/vst-state.mjs
//
// Env: E2E_BASE (default http://127.0.0.1:3000), E2E_CDP_PORT (default 9337),
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
const PORT = Number(process.env.E2E_CDP_PORT || 9337);
const HOST_URL = process.env.E2E_VST_HOST || "http://127.0.0.1:3211";
const HOST_PORT = Number(new URL(HOST_URL).port || 3211);
const HOST_EXE = process.env.E2E_VST_HOST_EXE || fileURLToPath(new URL("../../vst-host/build/bin/vst-host.exe", import.meta.url));
const TOKEN = process.env.E2E_VST_TOKEN || `vst-state-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
const ORIGINS = process.env.E2E_VST_ORIGINS || "http://localhost:3000,http://127.0.0.1:3000";
const PLUGIN_ID = process.env.E2E_VST_PLUGIN_ID || "CC3695D88FE74881B46E6CCFFB291CFF"; // Retrologue
const PLUGIN_NAME = process.env.E2E_VST_PLUGIN_NAME || "Retrologue";
const SCAN_TIMEOUT_MS = 150000;
const HARD_TIMEOUT_MS = 420000;
const ARTIFACTS = resolve("e2e", "artifacts", new Date().toISOString().replace(/[:.]/g, "-"));
const CHROME = ["C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe", "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/usr/bin/google-chrome"].find((path) => existsSync(path));

const CANVAS_STORE_KEY = "infinite-canvas:canvas_store";
const PROJECT_NODE_ID = "vst-state-project";
const TRACK_ID = "t1";
const REGION_ID = "r1";
const SEED_NODE = {
    id: PROJECT_NODE_ID,
    type: "audio-project",
    title: "VST state project",
    position: { x: 80, y: 80 },
    width: 900,
    height: 560,
    metadata: {
        audioPpqn: 960,
        audioTempo: 120,
        audioTracks: [
            { id: TRACK_ID, name: "VST track", type: "instrument", gain: 1, pan: 0, mute: false, solo: false, instrument: { kind: "synth", preset: "saw-lead" } },
            { id: "master", name: "Master", type: "master", gain: 1, pan: 0, mute: false, solo: false },
        ],
        audioMidiRegions: [{ id: REGION_ID, trackId: TRACK_ID, startTicks: 0, durationTicks: 960 * 8, name: "VST region", notes: [{ id: "n1", tick: 0, durationTicks: 960 * 4, pitch: 60, velocity: 0.8 }] }],
    },
};

// ---------------------------------------------------------------------------
// In-page scripts (executed over CDP; no npm browser deps)
// ---------------------------------------------------------------------------

// Installed on every new document via Page.addScriptToEvaluateOnNewDocument, so the `load` that the
// graph performs, the editorOpen/editorClose the UI performs and the `setState` restore are observable
// from Node. Only setState bodies keep their (large) state string; everything else stays small.
const RECORDER_SOURCE = `(() => {
    const calls = [];
    window.__vstStateCalls = calls;
    const original = window.fetch.bind(window);
    window.fetch = async (input, init) => {
        const response = await original(input, init);
        try {
            const url = typeof input === "string" ? input : (input && input.url) || "";
            if (url.indexOf("/rpc") >= 0) {
                let request = null;
                if (init && typeof init.body === "string") request = JSON.parse(init.body);
                const payload = await response.clone().json().catch(() => null);
                calls.push({
                    type: request && request.type,
                    instanceId: (request && request.instanceId) || (payload && payload.instanceId),
                    state: request && request.type === "setState" ? request.state : undefined,
                    ok: payload && payload.ok === true,
                    opened: payload && payload.opened === true,
                });
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
    const projectId = store.getState().createProject("VST state e2e");
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

const OPEN_DROPDOWN_SCRIPT = `(() => {
    const combo = document.querySelector("[data-roll-instrument] [role='combobox']");
    if (!combo) return false;
    combo.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, view: window }));
    combo.focus();
    return true;
})()`;

const COLLECT_OPTIONS_SCRIPT = `(async () => {
    const wait = (ms) => new Promise((resolveWait) => setTimeout(resolveWait, ms));
    const dropdowns = [...document.querySelectorAll(".ant-select-dropdown")];
    const dropdown = dropdowns.find((el) => el.offsetParent !== null && el.querySelector(".ant-select-item-option"));
    if (!dropdown) return { open: false, options: [] };
    const options = new Set();
    const grab = () => dropdown.querySelectorAll(".ant-select-item-option").forEach((el) => options.add((el.textContent || "").trim()));
    grab();
    let scroller = null;
    const first = dropdown.querySelector(".ant-select-item-option");
    for (let node = first; node && !scroller; node = node.parentElement) {
        if (node.scrollHeight > node.clientHeight + 4) scroller = node;
    }
    if (scroller) {
        const step = Math.max(32, scroller.clientHeight - 24);
        for (let top = 0; top <= scroller.scrollHeight; top += step) {
            scroller.scrollTop = top;
            await wait(70);
            grab();
        }
        scroller.scrollTop = 0;
        await wait(70);
        grab();
    }
    return { open: true, options: [...options] };
})()`;

const clickOptionScript = (pluginName) => `(async () => {
    const ARGS = ${JSON.stringify({ pluginName })};
    const wait = (ms) => new Promise((resolveWait) => setTimeout(resolveWait, ms));
    const dropdowns = [...document.querySelectorAll(".ant-select-dropdown")];
    const dropdown = dropdowns.find((el) => el.offsetParent !== null && el.querySelector(".ant-select-item-option"));
    if (!dropdown) return { clicked: false, reason: "dropdown is not open" };
    const find = () => [...dropdown.querySelectorAll(".ant-select-item-option")].find((el) => (el.textContent || "").includes(ARGS.pluginName));
    let target = find();
    let scroller = null;
    const first = dropdown.querySelector(".ant-select-item-option");
    for (let node = first; node && !scroller; node = node.parentElement) {
        if (node.scrollHeight > node.clientHeight + 4) scroller = node;
    }
    if (!target && scroller) {
        const step = Math.max(32, scroller.clientHeight - 24);
        for (let top = 0; top <= scroller.scrollHeight && !target; top += step) {
            scroller.scrollTop = top;
            await wait(80);
            target = find();
        }
    }
    if (!target) return { clicked: false, reason: "option not found" };
    const text = (target.textContent || "").trim();
    target.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    target.dispatchEvent(new MouseEvent("mousemove", { bubbles: true }));
    target.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    target.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    target.click();
    await wait(300);
    return { clicked: true, text };
})()`;

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

const READ_CALLS_SCRIPT = `window.__vstStateCalls || []`;

const readTrackScript = (projectId) => `(async () => {
    const ARGS = ${JSON.stringify({ projectId, storageKey: CANVAS_STORE_KEY })};
    const storage = (await import("/src/lib/localforage-storage.ts")).localForageStorage;
    const raw = await storage.getItem(ARGS.storageKey);
    const parsed = raw ? JSON.parse(raw) : null;
    const projects = (parsed && parsed.state && parsed.state.projects) || [];
    const project = projects.find((item) => item.id === ARGS.projectId);
    const node = project ? project.nodes.find((item) => item.id === ${JSON.stringify(PROJECT_NODE_ID)}) : null;
    const track = node ? ((node.metadata && node.metadata.audioTracks) || []).find((item) => item.id === ${JSON.stringify(TRACK_ID)}) : null;
    return { projectFound: Boolean(project), instrument: track ? track.instrument || null : null };
})()`;

const captureStateScript = (instanceId) => `(async () => {
    try {
        const client = (await import("/src/lib/canvas/audio-vst.ts")).createVstClient();
        const state = await client.getState(${JSON.stringify(instanceId)});
        return { ok: true, kind: typeof state, length: typeof state === "string" ? state.length : 0, state: typeof state === "string" ? state : null };
    } catch (error) {
        return { ok: false, error: String((error && error.message) || error) };
    }
})()`;

const readBlobScript = (stateKey) => `(async () => {
    const storage = await import("/src/services/file-storage.ts");
    const blob = await storage.readVstState(${JSON.stringify(stateKey)});
    return { present: blob !== null, length: typeof blob === "string" ? blob.length : 0 };
})()`;

const readBlobValueScript = (stateKey) => `(async () => {
    const storage = await import("/src/services/file-storage.ts");
    const blob = await storage.readVstState(${JSON.stringify(stateKey)});
    return typeof blob === "string" ? blob : null;
})()`;

const cleanupReachScript = (stateKey) => `(async () => {
    const storage = await import("/src/services/file-storage.ts");
    const key = storage.vstStateStorageKey(${JSON.stringify(stateKey)});
    const instrument = { kind: "vst3", pluginId: ${JSON.stringify(PLUGIN_ID)}, stateKey: ${JSON.stringify(stateKey)} };
    const doc = { projects: [{ id: "p", nodes: [{ id: ${JSON.stringify(PROJECT_NODE_ID)}, type: "audio-project", metadata: { audioTracks: [{ id: ${JSON.stringify(TRACK_ID)}, instrument }] } }] }] };
    return {
        key,
        collected: storage.collectMediaStorageKeys(doc).has(key),
        emptyDoc: storage.collectMediaStorageKeys({ projects: [] }).has(key),
        reachableKey: storage.vstStateStorageKey(${JSON.stringify(stateKey)}) === key,
    };
})()`;

const READ_RESTORE_SCRIPT = `(() => {
    const calls = window.__vstStateCalls || [];
    const match = calls.find((entry) => entry.type === "setState");
    if (!match) return { found: false };
    return { found: true, ok: match.ok === true, instanceId: match.instanceId, length: typeof match.state === "string" ? match.state.length : 0, state: match.state };
})()`;

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

// Belt and braces: the UI already closed the editor, but if anything failed the host is asked directly
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
    const devServerAnswers = await fetch(`${BASE}/`).then((response) => response.ok).catch(() => false);
    console.log(`dev server on ${new URL(BASE).port} still answers after cleanup: ${devServerAnswers ? "yes" : "NO"}`);
    return free && devServerAnswers;
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
        throw new Error(`Dev server is not reachable at ${BASE} — start it (or set E2E_BASE) before running the VST state E2E`);
    }
    if (!(await isPortFree(HOST_PORT))) throw new Error(`port ${HOST_PORT} is already in use by ${portOwner(HOST_PORT)} — stop it before running the VST state E2E`);
    if (!(await isPortFree(PORT))) throw new Error(`CDP port ${PORT} is already in use by ${portOwner(PORT)} — set E2E_CDP_PORT to a free port`);

    mkdirSync(ARTIFACTS, { recursive: true });
    state.profile = join(tmpdir(), `opencanvas-vst-state-e2e-${process.pid}`);
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

    // Node-side scan warms the host's own cache so the in-page picker scan is not the first load.
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
            if (Date.now() > deadline) throw new Error(`${label} timed out (last: ${JSON.stringify(last).slice(0, 400)})`);
            await delay(250);
        }
    };
    const screenshot = async (name) => {
        try {
            const image = await send(state.socket, nextId++, "Page.captureScreenshot", { format: "png" });
            if (image?.data) writeFileSync(join(ARTIFACTS, name), Buffer.from(image.data, "base64"));
        } catch {}
    };

    // ---- Phase 1: seed, pick Retrologue, capture the stateKey the picker assigns ----
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

    currentPhase = "picker dropdown";
    await exec(OPEN_DROPDOWN_SCRIPT);
    const collected = await waitFor(
        async () => {
            const snapshot = await exec(COLLECT_OPTIONS_SCRIPT);
            return snapshot && snapshot.open && snapshot.options.some((option) => option.includes(target?.name || PLUGIN_NAME)) ? snapshot : null;
        },
        SCAN_TIMEOUT_MS,
        "VST3 scan options",
    );
    await screenshot("state-phase1-picker.png");

    currentPhase = "picker click";
    const clicked = await exec(clickOptionScript(target ? target.name : PLUGIN_NAME));
    const readTrackExpression = readTrackScript(seed.projectId);
    const trackState = await waitFor(
        async () => {
            const value = await exec(readTrackExpression);
            return value && value.instrument && value.instrument.kind === "vst3" && typeof value.instrument.stateKey === "string" && value.instrument.stateKey.length > 0 ? value : null;
        },
        15000,
        "track instrument with stateKey",
    );
    const stateKey = trackState.instrument.stateKey;
    await screenshot("state-phase1-selected.png");

    // ---- Phase 2: attach, open/close the editor through the UI (the close is the final-save trigger) ----
    currentPhase = "unlock audio";
    const play = await exec(PLAY_SCRIPT);
    if (!play || play.clicked !== true || play.disabled === true) throw new Error(`could not press Play to unlock the audio context: ${JSON.stringify(play)}`);

    currentPhase = "bridge ready";
    const readyState = await waitFor(
        async () => {
            const snapshot = await exec(READ_EDITOR_SCRIPT);
            return snapshot && snapshot.button && snapshot.button.disabled === false ? snapshot : null;
        },
        90000,
        "「打开插件界面」 action",
    );

    currentPhase = "editor open";
    const openClick = await exec(CLICK_EDITOR_SCRIPT);
    const editorCall = await waitFor(
        async () => {
            const calls = await exec(READ_CALLS_SCRIPT);
            const call = (calls || []).find((entry) => entry.type === "editorOpen");
            return call && call.ok === true && call.opened === true && call.instanceId ? call : null;
        },
        20000,
        "editorOpen with an instanceId",
    );
    state.instanceId = editorCall.instanceId || "";
    const afterOpen = await waitFor(
        async () => {
            const snapshot = await exec(READ_EDITOR_SCRIPT);
            return snapshot && snapshot.button && snapshot.button.text === "关闭插件界面" && snapshot.button.disabled === false ? snapshot : null;
        },
        15000,
        "toggle switched to 「关闭插件界面」",
    );
    await screenshot("state-phase2-open.png");

    currentPhase = "editor close + final save";
    const closeClick = await exec(CLICK_EDITOR_SCRIPT);
    const closeCall = await waitFor(
        async () => {
            const calls = await exec(READ_CALLS_SCRIPT);
            const call = (calls || []).find((entry) => entry.type === "editorClose" && entry.instanceId === state.instanceId);
            return call && call.ok === true ? call : null;
        },
        20000,
        "editorClose ok",
    );
    const savedBlob = await waitFor(
        async () => {
            const value = await exec(readBlobScript(stateKey));
            return value && value.present && value.length > 0 ? value : null;
        },
        30000,
        "final-save blob in localforage",
    );
    const afterClose = await exec(READ_EDITOR_SCRIPT);
    await screenshot("state-phase2-closed.png");

    currentPhase = "capture + cleanup reachability";
    const captured = await exec(captureStateScript(state.instanceId));
    const storedBlob = await exec(readBlobValueScript(stateKey));
    const cleanupReach = await exec(cleanupReachScript(stateKey));
    const phase2 = { play, readyState, openClick, editorCall, afterOpen, closeClick, closeCall, savedBlob, afterClose, captured: { ok: captured?.ok, kind: captured?.kind, length: captured?.length }, cleanupReach };
    writeFileSync(join(ARTIFACTS, "phase2.json"), JSON.stringify(phase2, null, 2));

    // ---- Phase 3: reload and prove the re-attach restores the exact blob ----
    currentPhase = "reload";
    await send(state.socket, nextId++, "Page.reload", { ignoreCache: true });
    await waitFor(async () => (await exec(REGION_EXISTS_SCRIPT)) === true, 40000, "audio studio region after reload");

    currentPhase = "reload attach";
    const playAgain = await exec(PLAY_SCRIPT);
    if (!playAgain || playAgain.clicked !== true) throw new Error(`could not press Play after reload: ${JSON.stringify(playAgain)}`);
    const restored = await waitFor(
        async () => {
            const value = await exec(READ_RESTORE_SCRIPT);
            return value && value.found && value.ok ? value : null;
        },
        120000,
        "restore setState call",
    );
    await delay(500);
    const reloadCalls = await exec(READ_CALLS_SCRIPT);
    const reloadLoad = [...(reloadCalls || [])].reverse().find((entry) => entry.type === "load" && entry.instanceId);
    const reloadGetState = (reloadCalls || []).filter((entry) => entry.type === "getState").length;
    await screenshot("state-phase3-restored.png");
    const phase3 = { playAgain, restored: { ok: restored.ok, instanceId: restored.instanceId, length: restored.length }, reloadLoad, reloadGetState, calls: (reloadCalls || []).map((entry) => ({ type: entry.type, instanceId: entry.instanceId, ok: entry.ok, stateLength: typeof entry.state === "string" ? entry.state.length : undefined })) };
    writeFileSync(join(ARTIFACTS, "phase3.json"), JSON.stringify(phase3, null, 2));

    const devServerAnswers = await fetch(`${BASE}/`).then((response) => response.ok).catch(() => false);

    // ------------------------------------------------------------------
    // Assertions
    // ------------------------------------------------------------------
    const results = [];
    const ok = (name, pass, detail = "") => results.push({ name, pass: !!pass, detail: String(detail) });
    const options = collected?.options || [];

    ok("host scan lists the target plugin (Retrologue)", Boolean(target), `target=${target ? `${target.name} (${target.id})` : "missing"}`);
    ok("seed persisted a synth-instrument project + MIDI region", Boolean(seed?.persisted), `projectId=${seed?.projectId}`);
    ok("picker lists the target VST3 instrument", options.some((option) => option.includes(target?.name || PLUGIN_NAME)), `options=${JSON.stringify(options.slice(0, 12))}`);
    ok("picker click delivered", clicked.clicked === true, `clicked=${JSON.stringify(clicked)}`);
    ok(
        "picking Retrologue writes { kind: vst3, pluginId, name, stateKey } onto the track",
        trackState.instrument.pluginId === PLUGIN_ID && trackState.instrument.name === (target?.name || PLUGIN_NAME) && typeof stateKey === "string" && stateKey.length > 0,
        `instrument=${JSON.stringify(trackState.instrument)}`,
    );
    ok("bridge ready: editor toggle offered and enabled", readyState.button.text === "打开插件界面" && readyState.button.disabled === false, `button=${JSON.stringify(readyState.button)}`);
    ok(
        "openEditor resolved ok with opened:true and an instanceId",
        editorCall.ok === true && editorCall.opened === true && Boolean(state.instanceId),
        `editorOpen=${JSON.stringify({ ok: editorCall.ok, opened: editorCall.opened, instanceId: state.instanceId })}`,
    );
    ok("toggle switched to 「关闭插件界面」 after opening", afterOpen.button.text === "关闭插件界面" && afterOpen.error === "", `afterOpen=${JSON.stringify(afterOpen)}`);
    ok("editorClose resolved ok for the same instance", closeCall.ok === true && closeCall.instanceId === state.instanceId, `closeCall=${JSON.stringify({ ok: closeCall.ok, instanceId: closeCall.instanceId })}`);
    ok("closing the editor final-saved a blob under vst-state:<stateKey>", savedBlob.present === true && savedBlob.length > 0, `savedBlob=${JSON.stringify(savedBlob)} key=${cleanupReach?.key}`);
    ok("a fresh getState returns a non-empty base64 state", captured?.ok === true && captured.kind === "string" && captured.length > 0, `captured=${JSON.stringify({ ok: captured?.ok, kind: captured?.kind, length: captured?.length })}`);
    ok("stored blob byte-identical to a fresh getState", typeof storedBlob === "string" && storedBlob === captured?.state, `stored=${storedBlob?.length} captured=${captured?.length}`);
    ok(
        "collectMediaStorageKeys reaches the state blob from a doc containing that track",
        cleanupReach.collected === true && cleanupReach.reachableKey === true && cleanupReach.emptyDoc === false,
        `cleanupReach=${JSON.stringify(cleanupReach)}`,
    );
    ok(
        "after reload the re-attach calls setState with the exact stored blob",
        restored.ok === true && Boolean(storedBlob) && restored.length === storedBlob.length && restored.state === storedBlob,
        `restored=${JSON.stringify({ ok: restored.ok, instanceId: restored.instanceId, length: restored.length })} stored=${storedBlob?.length}`,
    );
    ok("restored setState belongs to the reloaded attach instance", Boolean(reloadLoad) && restored.instanceId === reloadLoad.instanceId, `load=${JSON.stringify(reloadLoad)} setState=${restored.instanceId}`);
    ok("no getState polling on a page where no editor was opened", reloadGetState === 0, `reloadGetState=${reloadGetState}`);
    ok("no uncaught page errors", runtimeExceptions.length === 0, `runtimeExceptions=${JSON.stringify(runtimeExceptions)}`);
    // The two page loads emit React 19's deprecation warning about `element.ref` from a third-party
    // component before the piano roll mounts (tagged `[project page]` / `[reload]`), so only the
    // interaction phases are asserted clean here.
    const interactionConsoleErrors = consoleErrors.filter((entry) => !(entry.startsWith("[project page]") || entry.startsWith("[reload]")));
    ok("no console errors while using the actions", interactionConsoleErrors.length === 0, `interactionConsoleErrors=${JSON.stringify(interactionConsoleErrors)} all=${JSON.stringify(consoleErrors.slice(0, 5))}`);
    ok("dev server on 3000 still answers", devServerAnswers === true, `BASE=${BASE}`);

    let failed = 0;
    console.log("\nVST state assertions (picker -> stateKey -> editor close final save -> cleanup reachability -> reload restore):");
    for (const result of results) {
        if (result.pass) console.log(`  PASS  ${result.name}`);
        else {
            failed += 1;
            console.log(`  FAIL  ${result.name}  ->  ${result.detail}`);
        }
    }
    console.log(`\n${results.length - failed}/${results.length} assertions passed`);
    console.log(`stateKey: ${stateKey}  stored blob: ${storedBlob?.length ?? 0} chars  instanceId: ${state.instanceId || "(none)"}`);
    console.log(`captured getState: ${captured?.length ?? 0} chars  restored setState: ${restored.length} chars  reload load instance: ${reloadLoad?.instanceId || "(none)"}`);
    console.log(`console/page errors during run: runtime=${runtimeExceptions.length} console=${consoleErrors.length}`);
    console.log(`artifacts: ${ARTIFACTS}`);

    if (failed) {
        console.log(`\n--- phase2 ---\n${JSON.stringify(phase2, null, 2)}`);
        console.log(`--- phase3 ---\n${JSON.stringify(phase3, null, 2)}`);
        console.log(`--- host output ---\n${hostOutput.join("")}`);
        process.exitCode = 1;
    }
}

const watchdog = setTimeout(() => {
    console.error(`\nVST state E2E hard timeout after ${HARD_TIMEOUT_MS / 1000}s — shutting down`);
    cleanup().then(() => process.exit(1));
}, HARD_TIMEOUT_MS);

run()
    .catch((error) => {
        console.error(`VST state E2E failed: ${error.message}`);
        if (hostOutput.length) console.error(`--- host output ---\n${hostOutput.join("")}`);
        process.exitCode = 1;
    })
    .finally(async () => {
        clearTimeout(watchdog);
        const clean = await cleanup();
        if (!clean) process.exitCode = 1;
    });
