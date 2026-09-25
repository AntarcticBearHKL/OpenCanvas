// VST3 instrument-picker end-to-end: a real Chrome page (served by the reused Vite dev server on port
// 3000) seeds a canvas with one instrument track + one MIDI region, opens the piano roll, and drives the
// picker through the real UI. It proves that the VST3 group lists every instrument the native host
// (`vst-host/build/bin/vst-host.exe`) scans, that picking Retrologue writes `{ kind: "vst3", pluginId }`
// onto that track, and that with the host stopped the picker shows the 「本地 VST 宿主未运行」 hint
// without a single uncaught page error.
//
// Same CDP approach as `e2e/vst-graph.mjs`: real Chrome over the DevTools protocol, no Playwright. The dev
// server on port 3000 is REUSED and never started or stopped; the VST host and Chrome are started here and
// stopped before exit (port 3211 is checked free).
//
//   node e2e/vst-picker.mjs
//
// Env: E2E_BASE (default http://127.0.0.1:3000), E2E_CDP_PORT (default 9335),
//      E2E_VST_HOST (default http://127.0.0.1:3211), E2E_VST_HOST_EXE, E2E_VST_TOKEN,
//      E2E_VST_ORIGINS, E2E_VST_PLUGIN_ID, E2E_VST_INSTRUMENTS (expected instrument count, default 9).

import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { execFileSync, spawn } from "node:child_process";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";

const BASE = process.env.E2E_BASE || "http://127.0.0.1:3000";
const PORT = Number(process.env.E2E_CDP_PORT || 9335);
const HOST_URL = process.env.E2E_VST_HOST || "http://127.0.0.1:3211";
const HOST_PORT = Number(new URL(HOST_URL).port || 3211);
const HOST_EXE = process.env.E2E_VST_HOST_EXE || fileURLToPath(new URL("../../vst-host/build/bin/vst-host.exe", import.meta.url));
const TOKEN = process.env.E2E_VST_TOKEN || `vst-picker-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
const ORIGINS = process.env.E2E_VST_ORIGINS || "http://localhost:3000,http://127.0.0.1:3000";
const PLUGIN_ID = process.env.E2E_VST_PLUGIN_ID || "CC3695D88FE74881B46E6CCFFB291CFF"; // Retrologue
const EXPECTED_INSTRUMENTS = Number(process.env.E2E_VST_INSTRUMENTS || 9);
const SCAN_TIMEOUT_MS = 150000;
const HARD_TIMEOUT_MS = 300000;
const ARTIFACTS = resolve("e2e", "artifacts", new Date().toISOString().replace(/[:.]/g, "-"));
const CHROME = ["C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe", "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/usr/bin/google-chrome"].find((path) => existsSync(path));

const CANVAS_STORE_KEY = "infinite-canvas:canvas_store";
const PROJECT_NODE_ID = "vst-picker-project";
const TRACK_ID = "t1";
const REGION_ID = "r1";
const SEED_NODE = {
    id: PROJECT_NODE_ID,
    type: "audio-project",
    title: "VST picker project",
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
    const projectId = store.getState().createProject("VST picker e2e");
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
    if (!dropdown) return { open: false, options: [], groups: [], builtin: [] };
    const options = new Set();
    const groups = new Set();
    const grab = () => {
        dropdown.querySelectorAll(".ant-select-item-option").forEach((el) => options.add((el.textContent || "").trim()));
        dropdown.querySelectorAll(".ant-select-item-group").forEach((el) => groups.add((el.textContent || "").trim()));
    };
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
    const midi = await import("/src/lib/canvas/audio-midi.ts");
    const i18n = (await import("/src/i18n/index.ts")).default;
    return { open: true, options: [...options], groups: [...groups], builtin: midi.AUDIO_INSTRUMENT_PRESETS.map((preset) => i18n.t(preset.labelKey)) };
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
    const classes = target.className;
    target.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    target.dispatchEvent(new MouseEvent("mousemove", { bubbles: true }));
    target.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    target.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    target.click();
    await wait(300);
    return { clicked: true, text, classes };
})()`;

const readTrackScript = (projectId) => `(async () => {
    const ARGS = ${JSON.stringify({ projectId, storageKey: CANVAS_STORE_KEY })};
    const storage = (await import("/src/lib/localforage-storage.ts")).localForageStorage;
    const raw = await storage.getItem(ARGS.storageKey);
    const parsed = raw ? JSON.parse(raw) : null;
    const projects = (parsed && parsed.state && parsed.state.projects) || [];
    const project = projects.find((item) => item.id === ARGS.projectId);
    const node = project ? project.nodes.find((item) => item.id === ${JSON.stringify(PROJECT_NODE_ID)}) : null;
    const track = node ? ((node.metadata && node.metadata.audioTracks) || []).find((item) => item.id === ${JSON.stringify(TRACK_ID)}) : null;
    return { source: "storage", projectFound: Boolean(project), instrument: track ? track.instrument || null : null };
})()`;

