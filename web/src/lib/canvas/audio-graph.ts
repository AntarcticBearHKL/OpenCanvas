import * as Tone from "tone";

import { AUDIO_AUTOMATION_GAIN, AUDIO_AUTOMATION_PAN, audioAutomationSendTarget, automationEvents, automationKey, automationSendId, automationValueAt, clampAutomationValue } from "@/lib/canvas/audio-automation";
import { AUDIO_DEFAULT_PPQN, clampVelocity, instrumentPreset, noteName, sortNotes, ticksToSeconds } from "@/lib/canvas/audio-midi";
import { AUDIO_DEFAULT_TEMPO, audioRoutingCycle, audioTrackOutputId, canHostClips, canHostMidi, clampClipGain, clampGain, clampPan, computeAudibility } from "@/lib/canvas/audio-project";
import { loadAudioBuffer } from "@/lib/canvas/audio-waveform";
import type { CanvasAudioAutomationLane, CanvasAudioClip, CanvasAudioMidiRegion, CanvasAudioTrack } from "@/types/canvas";

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

export type AudioGraph = {
    strips: Map<string, AudioGraphStrip>;
    players: Map<string, Tone.Player>;
    synths: Map<string, Tone.PolySynth>;
    automated: Set<string>;
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

/**
 * The one shared graph builder: playback and offline export both render through it, so they cannot
 * diverge. `transport` schedules players on the Tone transport, `offline` starts them immediately
 * inside a `Tone.Offline` render. The mute/solo gate precedes the pre-send taps, so a mute or a
 * solo state silences pre- and post-fader sends alike.
 */
export function buildAudioGraph(doc: AudioGraphDoc, buffers: Map<string, Tone.ToneAudioBuffer>, options: { mode: "transport" | "offline"; meters?: boolean }): AudioGraph {
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

    // Instrument and MIDI tracks own one poly synth each, feeding the same strip input as their players.
    const synths = new Map<string, Tone.PolySynth>();
    tracks.forEach((track) => {
        if (!canHostMidi(track)) return;
        const strip = strips.get(track.id);
        if (!strip) return;
        const preset = instrumentPreset(track.instrument?.preset);
        const synth = new Tone.PolySynth(Tone.Synth, { oscillator: { type: preset.oscillator }, envelope: preset.envelope });
        synth.volume.value = preset.volume;
        synth.connect(strip.input);
        synths.set(track.id, synth);
    });

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
        regions.forEach((region) => {
            const synth = synths.get(region.trackId);
            if (!synth || region.durationTicks <= 0) return;
            const start = ticksToSeconds(region.startTicks, ppqn, tempo);
            sortNotes(region.notes).forEach((note) => {
                if (note.tick >= region.durationTicks) return;
                const at = start + ticksToSeconds(note.tick, ppqn, tempo);
                const length = Math.max(0.02, ticksToSeconds(note.durationTicks, ppqn, tempo));
                const pitch = noteName(note.pitch);
                const velocity = clampVelocity(note.velocity);
                if (options.mode === "offline") synth.triggerAttackRelease(pitch, length, at, velocity);
                else noteEvents.push(transport.schedule((time) => synth.triggerAttackRelease(pitch, length, time, velocity), at));
            });
        });
    };
    scheduleMidi(doc.regions ?? [], doc.ppqn ?? AUDIO_DEFAULT_PPQN, doc.tempo ?? AUDIO_DEFAULT_TEMPO);

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
        scheduleAutomation: rescheduleAutomation,
        scheduleMidi,
        clickMetronome,
        scheduleMetronome,
        dispose: () => {
            if (clickEvent) transport.clear(clickEvent);
            clickSynth?.dispose();
            transport.off("start", scheduleAutomation);
            transport.off("loop", scheduleAutomation);
            bindings.forEach((binding) => binding.events.forEach((id) => transport.clear(id)));
            noteEvents.forEach((id) => transport.clear(id));
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
