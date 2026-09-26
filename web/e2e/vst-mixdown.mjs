// VST3 offline mixdown end-to-end: a real Chrome page (served by the Vite dev server) imports the shared
// `audio-mixdown.ts`, builds a project with one vst3 instrument track (Retrologue) and one built-in synth
// track, and runs the offline export through the native host's `POST /render`. Proves (a) the exported
// buffer is non-silent where the VST plays, (b) the mixdown reports the vst3 track as bounced and nothing
// as skipped, (c) a control export without the vst3 region differs measurably, and (d) with the host
// stopped the export still returns a valid buffer and reports the track as skipped.
//
// Same CDP approach as `e2e/vst-graph.mjs`: real Chrome over the DevTools protocol, no Playwright/Puppeteer.
// The dev server (port 3000) is REUSED, never started or stopped by this script; the VST host and Chrome are
// started here and stopped before exit (port 3211 is checked free).
//
//   node e2e/vst-mixdown.mjs
//
// Env: E2E_BASE (default http://127.0.0.1:3000), E2E_CDP_PORT (default 9335),
//      E2E_VST_HOST (default http://127.0.0.1:3211), E2E_VST_HOST_EXE, E2E_VST_TOKEN,
//      E2E_VST_ORIGINS, E2E_VST_PLUGIN_ID, E2E_VST_MIN_RMS.

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
const TOKEN = process.env.E2E_VST_TOKEN || `vst-mixdown-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
const ORIGINS = process.env.E2E_VST_ORIGINS || "http://localhost:3000,http://127.0.0.1:3000";
const PLUGIN_ID = process.env.E2E_VST_PLUGIN_ID || "CC3695D88FE74881B46E6CCFFB291CFF"; // Retrologue
const MIN_RMS = Number(process.env.E2E_VST_MIN_RMS || 0.001);
const HARD_TIMEOUT_MS = 240000;
const ARTIFACTS = resolve("e2e", "artifacts", new Date().toISOString().replace(/[:.]/g, "-"));
const CHROME = ["C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe", "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/usr/bin/google-chrome"].find((path) => existsSync(path));

const PAGE_PRELUDE = `
    const ARGS = ${JSON.stringify({ baseUrl: HOST_URL, token: TOKEN, pluginId: PLUGIN_ID, minRms: MIN_RMS })};
    const wait = (ms) => new Promise((resolveWait) => setTimeout(resolveWait, ms));
    const report = { fatal: null, main: null, control: null, offline: null, errors: [], log: [] };
    window.addEventListener("error", (event) => report.errors.push(String((event && event.error && event.error.message) || event.message || "error")));
    window.addEventListener("unhandledrejection", (event) => report.errors.push(String((event.reason && event.reason.message) || event.reason || "unhandled rejection")));
    window.__RUNTIME_CONFIG__ = Object.assign({}, window.__RUNTIME_CONFIG__, { VST_BRIDGE_URL: ARGS.baseUrl, VST_TOKEN: ARGS.token });
    const mixdownModule = await import("/src/lib/canvas/audio-mixdown.ts");
    const midiModule = await import("/src/lib/canvas/audio-midi.ts");
    const ppqn = midiModule.AUDIO_DEFAULT_PPQN;
    const tempo = 120;
    const VST_START = 0;
    const VST_END = 0.5;
    const SYNTH_START = 1;
    const SYNTH_END = 1.5;
    const buildDoc = (withVst) => ({
        tracks: [
            { id: "t1", name: "VST", type: "instrument", gain: 1, pan: 0, mute: false, solo: false, instrument: { kind: "vst3", pluginId: ARGS.pluginId, name: "Retrologue" } },
            { id: "t2", name: "Synth", type: "instrument", gain: 1, pan: 0, mute: false, solo: false, instrument: { kind: "synth", preset: "saw-lead" } },
            { id: "master", name: "Master", type: "master", gain: 1, pan: 0, mute: false, solo: false },
        ],
        clips: [],
        regions: [
            ...(withVst ? [{ id: "r1", trackId: "t1", startTicks: 0, durationTicks: ppqn * 2, name: "", notes: [{ id: "n1", tick: 0, durationTicks: ppqn, pitch: 60, velocity: 0.9 }] }] : []),
            { id: "r2", trackId: "t2", startTicks: ppqn * 2, durationTicks: ppqn * 2, name: "", notes: [{ id: "n2", tick: 0, durationTicks: ppqn, pitch: 64, velocity: 0.9 }] },
        ],
        ppqn,
        tempo,
        masterGain: 1,
    });
    const windowStats = (audio, from, to) => {
        const rate = audio.sampleRate;
        let sum = 0;
        let peak = 0;
        let count = 0;
        for (let channelIndex = 0; channelIndex < audio.numberOfChannels; channelIndex++) {
            const channel = audio.toArray(channelIndex);
            const start = Math.max(0, Math.floor(from * rate));
            const end = Math.min(Math.ceil(to * rate), channel.length);
            for (let i = start; i < end; i += 1) {
                const value = channel[i];
                sum += value * value;
                if (Math.abs(value) > peak) peak = Math.abs(value);
                count += 1;
            }
        }
        return { samples: count, rms: count ? Math.sqrt(sum / count) : 0, peak };
    };
    const describe = (result) => ({
        bounced: result.bounced,
        skipped: result.skipped,
        duration: result.audio.duration,
        sampleRate: result.audio.sampleRate,
        channels: result.audio.numberOfChannels,
        windows: { vst: windowStats(result.audio, VST_START, VST_END), synth: windowStats(result.audio, SYNTH_START, SYNTH_END) },
    });
