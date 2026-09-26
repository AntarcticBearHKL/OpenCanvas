import * as Tone from "tone";

import { AUDIO_AUTOMATION_GAIN, AUDIO_AUTOMATION_PAN, audioAutomationSendTarget, automationEvents, automationKey, automationSendId, automationValueAt, clampAutomationValue } from "@/lib/canvas/audio-automation";
import { AUDIO_DEFAULT_PPQN, clampPitch, clampVelocity, instrumentPreset, noteName, sortNotes, ticksToSeconds } from "@/lib/canvas/audio-midi";
import { AUDIO_DEFAULT_TEMPO, audioRoutingCycle, audioTrackOutputId, canHostClips, canHostMidi, clampClipGain, clampGain, clampPan, computeAudibility, isVst3Instrument } from "@/lib/canvas/audio-project";
import { createVstClient, createVstStreamWorker, VST_WORKLET_PROCESSOR, VST_WORKLET_URL, type VstClient } from "@/lib/canvas/audio-vst";
import { VST_BUFFER_POOL_SIZE, VST_CHANNELS } from "@/lib/canvas/audio-vst-protocol";
import { loadAudioBuffer } from "@/lib/canvas/audio-waveform";
import { readVstState } from "@/services/file-storage";
import type { CanvasAudioAutomationLane, CanvasAudioClip, CanvasAudioMidiRegion, CanvasAudioTrack, CanvasAudioVst3Effect, CanvasAudioVst3Instrument } from "@/types/canvas";

/** Everything the graph needs from the audio document. */
export type AudioGraphDoc = { tracks: CanvasAudioTrack[]; clips: CanvasAudioClip[]; masterGain: number; automation?: CanvasAudioAutomationLane[]; regions?: CanvasAudioMidiRegion[]; ppqn?: number; tempo?: number };

/** Click state: `timeSignature` is passed on every call so a live meter change never leaves a stale interval. */
export type AudioMetronomeState = { enabled: boolean; volumeDb: number; timeSignature: { numerator: number; denominator: number } };

/** One channel strip: input → gate → pre-send taps → fader → panner → post-send taps → output. */
export type AudioGraphStrip = {
    input: Tone.Gain;
    gate: Tone.Gain;
    gain: Tone.Gain;
    panner: Tone.Panner;
    meter?: Tone.Meter;
    preSends: Map<string, Tone.Gain>;
    postSends: Map<string, Tone.Gain>;
};

/** Native VST3 source state; the attach is asynchronous, so the fields fill in after `buildAudioGraph` returned. */
export type AudioGraphVstSource = {
    pluginId: string;
    /** `pending` until the attach resolves; `ready` once the host streams; `bounced` when an offline render plays a pre-rendered host stem; `offline` when a mixdown had no stem; `failed` leaves only this track silent. */
    status: "pending" | "ready" | "bounced" | "offline" | "failed";
    instanceId?: string;
    /** Failure text for a `failed` source, or the skipped reason for an `offline` one. */
    error?: string;
    framesReceived?: number;
    framesDropped?: number;
    droppedBlocks?: number;
    underruns?: number;
    streamErrors?: number;
};

/** Native VST3 effect state; like the instrument source, the attach is asynchronous and soft-fails. */
export type AudioGraphVstEffectSource = {
    pluginId: string;
    /** `pending` until the attach resolves; `ready` once the host streams; `failed` restores the dry path. */
    status: "pending" | "ready" | "failed";
    instanceId?: string;
    error?: string;
    framesUploaded?: number;
    framesDropped?: number;
    uploadErrors?: number;
    inputCaptured?: number;
    inputDropped?: number;
};

export type AudioGraph = {
    strips: Map<string, AudioGraphStrip>;
    players: Map<string, Tone.Player>;
    synths: Map<string, Tone.PolySynth>;
    automated: Set<string>;
    /** Native VST3 sources by track id; empty without vst3 instruments, and a failed attach only silences its own track. */
    vstSources: Map<string, AudioGraphVstSource>;
    /** Inline VST3 effects by track id; empty without a `vst3Effect`, and a failed attach leaves the dry path. */
    vstEffects: Map<string, AudioGraphVstEffectSource>;
    /** Re-schedules the ramp events of a new automation state without touching strips or players. */
    scheduleAutomation: (automation: CanvasAudioAutomationLane[]) => void;
    /** Re-schedules the notes of a new MIDI region state without rebuilding the synths. */
    scheduleMidi: (regions: CanvasAudioMidiRegion[], ppqn: number, tempo: number) => void;
    /** Count-in click at an absolute audio-context time; always built in transport mode, even with the click off. */
    clickMetronome: (time: number, accent: boolean) => void;
    /** Starts, stops or re-volumes the transport click without rebuilding the graph. */
    scheduleMetronome: (state: AudioMetronomeState) => void;
    dispose: () => void;
};

