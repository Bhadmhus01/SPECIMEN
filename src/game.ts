import { TIER_BY_ID, TIMING, TUNING } from './config';
import { FrameGovernor } from './governor';
import { PlantBuilder } from './plants/plant';
import type { AudioPort, PlaytestPort, UiPort } from './ports';
import { Reveal, type Cue } from './reveal';
import type { RollSource } from './roll';
import { Scene } from './scene/scene';
import { clamp, lerp } from './util';

/** Lowest effective device-pixel ratio the adaptive quality will drop to. */
const MIN_DPR = 1;


export interface GameDeps {
  canvas: HTMLCanvasElement;
  source: RollSource;
  audio: AudioPort;
  ui: UiPort;
  log: PlaytestPort;
  reducedMotion: boolean;
  /** Do not run requestAnimationFrame: the caller drives time with step(). For tests and screenshots. */
  manual?: boolean;
}

/** Rolling window of frame costs, for the performance checks. */
export interface FrameStats {
  frames: number;
  /** Wall-clock gaps between frames, ms. */
  gaps: number[];
  /** CPU time spent in our own step(), ms. */
  work: number[];
  /** The reveal phase during each frame, to tell which moments are expensive. */
  phases: string[];
}

/**
 * Wires the reveal director to the scene, the sound and the UI, and owns the frame loop.
 *
 * Two clocks: the Reveal runs on real time (pacing and trust never bend); the Scene runs on a
 * visual clock the Game may freeze (hit-stop) or slow down (a brief slow-mo on rare pulls).
 */
export class Game {
  readonly reveal: Reveal;
  readonly scene: Scene;
  readonly stats: FrameStats = { frames: 0, gaps: [], work: [], phases: [] };

  private readonly deps: GameDeps;
  private builder: PlantBuilder | null = null;
  private hitStopLeft = 0;
  private slowLeft = 0;
  private last = 0;
  private raf = 0;
  private running = false;
  private readyAt = 0;
  private settledAt = 0;
  private clockMs = 0;
  private everTapped = false;
  /** Multiplies the (capped) device pixel ratio; lowered automatically on slow devices. */
  private renderScale = 1;
  private readonly governor = new FrameGovernor();

  constructor(deps: GameDeps) {
    this.deps = deps;
    this.scene = new Scene(deps.canvas, { reducedMotion: deps.reducedMotion });
    this.reveal = new Reveal(deps.source, (cue) => this.onCue(cue));
  }

  get index(): number {
    return this.reveal.index;
  }

  get hasEverTapped(): boolean {
    return this.everTapped;
  }

  // ------------------------------------------------------------ lifecycle

  /** Size the canvas to its container and keep it that way. */
  resize(): void {
    const c = this.deps.canvas;
    const w = Math.max(1, c.parentElement?.clientWidth ?? window.innerWidth);
    const h = Math.max(1, c.parentElement?.clientHeight ?? window.innerHeight);
    this.scene.resize(w, h, this.effectiveDpr());
  }

  private effectiveDpr(): number {
    return clamp(Math.min(window.devicePixelRatio || 1, 2) * this.renderScale, MIN_DPR, 2);
  }

  /**
   * Watch the frame rate; if the device cannot keep up, trade resolution for smoothness. Smooth beats sharp:
   * a laggy reveal would fail the feel test for the wrong reason. Only ever steps down, to avoid flip-flopping.
   */
  private adapt(gap: number): void {
    if (this.governor.feed(gap, document.hidden) && this.effectiveDpr() > MIN_DPR + 0.01) this.lowerQuality();
  }

  private lowerQuality(): void {
    this.renderScale *= 0.75;
    this.governor.reset();
    this.resize();
    this.deps.log.record({ type: 'quality_drop', scale: Math.round(this.effectiveDpr() * 100) / 100 });
  }

