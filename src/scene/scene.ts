import { TIMING, TUNING, type TierDef } from '../config';
import { drawPlant } from '../plants/plant';
import type { Plant } from '../plants/types';
import { mulberry32, randRange, type Rng } from '../rng';
import { TAU, clamp, damp, easeInCubic, easeInQuad, easeOutCubic, get2d, hexToRgb, makeCanvas, mixHex } from '../util';
import { PLINTH_BOUNDS, drawPlinth, renderBackdrop } from './background';
import { computeLayout, type Layout } from './layout';
import { Particles } from './particles';
import { POT, POT_BOUNDS, drawPot } from './pot';
import { EGG, buildShell, drawCracks, drawShell, makeCracks, type Crack, type ShellSprite } from './shell';
import { Spring } from './spring';

type Ctx = CanvasRenderingContext2D;

export type Stage = 'empty' | 'drop' | 'sealed' | 'burst' | 'grow' | 'settled' | 'leave';

interface StaticSprite {
  canvas: HTMLCanvasElement;
  /** Sprite pixels per world unit. */
  k: number;
  /** World-space top-left of the sprite, in units. */
  x: number;
  y: number;
}

function renderStatic(bounds: { minX: number; minY: number; maxX: number; maxY: number }, k: number, draw: (ctx: Ctx) => void): StaticSprite {
  const w = bounds.maxX - bounds.minX;
  const h = bounds.maxY - bounds.minY;
  const canvas = makeCanvas(w * k, h * k);
  const ctx = get2d(canvas);
  ctx.setTransform(k, 0, 0, k, -bounds.minX * k, -bounds.minY * k);
  draw(ctx);
  return { canvas, k, x: bounds.minX, y: bounds.minY };
}

function blit(ctx: Ctx, s: StaticSprite): void {
  ctx.drawImage(s.canvas, s.x, s.y, s.canvas.width / s.k, s.canvas.height / s.k);
}

interface Ring {
  t: number;
  dur: number;
  maxR: number;
  rgb: string;
  width: number;
  cx: number;
  cy: number;
}

interface Mote {
  x: number;
  y: number;
  vy: number;
  r: number;
  phase: number;
}

const EGG_CENTER = { x: 0, y: EGG.worldY - EGG.ry };
const WHITE_WARM = '#fff6dc';

const rgbOf = (hex: string): string => hexToRgb(hex).join(',');

/**
 * Everything you see. It owns no game rules: the Game tells it what just happened (a pot dropped,
 * a crack, a burst...) and it animates that. All motion runs on the visual clock passed to update(),
 * so the Game can freeze it for hit-stop or slow it down without touching the reveal's real-time pacing.
 */
export class Scene {
  stage: Stage = 'empty';
  readonly particles = new Particles();

  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: Ctx;
  private readonly reduced: boolean;
  private layout: Layout;
  private backdrop: HTMLCanvasElement | null = null;
  private shell: ShellSprite | null = null;
  /** The pot and the plinth never change, so they are drawn once per resize and blitted every frame. */
  private potSprite: StaticSprite | null = null;
  private plinthSprite: StaticSprite | null = null;
  private fx: Rng = mulberry32(1);

  private time = 0;
  private stageT = 0;
  private dropFrom = 800;

  private tier: TierDef | null = null;
  private cracks: Crack[] = [];
  private crackTarget: number[] = [];
  private crackProgress: number[] = [];
  private crackStage = 0;
  private leak = 0;
  private leakTarget = 0;
  private leakMix = 0;
  private leakPulse = 0;
  private hitFlash = false;
  private nudgeTimer = 1.6;
  private nudgeSign = 1;

  private readonly wobble = new Spring(240, 12);
  private readonly squash = new Spring(300, 15);
  private readonly potSquash = new Spring(190, 10);

  private zoom = 1;
  private zoomTarget = 1;
  private trauma = 0;
  private flash = 0;
  private flashRgb = '255,255,255';

  private plant: Plant | null = null;
  private growT = 0;
  private wind = 1;
  private aura = 0;
  private auraTarget = 0;
  private sparkleTimer = 0;
  private rays: { angle: number; width: number; len: number }[] = [];
  private rayT = 99;
  private rayStrength = 0;
  private rayOrigin: 'egg' | 'plant' = 'egg';
  private rings: Ring[] = [];
  private motes: Mote[] = [];

