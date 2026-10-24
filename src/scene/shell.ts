import { mulberry32, randRange, type Rng } from '../rng';
import { TAU, get2d, makeCanvas, type Pt } from '../util';

type Ctx = CanvasRenderingContext2D;

/**
 * The sealed shell: a clay egg tied with twine and a wax seal, sitting in the pot.
 * Egg-local frame: origin at the bottom contact point, up is negative y.
 */
export const EGG = {
  rx: 120,
  ry: 150,
  /** World y of the egg's bottom contact point (the soil centre of the pot). */
  worldY: -150,
} as const;

/** Outline of the egg: a touch narrower at the top than the bottom, so it reads as an egg and not an ellipse. */
export function eggOutline(n = 72): Pt[] {
  const pts: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const u = (i / n) * TAU;
    pts.push([EGG.rx * Math.sin(u) * (1 - 0.15 * Math.cos(u)), -EGG.ry * (1 + Math.cos(u))]);
  }
  return pts;
}

/** One piece of the shattered shell, cut from the shell sprite so the break looks like the real egg breaking. */
export interface ShellPiece {
  /** Polygon in egg-local units. */
  poly: Pt[];
  /** Centroid in egg-local units. */
  cx: number;
  cy: number;
  /** Bounding box in egg-local units. */
  bx: number;
  by: number;
  bw: number;
  bh: number;
}

export interface ShellSprite {
  canvas: HTMLCanvasElement;
  /** Sprite pixels per unit. */
  k: number;
  /** Where egg-local (0, 0) sits inside the canvas, in pixels. */
  ax: number;
  ay: number;
  path: Path2D;
  pieces: ShellPiece[];
}

function pathOf(pts: readonly Pt[]): Path2D {
  const p = new Path2D();
  pts.forEach(([x, y], i) => (i === 0 ? p.moveTo(x, y) : p.lineTo(x, y)));
  p.closePath();
  return p;
}

/** Tile the egg exactly with wedge + ring pieces. */
function makePieces(outline: readonly Pt[], rng: Rng): ShellPiece[] {
  const N = 9;
  const center: Pt = [0, -EGG.ry];
  const rim: Pt[] = [];
  const inner: Pt[] = [];
  for (let j = 0; j < N; j++) {
    const o = outline[Math.floor(((j + randRange(rng, -0.2, 0.2)) / N) * outline.length + outline.length) % outline.length] as Pt;
    rim.push(o);
    const f = randRange(rng, 0.4, 0.62);
    inner.push([center[0] + (o[0] - center[0]) * f, center[1] + (o[1] - center[1]) * f]);
  }
  const polys: Pt[][] = [];
  for (let j = 0; j < N; j++) {
    const j2 = (j + 1) % N;
    polys.push([center, inner[j] as Pt, inner[j2] as Pt]);
    // the outer piece follows the real outline between the two rim points
    const a = outline.indexOf(rim[j] as Pt);
    const b = outline.indexOf(rim[j2] as Pt);
    const arc: Pt[] = [];
    for (let i = a; i !== b; i = (i + 1) % outline.length) arc.push(outline[i] as Pt);
    arc.push(rim[j2] as Pt);
    polys.push([inner[j] as Pt, ...arc, inner[j2] as Pt]);
  }
  return polys.map((poly) => {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    let sx = 0;
    let sy = 0;
    for (const [x, y] of poly) {
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
      sx += x;
      sy += y;
    }
    return { poly, cx: sx / poly.length, cy: sy / poly.length, bx: minX - 2, by: minY - 2, bw: maxX - minX + 4, bh: maxY - minY + 4 };
  });
}

