import { describe, expect, it } from 'vitest';
import { PlaytestLog } from '../src/stats/log';
import { parseEvents, summarize } from '../src/stats/summary';
import type { SessionInfo } from '../src/stats/types';

const session = (debug = false): SessionInfo => ({ build: 't', ua: 'test', viewport: '390x844', dpr: 2, reducedMotion: false, sound: true, debug });

/** A minimal in-memory Storage. */
class FakeStorage implements Storage {
  private m = new Map<string, string>();
  get length(): number {
    return this.m.size;
  }
  clear(): void {
    this.m.clear();
  }
  getItem(k: string): string | null {
    return this.m.get(k) ?? null;
  }
  key(i: number): string | null {
    return [...this.m.keys()][i] ?? null;
  }
  removeItem(k: string): void {
    this.m.delete(k);
  }
  setItem(k: string, v: string): void {
    this.m.set(k, v);
  }
}

function clock(): () => number {
  let t = 1000;
  return () => (t += 10);
}

describe('PlaytestLog', () => {
  it('starts participant P001 with a session record', () => {
    const log = new PlaytestLog({ storage: new FakeStorage(), now: clock(), session });
    expect(log.participant).toBe('P001');
    const ev = log.events();
    expect(ev).toHaveLength(1);
    expect(ev[0]).toMatchObject({ type: 'session_start', participant: 'P001', ua: 'test' });
  });

  it('attributes events to the current participant and separates participants', () => {
    const log = new PlaytestLog({ storage: new FakeStorage(), now: clock(), session });
    log.record({ type: 'pot_drop', index: 1 });
    const second = log.newParticipant();
    expect(second).toBe('P002');
    log.record({ type: 'pot_drop', index: 1 });
    const ev = log.events();
    expect(ev.filter((e) => e.participant === 'P001').map((e) => e.type)).toEqual(['session_start', 'pot_drop']);
    expect(ev.filter((e) => e.participant === 'P002').map((e) => e.type)).toEqual(['session_start', 'pot_drop']);
    expect(log.currentEvents().every((e) => e.participant === 'P002')).toBe(true);
  });

  it('survives a page reload: same participant, history intact, a fresh session record appended', () => {
    const storage = new FakeStorage();
    const a = new PlaytestLog({ storage, now: clock(), session });
    a.record({ type: 'pot_drop', index: 1 });
    a.newParticipant();
    a.record({ type: 'pot_drop', index: 1 });

    const b = new PlaytestLog({ storage, now: clock(), session });
    expect(b.participant).toBe('P002');
    expect(b.events().filter((e) => e.participant === 'P001')).toHaveLength(2);
    expect(b.currentEvents().map((e) => e.type)).toEqual(['session_start', 'pot_drop', 'session_start']);
  });

  it('records the debug flag so forced runs can be excluded', () => {
    const log = new PlaytestLog({ storage: new FakeStorage(), now: clock(), session: () => session(true) });
    expect(log.events()[0]).toMatchObject({ type: 'session_start', debug: true });
  });

  it('exports JSON Lines that parse back to the same events', () => {
    const log = new PlaytestLog({ storage: new FakeStorage(), now: clock(), session });
    log.record({ type: 'pot_drop', index: 1 });
    log.record({ type: 'tap', index: 1, n: 1 });
    log.recordVerbal('yes');
    const text = log.exportJSONL();
    expect(text.endsWith('\n')).toBe(true);
    expect(text.trim().split('\n')).toHaveLength(4);
    expect(parseEvents(text)).toEqual(log.events());
  });

  it('always exports at least the session record', () => {
    const log = new PlaytestLog({ storage: new FakeStorage(), now: clock(), session });
    expect(parseEvents(log.exportJSONL())).toHaveLength(1);
  });

  it('clear() erases everything and starts over at P001', () => {
    const storage = new FakeStorage();
    const log = new PlaytestLog({ storage, now: clock(), session });
    log.record({ type: 'pot_drop', index: 1 });
    log.newParticipant();
    log.clear();
    expect(log.participant).toBe('P001');
    expect(log.events()).toHaveLength(1);
  });

  it('works memory-only when storage is unavailable', () => {
    const log = new PlaytestLog({ storage: null, now: clock(), session });
    log.record({ type: 'pot_drop', index: 1 });
    expect(log.events().map((e) => e.type)).toEqual(['session_start', 'pot_drop']);
    log.newParticipant();
    expect(log.participant).toBe('P002');
  });

  it('does not throw when storage rejects writes (quota, private mode)', () => {
    const hostile: Storage = Object.assign(new FakeStorage(), {
      setItem() {
        throw new Error('QuotaExceededError');
      },
    });
    const log = new PlaytestLog({ storage: hostile, now: clock(), session });
    expect(() => log.record({ type: 'pot_drop', index: 1 })).not.toThrow();
    expect(log.events().map((e) => e.type)).toContain('pot_drop');
  });

  it('notifies listeners on every change', () => {
    const log = new PlaytestLog({ storage: new FakeStorage(), now: clock(), session });
    let n = 0;
    log.onChange(() => (n += 1));
    log.record({ type: 'pot_drop', index: 1 });
    log.newParticipant();
    expect(n).toBeGreaterThanOrEqual(3); // record + session_start + newParticipant
  });

  it('feeds the summary end to end: a logged session is counted, a debug one is not', () => {
    const storage = new FakeStorage();
    const real = new PlaytestLog({ storage, now: clock(), session });
    real.record({ type: 'pot_drop', index: 1 });
    real.record({ type: 'settled', index: 1 });
    real.record({ type: 'one_more', index: 1, msSinceSettled: 1500 });
    real.newParticipant();
    real.record({ type: 'pot_drop', index: 1 });
    real.record({ type: 'settled', index: 1 });
    const s = summarize(real.events(), { minParticipants: 1 });
    expect(s.participants).toBe(2);
    expect(s.wantedMore).toBe(1);

    const dbg = new PlaytestLog({ storage: new FakeStorage(), now: clock(), session: () => session(true) });
    dbg.record({ type: 'settled', index: 1 });
    dbg.record({ type: 'one_more', index: 1, msSinceSettled: 1 });
    expect(summarize(dbg.events(), { minParticipants: 1 }).participants).toBe(0);
  });
});