`;

const STEP_MAIN = `(async () => {${PAGE_PRELUDE}
    try {
        report.main = describe(await mixdownModule.renderAudioMixdown(buildDoc(true), []));
        report.control = describe(await mixdownModule.renderAudioMixdown(buildDoc(false), []));
        return report;
    } catch (error) {
        report.fatal = String((error && error.stack) || error);
        return report;
    }
})()`;

const STEP_HOST_DOWN = `(async () => {${PAGE_PRELUDE}
    try {
        report.offline = describe(await mixdownModule.renderAudioMixdown(buildDoc(true), []));
        return report;
    } catch (error) {
        report.fatal = String((error && error.stack) || error);
        return report;
    }
})()`;

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

async function waitForHost() {
    let ready = false;
    let lastError = "";
    for (let attempt = 0; attempt < 60 && !ready; attempt++) {
        if (state.host && state.host.exitCode !== null) break;
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
}

async function evaluate(socket, id, expression) {
    const evaluated = await send(socket, id, "Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    const value = evaluated?.result?.value || null;
    if (!value) {
        const detail = evaluated?.exceptionDetails?.exception?.description || evaluated?.exceptionDetails?.text || JSON.stringify(evaluated);
        throw new Error(`in-page run produced no report: ${String(detail).split("\n").slice(0, 8).join(" | ")}`);
    }
    return value;
}

async function run() {
    if (!CHROME) throw new Error("Chrome not found on this machine");
    if (!existsSync(HOST_EXE)) throw new Error(`vst-host executable not found at ${HOST_EXE} (build vst-host first)`);
    try {
        const app = await fetch(`${BASE}/`);
        if (!app.ok) throw new Error(String(app.status));
    } catch {
        throw new Error(`Dev server is not reachable at ${BASE} — start it (or set E2E_BASE) before running the VST mixdown E2E`);
    }
    if (!(await isPortFree(HOST_PORT))) throw new Error(`port ${HOST_PORT} is already in use by ${portOwner(HOST_PORT)} — stop it before running the VST mixdown E2E`);
    if (!(await isPortFree(PORT))) throw new Error(`CDP port ${PORT} is already in use by ${portOwner(PORT)} — set E2E_CDP_PORT to a free port`);

    mkdirSync(ARTIFACTS, { recursive: true });
    state.profile = join(tmpdir(), `opencanvas-vst-mixdown-e2e-${process.pid}`);
    rmSync(state.profile, { recursive: true, force: true });

    state.host = spawn(HOST_EXE, [], { env: { ...process.env, VST_HOST_TOKEN: TOKEN, VST_HOST_ORIGINS: ORIGINS }, stdio: ["ignore", "pipe", "pipe"] });
    state.host.stdout.on("data", (data) => hostOutput.push(String(data)));
    state.host.stderr.on("data", (data) => hostOutput.push(`[stderr] ${String(data)}`));
    state.chrome = spawn(CHROME, ["--headless=new", `--remote-debugging-port=${PORT}`, `--user-data-dir=${state.profile}`, "--no-first-run", "--window-size=1500,950", "--autoplay-policy=no-user-gesture-required", `${BASE}/`], { stdio: "ignore" });

    await waitForHost();

    let targets = [];
    for (let attempt = 0; attempt < 40; attempt++) {
        await delay(500);
        try {
            targets = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
            if (targets.some((target) => target.type === "page" && target.webSocketDebuggerUrl)) break;
        } catch {}
    }
    const page = targets.find((target) => target.type === "page" && target.webSocketDebuggerUrl);
    if (!page) throw new Error("Could not attach to a Chrome page target");

    state.socket = await connect(page.webSocketDebuggerUrl);
    let nextId = 1;
    await send(state.socket, nextId++, "Runtime.enable", {});
    await send(state.socket, nextId++, "Page.enable", {});
    const runtimeExceptions = [];
    state.socket.addEventListener("message", (event) => {
        const payload = JSON.parse(typeof event.data === "string" ? event.data : String(event.data));
        if (payload.method === "Runtime.exceptionThrown") runtimeExceptions.push(payload.params.exceptionDetails?.exception?.description || payload.params.exceptionDetails?.text || "exception");
    });
    await delay(1500);
    runtimeExceptions.length = 0;

    // Step 1: host is up — the export must bounce the vst3 track.
    const mainReport = await evaluate(state.socket, nextId++, STEP_MAIN);

    // Step 2: stop the host, then export again — the same track must be reported as skipped.
    await stopProcess(state.host, "vst-host");
    state.host = null;
    const portReleased = await waitPortFree(HOST_PORT, 5000);
    if (!portReleased) throw new Error(`port ${HOST_PORT} still occupied by ${portOwner(HOST_PORT)} after stopping the host`);
    console.log(`host stopped before the host-down export (port ${HOST_PORT} free)`);
    const offlineReport = await evaluate(state.socket, nextId++, STEP_HOST_DOWN);

    const report = { main: mainReport, offline: offlineReport };
    writeFileSync(join(ARTIFACTS, "vst-mixdown.json"), JSON.stringify({ base: BASE, hostUrl: HOST_URL, token: TOKEN, report, runtimeExceptions, hostOutput: hostOutput.join("") }, null, 2));
    try {
        const screenshot = await send(state.socket, nextId++, "Page.captureScreenshot", { format: "png" });
        if (screenshot?.data) writeFileSync(join(ARTIFACTS, "vst-mixdown.png"), Buffer.from(screenshot.data, "base64"));
    } catch {}

    // ------------------------------------------------------------------
    // Assertions
    // ------------------------------------------------------------------
    const results = [];
    const ok = (name, pass, detail = "") => results.push({ name, pass: !!pass, detail: String(detail) });
    const main = mainReport.main || {};
    const control = mainReport.control || {};
    const offline = offlineReport.offline || {};

    const vstWindow = main.windows?.vst || {};
    const synthWindow = main.windows?.synth || {};
    const controlVstWindow = control.windows?.vst || {};
    const controlSynthWindow = control.windows?.synth || {};
    const offlineVstWindow = offline.windows?.vst || {};
    const offlineSynthWindow = offline.windows?.synth || {};
    const bouncedIds = (main.bounced || []).map((item) => item.trackId);
    const skippedIds = (main.skipped || []).map((item) => item.trackId);
    const offlineSkippedIds = (offline.skipped || []).map((item) => item.trackId);

    if (mainReport.fatal || offlineReport.fatal) {
        ok("in-page mixdown runs completed", false, `${mainReport.fatal || ""} ${offlineReport.fatal || ""}`);
    } else {
        ok("(a) exported buffer is non-silent where the VST plays", vstWindow.rms > MIN_RMS, `vstWindow rms=${vstWindow.rms} peak=${vstWindow.peak} samples=${vstWindow.samples}`);
        ok("(a) exported buffer is non-silent where the built-in synth plays", synthWindow.rms > MIN_RMS, `synthWindow rms=${synthWindow.rms} peak=${synthWindow.peak} samples=${synthWindow.samples}`);
        ok("(b) bounced list contains the vst3 track", bouncedIds.includes("t1"), `bounced=${JSON.stringify(main.bounced)}`);
        ok("(b) skipped list is empty with the host up", (main.skipped || []).length === 0, `skipped=${JSON.stringify(main.skipped)}`);
        ok("(c) control export without the vst3 region differs where the VST played", controlVstWindow.rms < vstWindow.rms / 10 && controlVstWindow.rms < MIN_RMS, `controlVst rms=${controlVstWindow.rms} vs vst rms=${vstWindow.rms}`);
        ok("(c) control export still contains the synth part", controlSynthWindow.rms > MIN_RMS, `controlSynth rms=${controlSynthWindow.rms}`);
        ok("(d) host down: export still returns a valid buffer", Boolean(offline.duration) && offline.duration > 3 && offlineSynthWindow.rms > MIN_RMS, `duration=${offline.duration} channels=${offline.channels} synth rms=${offlineSynthWindow.rms}`);
        ok("(d) host down: the vst3 track is reported as skipped", offlineSkippedIds.includes("t1"), `skipped=${JSON.stringify(offline.skipped)}`);
        ok("(d) host down: nothing is reported as bounced", (offline.bounced || []).length === 0, `bounced=${JSON.stringify(offline.bounced)}`);
        ok("(d) host down: the vst3 window is silent", offlineVstWindow.rms < MIN_RMS, `offlineVst rms=${offlineVstWindow.rms}`);
        ok("no unhandled page errors", mainReport.errors.length === 0 && offlineReport.errors.length === 0 && runtimeExceptions.length === 0, `pageErrors=${JSON.stringify([...mainReport.errors, ...offlineReport.errors])} runtimeExceptions=${JSON.stringify(runtimeExceptions)}`);
    }

    let failed = 0;
    console.log("\nVST mixdown assertions (real browser -> renderAudioMixdown -> /render -> Retrologue):");
    for (const result of results) {
        if (result.pass) console.log(`  PASS  ${result.name}`);
        else {
            failed += 1;
            console.log(`  FAIL  ${result.name}  ->  ${result.detail}`);
        }
    }

    console.log(`\n${results.length - failed}/${results.length} assertions passed`);
    console.log(`host up:   bounced=${JSON.stringify(main.bounced)} skipped=${JSON.stringify(main.skipped)} vstRms=${vstWindow.rms} synthRms=${synthWindow.rms} duration=${main.duration}s`);
    console.log(`control:   vstRms=${controlVstWindow.rms} synthRms=${controlSynthWindow.rms}`);
    console.log(`host down: skipped=${JSON.stringify(offline.skipped)} vstRms=${offlineVstWindow.rms} synthRms=${offlineSynthWindow.rms} duration=${offline.duration}s`);
    console.log(`console/page errors during run: main=${mainReport.errors.length} offline=${offlineReport.errors.length} runtime=${runtimeExceptions.length}`);
    console.log(`artifacts: ${ARTIFACTS}`);

    if (failed || mainReport.fatal || offlineReport.fatal) {
        console.log(`--- main ---\n${JSON.stringify(main, null, 2)}`);
        console.log(`--- control ---\n${JSON.stringify(control, null, 2)}`);
        console.log(`--- host down ---\n${JSON.stringify(offline, null, 2)}`);
        console.log(`--- page errors ---\n${JSON.stringify([...mainReport.errors, ...offlineReport.errors])}`);
        console.log(`--- runtime exceptions ---\n${JSON.stringify(runtimeExceptions)}`);
        console.log(`--- host output ---\n${hostOutput.join("")}`);
        process.exitCode = 1;
    }
}

const watchdog = setTimeout(() => {
    console.error(`\nVST mixdown E2E hard timeout after ${HARD_TIMEOUT_MS / 1000}s — shutting down`);
    cleanup().then(() => process.exit(1));
}, HARD_TIMEOUT_MS);

run()
    .catch((error) => {
        console.error(`VST mixdown E2E failed: ${error.message}`);
        if (hostOutput.length) console.error(`--- host output ---\n${hostOutput.join("")}`);
        process.exitCode = 1;
    })
    .finally(async () => {
        clearTimeout(watchdog);
        const free = await cleanup();
        if (!free) process.exitCode = 1;
    });