type AutomationParam = Tone.Param<"gain"> | Tone.Param<"audioRange">;
type AutomationBinding = { param: AutomationParam; target: string; points: CanvasAudioAutomationLane["points"]; events: number[] };

/** One attached native bridge: the streaming worker, the worklet fed by it, and the main-thread note timers. */
type VstBridge = {
    client: VstClient;
    worker: Worker;
    node: AudioWorkletNode;
    source: AudioGraphVstSource;
    instanceId: string;
    held: Set<number>;
    timers: number[];
};

/** One inline effect: the same worker/worklet pair, owned by the strip it is inserted into. */
type VstEffectBridge = {
    client: VstClient;
    worker: Worker;
    node: AudioWorkletNode;
    source: AudioGraphVstEffectSource;
    instanceId: string;
    strip: AudioGraphStrip;
};

/** Load each clip source once, keyed by source node id; unreadable sources are skipped. */
export async function loadAudioGraphBuffers(clips: CanvasAudioClip[], sources: Record<string, string>) {
    const urls = Array.from(new Set(clips.map((clip) => sources[clip.sourceNodeId]).filter(Boolean)));
    const loaded = new Map<string, Tone.ToneAudioBuffer>();
    await Promise.all(
        urls.map(async (url) => {
            // Decoded once per source into the bounded cache that the waveform peaks read from as well.
            const buffer = await loadAudioBuffer(url);
            if (buffer) loaded.set(url, new Tone.ToneAudioBuffer(buffer));
        }),
    );
    const buffers = new Map<string, Tone.ToneAudioBuffer>();
    clips.forEach((clip) => {
        const url = sources[clip.sourceNodeId];
        const buffer = url ? loaded.get(url) : undefined;
        if (buffer && !buffers.has(clip.sourceNodeId)) buffers.set(clip.sourceNodeId, buffer);
    });
    return buffers;
}

/** MIDI velocity 1..127 for the host; the document's 0..1 velocity is scaled, never rounded to silence. */
function vstVelocity(velocity: number) {
    return Math.min(127, Math.max(1, Math.round(clampVelocity(velocity) * 127)));
}

export type AudioVstNote = { trackId: string; pitch: number; velocity: number; start: number; length: number };

/** Absolute-time native note list of a region set; the exact tick/length/clamp math `scheduleMidi` uses. */
export function vstNoteSchedule(regions: CanvasAudioMidiRegion[], ppqn: number, tempo: number): AudioVstNote[] {
    const notes: AudioVstNote[] = [];
    regions.forEach((region) => {
        if (region.durationTicks <= 0) return;
        const start = ticksToSeconds(region.startTicks, ppqn, tempo);
        sortNotes(region.notes).forEach((note) => {
            if (note.tick >= region.durationTicks) return;
            notes.push({
                trackId: region.trackId,
                pitch: clampPitch(note.pitch),
                velocity: vstVelocity(note.velocity),
                start: start + ticksToSeconds(note.tick, ppqn, tempo),
                length: Math.max(0.02, ticksToSeconds(note.durationTicks, ppqn, tempo)),
            });
        });
    });
    return notes;
}

/**
 * The one shared graph builder: playback and offline export both render through it, so they cannot
 * diverge. `transport` schedules players on the Tone transport, `offline` starts them immediately
 * inside a `Tone.Offline` render. The mute/solo gate precedes the pre-send taps, so a mute or a
 * solo state silences pre- and post-fader sends alike.
 *
 * A track whose instrument is the vst3 variant is hosted by the native bridge instead of a poly
 * synth: the streaming worker owns the host connection, the worklet feeds the same `strip.input`,
 * and the track's notes go out as `noteOn`/`noteOff` at their transport times. The attach is
 * asynchronous and soft-fails into `vstSources`, so an unreachable host only silences that track.
 * A real-time native process cannot run inside `Tone.Offline`, so an offline export plays a stem
 * pre-rendered by the host (`vstStems`) through the same strip; without one it reports the skip.
 */
