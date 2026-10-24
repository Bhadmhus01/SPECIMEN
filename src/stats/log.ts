import type { PlaytestEventInput, PlaytestPort } from '../ports';
import type { EventBody, PlaytestEvent, SessionInfo } from './types';

/**
 * The playtest log. Events are kept per participant, in localStorage, so a page reload never loses
 * a session and nothing ever leaves the device unless the facilitator copies or downloads it.
 * If storage is unavailable (private mode, quota) the log falls back to memory for this page load.
 */

const KEY_CURRENT = 'specimen.playtest.current.v1';
const KEY_COUNTER = 'specimen.playtest.counter.v1';
const KEY_INDEX = 'specimen.playtest.index.v1';
const KEY_DEVICE = 'specimen.playtest.device.v1';
const KEY_PERSON = (id: string): string => `specimen.playtest.p.${id}.v1`;

export interface LogOptions {
  /** Defaults to window.localStorage when available. Pass null to force memory-only. */
  storage?: Storage | null;
  now?: () => number;
  session: () => SessionInfo;
}

export function defaultStorage(): Storage | null {
  try {
    const s = window.localStorage;
    const probe = '__specimen_probe__';
    s.setItem(probe, '1');
    s.removeItem(probe);
    return s;
  } catch {
    return null;
  }
}

export class PlaytestLog implements PlaytestPort {
  private readonly storage: Storage | null;
  private readonly now: () => number;
  private readonly session: () => SessionInfo;
  private readonly memory = new Map<string, PlaytestEvent[]>();
  private current = '';
  private readonly device: string;
  private listeners: (() => void)[] = [];

  constructor(opts: LogOptions) {
    this.storage = opts.storage === undefined ? defaultStorage() : opts.storage;
    this.now = opts.now ?? Date.now;
    this.session = opts.session;
    this.device = this.read(KEY_DEVICE) ?? this.newDeviceId();
    this.write(KEY_DEVICE, this.device);
    const existing = this.read(KEY_CURRENT);
    if (existing && /^P\d+$/.test(existing)) {
      this.current = existing;
      this.append({ type: 'session_start', ...this.session() }); // a reload continues the same participant
    } else {
      this.current = this.allocate();
    }
  }

  get participant(): string {
    return this.current;
  }

  /** Subscribe to changes (the facilitator panel re-renders on them). */
  onChange(fn: () => void): void {
    this.listeners.push(fn);
  }

  /** Start a new participant: new id, fresh session record. */
  newParticipant(): string {
    this.current = this.allocate();
    this.emitChange();
    return this.current;
  }

  record(e: PlaytestEventInput): void {
    this.append(e);
  }

  /** The facilitator's recorded answer to "would you open another one?". */
  recordVerbal(answer: 'yes' | 'no'): void {
    this.append({ type: 'verbal', answer });
  }

  events(): PlaytestEvent[] {
    const out: PlaytestEvent[] = [];
    for (const id of this.participantIds()) out.push(...this.load(id));
    return out.sort((a, b) => a.t - b.t);
  }

  /** Events of the current participant only. */
  currentEvents(): PlaytestEvent[] {
    return this.load(this.current);
  }

  exportJSONL(): string {
    return this.events().map((e) => JSON.stringify(e)).join('\n') + (this.events().length > 0 ? '\n' : '');
  }

  clear(): void {
    for (const id of this.participantIds()) this.remove(KEY_PERSON(id));
    this.remove(KEY_INDEX);
    this.remove(KEY_COUNTER);
    this.remove(KEY_CURRENT);
    this.memory.clear();
    this.current = this.allocate();
    this.emitChange();
  }

  // ------------------------------------------------------------ internals

  private newDeviceId(): string {
    const bytes = new Uint8Array(4);
    try {
      crypto.getRandomValues(bytes);
    } catch {
      for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
    }
    return 'd' + Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  }

  private allocate(): string {
    const n = Number(this.read(KEY_COUNTER) ?? '0') + 1;
    this.write(KEY_COUNTER, String(n));
    const id = `P${String(n).padStart(3, '0')}`;
    this.current = id; // must point at the new participant before the first event is appended
    this.write(KEY_CURRENT, id);
    const ids = this.participantIds();
    if (!ids.includes(id)) this.write(KEY_INDEX, JSON.stringify([...ids, id]));
    this.append({ type: 'session_start', ...this.session() });
    return id;
  }

  private append(body: EventBody): void {
    const e = { ...body, t: this.now(), participant: this.current, device: this.device } as PlaytestEvent;
    const list = this.load(this.current);
    list.push(e);
    this.memory.set(this.current, list);
    this.write(KEY_PERSON(this.current), JSON.stringify(list));
    this.emitChange();
  }

  private participantIds(): string[] {
    const raw = this.read(KEY_INDEX);
    if (raw) {
      try {
        const ids: unknown = JSON.parse(raw);
        if (Array.isArray(ids)) return ids.filter((x): x is string => typeof x === 'string');
      } catch {
        /* fall through */
      }
    }
    return [...this.memory.keys()];
  }

  private load(id: string): PlaytestEvent[] {
    const raw = this.read(KEY_PERSON(id));
    if (raw) {
      try {
        const arr: unknown = JSON.parse(raw);
        if (Array.isArray(arr)) return arr as PlaytestEvent[];
      } catch {
        /* corrupt entry: fall back to memory */
      }
    }
    return [...(this.memory.get(id) ?? [])];
  }

  private read(key: string): string | null {
    try {
      return this.storage ? this.storage.getItem(key) : (this.mem.get(key) ?? null);
    } catch {
      return this.mem.get(key) ?? null;
    }
  }

  private write(key: string, value: string): void {
    this.mem.set(key, value);
    try {
      this.storage?.setItem(key, value);
    } catch {
      /* quota or blocked: the in-memory copy still serves this page load */
    }
  }

  private remove(key: string): void {
    this.mem.delete(key);
    try {
      this.storage?.removeItem(key);
    } catch {
      /* ignore */
    }
  }

  private readonly mem = new Map<string, string>();

  private emitChange(): void {
    for (const fn of this.listeners) fn();
  }
}
