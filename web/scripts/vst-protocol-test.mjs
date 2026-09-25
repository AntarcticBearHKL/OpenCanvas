#!/usr/bin/env node
// Protocol test: connects to the mock host, reads a fixed number of frames and asserts the frame
// header, byte-offset advance, and the decoded 440 Hz sine (RMS + zero-crossing frequency).
// Exits non-zero on any failure.
//
// Run the host first:  node scripts/vst-mock-host.mjs
// Then:                node scripts/vst-protocol-test.mjs
//
// Env: VST_BRIDGE_URL, VST_BRIDGE_TOKEN, VST_ORIGIN

import {
    VST_CHANNELS,
    VST_FRAME_HEADER_BYTES,
    VST_FRAMES_PER_BLOCK,
    VST_SAMPLE_RATE,
    frameByteLength,
    hashInstanceId,
    readFrame,
} from "../src/lib/canvas/audio-vst-protocol.ts";

const BASE = (process.env.VST_BRIDGE_URL || "http://127.0.0.1:3211").replace(/\/+$/, "");
const TOKEN = process.env.VST_BRIDGE_TOKEN || "dev-vst-token";
const ORIGIN = process.env.VST_ORIGIN || "http://localhost:3000";
const INSTANCE = "test-instance";
const FRAME_COUNT = 40;
const SINE_HZ = 440;
const SINE_AMPLITUDE = 0.5;
const EXPECTED_RMS = SINE_AMPLITUDE * Math.SQRT1_2;

const failures = [];

function check(name, condition, detail = "") {
    if (condition) console.log(`  ok    ${name}`);
    else {
        console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
        failures.push(name);
    }
}

async function main() {
    console.log(`Connecting to ${BASE} (instance "${INSTANCE}", origin ${ORIGIN})`);
    const controller = new AbortController();
    const url = `${BASE}/audio?instance=${encodeURIComponent(INSTANCE)}&token=${encodeURIComponent(TOKEN)}`;
    const response = await fetch(url, { headers: { origin: ORIGIN }, signal: controller.signal });

    check("GET /audio returns 200", response.ok, `status ${response.status}`);
    check("content-type is application/octet-stream", (response.headers.get("content-type") || "").includes("application/octet-stream"));
    if (!response.ok || !response.body) return finish();

    const reader = response.body.getReader();
    const frames = [];
    const samples = [];
    let pending = new Uint8Array(0);
    let expectedSeq = 0;
    let firstHash = null;
    let headersOk = true;
    let offsetsOk = true;
    const expectedByteLength = frameByteLength(VST_CHANNELS, VST_FRAMES_PER_BLOCK);

    while (frames.length < FRAME_COUNT) {
        const { value, done } = await reader.read();
        if (done) break;
        if (!value) continue;
        const merged = new Uint8Array(pending.length + value.length);
        merged.set(pending);
        merged.set(value, pending.length);
        const view = new DataView(merged.buffer, merged.byteOffset, merged.byteLength);
        let cursor = 0;
        while (frames.length < FRAME_COUNT) {
            const frame = readFrame(view, cursor);
            if (!frame) break;
            if (firstHash === null) firstHash = frame.instanceHash;
            if (frame.channels !== VST_CHANNELS || frame.framesPerChannel !== VST_FRAMES_PER_BLOCK || frame.instanceHash !== hashInstanceId(INSTANCE) || frame.seq !== expectedSeq) headersOk = false;
            // Offsets are relative to the current (possibly reassembled) view, so validate against `cursor`.
            if (frame.dataOffset !== cursor + VST_FRAME_HEADER_BYTES || frame.byteLength !== expectedByteLength || frame.nextOffset !== cursor + frame.byteLength) offsetsOk = false;
            expectedSeq += 1;
            frames.push(frame);
            const data = frame.dataOffset;
            for (let i = 0; i < frame.framesPerChannel; i++) samples.push(view.getFloat32(data + i * 4, true));
            cursor = frame.nextOffset;
        }
        pending = merged.slice(cursor);
    }
    controller.abort();

    console.log(`Received ${frames.length} frames / ${samples.length} samples (first header: hash=${firstHash}, seq=${frames[0]?.seq}, channels=${frames[0]?.channels}, frames=${frames[0]?.framesPerChannel})`);

    check(`read ${FRAME_COUNT} frames`, frames.length === FRAME_COUNT, `got ${frames.length}`);
    check("header fields are sane (channels/frames/hash/seq advance by 1)", headersOk);
    check("byte offsets advance correctly", offsetsOk);
    check("first frame instance hash matches instance id", firstHash === hashInstanceId(INSTANCE), `${firstHash} vs ${hashInstanceId(INSTANCE)}`);

    let sumSquares = 0;
    let crossings = 0;
    for (let i = 0; i < samples.length; i++) {
        sumSquares += samples[i] * samples[i];
        if (i > 0 && samples[i - 1] <= 0 && samples[i] > 0) crossings += 1;
    }
    const rms = Math.sqrt(sumSquares / Math.max(1, samples.length));
    const seconds = samples.length / VST_SAMPLE_RATE;
    const frequency = seconds > 0 ? crossings / seconds : 0;
    check(`RMS ~ ${EXPECTED_RMS.toFixed(4)} (amplitude ${SINE_AMPLITUDE})`, Math.abs(rms - EXPECTED_RMS) <= 0.01, `got ${rms.toFixed(4)}`);
    check(`frequency ~ ${SINE_HZ} Hz (±6 Hz)`, Math.abs(frequency - SINE_HZ) <= 6, `got ${frequency.toFixed(2)} Hz from ${crossings} crossings`);

    await reader.cancel().catch(() => undefined);
    finish();
}

function finish() {
    if (failures.length) {
        console.log(`\nFAIL — ${failures.length} assertion(s) failed: ${failures.join(", ")}`);
        process.exitCode = 1;
        return;
    }
    console.log("\nPASS — frame header, byte offsets, RMS and frequency all verified.");
}

main().catch((error) => {
    console.error(`\nFAIL — ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
});
