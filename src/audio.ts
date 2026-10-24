import type { TierDef } from './config';
import { chimePlan, leafPitches } from './audio-score';
import type { AudioPort } from './ports';
import { mulberry32, randRange, type Rng } from './rng';

/**
 * Sound, synthesised in the browser: no audio files, so nothing to license, host or disclose
 * beyond "synthesised". The engine is built on a BaseAudioContext so the same code runs live
 * (AudioContext) and offline (OfflineAudioContext, for the render test).
 *
 * Every public cue takes an optional `at` offset in seconds, used by the offline test to lay a
 * whole reveal on one timeline. Live play never passes it.
 */

type Param = AudioParam;

interface ToneOpts {
  type?: OscillatorType;
  f0: number;
  f1?: number;
  t: number;
  dur: number;
  gain: number;
  attack?: number;
  dest?: AudioNode;
}

interface NoiseOpts {
  t: number;
  dur: number;
  gain: number;
  filter: BiquadFilterType;
  f0: number;
  f1?: number;
  q?: number;
  attack?: number;
  dest?: AudioNode;
}

const FLOOR = 0.0001;

export class AudioEngine implements AudioPort {
  private ctx: BaseAudioContext | null = null;
  private master: GainNode | null = null;
  private bus: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private readonly rng: Rng = mulberry32(0xa11d10);
  private readonly makeContext: () => BaseAudioContext;
  private muted: boolean;
  private level = 0.85;

  /** `makeContext` is injectable so tests can supply an OfflineAudioContext. */
  constructor(opts: { muted?: boolean; makeContext?: () => BaseAudioContext } = {}) {
    this.muted = opts.muted ?? false;
    this.makeContext = opts.makeContext ?? (() => new AudioContext({ latencyHint: 'interactive' }));
  }

  get isMuted(): boolean {
    return this.muted;
  }

