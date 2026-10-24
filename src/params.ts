import { SPECIES_BY_ID, TIER_BY_ID, type SpeciesId, type TierId } from './config';

/**
 * Query-string switches. Everything here is for development, QA and the facilitator.
 * Forced or seeded runs are flagged in the playtest log and excluded from the results,
 * so a debug pull can never be mistaken for a participant's real one.
 */
export interface Params {
  /** `?force=grail` — force the rarity (demos, QA). */
  force: TierId | undefined;
  /** `?species=monstera` — force the species. */
  species: SpeciesId | undefined;
  /** `?seed=42` — make the roll sequence reproducible. */
  seed: number | undefined;
  /** `?test=1` — show the facilitator panel and expose `window.__specimen`. */
  test: boolean;
  /** `?manual=1` — no animation loop; a test drives time. Implies test hooks. */
  manual: boolean;
  /** `?sound=0` — start muted. */
  sound: boolean;
  /** `?motion=reduce|full` — override the OS reduced-motion setting. */
  motion: 'auto' | 'reduce' | 'full';
}

export function parseParams(search: string): Params {
  const q = new URLSearchParams(search);
  const force = q.get('force');
  const species = q.get('species');
  const seedRaw = q.get('seed');
  const motion = q.get('motion');
  const seedNum = seedRaw !== null && seedRaw.trim() !== '' ? Number(seedRaw) : NaN;
  return {
    force: force !== null && Object.hasOwn(TIER_BY_ID, force) ? (force as TierId) : undefined,
    species: species !== null && Object.hasOwn(SPECIES_BY_ID, species) ? (species as SpeciesId) : undefined,
    seed: Number.isFinite(seedNum) ? seedNum >>> 0 : undefined,
    test: q.get('test') === '1',
    manual: q.get('manual') === '1',
    sound: q.get('sound') !== '0',
    motion: motion === 'reduce' || motion === 'full' ? motion : 'auto',
  };
}

/** True when the run is not a genuine, unmodified roll sequence. */
export function isDebugRun(p: Params): boolean {
  return p.force !== undefined || p.species !== undefined || p.seed !== undefined;
}
