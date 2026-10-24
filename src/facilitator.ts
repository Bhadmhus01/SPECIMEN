import type { PlaytestLog } from './stats/log';
import { summarize } from './stats/summary';

/**
 * The facilitator panel: a small control surface for whoever is running the playtest.
 * Shown with `?test=1` or by pressing Shift+T. It never appears for participants.
 */

const q = <T extends HTMLElement>(doc: Document, id: string): T => {
  const el = doc.getElementById(id);
  if (!el) throw new Error(`Missing #${id} in index.html`);
  return el as T;
};

const SESSION_FLAG = 'specimen.facilitator.visible';

export class Facilitator {
  private readonly doc: Document;
  private readonly log: PlaytestLog;
  private readonly panel: HTMLElement;
  private readonly msg: HTMLElement;
  private msgTimer = 0;

  constructor(doc: Document, log: PlaytestLog, opts: { visible: boolean }) {
    this.doc = doc;
    this.log = log;
    this.panel = q(doc, 'facilitator');
    this.msg = q(doc, 'fac-msg');

    // An explicit choice made earlier in this tab (Hide, Next participant, Shift+T, long-press) beats the URL default,
    // so a reload never shows the panel to a participant who was just handed the phone.
    let remembered: boolean | null = null;
    try {
      const v = window.sessionStorage.getItem(SESSION_FLAG);
      remembered = v === '1' ? true : v === '0' ? false : null;
    } catch {
      /* storage blocked */
    }
    this.setVisible(remembered ?? opts.visible);

    q(doc, 'fac-hide').addEventListener('click', () => this.setVisible(false));
    q(doc, 'fac-new').addEventListener('click', () => {
      this.log.newParticipant();
      this.setVisible(false); // ready to hand the phone to the next person
      window.location.reload(); // a clean game for them: pot 1, first-pot hint, fresh audio unlock
    });
    q(doc, 'fac-yes').addEventListener('click', () => this.verbal('yes'));
    q(doc, 'fac-no').addEventListener('click', () => this.verbal('no'));
    q(doc, 'fac-copy').addEventListener('click', () => void this.copy());
    q(doc, 'fac-download').addEventListener('click', () => this.download());
    q(doc, 'fac-reset').addEventListener('click', () => {
      if (window.confirm('Erase ALL logged playtest data on this device? This cannot be undone.')) {
        this.log.clear();
        this.say('Log erased.');
      }
    });
    // Phones have no keyboard: pressing and holding the wordmark for a second toggles the panel. The hold is judged by the
    // input events' own timestamps as well as a timer, so a busy main thread (a stalled frame, a slow phone) that delays the
    // timer cannot turn a real one-second hold into a missed gesture when the release arrives first.
    const HOLD_MS = 1000;
    const brand = doc.querySelector('.brand');
    let hold = 0;
    let downAt = -1;
    let fired = false;
    const cancel = (): void => {
      window.clearTimeout(hold);
      downAt = -1;
    };
    brand?.addEventListener('pointerdown', (e) => {
      cancel();
      downAt = e.timeStamp;
      fired = false;
      hold = window.setTimeout(() => {
        fired = true;
        this.toggle();
      }, HOLD_MS);
    });
    brand?.addEventListener('pointerup', (e) => {
      const heldLongEnough = downAt >= 0 && e.timeStamp - downAt >= HOLD_MS - 50;
      const alreadyToggled = fired;
      cancel();
      if (heldLongEnough && !alreadyToggled) this.toggle();
    });
    brand?.addEventListener('pointerleave', cancel);
    brand?.addEventListener('pointercancel', cancel);
    this.log.onChange(() => this.render());
    this.render();
  }

  toggle(): void {
    this.setVisible(this.panel.hidden !== false);
  }

  private setVisible(visible: boolean): void {
    this.panel.hidden = !visible;
    try {
      window.sessionStorage.setItem(SESSION_FLAG, visible ? '1' : '0');
    } catch {
      /* ignore */
    }
    if (visible) this.render();
  }

  private say(text: string): void {
    window.clearTimeout(this.msgTimer);
    this.msg.textContent = text;
    this.msgTimer = window.setTimeout(() => (this.msg.textContent = ''), 4000);
  }

  private verbal(answer: 'yes' | 'no'): void {
    this.log.recordVerbal(answer);
    this.say(`Recorded: ${answer}.`);
  }

  private render(): void {
    if (this.panel.hidden) return;
    const cur = this.log.currentEvents();
    q(this.doc, 'fac-pid').textContent = this.log.participant;
    q(this.doc, 'fac-pots').textContent = String(cur.filter((e) => e.type === 'settled').length);
    q(this.doc, 'fac-more').textContent = String(cur.filter((e) => e.type === 'one_more').length);
    const s = summarize(this.log.events());
    q(this.doc, 'fac-people').textContent = String(s.participants);
    q(this.doc, 'fac-rate').textContent = s.rate === null ? 'n/a' : `${s.wantedMore}/${s.participants} = ${(s.rate * 100).toFixed(0)}%`;
    q(this.doc, 'fac-verdict').textContent =
      s.verdict === 'INSUFFICIENT'
        ? `So far: not enough data (${s.participants} of ${s.minParticipants} minimum)`
        : `So far: ${s.verdict} (${s.confidence})`;
  }

  private async copy(): Promise<void> {
    const text = this.log.exportJSONL();
    try {
      await navigator.clipboard.writeText(text);
      this.say(`Copied ${text.trim().split('\n').length} events.`);
    } catch {
      // clipboard API unavailable or blocked (insecure origin, permissions): fall back to a hidden textarea
      const ta = this.doc.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      this.doc.body.append(ta);
      ta.select();
      let ok = false;
      try {
        ok = this.doc.execCommand('copy');
      } catch {
        ok = false;
      }
      ta.remove();
      this.say(ok ? 'Copied.' : 'Copy failed: use Download instead.');
    }
  }

  private download(): void {
    const text = this.log.exportJSONL();
    const blob = new Blob([text], { type: 'application/x-ndjson' });
    const url = URL.createObjectURL(blob);
    const a = this.doc.createElement('a');
    const d = new Date();
    const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}-${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}`;
    a.href = url;
    a.download = `specimen-playtest-${stamp}.jsonl`;
    this.doc.body.append(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    this.say('Downloaded.');
  }
}
