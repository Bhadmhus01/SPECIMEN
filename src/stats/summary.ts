import type { PlaytestEvent } from './types';

/**
 * Turns raw playtest events into the one number that matters, and enough context to trust it.
 * Pure and dependency-free (type imports only) so the same code runs in the browser's facilitator
 * panel and in `tools/aggregate.ts` under plain Node.
 *
 * The Phase 0 exit criterion (HANDOFF section 3): more than 60% of participants want "one more".
 * Measured behaviourally: of the participants who watched at least one reveal finish, the share who
 * pressed "One more" afterwards. The verbal answer, when the facilitator recorded it, is reported alongside.
 */

export const THRESHOLD = 0.6;
/** Below this many eligible participants the verdict is "insufficient data". The plan calls for about 50. */
export const MIN_PARTICIPANTS = 30;

export interface Summary {
  /** Eligible: not a debug run and at least one reveal finished. */
  participants: number;
  excludedDebug: number;
  excludedNoReveal: number;
  /** Of the eligible, how many pressed "One more" after their first finished reveal. */
  wantedMore: number;
  /** wantedMore / participants, or null when there are no participants. */
  rate: number | null;
  /** Wilson 95% interval for the rate, or null. */
  ci95: [number, number] | null;
  threshold: number;
  minParticipants: number;
  verdict: 'PASS' | 'FAIL' | 'INSUFFICIENT';
  /** "clear" when the whole interval sits on one side of the threshold; otherwise "borderline". */
  confidence: 'clear' | 'borderline' | 'n/a';
  /** P("One more" | the k-th reveal finished), for k = 1, 2, 3... Shows whether appetite holds up. */
  continuation: { reveal: number; settled: number; wantedMore: number; rate: number }[];
  potsPerParticipant: { mean: number; median: number; max: number } | null;
  /** Median seconds between a plant settling and "One more" being pressed, over all presses. */
  medianSecondsToOneMore: number | null;
  verbal: { yes: number; no: number; unanswered: number; rate: number | null };
  /** Observed tier mix over every finished reveal, for sanity-checking against the published odds. */
  tierMix: Record<string, number>;
  /** Participants who poked the finished plant: a sign they were engaging with it, not just waiting. */
  boopers: number;
  /** Participants whose device was too slow and had its render quality lowered: treat their verdicts with care. */
  lowQuality: number;
}