export function buildAudioGraph(doc: AudioGraphDoc, buffers: Map<string, Tone.ToneAudioBuffer>, options: { mode: "transport" | "offline"; meters?: boolean; vstStems?: Map<string, Tone.ToneAudioBuffer> }): AudioGraph {
    const { tracks, clips } = doc;
    const audible = computeAudibility(tracks);
    const strips = new Map<string, AudioGraphStrip>();
    const players = new Map<string, Tone.Player>();
    const masterId = tracks.find((track) => (track.type ?? "audio") === "master")?.id ?? "";

    tracks.forEach((track) => {
        const input = new Tone.Gain(1);
        const gate = new Tone.Gain(audible.get(track.id) === false ? 0 : 1);
        const gain = new Tone.Gain(track.id === masterId ? clampGain(doc.masterGain) : clampGain(track.gain));
        const panner = new Tone.Panner(clampPan(track.pan ?? 0));
        input.connect(gate);
        gate.connect(gain);
        gain.connect(panner);
        strips.set(track.id, { input, gate, gain, panner, meter: options.meters ? new Tone.Meter({ smoothing: 0.7, channelCount: 2 }) : undefined, preSends: new Map(), postSends: new Map() });
    });

    const master = masterId ? strips.get(masterId) : undefined;
    tracks.forEach((track) => {
        const strip = strips.get(track.id);
        if (!strip) return;
        if (track.id === masterId) {
            strip.panner.connect(Tone.getDestination());
            return;
        }
        const outputId = audioTrackOutputId(tracks, track);
        const output = outputId && !audioRoutingCycle(tracks, track.id, outputId) ? strips.get(outputId) : undefined;
        strip.panner.connect(output?.input ?? master?.input ?? Tone.getDestination());
    });

    tracks.forEach((track) => {
        const strip = strips.get(track.id);
        if (!strip) return;
        (track.sends ?? []).forEach((send) => {
            const target = send.enabled ? strips.get(send.targetTrackId) : undefined;
            if (!target) return;
            const tap = new Tone.Gain(clampGain(send.gain));
            (send.pre ? strip.gate : strip.panner).connect(tap);
            tap.connect(target.input);
            (send.pre ? strip.preSends : strip.postSends).set(send.id, tap);
        });
    });

    // Instrument and MIDI tracks own one poly synth each, feeding the same strip input as their players. A track
    // whose instrument is the vst3 variant owns a native bridge source instead: the streaming worker receives the
    // host's PCM and forwards it over a MessagePort straight to the worklet, and the worklet feeds the very same
    // `strip.input`, so gain, pan, mute/solo, sends and master keep working. The attach is asynchronous, never
    // throws, and only ever silences its own track.
    const synths = new Map<string, Tone.PolySynth>();
    const vstBridges = new Map<string, VstBridge>();
    const vstSources = new Map<string, AudioGraphVstSource>();
    const vstEffectBridges = new Map<string, VstEffectBridge>();
    const vstEffects = new Map<string, AudioGraphVstEffectSource>();
    let disposed = false;

    const clearVstTimers = (bridge: VstBridge) => {
        bridge.timers.forEach((id) => window.clearTimeout(id));
        bridge.timers.length = 0;
    };
    // A reschedule, loop, pause or stop moves playback away from the pending native note timers, so the timers are
    // dropped and every held note released; otherwise a host note could outlive its transport position.
    const panicVst = (bridge: VstBridge) => {
        clearVstTimers(bridge);
        bridge.held.forEach((pitch) => void bridge.client.noteOff({ instanceId: bridge.instanceId, pitch }).catch(() => undefined));
        bridge.held.clear();
    };
    const panicAllVst = () => vstBridges.forEach(panicVst);

    /** Fire `noteOn`/`noteOff` at the very transport time the PolySynth would have played the note, via real timers. */
    const scheduleVstNote = (bridge: VstBridge, pitch: number, velocity: number, time: number, length: number) => {
        if (bridge.source.status !== "ready") return;
        const delay = Math.max(0, (time - Tone.now()) * 1000);
        bridge.timers.push(
            window.setTimeout(() => {
                if (bridge.source.status !== "ready") return;
                bridge.held.add(pitch);
                void bridge.client.noteOn({ instanceId: bridge.instanceId, pitch, velocity }).catch(() => undefined);
            }, delay),
        );
        bridge.timers.push(
            window.setTimeout(() => {
                bridge.held.delete(pitch);
                void bridge.client.noteOff({ instanceId: bridge.instanceId, pitch }).catch(() => undefined);
            }, delay + length * 1000),
        );
    };

    const attachVstBridge = async (trackId: string, instrument: CanvasAudioVst3Instrument, strip: AudioGraphStrip, source: AudioGraphVstSource) => {
        let client: VstClient | null = null;
        let worker: Worker | null = null;
        let node: AudioWorkletNode | null = null;
        let instanceId = "";
        try {
            const context = strip.input.context;
            await context.addAudioWorkletModule(VST_WORKLET_URL);
            if (disposed) return;
            client = createVstClient();
            instanceId = (await client.load({ pluginId: instrument.pluginId })).instanceId;
            if (disposed) {
                void client.unload(instanceId).catch(() => undefined);
                return;
            }
            node = context.createAudioWorkletNode(VST_WORKLET_PROCESSOR, { numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [VST_CHANNELS] });
            worker = createVstStreamWorker();
            // PCM goes worker -> MessagePort -> worklet; the main thread only wires the channel and never touches a sample.
            const channel = new MessageChannel();
            node.port.postMessage({ type: "attach", port: channel.port1 }, [channel.port1]);
            worker.postMessage({ type: "attach", port: channel.port2 }, [channel.port2]);
            // A deeper jitter buffer than the processor default, matching the proven bridge test: delivery is bursty.
            node.port.postMessage({ type: "config", channels: VST_CHANNELS, lookaheadBlocks: 4, maxBufferedBlocks: VST_BUFFER_POOL_SIZE });
            node.port.onmessage = (event: MessageEvent<{ type?: string; underruns?: number; dropped?: number }>) => {
                if (event.data?.type !== "stats") return;
                source.underruns = event.data.underruns;
                source.droppedBlocks = event.data.dropped;
            };
            worker.onmessage = (event: MessageEvent<{ type?: string; framesReceived?: number; framesDropped?: number; streamErrors?: number; code?: string; message?: string }>) => {
                const message = event.data;
                if (!message) return;
                if (message.type === "stats") {
                    source.framesReceived = message.framesReceived;
                    source.framesDropped = message.framesDropped;
                    source.streamErrors = message.streamErrors;
                } else if (message.type === "error") {
                    source.status = "failed";
                    source.error = message.message || message.code || "VST stream error";
                }
            };
            worker.postMessage({ type: "config", baseUrl: client.baseUrl, token: client.token, instanceId });
            // Restore the instrument's own state before the stream starts, so the very first rendered block already
            // uses the preset the user had loaded. A missing blob or a host that rejects it stays soft: the track
            // keeps playing with the plug-in's default state instead of failing the whole attach.
            if (instrument.stateKey) {
                try {
                    const state = await readVstState(instrument.stateKey);
                    if (state !== null) await client.setState(instanceId, state);
                } catch (error) {
                    console.warn("VST3 plug-in state could not be restored", error);
                }
            }
            // The restore above awaits, so a dispose that happened meanwhile must still tear the fresh node down.
            if (disposed) {
                node.disconnect();
                node.port.close();
                worker.terminate();
                void client.unload(instanceId).catch(() => undefined);
                return;
            }
            worker.postMessage({ type: "start" });
            // The same strip input the players and synths feed, so the whole mixer chain stays in front of it.
            node.connect(strip.input.input);
            vstBridges.set(trackId, { client, worker, node, source, instanceId, held: new Set(), timers: [] });
            source.instanceId = instanceId;
            source.status = "ready";
        } catch (error) {
            // Soft failure: this track stays silent, the rest of the graph is untouched, and the reason is reported.
            source.status = "failed";
            source.error = error instanceof Error ? error.message : String(error);
            node?.disconnect();
            node?.port.close();
            worker?.terminate();
            if (client && instanceId) void client.unload(instanceId).catch(() => undefined);
        }
    };

    // An effect is inserted inline between `strip.input` and the gate, so everything feeding the track
    // (clips, synths, a vst3 instrument, monitor taps) passes through the plug-in and the whole mixer
    // chain after it — fader, pan, mute/solo, sends and master — keeps working unchanged. Only wired
    // after the attach succeeded: a pending or failed attach leaves the dry path exactly as before.
    const attachVstEffect = async (trackId: string, effect: CanvasAudioVst3Effect, strip: AudioGraphStrip, source: AudioGraphVstEffectSource) => {
        let client: VstClient | null = null;
        let worker: Worker | null = null;
        let node: AudioWorkletNode | null = null;
        let instanceId = "";
        let wired = false;
        const restoreDry = () => {
            if (!wired || !node) return;
            try {
                strip.input.disconnect(node);
            } catch {}
            try {
                node.disconnect(strip.gate.input);
            } catch {}
            strip.input.connect(strip.gate);
            wired = false;
        };
        try {
            const context = strip.input.context;
            await context.addAudioWorkletModule(VST_WORKLET_URL);
            if (disposed) return;
            client = createVstClient();
            instanceId = (await client.load({ pluginId: effect.pluginId, role: "effect" })).instanceId;
            if (disposed) {
                void client.unload(instanceId).catch(() => undefined);
                return;
            }
            node = context.createAudioWorkletNode(VST_WORKLET_PROCESSOR, { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [VST_CHANNELS] });
            worker = createVstStreamWorker();
            const channel = new MessageChannel();
            node.port.postMessage({ type: "attach", port: channel.port1 }, [channel.port1]);
            worker.postMessage({ type: "attach", port: channel.port2 }, [channel.port2]);
            node.port.postMessage({ type: "config", channels: VST_CHANNELS, lookaheadBlocks: 4, maxBufferedBlocks: VST_BUFFER_POOL_SIZE, effect: true });
            node.port.onmessage = (event: MessageEvent<{ type?: string; inputCaptured?: number; inputDropped?: number }>) => {
                if (event.data?.type !== "stats") return;
                source.inputCaptured = event.data.inputCaptured;
                source.inputDropped = event.data.inputDropped;
            };
            worker.onmessage = (event: MessageEvent<{ type?: string; framesUploaded?: number; framesDropped?: number; uploadErrors?: number; code?: string; message?: string }>) => {
                const message = event.data;
                if (!message) return;
                if (message.type === "stats") {
                    source.framesUploaded = message.framesUploaded;
                    source.framesDropped = message.framesDropped;
                    source.uploadErrors = message.uploadErrors;
                } else if (message.type === "error") {
                    source.error = message.message || message.code || "VST effect stream error";
                }
            };
            worker.postMessage({ type: "config", baseUrl: client.baseUrl, token: client.token, instanceId, role: "effect" });
            if (disposed) {
                node.port.close();
                worker.terminate();
                void client.unload(instanceId).catch(() => undefined);
                return;
            }
            worker.postMessage({ type: "start" });
            strip.input.disconnect(strip.gate);
            strip.input.connect(node);
            node.connect(strip.gate.input);
            wired = true;
            vstEffectBridges.set(trackId, { client, worker, node, source, instanceId, strip });
            source.instanceId = instanceId;
            source.status = "ready";
        } catch (error) {
            restoreDry();
            source.status = "failed";
            source.error = error instanceof Error ? error.message : String(error);
            node?.disconnect();
            node?.port.close();
            worker?.terminate();
            if (client && instanceId) void client.unload(instanceId).catch(() => undefined);
        }
    };

    tracks.forEach((track) => {
        if (!canHostMidi(track)) return;
        const strip = strips.get(track.id);
        if (!strip) return;
        const instrument = track.instrument;
        if (isVst3Instrument(instrument)) {
            const source: AudioGraphVstSource = { pluginId: instrument.pluginId, status: "pending" };
            vstSources.set(track.id, source);
            if (options.mode === "offline") {
                // A pre-rendered host stem already carries absolute note timing, so it plays from 0 into the very
                // strip the live bridge would feed, keeping fader / pan / mute / solo / sends in front of it.
                const stem = options.vstStems?.get(track.id);
                if (stem) {
                    const player = new Tone.Player(stem);
                    player.connect(strip.input);
                    player.start(0);
                    players.set(`stem:${track.id}`, player);
                    source.status = "bounced";
                    return;
                }
                // Without a stem (host unreachable or the render failed) the track stays silent, as before.
                source.status = "offline";
                source.error = "offline mixdown skips real-time VST3 instruments";
                return;
            }
            void attachVstBridge(track.id, instrument, strip, source);
            return;
        }
        const preset = instrumentPreset(instrument?.preset);
        const synth = new Tone.PolySynth(Tone.Synth, { oscillator: { type: preset.oscillator }, envelope: preset.envelope });
        synth.volume.value = preset.volume;
        synth.connect(strip.input);
        synths.set(track.id, synth);
    });

    // Inline effects are transport-only: a real-time native plug-in cannot run inside Tone.Offline, so an
    // offline export renders the track dry (the same reason a vst3 instrument needs a host-bounced stem).
    if (options.mode === "transport") {
        tracks.forEach((track) => {
            const effect = track.vst3Effect;
            const strip = strips.get(track.id);
            if (!effect || !strip || track.id === masterId) return;
            const source: AudioGraphVstEffectSource = { pluginId: effect.pluginId, status: "pending" };
            vstEffects.set(track.id, source);
            void attachVstEffect(track.id, effect, strip, source);
        });
    }

    const automated = new Set<string>();
    const bindings: AutomationBinding[] = [];
    const collectBindings = (lanes: CanvasAudioAutomationLane[]) => {
        bindings.length = 0;
        automated.clear();
        lanes.forEach((lane) => {
            if (!lane.enabled || !lane.points.length) return;
            const strip = strips.get(lane.trackId);
            if (!strip) return;
            const param = lane.target === AUDIO_AUTOMATION_GAIN ? strip.gain.gain : lane.target === AUDIO_AUTOMATION_PAN ? strip.panner.pan : automationSendNode(strip, lane.target)?.gain;
            if (!param) return;
            bindings.push({ param, target: lane.target, points: lane.points, events: [] });
            automated.add(automationKey(lane.trackId, lane.target));
        });
    };

    // Automation is scheduled as AudioParam events on the transport, so a seek or a cycle rebuilds the ramps
    // instead of leaving stale ones; the offline transport runs the very same path during `Tone.Offline`.
    const transport = Tone.getTransport();
    const scheduleAutomation = () => {
        const at = transport.seconds;
        bindings.forEach((binding) => {
            binding.events.forEach((id) => transport.clear(id));
            binding.events = [];
            const events = automationEvents(binding.points);
            if (!events.length) return;
            binding.param.setValueAtTime(clampAutomationValue(binding.target, automationValueAt(binding.points, at)), Tone.now());
            events.forEach((event) => {
                if (event.time <= at) return;
                const value = clampAutomationValue(binding.target, event.value);
                binding.events.push(
                    transport.schedule((time) => {
                        if (event.kind === "ramp") binding.param.linearRampToValueAtTime(value, time);
                        else binding.param.setValueAtTime(value, time);
                    }, event.time),
                );
            });
        });
    };
    // Editing a point only re-collects the bindings and re-schedules, so automation never rebuilds the players.
    const rescheduleAutomation = (lanes: CanvasAudioAutomationLane[]) => {
        collectBindings(lanes);
        scheduleAutomation();
    };
    collectBindings(doc.automation ?? []);
    if (options.mode === "transport") {
        // Attached unconditionally so a lane added after the build needs no rebuild either.
        transport.on("start", scheduleAutomation);
        transport.on("loop", scheduleAutomation);
        scheduleAutomation();
    } else if (bindings.length) {
        transport.start(0);
    }

    // MIDI regions are ticks, so the same region state plays identically live and offline; the offline render triggers
    // its notes directly on the offline clock (as the players do), while the transport schedules them for playback.
    const noteEvents: number[] = [];
    const scheduleMidi = (regions: CanvasAudioMidiRegion[], ppqn: number, tempo: number) => {
        noteEvents.forEach((id) => transport.clear(id));
        noteEvents.length = 0;
        // Every reschedule invalidates the pending native note timers, so they are dropped and held notes released.
        panicAllVst();
        regions.forEach((region) => {
            const synth = synths.get(region.trackId);
            if (!synth || region.durationTicks <= 0) return;
            const start = ticksToSeconds(region.startTicks, ppqn, tempo);
            sortNotes(region.notes).forEach((note) => {
                if (note.tick >= region.durationTicks) return;
                const at = start + ticksToSeconds(note.tick, ppqn, tempo);
                const length = Math.max(0.02, ticksToSeconds(note.durationTicks, ppqn, tempo));
                const velocity = clampVelocity(note.velocity);
                const pitch = noteName(note.pitch);
                if (options.mode === "offline") synth.triggerAttackRelease(pitch, length, at, velocity);
                else noteEvents.push(transport.schedule((time) => synth.triggerAttackRelease(pitch, length, time, velocity), at));
            });
        });
        // The bridge reuses the same note list, tick math and length math as the synth path above; the offline
        // mixdown bounces its stems from that very list through `vstNoteSchedule`.
        vstNoteSchedule(regions, ppqn, tempo).forEach((note) => {
            const bridge = vstBridges.get(note.trackId);
            if (!bridge) return;
            noteEvents.push(transport.schedule((time) => scheduleVstNote(bridge, note.pitch, note.velocity, time, note.length), note.start));
        });
    };
    scheduleMidi(doc.regions ?? [], doc.ppqn ?? AUDIO_DEFAULT_PPQN, doc.tempo ?? AUDIO_DEFAULT_TEMPO);

    if (options.mode === "transport") {
        // A stop, pause or loop jumps the transport away from pending native note timers, so held notes are released.
        transport.on("stop", panicAllVst);
        transport.on("pause", panicAllVst);
        transport.on("loop", panicAllVst);
    }

    if (options.meters) strips.forEach((strip) => strip.meter && strip.panner.connect(strip.meter));

    // The click is a monitoring aid: it is built for playback only, so it can never land in an offline render.
    // The accent falls on the first beat of a bar from the transport's own ticks, so it follows a live tempo change.
    const clickSynth = options.mode === "transport" ? new Tone.Synth({ oscillator: { type: "square" }, envelope: { attack: 0.001, decay: 0.03, sustain: 0, release: 0.02 } }).toDestination() : null;
    let clickEvent = 0;
    const clickMetronome = (time: number, accent: boolean) => {
        clickSynth?.triggerAttackRelease(accent ? "C6" : "C5", "32n", time);
    };
    const scheduleMetronome = (state: AudioMetronomeState) => {
        if (clickEvent) {
            transport.clear(clickEvent);
            clickEvent = 0;
        }
        if (!clickSynth) return;
        clickSynth.volume.value = Math.min(0, Math.max(-60, state.volumeDb));
        if (!state.enabled) return;
        const denominator = state.timeSignature.denominator || 4;
        const ticksPerBar = (transport.PPQ * 4 * state.timeSignature.numerator) / denominator;
        clickEvent = transport.scheduleRepeat((time) => clickMetronome(time, ticksPerBar > 0 && transport.getTicksAtTime(time) % ticksPerBar === 0), `${denominator}n`, 0);
    };

    clips.forEach((clip) => {
        const strip = strips.get(clip.trackId);
        const track = tracks.find((item) => item.id === clip.trackId);
        const buffer = buffers.get(clip.sourceNodeId);
        if (!strip || !track || !canHostClips(track) || !buffer || clip.duration <= 0 || clip.muted) return;
        const player = new Tone.Player({ fadeIn: clip.fadeIn ?? 0, fadeOut: clip.fadeOut ?? 0 });
        const sourceDuration = buffer.duration;
        // A reversed clip needs a private buffer copy: Tone reverses the channel data in place.
        player.buffer = clip.reversed && sourceDuration > 0 ? buffer.slice(0) : buffer;
        if (clip.reversed && sourceDuration > 0) player.reverse = true;
        player.loop = Boolean(clip.loop) && sourceDuration > 0;
        if (player.loop) {
            player.loopStart = Math.min(clip.offset, Math.max(0, sourceDuration - 0.001));
            player.loopEnd = sourceDuration;
        }
        player.volume.value = Tone.gainToDb(clampClipGain(clip.gain ?? 1));
        player.connect(strip.input);
        if (options.mode === "transport") player.sync().start(clip.start, clip.offset, clip.duration);
        else player.start(clip.start, clip.offset, clip.duration);
        players.set(clip.id, player);
    });

    return {
        strips,
        players,
        synths,
        automated,
        vstSources,
        vstEffects,
        scheduleAutomation: rescheduleAutomation,
        scheduleMidi,
        clickMetronome,
        scheduleMetronome,
        dispose: () => {
            disposed = true;
            if (clickEvent) transport.clear(clickEvent);
            clickSynth?.dispose();
            transport.off("start", scheduleAutomation);
            transport.off("loop", scheduleAutomation);
            transport.off("stop", panicAllVst);
            transport.off("pause", panicAllVst);
            transport.off("loop", panicAllVst);
            bindings.forEach((binding) => binding.events.forEach((id) => transport.clear(id)));
            noteEvents.forEach((id) => transport.clear(id));
            vstBridges.forEach((bridge) => {
                panicVst(bridge);
                bridge.node.disconnect();
                bridge.node.port.close();
                bridge.worker.postMessage({ type: "stop" });
                bridge.worker.terminate();
                void bridge.client.unload(bridge.instanceId).catch(() => undefined);
            });
            vstBridges.clear();
            vstEffectBridges.forEach((bridge) => {
                bridge.node.disconnect();
                try {
                    bridge.strip.input.disconnect(bridge.node);
                } catch {}
                bridge.node.port.close();
                bridge.worker.postMessage({ type: "stop" });
                bridge.worker.terminate();
                void bridge.client.unload(bridge.instanceId).catch(() => undefined);
            });
            vstEffectBridges.clear();
            players.forEach((player) => player.dispose());
            synths.forEach((synth) => synth.dispose());
            strips.forEach((strip) => {
                strip.preSends.forEach((node) => node.dispose());
                strip.postSends.forEach((node) => node.dispose());
                strip.meter?.dispose();
                strip.panner.dispose();
                strip.gain.dispose();
                strip.gate.dispose();
                strip.input.dispose();
            });
        },
    };
}

