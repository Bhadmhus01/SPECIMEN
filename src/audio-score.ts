import type { TierDef } from './config';
import { randRange, type Rng } from './rng';

/**
 * The musical decisions, as plain data: which notes, when, how loud.
 * Pure functions (no WebAudio), so the escalation from Common to Grail is unit-tested.
 */

export interface Note {
  /** Seconds after the cue. */
  t: number;
  freq: number;
  dur: number;
  gain: number;
}

/** C major pentatonic from C5: any run of these notes sounds consonant, so the leaf pops can never clash. */
export const PENTATONIC: readonly number[] = [523.25, 587.33, 659.25, 783.99, 880.0, 1046.5, 1174.66, 1318.51, 1567.98, 1760.0, 2093.0];

const NOTE = {
  C4: 261.63,
  E4: 329.63,
  G4: 392.0,
  B4: 493.88,
  C5: 523.25,
  D5: 587.33,
  E5: 659.25,
  G5: 783.99,
  C6: 1046.5,
  E6: 1318.51,
  G6: 1567.98,
  C7: 2093.0,
} as const;

/** One pitch per leaf, rising as the plant unfurls: the growth plays a little ascending phrase. */
export function leafPitches(times: readonly number[]): { t: number; freq: number }[] {
  return [...times]
    .sort((a, b) => a - b)
    .map((t, i) => ({ t, freq: PENTATONIC[Math.min(i, PENTATONIC.length - 1)] as number }));
}

export interface PadPlan {
  freqs: number[];
  /** Seconds. */
  attack: number;
  dur: number;
  gain: number;
}

export interface ChimePlan {
  /** The bell arpeggio. */
  notes: Note[];
  /** A sustained chord under the bells (Rare and up). */
  pad: PadPlan | null;
  /** High glitter bells scattered after the arpeggio (Grail). */
  sparkles: Note[];
  /** Gain of a low "weight" thump on the first beat (0 = none). */
  thump: number;
}

/**
 * The rarity fanfare. Each step up the ladder adds something audible:
 * Common: two soft bells. Uncommon: a four-note rise. Rare: a six-note rise over a chord.
 * Grail: a seven-note rise, a fuller chord, a thump and a shower of glitter.
 */
export function chimePlan(tier: TierDef, rng: Rng): ChimePlan {
  const bell = (t: number, freq: number, dur: number, gain: number): Note => ({ t, freq, dur, gain });
  switch (tier.id) {
    case 'common':
      return {
        notes: [bell(0, NOTE.G5, 0.55, 0.2), bell(0.1, NOTE.C6, 0.8, 0.2)],
        pad: null,
        sparkles: [],
        thump: 0,
      };
    case 'uncommon':
      return {
        notes: [NOTE.C5, NOTE.E5, NOTE.G5, NOTE.C6].map((f, i) => bell(i * 0.085, f, 0.8 + i * 0.1, 0.21)),
        pad: null,
        sparkles: [],
        thump: 0,
      };
    case 'rare':
      return {
        notes: [NOTE.C5, NOTE.E5, NOTE.G5, NOTE.C6, NOTE.E6, NOTE.G6].map((f, i) => bell(i * 0.078, f, 1.0 + i * 0.12, 0.2)),
        pad: { freqs: [NOTE.C4, NOTE.E4, NOTE.G4], attack: 0.25, dur: 1.5, gain: 0.07 },
        sparkles: [],
        thump: 0.25,
      };
    case 'grail': {
      const notes = [NOTE.C5, NOTE.E5, NOTE.G5, NOTE.C6, NOTE.E6, NOTE.G6, NOTE.C7].map((f, i) => bell(i * 0.07, f, 1.2 + i * 0.15, 0.2));
      const sparkles: Note[] = Array.from({ length: 16 }, (_, i) =>
        bell(0.55 + i * 0.075 + randRange(rng, 0, 0.05), PENTATONIC[5 + Math.floor(rng() * 6)] as number, randRange(rng, 0.4, 0.8), randRange(rng, 0.04, 0.09)),
      );
      return {
        notes,
        pad: { freqs: [NOTE.C4, NOTE.E4, NOTE.G4, NOTE.B4, NOTE.D5], attack: 0.3, dur: 2.0, gain: 0.085 },
        sparkles,
        thump: 0.45,
      };
    }
  }
}