  get context(): BaseAudioContext | null {
    return this.ctx;
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.master && this.ctx) {
      this.master.gain.cancelScheduledValues(this.ctx.currentTime);
      this.master.gain.setTargetAtTime(muted ? 0 : this.level, this.ctx.currentTime, 0.008);
    }
  }

  /** Create the context on the first gesture and make sure it is running. Safe to call repeatedly. */
  unlock(): void {
    try {
      if (!this.ctx) this.build();
      const ctx = this.ctx;
      if (ctx && 'resume' in ctx && ctx.state === 'suspended' && !(ctx instanceof OfflineAudioContext)) void (ctx as AudioContext).resume();
    } catch {
      /* no WebAudio: the game is silent, not broken */
    }
  }

  suspend(): void {
    const ctx = this.ctx;
    if (ctx && ctx instanceof AudioContext && ctx.state === 'running') void ctx.suspend();
  }

  resume(): void {
    this.unlock();
  }

  /** Build the graph eagerly (the offline test calls this directly). */
  build(): void {
    if (this.ctx) return;
    const ctx = this.makeContext();
    this.ctx = ctx;

    const master = ctx.createGain();
    master.gain.value = this.muted ? 0 : this.level;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.knee.value = 14;
    comp.ratio.value = 5;
    comp.attack.value = 0.003;
    comp.release.value = 0.18;
    // last line of defence: a smooth tanh soft-clip, so overlapping cues (rapid taps over a fanfare) can never hard-clip
    const clip = ctx.createWaveShaper();
    const curve = new Float32Array(2048);
    for (let i = 0; i < curve.length; i++) curve[i] = Math.tanh((i / (curve.length - 1)) * 2 - 1);
    clip.curve = curve;
    master.connect(comp);
    comp.connect(clip);
    clip.connect(ctx.destination);

    const bus = ctx.createGain();
    bus.gain.value = 1;
    bus.connect(master);
    // a small generated room: the bells and the burst bloom instead of sounding dry
    const verb = ctx.createConvolver();
    verb.buffer = this.impulse(ctx, 1.5, 3.4);
    const send = ctx.createGain();
    send.gain.value = 0.28;
    bus.connect(send);
    send.connect(verb);
    verb.connect(master);

    this.master = master;
    this.bus = bus;
    this.noise = this.makeNoise(ctx, 2);
  }

  private impulse(ctx: BaseAudioContext, seconds: number, decay: number): AudioBuffer {
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (this.rng() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return buf;
  }

  private makeNoise(ctx: BaseAudioContext, seconds: number): AudioBuffer {
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = this.rng() * 2 - 1;
    return buf;
  }

  // ------------------------------------------------------------ primitives

  /** Start time for a cue: now, plus a few ms of scheduling slack, plus any test offset. */
  private start(at = 0): number {
    return (this.ctx?.currentTime ?? 0) + 0.006 + at;
  }

  private env(param: Param, t: number, attack: number, peak: number, dur: number): void {
    param.setValueAtTime(FLOOR, t);
    param.linearRampToValueAtTime(peak, t + Math.max(0.001, attack));
    param.exponentialRampToValueAtTime(FLOOR, t + dur);
  }

  private tone(o: ToneOpts): void {
    const ctx = this.ctx;
    const dest = o.dest ?? this.bus;
    if (!ctx || !dest) return;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = o.type ?? 'sine';
    osc.frequency.setValueAtTime(o.f0, o.t);
    if (o.f1 !== undefined && o.f1 !== o.f0) osc.frequency.exponentialRampToValueAtTime(Math.max(1, o.f1), o.t + o.dur);
    this.env(g.gain, o.t, o.attack ?? 0.004, o.gain, o.dur);
    osc.connect(g);
    g.connect(dest);
    osc.start(o.t);
    osc.stop(o.t + o.dur + 0.05);
  }

  private hiss(o: NoiseOpts): void {
    const ctx = this.ctx;
    const dest = o.dest ?? this.bus;
    if (!ctx || !dest || !this.noise) return;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = o.filter;
    f.Q.value = o.q ?? 0.8;
    f.frequency.setValueAtTime(o.f0, o.t);
    if (o.f1 !== undefined) f.frequency.exponentialRampToValueAtTime(Math.max(20, o.f1), o.t + o.dur);
    const g = ctx.createGain();
    this.env(g.gain, o.t, o.attack ?? 0.003, o.gain, o.dur);
    src.connect(f);
    f.connect(g);
    g.connect(dest);
    src.start(o.t, this.rng() * 1.5);
    src.stop(o.t + o.dur + 0.05);
  }

  /** A struck bell: a sine carrier with a decaying inharmonic modulator. */
  private bell(freq: number, t: number, dur: number, gain: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.bus) return;
    const car = ctx.createOscillator();
    const mod = ctx.createOscillator();
    const modGain = ctx.createGain();
    const g = ctx.createGain();
    car.type = 'sine';
    mod.type = 'sine';
    car.frequency.value = freq;
    mod.frequency.value = freq * 2.756;
    modGain.gain.setValueAtTime(freq * 1.4, t);
    modGain.gain.exponentialRampToValueAtTime(FLOOR + 0.01, t + dur * 0.5);
    this.env(g.gain, t, 0.003, gain, dur);
    mod.connect(modGain);
    modGain.connect(car.frequency);
    car.connect(g);
    g.connect(this.bus);
    car.start(t);
    mod.start(t);
    car.stop(t + dur + 0.05);
    mod.stop(t + dur + 0.05);
  }

  private pad(freqs: readonly number[], t: number, attack: number, dur: number, gain: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.bus) return;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 1400;
    const g = ctx.createGain();
    g.gain.setValueAtTime(FLOOR, t);
    g.gain.linearRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(FLOOR, t + dur);
    lp.connect(g);
    g.connect(this.bus);
    for (const f of freqs) {
      for (const detune of [-6, 6]) {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = f;
        o.detune.value = detune;
        o.connect(lp);
        o.start(t);
        o.stop(t + dur + 0.05);
      }
    }
  }

  // ------------------------------------------------------------ cues

  drop(at = 0): void {
    if (!this.ctx) return;
    const t = this.start(at);
    this.hiss({ t, dur: 0.5, gain: 0.16, filter: 'bandpass', f0: 2200, f1: 380, q: 1.1, attack: 0.18 });
  }

  land(at = 0): void {
    if (!this.ctx) return;
    const t = this.start(at);
    this.tone({ type: 'sine', f0: 150, f1: 52, t, dur: 0.22, gain: 0.7 });
    this.hiss({ t, dur: 0.1, gain: 0.3, filter: 'lowpass', f0: 900, f1: 300 });
    this.tone({ type: 'triangle', f0: 540, f1: 360, t, dur: 0.07, gain: 0.16 });
  }

  crack(stage: number, at = 0): void {
    if (!this.ctx) return;
    const t = this.start(at);
    const s = Math.min(2, Math.max(1, stage));
    // the snap itself
    this.hiss({ t, dur: 0.06, gain: 0.5 + 0.12 * s, filter: 'highpass', f0: 2600, q: 0.7, attack: 0.001 });
    // a handful of fine ticks as the crack runs through the clay
    for (let i = 0; i < 3 + s; i++) {
      this.hiss({
        t: t + 0.02 + i * randRange(this.rng, 0.012, 0.035),
        dur: 0.02,
        gain: randRange(this.rng, 0.12, 0.26),
        filter: 'bandpass',
        f0: randRange(this.rng, 3000, 6500),
        q: 4,
        attack: 0.001,
      });
    }
    // the knock underneath, lower on the second crack
    this.tone({ type: 'sine', f0: 210 - 40 * (s - 1), f1: 80, t, dur: 0.12, gain: 0.5 });
    // tension: a thin rising tone that climbs with each crack
    this.tone({ type: 'triangle', f0: 330 * (1 + 0.35 * s), f1: 330 * (1 + 0.35 * s) * 1.35, t: t + 0.01, dur: 0.32, gain: 0.05 + 0.015 * s, attack: 0.05 });
    if (s >= 2) {
      // light starting to leak: a faint shimmer
      for (const f of [1760, 2217, 2637]) this.tone({ type: 'sine', f0: f, t: t + 0.04, dur: 0.6, gain: 0.018, attack: 0.18 });
    }
  }

  burst(tier: TierDef, at = 0): void {
    if (!this.ctx) return;
    const t = this.start(at);
    const it = tier.intensity;
    // weight
    this.tone({ type: 'sine', f0: 95, f1: 28, t, dur: 0.55, gain: 0.55 + 0.35 * it });
    this.tone({ type: 'sine', f0: 190, f1: 60, t, dur: 0.25, gain: 0.3 });
    // the crash
    this.hiss({ t, dur: 0.75, gain: 0.34 + 0.2 * it, filter: 'lowpass', f0: 7000, f1: 380, q: 0.6, attack: 0.002 });
    this.hiss({ t, dur: 0.3, gain: 0.3, filter: 'highpass', f0: 3000, q: 0.7, attack: 0.001 });
    // shards clattering down
    const clatter = 8 + Math.round(8 * it);
    for (let i = 0; i < clatter; i++) {
      const dt = 0.03 + Math.pow(this.rng(), 1.6) * 0.6;
      this.hiss({ t: t + dt, dur: 0.035, gain: randRange(this.rng, 0.1, 0.3) * (1 - dt * 0.7), filter: 'bandpass', f0: randRange(this.rng, 1800, 7000), q: 5, attack: 0.001 });
      if (i % 3 === 0) this.tone({ type: 'triangle', f0: randRange(this.rng, 1100, 3200), t: t + dt, dur: 0.09, gain: 0.07 });
    }
    // an upward flick of light at the top of the burst, bigger for rarer pulls
    if (it >= 0.5) {
      const n = it >= 1 ? 6 : it >= 0.75 ? 4 : 3;
      for (let i = 0; i < n; i++) this.bell(1046.5 * Math.pow(1.26, i), t + 0.02 + i * 0.035, 0.7, 0.1);
    }
  }

  sprout(tier: TierDef, leafTimes: readonly number[], at = 0): void {
    if (!this.ctx) return;
    const t0 = this.start(at);
    const soft = 0.6 + 0.4 * tier.intensity;
    for (const { t, freq } of leafPitches(leafTimes)) {
      const tt = t0 + t;
      // a rounded "bloop" that glides up into the leaf's note, plus a breath of leaf-rustle
      this.tone({ type: 'sine', f0: freq * 0.62, f1: freq, t: tt, dur: 0.16, gain: 0.19 * soft, attack: 0.006 });
      this.tone({ type: 'triangle', f0: freq * 2, t: tt, dur: 0.09, gain: 0.04 * soft });
      this.hiss({ t: tt, dur: 0.1, gain: 0.07, filter: 'bandpass', f0: 2600, f1: 1300, q: 1.2, attack: 0.01 });
    }
  }

  fanfare(tier: TierDef, at = 0): void {
    if (!this.ctx) return;
    const t = this.start(at);
    const plan = chimePlan(tier, this.rng);
    for (const n of plan.notes) this.bell(n.freq, t + n.t, n.dur, n.gain);
    for (const n of plan.sparkles) this.bell(n.freq, t + n.t, n.dur, n.gain);
    if (plan.pad) this.pad(plan.pad.freqs, t, plan.pad.attack, plan.pad.dur, plan.pad.gain);
    if (plan.thump > 0) this.tone({ type: 'sine', f0: 120, f1: 45, t, dur: 0.45, gain: plan.thump });
    if (tier.intensity >= 0.75) this.hiss({ t, dur: 0.7, gain: 0.07, filter: 'highpass', f0: 5000, q: 0.5, attack: 0.25 });
  }

  tag(at = 0): void {
    if (!this.ctx) return;
    const t = this.start(at);
    this.hiss({ t, dur: 0.12, gain: 0.06, filter: 'bandpass', f0: 2400, f1: 3600, q: 1.5, attack: 0.02 });
    this.tone({ type: 'triangle', f0: 1318.5, t: t + 0.07, dur: 0.1, gain: 0.07 });
  }

  leave(at = 0): void {
    if (!this.ctx) return;
    const t = this.start(at);
    this.hiss({ t, dur: 0.32, gain: 0.13, filter: 'bandpass', f0: 420, f1: 1700, q: 0.9, attack: 0.1 });
  }
}
