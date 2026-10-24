import { describe, expect, it } from 'vitest';
import { SPECIES, TIERS, TIER_BY_ID, type SpeciesId, type TierId } from '../src/config';
import { LocalRollSource, pickTier, rollOnce } from '../src/roll';
import { cryptoRng, gauss, mulberry32, subSeed } from '../src/rng';

describe('published odds', () => {
  it('sum to exactly 100%', () => {
    expect(TIERS.reduce((sum, t) => sum + t.odds, 0)).toBe(100);
  });

  it('are ordered so rarer tiers have strictly lower odds and more pips', () => {
    for (let i = 1; i < TIERS.length; i++) {
      expect(TIERS[i]!.odds).toBeLessThan(TIERS[i - 1]!.odds);
      expect(TIERS[i]!.pips).toBeGreaterThan(TIERS[i - 1]!.pips);
    }
  });

  it('give each tier a distinct form', () => {
    expect(new Set(TIERS.map((t) => t.form)).size).toBe(TIERS.length);
  });
});

describe('pickTier', () => {
  it('respects the cumulative boundaries', () => {
    expect(pickTier(0).id).toBe('common');
    expect(pickTier(0.4999).id).toBe('common');
    expect(pickTier(0.5).id).toBe('uncommon');
    expect(pickTier(0.7999).id).toBe('uncommon');
    expect(pickTier(0.8).id).toBe('rare');
    expect(pickTier(0.9499).id).toBe('rare');
    expect(pickTier(0.95).id).toBe('grail');
    expect(pickTier(0.9999999999).id).toBe('grail');
  });
});

describe('rollOnce', () => {
  it('is deterministic for a seeded rng', () => {
    const a = mulberry32(2026);
    const b = mulberry32(2026);
    for (let i = 0; i < 500; i++) expect(rollOnce(a)).toEqual(rollOnce(b));
  });

  it('matches the published odds over a large sample (and species are uniform)', () => {
    const rand = mulberry32(1);
    const n = 200_000;
    const tiers: Record<TierId, number> = { common: 0, uncommon: 0, rare: 0, grail: 0 };
    const species: Record<SpeciesId, number> = { monstera: 0, snake: 0, pilea: 0 };
    for (let i = 0; i < n; i++) {
      const r = rollOnce(rand);
      tiers[r.tier]++;
      species[r.species]++;
    }
    for (const t of TIERS) {
      const observed = (tiers[t.id] / n) * 100;
      expect(Math.abs(observed - t.odds), `${t.id}: ${observed.toFixed(2)}% vs ${t.odds}%`).toBeLessThan(0.5);
    }
    for (const s of SPECIES) {
      const observed = (species[s.id] / n) * 100;
      expect(Math.abs(observed - 100 / SPECIES.length), `${s.id}: ${observed.toFixed(2)}%`).toBeLessThan(0.6);
    }
  });

  it('always returns the form that belongs to the tier, and a uint32 seed', () => {
    const rand = mulberry32(7);
    for (let i = 0; i < 2000; i++) {
      const r = rollOnce(rand);
      expect(r.form).toBe(TIER_BY_ID[r.tier].form);
      expect(Number.isInteger(r.seed)).toBe(true);
      expect(r.seed).toBeGreaterThanOrEqual(0);
      expect(r.seed).toBeLessThan(2 ** 32);
    }
  });

  it('keeps the rng stream aligned when a debug override is used', () => {
    const plain = mulberry32(99);
    const forced = mulberry32(99);
    for (let i = 0; i < 200; i++) {
      const p = rollOnce(plain);
      const f = rollOnce(forced, { forceTier: 'grail', forceSpecies: 'pilea' });
      expect(f.tier).toBe('grail');
      expect(f.form).toBe('tricolor');
      expect(f.species).toBe('pilea');
      expect(f.seed).toBe(p.seed); // seeds (and so every later roll) are unaffected by the override
    }
  });
});

describe('LocalRollSource', () => {
  it('resolves a valid result', async () => {
    const result = await new LocalRollSource(mulberry32(5)).roll();
    expect(SPECIES.map((s) => s.id)).toContain(result.species);
    expect(TIER_BY_ID[result.tier]).toBeDefined();
  });

  it('defaults to a cryptographic rng', async () => {
    const seen = new Set<number>();
    const source = new LocalRollSource();
    for (let i = 0; i < 50; i++) seen.add((await source.roll()).seed);
    expect(seen.size).toBeGreaterThan(45); // 50 draws from 2^32 should essentially never collide
  });
});

describe('rng helpers', () => {
  it('mulberry32 stays inside [0, 1) and is reproducible', () => {
    const a = mulberry32(123);
    const first = Array.from({ length: 5 }, () => a());
    const b = mulberry32(123);
    expect(Array.from({ length: 5 }, () => b())).toEqual(first);
    const r = mulberry32(5);
    for (let i = 0; i < 10_000; i++) {
      const v = r();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('subSeed is stable per salt and differs between salts', () => {
    expect(subSeed(10, 'leaf-1')).toBe(subSeed(10, 'leaf-1'));
    expect(subSeed(10, 'leaf-1')).not.toBe(subSeed(10, 'leaf-2'));
    expect(subSeed(10, 1)).not.toBe(subSeed(11, 1));
  });

  it('cryptoRng yields floats in [0, 1) with a sane mean', () => {
    const r = cryptoRng();
    let sum = 0;
    const n = 20_000;
    for (let i = 0; i < n; i++) {
      const v = r();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
      sum += v;
    }
    expect(Math.abs(sum / n - 0.5)).toBeLessThan(0.02);
  });

  it('gauss has mean ~0 and sd ~1', () => {
    const r = mulberry32(3);
    const n = 50_000;
    let s = 0;
    let s2 = 0;
    for (let i = 0; i < n; i++) {
      const g = gauss(r);
      s += g;
      s2 += g * g;
    }
    const mean = s / n;
    expect(Math.abs(mean)).toBeLessThan(0.03);
    expect(Math.abs(Math.sqrt(s2 / n - mean * mean) - 1)).toBeLessThan(0.03);
  });
});
