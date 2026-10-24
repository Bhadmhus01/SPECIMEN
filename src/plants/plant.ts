import type { SpeciesId } from '../config';
import { mulberry32, randRange, subSeed, type Rng } from '../rng';
import type { RollResult } from '../roll';
import { DEG, TAU, clamp, easeOutBack, easeOutCubic, lerp, type Pt } from '../util';
import { buildMonsteraLeaf } from './monstera';
import { buildPileaLeaf } from './pilea';
import { buildSnakeBlade } from './snake';
import type { GrowStyle, LeafSpec, Plant, Sprite } from './types';

/**
 * A plant is a pure function of (species, form, seed): the same roll result draws the same plant
 * on every client — which is what lets the server stay authoritative while clients only render.
 */

interface LeafPlan {
  build(k: number): Sprite;
  base: Pt;
  tip: Pt;
  bend: number;
  stemWidth: number;
  stemColor: string;
  angle: number;
  style: GrowStyle;
  z: number;
  swayAmp: number;
  /** 0..1: when in the growth this leaf comes in. */
  order: number;
}

// ---------------------------------------------------------------- layouts
// Plant space: origin at the soil centre, up is negative y.

/** [tipX, tipY, angleDeg, leafHeight, bend, z] — listed in growth order. */
const MONSTERA_LAYOUT: readonly (readonly number[])[] = [
  [4, -300, -3, 128, -6, 1],
  [-82, -246, -42, 140, -20, 2],
  [86, -250, 44, 140, 20, 3],
  [-128, -172, -76, 128, -34, 4],
  [132, -176, 78, 128, 34, 5],
  [-24, -214, -12, 158, -4, 8],
  [88, -122, 104, 98, 24, 6],
  [-90, -126, -102, 100, -24, 7],
];

/** The layout table is drawn generously; these pull it into the design box (see scene/layout.ts). */
const MONSTERA_POS = 0.88;
const MONSTERA_SIZE = 0.93;

function planMonstera(result: RollResult, rng: Rng): LeafPlan[] {
  const n = MONSTERA_LAYOUT.length;
  return MONSTERA_LAYOUT.map((row, i) => {
    const [x0, y0, deg, H0, bend, z] = row as [number, number, number, number, number, number];
    const x = x0 * MONSTERA_POS;
    const y = y0 * MONSTERA_POS;
    const H = H0 * MONSTERA_SIZE;
    const height = H * randRange(rng, 0.94, 1.06);
    const seed = subSeed(result.seed, `leaf-${i}`);
    return {
      build: (k) => buildMonsteraLeaf(mulberry32(seed), result.form, height, k),
      base: [randRange(rng, -10, 10), 0],
      tip: [x + randRange(rng, -6, 6), y + randRange(rng, -6, 6)],
      bend,
      stemWidth: 5.4,
      stemColor: '#3b8a4c',
      angle: (deg + randRange(rng, -5, 5)) * DEG,
      style: 'unfurl',
      z,
      swayAmp: 0.034,
      order: i / (n - 1),
    } satisfies LeafPlan;
  });
}

/** [baseX, tiltDeg, length, halfWidth, z] */
const SNAKE_LAYOUT: readonly (readonly number[])[] = [
  [0, -1, 372, 28, 1],
  [-14, -9, 318, 25, 2],
  [16, 7, 332, 26, 3],
  [-34, -19, 262, 22, 4],
  [38, 21, 270, 22, 5],
  [-52, -30, 196, 19, 6],
  [56, 31, 204, 19, 7],
];

function planSnake(result: RollResult, rng: Rng): LeafPlan[] {
  const n = SNAKE_LAYOUT.length;
  return SNAKE_LAYOUT.map((row, i) => {
    const [x, deg, L, hw, z] = row as [number, number, number, number, number];
    const length = L * randRange(rng, 0.95, 1.05);
    const seed = subSeed(result.seed, `leaf-${i}`);
    const base: Pt = [x * 0.85 + randRange(rng, -3, 3), randRange(rng, -3, 3)];
    return {
      build: (k) => buildSnakeBlade(mulberry32(seed), result.form, length, hw, k),
      base,
      tip: base,
      bend: 0,
      stemWidth: 0,
      stemColor: '#000',
      angle: (deg + randRange(rng, -2, 2)) * DEG,
      style: 'shoot',
      z,
      swayAmp: 0.013,
      order: i / (n - 1),
    } satisfies LeafPlan;
  });
}

