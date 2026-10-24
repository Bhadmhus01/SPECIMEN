import { describe, expect, it } from 'vitest';
import { FrameGovernor } from '../src/governor';

/** Feed a repeating gap pattern for `seconds` of simulated time; return the simulated second at which it fired, or null. */
function run(g: FrameGovernor, pattern: number[], seconds: number, hidden = false): number | null {
  let t = 0;
  let i = 0;
  while (t < seconds * 1000) {
    const gap = pattern[i++ % pattern.length] as number;
    t += gap;
    if (g.feed(gap, hidden)) return t / 1000;
  }
  return null;
}

describe('FrameGovernor', () => {
  it('never fires on a healthy 60 fps device', () => {
    expect(run(new FrameGovernor(), [16.7], 120)).toBeNull();
  });

  it('never fires on a 30 fps OS cap (e.g. iOS Low Power Mode): that is a policy, not slowness', () => {
    expect(run(new FrameGovernor(), [33.3], 120)).toBeNull();
  });

  it('fires on a device that sustains well under 25 fps, after the warm-up and two windows', () => {
    const at = run(new FrameGovernor(), [100], 60);
    expect(at).not.toBeNull();
    expect(at as number).toBeGreaterThan(4); // not during start-up jank
    expect(at as number).toBeLessThan(8);
  });

  it('catches STUTTER: nine quick frames then one long stall every second (about 10 fps as felt)', () => {
    // A saturated GPU looks like this: the main thread races ahead, then blocks on the GPU. The first, EMA-based
    // detector capped and skipped the long stalls and never fired on it, so this pattern is pinned here.
    const stutter = [...Array.from({ length: 9 }, () => 16.7), 850];
    expect(run(new FrameGovernor(), stutter, 60)).not.toBeNull();
  });

  it('ignores start-up jank: a long first-frame stall followed by smooth play never fires', () => {
    const g = new FrameGovernor();
    expect(g.feed(3400)).toBe(false);
    expect(run(g, [16.7], 60)).toBeNull();
  });

  it('does not fire on a single hitch in otherwise smooth play', () => {
    const g = new FrameGovernor();
    run(g, [16.7], 10);
    expect(g.feed(900)).toBe(false);
    expect(run(g, [16.7], 30)).toBeNull();
  });

  it('needs consecutive slow windows: a slow second between good ones resets the count', () => {
    const g = new FrameGovernor();
    run(g, [16.7], 6); // warm and healthy
    // alternate one slow window and one healthy window, many times
    for (let i = 0; i < 20; i++) {
      expect(run(g, [100], 1.05)).toBeNull();
      expect(run(g, [16.7], 1.05)).toBeNull();
    }
  });

  it('ignores a hidden tab and clears its evidence', () => {
    const g = new FrameGovernor();
    run(g, [16.7], 6);
    expect(run(g, [500], 30, true)).toBeNull(); // backgrounded: nothing counts
    expect(run(g, [16.7], 10)).toBeNull();
  });

  it('ignores suspensions (device sleep) that are not performance', () => {
    const g = new FrameGovernor();
    run(g, [16.7], 6);
    expect(g.feed(60_000)).toBe(false);
    expect(run(g, [16.7], 10)).toBeNull();
  });

  it('after reset() the new resolution gets a fresh warm-up before it can fire again', () => {
    const g = new FrameGovernor();
    const first = run(g, [100], 60) as number;
    g.reset();
    const second = run(g, [100], 60) as number;
    expect(second).toBeGreaterThan(4);
    expect(Math.abs(second - first)).toBeLessThan(0.5); // same schedule: warm-up again, then two windows
  });
});