  constructor(canvas: HTMLCanvasElement, opts: { reducedMotion: boolean }) {
    this.canvas = canvas;
    this.ctx = get2d(canvas);
    this.reduced = opts.reducedMotion;
    this.layout = computeLayout(canvas.clientWidth || 390, canvas.clientHeight || 844, 1);
    const rng = mulberry32(31337);
    this.motes = Array.from({ length: 16 }, () => ({ x: rng(), y: rng(), vy: 0.006 + rng() * 0.014, r: 1 + rng() * 2.2, phase: rng() * TAU }));
  }

  get layoutInfo(): Layout {
    return this.layout;
  }

  /** Pixels per world unit on screen, including the device pixel ratio. */
  get pixelsPerUnit(): number {
    return this.layout.s * this.layout.dpr;
  }

  get hasPlant(): boolean {
    return this.plant !== null;
  }

  // ------------------------------------------------------------ sizing

  resize(cssW: number, cssH: number, dpr: number): void {
    const prevK = this.shell?.k ?? 0;
    this.layout = computeLayout(cssW, cssH, dpr);
    this.canvas.width = Math.round(cssW * dpr);
    this.canvas.height = Math.round(cssH * dpr);
    this.canvas.style.width = `${cssW}px`;
    this.canvas.style.height = `${cssH}px`;
    this.backdrop = renderBackdrop(this.layout);
    const k = clamp(this.layout.s * dpr * 1.25, 1, 3.5);
    if (!this.shell || !this.potSprite || Math.abs(k - prevK) / prevK > 0.1) {
      this.shell = buildShell(k);
      this.potSprite = renderStatic(POT_BOUNDS, k, drawPot);
      this.plinthSprite = renderStatic(PLINTH_BOUNDS, k, drawPlinth);
    }
  }

  /**
   * Draw one of everything the reveal uses onto a throwaway canvas, so the GPU compiles its shaders
   * now, while the page is still loading, rather than as a hitch in the middle of the first burst.
   */
  warmUp(): void {
    const c = makeCanvas(96, 96);
    const x = get2d(c);
    const rg = x.createRadialGradient(48, 48, 2, 48, 48, 46);
    rg.addColorStop(0, 'rgba(255,255,255,0.8)');
    rg.addColorStop(1, 'rgba(255,200,120,0)');
    const lg = x.createLinearGradient(0, 0, 96, 96);
    lg.addColorStop(0, '#123');
    lg.addColorStop(0.5, 'rgba(90,60,30,0.3)');
    lg.addColorStop(1, '#fed');
    x.fillStyle = lg;
    x.fillRect(0, 0, 96, 96);
    x.globalCompositeOperation = 'lighter';
    x.fillStyle = rg;
    x.fillRect(0, 0, 96, 96);
    x.strokeStyle = 'rgba(255,230,160,0.6)';
    x.lineWidth = 6;
    x.beginPath();
    x.arc(48, 48, 30, 0, TAU);
    x.stroke();
    x.globalCompositeOperation = 'source-over';
    x.setLineDash([4, 6]);
    x.stroke();
    x.setLineDash([]);
    x.save();
    x.beginPath();
    x.moveTo(10, 10);
    x.lineTo(80, 24);
    x.lineTo(40, 86);
    x.closePath();
    x.clip();
    for (const sprite of [this.shell?.canvas, this.potSprite?.canvas, this.plinthSprite?.canvas]) {
      if (!sprite || sprite.width === 0) continue;
      x.globalAlpha = 0.7;
      x.rotate(0.2);
      x.drawImage(sprite, 0, 0, Math.min(40, sprite.width), Math.min(40, sprite.height), 0, 0, 60, 60);
    }
    x.restore();
    x.beginPath();
    x.ellipse(48, 48, 20, 12, 0.4, 0, TAU);
    x.fill();
  }

  // ------------------------------------------------------------ cues from the game

  /** A new sealed pot falls in. */
  startDrop(index: number): void {
    this.fx = mulberry32(0xf00d + index * 7919);
    this.disposePlant();
    this.stage = 'drop';
    this.stageT = 0;
    this.tier = null;
    this.cracks = makeCracks(mulberry32(0xc4ac + index * 104729));
    this.crackTarget = this.cracks.map(() => 0);
    this.crackProgress = this.cracks.map(() => 0);
    this.crackStage = 0;
    this.leak = 0;
    this.leakTarget = 0;
    this.leakMix = 0;
    this.hitFlash = false;
    this.growT = 0;
    this.aura = 0;
    this.auraTarget = 0;
    this.rayT = 99;
    this.zoomTarget = 1;
    this.nudgeTimer = 1.8;
    this.wobble.reset();
    this.squash.reset();
    this.potSquash.reset();
    this.dropFrom = this.layout.floorY / this.layout.s + 140;
  }

