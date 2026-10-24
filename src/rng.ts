/** A random source returning floats in [0, 1). */
export type Rng = () => number;

/**
 * mulberry32 — tiny, fast, well-distributed seeded PRNG.
 * Deterministic on every platform, which is what lets a (species, form, seed) triple
 * render the identical plant on every client.
 */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Derive an independent sub-seed from a seed and a salt, so e.g. each leaf gets its own stream. */
export function subSeed(seed: number, salt: number | string): number {
  let h = 0x811c9dc5 ^ (seed >>> 0);
  const s = typeof salt === 'number' ? String(salt) : salt;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

/** CSPRNG-backed Rng. Used for roll outcomes so they are not guessable from earlier rolls. */
export function cryptoRng(): Rng {
  const buf = new Uint32Array(2);
  return () => {
    crypto.getRandomValues(buf);
    // 53 random bits -> float in [0, 1)
    return ((buf[0] >>> 5) * 67108864 + (buf[1] >>> 6)) / 9007199254740992;
  };
}

export const randRange = (r: Rng, min: number, max: number): number => min + (max - min) * r();
export const randInt = (r: Rng, min: number, maxInclusive: number): number =>
  min + Math.floor(r() * (maxInclusive - min + 1));
export const pick = <T>(r: Rng, items: readonly T[]): T => items[Math.floor(r() * items.length)] as T;
export const chance = (r: Rng, p: number): boolean => r() < p;
export const seed32 = (r: Rng): number => Math.floor(r() * 4294967296) >>> 0;

/** Standard normal via Box–Muller. */
export function gauss(r: Rng): number {
  const u = Math.max(r(), 1e-12);
  const v = r();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