/** [angleDeg from vertical, reach, leafRadius, z] — a fountain of coins on thin arching stems. */
const PILEA_LAYOUT: readonly (readonly number[])[] = [
  [-4, 252, 36, 1],
  [14, 226, 38, 2],
  [-20, 214, 38, 3],
  [34, 200, 41, 4],
  [-40, 192, 41, 5],
  [8, 168, 44, 12],
  [54, 176, 44, 6],
  [-58, 172, 44, 7],
  [74, 150, 46, 8],
  [-78, 148, 46, 9],
  [30, 130, 47, 13],
  [-32, 126, 47, 14],
  [88, 112, 46, 10],
  [-90, 110, 46, 11],
];

function planPilea(result: RollResult, rng: Rng): LeafPlan[] {
  const n = PILEA_LAYOUT.length;
  return PILEA_LAYOUT.map((row, i) => {
    const [deg, reach, R, z] = row as [number, number, number, number];
    const a = (deg + randRange(rng, -4, 4)) * DEG;
    const r = reach * randRange(rng, 0.96, 1.04);
    const radiusJitter = randRange(rng, 0.97, 1.03);
    const seed = subSeed(result.seed, `leaf-${i}`);
    return {
      build: (k) => buildPileaLeaf(mulberry32(seed), result.form, R * 0.88 * radiusJitter, k),
      base: [randRange(rng, -8, 8), 0],
      tip: [Math.sin(a) * r * 0.82, -Math.cos(a) * r * 0.86 + Math.abs(Math.sin(a)) * 16],
      bend: Math.sin(a) * 26,
      stemWidth: 2.7,
      stemColor: '#8fcb6c',
      angle: a * 0.45 + randRange(rng, -0.12, 0.12),
      style: 'pop',
      z,
      swayAmp: 0.05,
      order: i / (n - 1),
    } satisfies LeafPlan;
  });
}

const PLANNERS: Record<SpeciesId, (result: RollResult, rng: Rng) => LeafPlan[]> = {
  monstera: planMonstera,
  snake: planSnake,
  pilea: planPilea,
};

// ---------------------------------------------------------------- builder

/**
 * Builds a plant one leaf at a time, so the game can spread sprite generation across frames
 * (a leaf costs a few ms) instead of hitching the crack animation.
 */
export class PlantBuilder {
  readonly roll: RollResult;
  private readonly plans: LeafPlan[];
  private readonly built: LeafSpec[] = [];
  private readonly k: number;
  private readonly growSeconds: number;
  private readonly swayRng: Rng;
  private finished: Plant | null = null;

  constructor(roll: RollResult, pixelsPerUnit: number, growSeconds: number) {
    this.roll = roll;
    this.k = pixelsPerUnit;
    this.growSeconds = growSeconds;
    this.plans = PLANNERS[roll.species](roll, mulberry32(subSeed(roll.seed, 'layout')));
    this.swayRng = mulberry32(subSeed(roll.seed, 'sway'));
  }

  get total(): number {
    return this.plans.length;
  }

  get done(): boolean {
    return this.finished !== null;
  }

  get plant(): Plant | null {
    return this.finished;
  }

  /** Build one more leaf. Returns true once the plant is complete. */
  step(): boolean {
    if (this.finished) return true;
    const plan = this.plans[this.built.length];
    if (plan) {
      const g = this.growSeconds;
      this.built.push({
        sprite: plan.build(this.k),
        base: plan.base,
        tip: plan.tip,
        bend: plan.bend,
        stemWidth: plan.stemWidth,
        stemColor: plan.stemColor,
        angle: plan.angle,
        style: plan.style,
        delay: plan.order * g * 0.55,
        dur: g * 0.45,
        swayAmp: plan.swayAmp,
        swaySpeed: randRange(this.swayRng, 0.9, 1.5),
        swayPhase: this.swayRng() * TAU,
        z: plan.z,
      });
    }
    if (this.built.length >= this.plans.length) this.finished = assemble(this.built, this.growSeconds);
    return this.finished !== null;
  }
}

export function buildPlantSync(roll: RollResult, pixelsPerUnit: number, growSeconds: number): Plant {
  const builder = new PlantBuilder(roll, pixelsPerUnit, growSeconds);
  while (!builder.step()) {
    /* keep building */
  }
  return builder.plant as Plant;
}