  /** The roll is in: remember the tier so the cracks can glow in its colour. */
  setTier(tier: TierDef): void {
    this.tier = tier;
  }

  /** The pot hits the plinth and the game opens for taps. */
  land(): void {
    if (this.stage !== 'drop') return;
    this.stage = 'sealed';
    this.stageT = 0;
    this.squash.poke(3.4);
    this.potSquash.poke(2.6);
    this.trauma = Math.max(this.trauma, 0.16);
    for (let i = 0; i < 16; i++) {
      const dir = i < 8 ? -1 : 1;
      this.particles.emit({
        kind: 'dust',
        x: dir * randRange(this.fx, 60, 150),
        y: -2,
        vx: dir * randRange(this.fx, 60, 200),
        vy: -randRange(this.fx, 20, 90),
        drag: 0.08,
        size: randRange(this.fx, 3, 6),
        grow: 12,
        maxLife: randRange(this.fx, 0.35, 0.6),
        fadeOut: 1,
        color: 'rgba(214,205,176,0.34)',
      });
    }
  }

  /** A non-final tap: crack the shell a little more. stage is 1-based. */
  crack(stage: number): void {
    if (this.stage !== 'sealed') return;
    this.crackStage = stage;
    let n = 0;
    this.cracks.forEach((c, i) => {
      if (c.stage <= stage && this.crackTarget[i] === 0) {
        this.crackTarget[i] = 1;
        this.crackProgress[i] = -0.03 * n++; // tiny stagger so the cracks race out of the impact point
      }
    });
    const tier = this.tier;
    const bias = TUNING.tell.bias;
    const strength = tier ? 1 - bias + bias * tier.intensity : 1;
    this.leakMix = TUNING.tell.tint[Math.min(stage, TUNING.tell.tint.length) - 1] ?? 0;
    this.leakTarget = (0.32 + 0.34 * (stage - 1)) * strength;
    this.leakPulse = 1;
    this.wobble.poke((stage % 2 ? 1 : -1) * (1.2 + 0.7 * stage));
    this.squash.poke(1.7 + 0.9 * stage);
    this.trauma = Math.min(1, this.trauma + 0.2 + 0.16 * stage);
    this.zoomTarget = 1 + TUNING.pushPerCrack * stage;
    this.nudgeTimer = 99;
    this.chips(5 + 4 * stage);
  }

  /** The final tap lands: freeze on the impact (the game also stops our clock for the hit-stop). */
  hitStop(): void {
    this.hitFlash = true;
    this.leakTarget = 1;
    this.leak = 1;
    this.leakPulse = 1;
    this.squash.x = 0.11;
    this.squash.v = 0;
  }

