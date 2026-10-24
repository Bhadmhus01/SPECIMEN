import type { FormId } from '../config';
import { randRange, type Rng } from '../rng';
import { TAU, lerp } from '../util';
import {
  createSprite,
  makeGeom,
  mirrorX,
  paintBase,
  paintGloss,
  paintRim,
  paintVariegation,
  paintVeins,
  polyPath,
  sampleCubic,
} from './paint';
import type { Palette, Pt, Sprite } from './types';

export const MONSTERA_PALETTE: Palette = {
  base: '#2b7d46',
  light: '#44a05c',
  dark: '#124a2a',
  vein: 'rgba(214,246,194,0.30)',
  veinSoft: 'rgba(70,148,92,0.34)',
};

/** Right half of a cordate leaf, from the sinus (the petiole attachment) round the basal lobe, out to the widest point, up to the tip. */
function heartSide(H: number, hw: number): Pt[] {
  const s1 = sampleCubic([0, 0], [0.12 * hw, 0.1 * H], [0.4 * hw, 0.17 * H], [0.56 * hw, 0.13 * H], 8);
  const s2 = sampleCubic([0.56 * hw, 0.13 * H], [0.86 * hw, 0.11 * H], [1.02 * hw, -0.08 * H], [hw, -0.28 * H], 14);
  const s3 = sampleCubic([hw, -0.28 * H], [0.98 * hw, -0.58 * H], [0.5 * hw, -0.87 * H], [0, -H], 22);
  return [...s1, ...s2.slice(1), ...s3.slice(1)];
}

/** x of the margin at height y, scanning a side polyline (takes the outermost crossing). */
function edgeX(side: readonly Pt[], y: number): number {
  let best = 0;
  for (let i = 1; i < side.length; i++) {
    const a = side[i - 1] as Pt;
    const b = side[i] as Pt;
    if ((a[1] - y) * (b[1] - y) <= 0 && a[1] !== b[1]) {
      best = Math.max(best, lerp(a[0], b[0], (y - a[1]) / (b[1] - a[1])));
    }
  }
  return best;
}

interface Hole {
  x: number;
  y: number;
  long: number;
  short: number;
  rot: number;
}

interface Cuts {
  slits: Pt[][];
  holes: Hole[];
  /** Lateral veins, down the centre of each leaf segment between the slits. */
  strips: Pt[][];
}

function makeCuts(rng: Rng, H: number, hw: number, right: readonly Pt[]): Cuts {
  const slits: Pt[][] = [];
  const holes: Hole[] = [];
  const strips: Pt[][] = [];
  const slitYs = [-0.34, -0.48, -0.62, -0.76];

  for (const s of [1, -1]) {
    const ys = slitYs.map((y) => y * H + randRange(rng, -0.018, 0.018) * H);
    for (const y of ys) {
      const ex = edgeX(right, y);
      const margin: Pt = [s * ex, y];
      const midrib: Pt = [s * hw * 0.08, y + 0.19 * H];
      const depth = randRange(rng, 0.66, 0.82);
      const tip: Pt = [lerp(margin[0], midrib[0], depth), lerp(margin[1], midrib[1], depth)];
      const dx = margin[0] - tip[0];
      const dy = margin[1] - tip[1];
      const len = Math.hypot(dx, dy);
      const ux = dx / len;
      const uy = dy / len;
      const outer: Pt = [margin[0] + ux * 0.08 * H, margin[1] + uy * 0.08 * H];
      const nx = -uy;
      const ny = ux;
      const wm = H * randRange(rng, 0.026, 0.04);
      const wt = H * 0.006;
      slits.push([
        [outer[0] + nx * wm, outer[1] + ny * wm],
        [tip[0] + nx * wt, tip[1] + ny * wt],
        [tip[0] - ux * wt * 1.7, tip[1] - uy * wt * 1.7],
        [tip[0] - nx * wt, tip[1] - ny * wt],
        [outer[0] - nx * wm, outer[1] - ny * wm],
      ]);
    }
    // lateral veins: one down the middle of each segment between slits (and one below the lowest slit)
    const centres = [ys[0]! + 0.07 * H, ...ys.slice(1).map((y, i) => (y + ys[i]!) / 2)];
    for (const yc of centres) {
      const ex = edgeX(right, yc);
      strips.push([
        [s * hw * 0.06, yc + 0.2 * H],
        [s * ex * 0.55, yc + 0.08 * H],
        [s * ex * 0.93, yc],
      ]);
    }
    // fenestration holes near the midrib
    for (const t of [0.3, 0.44, 0.58, 0.7]) {
      holes.push({
        x: s * hw * randRange(rng, 0.24, 0.36),
        y: -t * H + randRange(rng, -0.01, 0.01) * H,
        long: H * randRange(rng, 0.04, 0.058),
        short: H * randRange(rng, 0.013, 0.02),
        rot: Math.atan2(-0.17 * H, s * 0.83 * hw),
      });
    }
  }
  return { slits, holes, strips };
}

/** One Monstera deliciosa leaf, H units tall, pre-rendered at k pixels per unit. */
export function buildMonsteraLeaf(rng: Rng, form: FormId, H: number, k: number): Sprite {
  const hw = (H * randRange(rng, 0.92, 1.04)) / 2;
  const right = heartSide(H, hw);
  const outline: Pt[] = [...right, ...mirrorX(right).reverse().slice(1, -1)];
  const geom = makeGeom(outline, [
    [0, 0.5 * H],
    [0, -1.5 * H],
  ]);
  const { slits, holes, strips } = makeCuts(rng, H, hw, right);
  const midrib: Pt[] = [
    [0, 0.02 * H],
    [0, -0.5 * H],
    [0, -0.95 * H],
  ];
  const veins = [midrib, ...strips];
  const pal = MONSTERA_PALETTE;
  const { sprite, ctx } = createSprite(geom.bounds, k);

  paintBase(ctx, geom, pal);
  paintVeins(ctx, veins, pal.vein, 1.5);
  paintVariegation(ctx, geom, form, rng, pal);
  paintVeins(ctx, veins, pal.veinSoft, 1.15);
  paintGloss(ctx, geom);

  // carve the splits and the holes
  ctx.save();
  ctx.globalCompositeOperation = 'destination-out';
  ctx.fillStyle = '#000';
  for (const s of slits) {
    polyPath(ctx, s);
    ctx.fill();
  }
  for (const h of holes) {
    ctx.beginPath();
    ctx.ellipse(h.x, h.y, h.long, h.short, h.rot, 0, TAU);
    ctx.fill();
  }
  ctx.restore();

  // edge shading along the margin, the slits and the holes
  paintRim(ctx, outline);
  for (const s of slits) paintRim(ctx, s, 'rgba(8,40,22,0.4)', 2.2);
  ctx.save();
  ctx.globalCompositeOperation = 'source-atop';
  ctx.strokeStyle = 'rgba(8,40,22,0.4)';
  ctx.lineWidth = 1.8;
  for (const h of holes) {
    ctx.beginPath();
    ctx.ellipse(h.x, h.y, h.long, h.short, h.rot, 0, TAU);
    ctx.stroke();
  }
  ctx.restore();

  return sprite;
}
