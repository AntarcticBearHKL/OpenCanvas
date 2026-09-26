// VST3 *effect* end-to-end: a real Chrome page (served by the Vite dev server) imports the shared
// `audio-graph.ts` builder, builds a project whose track carries a `vst3Effect`, waits for the inline
// bridge, and proves with a 440 Hz oscillator that the track signal really travels
// browser -> effect worklet input -> POST /audio-in -> host plug-in -> GET /audio -> graph master,
// scaled by the plug-in's Gain parameter (0.5 then 1.0). A track without an effect is measured as the
// dry reference, and a synth-only graph proves the non-vst3 / instrument path is untouched.
//
// The only Fx plug-in on this machine is the VST3 SDK's `again` gain sample, built into a temp fixture
// directory (see `vst-host/README.md` → "Effect test fixture"); this script never installs or modifies
// a plug-in.
//
// Same CDP approach as `e2e/vst-graph.mjs`: real Chrome over the DevTools protocol, no Playwright.
// The dev server (port 3000) is REUSED, never started or stopped by this script; the VST host and
// Chrome are started here and stopped before exit (port 3211 is checked free).
//
//   node e2e/vst-effect.mjs
//
// Env: E2E_BASE (default http://127.0.0.1:3000), E2E_CDP_PORT (default 9338),
//      E2E_VST_HOST (default http://127.0.0.1:3211), E2E_VST_HOST_EXE, E2E_VST_TOKEN,
//      E2E_VST_ORIGINS, E2E_VST_EFFECT_PLUGIN_DIR (default <tmp>/opencanvas-vst-effects/plugins),
//      E2E_VST_EFFECT_PLUGIN_ID (skips the scan lookup), E2E_RMS_WINDOW_MS.

import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { execFileSync, spawn } from "node:child_process";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";