/** Wilson score interval: honest at small n and at rates near 0 or 1, unlike the normal approximation. */
export function wilson(successes: number, n: number, z = 1.96): [number, number] {
  if (n <= 0) return [0, 1];
  const p = successes / n;
  const z2 = z * z;
  const denom = 1 + z2 / n;
  const centre = (p + z2 / (2 * n)) / denom;
  const margin = (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / denom;
  return [Math.max(0, centre - margin), Math.min(1, centre + margin)];
}

const median = (xs: number[]): number => {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? (s[m] as number) : ((s[m - 1] as number) + (s[m] as number)) / 2;
};

interface Person {
  id: string;
  debug: boolean;
  events: PlaytestEvent[];
}

function group(events: readonly PlaytestEvent[]): Person[] {
  const by = new Map<string, Person>();
  for (const e of [...events].sort((a, b) => a.t - b.t)) {
    // P001 on one phone and P001 on another are different people
    const key = `${e.device ?? ''}/${e.participant}`;
    let p = by.get(key);
    if (!p) {
      p = { id: key, debug: false, events: [] };
      by.set(key, p);
    }
    if (e.type === 'session_start' && e.debug) p.debug = true;
    p.events.push(e);
  }
  return [...by.values()];
}

export function summarize(
  events: readonly PlaytestEvent[],
  opts: { threshold?: number; minParticipants?: number } = {},
): Summary {
  const threshold = opts.threshold ?? THRESHOLD;
  const minParticipants = opts.minParticipants ?? MIN_PARTICIPANTS;

  let excludedDebug = 0;
  let excludedNoReveal = 0;
  let wantedMore = 0;
  const pots: number[] = [];
  const delays: number[] = [];
  const tierMix: Record<string, number> = {};
  const cont = new Map<number, { settled: number; wantedMore: number }>();
  let yes = 0;
  let no = 0;
  let eligible = 0;
  let boopers = 0;
  let lowQuality = 0;

  for (const person of group(events)) {
    if (person.debug) {
      excludedDebug += 1;
      continue;
    }
    // Walk the timeline: count finished reveals, and whether each was followed by "One more".
    let settledCount = 0;
    let awaiting = false; // a reveal has settled and "One more" has not been pressed yet
    let firstWanted = false;
    let verbal: 'yes' | 'no' | null = null;
    let booped = false;
    let slowDevice = false;
    let dropped = 0;
    for (const e of person.events) {
      switch (e.type) {
        case 'pot_drop':
          dropped += 1;
          break;
        case 'reveal':
          tierMix[e.tier] = (tierMix[e.tier] ?? 0) + 1;
          break;
        case 'settled': {
          settledCount += 1;
          awaiting = true;
          const c = cont.get(settledCount) ?? { settled: 0, wantedMore: 0 };
          c.settled += 1;
          cont.set(settledCount, c);
          break;
        }
        case 'one_more':
          if (awaiting && settledCount >= 1) {
            const c = cont.get(settledCount);
            if (c) c.wantedMore += 1;
            if (settledCount === 1) firstWanted = true;
            delays.push(e.msSinceSettled / 1000);
            awaiting = false;
          }
          break;
        case 'boop':
          booped = true;
          break;
        case 'quality_drop':
          slowDevice = true;
          break;
        case 'verbal':
          verbal = e.answer;
          break;
        default:
          break;
      }
    }
    if (settledCount === 0) {
      excludedNoReveal += 1;
      continue;
    }
    eligible += 1;
    if (firstWanted) wantedMore += 1;
    pots.push(Math.max(dropped, settledCount));
    if (verbal === 'yes') yes += 1;
    if (verbal === 'no') no += 1;
    if (booped) boopers += 1;
    if (slowDevice) lowQuality += 1;
  }

  const rate = eligible > 0 ? wantedMore / eligible : null;
  const ci95 = eligible > 0 ? wilson(wantedMore, eligible) : null;
  let verdict: Summary['verdict'] = 'INSUFFICIENT';
  let confidence: Summary['confidence'] = 'n/a';
  if (rate !== null && ci95 !== null && eligible >= minParticipants) {
    verdict = rate > threshold ? 'PASS' : 'FAIL';
    confidence = ci95[0] > threshold || ci95[1] < threshold ? 'clear' : 'borderline';
  }
  const answered = yes + no;

  return {
    participants: eligible,
    excludedDebug,
    excludedNoReveal,
    wantedMore,
    rate,
    ci95,
    threshold,
    minParticipants,
    verdict,
    confidence,
    continuation: [...cont.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([reveal, c]) => ({ reveal, settled: c.settled, wantedMore: c.wantedMore, rate: c.settled ? c.wantedMore / c.settled : 0 })),
    potsPerParticipant:
      pots.length > 0 ? { mean: pots.reduce((a, b) => a + b, 0) / pots.length, median: median(pots), max: Math.max(...pots) } : null,
    medianSecondsToOneMore: delays.length > 0 ? median(delays) : null,
    verbal: { yes, no, unanswered: eligible - answered, rate: answered > 0 ? yes / answered : null },
    tierMix,
    boopers,
    lowQuality,
  };
}

/** Parse JSON Lines or a JSON array; silently skips lines that are not valid events. */
export function parseEvents(text: string): PlaytestEvent[] {
  const trimmed = text.trim();
  if (trimmed === '') return [];
  const raw: unknown[] = [];
  if (trimmed.startsWith('[')) {
    try {
      const arr: unknown = JSON.parse(trimmed);
      if (Array.isArray(arr)) raw.push(...arr);
    } catch {
      /* fall through to line-by-line */
    }
  }
  if (raw.length === 0) {
    for (const line of trimmed.split(/\r?\n/)) {
      const l = line.trim();
      if (!l.startsWith('{')) continue;
      try {
        raw.push(JSON.parse(l));
      } catch {
        /* skip a corrupt line */
      }
    }
  }
  // the same device exported twice (or two overlapping exports) must not count anyone twice
  const seen = new Set<string>();
  const out: PlaytestEvent[] = [];
  for (const x of raw) {
    if (!isEvent(x)) continue;
    const key = JSON.stringify(x);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(x);
  }
  return out;
}

function isEvent(x: unknown): x is PlaytestEvent {
  if (typeof x !== 'object' || x === null) return false;
  const o = x as Record<string, unknown>;
  return typeof o.type === 'string' && typeof o.t === 'number' && typeof o.participant === 'string';
}

const pct = (x: number | null): string => (x === null ? 'n/a' : `${(x * 100).toFixed(1)}%`);

/** A plain-text report for the terminal and for pasting into the playtest notes. */
export function formatReport(s: Summary): string {
  const lines: string[] = [];
  lines.push('SPECIMEN Phase 0 playtest');
  lines.push('=========================');
  lines.push('');
  lines.push(`Participants (eligible): ${s.participants}   [excluded: ${s.excludedDebug} debug, ${s.excludedNoReveal} saw no reveal finish]`);
  lines.push(`Pressed "One more" after their first reveal: ${s.wantedMore} of ${s.participants}  =  ${pct(s.rate)}`);
  if (s.ci95) lines.push(`95% interval (Wilson): ${pct(s.ci95[0])} to ${pct(s.ci95[1])}`);
  lines.push(`Exit criterion: more than ${pct(s.threshold)} want one more`);
  lines.push('');
  if (s.verdict === 'INSUFFICIENT') {
    lines.push(`VERDICT: INSUFFICIENT DATA. ${s.participants} eligible participants; need at least ${s.minParticipants} (the plan calls for about 50).`);
  } else {
    lines.push(`VERDICT: ${s.verdict} (${s.confidence === 'clear' ? 'the whole interval is on one side of the threshold' : 'borderline: the interval straddles the threshold, so more participants would firm it up'})`);
  }
  lines.push('');
  lines.push('Appetite by reveal (does it hold up?)');
  for (const c of s.continuation) lines.push(`  after reveal ${c.reveal}: ${c.wantedMore}/${c.settled} pressed One more (${pct(c.rate)})`);
  if (s.potsPerParticipant) {
    lines.push('');
    lines.push(`Pots opened per participant: mean ${s.potsPerParticipant.mean.toFixed(1)}, median ${s.potsPerParticipant.median}, max ${s.potsPerParticipant.max}`);
  }
  if (s.medianSecondsToOneMore !== null) lines.push(`Median pause before pressing One more: ${s.medianSecondsToOneMore.toFixed(1)} s`);
  lines.push('');
  lines.push(`Verbal "would you open another?": yes ${s.verbal.yes}, no ${s.verbal.no}, not recorded ${s.verbal.unanswered}  (yes rate among answered: ${pct(s.verbal.rate)})`);
  if (s.lowQuality > 0) lines.push(`Devices that had to lower render quality (laggy): ${s.lowQuality} participant(s). Interpret their answers with care.`);
  const mix = Object.entries(s.tierMix);
  if (mix.length > 0) {
    const total = mix.reduce((a, [, n]) => a + n, 0);
    lines.push('');
    lines.push('Observed rarity mix (sanity check against the published 50/30/15/5):');
    for (const [tier, n] of mix.sort((a, b) => b[1] - a[1])) lines.push(`  ${tier.padEnd(9)} ${String(n).padStart(4)}  ${pct(n / total)}`);
  }
  return lines.join('\n');
}
