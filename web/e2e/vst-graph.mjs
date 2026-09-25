// VST3-in-the-graph end-to-end: a real Chrome page (served by the Vite dev server) imports the shared
// `audio-graph.ts` builder, builds a minimal project whose instrument track is a vst3 (Retrologue), starts
// the transport, and proves that the note scheduled by the graph reaches the master output as real audio
// from the native host (`vst-host/build/bin/vst-host.exe`). A second graph with a plain synth instrument
// proves the non-vst3 path is untouched.
//
// Same CDP approach as `e2e/vst-bridge.mjs`: real Chrome over the DevTools protocol, no Playwright/Puppeteer.
// The dev server (port 3000) is REUSED, never started or stopped by this script; the VST host and Chrome are
// started here and stopped before exit (port 3211 is checked free).
//
//   node e2e/vst-graph.mjs
//
// Env: E2E_BASE (default http://127.0.0.1:3000), E2E_CDP_PORT (default 9334),
//      E2E_VST_HOST (default http://127.0.0.1:3211), E2E_VST_HOST_EXE, E2E_VST_TOKEN,
//      E2E_VST_ORIGINS, E2E_VST_PLUGIN_ID, E2E_RMS_WINDOW_MS.

import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { execFileSync, spawn } from "node:child_process";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";

