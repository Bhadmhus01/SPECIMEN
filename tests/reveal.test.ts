import { describe, expect, it } from 'vitest';
import { TIMING } from '../src/config';
import { Reveal, type Cue } from '../src/reveal';
import type { RollResult, RollSource } from '../src/roll';

const RESULT: RollResult = { species: 'monstera', tier: 'rare', form: 'halfmoon', seed: 42 };
const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

function setup(impl?: () => Promise<RollResult>) {
  const calls = { n: 0 };
  const source: RollSource = {
    roll: () => {
      calls.n += 1;
      return impl ? impl() : Promise.resolve(RESULT);
    },
  };
  const cues: { t: number; cue: Cue }[] = [];
  let now = 0;
  const reveal = new Reveal(source, (cue) => cues.push({ t: now, cue }));
  const step = (seconds: number, dt = 1 / 60) => {
    const n = Math.round(seconds / dt);
    for (let i = 0; i < n; i++) {
      now += dt;
      reveal.update(dt);
    }
  };
  const types = () => cues.map((c) => c.cue.type);
  const find = <T extends Cue['type']>(type: T) => cues.find((c) => c.cue.type === type);
  return { reveal, cues, calls, step, types, find, now: () => now };
}

/** Start, wait for the drop, and return a ready-to-tap setup. */
async function ready(impl?: () => Promise<RollResult>) {
  const s = setup(impl);
  s.reveal.start();
  await flush();
  s.step(TIMING.dropSeconds + 0.05);
  return s;
}

/** Tap three times with gaps. */
function openPot(s: Awaited<ReturnType<typeof ready>>) {
  expect(s.reveal.tap()).toBe('crack');
  s.step(0.2);
  expect(s.reveal.tap()).toBe('crack');
  s.step(0.2);
  expect(s.reveal.tap()).toBe('break');
}

