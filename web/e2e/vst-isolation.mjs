// Crash-isolation end-to-end: proves that a plugin worker child can die without
// taking the server down, without touching other instances, and without leaving
// an orphan behind.
//
//   node e2e/vst-isolation.mjs
//
// Flow: start the real host, load Retrologue and confirm real audio flows over
// GET /audio; find the `--plugin-worker` child that hosts it and Stop-Process it
// externally; then assert (a) the server still answers `hello`, (b) the killed
// instance answers a clear failure (`worker_failed`/`worker_hang`/`worker_timeout`),
// (c) a second, independent instance still streams real audio, and (d) `--stop`
// leaves no worker process and frees port 3211.
//
// No Chrome and no dev server are needed (pure loopback HTTP + one PowerShell
// process query); the host and its workers are stopped before exit.
//
// Env: E2E_VST_HOST (default http://127.0.0.1:3211), E2E_VST_HOST_EXE, E2E_VST_TOKEN.

import { existsSync } from "node:fs";
import { execFileSync, spawn } from "node:child_process";
import { createServer } from "node:net";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";

const HOST_URL = process.env.E2E_VST_HOST || "http://127.0.0.1:3211";
const HOST_PORT = Number(new URL(HOST_URL).port || 3211);
const HOST_EXE = process.env.E2E_VST_HOST_EXE || fileURLToPath(new URL("../../vst-host/build/bin/vst-host.exe", import.meta.url));
const TOKEN = process.env.E2E_VST_TOKEN || `vst-isolation-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
const ORIGIN = "http://localhost:3000";
const PLUGIN_ID = process.env.E2E_VST_PLUGIN_ID || "CC3695D88FE74881B46E6CCFFB291CFF"; // Retrologue
const FRAME_BYTES = 16 + 2 * 256 * 4;
const HARD_TIMEOUT_MS = 180000;

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
        return `pid ${row.trim().split(/\s+/).pop()}`;
    } catch {
        return "unknown";
    }
}

/** pids of `vst-host.exe` children of `parentPid` whose command line names `instanceId` (or all workers). */
function workerPids(parentPid, instanceId = "") {
    const filter = `$_.ParentProcessId -eq ${parentPid} -and $_.CommandLine -like '*--plugin-worker*'` + (instanceId ? ` -and $_.CommandLine -like '*--plugin-worker ${instanceId} *'` : "");
    const script = `Get-CimInstance Win32_Process -Filter "Name='vst-host.exe'" | Where-Object { ${filter} } | Select-Object -ExpandProperty ProcessId`;
    try {
        return execFileSync("powershell", ["-NoProfile", "-Command", script], { encoding: "utf8" })
            .split(/\r?\n/)
            .map((line) => line.trim())
            .filter(Boolean)
            .map(Number);
    } catch {
        return [];
    }
}

async function rpc(type, params = {}) {
    const response = await fetch(`${HOST_URL}/rpc`, {
        method: "POST",
        headers: { "content-type": "application/json", origin: ORIGIN, authorization: `Bearer ${TOKEN}` },
        body: JSON.stringify({ id: Date.now() % 100000, type, ...params }),
    });
    const body = await response.json().catch(() => null);
    return { status: response.status, body };
}

/** Read `count` whole `/audio` frames, returning the frame count and the PCM RMS. */
async function readAudio(instanceId, count, timeoutMs = 15000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const response = await fetch(`${HOST_URL}/audio?instance=${encodeURIComponent(instanceId)}&token=${encodeURIComponent(TOKEN)}`, {
            headers: { origin: ORIGIN },
            signal: controller.signal,
        });
        if (!response.ok || !response.body) return { status: response.status, frames: 0, rms: 0, bytes: 0 };
        const reader = response.body.getReader();
        let pending = new Uint8Array(0);
        let frames = 0;
        let bytes = 0;
        let sumSquares = 0;
        let samples = 0;
        while (frames < count) {
            const { value, done } = await reader.read();
            if (done) break;
            if (!value) continue;
            const merged = new Uint8Array(pending.length + value.length);
            merged.set(pending);
            merged.set(value, pending.length);
            let cursor = 0;
            while (frames < count && cursor + 16 <= merged.length) {
                const view = new DataView(merged.buffer, merged.byteOffset + cursor, merged.byteLength - cursor);
                const channels = view.getUint32(8, true);
                const framesPerChannel = view.getUint32(12, true);
                const frameLength = 16 + channels * framesPerChannel * 4;
                if (cursor + frameLength > merged.length) break;
                for (let i = 0; i < channels * framesPerChannel; i += 1) {
                    const sample = view.getFloat32(16 + i * 4, true);
                    sumSquares += sample * sample;
                    samples += 1;
                }
                frames += 1;
                bytes += frameLength;
                cursor += frameLength;
            }
            pending = merged.slice(cursor);
        }
        await reader.cancel().catch(() => undefined);
        return { status: response.status, frames, bytes, rms: samples ? Math.sqrt(sumSquares / samples) : 0 };
    } finally {
        clearTimeout(timer);
    }
}

const state = { host: null };
const hostOutput = [];

async function stopProcess(child, label) {
    if (!child || child.exitCode !== null) return;
    child.kill();
    for (let i = 0; i < 20 && child.exitCode === null; i++) await delay(150);
    if (child.exitCode === null && process.platform === "win32") {
        try {
            execFileSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore" });
        } catch {}
    }
    console.log(`${label}: stopped (pid ${child.pid})`);
}

async function cleanup() {
    // Prefer the documented graceful stop; fall back to killing the process tree.
    if (state.host && state.host.exitCode === null) {
        try {
            execFileSync(HOST_EXE, ["--stop"], { stdio: "ignore", timeout: 20000 });
        } catch {}
        for (let i = 0; i < 40 && state.host.exitCode === null; i++) await delay(150);
    }
    await stopProcess(state.host, "vst-host");
    state.host = null;
    const free = await waitPortFree(HOST_PORT, 8000);
    console.log(free ? `port ${HOST_PORT} free: yes` : `port ${HOST_PORT} free: NO — still occupied by ${portOwner(HOST_PORT)}`);
    return free;
}

async function run() {
    if (!existsSync(HOST_EXE)) throw new Error(`vst-host executable not found at ${HOST_EXE} (build vst-host first)`);
    if (!(await isPortFree(HOST_PORT))) throw new Error(`port ${HOST_PORT} is already in use by ${portOwner(HOST_PORT)} — stop it before running the isolation E2E`);

    state.host = spawn(HOST_EXE, [], {
        env: { ...process.env, VST_HOST_TOKEN: TOKEN, VST_HOST_ORIGINS: ORIGIN },
        stdio: ["ignore", "pipe", "pipe"],
    });
    state.host.stdout.on("data", (data) => hostOutput.push(String(data)));
    state.host.stderr.on("data", (data) => hostOutput.push(`[stderr] ${String(data)}`));

    let ready = false;
    let lastError = "";
    for (let attempt = 0; attempt < 60 && !ready; attempt++) {
        if (state.host.exitCode !== null) break;
        try {
            const hello = await rpc("hello");
            ready = hello.status === 200 && hello.body?.ok === true;
            if (!ready) lastError = `${hello.status} ${JSON.stringify(hello.body)}`;
        } catch (error) {
            lastError = error.message;
            await delay(250);
        }
    }
    if (!ready) throw new Error(`vst-host did not become ready at ${HOST_URL}: ${lastError}\n${hostOutput.join("")}`);

    const results = [];
    const ok = (name, pass, detail = "") => results.push({ name, pass: !!pass, detail: String(detail) });

    // ---- 1. first instance: real audio through a real worker ------------------
    const loadedA = await rpc("load", { pluginId: PLUGIN_ID });
    const instanceA = loadedA.body?.instanceId || "";
    ok("first load returns an instanceId", loadedA.status === 200 && !!instanceA, `status=${loadedA.status} body=${JSON.stringify(loadedA.body)}`);
    await rpc("noteOn", { instanceId: instanceA, pitch: 60, velocity: 100 });
    const audioA = await readAudio(instanceA, 40);
    ok("first instance streams real audio", audioA.frames >= 40 && audioA.rms > 0.001, `frames=${audioA.frames} rms=${audioA.rms.toFixed(5)} bytes=${audioA.bytes}`);
    ok("first instance frame framing is exact", audioA.bytes === audioA.frames * FRAME_BYTES, `bytes=${audioA.bytes} frames=${audioA.frames}`);

    // ---- 2. kill its worker externally ---------------------------------------
    let workerA = [];
    for (let attempt = 0; attempt < 40 && workerA.length === 0; attempt++) {
        workerA = workerPids(state.host.pid, instanceA);
        if (workerA.length === 0) await delay(250);
    }
    ok("the loaded instance runs in its own --plugin-worker child", workerA.length === 1, `workers=${JSON.stringify(workerA)} parent=${state.host.pid}`);
    if (workerA.length !== 1) throw new Error(`expected exactly one worker for instance ${instanceA}, got ${JSON.stringify(workerA)}`);
    execFileSync("powershell", ["-NoProfile", "-Command", `Stop-Process -Id ${workerA[0]} -Force`], { stdio: "ignore" });
    console.log(`killed plugin worker pid ${workerA[0]} (instance ${instanceA})`);
    await delay(500);

    // ---- 3. the server survives and reports the failure clearly --------------
    const helloAfter = await rpc("hello");
    ok("server is still responsive after the worker was killed (hello 200)", helloAfter.status === 200 && helloAfter.body?.ok === true, `status=${helloAfter.status} body=${JSON.stringify(helloAfter.body)}`);

    const failed = await rpc("paramList", { instanceId: instanceA });
    const failedCode = failed.body?.error?.code || "";
    const failedMessage = failed.body?.error?.message || "";
    ok(
        "killed instance reports a clear failure",
        failed.status === 500 && ["worker_failed", "worker_hung", "worker_timeout"].includes(failedCode) && /worker|进程/i.test(failedMessage),
        `status=${failed.status} code=${failedCode} message=${failedMessage}`,
    );
    const audioDead = await readAudio(instanceA, 1, 4000);
    ok("killed instance no longer streams", audioDead.status === 500, `status=${audioDead.status}`);

    // ---- 4. a second, independent instance keeps working ---------------------
    const loadedB = await rpc("load", { pluginId: PLUGIN_ID });
    const instanceB = loadedB.body?.instanceId || "";
    ok("second, independent load succeeds", loadedB.status === 200 && !!instanceB && instanceB !== instanceA, `status=${loadedB.status} instanceId=${instanceB}`);
    await rpc("noteOn", { instanceId: instanceB, pitch: 64, velocity: 100 });
    const audioB = await readAudio(instanceB, 40);
    ok("second instance streams real audio after the first worker died", audioB.frames >= 40 && audioB.rms > 0.001, `frames=${audioB.frames} rms=${audioB.rms.toFixed(5)}`);

    const unloadA = await rpc("unload", { instanceId: instanceA });
    ok("killed instance can still be unloaded", unloadA.status === 200, `status=${unloadA.status} body=${JSON.stringify(unloadA.body)}`);
    const unloadB = await rpc("unload", { instanceId: instanceB });
    ok("second instance unloads cleanly", unloadB.status === 200, `status=${unloadB.status}`);

    // ---- 5. --stop terminates workers: no orphans ---------------------------
    let stopOutput = "";
    try {
        stopOutput = execFileSync(HOST_EXE, ["--stop"], { encoding: "utf8", timeout: 20000 });
    } catch (error) {
        stopOutput = String(error?.stdout || error?.message || "");
    }
    for (let i = 0; i < 40 && state.host.exitCode === null; i++) await delay(150);
    const freeAfterStop = await waitPortFree(HOST_PORT, 8000);
    ok("--stop frees port 3211", freeAfterStop, portOwner(HOST_PORT));
    const orphans = workerPids(state.host.pid);
    ok("no plugin worker is left behind after --stop", orphans.length === 0, `workers=${JSON.stringify(orphans)} stop=${stopOutput.trim().split("\n").pop()}`);
    await stopProcess(state.host, "vst-host");
    state.host = null;

    let failedCount = 0;
    console.log("\nVST isolation assertions (kill the plugin worker, keep the server):");
    for (const result of results) {
        if (result.pass) console.log(`  PASS  ${result.name}`);
        else {
            failedCount += 1;
            console.log(`  FAIL  ${result.name}  ->  ${result.detail}`);
        }
    }
    console.log(`\n${results.length - failedCount}/${results.length} assertions passed`);
    if (failedCount) {
        console.log(`\n--- host output ---\n${hostOutput.join("")}`);
        process.exitCode = 1;
    }
}

const watchdog = setTimeout(() => {
    console.error(`\nVST isolation E2E hard timeout after ${HARD_TIMEOUT_MS / 1000}s — shutting down`);
    cleanup().then(() => process.exit(1));
}, HARD_TIMEOUT_MS);

run()
    .catch((error) => {
        console.error(`VST isolation E2E failed: ${error.message}`);
        if (hostOutput.length) console.error(`--- host output ---\n${hostOutput.join("")}`);
        process.exitCode = 1;
    })
    .finally(async () => {
        clearTimeout(watchdog);
        const free = await cleanup();
        if (!free) process.exitCode = 1;
    });
