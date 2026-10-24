import { FORM_LABEL, SPECIES, SPECIES_BY_ID, TIERS, TIER_BY_ID } from './config';
import type { UiPort } from './ports';
import type { RollResult } from './roll';

export interface UiOptions {
  doc: Document;
  /** Explains where the roll happens in this build, shown in the info dialog. */
  rollNote: string;
  /** Called when the player flips the sound button. */
  onToggleSound(muted: boolean): void;
  initiallyMuted: boolean;
}

const q = <T extends HTMLElement>(doc: Document, id: string): T => {
  const el = doc.getElementById(id);
  if (!el) throw new Error(`Missing #${id} in index.html`);
  return el as T;
};

/**
 * The DOM half of the game: HUD, specimen tag, "One more", hints, the odds dialog.
 * It reacts to cues from the Game and never decides anything itself.
 */
export class DomUi implements UiPort {
  private readonly doc: Document;
  private readonly el: {
    app: HTMLElement;
    pot: HTMLButtonElement;
    live: HTMLElement;
    counter: HTMLElement;
    hint: HTMLElement;
    tag: HTMLElement;
    no: HTMLElement;
    tier: HTMLElement;
    pips: HTMLElement;
    latin: HTMLElement;
    common: HTMLElement;
    form: HTMLElement;
    more: HTMLButtonElement;
    toast: HTMLElement;
    sound: HTMLButtonElement;
    soundOn: Element;
    soundOff: Element;
    odds: HTMLButtonElement;
    dialog: HTMLDialogElement;
  };
  private hintTimer = 0;
  private toastTimer = 0;
  private tagTimer = 0;
  private muted: boolean;
  private tapsThisPot = 0;
  /**
   * True once the player has used the keyboard (and not the pointer since). We only move focus
   * programmatically for them: for touch and mouse players a focus ring would be noise.
   */
  private keyboardUser = false;

  constructor(opts: UiOptions) {
    const d = opts.doc;
    this.doc = d;
    this.muted = opts.initiallyMuted;
    this.el = {
      app: q(d, 'app'),
      pot: q(d, 'pot-hit'),
      live: q(d, 'sr-live'),
      counter: q(d, 'counter'),
      hint: q(d, 'hint'),
      tag: q(d, 'tag'),
      no: q(d, 'tag-no'),
      tier: q(d, 'tag-tier'),
      pips: q(d, 'tag-pips'),
      latin: q(d, 'tag-latin'),
      common: q(d, 'tag-common'),
      form: q(d, 'tag-form'),
      more: q(d, 'one-more'),
      toast: q(d, 'toast'),
      sound: q(d, 'sound-btn'),
      soundOn: q(d, 'icon-sound-on'),
      soundOff: q(d, 'icon-sound-off'),
      odds: q(d, 'odds-btn'),
      dialog: q(d, 'odds-dialog'),
    };
    d.addEventListener('keydown', (e) => {
      if (e.key !== 'Shift' && e.key !== 'Control' && e.key !== 'Alt' && e.key !== 'Meta') this.keyboardUser = true;
    });
    d.addEventListener('pointerdown', () => (this.keyboardUser = false), { passive: true });
    this.buildOdds(opts.rollNote);
    this.paintSound();
    this.el.sound.addEventListener('click', () => {
      this.muted = !this.muted;
      this.paintSound();
      opts.onToggleSound(this.muted);
    });
    this.el.odds.addEventListener('click', () => {
      if (typeof this.el.dialog.showModal === 'function') this.el.dialog.showModal();
      else this.el.dialog.setAttribute('open', '');
    });
  }

  /** Pass the scene's layout to CSS: the bottom strip for the tag and button, and where a side tag starts in wide windows. */
  setLayout(l: { reserveBottom: number; plantHalf: number }): void {
    this.el.app.style.setProperty('--reserve', `${Math.round(l.reserveBottom)}px`);
    this.el.app.style.setProperty('--plant-half', `${Math.round(l.plantHalf)}px`);
  }

  get oneMoreButton(): HTMLButtonElement {
    return this.el.more;
  }

  // ------------------------------------------------------------ UiPort

  onDrop(index: number): void {
    this.tapsThisPot = 0;
    window.clearTimeout(this.hintTimer);
    this.el.hint.hidden = true;
    this.el.counter.textContent = `Pot ${index}`;
    this.hideTag();
    this.hideOneMore();
    this.el.pot.setAttribute('aria-label', `Pot number ${index} is falling into place.`);
  }

  onReady(index: number): void {
    this.el.pot.setAttribute('aria-label', `Sealed pot number ${index}. Tap it to crack it open.`);
    // The first pot gets an immediate hint; later pots only get a nudge if the player hesitates.
    window.clearTimeout(this.hintTimer);
    const delay = index === 1 ? 250 : 4500;
    this.hintTimer = window.setTimeout(() => {
      if (this.tapsThisPot === 0) this.el.hint.hidden = false;
    }, delay);
    // keyboard users: put focus back on the pot after "One more" disappeared with it
    const active = this.doc.activeElement;
    if (this.keyboardUser && (!active || active === this.doc.body)) this.el.pot.focus({ preventScroll: true });
  }