  /** Shatter the shell. */
  burst(tier: TierDef): void {
    this.tier = tier;
    this.stage = 'burst';
    this.stageT = 0;
    this.hitFlash = false;
    const it = tier.intensity;
    const calm = this.reduced ? 0.35 : 1;

    // the shell's own pieces fly outward
    if (this.shell) {
      const speedK = 0.75 + 0.5 * it;
      for (const piece of this.shell.pieces) {
        const dx = piece.cx - 0;
        const dy = piece.cy + EGG.ry; // from egg centre
        const len = Math.hypot(dx, dy) || 1;
        const speed = randRange(this.fx, 300, 620) * speedK * calm;
        this.particles.emit({
          kind: 'shard',
          x: piece.cx,
          y: EGG.worldY + piece.cy,
          vx: (dx / len) * speed + randRange(this.fx, -40, 40),
          vy: (dy / len) * speed - randRange(this.fx, 140, 320) * calm,
          gravity: 1800,
          drag: 0.55,
          rot: 0,
          vr: randRange(this.fx, -7, 7),
          size: 1,
          maxLife: 1.6,
          fadeOut: 0.3,
          piece,
          color: '#fff',
        });
      }
    }

    const c1 = tier.color;
    const c2 = tier.color2;
    const sparks = Math.round((16 + 70 * it) * (this.reduced ? 0.4 : 1));
    for (let i = 0; i < sparks; i++) {
      const a = this.fx() * TAU;
      const sp = randRange(this.fx, 180, 880) * (0.7 + 0.5 * it) * calm;
      this.particles.emit({
        kind: 'spark',
        x: EGG_CENTER.x,
        y: EGG_CENTER.y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - 60,
        gravity: 320,
        drag: 0.16,
        size: randRange(this.fx, 1.8, 4.4),
        maxLife: randRange(this.fx, 0.5, 1.15),
        fadeOut: 0.7,
        color: i % 3 === 0 ? '#ffffff' : i % 3 === 1 ? c1 : c2,
      });
    }
    const stars = Math.round((4 + 14 * it) * (this.reduced ? 0.4 : 1));
    for (let i = 0; i < stars; i++) {
      const a = this.fx() * TAU;
      const sp = randRange(this.fx, 90, 420) * calm;
      this.particles.emit({
        kind: 'star',
        x: EGG_CENTER.x + Math.cos(a) * 30,
        y: EGG_CENTER.y + Math.sin(a) * 30,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - 40,
        drag: 0.3,
        rot: this.fx() * TAU,
        vr: randRange(this.fx, -2, 2),
        size: randRange(this.fx, 10, 22) * (0.8 + 0.4 * it),
        maxLife: randRange(this.fx, 0.7, 1.4),
        fadeOut: 0.5,
        color: i % 2 ? c1 : '#ffffff',
      });
    }

    const rings = 1 + Math.floor(2 * it + 0.5);
    for (let i = 0; i < rings; i++) {
      this.rings.push({
        t: -0.07 * i,
        dur: 0.55 + 0.1 * i,
        maxR: 330 + 90 * i,
        rgb: rgbOf(i % 2 ? c2 : c1),
        width: 15 - 3 * i,
        cx: EGG_CENTER.x,
        cy: EGG_CENTER.y,
      });
    }
    this.rays = Array.from({ length: Math.round(9 + 7 * it) }, () => ({
      angle: this.fx() * TAU,
      width: randRange(this.fx, 0.05, 0.13),
      len: randRange(this.fx, 480, 900),
    }));
    this.rayT = 0;
    this.rayStrength = 0.2 + 0.36 * it;
    this.rayOrigin = 'egg';

    this.flash = (this.reduced ? 0.2 : 0.55) + (this.reduced ? 0.1 : 0.4) * it;
    this.flashRgb = rgbOf(mixHex('#ffffff', c1, 0.35));
    this.trauma = Math.min(1, this.trauma + 0.5 + 0.5 * it);
    this.zoom = (this.reduced ? 0.985 : 0.94) - 0.025 * it;
    this.zoomTarget = 1;
    this.potSquash.poke(3.6);
    this.leakTarget = 0;
    this.leak = 0;
    this.soil(10);
  }

  /** The plant begins to grow. */
  sprout(plant: Plant, tier: TierDef): void {
    this.disposePlant();
    this.plant = plant;
    this.tier = tier;
    this.stage = 'grow';
    this.stageT = 0;
    this.growT = 0;
    this.auraTarget = 0.18 + 0.5 * tier.intensity;
    this.potSquash.poke(-2.2);
    this.soil(8);
  }

