import * as Tone from "tone";

/**
 * GM-note drum kit synthesized from Tone percussion voices, so the `drum` preset needs no sample
 * downloads. Notes follow the General MIDI percussion map; unknown notes are voiced by range.
 */
export class DrumKit {
    private readonly output = new Tone.Gain(1);
    private readonly membrane = new Tone.MembraneSynth({ pitchDecay: 0.04, octaves: 5, volume: -3 }).connect(this.output);
    private readonly noise = new Tone.NoiseSynth({ noise: { type: "white" }, envelope: { attack: 0.001, decay: 0.16, sustain: 0, release: 0.02 }, volume: -12 }).connect(this.output);
    private readonly metal = new Tone.MetalSynth({ frequency: 320, envelope: { attack: 0.001, decay: 0.08, release: 0.02 }, harmonicity: 5.1, modulationIndex: 40, resonance: 4200, octaves: 1.5, volume: -24 }).connect(this.output);

    connect(destination: Tone.ToneAudioNode) {
        this.output.connect(destination);
    }

    /** Plays one GM drum note: kick/toms use the pitched membrane voice, snare/clap the noise voice, hats/cymbals the metal voice. */
    triggerAttackRelease(note: string, _duration: string | number, time?: number, velocity = 0.8) {
        const midi = Tone.Frequency(note).toMidi();
        const at = time ?? Tone.now();
        const v = Math.min(1, Math.max(0.05, velocity));
        const metal = (duration: string, vel: number) => this.metal.triggerAttackRelease("A5", duration, at, vel);
        if (midi === 35 || midi === 36) return this.membrane.triggerAttackRelease("C1", "8n", at, v);
        if (midi === 38 || midi === 40) return this.noise.triggerAttackRelease("16n", at, v);
        if (midi === 39) return this.noise.triggerAttackRelease("32n", at, v);
        if (midi >= 41 && midi <= 50) return this.membrane.triggerAttackRelease(note, "16n", at, v * 0.9);
        if (midi === 42 || midi === 44) return metal("32n", v * 0.8);
        if (midi === 46) return metal("8n", v * 0.8);
        if (midi === 49 || midi === 55 || midi === 57) return metal("2n", v * 0.9);
        if (midi === 51 || midi === 53 || midi === 59) return metal("8n", v * 0.7);
        if (midi < 41) return this.noise.triggerAttackRelease("16n", at, v);
        if (midi < 50) return this.membrane.triggerAttackRelease(note, "16n", at, v * 0.9);
        if (midi < 60) return metal("32n", v * 0.8);
        return metal("2n", v * 0.8);
    }

    dispose() {
        this.membrane.dispose();
        this.noise.dispose();
        this.metal.dispose();
        this.output.dispose();
    }
}
