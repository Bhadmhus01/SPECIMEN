import { describe, expect, it } from 'vitest';
import { PENTATONIC, chimePlan, leafPitches } from '../src/audio-score';
import { TIERS } from '../src/config';
import { mulberry32 } from '../src/rng';

const plan = (id: string, seed = 1) => chimePlan(TIERS.find((t) => t.id === id)!, mulberry32(seed));

describe('chimePlan: the fanfare escalates with rarity', () => {
  it('adds notes at every step up the ladder', () => {
    const counts = TIERS.map((t) => chimePlan(t, mulberry32(1)).notes.length);
    expect(counts).toEqual([2, 4, 6, 7]);
    for (let i = 1; i < counts.length; i++) expect(counts[i]).toBeGreaterThan(counts[i - 1] as number);
  });

  it('keeps the chord, the thump and the glitter for the rarer tiers only', () => {
    expect(plan('common').pad).toBeNull();
    expect(plan('uncommon').pad).toBeNull();
    expect(plan('rare').pad).not.toBeNull();
    expect(plan('grail').pad).not.toBeNull();
    expect(plan('common').thump).toBe(0);
    expect(plan('rare').thump).toBeGreaterThan(0);
    expect(plan('grail').thump).toBeGreaterThan(plan('rare').thump);
    expect(plan('common').sparkles).toHaveLength(0);
    expect(plan('rare').sparkles).toHaveLength(0);
    expect(plan('grail').sparkles.length).toBeGreaterThan(8);
  });

  it('plays each arpeggio upward, starting on the beat', () => {
    for (const t of TIERS) {
      const { notes } = chimePlan(t, mulberry32(3));
      expect(notes[0]?.t).toBe(0);
      for (let i = 1; i < notes.length; i++) {
        expect((notes[i] as { t: number }).t).toBeGreaterThan((notes[i - 1] as { t: number }).t);
        expect((notes[i] as { freq: number }).freq).toBeGreaterThan((notes[i - 1] as { freq: number }).freq);
      }
    }
  });

  it('stays in a safe range: audible pitches, modest gains, positive durations', () => {
    for (const t of TIERS) {
      const p = chimePlan(t, mulberry32(9));
      for (const n of [...p.notes, ...p.sparkles]) {
        expect(n.freq).toBeGreaterThan(200);
        expect(n.freq).toBeLessThan(5000);
        expect(n.gain).toBeGreaterThan(0);
        expect(n.gain).toBeLessThanOrEqual(0.25);
        expect(n.dur).toBeGreaterThan(0.2);
        expect(n.t).toBeGreaterThanOrEqual(0);
      }
      if (p.pad) {
        expect(p.pad.attack).toBeLessThan(p.pad.dur);
        expect(p.pad.gain).toBeLessThan(0.15);
      }
    }
  });

  it('is deterministic for a given seed', () => {
    expect(plan('grail', 42)).toEqual(plan('grail', 42));
    expect(plan('grail', 42).sparkles).not.toEqual(plan('grail', 43).sparkles);
  });
});

describe('leafPitches', () => {
  it('rises one pentatonic step per leaf, in time order', () => {
    const out = leafPitches([0.3, 0.1, 0.2]);
    expect(out.map((o) => o.t)).toEqual([0.1, 0.2, 0.3]);
    expect(out.map((o) => o.freq)).toEqual([PENTATONIC[0], PENTATONIC[1], PENTATONIC[2]]);
  });

  it('holds the top note when there are more leaves than notes', () => {
    const out = leafPitches(Array.from({ length: PENTATONIC.length + 5 }, (_, i) => i * 0.1));
    expect(out).toHaveLength(PENTATONIC.length + 5);
    expect(out[out.length - 1]?.freq).toBe(PENTATONIC[PENTATONIC.length - 1]);
  });

  it('handles no leaves and does not mutate its input', () => {
    expect(leafPitches([])).toEqual([]);
    const input = [0.5, 0.1];
    leafPitches(input);
    expect(input).toEqual([0.5, 0.1]);
  });
});
