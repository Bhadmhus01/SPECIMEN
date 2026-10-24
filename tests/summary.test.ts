import { describe, expect, it } from 'vitest';
import { MIN_PARTICIPANTS, THRESHOLD, formatReport, parseEvents, summarize, wilson } from '../src/stats/summary';
import type { PlaytestEvent, SessionInfo } from '../src/stats/types';

const SESSION: SessionInfo = { build: 't', ua: 'test', viewport: '390x844', dpr: 2, reducedMotion: false, sound: true, debug: false };

interface Script {
  id: string;
  debug?: boolean;
  /** One entry per finished reveal; true = the participant pressed One more afterwards. */
  reveals: boolean[];
  tiers?: string[];
  verbal?: 'yes' | 'no';
  boop?: boolean;
  start?: number;
}

/** Build a realistic event stream for one participant. */
function person(s: Script): PlaytestEvent[] {
  let t = s.start ?? 1_000_000;
  const tick = (ms: number): number => (t += ms);
  const ev: PlaytestEvent[] = [{ type: 'session_start', ...SESSION, debug: s.debug ?? false, t, participant: s.id }];
  s.reveals.forEach((more, i) => {
    const index = i + 1;
    ev.push({ type: 'pot_drop', index, t: tick(100), participant: s.id });
    ev.push({ type: 'pot_ready', index, t: tick(600), participant: s.id });
    ev.push({ type: 'reveal', index, species: 'monstera', tier: s.tiers?.[i] ?? 'common', form: 'classic', msToOpen: 1500, t: tick(1500), participant: s.id });
    ev.push({ type: 'settled', index, t: tick(2200), participant: s.id });
    if (s.boop && i === 0) ev.push({ type: 'boop', index, t: tick(300), participant: s.id });
    if (more) ev.push({ type: 'one_more', index, msSinceSettled: 2000, t: tick(2000), participant: s.id });
  });
  if (s.verbal) ev.push({ type: 'verbal', answer: s.verbal, t: tick(5000), participant: s.id });
  return ev;
}

/** n participants, `yes` of whom press One more after the first reveal. */
function cohort(n: number, yes: number): PlaytestEvent[] {
  const out: PlaytestEvent[] = [];
  for (let i = 0; i < n; i++) out.push(...person({ id: `P${String(i + 1).padStart(3, '0')}`, reveals: [i < yes], start: 1_000_000 + i * 100_000 }));
  return out;
}

describe('wilson interval', () => {
  it('matches the textbook value for 30/50', () => {
    const [lo, hi] = wilson(30, 50);
    expect(lo).toBeCloseTo(0.4618, 3);
    expect(hi).toBeCloseTo(0.7239, 3);
  });

  it('is [0, 1] with no data and never leaves [0, 1]', () => {
    expect(wilson(0, 0)).toEqual([0, 1]);
    for (const [k, n] of [[0, 10], [10, 10], [1, 2], [0, 1], [1, 1]] as const) {
      const [lo, hi] = wilson(k, n);
      expect(lo).toBeGreaterThanOrEqual(0);
      expect(hi).toBeLessThanOrEqual(1);
      expect(lo).toBeLessThanOrEqual(hi);
    }
  });

  it('stays honest at the extremes: 0/10 still has an upper bound above zero', () => {
    expect(wilson(0, 10)[1]).toBeGreaterThan(0.2);
    expect(wilson(10, 10)[0]).toBeLessThan(0.8);
  });
});

describe('summarize: the exit criterion', () => {
  it('passes when more than 60% of 50 participants want one more', () => {
    const s = summarize(cohort(50, 35));
    expect(s.participants).toBe(50);
    expect(s.wantedMore).toBe(35);
    expect(s.rate).toBeCloseTo(0.7);
    expect(s.verdict).toBe('PASS');
  });

  it('is a strict threshold: exactly 60% does not pass', () => {
    const s = summarize(cohort(50, 30));
    expect(s.rate).toBeCloseTo(0.6);
    expect(s.verdict).toBe('FAIL');
    expect(THRESHOLD).toBe(0.6);
  });

  it('fails when fewer want one more', () => {
    expect(summarize(cohort(50, 20)).verdict).toBe('FAIL');
  });

  it('refuses to call it with too few participants, whatever the rate', () => {
    const s = summarize(cohort(MIN_PARTICIPANTS - 1, MIN_PARTICIPANTS - 1));
    expect(s.rate).toBe(1);
    expect(s.verdict).toBe('INSUFFICIENT');
    expect(s.confidence).toBe('n/a');
  });

  it('reports a borderline confidence when the interval straddles the threshold', () => {
    const s = summarize(cohort(50, 33)); // 66%: passes, but the interval reaches below 60%
    expect(s.verdict).toBe('PASS');
    expect(s.confidence).toBe('borderline');
  });

  it('reports a clear confidence when the whole interval clears the threshold', () => {
    const s = summarize(cohort(100, 90));
    expect(s.verdict).toBe('PASS');
    expect(s.confidence).toBe('clear');
  });

  it('handles an empty log', () => {
    const s = summarize([]);
    expect(s.participants).toBe(0);
    expect(s.rate).toBeNull();
    expect(s.ci95).toBeNull();
    expect(s.verdict).toBe('INSUFFICIENT');
    expect(() => formatReport(s)).not.toThrow();
  });
});