const BASE = process.env.E2E_BASE || "http://127.0.0.1:3000";
const PORT = Number(process.env.E2E_CDP_PORT || 9338);
const HOST_URL = process.env.E2E_VST_HOST || "http://127.0.0.1:3211";
const HOST_PORT = Number(new URL(HOST_URL).port || 3211);
const HOST_EXE = process.env.E2E_VST_HOST_EXE || fileURLToPath(new URL("../../vst-host/build/bin/vst-host.exe", import.meta.url));
const TOKEN = process.env.E2E_VST_TOKEN || `vst-effect-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
const ORIGINS = process.env.E2E_VST_ORIGINS || "http://localhost:3000,http://127.0.0.1:3000";
const EFFECT_DIR = process.env.E2E_VST_EFFECT_PLUGIN_DIR || join(tmpdir(), "opencanvas-vst-effects", "plugins");
const EFFECT_NAME = process.env.E2E_VST_EFFECT_PLUGIN_NAME || "AGain VST3";
const AMPLITUDE = Number(process.env.E2E_VST_EFFECT_AMPLITUDE || 0.4);
const GAIN_PARAM_ID = Number(process.env.E2E_VST_EFFECT_GAIN_PARAM || 0);
const RMS_WINDOW_MS = Number(process.env.E2E_RMS_WINDOW_MS || 1400);
const HARD_TIMEOUT_MS = 240000;
const ARTIFACTS = resolve("e2e", "artifacts", new Date().toISOString().replace(/[:.]/g, "-"));
const CHROME = ["C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe", "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/usr/bin/google-chrome"].find((path) => existsSync(path));

const PAGE_SCRIPT = `(async () => {
    const ARGS = ${JSON.stringify({ baseUrl: HOST_URL, token: TOKEN, pluginId: process.env.E2E_VST_EFFECT_PLUGIN_ID || "", effectName: EFFECT_NAME, amplitude: AMPLITUDE, gainParamId: GAIN_PARAM_ID, windowMs: RMS_WINDOW_MS, effectDir: EFFECT_DIR })};
    const wait = (ms) => new Promise((resolveWait) => setTimeout(resolveWait, ms));
    const report = { fatal: null, effect: null, dry: null, half: null, full: null, offline: null, synth: null, errors: [], log: [] };
    window.addEventListener("error", (event) => report.errors.push(String((event && event.error && event.error.message) || event.message || "error")));
    window.addEventListener("unhandledrejection", (event) => report.errors.push(String((event.reason && event.reason.message) || event.reason || "unhandled rejection")));
    window.__RUNTIME_CONFIG__ = Object.assign({}, window.__RUNTIME_CONFIG__, { VST_BRIDGE_URL: ARGS.baseUrl, VST_TOKEN: ARGS.token });
    try {
        const graphModule = await import("/src/lib/canvas/audio-graph.ts");
        const vstModule = await import("/src/lib/canvas/audio-vst.ts");
        const client = vstModule.createVstClient();

        // The scan id is resolved over /rpc here (the same list the picker shows); a path is accepted too.
        let pluginId = ARGS.pluginId;
        if (!pluginId) {
            const plugins = await client.scan();
            const effect = plugins.find((plugin) => !plugin.isInstrument && plugin.name === ARGS.effectName);
            if (!effect) throw new Error("effect fixture not found by scan: " + ARGS.effectName + " (build it into " + ARGS.effectDir + ")");
            pluginId = effect.id;
        }

        const doc = {
            tracks: [
                { id: "fx", name: "FX", type: "audio", gain: 1, pan: 0, mute: false, solo: false, vst3Effect: { kind: "vst3", pluginId } },
                { id: "dry", name: "Dry", type: "audio", gain: 1, pan: 0, mute: false, solo: false },
                { id: "master", name: "Master", type: "master", gain: 1, pan: 0, mute: false, solo: false },
            ],
            clips: [],
            regions: [],
            masterGain: 1,
        };

        const graph = graphModule.buildAudioGraph(doc, new Map(), { mode: "transport" });
        const context = graph.strips.get("fx").input.context;
        await context.resume();

        const source = graph.vstEffects.get("fx");
        const attachDeadline = performance.now() + 25000;
        while (source && source.status === "pending" && performance.now() < attachDeadline) await wait(100);
        report.log.push({ t: "attach", status: source ? source.status : "missing", error: source ? source.error || "" : "" });

        // 440 Hz reference signal; it is routed to whichever strip is being measured.
        const osc = context.createOscillator();
        osc.frequency.value = 440;
        const oscGain = context.createGain();
        oscGain.gain.value = ARGS.amplitude;
        osc.connect(oscGain);
        osc.start();

        const makeMeasure = (measureGraph) => {
            const analyser = context.createAnalyser();
            analyser.fftSize = 4096;
            measureGraph.strips.get("master").panner.connect(analyser);
            const samples = new Float32Array(analyser.fftSize);
            return async (ms) => {
                let sum = 0;
                let peak = 0;
                let count = 0;
                const deadline = performance.now() + ms;
                while (performance.now() < deadline) {
                    analyser.getFloatTimeDomainData(samples);
                    for (let i = 0; i < samples.length; i += 1) {
                        const value = samples[i];
                        sum += value * value;
                        if (Math.abs(value) > peak) peak = Math.abs(value);
                    }
                    count += samples.length;
                    await wait(40);
                }
                return { rms: count ? Math.sqrt(sum / count) : 0, peak, samples: count };
            };
        };
        const measure = makeMeasure(graph);

        // Dry reference: the very same oscillator through a track without an effect.
        oscGain.connect(graph.strips.get("dry").input.input);
        await wait(400);
        report.dry = await measure(ARGS.windowMs);
        oscGain.disconnect(graph.strips.get("dry").input.input);

        // Through the effect: insert -> worklet input -> /audio-in -> host AGain -> /audio -> master.
        oscGain.connect(graph.strips.get("fx").input.input);
        if (source && source.status === "ready") {
            await client.paramSet({ instanceId: source.instanceId, paramId: ARGS.gainParamId, value: 0.5 });
            await wait(700);
            report.half = await measure(ARGS.windowMs);
            await client.paramSet({ instanceId: source.instanceId, paramId: ARGS.gainParamId, value: 1.0 });
            await wait(700);
            report.full = await measure(ARGS.windowMs);
        }
        oscGain.disconnect(graph.strips.get("fx").input.input);

        report.effect = {
            status: source ? source.status : "missing",
            error: source ? source.error || "" : "",
            instanceId: source ? source.instanceId || "" : "",
            framesUploaded: source ? source.framesUploaded ?? -1 : -1,
            framesDropped: source ? source.framesDropped ?? -1 : -1,
            uploadErrors: source ? source.uploadErrors ?? -1 : -1,
            inputCaptured: source ? source.inputCaptured ?? -1 : -1,
            inputDropped: source ? source.inputDropped ?? -1 : -1,
            effectCount: graph.vstEffects.size,
            vstSourceCount: graph.vstSources.size,
        };
        graph.dispose();
        await wait(300);

        // An offline build cannot host a real-time plug-in: the effect must not be wired at all.
        const offlineGraph = graphModule.buildAudioGraph(doc, new Map(), { mode: "offline" });
        report.offline = { effectCount: offlineGraph.vstEffects.size, polySynths: offlineGraph.synths.size };
        offlineGraph.dispose();

        // The non-vst3 instrument path must stay exactly as before: PolySynth, no bridge, no effect.
        const synthDoc = {
            tracks: [
                { id: "s1", name: "Synth", type: "instrument", gain: 1, pan: 0, mute: false, solo: false, instrument: { kind: "synth", preset: "saw-lead" } },
                { id: "master", name: "Master", type: "master", gain: 1, pan: 0, mute: false, solo: false },
            ],
            clips: [],
            regions: [],
            masterGain: 1,
        };
        const synthGraph = graphModule.buildAudioGraph(synthDoc, new Map(), { mode: "transport" });
        report.synth = { isPolySynth: synthGraph.synths.has("s1"), vstSourceCount: synthGraph.vstSources.size, effectCount: synthGraph.vstEffects.size };
        synthGraph.dispose();

        // A failed effect attach must leave the track's dry path exactly as it was.
        const failDoc = {
            tracks: [
                { id: "bad", name: "Bad FX", type: "audio", gain: 1, pan: 0, mute: false, solo: false, vst3Effect: { kind: "vst3", pluginId: "__missing_effect_fixture__" } },
                { id: "master", name: "Master", type: "master", gain: 1, pan: 0, mute: false, solo: false },
            ],
            clips: [],
            regions: [],
            masterGain: 1,
        };
        const failGraph = graphModule.buildAudioGraph(failDoc, new Map(), { mode: "transport" });
        const failSource = failGraph.vstEffects.get("bad");
        const failMeasure = makeMeasure(failGraph);
        const failDeadline = performance.now() + 10000;
        while (failSource && failSource.status === "pending" && performance.now() < failDeadline) await wait(100);
        oscGain.connect(failGraph.strips.get("bad").input.input);
        await wait(400);
        report.failedEffect = {
            status: failSource ? failSource.status : "missing",
            error: failSource ? failSource.error || "" : "",
            level: await failMeasure(ARGS.windowMs),
        };
        oscGain.disconnect(failGraph.strips.get("bad").input.input);
        osc.stop();
        failGraph.dispose();
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
        throw new Error(`Dev server is not reachable at ${BASE} — start it (or set E2E_BASE) before running the VST effect E2E`);
    }
    if (!(await isPortFree(HOST_PORT))) throw new Error(`port ${HOST_PORT} is already in use by ${portOwner(HOST_PORT)} — stop it before running the VST effect E2E`);
    if (!(await isPortFree(PORT))) throw new Error(`CDP port ${PORT} is already in use by ${portOwner(PORT)} — set E2E_CDP_PORT to a free port`);

    // The fixture is a temp scan directory; `load` resolves the scanned id from the very same list.
    if (process.env.E2E_VST_EFFECT_PLUGIN_ID && !/^[0-9A-F]{32}$/i.test(process.env.E2E_VST_EFFECT_PLUGIN_ID)) {
        throw new Error(`E2E_VST_EFFECT_PLUGIN_ID must be a scanned 32-hex id, got ${process.env.E2E_VST_EFFECT_PLUGIN_ID}`);
    }
    if (!existsSync(EFFECT_DIR) && !process.env.E2E_VST_EFFECT_PLUGIN_ID) {
        throw new Error(`effect fixture directory not found at ${EFFECT_DIR}; build the AGain sample first (see vst-host/README.md → "Effect test fixture") or set E2E_VST_EFFECT_PLUGIN_DIR`);
    }

    mkdirSync(ARTIFACTS, { recursive: true });
    state.profile = join(tmpdir(), `opencanvas-vst-effect-e2e-${process.pid}`);
    rmSync(state.profile, { recursive: true, force: true });

    state.host = spawn(HOST_EXE, [], { env: { ...process.env, VST_HOST_TOKEN: TOKEN, VST_HOST_ORIGINS: ORIGINS, VST_HOST_PLUGIN_DIRS: EFFECT_DIR }, stdio: ["ignore", "pipe", "pipe"] });
    state.host.stdout.on("data", (data) => hostOutput.push(String(data)));
    state.host.stderr.on("data", (data) => hostOutput.push(`[stderr] ${String(data)}`));
    state.chrome = spawn(CHROME, ["--headless=new", `--remote-debugging-port=${PORT}`, `--user-data-dir=${state.profile}`, "--no-first-run", "--window-size=1500,950", "--autoplay-policy=no-user-gesture-required", `${BASE}/`], { stdio: "ignore" });

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
    writeFileSync(join(ARTIFACTS, "vst-effect.json"), JSON.stringify({ base: BASE, hostUrl: HOST_URL, token: TOKEN, effectDir: EFFECT_DIR, report, runtimeExceptions, hostOutput: hostOutput.join("") }, null, 2));
    try {
        const screenshot = await send(state.socket, nextId++, "Page.captureScreenshot", { format: "png" });
        if (screenshot?.data) writeFileSync(join(ARTIFACTS, "vst-effect.png"), Buffer.from(screenshot.data, "base64"));
    } catch {}

    // ------------------------------------------------------------------
    // Assertions
    // ------------------------------------------------------------------
    const results = [];
    const ok = (name, pass, detail = "") => results.push({ name, pass: !!pass, detail: String(detail) });
    const effect = report.effect || {};
    const dry = report.dry || null;
    const half = report.half || null;
    const full = report.full || null;
    const offline = report.offline || {};
    const synth = report.synth || {};
    const failedEffect = report.failedEffect || {};
    const inputRms = AMPLITUDE / Math.SQRT2;
    const near = (value, expected, tolerance) => typeof value === "number" && expected > 0 && Math.abs(value - expected) / expected <= tolerance;

    if (report.fatal) {
        ok("in-page effect run completed", false, report.fatal);
    } else {
        ok("effect track owns one inline vst3 effect and no instrument source", effect.effectCount === 1 && effect.vstSourceCount === 0, `effectCount=${effect.effectCount} vstSourceCount=${effect.vstSourceCount}`);
        ok("effect bridge attached and ready", effect.status === "ready", `status=${effect.status} error=${effect.error} instanceId=${effect.instanceId}`);
        ok("worklet captured input blocks from the graph", effect.inputCaptured > 20, `inputCaptured=${effect.inputCaptured} inputDropped=${effect.inputDropped}`);
        ok("worker uploaded input to /audio-in without errors", effect.framesUploaded > 20 && effect.uploadErrors === 0, `framesUploaded=${effect.framesUploaded} framesDropped=${effect.framesDropped} uploadErrors=${effect.uploadErrors}`);
        ok("dry track plays the 440 Hz reference (analyser sees real level)", dry && dry.rms > 0.05 && dry.peak > 0.1, `dry.rms=${dry?.rms} dry.peak=${dry?.peak}`);
        ok("effect output at gain 0.5 is half the dry signal (rms +-15%)", dry && half && near(half.rms, dry.rms * 0.5, 0.15), `half.rms=${half?.rms} dry/2=${dry ? (dry.rms * 0.5).toFixed(6) : "n/a"}`);
        ok("effect output at gain 0.5 peak is half the dry peak (+-15%)", dry && half && near(half.peak, dry.peak * 0.5, 0.15), `half.peak=${half?.peak} dry/2=${dry ? (dry.peak * 0.5).toFixed(6) : "n/a"}`);
        ok("effect output follows the Gain parameter back to unity (rms +-15% of dry)", dry && full && near(full.rms, dry.rms, 0.15), `full.rms=${full?.rms} dry.rms=${dry?.rms}`);
        ok("changing the plug-in parameter measurably changed the output (full > 1.6 x half)", full && half && full.rms > half.rms * 1.6, `half=${half?.rms} full=${full?.rms}`);
        ok("offline build does not wire the real-time effect", offline.effectCount === 0, `effectCount=${offline.effectCount}`);
        ok("non-vst3 instrument track still builds a PolySynth with no bridge", synth.isPolySynth === true && synth.vstSourceCount === 0 && synth.effectCount === 0, `isPolySynth=${synth.isPolySynth} vstSourceCount=${synth.vstSourceCount} effectCount=${synth.effectCount}`);
        ok("a failed effect attach reports the error and leaves the dry path audible", failedEffect.status === "failed" && Boolean(failedEffect.error) && (failedEffect.level?.rms ?? 0) > 0.05, `status=${failedEffect.status} error=${failedEffect.error} rms=${failedEffect.level?.rms}`);
        ok("no unhandled page errors", report.errors.length === 0 && runtimeExceptions.length === 0, `pageErrors=${JSON.stringify(report.errors)} runtimeExceptions=${JSON.stringify(runtimeExceptions)}`);
    }

    let failed = 0;
    console.log("\nVST effect assertions (browser oscillator -> worklet input -> /audio-in -> real vst-host AGain -> /audio -> master):");
    for (const result of results) {
        if (result.pass) console.log(`  PASS  ${result.name}`);
        else {
            failed += 1;
            console.log(`  FAIL  ${result.name}  ->  ${result.detail}`);
        }
    }

    console.log(`\n${results.length - failed}/${results.length} assertions passed`);
    console.log(`levels: dry rms=${dry?.rms} peak=${dry?.peak} | gain 0.5 rms=${half?.rms} peak=${half?.peak} | gain 1.0 rms=${full?.rms} peak=${full?.peak} | input rms=${inputRms.toFixed(6)}`);
    console.log(`effect source: status=${effect.status} framesUploaded=${effect.framesUploaded} framesDropped=${effect.framesDropped} uploadErrors=${effect.uploadErrors} inputCaptured=${effect.inputCaptured} inputDropped=${effect.inputDropped}`);
    console.log(`console/page errors during run: page=${report.errors.length} runtime=${runtimeExceptions.length}`);
    console.log(`artifacts: ${ARTIFACTS}`);

    if (failed || report.fatal) {
        console.log(`\n--- effect source ---\n${JSON.stringify(effect, null, 2)}`);
        console.log(`--- page errors ---\n${JSON.stringify(report.errors)}`);
        console.log(`--- runtime exceptions ---\n${JSON.stringify(runtimeExceptions)}`);
        console.log(`--- page log ---\n${JSON.stringify(report.log)}`);
        console.log(`--- host output ---\n${hostOutput.join("")}`);
        process.exitCode = 1;
    }
}

const watchdog = setTimeout(() => {
    console.error(`\nVST effect E2E hard timeout after ${HARD_TIMEOUT_MS / 1000}s — shutting down`);
    cleanup().then(() => process.exit(1));
}, HARD_TIMEOUT_MS);

run()
    .catch((error) => {
        console.error(`VST effect E2E failed: ${error.message}`);
        if (hostOutput.length) console.error(`--- host output ---\n${hostOutput.join("")}`);
        process.exitCode = 1;
    })
    .finally(async () => {
        clearTimeout(watchdog);
        const free = await cleanup();
        if (!free) process.exitCode = 1;
    });