function automationSendNode(strip: AudioGraphStrip, target: string) {
    const sendId = automationSendId(target);
    if (!sendId) return null;
    return strip.preSends.get(sendId) ?? strip.postSends.get(sendId) ?? null;
}

/** Live value of an automated parameter for the rAF readout; null when the graph has no such strip or tap. */
export function liveAutomationValue(graph: AudioGraph | null, trackId: string, target: string) {
    const strip = graph?.strips.get(trackId);
    if (!strip) return null;
    if (target === AUDIO_AUTOMATION_GAIN) return strip.gain.gain.value;
    if (target === AUDIO_AUTOMATION_PAN) return strip.panner.pan.value;
    return automationSendNode(strip, target)?.gain.value ?? null;
}

/** Imperative fader/pan move for a live drag; the document is written once on pointer release. */
export function applyLiveTrackMix(graph: AudioGraph | null, trackId: string, patch: { gain?: number; pan?: number }) {
    const strip = graph?.strips.get(trackId);
    if (!graph || !strip) return;
    if (patch.gain !== undefined && !graph.automated.has(automationKey(trackId, AUDIO_AUTOMATION_GAIN))) strip.gain.gain.value = clampGain(patch.gain);
    if (patch.pan !== undefined && !graph.automated.has(automationKey(trackId, AUDIO_AUTOMATION_PAN))) strip.panner.pan.value = clampPan(patch.pan);
}