/** Pre-render the egg. Called on resize, so it stays crisp at any size. */
export function buildShell(k: number): ShellSprite {
  const rng = mulberry32(0xe66);
  const outline = eggOutline();
  const path = pathOf(outline);
  const pad = 8;
  const w = EGG.rx * 2.2 + pad * 2;
  const h = EGG.ry * 2 + pad * 2;
  const canvas = makeCanvas(w * k, h * k);
  const ax = (EGG.rx * 1.1 + pad) * k;
  const ay = (EGG.ry * 2 + pad) * k;
  const ctx = get2d(canvas);
  ctx.setTransform(k, 0, 0, k, ax, ay);

  // clay body
  const body = ctx.createRadialGradient(-EGG.rx * 0.32, -EGG.ry * 1.55, EGG.rx * 0.08, -EGG.rx * 0.1, -EGG.ry * 1.1, EGG.rx * 1.6);
  body.addColorStop(0, '#fcf3da');
  body.addColorStop(0.45, '#ead8ac');
  body.addColorStop(1, '#bd9c6c');
  ctx.fillStyle = body;
  ctx.fill(path);

  ctx.save();
  ctx.clip(path);
  // mottled clay: big soft blotches, then freckles
  for (let i = 0; i < 14; i++) {
    const x = randRange(rng, -EGG.rx, EGG.rx);
    const y = -randRange(rng, 0, EGG.ry * 2);
    ctx.fillStyle = i % 2 ? 'rgba(255,250,232,0.10)' : 'rgba(110,78,40,0.07)';
    ctx.beginPath();
    ctx.ellipse(x, y, randRange(rng, 24, 56), randRange(rng, 16, 40), rng() * TAU, 0, TAU);
    ctx.fill();
  }
  for (let i = 0; i < 90; i++) {
    const x = randRange(rng, -EGG.rx, EGG.rx);
    const y = -randRange(rng, 0, EGG.ry * 2);
    ctx.fillStyle = `rgba(112,80,46,${randRange(rng, 0.16, 0.4)})`;
    ctx.beginPath();
    ctx.arc(x, y, randRange(rng, 0.7, 2.3), 0, TAU);
    ctx.fill();
  }
  // foot shade and a soft gloss
  const foot = ctx.createLinearGradient(0, -EGG.ry * 0.8, 0, 0);
  foot.addColorStop(0, 'rgba(70,44,18,0)');
  foot.addColorStop(1, 'rgba(70,44,18,0.34)');
  ctx.fillStyle = foot;
  ctx.fillRect(-EGG.rx * 1.2, -EGG.ry * 0.8, EGG.rx * 2.4, EGG.ry * 0.8);
  const side = ctx.createLinearGradient(-EGG.rx, 0, EGG.rx, 0);
  side.addColorStop(0, 'rgba(255,255,255,0.10)');
  side.addColorStop(0.55, 'rgba(0,0,0,0)');
  side.addColorStop(1, 'rgba(60,36,14,0.26)');
  ctx.fillStyle = side;
  ctx.fillRect(-EGG.rx * 1.2, -EGG.ry * 2.1, EGG.rx * 2.4, EGG.ry * 2.2);
  ctx.save();
  ctx.translate(-EGG.rx * 0.44, -EGG.ry * 1.55);
  ctx.rotate(-0.42);
  const gloss = ctx.createRadialGradient(0, 0, 0, 0, 0, EGG.ry * 0.46);
  gloss.addColorStop(0, 'rgba(255,255,255,0.62)');
  gloss.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gloss;
  ctx.scale(0.5, 1);
  ctx.beginPath();
  ctx.arc(0, 0, EGG.ry * 0.46, 0, TAU);
  ctx.fill();
  ctx.restore();

  // twine belt: the front arc of an ellipse, sagging at the centre
  const beltY = -EGG.ry * 0.78;
  const beltRx = EGG.rx * 1.06;
  const beltRy = beltRx * 0.16;
  ctx.lineCap = 'round';
  ctx.strokeStyle = 'rgba(58,36,16,0.38)';
  ctx.lineWidth = 12;
  ctx.beginPath();
  ctx.ellipse(0, beltY, beltRx, beltRy, 0, 0.02, Math.PI - 0.02);
  ctx.stroke();
  ctx.strokeStyle = '#a07a4a';
  ctx.lineWidth = 8.5;
  ctx.stroke();
  ctx.strokeStyle = '#d3b078';
  ctx.lineWidth = 8.5;
  ctx.setLineDash([4, 6]);
  ctx.stroke();
  ctx.setLineDash([]);

  // the knot, two twine tails and the wax seal
  const sy = beltY + beltRy;
  ctx.strokeStyle = '#a07a4a';
  ctx.lineWidth = 5;
  // two short tails that curl out from under the seal, like the ends of a tied bow
  ctx.lineWidth = 4.2;
  for (const dir of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(dir * 6, sy + 12);
    ctx.bezierCurveTo(dir * 20, sy + 22, dir * 34, sy + 18, dir * 38, sy + 32);
    ctx.stroke();
  }
  const seal = ctx.createRadialGradient(-7, sy - 8, 3, 0, sy, 27);
  seal.addColorStop(0, '#f0627a');
  seal.addColorStop(0.6, '#c9304b');
  seal.addColorStop(1, '#7d1730');
  ctx.fillStyle = 'rgba(40,10,16,0.32)';
  ctx.beginPath();
  ctx.arc(2, sy + 3, 27, 0, TAU);
  ctx.fill();
  ctx.fillStyle = seal;
  ctx.beginPath();
  for (let i = 0; i < 28; i++) {
    const a = (i / 28) * TAU;
    const r = 25 + Math.sin(a * 5 + 1) * 1.6 + Math.sin(a * 9) * 0.8;
    ctx.lineTo(Math.cos(a) * r, sy + Math.sin(a) * r);
  }
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,200,205,0.35)';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.arc(0, sy, 17.5, 0, TAU);
  ctx.stroke();
  // stamped sprout
  ctx.strokeStyle = 'rgba(255,226,230,0.9)';
  ctx.fillStyle = 'rgba(255,226,230,0.9)';
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.moveTo(0, sy + 9);
  ctx.lineTo(0, sy - 1);
  ctx.stroke();
  for (const dir of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(0, sy - 1);
    ctx.quadraticCurveTo(dir * 11, sy - 4, dir * 10, sy - 12);
    ctx.quadraticCurveTo(dir * 2, sy - 10, 0, sy - 1);
    ctx.fill();
  }
  ctx.restore();

  // outline
  ctx.strokeStyle = 'rgba(84,56,28,0.6)';
  ctx.lineWidth = 2.6;
  ctx.lineJoin = 'round';
  ctx.stroke(path);

  return { canvas, k, ax, ay, path, pieces: makePieces(outline, mulberry32(0xbead)) };
}