describe('device ids: merging exports from several phones', () => {
  it('gives every event the device id, stable across reloads', () => {
    const storage = new FakeStorage();
    const a = new PlaytestLog({ storage, now: clock(), session });
    a.record({ type: 'pot_drop', index: 1 });
    const ids = new Set(a.events().map((e) => e.device));
    expect(ids.size).toBe(1);
    expect([...ids][0]).toMatch(/^d[0-9a-f]{8}$/);
    const b = new PlaytestLog({ storage, now: clock(), session });
    expect(new Set(b.events().map((e) => e.device))).toEqual(ids);
  });

  it('different devices get different ids', () => {
    const a = new PlaytestLog({ storage: new FakeStorage(), now: clock(), session });
    const b = new PlaytestLog({ storage: new FakeStorage(), now: clock(), session });
    expect(a.events()[0]?.device).not.toBe(b.events()[0]?.device);
  });

  it('keeps P001 on phone A and P001 on phone B as two different people', () => {
    const phone = (): string => {
      const log = new PlaytestLog({ storage: new FakeStorage(), now: clock(), session });
      log.record({ type: 'pot_drop', index: 1 });
      log.record({ type: 'settled', index: 1 });
      log.record({ type: 'one_more', index: 1, msSinceSettled: 900 });
      return log.exportJSONL();
    };
    const merged = parseEvents(phone() + phone());
    const s = summarize(merged, { minParticipants: 1 });
    expect(s.participants).toBe(2);
    expect(s.wantedMore).toBe(2);
  });

  it('does not double count when the same export is passed twice', () => {
    const log = new PlaytestLog({ storage: new FakeStorage(), now: clock(), session });
    log.record({ type: 'settled', index: 1 });
    log.record({ type: 'one_more', index: 1, msSinceSettled: 1 });
    const text = log.exportJSONL();
    const s = summarize(parseEvents(text + text), { minParticipants: 1 });
    expect(s.participants).toBe(1);
    expect(parseEvents(text + text)).toHaveLength(parseEvents(text).length);
  });
});
