import type { FormId } from '../config';
import { gauss, pick, randInt, randRange, type Rng } from '../rng';
import { TAU, get2d, lerp, makeCanvas, type Pt } from '../util';
import type { Bounds, LeafGeom, Palette, Sprite } from './types';

type Ctx = CanvasRenderingContext2D;

// ---------------------------------------------------------------- geometry

export function boundsOf(pts: readonly Pt[]): Bounds {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of pts) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  return { minX, minY, maxX, maxY };
}

/** Build a LeafGeom from an outline: derives bounds, area-based size and centroid. */
export function makeGeom(outline: Pt[], divider: Pt[]): LeafGeom {
  let area = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0, j = outline.length - 1; i < outline.length; j = i++) {
    const [xi, yi] = outline[i] as Pt;
    const [xj, yj] = outline[j] as Pt;
    const cross = xj * yi - xi * yj;
    area += cross;
    cx += (xj + xi) * cross;
    cy += (yj + yi) * cross;
  }
  area /= 2;
  const center: Pt = Math.abs(area) > 1e-6 ? [cx / (6 * area), cy / (6 * area)] : [0, 0];
  return { outline, bounds: boundsOf(outline), divider, size: Math.sqrt(Math.abs(area)), center };
}

export function sampleCubic(p0: Pt, p1: Pt, p2: Pt, p3: Pt, n: number): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const u = 1 - t;
    const a = u * u * u;
    const b = 3 * u * u * t;
    const c = 3 * u * t * t;
    const d = t * t * t;
    out.push([a * p0[0] + b * p1[0] + c * p2[0] + d * p3[0], a * p0[1] + b * p1[1] + c * p2[1] + d * p3[1]]);
  }
  return out;
}

export function mirrorX(pts: readonly Pt[]): Pt[] {
  return pts.map(([x, y]) => [-x, y] as Pt);
}

export function insidePoly(pts: readonly Pt[], x: number, y: number): boolean {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i] as Pt;
    const [xj, yj] = pts[j] as Pt;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function pointInLeaf(rng: Rng, g: LeafGeom): Pt {
  const b = g.bounds;
  for (let i = 0; i < 40; i++) {
    const x = randRange(rng, b.minX, b.maxX);
    const y = randRange(rng, b.minY, b.maxY);
    if (insidePoly(g.outline, x, y)) return [x, y];
  }
  return g.center;
}

/** Evenly resample a polyline to `n` points (linear). */
export function resample(pts: readonly Pt[], n: number): Pt[] {
  const lens = [0];
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1] as Pt;
    const b = pts[i] as Pt;
    lens.push((lens[i - 1] as number) + Math.hypot(b[0] - a[0], b[1] - a[1]));
  }
  const total = lens[lens.length - 1] as number;
  const out: Pt[] = [];
  let seg = 1;
  for (let i = 0; i < n; i++) {
    const d = (i / (n - 1)) * total;
    while (seg < pts.length - 1 && (lens[seg] as number) < d) seg++;
    const a = pts[seg - 1] as Pt;
    const b = pts[seg] as Pt;
    const span = (lens[seg] as number) - (lens[seg - 1] as number);
    const t = span > 0 ? (d - (lens[seg - 1] as number)) / span : 0;
    out.push([lerp(a[0], b[0], t), lerp(a[1], b[1], t)]);
  }
  return out;
}

export function blobPoints(rng: Rng, cx: number, cy: number, r: number, wobble = 0.35, n = 22): Pt[] {
  const ph = [rng() * TAU, rng() * TAU, rng() * TAU];
  const amp = [wobble * 0.55, wobble * 0.3, wobble * 0.15];
  const stretch = randRange(rng, 0.72, 1.28);
  const rot = rng() * TAU;
  const cr = Math.cos(rot);
  const sr = Math.sin(rot);
  const pts: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU;
    const rr =
      r *
      (1 +
        (amp[0] as number) * Math.sin(2 * a + (ph[0] as number)) +
        (amp[1] as number) * Math.sin(3 * a + (ph[1] as number)) +
        (amp[2] as number) * Math.sin(5 * a + (ph[2] as number)));
    const x = rr * Math.cos(a) * stretch;
    const y = (rr * Math.sin(a)) / stretch;
    pts.push([cx + x * cr - y * sr, cy + x * sr + y * cr]);
  }
  return pts;
}