/** Draw the intact egg in egg-local units (origin at the bottom contact point). */
export function drawShell(ctx: Ctx, s: ShellSprite): void {
  ctx.drawImage(s.canvas, -s.ax / s.k, -s.ay / s.k, s.canvas.width / s.k, s.canvas.height / s.k);
}

/** Draw one flying piece. The context origin is the piece's centroid. */
export function drawPiece(ctx: Ctx, s: ShellSprite, p: ShellPiece): void {
  ctx.save();
  ctx.beginPath();
  p.poly.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x - p.cx, y - p.cy) : ctx.lineTo(x - p.cx, y - p.cy)));
  ctx.closePath();
  ctx.clip();
  const sx = s.ax + p.bx * s.k;
  const sy = s.ay + p.by * s.k;
  ctx.drawImage(s.canvas, sx, sy, p.bw * s.k, p.bh * s.k, p.bx - p.cx, p.by - p.cy, p.bw, p.bh);
  ctx.restore();
  ctx.strokeStyle = 'rgba(84,56,28,0.7)';
  ctx.lineWidth = 2;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  p.poly.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x - p.cx, y - p.cy) : ctx.lineTo(x - p.cx, y - p.cy)));
  ctx.closePath();
  ctx.stroke();
}

// ---------------------------------------------------------------- cracks

export interface Crack {
  /** Which tap makes this crack appear. */
  stage: 1 | 2;
  pts: Pt[];
  width: number;
}

function zigzag(rng: Rng, a: Pt, b: Pt, segments: number, jitter: number): Pt[] {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  const out: Pt[] = [a];
  for (let i = 1; i < segments; i++) {
    const t = i / segments + randRange(rng, -0.04, 0.04);
    const off = (i % 2 ? 1 : -1) * jitter * randRange(rng, 0.45, 1);
    out.push([a[0] + dx * t + nx * off, a[1] + dy * t + ny * off]);
  }
  out.push(b);
  return out;
}

function branch(rng: Rng, from: Pt, angle: number, length: number): Pt[] {
  const b: Pt = [from[0] + Math.cos(angle) * length, from[1] + Math.sin(angle) * length];
  return zigzag(rng, from, b, 3, length * 0.12);
}