  onTap(): void {
    this.tapsThisPot += 1;
    window.clearTimeout(this.hintTimer);
    this.el.hint.hidden = true;
    this.el.pot.setAttribute('aria-label', 'Cracking. Keep tapping.');
  }

  showTag(result: RollResult, index: number): void {
    const tier = TIER_BY_ID[result.tier];
    const species = SPECIES_BY_ID[result.species];
    window.clearTimeout(this.tagTimer);
    this.el.tag.style.setProperty('--tier', tier.color);
    this.el.no.textContent = `No. ${index}`;
    this.el.tier.textContent = tier.label;
    this.el.latin.textContent = species.latin;
    this.el.common.textContent = species.common;
    this.el.form.textContent = FORM_LABEL[result.form];
    this.el.pips.replaceChildren(
      ...Array.from({ length: 4 }, (_, i) => {
        const pip = this.doc.createElement('span');
        pip.className = i < tier.pips ? 'pip on' : 'pip';
        return pip;
      }),
    );
    this.el.tag.hidden = false;
    this.el.tag.classList.remove('hide');
    // restart the entrance animation even if a previous tag was just shown
    this.el.tag.classList.remove('show');
    void this.el.tag.offsetWidth;
    this.el.tag.classList.add('show');
    this.el.live.textContent = `${tier.label}, ${tier.pips} of 4. ${species.latin}, ${FORM_LABEL[result.form]}. Specimen number ${index}.`;
    this.el.pot.setAttribute('aria-label', `Pot number ${index} is open: a ${tier.label} ${species.common}. Tap the plant to make its leaves flutter.`);
  }

  showOneMore(): void {
    this.el.more.hidden = false;
    this.el.more.classList.remove('show');
    void this.el.more.offsetWidth;
    this.el.more.classList.add('show');
    const active = this.doc.activeElement;
    if (this.keyboardUser && (!active || active === this.doc.body || active === this.el.pot)) this.el.more.focus({ preventScroll: true });
  }

  onLeave(): void {
    this.hideTag();
    this.hideOneMore();
    this.el.live.textContent = '';
  }

  toast(message: string): void {
    window.clearTimeout(this.toastTimer);
    this.el.toast.textContent = message;
    this.el.toast.hidden = false;
    this.toastTimer = window.setTimeout(() => {
      this.el.toast.hidden = true;
    }, 2600);
  }

  // ------------------------------------------------------------ internals

  private hideTag(): void {
    if (this.el.tag.hidden) return;
    this.el.tag.classList.remove('show');
    this.el.tag.classList.add('hide');
    window.clearTimeout(this.tagTimer);
    this.tagTimer = window.setTimeout(() => {
      this.el.tag.hidden = true;
      this.el.tag.classList.remove('hide');
    }, 300);
  }

  private hideOneMore(): void {
    this.el.more.hidden = true;
    this.el.more.classList.remove('show');
  }

  private paintSound(): void {
    this.el.sound.setAttribute('aria-pressed', String(!this.muted));
    this.el.sound.setAttribute('aria-label', this.muted ? 'Sound off. Turn sound on.' : 'Sound on. Turn sound off.');
    (this.el.soundOn as HTMLElement).hidden = this.muted;
    (this.el.soundOff as HTMLElement).hidden = !this.muted;
  }

  /** The odds table is generated from config.ts, so what players read can never drift from what the game does. */
  private buildOdds(rollNote: string): void {
    const d = this.doc;
    const table = q<HTMLTableElement>(d, 'odds-table');
    const head = d.createElement('tr');
    for (const text of ['Rarity', 'Chance per pot']) {
      const th = d.createElement('th');
      th.scope = 'col';
      th.textContent = text;
      head.append(th);
    }
    const rows = TIERS.map((t) => {
      const tr = d.createElement('tr');
      const name = d.createElement('td');
      const swatch = d.createElement('span');
      swatch.className = 'swatch';
      swatch.style.background = t.color;
      name.append(swatch, d.createTextNode(`${t.label}  ${'●'.repeat(t.pips)}${'○'.repeat(4 - t.pips)}`));
      const pct = d.createElement('td');
      pct.textContent = `${t.odds}%`;
      tr.append(name, pct);
      return tr;
    });
    table.append(head, ...rows);
    q(d, 'odds-species').textContent = `Each pot also picks one of ${SPECIES.length} plants (${SPECIES.map((s) => s.common.toLowerCase()).join(', ')}) with equal chance, whatever its rarity.`;
    q(d, 'odds-source').textContent = rollNote;
  }
}