describe('Reveal director', () => {
  it('drops a pot, requests the roll once, and becomes tappable after the drop', async () => {
    const s = setup();
    s.reveal.start();
    await flush();
    expect(s.types()).toEqual(['drop', 'rolled']);
    expect(s.reveal.phase).toBe('dropping');
    s.step(TIMING.dropSeconds + 0.05);
    expect(s.reveal.phase).toBe('idle');
    expect(s.types()).toContain('ready');
    expect(s.calls.n).toBe(1);
  });

  it('rolls BEFORE any tap — the outcome is fixed while the pot is still sealed', async () => {
    const s = setup();
    s.reveal.start();
    await flush();
    expect(s.find('rolled')?.cue).toMatchObject({ result: RESULT });
    expect(s.reveal.taps).toBe(0);
  });

  it('ignores taps while the pot is still dropping', () => {
    const s = setup();
    s.reveal.start();
    expect(s.reveal.tap()).toBe('ignored');
    expect(s.reveal.taps).toBe(0);
  });

  it('takes crack, crack, break — and holds the burst until the hit-stop has elapsed', async () => {
    const s = await ready();
    openPot(s);
    expect(s.types().filter((t) => t === 'crack')).toHaveLength(2);
    expect(s.types()).toContain('hitstop');
    expect(s.types()).not.toContain('burst');
    s.step(TIMING.hitStop + 0.03);
    expect(s.types()).toContain('burst');
    expect(s.reveal.phase).toBe('bursting');
  });

  it('reports crack stages 1 and 2 of 2', async () => {
    const s = await ready();
    openPot(s);
    const stages = s.cues.filter((c) => c.cue.type === 'crack').map((c) => c.cue);
    expect(stages).toEqual([
      { type: 'crack', stage: 1, stages: 2 },
      { type: 'crack', stage: 2, stages: 2 },
    ]);
  });

  it('ignores a tap that lands inside the minimum tap gap', async () => {
    const s = await ready();
    expect(s.reveal.tap()).toBe('crack');
    expect(s.reveal.tap()).toBe('ignored'); // same instant
    s.step(TIMING.minTapGap / 2);
    expect(s.reveal.tap()).toBe('ignored');
    s.step(TIMING.minTapGap);
    expect(s.reveal.tap()).toBe('crack');
    expect(s.reveal.taps).toBe(2);
  });

  it('fires burst, sprout, fanfare, tag, settled in order at the configured times', async () => {
    const s = await ready();
    openPot(s);
    s.step(TIMING.hitStop + 0.03);
    s.step(TIMING.sproutDelay + TIMING.growSeconds.rare + TIMING.readyDelay + 0.1);

    const order = s.types().filter((t) => ['burst', 'sprout', 'fanfare', 'tag', 'settled'].includes(t));
    expect(order).toEqual(['burst', 'sprout', 'fanfare', 'tag', 'settled']);

    const at = (type: Cue['type']) => (s.find(type) as { t: number }).t;
    const frame = 1 / 60 + 1e-9;
    const burst = at('burst');
    expect(at('sprout') - burst).toBeCloseTo(TIMING.sproutDelay, 1);
    expect(Math.abs(at('sprout') - burst - TIMING.sproutDelay)).toBeLessThanOrEqual(frame * 2);
    expect(Math.abs(at('fanfare') - burst - (TIMING.sproutDelay + TIMING.growSeconds.rare * TIMING.fanfareAt))).toBeLessThanOrEqual(frame * 2);
    expect(Math.abs(at('tag') - burst - (TIMING.sproutDelay + TIMING.growSeconds.rare))).toBeLessThanOrEqual(frame * 2);
    expect(Math.abs(at('settled') - burst - (TIMING.sproutDelay + TIMING.growSeconds.rare + TIMING.readyDelay))).toBeLessThanOrEqual(frame * 2);
    expect(s.reveal.phase).toBe('settled');
  });

  it('reveals exactly the rolled object — the animation cannot alter the outcome', async () => {
    const s = await ready();
    openPot(s);
    s.step(5);
    const rolled = s.find('rolled')?.cue as Extract<Cue, { type: 'rolled' }>;
    for (const type of ['burst', 'sprout', 'fanfare', 'tag', 'settled'] as const) {
      const cue = s.find(type)?.cue as Extract<Cue, { result: RollResult }>;
      expect(cue.result).toBe(rolled.result); // same reference, not just equal
    }
  });

  it('waits for a slow roll: no burst until the result arrives', async () => {
    let resolveRoll: (r: RollResult) => void = () => undefined;
    const s = await ready(() => new Promise<RollResult>((resolve) => (resolveRoll = resolve)));
    openPot(s);
    s.step(2); // way past the hit-stop
    expect(s.types()).not.toContain('burst');
    expect(s.reveal.phase).toBe('cracking');

    resolveRoll(RESULT);
    await flush();
    expect(s.types()).toContain('burst');
    expect(s.reveal.phase).toBe('bursting');
  });

  it('ignores taps after the final tap and throughout the burst and growth', async () => {
    const s = await ready();
    openPot(s);
    expect(s.reveal.tap()).toBe('ignored'); // during hit-stop
    s.step(TIMING.hitStop + 0.03);
    s.step(0.5);
    expect(s.reveal.tap()).toBe('ignored'); // growing
    expect(s.reveal.taps).toBe(TIMING.tapsToOpen);
  });

  it('offers "one more" only once settled, and only once per pot', async () => {
    const s = await ready();
    expect(s.reveal.oneMore()).toBe(false); // idle
    openPot(s);
    s.step(TIMING.hitStop + 0.5);
    expect(s.reveal.oneMore()).toBe(false); // mid-growth
    s.step(TIMING.sproutDelay + TIMING.growSeconds.rare + TIMING.readyDelay + 0.1);
    expect(s.reveal.phase).toBe('settled');

    expect(s.reveal.oneMore()).toBe(true);
    expect(s.reveal.oneMore()).toBe(false); // double-tap on the button
    expect(s.types()).toContain('leave');

    s.step(TIMING.leaveSeconds + 0.05);
    await flush();
    expect(s.reveal.index).toBe(2);
    expect(s.reveal.taps).toBe(0);
    expect(s.calls.n).toBe(2); // exactly one new roll per pot
    expect(s.cues.filter((c) => c.cue.type === 'drop').map((c) => (c.cue as { index: number }).index)).toEqual([1, 2]);
    s.step(TIMING.dropSeconds + 0.05);
    expect(s.reveal.phase).toBe('idle');
  });

  it('retries a failed roll and still reveals', async () => {
    let attempts = 0;
    const s = setup(() => (++attempts === 1 ? Promise.reject(new Error('boom')) : Promise.resolve(RESULT)));
    s.reveal.start();
    await flush();
    expect(s.types()).toContain('error');
    expect(s.types()).not.toContain('rolled');
    s.step(TIMING.rollRetrySeconds + 0.05);
    await flush();
    expect(s.types()).toContain('rolled');
    expect(s.calls.n).toBe(2);
  });

  it('survives a roll source that throws synchronously', async () => {
    let attempts = 0;
    const s = setup(() => {
      if (++attempts === 1) throw new Error('sync boom');
      return Promise.resolve(RESULT);
    });
    s.reveal.start();
    await flush();
    expect(s.types()).toContain('error');
    s.step(TIMING.rollRetrySeconds + 0.05);
    await flush();
    expect(s.types()).toContain('rolled');
  });
});
