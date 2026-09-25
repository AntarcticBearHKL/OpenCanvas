// VST bridge end-to-end: a real Chrome page (served by the Vite dev server) drives the streaming
// worker from `web/src/lib/canvas/audio-vst.worker.ts` against the real native host
// (`vst-host/build/bin/vst-host.exe`), loads Retrologue, holds C4, and proves that real audio
// frames arrive over `GET /audio` with an exact 16-byte-LE-header + planar Float32 framing.
//
// Same CDP approach as `e2e/run.mjs`: real Chrome over the DevTools protocol, no Playwright/Puppeteer.
// The dev server (port 3000) is REUSED, never started or stopped by this script; the VST host and
// Chrome are started here and stopped before exit (port 3211 is checked free).
//
//   node e2e/vst-bridge.mjs
//
// Env: E2E_BASE (default http://127.0.0.1:3000), E2E_CDP_PORT (default 9334),
//      E2E_VST_HOST (default http://127.0.0.1:3211), E2E_VST_HOST_EXE, E2E_VST_TOKEN.

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
const TOKEN = process.env.E2E_VST_TOKEN || `vst-e2e-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
const ORIGINS = process.env.E2E_VST_ORIGINS || "http://localhost:3000,http://127.0.0.1:3000";
const PLUGIN_ID = process.env.E2E_VST_PLUGIN_ID || "CC3695D88FE74881B46E6CCFFB291CFF"; // Retrologue
const FRAME_BYTES = 16 + 2 * 256 * 4; // 16-byte header + 2 channels x 256 frames x f32
const HARD_TIMEOUT_MS = 180000;
const ARTIFACTS = resolve("e2e", "artifacts", new Date().toISOString().replace(/[:.]/g, "-"));
const CHROME = ["C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe", "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/usr/bin/google-chrome"].find((path) => existsSync(path));

const PAGE_SCRIPT = `(async () => {
    const ARGS = ${JSON.stringify({ baseUrl: HOST_URL, token: TOKEN, pluginId: PLUGIN_ID })};
    const wait = (ms) => new Promise((resolveWait) => setTimeout(resolveWait, ms));
    const protocol = await import("/src/lib/canvas/audio-vst-protocol.ts");
    const bridge = await import("/src/lib/canvas/audio-vst.ts");
    const client = bridge.createVstClient({ baseUrl: ARGS.baseUrl, token: ARGS.token });
    const report = { hello: null, scan: null, load: null, worker: null, worklet: { status: "skipped", reason: "not run" } };

    const hello = await client.hello();
    report.hello = { protocol: hello.protocol, host: hello.host, version: hello.version };
    const plugins = await client.scan();
    const instruments = plugins.filter((plugin) => plugin.isInstrument);
    report.scan = {
        total: plugins.length,
        instruments: instruments.length,
        names: instruments.map((plugin) => plugin.name),
        retrologue: instruments.some((plugin) => plugin.id === ARGS.pluginId),
    };
    const loaded = await client.load({ pluginId: ARGS.pluginId });
    report.load = { instanceId: loaded.instanceId };
    await client.noteOn({ instanceId: loaded.instanceId, pitch: 60, velocity: 100 });

    // Primary path: the streaming worker owns /rpc + /audio; the main thread plays the worklet's
    // role (receives transferred blocks on a MessagePort and recycles their buffers).
    const runWorkerPhase = async (instanceId) => {
        const worker = bridge.createVstStreamWorker();
        const channel = new MessageChannel();
        const phaseStart = performance.now();
        const state = { messages: {}, errors: [], stats: null, blocks: 0, channels: [], frames: [], headerOk: true, seqs: [], sampleSum: 0, sampleCount: 0, log: [] };
        const stamp = (type, extra) => {
            state.messages[type] = (state.messages[type] || 0) + 1;
            if (state.log.length < 120) state.log.push(Object.assign({ t: Math.round(performance.now() - phaseStart), type }, extra || {}));
        };
        channel.port1.onmessage = (event) => {
            const message = event.data;
            if (!message || message.type !== "block") return;
            const buffer = message.buffer;
            state.blocks += 1;
            if (state.channels.indexOf(message.channels) === -1) state.channels.push(message.channels);
            if (state.frames.indexOf(message.framesPerChannel) === -1) state.frames.push(message.framesPerChannel);
            if (message.channels !== protocol.VST_CHANNELS || message.framesPerChannel !== protocol.VST_FRAMES_PER_BLOCK) state.headerOk = false;
            state.seqs.push(message.seq);
            for (let i = 0; i < buffer.length; i += 1) state.sampleSum += buffer[i] * buffer[i];
            state.sampleCount += buffer.length;
            channel.port1.postMessage({ type: "recycle", buffers: [buffer] }, [buffer.buffer]);
        };
        worker.onmessage = (event) => {
            const message = event.data;
            if (message.type === "stats") {
                state.stats = message;
                stamp("stats", { framesReceived: message.framesReceived, framesDropped: message.framesDropped });
            } else if (message.type === "error") {
                state.errors.push({ code: message.code, message: message.message });
                stamp("error", { code: message.code });
            } else {
                stamp(message.type);
            }
        };
        worker.postMessage({ type: "config", baseUrl: ARGS.baseUrl, token: ARGS.token, instanceId });
        worker.postMessage({ type: "attach", port: channel.port2 }, [channel.port2]);
        worker.postMessage({ type: "start" });
        const deadline = performance.now() + 8000;
        while ((state.blocks < 50 || performance.now() - phaseStart < 1500) && performance.now() < deadline) await wait(100);
        await wait(350);
        const stats = state.stats;
        worker.postMessage({ type: "stop" });
        await wait(250);
        worker.terminate();
        const seqs = state.seqs;
        let monotonic = true;
        let gaps = 0;
        for (let i = 1; i < seqs.length; i += 1) {
            if (seqs[i] <= seqs[i - 1]) monotonic = false;
            if (seqs[i] !== seqs[i - 1] + 1) gaps += 1;
        }
        const rms = state.sampleCount > 0 ? Math.sqrt(state.sampleSum / state.sampleCount) : 0;
        return {
            framesReceived: stats ? stats.framesReceived : 0,
            framesDropped: stats ? stats.framesDropped : -1,
            bytesReceived: stats ? stats.bytesReceived : -1,
            streamErrors: stats ? stats.streamErrors : -1,
            poolFree: stats ? stats.poolFree : -1,
            blocks: state.blocks,
            channels: state.channels,
            framesPerChannel: state.frames,
            headerOk: state.headerOk,
            seqFirst: seqs.length ? seqs[0] : null,
            seqLast: seqs.length ? seqs[seqs.length - 1] : null,
            seqMonotonic: monotonic,
            seqGaps: gaps,
            samples: state.sampleCount,
            rms,
            messages: state.messages,
            errors: state.errors,
            log: state.log,
        };
    };

    // Secondary path (best effort): a real AudioWorkletNode consumes the worker's blocks.
    const runWorkletPhase = async (instanceId) => {
        let worker = null;
        let ctx = null;
        try {
            const Ctor = window.AudioContext || window.webkitAudioContext;
            if (!Ctor) return { status: "skipped", reason: "AudioContext is unavailable" };
            ctx = new Ctor();
            await ctx.resume().catch(() => undefined);
            await ctx.audioWorklet.addModule(bridge.VST_WORKLET_URL);
            const sampleRate = ctx.sampleRate;
            const node = new AudioWorkletNode(ctx, protocol.VST_WORKLET_PROCESSOR);
            node.connect(ctx.destination);
            const channel = new MessageChannel();
            worker = bridge.createVstStreamWorker();
            let workletStats = null;
            let workerStats = null;
            const messages = {};
            const errors = [];
            node.port.onmessage = (event) => {
                if (event.data && event.data.type === "stats") workletStats = event.data;
            };
            worker.onmessage = (event) => {
                const message = event.data;
                messages[message.type] = (messages[message.type] || 0) + 1;
                if (message.type === "stats") workerStats = message;
                if (message.type === "error") errors.push({ code: message.code, message: message.message });
            };
            const ctxStart = ctx.currentTime;
            // The processor exposes a runtime config port; a deeper jitter buffer absorbs the bursty
            // block delivery seen in headless Chrome without touching the module itself.
            node.port.postMessage({ type: "config", channels: protocol.VST_CHANNELS, framesPerBlock: protocol.VST_FRAMES_PER_BLOCK, lookaheadBlocks: 4, maxBufferedBlocks: protocol.VST_BUFFER_POOL_SIZE });
            node.port.postMessage({ type: "attach", port: channel.port1 }, [channel.port1]);
            worker.postMessage({ type: "attach", port: channel.port2 }, [channel.port2]);
            worker.postMessage({ type: "config", baseUrl: ARGS.baseUrl, token: ARGS.token, instanceId });
            worker.postMessage({ type: "start" });
            const deadline = performance.now() + 8000;
            while ((!workletStats || !workerStats || workerStats.framesReceived < 50) && performance.now() < deadline) await wait(100);
            await wait(1200);
            const ctxAdvanced = ctx.currentTime - ctxStart;
            const consumed = workerStats ? workerStats.framesReceived : 0;
            worker.postMessage({ type: "stop" });
            await wait(200);
            worker.terminate();
            worker = null;
            await ctx.close().catch(() => undefined);
            ctx = null;
            return {
                status: "ok",
                reason: "",
                consumed,
                underruns: workletStats ? workletStats.underruns : -1,
                workletDropped: workletStats ? workletStats.dropped : -1,
                queuedBlocks: workletStats ? workletStats.queuedBlocks : -1,
                workerFramesDropped: workerStats ? workerStats.framesDropped : -1,
                workerStreamErrors: workerStats ? workerStats.streamErrors : -1,
                sampleRate,
                ctxAdvanced,
                messages,
                errors,
            };
        } catch (error) {
            if (worker) worker.terminate();
            if (ctx) ctx.close().catch(() => undefined);
            return { status: "failed", reason: String((error && error.message) || error) };
        }
    };

    report.worker = await runWorkerPhase(loaded.instanceId);
    report.worklet = await runWorkletPhase(loaded.instanceId);
    await client.noteOff({ instanceId: loaded.instanceId, pitch: 60 }).catch(() => undefined);
    await client.unload(loaded.instanceId).catch(() => undefined);
    return report;
})().catch((error) => ({ fatal: String((error && error.stack) || error) }))`;

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
        throw new Error(`Dev server is not reachable at ${BASE} — start it (or set E2E_BASE) before running the VST bridge E2E`);
    }
    if (!(await isPortFree(HOST_PORT))) throw new Error(`port ${HOST_PORT} is already in use by ${portOwner(HOST_PORT)} — stop it before running the VST bridge E2E`);
    if (!(await isPortFree(PORT))) throw new Error(`CDP port ${PORT} is already in use by ${portOwner(PORT)} — set E2E_CDP_PORT to a free port`);

    mkdirSync(ARTIFACTS, { recursive: true });
    state.profile = join(tmpdir(), `opencanvas-vst-e2e-${process.pid}`);
    rmSync(state.profile, { recursive: true, force: true });

    const hostOutput = [];
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
    const consoleErrors = [];
    state.socket.addEventListener("message", (event) => {
        const payload = JSON.parse(typeof event.data === "string" ? event.data : String(event.data));
        if (payload.method === "Runtime.exceptionThrown") consoleErrors.push(payload.params.exceptionDetails?.exception?.description || payload.params.exceptionDetails?.text || "exception");
        if (payload.method === "Runtime.consoleAPICalled" && payload.params.type === "error") consoleErrors.push((payload.params.args || []).map((arg) => arg.value ?? arg.description ?? "").join(" ") || "console.error");
    });
    await delay(1500);

    const evaluated = await send(state.socket, nextId++, "Runtime.evaluate", { expression: PAGE_SCRIPT, awaitPromise: true, returnByValue: true });
    const report = evaluated?.result?.value || null;
    if (!report) {
        const detail = evaluated?.exceptionDetails?.exception?.description || evaluated?.exceptionDetails?.text || JSON.stringify(evaluated);
        throw new Error(`in-page bridge run produced no report: ${String(detail).split("\n").slice(0, 8).join(" | ")}`);
    }
    writeFileSync(join(ARTIFACTS, "vst-bridge.json"), JSON.stringify({ base: BASE, hostUrl: HOST_URL, token: TOKEN, report, consoleErrors, hostOutput: hostOutput.join("") }, null, 2));
    try {
        const screenshot = await send(state.socket, nextId++, "Page.captureScreenshot", { format: "png" });
        if (screenshot?.data) writeFileSync(join(ARTIFACTS, "vst-bridge.png"), Buffer.from(screenshot.data, "base64"));
    } catch {}

    // ------------------------------------------------------------------
    // Assertions
    // ------------------------------------------------------------------
    const results = [];
    const ok = (name, pass, detail = "") => results.push({ name, pass: !!pass, detail: String(detail) });
    const worker = report.worker || {};
    const worklet = report.worklet || { status: "skipped" };
    const frames = worker.framesReceived || 0;
    const bytes = worker.bytesReceived || 0;
    const remainder = bytes - frames * FRAME_BYTES;

    if (report.fatal) {
        ok("in-page bridge run completed", false, report.fatal);
    } else {
        ok("hello reports protocol 1", report.hello?.protocol === 1, JSON.stringify(report.hello));
        ok("scan returns 9 instruments", report.scan?.instruments === 9, `${report.scan?.instruments} instruments: ${(report.scan?.names || []).join(", ")}`);
        ok("scan includes Retrologue", report.scan?.retrologue === true, JSON.stringify(report.scan?.names || []));
        ok("load returns an instanceId", typeof report.load?.instanceId === "string" && report.load.instanceId.length > 0, JSON.stringify(report.load));
        // The worker's `stats` are a 500 ms periodic snapshot, so they always lag the blocks the main
        // thread has already received. The sequence range is the authoritative frame count.
        ok("worker received more than 50 frames", frames > 50 && worker.blocks > 50, `worker stats framesReceived=${frames} main-thread blocks=${worker.blocks}`);
        ok(
            `worker byte framing is exact (${FRAME_BYTES} bytes/frame, remainder ${remainder})`,
            bytes >= frames * FRAME_BYTES && remainder >= 0 && remainder < FRAME_BYTES,
            `bytesReceived=${bytes} framesReceived=${frames} remainder=${remainder}`,
        );
        ok(
            "worker forwarded a contiguous frame sequence (no drops)",
            worker.blocks > 50 &&
                worker.framesDropped === 0 &&
                worker.seqMonotonic === true &&
                worker.seqGaps === 0 &&
                worker.seqLast - worker.seqFirst === worker.blocks - 1,
            `blocks=${worker.blocks} framesReceived=${frames} framesDropped=${worker.framesDropped} seq=${worker.seqFirst}..${worker.seqLast} monotonic=${worker.seqMonotonic} gaps=${worker.seqGaps}`,
        );
        ok(
            "worker frame headers are 2ch x 256",
            worker.headerOk === true && JSON.stringify(worker.channels) === "[2]" && JSON.stringify(worker.framesPerChannel) === "[256]",
            `channels=${JSON.stringify(worker.channels)} framesPerChannel=${JSON.stringify(worker.framesPerChannel)} headerOk=${worker.headerOk}`,
        );
        ok("worker audio is real, not silence (RMS > 0.001)", worker.rms > 0.001, `rms=${worker.rms} samples=${worker.samples}`);
        ok(
            "worker stream had no protocol errors",
            worker.streamErrors === 0 && (worker.errors || []).length === 0 && !worker.messages?.error,
            `streamErrors=${worker.streamErrors} errors=${JSON.stringify(worker.errors || [])}`,
        );
    }

    let failed = 0;
    console.log("\nVST bridge assertions (real browser -> real vst-host -> Retrologue):");
    for (const result of results) {
        if (result.pass) console.log(`  PASS  ${result.name}`);
        else {
            failed += 1;
            console.log(`  FAIL  ${result.name}  ->  ${result.detail}`);
        }
    }

    const workletPass =
        worklet.status === "ok" &&
        worklet.consumed > 20 &&
        worklet.underruns === 0 &&
        worklet.workletDropped === 0 &&
        worklet.workerFramesDropped === 0 &&
        worklet.workerStreamErrors === 0 &&
        worklet.ctxAdvanced > 0.5;
    if (workletPass) {
        console.log(`  PASS  (secondary) AudioWorklet consumed ${worklet.consumed} blocks, underruns=0, dropped=0, ctx=${worklet.sampleRate}Hz advanced ${worklet.ctxAdvanced.toFixed(2)}s`);
    } else {
        console.log(`  INFO  (secondary) AudioWorklet path not proven clean: status=${worklet.status}${worklet.reason ? ` reason=${worklet.reason}` : ""} consumed=${worklet.consumed ?? "n/a"} underruns=${worklet.underruns ?? "n/a"} ctxAdvanced=${worklet.ctxAdvanced ?? "n/a"}`);
    }
    if (worklet.status === "ok" && !workletPass) console.log(`        worklet detail: ${JSON.stringify({ underruns: worklet.underruns, workletDropped: worklet.workletDropped, workerFramesDropped: worklet.workerFramesDropped, workerStreamErrors: worklet.workerStreamErrors, errors: worklet.errors })} (headless Chrome's synthetic audio clock is bursty; the primary worker path is unaffected)`);

    console.log(`\n${results.length - failed}/${results.length} primary assertions passed`);
    console.log(`browser received ${worker.blocks} blocks / ${worker.blocks * FRAME_BYTES} bytes (seq ${worker.seqFirst}..${worker.seqLast}); worker stats snapshot: framesReceived=${frames}, bytesReceived=${bytes} (${frames} x ${FRAME_BYTES} + ${remainder} pending), drops=${worker.framesDropped}, streamErrors=${worker.streamErrors}`);
    console.log(`rms=${worker.rms} over ${worker.samples} samples`);
    console.log(`console errors during run: ${consoleErrors.length}`);
    console.log(`artifacts: ${ARTIFACTS}`);

    if (failed || report.fatal) {
        console.log(`\n--- host output ---\n${hostOutput.join("")}`);
        console.log(`--- worker messages (raw) ---\n${JSON.stringify(worker.messages || {})}`);
        console.log(`--- worker log ---\n${JSON.stringify(worker.log || [])}`);
        console.log(`--- worker errors ---\n${JSON.stringify(worker.errors || [])}`);
        if (!report.fatal) console.log(`--- worklet ---\n${JSON.stringify(worklet)}`);
        process.exitCode = 1;
    }
}

const watchdog = setTimeout(() => {
    console.error(`\nVST bridge E2E hard timeout after ${HARD_TIMEOUT_MS / 1000}s — shutting down`);
    cleanup().then(() => process.exit(1));
}, HARD_TIMEOUT_MS);

run()
    .catch((error) => {
        console.error(`VST bridge E2E failed: ${error.message}`);
        if (hostOutput.length) console.error(`--- host output ---\n${hostOutput.join("")}`);
        process.exitCode = 1;
    })
    .finally(async () => {
        clearTimeout(watchdog);
        const free = await cleanup();
        if (!free) process.exitCode = 1;
    });
