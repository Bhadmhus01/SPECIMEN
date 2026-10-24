/**
 * The playtest log: one small JSON object per event, one participant per `participant` id.
 * Kept deliberately tiny and anonymous: no names, no free text from participants, no network.
 */

export interface SessionInfo {
  build: string;
  /** Short user-agent string, to tell phones from laptops when reading results. */
  ua: string;
  viewport: string;
  dpr: number;
  reducedMotion: boolean;
  sound: boolean;
  /** True when the roll sequence was forced or seeded: such a participant is excluded from results. */
  debug: boolean;
}

export type EventBody =
  | ({ type: 'session_start' } & SessionInfo)
  | { type: 'pot_drop'; index: number }
  | { type: 'pot_ready'; index: number }
  | { type: 'tap'; index: number; n: number }
  | { type: 'reveal'; index: number; species: string; tier: string; form: string; msToOpen: number }
  | { type: 'settled'; index: number }
  | { type: 'one_more'; index: number; msSinceSettled: number }
  | { type: 'boop'; index: number }
  | { type: 'quality_drop'; scale: number }
  /** The facilitator's answer to "would you open another one?", recorded after the session. */
  | { type: 'verbal'; answer: 'yes' | 'no' };

export type PlaytestEvent = EventBody & {
  /** Epoch milliseconds. */
  t: number;
  /** Per-device counter: P001, P002... Only unique within one device. */
  participant: string;
  /**
   * Random id of the browser profile that produced the event. Together with `participant` it
   * identifies a person across devices, so exports from many phones can be merged safely.
   */
  device?: string;
};