const BASE = process.env.E2E_BASE || "http://127.0.0.1:3000";
const PORT = Number(process.env.E2E_CDP_PORT || 9334);
const HOST_URL = process.env.E2E_VST_HOST || "http://127.0.0.1:3211";
const HOST_PORT = Number(new URL(HOST_URL).port || 3211);
const HOST_EXE = process.env.E2E_VST_HOST_EXE || fileURLToPath(new URL("../../vst-host/build/bin/vst-host.exe", import.meta.url));
const TOKEN = process.env.E2E_VST_TOKEN || `vst-graph-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
const ORIGINS = process.env.E2E_VST_ORIGINS || "http://localhost:3000,http://127.0.0.1:3000";
const PLUGIN_ID = process.env.E2E_VST_PLUGIN_ID || "CC3695D88FE74881B46E6CCFFB291CFF"; // Retrologue
const RMS_WINDOW_MS = Number(process.env.E2E_RMS_WINDOW_MS || 1400);
const HARD_TIMEOUT_MS = 180000;
const ARTIFACTS = resolve("e2e", "artifacts", new Date().toISOString().replace(/[:.]/g, "-"));
const CHROME = ["C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe", "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/usr/bin/google-chrome"].find((path) => existsSync(path));

const PAGE_SCRIPT = `(async () => {
    const ARGS = ${JSON.stringify({ baseUrl: HOST_URL, token: TOKEN, pluginId: PLUGIN_ID, rmsWindowMs: RMS_WINDOW_MS })};
    const wait = (ms) => new Promise((resolveWait) => setTimeout(resolveWait, ms));
    const report = { fatal: null, vst: null, synth: null, offline: null, errors: [], log: [] };
    window.addEventListener("error", (event) => report.errors.push(String((event && event.error && event.error.message) || event.message || "error")));
    window.addEventListener("unhandledrejection", (event) => report.errors.push(String((event.reason && event.reason.message) || event.reason || "unhandled rejection")));
    // The graph builder creates its bridge client through the existing audio-vst config chain; injecting the
    // runtime config is the production path a studio setting would use, so no test-only builder branch exists.
    window.__RUNTIME_CONFIG__ = Object.assign({}, window.__RUNTIME_CONFIG__, { VST_BRIDGE_URL: ARGS.baseUrl, VST_TOKEN: ARGS.token });
    try {
        const graphModule = await import("/src/lib/canvas/audio-graph.ts");
        const midiModule = await import("/src/lib/canvas/audio-midi.ts");
        const ppqn = midiModule.AUDIO_DEFAULT_PPQN;
        const tempo = 120;
        const buildDoc = (instrument) => ({
            tracks: [
                { id: "t1", name: "VST", type: "instrument", gain: 1, pan: 0, mute: false, solo: false, instrument },
                { id: "master", name: "Master", type: "master", gain: 1, pan: 0, mute: false, solo: false },
            ],
            clips: [],
            regions: [{ id: "r1", trackId: "t1", startTicks: 0, durationTicks: ppqn * 8, name: "", notes: [{ id: "n1", tick: 0, durationTicks: ppqn * 4, pitch: 60, velocity: 0.8 }] }],
            ppqn,
            tempo,
            masterGain: 1,
        });
        const vstDoc = buildDoc({ kind: "vst3", pluginId: ARGS.pluginId, name: "Retrologue" });

        const graph = graphModule.buildAudioGraph(vstDoc, new Map(), { mode: "transport" });
        const context = graph.strips.get("t1").input.context;
        await context.resume();
        const source = graph.vstSources.get("t1");
        const attachDeadline = performance.now() + 20000;
        while (source && source.status === "pending" && performance.now() < attachDeadline) await wait(100);
        report.log.push({ t: "attach", status: source ? source.status : "missing", error: source ? source.error || "" : "" });

        const transport = context.transport;
        transport.stop();
        transport.position = 0;
        transport.cancel();
        graph.scheduleMidi(vstDoc.regions, ppqn, tempo);

        const analyser = context.createAnalyser();
        analyser.fftSize = 2048;
        graph.strips.get("master").panner.connect(analyser);
        const samples = new Float32Array(analyser.fftSize);
        let sum = 0;
        let count = 0;
        let peak = 0;
        let polls = 0;
        if (source && source.status === "ready") {
            transport.start();
            const sampleDeadline = performance.now() + ARGS.rmsWindowMs;
            while (performance.now() < sampleDeadline) {
                analyser.getFloatTimeDomainData(samples);
                for (let i = 0; i < samples.length; i += 1) {
                    const value = samples[i];
                    sum += value * value;
                    if (Math.abs(value) > peak) peak = Math.abs(value);
                }
                count += samples.length;
                polls += 1;
                await wait(50);
            }
            transport.stop();
        }
        report.vst = {
            status: source ? source.status : "missing",
            error: source ? source.error || "" : "",
            instanceId: source ? source.instanceId || "" : "",
            isPolySynth: graph.synths.has("t1"),
            vstSourceCount: graph.vstSources.size,
            framesReceived: source ? source.framesReceived ?? -1 : -1,
            framesDropped: source ? source.framesDropped ?? -1 : -1,
            droppedBlocks: source ? source.droppedBlocks ?? -1 : -1,
            underruns: source ? source.underruns ?? -1 : -1,
            streamErrors: source ? source.streamErrors ?? -1 : -1,
            samples: count,
            polls,
            peak,
            rms: count ? Math.sqrt(sum / count) : 0,
        };
        graph.dispose();
        await wait(300);

        // The same builder with a plain synth instrument must still construct a PolySynth and no bridge.
        const synthGraph = graphModule.buildAudioGraph(buildDoc({ kind: "synth", preset: "saw-lead" }), new Map(), { mode: "transport" });
        report.synth = { built: true, isPolySynth: synthGraph.synths.has("t1"), vstSourceCount: synthGraph.vstSources.size };
        synthGraph.dispose();

        // A real-time native VST cannot render inside Tone.Offline; the graph reports the skip instead of throwing.
        const offlineGraph = graphModule.buildAudioGraph(vstDoc, new Map(), { mode: "offline" });
        const offlineSource = offlineGraph.vstSources.get("t1");
        report.offline = { status: offlineSource ? offlineSource.status : "missing", error: offlineSource ? offlineSource.error || "" : "", polySynths: offlineGraph.synths.size };
        offlineGraph.dispose();
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

async function run() {
    if (!CHROME) throw new Error("Chrome not found on this machine");
    if (!existsSync(HOST_EXE)) throw new Error(`vst-host executable not found at ${HOST_EXE} (build vst-host first)`);
    try {
        const app = await fetch(`${BASE}/`);
        if (!app.ok) throw new Error(String(app.status));
    } catch {
        throw new Error(`Dev server is not reachable at ${BASE} — start it (or set E2E_BASE) before running the VST graph E2E`);
    }
    if (!(await isPortFree(HOST_PORT))) throw new Error(`port ${HOST_PORT} is already in use by ${portOwner(HOST_PORT)} — stop it before running the VST graph E2E`);
    if (!(await isPortFree(PORT))) throw new Error(`CDP port ${PORT} is already in use by ${portOwner(PORT)} — set E2E_CDP_PORT to a free port`);

    mkdirSync(ARTIFACTS, { recursive: true });
    state.profile = join(tmpdir(), `opencanvas-vst-graph-e2e-${process.pid}`);
    rmSync(state.profile, { recursive: true, force: true });

    state.host = spawn(HOST_EXE, [], { env: { ...process.env, VST_HOST_TOKEN: TOKEN, VST_HOST_ORIGINS: ORIGINS }, stdio: ["ignore", "pipe", "pipe"] });
    state.host.stdout.on("data", (data) => hostOutput.push(String(data)));
    state.host.stderr.on("data", (data) => hostOutput.push(`[stderr] ${String(data)}`));
    state.chrome = spawn(CHROME, ["--headless=new", `--remote-debugging-port=${PORT}`, `--user-data-dir=${state.profile}`, "--no-first-run", "--window-size=1500,950", "--autoplay-policy=no-user-gesture-required", `${BASE}/`], { stdio: "ignore" });

    // Wait for the host to accept authenticated RPC before touching the browser.
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

    const evaluated = await send(state.socket, nextId++, "Runtime.evaluate", { expression: PAGE_SCRIPT, awaitPromise: true, returnByValue: true });
    const report = evaluated?.result?.value || null;
    if (!report) {
        const detail = evaluated?.exceptionDetails?.exception?.description || evaluated?.exceptionDetails?.text || JSON.stringify(evaluated);
        throw new Error(`in-page graph run produced no report: ${String(detail).split("\n").slice(0, 8).join(" | ")}`);
    }
    writeFileSync(join(ARTIFACTS, "vst-graph.json"), JSON.stringify({ base: BASE, hostUrl: HOST_URL, token: TOKEN, report, runtimeExceptions, hostOutput: hostOutput.join("") }, null, 2));
    try {
        const screenshot = await send(state.socket, nextId++, "Page.captureScreenshot", { format: "png" });
        if (screenshot?.data) writeFileSync(join(ARTIFACTS, "vst-graph.png"), Buffer.from(screenshot.data, "base64"));
    } catch {}

    // ------------------------------------------------------------------
    // Assertions
    // ------------------------------------------------------------------
    const results = [];
    const ok = (name, pass, detail = "") => results.push({ name, pass: !!pass, detail: String(detail) });
    const vst = report.vst || {};
    const synth = report.synth || {};
    const offline = report.offline || {};

    if (report.fatal) {
        ok("in-page graph run completed", false, report.fatal);
    } else {
        ok("vst3 instrument is driven by the bridge, not a Tone.PolySynth", vst.isPolySynth === false && vst.vstSourceCount === 1, `isPolySynth=${vst.isPolySynth} vstSourceCount=${vst.vstSourceCount}`);
        ok("bridge attached and ready", vst.status === "ready", `status=${vst.status} error=${vst.error} instanceId=${vst.instanceId}`);
        ok("bridge streamed real host frames", vst.framesReceived > 50, `framesReceived=${vst.framesReceived} framesDropped=${vst.framesDropped} streamErrors=${vst.streamErrors}`);
        ok("graph output RMS > 0.001 (Retrologue audible at the master output)", vst.rms > 0.001, `rms=${vst.rms} peak=${vst.peak} samples=${vst.samples} polls=${vst.polls}`);
        ok("vst stream had no errors", vst.streamErrors === 0 && !vst.error, `streamErrors=${vst.streamErrors} error=${vst.error}`);
        ok("non-vst3 instrument track still builds a PolySynth", synth.built === true && synth.isPolySynth === true && synth.vstSourceCount === 0, `built=${synth.built} isPolySynth=${synth.isPolySynth} vstSourceCount=${synth.vstSourceCount}`);
        ok("offline build skips the real-time VST3 source explicitly", offline.status === "offline" && Boolean(offline.error), `status=${offline.status} error=${offline.error}`);
        ok("no unhandled page errors", report.errors.length === 0 && runtimeExceptions.length === 0, `pageErrors=${JSON.stringify(report.errors)} runtimeExceptions=${JSON.stringify(runtimeExceptions)}`);
    }

    let failed = 0;
    console.log("\nVST graph assertions (real browser -> shared audio-graph -> real vst-host -> Retrologue):");
    for (const result of results) {
        if (result.pass) console.log(`  PASS  ${result.name}`);
        else {
            failed += 1;
            console.log(`  FAIL  ${result.name}  ->  ${result.detail}`);
        }
    }

    console.log(`\n${results.length - failed}/${results.length} assertions passed`);
    console.log(`master-output rms=${vst.rms} peak=${vst.peak} over ${vst.samples} samples (${vst.polls} analyser polls, ${RMS_WINDOW_MS}ms window)`);
    console.log(`vst source: status=${vst.status} framesReceived=${vst.framesReceived} framesDropped=${vst.framesDropped} droppedBlocks=${vst.droppedBlocks} underruns=${vst.underruns} streamErrors=${vst.streamErrors}`);
    console.log(`console/page errors during run: page=${report.errors.length} runtime=${runtimeExceptions.length}`);
    console.log(`artifacts: ${ARTIFACTS}`);

    if (failed || report.fatal) {
        console.log(`\n--- vst source ---\n${JSON.stringify(vst, null, 2)}`);
        console.log(`--- page errors ---\n${JSON.stringify(report.errors)}`);
        console.log(`--- runtime exceptions ---\n${JSON.stringify(runtimeExceptions)}`);
        console.log(`--- page log ---\n${JSON.stringify(report.log)}`);
        console.log(`--- host output ---\n${hostOutput.join("")}`);
        process.exitCode = 1;
    }
}

const watchdog = setTimeout(() => {
    console.error(`\nVST graph E2E hard timeout after ${HARD_TIMEOUT_MS / 1000}s — shutting down`);
    cleanup().then(() => process.exit(1));
}, HARD_TIMEOUT_MS);

run()
    .catch((error) => {
        console.error(`VST graph E2E failed: ${error.message}`);
        if (hostOutput.length) console.error(`--- host output ---\n${hostOutput.join("")}`);
        process.exitCode = 1;
    })
    .finally(async () => {
        clearTimeout(watchdog);
        const free = await cleanup();
        if (!free) process.exitCode = 1;
    });