  start(): void {
    this.resize();
    this.scene.warmUp();
    this.reveal.start();
    if (this.deps.manual) {
      this.scene.draw();
      return;
    }
    this.running = true;
    this.last = performance.now();
    // Time is taken from performance.now(), not from the rAF timestamp argument: the latter is the frame's nominal
    // start and can be paced synthetically (headless, some embedded webviews), which would silently run the game slow.
    const loop = (): void => {
      if (!this.running) return;
      const now = performance.now();
      const gap = now - this.last;
      this.last = now;
      const t0 = now;
      this.step(gap / 1000);
      this.record(gap, performance.now() - t0);
      this.adapt(gap);
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  private record(gap: number, work: number): void {
    const s = this.stats;
    s.frames += 1;
    s.gaps.push(gap);
    s.work.push(work);
    s.phases.push(this.reveal.phase);
    if (s.gaps.length > 1200) {
      s.gaps.shift();
      s.work.shift();
      s.phases.shift();
    }
  }

  /** Advance one frame by `realDt` seconds of real time. */
  step(realDt: number): void {
    const dt = clamp(realDt, 0, 0.05); // after a stall (tab switch) do not leap
    this.clockMs += dt * 1000;
    this.reveal.update(dt);

    let vdt = dt;
    if (this.hitStopLeft > 0) {
      this.hitStopLeft -= dt;
      vdt = 0;
    } else if (this.slowLeft > 0) {
      this.slowLeft -= dt;
      // hold slow, then ease back to full speed over the last 100 ms
      const k = clamp(this.slowLeft / 0.1);
      vdt = dt * lerp(1, TUNING.slowMo.scale, k);
    }
    this.scene.update(vdt);
    this.buildSome();
    this.scene.draw();
  }

  // ------------------------------------------------------------ input

  tap(): void {
    this.deps.audio.unlock();
    const outcome = this.reveal.tap();
    if (outcome === 'ignored') {
      const p = this.reveal.phase;
      if (p === 'growing' || p === 'settled') {
        this.scene.boop();
        this.deps.log.record({ type: 'boop', index: this.reveal.index });
      }
      return;
    }
    this.everTapped = true;
    this.deps.ui.onTap();
    this.deps.log.record({ type: 'tap', index: this.reveal.index, n: this.reveal.taps });
    vibrate(outcome === 'break' ? [18] : [10]);
  }

  oneMore(): void {
    this.deps.audio.unlock();
    const msSinceSettled = this.clockMs - this.settledAt;
    const index = this.reveal.index;
    if (this.reveal.oneMore()) this.deps.log.record({ type: 'one_more', index, msSinceSettled: Math.round(msSinceSettled) });
  }

  // ------------------------------------------------------------ cues

  /** Spread sprite generation over frames: one leaf at least, more if the frame has time to spare. */
  private buildSome(): void {
    const b = this.builder;
    if (!b || b.done) return;
    const t0 = performance.now();
    do {
      b.step();
    } while (!b.done && performance.now() - t0 < 3);
  }

  private onCue(cue: Cue): void {
    const { audio, ui, log } = this.deps;
    switch (cue.type) {
      case 'drop':
        this.builder = null;
        this.hitStopLeft = 0;
        this.slowLeft = 0;
        this.scene.startDrop(cue.index);
        audio.drop();
        ui.onDrop(cue.index);
        log.record({ type: 'pot_drop', index: cue.index });
        break;

      case 'rolled': {
        const tier = TIER_BY_ID[cue.result.tier];
        this.scene.setTier(tier);
        const k = clamp(this.scene.pixelsPerUnit * 1.15, 1.25, 3.6);
        this.builder = new PlantBuilder(cue.result, k, TIMING.growSeconds[cue.result.tier]);
        break;
      }

      case 'ready':
        this.scene.land();
        this.readyAt = this.clockMs;
        audio.land();
        ui.onReady(this.reveal.index);
        log.record({ type: 'pot_ready', index: this.reveal.index });
        break;

      case 'crack':
        this.scene.crack(cue.stage);
        audio.crack(cue.stage);
        break;

      case 'hitstop':
        this.hitStopLeft = TIMING.hitStop;
        this.scene.hitStop();
        break;

      case 'burst': {
        const tier = TIER_BY_ID[cue.result.tier];
        this.hitStopLeft = 0;
        if (!this.deps.reducedMotion && tier.intensity >= TUNING.slowMo.minIntensity) this.slowLeft = TUNING.slowMo.seconds;
        this.scene.burst(tier);
        audio.burst(tier);
        vibrate(tier.intensity >= 0.75 ? [30, 40, 60] : [30]);
        log.record({
          type: 'reveal',
          index: this.reveal.index,
          species: cue.result.species,
          tier: cue.result.tier,
          form: cue.result.form,
          msToOpen: Math.round(this.clockMs - this.readyAt),
        });
        break;
      }

      case 'sprout': {
        const tier = TIER_BY_ID[cue.result.tier];
        const b = this.builder;
        if (b) {
          while (!b.done) b.step(); // normally finished long ago; this is only the slow-device safety net
          const plant = b.plant;
          this.builder = null;
          if (plant) {
            this.scene.sprout(plant, tier);
            audio.sprout(tier, plant.leaves.map((l) => l.delay + l.dur * 0.35));
          }
        }
        break;
      }

      case 'fanfare': {
        const tier = TIER_BY_ID[cue.result.tier];
        this.scene.fanfare(tier);
        audio.fanfare(tier);
        if (tier.intensity >= 0.75) vibrate([20, 40, 20, 40, 80]);
        break;
      }

      case 'tag':
        ui.showTag(cue.result, this.reveal.index);
        audio.tag();
        break;

      case 'settled':
        this.scene.settle();
        this.settledAt = this.clockMs;
        ui.showOneMore();
        log.record({ type: 'settled', index: this.reveal.index });
        break;

      case 'leave':
        this.scene.leave();
        audio.leave();
        ui.onLeave();
        break;

      case 'error':
        ui.toast('The pot is stuck. Trying again…');
        break;
    }
  }
}

function vibrate(pattern: number[]): void {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* some browsers throw when vibrate is blocked; haptics are only ever a bonus */
  }
}
