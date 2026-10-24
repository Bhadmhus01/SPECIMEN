import { TAU, clamp } from '../util';
import { drawPiece, type ShellPiece, type ShellSprite } from './shell';

type Ctx = CanvasRenderingContext2D;

export type ParticleKind = 'shard' | 'dust' | 'leaf' | 'confetti' | 'spark' | 'star';

export interface Particle {
  alive: boolean;
  kind: ParticleKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  gravity: number;
  /** Fraction of velocity kept per second (1 = no drag). */
  drag: number;
  rot: number;
  vr: number;
  size: number;
  /** Size added per second (dust puffs expand). */
  grow: number;
  life: number;
  maxLife: number;
  /** Seconds to fade in at the start. */
  fadeIn: number;
  /** Fraction of life, from the end, over which it fades out. */
  fadeOut: number;
  color: string;
  phase: number;
  /** Sideways flutter amplitude in units/second (leaves, confetti). */
  flutter: number;
  piece: ShellPiece | null;
}

export type ParticleSeed = Partial<Omit<Particle, 'alive' | 'life'>> & { kind: ParticleKind; maxLife: number };

function blank(): Particle {
  return {
    alive: false,
    kind: 'spark',
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    gravity: 0,
    drag: 1,
    rot: 0,
    vr: 0,
    size: 4,
    grow: 0,
    life: 0,
    maxLife: 1,
    fadeIn: 0,
    fadeOut: 0.4,
    color: '#fff',
    phase: 0,
    flutter: 0,
    piece: null,
  };
}

/** A fixed-size particle pool: no allocation while playing, so no GC hitches during the reveal. */
export class Particles {
  private readonly pool: Particle[];
  private cursor = 0;

  constructor(capacity = 480) {
    this.pool = Array.from({ length: capacity }, blank);
  }

  get count(): number {
    let n = 0;
    for (const p of this.pool) if (p.alive) n++;
    return n;
  }

  clear(): void {
    for (const p of this.pool) p.alive = false;
  }

  emit(seed: ParticleSeed): Particle {
    // reuse the next free slot; if the pool is full, recycle the oldest-cursor one (visually harmless)
    let p: Particle | undefined;
    for (let i = 0; i < this.pool.length; i++) {
      const c = this.pool[(this.cursor + i) % this.pool.length] as Particle;
      if (!c.alive) {
        p = c;
        this.cursor = (this.cursor + i + 1) % this.pool.length;
        break;
      }
    }
    if (!p) {
      p = this.pool[this.cursor] as Particle;
      this.cursor = (this.cursor + 1) % this.pool.length;
    }
    Object.assign(p, blank(), seed, { alive: true, life: 0 });
    return p;
  }

  update(dt: number): void {
    for (const p of this.pool) {
      if (!p.alive) continue;
      p.life += dt;
      if (p.life >= p.maxLife) {
        p.alive = false;
        continue;
      }
      const keep = Math.pow(p.drag, dt);
      p.vx *= keep;
      p.vy = p.vy * keep + p.gravity * dt;
      p.x += (p.vx + (p.flutter ? Math.sin(p.life * 5 + p.phase) * p.flutter : 0)) * dt;
      p.y += p.vy * dt;
      p.rot += p.vr * dt;
      p.size += p.grow * dt;
    }
  }

  private alpha(p: Particle): number {
    const t = p.life / p.maxLife;
    const out = p.fadeOut > 0 ? clamp((1 - t) / p.fadeOut) : 1;
    const inn = p.fadeIn > 0 ? clamp(p.life / p.fadeIn) : 1;
    return out * inn;
  }

  draw(ctx: Ctx, shell: ShellSprite | null): void {
    // pass 1: solid things
    for (const p of this.pool) {
      if (!p.alive) continue;
      const a = this.alpha(p);
      if (a <= 0.003) continue;
      switch (p.kind) {
        case 'shard':
          if (shell && p.piece) {
            ctx.save();
            ctx.globalAlpha = a;
            ctx.translate(p.x, p.y);
            ctx.rotate(p.rot);
            drawPiece(ctx, shell, p.piece);
            ctx.restore();
          }
          break;
        case 'dust':
          ctx.globalAlpha = a;
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.arc(p.x, p.y, Math.max(0.1, p.size), 0, TAU);
          ctx.fill();
          break;
        case 'leaf':
          ctx.save();
          ctx.globalAlpha = a;
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot);
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.moveTo(-p.size, 0);
          ctx.quadraticCurveTo(0, -p.size * 0.62, p.size, 0);
          ctx.quadraticCurveTo(0, p.size * 0.62, -p.size, 0);
          ctx.fill();
          ctx.restore();
          break;
        case 'confetti': {
          ctx.save();
          ctx.globalAlpha = a;
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot);
          ctx.scale(1, Math.cos(p.life * 9 + p.phase)); // tumbling flip
          ctx.fillStyle = p.color;
          ctx.fillRect(-p.size * 0.5, -p.size * 0.28, p.size, p.size * 0.56);
          ctx.restore();
          break;
        }
        default:
          break;
      }
    }
    ctx.globalAlpha = 1;

    // pass 2: light — additive
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const p of this.pool) {
      if (!p.alive || (p.kind !== 'spark' && p.kind !== 'star')) continue;
      const a = this.alpha(p);
      if (a <= 0.003) continue;
      ctx.fillStyle = p.color;
      if (p.kind === 'spark') {
        ctx.globalAlpha = a * 0.28;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * 2.2, 0, TAU);
        ctx.fill();
        ctx.globalAlpha = a;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, TAU);
        ctx.fill();
      } else {
        // four-point twinkle that breathes in and out over its life
        const pulse = Math.sin((p.life / p.maxLife) * Math.PI);
        const r = p.size * (0.35 + 0.65 * pulse);
        ctx.globalAlpha = a;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.beginPath();
        for (let i = 0; i < 8; i++) {
          const rr = i % 2 === 0 ? r : r * 0.22;
          const ang = (i / 8) * TAU;
          ctx.lineTo(Math.cos(ang) * rr, Math.sin(ang) * rr);
        }
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }
}
