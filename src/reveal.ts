import { TIMING } from './config';
import type { RollResult, RollSource } from './roll';

/**
 * The reveal "director": a small clock-driven state machine with no canvas, DOM or audio in it.
 * It decides *when* things happen and emits cues; the scene and the sound react to cues.
 * Keeping it pure makes the pacing and the trust properties unit-testable.
 *
 * Trust property: the result is requested when the pot drops — before any tap — and the
 * `burst`, `sprout`, `fanfare`, `tag` and `settled` cues all carry that exact object.
 * The animation reveals an outcome; it never decides one.
 */

export type Phase = 'dropping' | 'idle' | 'cracking' | 'bursting' | 'growing' | 'settled' | 'leaving';

export type Cue =
  | { type: 'drop'; index: number }
  | { type: 'rolled'; result: RollResult; index: number }
  | { type: 'ready' }
  | { type: 'crack'; stage: number; stages: number }
  | { type: 'hitstop' }
  | { type: 'burst'; result: RollResult }
  | { type: 'sprout'; result: RollResult }
  | { type: 'fanfare'; result: RollResult }
  | { type: 'tag'; result: RollResult }
  | { type: 'settled'; result: RollResult }
  | { type: 'leave' }
  | { type: 'error'; message: string };

export type TapOutcome = 'ignored' | 'crack' | 'break';

type Timing = typeof TIMING;

interface Job {
  readonly at: number;
  readonly fn: () => void;
}

export class Reveal {
  phase: Phase = 'leaving';
  /** 1-based number of the current pot (0 before start). */
  index = 0;
  taps = 0;
  result: RollResult | null = null;

  private clock = 0;
  private lastTapAt = Number.NEGATIVE_INFINITY;
  private queue: Job[] = [];
  private rollToken = 0;
  private hitStopDone = false;
  private breakRequested = false;

  private readonly source: RollSource;
  private readonly emit: (cue: Cue) => void;
  private readonly timing: Timing;

  constructor(source: RollSource, emit: (cue: Cue) => void, timing: Timing = TIMING) {
    this.source = source;
    this.emit = emit;
    this.timing = timing;
  }

  /** Drop the first sealed pot. */
  start(): void {
    this.dropPot();
  }

  /** Advance the clock by `dt` real seconds and fire anything that is due, in order. */
  update(dt: number): void {
    this.clock += dt;
    while (this.queue.length > 0 && (this.queue[0] as Job).at <= this.clock) {
      (this.queue.shift() as Job).fn();
    }
  }

  tap(): TapOutcome {
    if (this.phase !== 'idle' && this.phase !== 'cracking') return 'ignored';
    if (this.breakRequested) return 'ignored';
    if (this.clock - this.lastTapAt < this.timing.minTapGap) return 'ignored';

    this.lastTapAt = this.clock;
    this.taps += 1;
    this.phase = 'cracking';

    if (this.taps < this.timing.tapsToOpen) {
      this.emit({ type: 'crack', stage: this.taps, stages: this.timing.tapsToOpen - 1 });
      return 'crack';
    }

    this.breakRequested = true;
    this.emit({ type: 'hitstop' });
    this.schedule(this.timing.hitStop, () => {
      this.hitStopDone = true;
      this.tryBurst();
    });
    return 'break';
  }

  /** Ask for the next pot. Only valid once the current plant has settled. */
  oneMore(): boolean {
    if (this.phase !== 'settled') return false;
    this.phase = 'leaving';
    this.emit({ type: 'leave' });
    this.schedule(this.timing.leaveSeconds, () => this.dropPot());
    return true;
  }

  private schedule(delay: number, fn: () => void): void {
    this.queue.push({ at: this.clock + delay, fn });
    this.queue.sort((a, b) => a.at - b.at); // stable: equal times keep insertion order
  }

  private dropPot(): void {
    this.index += 1;
    this.phase = 'dropping';
    this.taps = 0;
    this.result = null;
    this.hitStopDone = false;
    this.breakRequested = false;
    this.rollToken += 1;
    this.emit({ type: 'drop', index: this.index });
    this.requestRoll(this.rollToken);
    this.schedule(this.timing.dropSeconds, () => {
      if (this.phase !== 'dropping') return;
      this.phase = 'idle';
      this.emit({ type: 'ready' });
    });
  }

  private requestRoll(token: number): void {
    Promise.resolve()
      .then(() => this.source.roll())
      .then(
        (result) => {
          if (token !== this.rollToken) return;
          this.result = result;
          this.emit({ type: 'rolled', result, index: this.index });
          this.tryBurst();
        },
        (err: unknown) => {
          if (token !== this.rollToken) return;
          this.emit({ type: 'error', message: err instanceof Error ? err.message : String(err) });
          this.schedule(this.timing.rollRetrySeconds, () => {
            if (token === this.rollToken) this.requestRoll(token);
          });
        },
      );
  }

  /** Burst needs all three: the final tap, the hit-stop elapsed, and the roll in hand. */
  private tryBurst(): void {
    if (this.phase !== 'cracking' || !this.breakRequested || !this.hitStopDone || !this.result) return;
    const result = this.result;
    const t = this.timing;
    const grow = t.growSeconds[result.tier];

    this.phase = 'bursting';
    this.emit({ type: 'burst', result });
    this.schedule(t.sproutDelay, () => {
      this.phase = 'growing';
      this.emit({ type: 'sprout', result });
    });
    this.schedule(t.sproutDelay + grow * t.fanfareAt, () => this.emit({ type: 'fanfare', result }));
    this.schedule(t.sproutDelay + grow, () => this.emit({ type: 'tag', result }));
    this.schedule(t.sproutDelay + grow + t.readyDelay, () => {
      this.phase = 'settled';
      this.emit({ type: 'settled', result });
    });
  }
}
