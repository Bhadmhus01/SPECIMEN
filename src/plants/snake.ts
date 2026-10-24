import type { FormId } from '../config';
import { randRange, type Rng } from '../rng';
import { TAU } from '../util';
import {
  createSprite,
  makeGeom,
  paintBase,
  paintGloss,
  paintRim,
  paintVariegation,
  paintVeins,
  polyPath,
  strokeLine,
} from './paint';
import type { Palette, Pt, Sprite } from './types';

export const SNAKE_PALETTE: Palette = {
  base: '#27663f',
  light: '#42945c',
  dark: '#0f3b25',
  vein: 'rgba(196,238,168,0.26)',
  veinSoft: 'rgba(78,150,96,0.3)',
};

/** Half-width profile along the blade, t in [0, 1] from base to tip, as a fraction of the max half-width. */
function widthProfile(t: number): number {
  const body = 0.35 + 0.65 * Math.pow(Math.sin(Math.PI * Math.pow(Math.min(t, 1), 0.6)), 0.9);
  const taper = Math.pow(Math.max(1 - Math.pow(t, 3.5), 0), 0.8);
  return body * taper;
}

/**
 * One Dracaena trifasciata (snake plant) blade, L units long, `hw` units half-width at its widest.
 * The anchor is the base of the blade, so it can grow straight up out of the soil.
 */
export function buildSnakeBlade(rng: Rng, form: FormId, L: number, hw: number, k: number): Sprite {
  const p0: Pt = [0, 0];
  const p1: Pt = [randRange(rng, -0.1, 0.1) * L, -0.5 * L];
  const p2: Pt = [randRange(rng, -0.07, 0.07) * L, -L];

  const point = (t: number): Pt => {
    const u = 1 - t;
    return [u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0], u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1]];
  };
  const frame = (t: number): { p: Pt; tx: number; ty: number; nx: number; ny: number } => {
    const u = 1 - t;
    const dx = 2 * u * (p1[0] - p0[0]) + 2 * t * (p2[0] - p1[0]);
    const dy = 2 * u * (p1[1] - p0[1]) + 2 * t * (p2[1] - p1[1]);
    const len = Math.hypot(dx, dy) || 1;
    return { p: point(t), tx: dx / len, ty: dy / len, nx: -dy / len, ny: dx / len };
  };

  const N = 34;
  const right: Pt[] = [];
  const left: Pt[] = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const f = frame(t);
    const w = hw * widthProfile(t);
    right.push([f.p[0] + f.nx * w, f.p[1] + f.ny * w]);
    left.push([f.p[0] - f.nx * w, f.p[1] - f.ny * w]);
  }
  const outline: Pt[] = [...right, ...left.reverse()];

  // the divider follows the centre line, extended a little past both ends
  const divider: Pt[] = [];
  for (let i = 0; i <= 20; i++) divider.push(point(-0.1 + (1.24 * i) / 20));

  const geom = makeGeom(outline, divider);
  const pal = SNAKE_PALETTE;
  const { sprite, ctx } = createSprite(geom.bounds, k);

  paintBase(ctx, geom, pal);

  // the lighter, wavy cross-banding that gives snake plants their tiger stripes
  ctx.save();
  ctx.globalCompositeOperation = 'source-atop';
  ctx.lineCap = 'round';
  const phase = rng() * TAU;
  for (let u = 0.05 + rng() * 0.03; u < 0.97; u += randRange(rng, 0.048, 0.062)) {
    const f = frame(u);
    const w = hw * widthProfile(u);
    const pts: Pt[] = [];
    for (let s = -1.3; s <= 1.3001; s += 0.13) {
      const wave = Math.sin(s * 2.6 + phase + u * 9) * 0.013 * L + s * s * 0.012 * L;
      pts.push([f.p[0] + f.nx * s * w + f.tx * wave, f.p[1] + f.ny * s * w + f.ty * wave]);
    }
    ctx.strokeStyle = `rgba(176,218,138,${randRange(rng, 0.2, 0.36)})`;
    ctx.lineWidth = randRange(rng, 0.008, 0.015) * L;
    strokeLine(ctx, pts);
  }
  // a pale margin, like the gold-edged 'Laurentii'
  ctx.strokeStyle = 'rgba(208,232,128,0.55)';
  ctx.lineWidth = 6;
  ctx.lineJoin = 'round';
  polyPath(ctx, outline);
  ctx.stroke();
  ctx.restore();

  const mid: Pt[] = [];
  for (let i = 1; i <= 18; i++) mid.push(point(i / 19));
  paintVeins(ctx, [mid], pal.vein, 1.6);
  paintVariegation(ctx, geom, form, rng, pal);
  paintVeins(ctx, [mid], pal.veinSoft, 1.1);
  paintGloss(ctx, geom);
  paintRim(ctx, outline);
  return sprite;
}