/** The pattern of cracks for one pot: two on the first tap, three more on the second. */
export function makeCracks(rng: Rng): Crack[] {
  const j = (v: number, a: number): number => v + randRange(rng, -a, a);
  const cracks: Crack[] = [];
  const mainA = zigzag(rng, [j(34, 8), -EGG.ry * 1.97], [j(-4, 10), j(-EGG.ry * 1.18, 8)], 6, 9);
  cracks.push({ stage: 1, pts: mainA, width: 3.1 });
  const mid = mainA[3] as Pt;
  cracks.push({ stage: 1, pts: branch(rng, mid, randRange(rng, 0.2, 0.55), 52), width: 2.2 });
  cracks.push({ stage: 1, pts: zigzag(rng, [j(-66, 8), j(-EGG.ry * 1.6, 6)], [j(-34, 8), j(-EGG.ry * 1.36, 6)], 3, 6), width: 2.2 });

  const low = mainA[mainA.length - 1] as Pt;
  cracks.push({ stage: 2, pts: zigzag(rng, low, [j(14, 10), j(-EGG.ry * 0.5, 8)], 5, 8), width: 3 });
  cracks.push({ stage: 2, pts: zigzag(rng, [j(-112, 4), j(-EGG.ry * 0.95, 10)], [j(-46, 10), j(-EGG.ry * 1.24, 8)], 5, 8), width: 2.8 });
  cracks.push({ stage: 2, pts: zigzag(rng, [j(104, 4), j(-EGG.ry * 0.7, 10)], [j(46, 10), j(-EGG.ry * 1.06, 8)], 5, 8), width: 2.8 });
  cracks.push({ stage: 2, pts: branch(rng, mainA[2] as Pt, randRange(rng, 2.6, 3.0), 44), width: 2 });
  return cracks;
}

/** Stroke the first `progress` (0..1) of a polyline. */
function strokePartial(ctx: Ctx, pts: readonly Pt[], progress: number): void {
  let total = 0;
  for (let i = 1; i < pts.length; i++) total += Math.hypot((pts[i] as Pt)[0] - (pts[i - 1] as Pt)[0], (pts[i] as Pt)[1] - (pts[i - 1] as Pt)[1]);
  let left = total * progress;
  ctx.beginPath();
  ctx.moveTo((pts[0] as Pt)[0], (pts[0] as Pt)[1]);
  for (let i = 1; i < pts.length && left > 0; i++) {
    const a = pts[i - 1] as Pt;
    const b = pts[i] as Pt;
    const seg = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (seg <= left) {
      ctx.lineTo(b[0], b[1]);
      left -= seg;
    } else {
      const t = left / seg;
      ctx.lineTo(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t);
      left = 0;
    }
  }
  ctx.stroke();
}

/**
 * Draw cracks with light leaking out of them.
 * @param clip the egg's outline, so cracks never spill outside it
 * @param progress per-crack 0..1 draw-on amount
 * @param leak 0..1 strength of the light
 * @param color the leak colour
 * @param glow the leak's wide halo colour as "r,g,b"
 */
export function drawCracks(
  ctx: Ctx,
  clip: Path2D,
  cracks: readonly Crack[],
  progress: readonly number[],
  leak: number,
  glow: string,
  color: string,
): void {
  ctx.save();
  ctx.clip(clip);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  cracks.forEach((c, i) => {
    const p = progress[i] ?? 0;
    if (p <= 0) return;
    // dark lip of the crack
    ctx.strokeStyle = 'rgba(60,36,16,0.85)';
    ctx.lineWidth = c.width + 2.4;
    strokePartial(ctx, c.pts, p);
    if (leak > 0.02) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = `rgba(${glow},${0.16 * leak})`;
      ctx.lineWidth = c.width + 15;
      strokePartial(ctx, c.pts, p);
      ctx.strokeStyle = `rgba(${glow},${0.34 * leak})`;
      ctx.lineWidth = c.width + 7;
      strokePartial(ctx, c.pts, p);
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.strokeStyle = leak > 0.02 ? mixLeak(color, leak) : 'rgba(40,24,10,0.95)';
    ctx.lineWidth = c.width;
    strokePartial(ctx, c.pts, p);
  });
  ctx.restore();
}

function mixLeak(color: string, leak: number): string {
  // core of the leak: white-hot, tinted by the tier colour as the leak strengthens
  const a = Math.min(1, 0.55 + leak * 0.5);
  return color.startsWith('#') ? hexA(color, a) : color;
}

function hexA(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