/** Mixer-only update: faders, pan, mute/solo gates and send gains, without rebuilding players. */
export function applyAudioGraphMix(graph: AudioGraph, doc: AudioGraphDoc) {
    const audible = computeAudibility(doc.tracks);
    doc.tracks.forEach((track) => {
        const strip = graph.strips.get(track.id);
        if (!strip) return;
        const master = (track.type ?? "audio") === "master";
        if (!graph.automated.has(automationKey(track.id, AUDIO_AUTOMATION_GAIN))) strip.gain.gain.value = master ? clampGain(doc.masterGain) : clampGain(track.gain);
        if (!graph.automated.has(automationKey(track.id, AUDIO_AUTOMATION_PAN))) strip.panner.pan.value = clampPan(track.pan ?? 0);
        strip.gate.gain.value = audible.get(track.id) === false ? 0 : 1;
        (track.sends ?? []).forEach((send) => {
            const tap = strip.preSends.get(send.id) ?? strip.postSends.get(send.id);
            if (tap && !graph.automated.has(automationKey(track.id, audioAutomationSendTarget(send.id)))) tap.gain.value = send.enabled ? clampGain(send.gain) : 0;
        });
    });
}

/** Live take monitoring: the capture tap hangs off the strip's gate, so a mute or a solo still silences it. */
export function connectAudioGraphMonitor(graph: AudioGraph | null, trackId: string, source: Tone.Gain | null) {
    const strip = graph?.strips.get(trackId);
    if (!strip || !source) return () => undefined;
    source.connect(strip.gate);
    return () => source.disconnect(strip.gate);
}
