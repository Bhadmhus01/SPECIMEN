import { describe, expect, it } from 'vitest';
import { isDebugRun, parseParams } from '../src/params';

describe('parseParams', () => {
  it('has safe defaults', () => {
    expect(parseParams('')).toEqual({ force: undefined, species: undefined, seed: undefined, test: false, manual: false, sound: true, motion: 'auto' });
  });

  it('accepts valid values', () => {
    const p = parseParams('?force=grail&species=pilea&seed=42&test=1&manual=1&sound=0&motion=reduce');
    expect(p).toEqual({ force: 'grail', species: 'pilea', seed: 42, test: true, manual: true, sound: false, motion: 'reduce' });
  });

  it('ignores unknown tiers, species and motion values', () => {
    const p = parseParams('?force=mythic&species=fern&motion=wild');
    expect(p.force).toBeUndefined();
    expect(p.species).toBeUndefined();
    expect(p.motion).toBe('auto');
  });

  it('is not fooled by property names that exist on every object', () => {
    for (const evil of ['__proto__', 'constructor', 'toString', 'hasOwnProperty']) {
      expect(parseParams(`?force=${evil}&species=${evil}`)).toMatchObject({ force: undefined, species: undefined });
    }
  });

  it('parses seeds safely', () => {
    expect(parseParams('?seed=abc').seed).toBeUndefined();
    expect(parseParams('?seed=').seed).toBeUndefined();
    expect(parseParams('?seed=0').seed).toBe(0);
    expect(parseParams('?seed=4294967296').seed).toBe(0); // wraps to a uint32
    expect(parseParams('?seed=-1').seed).toBe(4294967295);
  });

  it('only treats exactly "1" as on for test and manual', () => {
    expect(parseParams('?test=true').test).toBe(false);
    expect(parseParams('?manual=yes').manual).toBe(false);
  });
});

describe('isDebugRun', () => {
  it('flags any run whose rolls are forced or seeded, and nothing else', () => {
    expect(isDebugRun(parseParams(''))).toBe(false);
    expect(isDebugRun(parseParams('?test=1&sound=0&motion=reduce'))).toBe(false);
    expect(isDebugRun(parseParams('?force=rare'))).toBe(true);
    expect(isDebugRun(parseParams('?species=snake'))).toBe(true);
    expect(isDebugRun(parseParams('?seed=7'))).toBe(true);
  });
});
