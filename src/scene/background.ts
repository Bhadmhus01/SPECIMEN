import { mulberry32 } from '../rng';
import { TAU, get2d, makeCanvas } from '../util';
import type { Layout } from './layout';

type Ctx = CanvasRenderingContext2D;

/** The static backdrop, pre-rendered on resize: a deep botanical green, a spotlight and a vignette. */
export function renderBackdrop(l: Layout): HTMLCanvasElement {
  const canvas = makeCanvas(l.cssW * l.dpr, l.cssH * l.dpr);
  const ctx = get2d(canvas);
  ctx.scale(l.dpr, l.dpr);
  const { cssW: W, cssH: H } = l;

  const base = ctx.createLinearGradient(0, 0, 0, H);
  base.addColorStop(0, '#0b1f1a');
  base.addColorStop(0.55, '#123a2e');
  base.addColorStop(1, '#0c2a21');
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, W, H);

  // soft spotlight behind the pot
  const spotY = l.floorY - l.s * 270;
  const spot = ctx.createRadialGradient(l.cx, spotY, 0, l.cx, spotY, Math.max(W, H) * 0.62);
  spot.addColorStop(0, 'rgba(120,210,160,0.30)');
  spot.addColorStop(0.45, 'rgba(60,150,110,0.12)');
  spot.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = spot;
  ctx.fillRect(0, 0, W, H);

  // faint leaf-shadow shapes in the far background, for depth
  const rng = mulberry32(99);
  ctx.save();
  ctx.globalAlpha = 0.07;
  ctx.fillStyle = '#7fe0ae';
  for (let i = 0; i < 9; i++) {
    const x = rng() * W;
    const y = rng() * H * 0.8;
    const r = (60 + rng() * 120) * Math.max(0.6, l.s);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rng() * TAU);
    ctx.beginPath();
    ctx.ellipse(0, 0, r, r * 0.38, 0, 0, TAU);
    ctx.fill();
    ctx.restore();
  }
  ctx.restore();

  // vignette
  const vig = ctx.createRadialGradient(l.cx, H * 0.46, Math.min(W, H) * 0.35, l.cx, H * 0.5, Math.max(W, H) * 0.85);
  vig.addColorStop(0, 'rgba(0,0,0,0)');
  vig.addColorStop(1, 'rgba(0,12,8,0.62)');
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, W, H);
  return canvas;
}

/** World-space extent of the plinth, contact shadow included, for pre-rendering it. */
export const PLINTH_BOUNDS = { minX: -196, minY: -32, maxX: 196, maxY: 60 } as const;

/** The display plinth the pot sits on. World units, origin at the pot's bottom centre. */
export function drawPlinth(ctx: Ctx): void {
  // side
  const side = ctx.createLinearGradient(-190, 0, 190, 0);
  side.addColorStop(0, '#6c6652');
  side.addColorStop(0.35, '#8e8770');
  side.addColorStop(1, '#4d4838');
  ctx.fillStyle = side;
  ctx.beginPath();
  ctx.moveTo(-188, 0);
  ctx.lineTo(188, 0);
  ctx.lineTo(184, 30);
  ctx.quadraticCurveTo(0, 56, -184, 30);
  ctx.closePath();
  ctx.fill();
  // top face
  const top = ctx.createRadialGradient(-30, -6, 10, 0, 0, 200);
  top.addColorStop(0, '#d8d1b6');
  top.addColorStop(1, '#a29b82');
  ctx.fillStyle = top;
  ctx.beginPath();
  ctx.ellipse(0, 0, 190, 28, 0, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.22)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  // contact shadow under the pot
  const sh = ctx.createRadialGradient(0, 4, 4, 0, 4, 90);
  sh.addColorStop(0, 'rgba(30,22,10,0.55)');
  sh.addColorStop(1, 'rgba(30,22,10,0)');
  ctx.fillStyle = sh;
  ctx.beginPath();
  ctx.ellipse(0, 4, 100, 16, 0, 0, TAU);
  ctx.fill();
}