// ---------------------------------------------------------------- canvas paths

export function polyPath(ctx: Ctx, pts: readonly Pt[], close = true): void {
  ctx.beginPath();
  for (let i = 0; i < pts.length; i++) {
    const [x, y] = pts[i] as Pt;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  if (close) ctx.closePath();
}

/** Smooth closed curve through the midpoints of a polygon — turns a wobbly polygon into a blob. */
export function smoothClosed(ctx: Ctx, pts: readonly Pt[]): void {
  const n = pts.length;
  const mid = (a: Pt, b: Pt): Pt => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const m0 = mid(pts[n - 1] as Pt, pts[0] as Pt);
  ctx.beginPath();
  ctx.moveTo(m0[0], m0[1]);
  for (let i = 0; i < n; i++) {
    const p = pts[i] as Pt;
    const m = mid(p, pts[(i + 1) % n] as Pt);
    ctx.quadraticCurveTo(p[0], p[1], m[0], m[1]);
  }
  ctx.closePath();
}

export function fillBlob(ctx: Ctx, rng: Rng, cx: number, cy: number, r: number, wobble = 0.35): void {
  smoothClosed(ctx, blobPoints(rng, cx, cy, r, wobble));
  ctx.fill();
}

export function strokeLine(ctx: Ctx, pts: readonly Pt[]): void {
  polyPath(ctx, pts, false);
  ctx.stroke();
}

// ---------------------------------------------------------------- sprite

export function createSprite(bounds: Bounds, k: number, pad = 6): { sprite: Sprite; ctx: Ctx } {
  const w = bounds.maxX - bounds.minX + pad * 2;
  const h = bounds.maxY - bounds.minY + pad * 2;
  const canvas = makeCanvas(w * k, h * k);
  const ctx = get2d(canvas);
  const ax = (pad - bounds.minX) * k;
  const ay = (pad - bounds.minY) * k;
  ctx.setTransform(k, 0, 0, k, ax, ay); // from here on, draw in leaf units
  return { sprite: { canvas, ax, ay, k, w, h }, ctx };
}

function coverBounds(ctx: Ctx, b: Bounds, pad = 4): void {
  ctx.fillRect(b.minX - pad, b.minY - pad, b.maxX - b.minX + pad * 2, b.maxY - b.minY + pad * 2);
}

// ---------------------------------------------------------------- base shading

export function paintBase(ctx: Ctx, g: LeafGeom, pal: Palette): void {
  const [cx, cy] = g.center;
  polyPath(ctx, g.outline);
  const grad = ctx.createRadialGradient(cx - g.size * 0.1, cy - g.size * 0.12, g.size * 0.04, cx, cy, g.size * 0.85);
  grad.addColorStop(0, pal.light);
  grad.addColorStop(0.55, pal.base);
  grad.addColorStop(1, pal.dark);
  ctx.fillStyle = grad;
  ctx.fill();

  // Fold shading: one half a touch lighter, the other darker — reads as a creased, curved blade.
  ctx.save();
  ctx.globalCompositeOperation = 'source-atop';
  const b = g.bounds;
  const fold = ctx.createLinearGradient(b.minX, 0, b.maxX, 0);
  fold.addColorStop(0, 'rgba(255,255,255,0.08)');
  fold.addColorStop(0.5, 'rgba(0,0,0,0)');
  fold.addColorStop(1, 'rgba(0,0,0,0.17)');
  ctx.fillStyle = fold;
  coverBounds(ctx, b);
  ctx.restore();
}

/** Stroke veins (source-atop, so paint only lands on the leaf). */
export function paintVeins(ctx: Ctx, lines: readonly (readonly Pt[])[], color: string, width: number): void {
  ctx.save();
  ctx.globalCompositeOperation = 'source-atop';
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const line of lines) strokeLine(ctx, line);
  ctx.restore();
}

export function paintGloss(ctx: Ctx, g: LeafGeom): void {
  ctx.save();
  ctx.globalCompositeOperation = 'source-atop';
  const b = g.bounds;
  const grad = ctx.createLinearGradient(b.minX, b.minY, b.maxX, b.maxY);
  grad.addColorStop(0, 'rgba(255,255,255,0.20)');
  grad.addColorStop(0.45, 'rgba(255,255,255,0.03)');
  grad.addColorStop(1, 'rgba(0,20,10,0.16)');
  ctx.fillStyle = grad;
  coverBounds(ctx, b);
  ctx.restore();
}

