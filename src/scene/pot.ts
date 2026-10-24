import { mulberry32 } from '../rng';
import { TAU } from '../util';

type Ctx = CanvasRenderingContext2D;

/** The one pot. Scene space: origin at the bottom centre of the pot, up is negative y. */
export const POT = {
  /** y of the soil centre. Plants are drawn with their origin here. */
  soilY: -153,
  rimHalf: 104,
  topY: -156,
} as const;

/** World-space extent of the pot, for pre-rendering it. */
export const POT_BOUNDS = { minX: -110, minY: -176, maxX: 110, maxY: 4 } as const;

/** Soil pebbles are fixed, so the pot never "re-rolls" its look between frames or pots. */
const PEBBLES = (() => {
  const rng = mulberry32(2026);
  return Array.from({ length: 30 }, () => {
    const a = rng() * TAU;
    const r = Math.sqrt(rng());
    return { x: Math.cos(a) * r * 78, y: Math.sin(a) * r * 8.5, s: 0.8 + rng() * 1.7, light: rng() < 0.55 };
  });
})();

function bodyPath(ctx: Ctx): void {
  ctx.beginPath();
  ctx.moveTo(-50, 0);
  ctx.lineTo(50, 0);
  ctx.quadraticCurveTo(60, 0, 62, -9);
  ctx.bezierCurveTo(78, -60, 86, -100, 90, -124);
  ctx.lineTo(-90, -124);
  ctx.bezierCurveTo(-86, -100, -78, -60, -62, -9);
  ctx.quadraticCurveTo(-60, 0, -50, 0);
  ctx.closePath();
}

export function drawPot(ctx: Ctx): void {
  // ---- body
  const body = ctx.createLinearGradient(-90, 0, 90, 0);
  body.addColorStop(0, '#e48f5e');
  body.addColorStop(0.28, '#d2703f');
  body.addColorStop(0.7, '#b4532e');
  body.addColorStop(1, '#8a3d22');
  bodyPath(ctx);
  ctx.fillStyle = body;
  ctx.fill();

  ctx.save();
  bodyPath(ctx);
  ctx.clip();
  // painted cream band with a row of dots
  const band = ctx.createLinearGradient(-90, 0, 90, 0);
  band.addColorStop(0, '#f4e3bd');
  band.addColorStop(0.35, '#ecd7a8');
  band.addColorStop(1, '#c9ab7c');
  ctx.fillStyle = band;
  ctx.fillRect(-100, -74, 200, 17);
  ctx.fillStyle = 'rgba(90,40,20,0.35)';
  ctx.fillRect(-100, -75, 200, 1.6);
  ctx.fillRect(-100, -58.6, 200, 1.6);
  ctx.fillStyle = '#b4532e';
  for (let x = -72; x <= 72; x += 18) {
    ctx.beginPath();
    ctx.arc(x, -65.5, 3.2, 0, TAU);
    ctx.fill();
  }
  // glazed highlight down the left, soft shade at the foot
  const gloss = ctx.createLinearGradient(-84, 0, -30, 0);
  gloss.addColorStop(0, 'rgba(255,255,255,0)');
  gloss.addColorStop(0.35, 'rgba(255,255,255,0.20)');
  gloss.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gloss;
  ctx.fillRect(-90, -124, 70, 124);
  const foot = ctx.createLinearGradient(0, -30, 0, 0);
  foot.addColorStop(0, 'rgba(60,20,8,0)');
  foot.addColorStop(1, 'rgba(60,20,8,0.28)');
  ctx.fillStyle = foot;
  ctx.fillRect(-90, -30, 180, 30);
  ctx.restore();

  // ---- rim (front face)
  const rim = ctx.createLinearGradient(-104, 0, 104, 0);
  rim.addColorStop(0, '#ee9a69');
  rim.addColorStop(0.3, '#db7a49');
  rim.addColorStop(0.72, '#bd5a33');
  rim.addColorStop(1, '#93432a');
  ctx.beginPath();
  ctx.moveTo(-98, -124);
  ctx.lineTo(98, -124);
  ctx.quadraticCurveTo(104, -124, 104, -130);
  ctx.lineTo(104, -148);
  ctx.quadraticCurveTo(104, -153, 99, -153);
  ctx.lineTo(-99, -153);
  ctx.quadraticCurveTo(-104, -153, -104, -148);
  ctx.lineTo(-104, -130);
  ctx.quadraticCurveTo(-104, -124, -98, -124);
  ctx.closePath();
  ctx.fillStyle = rim;
  ctx.fill();
  ctx.fillStyle = 'rgba(70,24,10,0.30)';
  ctx.fillRect(-104, -127, 208, 3);

  // ---- rim top face and the soil opening
  const top = ctx.createLinearGradient(-104, 0, 104, 0);
  top.addColorStop(0, '#f2a577');
  top.addColorStop(0.5, '#e08653');
  top.addColorStop(1, '#a24a2b');
  ctx.beginPath();
  ctx.ellipse(0, -153, 104, 17, 0, 0, TAU);
  ctx.fillStyle = top;
  ctx.fill();

  ctx.beginPath();
  ctx.ellipse(0, -155, 88, 12.5, 0, 0, TAU); // inner back wall
  ctx.fillStyle = '#5e2c18';
  ctx.fill();

  const soil = ctx.createRadialGradient(0, -151, 4, 0, -151, 88);
  soil.addColorStop(0, '#54402f');
  soil.addColorStop(0.7, '#3b2b20');
  soil.addColorStop(1, '#2b1f17');
  ctx.beginPath();
  ctx.ellipse(0, -152, 86, 11, 0, 0, TAU);
  ctx.fillStyle = soil;
  ctx.fill();
  for (const p of PEBBLES) {
    ctx.fillStyle = p.light ? 'rgba(226,214,190,0.75)' : 'rgba(20,12,8,0.5)';
    ctx.beginPath();
    ctx.arc(p.x, -152 + p.y, p.s, 0, TAU);
    ctx.fill();
  }
}
