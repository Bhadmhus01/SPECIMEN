/**
 * Single source of truth for the Phase 0 content and tuning knobs.
 * Everything a designer would want to tweak without reading code lives here.
 */

export type TierId = 'common' | 'uncommon' | 'rare' | 'grail';
export type SpeciesId = 'monstera' | 'snake' | 'pilea';
export type FormId = 'classic' | 'speckled' | 'halfmoon' | 'tricolor';

export interface TierDef {
  readonly id: TierId;
  readonly label: string;
  /** 1..4 pips, so rarity is legible without relying on colour or vocabulary. */
  readonly pips: number;
  /** Published probability of this tier per pot, in percent. All tiers sum to 100. */
  readonly odds: number;
  /** Phase 0: each tier maps to exactly one variegation form. */
  readonly form: FormId;
  readonly color: string;
  readonly color2: string;
  /** 0..1 — scales shake, particles, flash and sound for this tier. */
  readonly intensity: number;
}

// Odds are deliberately generous (collection-first, see business plan §6): about 1 pot in 2 is better than Common.
export const TIERS: readonly TierDef[] = [
  { id: 'common', label: 'Common', pips: 1, odds: 50, form: 'classic', color: '#b9e6a3', color2: '#7fc77a', intensity: 0.25 },
  { id: 'uncommon', label: 'Uncommon', pips: 2, odds: 30, form: 'speckled', color: '#62d0e8', color2: '#3a9fd8', intensity: 0.5 },
  { id: 'rare', label: 'Rare', pips: 3, odds: 15, form: 'halfmoon', color: '#b18cff', color2: '#7a4dff', intensity: 0.75 },
  { id: 'grail', label: 'Grail', pips: 4, odds: 5, form: 'tricolor', color: '#ffd166', color2: '#ff7eb6', intensity: 1 },
];

export const TIER_BY_ID: Readonly<Record<TierId, TierDef>> = Object.fromEntries(
  TIERS.map((t) => [t.id, t]),
) as Record<TierId, TierDef>;

export interface SpeciesDef {
  readonly id: SpeciesId;
  readonly latin: string;
  readonly common: string;
}

// Three silhouettes on purpose: split heart, upright blades, round coins. Equal chance each.
export const SPECIES: readonly SpeciesDef[] = [
  { id: 'monstera', latin: 'Monstera deliciosa', common: 'Swiss cheese plant' },
  { id: 'snake', latin: 'Dracaena trifasciata', common: 'Snake plant' },
  { id: 'pilea', latin: 'Pilea peperomioides', common: 'Chinese money plant' },
];

export const SPECIES_BY_ID: Readonly<Record<SpeciesId, SpeciesDef>> = Object.fromEntries(
  SPECIES.map((s) => [s.id, s]),
) as Record<SpeciesId, SpeciesDef>;

export const FORM_LABEL: Readonly<Record<FormId, string>> = {
  classic: 'Classic green',
  speckled: 'Speckled variegation',
  halfmoon: 'Half-moon variegation',
  tricolor: 'Pink tricolor marble',
};

/** Reveal pacing. Seconds unless stated. */
export const TIMING = {
  /** Taps needed to open a pot: the last one breaks it. */
  tapsToOpen: 3,
  /** Taps closer together than this are ignored (but still get micro-feedback). */
  minTapGap: 0.11,
  /** New pot falling into place; taps are locked. */
  dropSeconds: 0.62,
  /** Freeze-frame on the final tap, before the burst. */
  hitStop: 0.1,
  /** Burst -> plant starts to sprout. */
  sproutDelay: 0.34,
  /** Sprout -> fully grown, by tier. Rarer plants earn a slightly longer, grander growth. */
  growSeconds: { common: 1.35, uncommon: 1.5, rare: 1.7, grail: 1.95 } satisfies Record<TierId, number>,
  /** Fraction of growth after which the rarity fanfare fires (about when half the leaves are out). */
  fanfareAt: 0.5,
  /** Fully grown -> "One more" is offered. */
  readyDelay: 0.3,
  /** Current plant exits. */
  leaveSeconds: 0.38,
  /** Retry delay if a roll request fails. */
  rollRetrySeconds: 1.2,
} as const;

/** Feel knobs that are not about time. */
export const TUNING = {
  /**
   * How much the light leaking from the cracks hints at the rarity before the burst.
   * `tint`: hue mix toward the tier colour on crack 1 and crack 2 (0 = plain warm white).
   * `bias`: how much the leak's brightness scales with the tier (0 = every pot glows alike).
   * Set both to 0 for "no tell": the outcome is a complete surprise at the burst.
   */
  tell: { tint: [0.1, 0.35], bias: 0.4 },
  /** Camera push-in per crack (zoom = 1 + push * crack number). */
  pushPerCrack: 0.06,
  /** Slow-motion at the burst, for tiers at or above this intensity. */
  slowMo: { minIntensity: 0.75, scale: 0.35, seconds: 0.3 },
} as const;