export function paintRim(ctx: Ctx, outline: readonly Pt[], color = 'rgba(8,40,22,0.42)', width = 2.6): void {
  ctx.save();
  ctx.globalCompositeOperation = 'source-atop';
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineJoin = 'round';
  polyPath(ctx, outline);
  ctx.stroke();
  ctx.restore();
}

// ---------------------------------------------------------------- variegation

const CREAMS = ['#f8f2d2', '#efe6ae', '#fffbe8', '#f3ecc4'];
const PINKS = ['#ff6fa3', '#ff5c93', '#f9779f', '#ff86b0', '#f4527f'];
const TRI_CREAMS = ['#fff3d8', '#ffeacd', '#fff8e6'];

/** Paint a form's variegation. All drawing is source-atop, so it lands only on the leaf. */
export function paintVariegation(ctx: Ctx, g: LeafGeom, form: FormId, rng: Rng, pal: Palette): void {
  ctx.save();
  ctx.globalCompositeOperation = 'source-atop';
  switch (form) {
    case 'classic':
      tonalNoise(ctx, g, rng);
      break;
    case 'speckled':
      tonalNoise(ctx, g, rng);
      speckle(ctx, g, rng);
      break;
    case 'halfmoon':
      halfMoon(ctx, g, rng, pal);
      break;
    case 'tricolor':
      tricolor(ctx, g, rng);
      break;
  }
  ctx.restore();
}

function tonalNoise(ctx: Ctx, g: LeafGeom, rng: Rng): void {
  for (let i = 0; i < 9; i++) {
    const [x, y] = pointInLeaf(rng, g);
    ctx.fillStyle = i % 2 === 0 ? `rgba(220,255,200,${randRange(rng, 0.04, 0.08)})` : `rgba(0,35,12,${randRange(rng, 0.05, 0.09)})`;
    fillBlob(ctx, rng, x, y, g.size * randRange(rng, 0.16, 0.34), 0.45);
  }
}

function speckle(ctx: Ctx, g: LeafGeom, rng: Rng): void {
  const b = g.bounds;
  const area = (b.maxX - b.minX) * (b.maxY - b.minY) * 0.62;
  const n = Math.round(area * 0.03);
  const clusters = Array.from({ length: randInt(rng, 4, 6) }, () => pointInLeaf(rng, g));
  for (let i = 0; i < n; i++) {
    let x: number;
    let y: number;
    if (rng() < 0.72) {
      const c = pick(rng, clusters);
      x = c[0] + gauss(rng) * g.size * 0.2;
      y = c[1] + gauss(rng) * g.size * 0.2;
    } else {
      [x, y] = pointInLeaf(rng, g);
    }
    const r = Math.min(Math.exp(gauss(rng) * 0.55) * g.size * 0.0115, g.size * 0.045);
    ctx.globalAlpha = randRange(rng, 0.72, 1);
    ctx.fillStyle = pick(rng, CREAMS);
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.fill();
  }
  // a few larger irregular splashes — the "constellation" look
  const splashes = randInt(rng, 3, 5);
  for (let i = 0; i < splashes; i++) {
    const [x, y] = pointInLeaf(rng, g);
    ctx.globalAlpha = randRange(rng, 0.8, 0.95);
    ctx.fillStyle = pick(rng, CREAMS);
    fillBlob(ctx, rng, x, y, g.size * randRange(rng, 0.035, 0.07), 0.5);
  }
  ctx.globalAlpha = 1;
}

function normalOf(pts: readonly Pt[]): Pt {
  const a = pts[0] as Pt;
  const z = pts[pts.length - 1] as Pt;
  const dx = z[0] - a[0];
  const dy = z[1] - a[1];
  const len = Math.hypot(dx, dy) || 1;
  return [-dy / len, dx / len];
}