  /** The rarity beat: halfway through the growth, the tier announces itself. */
  fanfare(tier: TierDef): void {
    const it = tier.intensity;
    const p = this.plant;
    const cy = POT.soilY - (p ? p.height * 0.55 : 200);
    const reach = p ? Math.max(120, p.halfWidth) : 180;
    const c1 = tier.color;
    const c2 = tier.color2;
    const calm = this.reduced ? 0.4 : 1;

    this.auraTarget = 0.25 + 0.75 * it;
    this.wind = 2.2 + it;
    this.rings.push({ t: 0, dur: 0.8, maxR: 300 + 120 * it, rgb: rgbOf(c1), width: 14, cx: 0, cy });
    if (it >= 0.5) this.rings.push({ t: -0.1, dur: 0.9, maxR: 380 + 120 * it, rgb: rgbOf(c2), width: 10, cx: 0, cy });

    // common: leafy; uncommon: twinkles; rare: a crown of stars; grail: stars, confetti and a second burst of rays
    const leafBits = tier.id === 'common' ? 12 : tier.id === 'uncommon' ? 6 : 4;
    for (let i = 0; i < Math.round(leafBits * calm); i++) {
      this.particles.emit({
        kind: 'leaf',
        x: randRange(this.fx, -reach * 0.7, reach * 0.7),
        y: cy + randRange(this.fx, -120, 40),
        vx: randRange(this.fx, -50, 50),
        vy: -randRange(this.fx, 60, 160),
        gravity: 140,
        drag: 0.5,
        rot: this.fx() * TAU,
        vr: randRange(this.fx, -4, 4),
        size: randRange(this.fx, 7, 12),
        flutter: 40,
        phase: this.fx() * TAU,
        maxLife: randRange(this.fx, 1.1, 1.8),
        fadeOut: 0.4,
        color: i % 2 ? '#7fd36a' : '#b4ec8f',
      });
    }
    const stars = Math.round((6 + 36 * it) * calm);
    for (let i = 0; i < stars; i++) {
      this.particles.emit({
        kind: 'star',
        x: randRange(this.fx, -reach, reach),
        y: cy + randRange(this.fx, -(p?.height ?? 300) * 0.5, (p?.height ?? 300) * 0.4),
        vx: randRange(this.fx, -20, 20),
        vy: -randRange(this.fx, 20, 90),
        drag: 0.6,
        rot: this.fx() * TAU,
        vr: randRange(this.fx, -1.5, 1.5),
        size: randRange(this.fx, 9, 20) * (0.8 + 0.5 * it),
        maxLife: randRange(this.fx, 0.8, 1.6),
        fadeOut: 0.5,
        fadeIn: 0.1,
        color: i % 3 === 0 ? '#ffffff' : i % 3 === 1 ? c1 : c2,
      });
    }
    if (tier.id === 'grail') {
      const colors = ['#ffd166', '#ff7eb6', '#fff1d6', '#ff5c93', '#ffe29a'];
      for (let i = 0; i < Math.round(46 * calm); i++) {
        this.particles.emit({
          kind: 'confetti',
          x: randRange(this.fx, -reach * 0.5, reach * 0.5),
          y: cy - randRange(this.fx, 60, 220),
          vx: randRange(this.fx, -160, 160),
          vy: -randRange(this.fx, 160, 460),
          gravity: 520,
          drag: 0.35,
          rot: this.fx() * TAU,
          vr: randRange(this.fx, -6, 6),
          size: randRange(this.fx, 9, 15),
          flutter: 50,
          phase: this.fx() * TAU,
          maxLife: randRange(this.fx, 1.8, 3),
          fadeOut: 0.3,
          color: colors[i % colors.length] as string,
        });
      }
      this.rays = Array.from({ length: 14 }, () => ({ angle: this.fx() * TAU, width: randRange(this.fx, 0.04, 0.1), len: randRange(this.fx, 560, 960) }));
      this.rayT = 0;
      this.rayStrength = 0.4;
      this.rayOrigin = 'plant';
      this.flash = this.reduced ? 0.1 : 0.28;
      this.flashRgb = rgbOf(mixHex('#ffffff', c1, 0.5));
      this.trauma = Math.min(1, this.trauma + 0.28);
    } else if (tier.id === 'rare') {
      this.trauma = Math.min(1, this.trauma + 0.14);
    }
  }

  /** The plant has finished growing and is simply there now. */
  settle(): void {
    this.stage = 'settled';
    this.stageT = 0;
  }

  /** Poke the finished plant: leaves flutter. */
  boop(): void {
    if (this.stage !== 'settled' && this.stage !== 'grow') return;
    this.wind = Math.max(this.wind, 2.6);
    this.potSquash.poke(1.1);
    const p = this.plant;
    if (!p) return;
    for (let i = 0; i < 3; i++) {
      this.particles.emit({
        kind: 'star',
        x: randRange(this.fx, -p.halfWidth * 0.7, p.halfWidth * 0.7),
        y: POT.soilY - randRange(this.fx, 60, p.height * 0.9),
        vy: -30,
        drag: 0.5,
        rot: this.fx() * TAU,
        size: randRange(this.fx, 8, 13),
        maxLife: 0.7,
        fadeOut: 0.6,
        color: this.tier?.color ?? '#fff',
      });
    }
  }

  /** The finished pot slides away. */
  leave(): void {
    this.stage = 'leave';
    this.stageT = 0;
    this.auraTarget = 0;
  }

  // ------------------------------------------------------------ helpers

  private disposePlant(): void {
    this.plant?.dispose();
    this.plant = null;
  }

