/**
 * Decides when a device is too slow for the full-resolution canvas.
 *
 * It measures what a player feels, frames per second over wall-clock windows, not the average of
 * per-frame gaps: stutter (many quick frames plus a few long stalls, the typical signature of a
 * saturated GPU) looks fine to a per-frame average but plays terribly. Pure: no DOM, no timers.
 */
export interface GovernorOptions {
  /** A window averaging more than this many ms per frame (below ~25 fps) counts as slow. A 30 fps OS cap (33 ms) does not. */
  slowGapMs?: number;
  /** Ignore start-up jank (shader compiles, first layout) for this long. */
  warmupMs?: number;
  /** Length of one measuring window. */
  windowMs?: number;
  /** Consecutive slow windows required before reporting. */
  windows?: number;
  /** A gap longer than this is a suspension (sleep, tab switch), not performance: ignored. */
  suspendMs?: number;
}

export class FrameGovernor {
  private readonly slowGapMs: number;
  private readonly warmupMs: number;
  private readonly windowMs: number;
  private readonly windows: number;
  private readonly suspendMs: number;
  private warm = 0;
  private winMs = 0;
  private winFrames = 0;
  private slowWindows = 0;

  constructor(opts: GovernorOptions = {}) {
    this.slowGapMs = opts.slowGapMs ?? 40;
    this.warmupMs = opts.warmupMs ?? 4000;
    this.windowMs = opts.windowMs ?? 1000;
    this.windows = opts.windows ?? 2;
    this.suspendMs = opts.suspendMs ?? 4000;
  }

  /**
   * Feed the time since the previous frame.
   * @returns true when quality should be lowered (the caller then calls reset()).
   */
  feed(gapMs: number, hidden = false): boolean {
    if (hidden) {
      this.clearWindow();
      this.slowWindows = 0;
      return false;
    }
    if (gapMs > this.suspendMs) return false;
    this.warm += gapMs;
    this.winMs += gapMs;
    this.winFrames += 1;
    if (this.winMs < this.windowMs) return false;

    const avgGap = this.winMs / this.winFrames;
    this.clearWindow();
    if (this.warm < this.warmupMs) return false;
    this.slowWindows = avgGap > this.slowGapMs ? this.slowWindows + 1 : 0;
    return this.slowWindows >= this.windows;
  }

  /** Start over (after quality changed, the new resolution deserves a fresh warm-up). */
  reset(): void {
    this.warm = 0;
    this.slowWindows = 0;
    this.clearWindow();
  }

  private clearWindow(): void {
    this.winMs = 0;
    this.winFrames = 0;
  }
}