const READ_SELECT_TEXT_SCRIPT = `(() => {
    const picker = document.querySelector("[data-roll-instrument]");
    if (!picker) return "";
    const item = picker.querySelector(".ant-select-selection-item") || picker.querySelector(".ant-select-content-value") || picker.querySelector(".ant-select-selector");
    return item ? (item.textContent || "").trim() : (picker.textContent || "").trim();
})()`;

const READ_HINT_SCRIPT = `(() => {
    const picker = document.querySelector("[data-roll-instrument]");
    if (!picker) return { shown: false, text: "" };
    const text = picker.textContent || "";
    return { shown: text.includes("本地 VST 宿主未运行"), text: text.trim() };
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

const state = { host: null, chrome: null, socket: null, profile: "" };
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

async function cleanup() {
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
        throw new Error(`Dev server is not reachable at ${BASE} — start it (or set E2E_BASE) before running the VST picker E2E`);
    }
    if (!(await isPortFree(HOST_PORT))) throw new Error(`port ${HOST_PORT} is already in use by ${portOwner(HOST_PORT)} — stop it before running the VST picker E2E`);
    if (!(await isPortFree(PORT))) throw new Error(`CDP port ${PORT} is already in use by ${portOwner(PORT)} — set E2E_CDP_PORT to a free port`);

    mkdirSync(ARTIFACTS, { recursive: true });
    state.profile = join(tmpdir(), `opencanvas-vst-picker-e2e-${process.pid}`);
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

    // Node-side scan warms the host's own cache and supplies the expected picker contents.
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

    // ---- Phase 1: seed a project, open the roll, list and pick a VST3 ----
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
            return snapshot && snapshot.open && snapshot.options.some((option) => option.includes(target.name)) ? snapshot : null;
        },
        SCAN_TIMEOUT_MS,
        "VST3 scan options",
    );
    await screenshot("picker-phase1-open.png");

    currentPhase = "picker click";
    const clicked = await exec(clickOptionScript(target ? target.name : PLUGIN_ID));
    const readTrackExpression = readTrackScript(seed.projectId);
    let trackState = null;
    try {
        trackState = await waitFor(
            async () => {
                const value = await exec(readTrackExpression);
                return value && value.instrument && value.instrument.kind === "vst3" ? value : null;
            },
            15000,
            "track instrument update",
        );
    } catch (error) {
        trackState = { timedOut: error.message, last: await exec(readTrackExpression).catch(() => null) };
    }
    const selectText = await waitFor(
        async () => {
            const text = await exec(READ_SELECT_TEXT_SCRIPT);
            return text && target && text.includes(target.name) ? text : null;
        },
        10000,
        "picker selection text",
    ).catch(() => "");
    await screenshot("picker-phase1.png");
    const phase1 = { collected, clicked, trackState, selectText };
    writeFileSync(join(ARTIFACTS, "phase1.json"), JSON.stringify(phase1, null, 2));

    // ---- Phase 2: with the host stopped, the picker degrades to the host-down hint ----
    currentPhase = "host stop";
    await stopProcess(state.host, "vst-host (mid-run)");
    state.host = null;
    const hostStoppedFree = await waitPortFree(HOST_PORT, 5000);

    await delay(800);
    currentPhase = "phase2 reload";
    await send(state.socket, nextId++, "Page.reload", { ignoreCache: true });
    await waitFor(async () => (await exec(REGION_EXISTS_SCRIPT)) === true, 40000, "audio studio region after reload");
    currentPhase = "phase2 roll";
    await exec(OPEN_ROLL_SCRIPT);
    await waitFor(async () => (await exec(PICKER_EXISTS_SCRIPT)) === true, 20000, "piano-roll picker after reload");
    currentPhase = "phase2 hint";
    const hint = await waitFor(
        async () => {
            const value = await exec(READ_HINT_SCRIPT);
            return value && value.shown ? value : null;
        },
        30000,
        "host-down hint",
    );
    const pickerText = await exec(READ_HINT_SCRIPT);
    await screenshot("picker-phase2.png");

    const devServerAnswers = await fetch(`${BASE}/`).then((response) => response.ok).catch(() => false);
    const phase2 = { hostStoppedFree, hint, pickerText, devServerAnswers };
    writeFileSync(join(ARTIFACTS, "phase2.json"), JSON.stringify(phase2, null, 2));

    // ------------------------------------------------------------------
    // Assertions
    // ------------------------------------------------------------------
    const results = [];
    const ok = (name, pass, detail = "") => results.push({ name, pass: !!pass, detail: String(detail) });
    const builtin = collected?.builtin || [];
    const options = collected?.options || [];
    const groups = collected?.groups || [];
    const vstOptions = options.filter((option) => !builtin.includes(option));
    const missing = instruments.filter((plugin) => !vstOptions.some((option) => option.includes(plugin.name))).map((plugin) => plugin.name);
    const missingBuiltin = builtin.filter((label) => !options.includes(label));

    ok("host scan returns 9 instruments", instruments.length === EXPECTED_INSTRUMENTS, `${instruments.length}: ${instruments.map((plugin) => plugin.name).join(", ")}`);
    ok("host scan includes the target plugin (Retrologue)", Boolean(target), `target=${target ? `${target.name} (${target.id})` : "missing"}`);
    ok("picker groups built-in presets and VST3 plugins", groups.includes("内置音源") && groups.includes("VST3 插件"), `groups=${JSON.stringify(groups)}`);
    ok("picker keeps every built-in preset option", builtin.length === 4 && missingBuiltin.length === 0, `missing=${JSON.stringify(missingBuiltin)}`);
    ok(
        `picker lists all ${instruments.length} scanned VST3 instruments`,
        vstOptions.length === instruments.length && missing.length === 0,
        `pickerVstOptions=${vstOptions.length} missingNames=${JSON.stringify(missing)}`,
    );
    ok(
        "choosing Retrologue writes { kind: vst3, pluginId } onto the track",
        trackState?.instrument?.kind === "vst3" && trackState.instrument.pluginId === PLUGIN_ID && trackState.instrument.name === target?.name,
        `instrument=${JSON.stringify(trackState?.instrument || null)} selectText=${JSON.stringify(selectText)} clicked=${JSON.stringify(clicked)}`,
    );
    ok("host stopped and port 3211 released", hostStoppedFree === true, `portFree=${hostStoppedFree}`);
    ok("host down: picker shows 「本地 VST 宿主未运行」", hint.shown === true, `pickerText=${JSON.stringify(hint.text)}`);
    ok("host down: picker still shows the saved VST3 name", Boolean(target) && pickerText.text.includes(target.name), `pickerText=${JSON.stringify(pickerText.text)}`);
    ok("no uncaught page errors", runtimeExceptions.length === 0, `runtimeExceptions=${JSON.stringify(runtimeExceptions)}`);
    // The two page loads emit React 19's deprecation warning about `element.ref` from a third-party
    // component before the piano roll mounts (tagged `[project page]` / `[phase2 reload]`), so only the
    // picker phases are asserted clean here.
    const pickerConsoleErrors = consoleErrors.filter((entry) => !(entry.startsWith("[project page]") || entry.startsWith("[phase2 reload]")));
    ok("no console errors while using the picker", pickerConsoleErrors.length === 0, `pickerConsoleErrors=${JSON.stringify(pickerConsoleErrors)} all=${JSON.stringify(consoleErrors)}`);
    ok("dev server on 3000 still answers", devServerAnswers === true, `BASE=${BASE}`);

    let failed = 0;
    console.log("\nVST picker assertions (real UI -> picker -> host scan -> track patch -> host down):");
    for (const result of results) {
        if (result.pass) console.log(`  PASS  ${result.name}`);
        else {
            failed += 1;
            console.log(`  FAIL  ${result.name}  ->  ${result.detail}`);
        }
    }
    console.log(`\n${results.length - failed}/${results.length} assertions passed`);
    console.log(`scanned instruments: ${instruments.map((plugin) => plugin.name).join(", ")}`);
    console.log(`picker options: builtin=${builtin.length} vst3=${vstOptions.length}`);
    console.log(`host down picker text: ${JSON.stringify(hint.text)}`);
    console.log(`console/page errors during run: runtime=${runtimeExceptions.length} console=${consoleErrors.length}`);
    console.log(`artifacts: ${ARTIFACTS}`);

    if (failed) {
        console.log(`\n--- collected ---\n${JSON.stringify(collected, null, 2)}`);
        console.log(`--- phase 1 ---\n${JSON.stringify(phase1, null, 2)}`);
        console.log(`--- phase 2 ---\n${JSON.stringify(phase2, null, 2)}`);
        console.log(`--- host output ---\n${hostOutput.join("")}`);
        process.exitCode = 1;
    }
}

const watchdog = setTimeout(() => {
    console.error(`\nVST picker E2E hard timeout after ${HARD_TIMEOUT_MS / 1000}s — shutting down`);
    cleanup().then(() => process.exit(1));
}, HARD_TIMEOUT_MS);

run()
    .catch((error) => {
        console.error(`VST picker E2E failed: ${error.message}`);
        if (hostOutput.length) console.error(`--- host output ---\n${hostOutput.join("")}`);
        process.exitCode = 1;
    })
    .finally(async () => {
        clearTimeout(watchdog);
        const free = await cleanup();
        if (!free) process.exitCode = 1;
    });