  private chips(n: number): void {
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + randRange(this.fx, -1.4, 1.4);
      const r = randRange(this.fx, 0.3, 0.95);
      this.particles.emit({
        kind: 'dust',
        x: Math.cos(a) * EGG.rx * r,
        y: EGG.worldY - EGG.ry - Math.sin(-a) * EGG.ry * r,
        vx: Math.cos(a) * randRange(this.fx, 80, 260),
        vy: -randRange(this.fx, 80, 320),
        gravity: 1300,
        drag: 0.4,
        size: randRange(this.fx, 2, 4.2),
        maxLife: randRange(this.fx, 0.45, 0.8),
        fadeOut: 0.5,
        color: i % 3 === 0 ? '#f4e6c3' : i % 3 === 1 ? '#c9a876' : '#8a6a42',
      });
    }
  }

  private soil(n: number): void {
    for (let i = 0; i < n; i++) {
      this.particles.emit({
        kind: 'dust',
        x: randRange(this.fx, -70, 70),
        y: POT.soilY,
        vx: randRange(this.fx, -90, 90),
        vy: -randRange(this.fx, 120, 330),
        gravity: 1200,
        drag: 0.5,
        size: randRange(this.fx, 2, 3.8),
        maxLife: randRange(this.fx, 0.5, 0.9),
        fadeOut: 0.5,
        color: i % 2 ? '#4a3626' : '#6b5039',
      });
    }
  }

  private shakeOffset(): { x: number; y: number; r: number } {
    const a = this.trauma * this.trauma * (this.reduced ? 0.12 : 1);
    if (a < 1e-4) return { x: 0, y: 0, r: 0 };
    const t = this.time;
    return {
      x: (Math.sin(t * 61.1) * 0.6 + Math.sin(t * 37.7 + 1.2) * 0.4) * 16 * a,
      y: (Math.sin(t * 53.9 + 2) * 0.6 + Math.sin(t * 29.3) * 0.4) * 12 * a,
      r: Math.sin(t * 43.1 + 0.7) * 0.02 * a,
    };
  }

  // ------------------------------------------------------------ update

  update(dt: number): void {
    this.time += dt;
    this.stageT += dt;
    this.wobble.step(dt);
    this.squash.step(dt);
    this.potSquash.step(dt);
    this.trauma = Math.max(0, this.trauma - dt * 1.7);
    this.flash = Math.max(0, this.flash - dt * 4);
    this.zoom = damp(this.zoom, this.zoomTarget, 8, dt);
    this.leak = damp(this.leak, this.leakTarget, 16, dt);
    this.leakPulse = Math.max(0, this.leakPulse - dt * 6);
    this.aura = damp(this.aura, this.auraTarget, 3, dt);
    this.wind = damp(this.wind, 1, 2.2, dt);
    this.rayT += dt;

    this.crackProgress.forEach((p, i) => {
      if (this.crackTarget[i] === 1 && p < 1) this.crackProgress[i] = Math.min(1, p + dt / 0.16);
    });

    for (const r of this.rings) r.t += dt / r.dur;
    this.rings = this.rings.filter((r) => r.t < 1);

    if (this.stage === 'sealed' && this.crackStage === 0) {
      this.nudgeTimer -= dt;
      if (this.nudgeTimer <= 0) {
        this.nudgeTimer = 2.7;
        this.nudgeSign = -this.nudgeSign;
        this.wobble.poke(this.nudgeSign * 0.9);
        this.squash.poke(0.9);
        this.particles.emit({
          kind: 'star',
          x: -EGG.rx * 0.44,
          y: EGG.worldY - EGG.ry * 1.55,
          drag: 1,
          rot: 0.3,
          size: 15,
          maxLife: 0.7,
          fadeOut: 0.5,
          color: '#fff6dc',
        });
      }
    }
    if (this.stage === 'grow' || this.stage === 'settled') this.growT += dt;

    // rare and grail plants keep glittering after they settle
    if (this.stage === 'settled' && this.tier && this.tier.intensity >= 0.75 && this.plant && !this.reduced) {
      this.sparkleTimer -= dt;
      if (this.sparkleTimer <= 0) {
        this.sparkleTimer = this.tier.id === 'grail' ? 0.22 : 0.5;
        this.particles.emit({
          kind: 'star',
          x: randRange(this.fx, -this.plant.halfWidth, this.plant.halfWidth),
          y: POT.soilY - randRange(this.fx, 40, this.plant.height),
          vy: -randRange(this.fx, 8, 26),
          drag: 0.8,
          rot: this.fx() * TAU,
          size: randRange(this.fx, 8, 15),
          maxLife: randRange(this.fx, 0.9, 1.5),
          fadeOut: 0.6,
          color: this.fx() < 0.5 ? this.tier.color : this.tier.color2,
        });
      }
    }

    for (const m of this.motes) {
      m.y -= m.vy * dt;
      if (m.y < -0.02) {
        m.y = 1.02;
        m.x = this.fx();
      }
    }
    this.particles.update(dt);
  }

  // ------------------------------------------------------------ draw

  draw(): void {
    const { ctx, layout: l } = this;
    ctx.setTransform(l.dpr, 0, 0, l.dpr, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    if (this.backdrop) ctx.drawImage(this.backdrop, 0, 0, l.cssW, l.cssH);
    else {
      ctx.fillStyle = '#123a2e';
      ctx.fillRect(0, 0, l.cssW, l.cssH);
    }
    this.drawMotes(ctx);

    const pivotX = l.cx;
    const pivotY = l.floorY - l.s * 290;
    const sh = this.shakeOffset();
    ctx.save();
    ctx.translate(pivotX + sh.x, pivotY + sh.y);
    ctx.rotate(sh.r);
    ctx.scale(this.zoom, this.zoom);
    ctx.translate(-pivotX, -pivotY);
    ctx.translate(l.cx, l.floorY);
    ctx.scale(l.s, l.s);
    this.drawWorld(ctx);
    ctx.restore();

    if (this.flash > 0.004) this.drawFlash(ctx);
  }

  private groupPose(): { x: number; y: number; rot: number; alpha: number } {
    if (this.stage === 'drop') {
      const t = clamp(this.stageT / TIMING.dropSeconds);
      return { x: 0, y: -this.dropFrom * (1 - easeInQuad(t)), rot: 0, alpha: 1 };
    }
    if (this.stage === 'leave') {
      const t = clamp(this.stageT / TIMING.leaveSeconds);
      return { x: -(this.layout.cx / this.layout.s + 360) * easeInCubic(t), y: 0, rot: -0.1 * t, alpha: 1 - 0.5 * t };
    }
    return { x: 0, y: 0, rot: 0, alpha: 1 };
  }

  private drawWorld(ctx: Ctx): void {
    if (this.stage === 'empty') return;
    const g = this.groupPose();
    ctx.save();
    ctx.translate(g.x, g.y);
    ctx.rotate(g.rot);
    ctx.globalAlpha = g.alpha;

    this.drawRays(ctx);
    this.drawAura(ctx);
    if (this.plinthSprite) blit(ctx, this.plinthSprite);

    ctx.save();
    ctx.scale(1 + this.potSquash.x * 0.045, 1 - this.potSquash.x * 0.09);
    if (this.potSprite) blit(ctx, this.potSprite);
    if (this.stage === 'drop' || this.stage === 'sealed') this.drawSealed(ctx);
    else if (this.plant) {
      ctx.save();
      ctx.translate(0, POT.soilY);
      drawPlant(ctx, this.plant, this.growT, this.time, this.wind);
      ctx.restore();
    }
    ctx.restore();

    this.particles.draw(ctx, this.shell);
    this.drawRings(ctx);
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  private drawSealed(ctx: Ctx): void {
    const shell = this.shell;
    if (!shell) return;
    const tier = this.tier;

    // light leaking out of the cracks, behind and around the egg
    if (this.leak > 0.02 || this.leakPulse > 0.02) {
      const base = tier ? mixHex(WHITE_WARM, tier.color, this.leakMix) : WHITE_WARM;
      const rgb = rgbOf(base);
      const a = clamp(this.leak * 0.5 + this.leakPulse * 0.18, 0, 0.85);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const halo = ctx.createRadialGradient(EGG_CENTER.x, EGG_CENTER.y, 20, EGG_CENTER.x, EGG_CENTER.y, 270);
      halo.addColorStop(0, `rgba(${rgb},${a})`);
      halo.addColorStop(1, `rgba(${rgb},0)`);
      ctx.fillStyle = halo;
      ctx.fillRect(-320, EGG_CENTER.y - 320, 640, 640);
      ctx.restore();
    }

    ctx.save();
    ctx.translate(0, EGG.worldY);
    const breathe = 1 + Math.sin(this.time * 2.3) * 0.006;
    ctx.rotate(this.wobble.x);
    ctx.scale((1 + this.squash.x * 0.5) * breathe, (1 - this.squash.x) * breathe);
    drawShell(ctx, shell);
    if (this.crackStage > 0 || this.hitFlash) {
      const base = tier ? mixHex(WHITE_WARM, tier.color, this.leakMix) : WHITE_WARM;
      drawCracks(ctx, shell.path, this.cracks, this.crackProgress.map((p) => clamp(p)), this.leak, rgbOf(base), base);
    }
    if (this.hitFlash) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = 'rgba(255,248,226,0.2)';
      ctx.fill(shell.path);
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.restore();
  }

  private drawRays(ctx: Ctx): void {
    const life = 1.1;
    if (this.rayT >= life || this.rays.length === 0) return;
    const t = this.rayT / life;
    const a = Math.pow(1 - t, 2) * this.rayStrength;
    if (a < 0.01) return;
    const ox = 0;
    const oy = this.rayOrigin === 'plant' && this.plant ? POT.soilY - this.plant.height * 0.5 : EGG_CENTER.y;
    ctx.save();
    ctx.translate(ox, oy);
    ctx.globalCompositeOperation = 'lighter';
    const rgb = this.tier ? rgbOf(mixHex('#ffffff', this.tier.color, 0.45)) : '255,255,255';
    const grad = ctx.createRadialGradient(0, 0, 10, 0, 0, 900);
    grad.addColorStop(0, `rgba(${rgb},${a})`);
    grad.addColorStop(1, `rgba(${rgb},0)`);
    ctx.fillStyle = grad;
    const spin = this.rayT * 0.3;
    const grow = 0.55 + 0.45 * easeOutCubic(clamp(t * 3));
    for (const r of this.rays) {
      const a0 = r.angle + spin;
      const len = r.len * grow;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos(a0 - r.width / 2) * len, Math.sin(a0 - r.width / 2) * len);
      ctx.lineTo(Math.cos(a0 + r.width / 2) * len, Math.sin(a0 + r.width / 2) * len);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  private drawAura(ctx: Ctx): void {
    if (this.aura < 0.01 || !this.tier || this.stage === 'drop' || this.stage === 'sealed') return;
    const p = this.plant;
    const cy = POT.soilY - (p ? p.height * 0.5 : 180);
    const pulse = 1 + Math.sin(this.time * 2) * 0.05 * this.tier.intensity;
    const R = (p ? Math.max(p.height, p.halfWidth * 1.4) : 300) * 0.95 * pulse;
    const rgb = rgbOf(this.tier.color);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const grad = ctx.createRadialGradient(0, cy, R * 0.05, 0, cy, R);
    grad.addColorStop(0, `rgba(${rgb},${0.44 * this.aura})`);
    grad.addColorStop(0.55, `rgba(${rgb},${0.17 * this.aura})`);
    grad.addColorStop(1, `rgba(${rgb},0)`);
    ctx.fillStyle = grad;
    ctx.fillRect(-R, cy - R, R * 2, R * 2);
    ctx.restore();
  }

  private drawRings(ctx: Ctx): void {
    if (this.rings.length === 0) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const r of this.rings) {
      if (r.t <= 0) continue;
      const e = easeOutCubic(r.t);
      ctx.strokeStyle = `rgba(${r.rgb},${(1 - r.t) * 0.85})`;
      ctx.lineWidth = Math.max(1, r.width * (1 - r.t));
      ctx.beginPath();
      ctx.arc(r.cx, r.cy, r.maxR * e, 0, TAU);
      ctx.stroke();
    }
    ctx.restore();
  }

  private drawMotes(ctx: Ctx): void {
    const l = this.layout;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const m of this.motes) {
      const tw = 0.5 + 0.5 * Math.sin(this.time * 1.4 + m.phase);
      ctx.globalAlpha = 0.1 + 0.22 * tw;
      ctx.fillStyle = '#d6ffe6';
      ctx.beginPath();
      ctx.arc(m.x * l.cssW, m.y * l.cssH, m.r * Math.max(0.8, l.s), 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  /** A bloom of light around the shell, not a veil over the whole screen: additive, with a fast falloff. */
  private drawFlash(ctx: Ctx): void {
    const l = this.layout;
    const cx = l.cx;
    const cy = l.floorY - l.s * 300;
    const R = Math.max(l.cssW, l.cssH) * 0.8;
    const a = clamp(this.flash, 0, 1);
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, R);
    grad.addColorStop(0, `rgba(255,255,255,${a})`);
    grad.addColorStop(0.18, `rgba(${this.flashRgb},${a * 0.62})`);
    grad.addColorStop(0.5, `rgba(${this.flashRgb},${a * 0.16})`);
    grad.addColorStop(1, `rgba(${this.flashRgb},0)`);
    ctx.save();
    ctx.setTransform(l.dpr, 0, 0, l.dpr, 0, 0);
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, l.cssW, l.cssH);
    ctx.restore();
  }

  /** For tests and the facilitator view: where the finished plant's tag should anchor, in CSS pixels. */
  get plinthScreen(): { x: number; y: number } {
    return { x: this.layout.cx, y: this.layout.floorY + 30 * this.layout.s };
  }
}