describe('summarize: who counts', () => {
  it('excludes debug runs (forced or seeded rolls), so a demo can never move the result', () => {
    const events = [...cohort(40, 10), ...person({ id: 'P900', debug: true, reveals: [true] }), ...person({ id: 'P901', debug: true, reveals: [true] })];
    const s = summarize(events);
    expect(s.excludedDebug).toBe(2);
    expect(s.participants).toBe(40);
    expect(s.wantedMore).toBe(10);
  });

  it('excludes participants who never saw a reveal finish', () => {
    const events = [...cohort(35, 28), ...person({ id: 'P800', reveals: [] })];
    const s = summarize(events);
    expect(s.excludedNoReveal).toBe(1);
    expect(s.participants).toBe(35);
  });

  it('judges on the FIRST reveal: pressing One more only later does not count as wanting more after the first', () => {
    const events = person({ id: 'P001', reveals: [false, true] });
    const s = summarize(events, { minParticipants: 1 });
    expect(s.wantedMore).toBe(0);
    expect(s.continuation).toEqual([
      { reveal: 1, settled: 1, wantedMore: 0, rate: 0 },
      { reveal: 2, settled: 1, wantedMore: 1, rate: 1 },
    ]);
  });

  it('ignores a One more press that does not follow a finished reveal, and double presses', () => {
    const base = person({ id: 'P001', reveals: [false] });
    const stray: PlaytestEvent = { type: 'one_more', index: 1, msSinceSettled: 1, t: 1, participant: 'P001' }; // before everything
    const events = [stray, ...base];
    expect(summarize(events, { minParticipants: 1 }).wantedMore).toBe(0);

    const twice = person({ id: 'P002', reveals: [true] });
    twice.push({ type: 'one_more', index: 1, msSinceSettled: 9, t: 9_999_999, participant: 'P002' });
    const s = summarize(twice, { minParticipants: 1 });
    expect(s.wantedMore).toBe(1);
    expect(s.continuation[0]).toMatchObject({ settled: 1, wantedMore: 1 });
  });

  it('sorts events by time before reading them', () => {
    const events = cohort(31, 25).reverse();
    expect(summarize(events).participants).toBe(31);
    expect(summarize(events).wantedMore).toBe(25);
  });
});

describe('summarize: context numbers', () => {
  it('counts verbal answers and the yes rate among those answered', () => {
    const events = [
      ...person({ id: 'P001', reveals: [true], verbal: 'yes' }),
      ...person({ id: 'P002', reveals: [false], verbal: 'no' }),
      ...person({ id: 'P003', reveals: [true], verbal: 'yes' }),
      ...person({ id: 'P004', reveals: [true] }),
    ];
    const s = summarize(events, { minParticipants: 1 });
    expect(s.verbal).toEqual({ yes: 2, no: 1, unanswered: 1, rate: 2 / 3 });
  });

  it('tallies the observed tier mix and pots per participant', () => {
    const events = [
      ...person({ id: 'P001', reveals: [true, true, false], tiers: ['common', 'rare', 'common'] }),
      ...person({ id: 'P002', reveals: [false], tiers: ['grail'] }),
    ];
    const s = summarize(events, { minParticipants: 1 });
    expect(s.tierMix).toEqual({ common: 2, rare: 1, grail: 1 });
    expect(s.potsPerParticipant).toEqual({ mean: 2, median: 2, max: 3 });
    expect(s.medianSecondsToOneMore).toBe(2);
  });

  it('counts participants who poked the finished plant', () => {
    const events = [...person({ id: 'P001', reveals: [true], boop: true }), ...person({ id: 'P002', reveals: [true] })];
    expect(summarize(events, { minParticipants: 1 }).boopers).toBe(1);
  });
});

describe('summarize: slow devices', () => {
  it('counts participants whose device had to lower render quality, and says so in the report', () => {
    const slow = person({ id: 'P001', reveals: [true] });
    slow.push({ type: 'quality_drop', scale: 1.5, t: slow[slow.length - 1]!.t + 1, participant: 'P001' });
    slow.push({ type: 'quality_drop', scale: 1.1, t: slow[slow.length - 1]!.t + 2, participant: 'P001' }); // twice still counts one person
    const events = [...slow, ...person({ id: 'P002', reveals: [true] })];
    const s = summarize(events, { minParticipants: 1 });
    expect(s.lowQuality).toBe(1);
    expect(s.participants).toBe(2);
    expect(formatReport(s)).toContain('lower render quality');
    expect(formatReport(summarize(person({ id: 'P003', reveals: [true] }), { minParticipants: 1 }))).not.toContain('lower render quality');
  });
});

describe('parseEvents and report', () => {
  const events = cohort(3, 2);

  it('reads JSON Lines', () => {
    const text = events.map((e) => JSON.stringify(e)).join('\n');
    expect(parseEvents(text)).toHaveLength(events.length);
  });

  it('reads a JSON array', () => {
    expect(parseEvents(JSON.stringify(events))).toHaveLength(events.length);
  });

  it('skips corrupt lines, blank lines and things that are not events', () => {
    const text = ['', '{"nope": 1}', 'not json', JSON.stringify(events[0]), '{"type":"tap","t":"x","participant":"P001"}', '  '].join('\n');
    expect(parseEvents(text)).toHaveLength(1);
  });

  it('returns nothing for empty input', () => {
    expect(parseEvents('')).toEqual([]);
    expect(parseEvents('   \n  ')).toEqual([]);
  });

  it('formats a report that states the verdict and the numbers', () => {
    const report = formatReport(summarize(cohort(50, 35)));
    expect(report).toContain('VERDICT: PASS');
    expect(report).toContain('35 of 50');
    expect(report).toContain('70.0%');
    const small = formatReport(summarize(cohort(5, 5)));
    expect(small).toContain('INSUFFICIENT DATA');
  });
});
