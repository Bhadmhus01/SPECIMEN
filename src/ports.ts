import type { TierDef } from './config';
import type { RollResult } from './roll';

/**
 * What the game needs from sound, the DOM and the playtest log. The Game talks only to these
 * interfaces, so each side can be built, swapped and tested on its own.
 */

export interface AudioPort {
  /** Called on the first user gesture: browsers only allow audio after one. */
  unlock(): void;
  drop(): void;
  land(): void;
  crack(stage: number): void;
  burst(tier: TierDef): void;
  /** `leafTimes` are seconds after the sprout starts at which each leaf pops. */
  sprout(tier: TierDef, leafTimes: readonly number[]): void;
  fanfare(tier: TierDef): void;
  tag(): void;
  leave(): void;
}

export interface UiPort {
  onDrop(index: number): void;
  onReady(index: number): void;
  onTap(): void;
  showTag(result: RollResult, index: number): void;
  showOneMore(): void;
  onLeave(): void;
  toast(message: string): void;
}

export type PlaytestEventInput =
  | { type: 'pot_drop'; index: number }
  | { type: 'pot_ready'; index: number }
  | { type: 'tap'; index: number; n: number }
  | { type: 'reveal'; index: number; species: string; tier: string; form: string; msToOpen: number }
  | { type: 'settled'; index: number }
  | { type: 'one_more'; index: number; msSinceSettled: number }
  | { type: 'boop'; index: number }
  /** The device was too slow, so the canvas resolution was lowered. `scale` is the new effective pixel ratio. */
  | { type: 'quality_drop'; scale: number };

export interface PlaytestPort {
  record(event: PlaytestEventInput): void;
}

export const nullAudio: AudioPort = {
  unlock() {},
  drop() {},
  land() {},
  crack() {},
  burst() {},
  sprout() {},
  fanfare() {},
  tag() {},
  leave() {},
};

export const nullUi: UiPort = {
  onDrop() {},
  onReady() {},
  onTap() {},
  showTag() {},
  showOneMore() {},
  onLeave() {},
  toast() {},
};

export const nullLog: PlaytestPort = { record() {} };