function halfMoon(ctx: Ctx, g: LeafGeom, rng: Rng, pal: Palette): void {
  const side = rng() < 0.5 ? -1 : 1;
  const n = normalOf(g.divider);
  const nx = n[0] * side;
  const ny = n[1] * side;
  const base = resample(g.divider, 28);
  const amp = g.size * 0.03;
  const p1 = rng() * TAU;
  const p2 = rng() * TAU;
  const edge: Pt[] = base.map(([x, y], i) => {
    const off = Math.sin(i * 0.85 + p1) * amp + Math.sin(i * 2.1 + p2) * amp * 0.45;
    return [x + n[0] * off, y + n[1] * off] as Pt;
  });
  const far = g.size * 2.4;
  const first = edge[0] as Pt;
  const last = edge[edge.length - 1] as Pt;
  const poly: Pt[] = [...edge, [last[0] + nx * far, last[1] + ny * far], [first[0] + nx * far, first[1] + ny * far]];

  // the white half: bright at the divider, a touch cooler and greener toward the margin
  const grad = ctx.createLinearGradient(first[0], first[1], first[0] + nx * g.size * 0.9, first[1] + ny * g.size * 0.9);
  grad.addColorStop(0, '#fffdf3');
  grad.addColorStop(0.6, '#f6f4de');
  grad.addColorStop(1, '#e9efd4');
  ctx.fillStyle = grad;
  polyPath(ctx, poly);
  ctx.fill();

  // marbling: green bleeding into the white, cream bleeding into the green
  for (let i = 0; i < 7; i++) {
    const p = edge[randInt(rng, 2, edge.length - 3)] as Pt;
    const d = randRange(rng, 0.0, 0.32) * g.size;
    ctx.fillStyle = `rgba(110,185,115,${randRange(rng, 0.14, 0.3)})`;
    fillBlob(ctx, rng, p[0] + nx * d, p[1] + ny * d, g.size * randRange(rng, 0.03, 0.075), 0.5);
  }
  for (let i = 0; i < 9; i++) {
    const p = edge[randInt(rng, 2, edge.length - 3)] as Pt;
    const d = randRange(rng, 0.02, 0.2) * g.size;
    ctx.fillStyle = `rgba(250,246,214,${randRange(rng, 0.65, 0.95)})`;
    fillBlob(ctx, rng, p[0] - nx * d, p[1] - ny * d, g.size * randRange(rng, 0.02, 0.05), 0.55);
  }
  // pale flecks across the green half so it does not look flat
  ctx.fillStyle = pal.light;
  ctx.globalAlpha = 0.5;
  for (let i = 0; i < 26; i++) {
    const [x, y] = pointInLeaf(rng, g);
    ctx.beginPath();
    ctx.arc(x, y, g.size * randRange(rng, 0.006, 0.014), 0, TAU);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function tricolor(ctx: Ctx, g: LeafGeom, rng: Rng): void {
  // 1) cream marbling
  const creams = randInt(rng, 3, 5);
  for (let i = 0; i < creams; i++) {
    const [x, y] = pointInLeaf(rng, g);
    const r = g.size * randRange(rng, 0.13, 0.28);
    ctx.fillStyle = 'rgba(255,243,216,0.28)';
    fillBlob(ctx, rng, x, y, r * 1.18, 0.5);
    ctx.fillStyle = pick(rng, TRI_CREAMS);
    ctx.globalAlpha = 0.96;
    fillBlob(ctx, rng, x, y, r, 0.5);
    ctx.globalAlpha = 1;
  }
  // 2) pink patches, partly over cream (light pink) and partly over green (deep rose)
  const pinks = randInt(rng, 4, 6);
  for (let i = 0; i < pinks; i++) {
    const [x, y] = pointInLeaf(rng, g);
    const r = g.size * randRange(rng, 0.1, 0.24);
    const c = pick(rng, PINKS);
    ctx.fillStyle = c;
    ctx.globalAlpha = 0.28;
    fillBlob(ctx, rng, x, y, r * 1.2, 0.5);
    ctx.globalAlpha = randRange(rng, 0.82, 0.95);
    fillBlob(ctx, rng, x, y, r, 0.55);
  }
  ctx.globalAlpha = 1;
  // 3) marble dust across the boundaries
  for (let i = 0; i < 120; i++) {
    const [x, y] = pointInLeaf(rng, g);
    const roll = rng();
    ctx.fillStyle = roll < 0.45 ? pick(rng, PINKS) : roll < 0.85 ? pick(rng, TRI_CREAMS) : '#14522f';
    ctx.globalAlpha = randRange(rng, 0.5, 0.9);
    ctx.beginPath();
    ctx.arc(x, y, g.size * randRange(rng, 0.005, 0.016), 0, TAU);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}
