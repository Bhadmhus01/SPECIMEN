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
  sampleCubic,
} from './paint';
import type { Palette, Pt, Sprite } from './types';

export const PILEA_PALETTE: Palette = {
  base: '#4fae52',
  light: '#8bd86c',
  dark: '#26803d',
  vein: 'rgba(228,252,204,0.36)',
  veinSoft: 'rgba(64,148,84,0.32)',
};

/**
 * One Pilea peperomioides leaf: a round, slightly scalloped coin of radius R units,
 * anchored at its centre (the petiole attaches underneath, in the middle).
 */
export function buildPileaLeaf(rng: Rng, form: FormId, R: number, k: number): Sprite {
  const ph1 = rng() * TAU;
  const ph2 = rng() * TAU;
  const outline: Pt[] = [];
  const N = 76;
  for (let i = 0; i < N; i++) {
    const a = (i / N) * TAU;
    const r = R * (1 + 0.022 * Math.sin(7 * a + ph1) + 0.012 * Math.sin(3 * a + ph2));
    outline.push([r * Math.cos(a), r * Math.sin(a) * 0.94]);
  }
  const a0 = rng() * Math.PI;
  const divider: Pt[] = [
    [-2 * R * Math.cos(a0), -2 * R * Math.sin(a0)],
    [2 * R * Math.cos(a0), 2 * R * Math.sin(a0)],
  ];
  const geom = makeGeom(outline, divider);
  const pal = PILEA_PALETTE;
  const { sprite, ctx } = createSprite(geom.bounds, k);

  // radial veins, curving gently out from the centre
  const veins: Pt[][] = [];
  const nv = 9;
  for (let i = 0; i < nv; i++) {
    const a = (i / nv) * TAU + randRange(rng, -0.12, 0.12);
    const curl = randRange(rng, 0.1, 0.24);
    const at = (rr: number, aa: number): Pt => [rr * R * Math.cos(aa), rr * R * Math.sin(aa) * 0.94];
    veins.push(sampleCubic(at(0.06, a), at(0.35, a + curl), at(0.65, a - curl * 0.4), at(0.92, a + curl * 0.3), 10));
  }

  paintBase(ctx, geom, pal);
  // the little central dimple where the stem joins
  ctx.save();
  ctx.globalCompositeOperation = 'source-atop';
  const dimple = ctx.createRadialGradient(0, 0, 0, 0, 0, R * 0.2);
  dimple.addColorStop(0, 'rgba(0,50,20,0.32)');
  dimple.addColorStop(1, 'rgba(0,50,20,0)');
  ctx.fillStyle = dimple;
  ctx.fillRect(-R * 0.3, -R * 0.3, R * 0.6, R * 0.6);
  ctx.restore();

  paintVeins(ctx, veins, pal.vein, 1.3);
  paintVariegation(ctx, geom, form, rng, pal);
  paintVeins(ctx, veins, pal.veinSoft, 1.0);
  paintGloss(ctx, geom);
  paintRim(ctx, outline, 'rgba(10,60,28,0.4)', 2.4);
  return sprite;
}
