import { SPECIES, TIERS, TIER_BY_ID, type FormId, type SpeciesId, type TierDef, type TierId } from './config';
import { cryptoRng, seed32, type Rng } from './rng';

/**
 * The outcome of opening one pot. `seed` fully determines how the plant is drawn,
 * so (species, form, seed) renders identically on every client.
 */
export interface RollResult {
  readonly species: SpeciesId;
  readonly tier: TierId;
  readonly form: FormId;
  readonly seed: number;
}

/**
 * The seam for Phase 2. Phase 0 rolls on the device (LocalRollSource) — fine for a feel test,
 * NOT tamper-proof. Phase 2 swaps in a source that asks the server, which signs the result.
 * The game only ever *reveals* a result; it never decides one.
 */
export interface RollSource {
  roll(): Promise<RollResult>;
}

/**
 * Pick a tier from a uniform u in [0, 1) using the published odds.
 * Cumulative odds are summed as integers (not as fractions) so the boundaries sit exactly
 * where the published percentages say — summing 0.5 + 0.3 + 0.15 in floats drifts to 0.9500000000000001.
 */
export function pickTier(u: number): TierDef {
  const total = TIERS.reduce((sum, t) => sum + t.odds, 0);
  const x = u * total;
  let acc = 0;
  for (const tier of TIERS) {
    acc += tier.odds;
    if (x < acc) return tier;
  }
  return TIERS[TIERS.length - 1] as TierDef; // u ~ 1
}

export interface RollOptions {
  /** Debug/QA only. Never wired in outside `?force=` / `?species=` URL params. */
  readonly forceTier?: TierId;
  readonly forceSpecies?: SpeciesId;
}

/**
 * Roll once. The order and count of rng draws is fixed (tier, species, seed) — even when a value
 * is forced — so a seeded rng yields the same stream regardless of debug overrides.
 */
export function rollOnce(rand: Rng, opts: RollOptions = {}): RollResult {
  const drawnTier = pickTier(rand());
  const drawnSpecies = SPECIES[Math.floor(rand() * SPECIES.length)] as (typeof SPECIES)[number];
  const seed = seed32(rand);
  const tier = opts.forceTier ? TIER_BY_ID[opts.forceTier] : drawnTier;
  const species = opts.forceSpecies ?? drawnSpecies.id;
  return { species, tier: tier.id, form: tier.form, seed };
}

export class LocalRollSource implements RollSource {
  private readonly rand: Rng;
  private readonly opts: RollOptions;

  constructor(rand: Rng = cryptoRng(), opts: RollOptions = {}) {
    this.rand = rand;
    this.opts = opts;
  }

  roll(): Promise<RollResult> {
    return Promise.resolve(rollOnce(this.rand, this.opts));
  }
}