function assemble(leaves: LeafSpec[], growSeconds: number): Plant {
  const sorted = [...leaves].sort((a, b) => a.z - b.z);
  let top = 0;
  let half = 0;
  for (const l of sorted) {
    const s = l.sprite;
    const x0 = -s.ax / s.k;
    const x1 = (s.canvas.width - s.ax) / s.k;
    const y0 = -s.ay / s.k;
    const y1 = (s.canvas.height - s.ay) / s.k;
    const c = Math.cos(l.angle);
    const sn = Math.sin(l.angle);
    for (const [x, y] of [
      [x0, y0],
      [x1, y0],
      [x1, y1],
      [x0, y1],
    ] as const) {
      top = Math.min(top, x * sn + y * c + l.tip[1]);
      half = Math.max(half, Math.abs(x * c - y * sn + l.tip[0]));
    }
  }
  return {
    leaves: sorted,
    growSeconds,
    height: -top,
    halfWidth: half,
    dispose() {
      // Deliberately a no-op beyond dropping references. Shrinking the canvases to 0x0 looks tidy but
      // makes GPU-backed canvases that recent frames still reference stall the compositor; the GC reclaims them safely.
      sorted.length = 0;
    },
  };
}

// ---------------------------------------------------------------- drawing

type Ctx = CanvasRenderingContext2D;

function drawSprite(ctx: Ctx, s: Sprite): void {
  ctx.drawImage(s.canvas, -s.ax / s.k, -s.ay / s.k, s.canvas.width / s.k, s.canvas.height / s.k);
}

const quad = (a: number, c: number, b: number, t: number): number => (1 - t) * (1 - t) * a + 2 * (1 - t) * t * c + t * t * b;

/** Draws the petiole from base to tip as far as growth `e` (0..1) and returns where it ends. */
function drawStem(ctx: Ctx, l: LeafSpec, e: number): Pt {
  const [bx, by] = l.base;
  const [tx, ty] = l.tip;
  const cx = bx + l.bend;
  const cy = ty + 0.1 * (by - ty);
  const ex = quad(bx, cx, tx, e);
  const ey = quad(by, cy, ty, e);
  ctx.beginPath();
  ctx.moveTo(bx, by);
  ctx.quadraticCurveTo(lerp(bx, cx, e), lerp(by, cy, e), ex, ey);
  ctx.strokeStyle = l.stemColor;
  ctx.lineWidth = l.stemWidth;
  ctx.lineCap = 'round';
  ctx.stroke();
  return [ex, ey];
}

/**
 * Draw the plant in plant space (origin at the soil centre).
 * @param growT seconds since the sprout began
 * @param time  free-running seconds, for idle sway
 * @param wind  sway multiplier (gusts)
 */
export function drawPlant(ctx: Ctx, plant: Plant, growT: number, time: number, wind = 1): void {
  for (const l of plant.leaves) {
    const p = clamp((growT - l.delay) / l.dur);
    if (p <= 0) continue;
    const sway = Math.sin(time * l.swaySpeed + l.swayPhase) * l.swayAmp * wind;

    ctx.save();
    // the whole petiole + leaf group leans a little, pivoting at the soil
    ctx.translate(l.base[0], l.base[1]);
    ctx.rotate(sway * 0.3);
    ctx.translate(-l.base[0], -l.base[1]);

    if (l.style === 'shoot') {
      ctx.translate(l.tip[0], l.tip[1]);
      ctx.rotate(l.angle + sway);
      const grow = Math.max(0.001, easeOutBack(p, 1.15));
      ctx.scale(lerp(0.72, 1, easeOutCubic(p)), grow);
      drawSprite(ctx, l.sprite);
    } else {
      const e = easeOutCubic(clamp(p / 0.7));
      const [ex, ey] = drawStem(ctx, l, e);
      const q = clamp((p - 0.2) / 0.8);
      if (q > 0) {
        ctx.translate(ex, ey);
        if (l.style === 'unfurl') {
          const open = easeOutBack(q, 1.25);
          ctx.rotate(l.angle * (0.6 + 0.4 * e) + sway);
          ctx.scale(lerp(0.12, 1, open), lerp(0.22, 1, open));
        } else {
          const pop = Math.max(0.001, easeOutBack(q, 1.9));
          ctx.rotate(l.angle + (1 - q) * 0.5 + sway);
          ctx.scale(pop, pop);
        }
        drawSprite(ctx, l.sprite);
      }
    }
    ctx.restore();
  }
}
