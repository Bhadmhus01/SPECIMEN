import { AudioEngine } from './audio';
import { Facilitator } from './facilitator';
import { Game } from './game';
import { isDebugRun, parseParams } from './params';
import { LocalRollSource } from './roll';
import { cryptoRng, mulberry32 } from './rng';
import { PlaytestLog } from './stats/log';
import { DomUi } from './ui';
import { BUILD } from './version';

const params = parseParams(location.search);
const debug = isDebugRun(params);
const reducedMotion =
  params.motion === 'reduce' || (params.motion === 'auto' && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

// ---- sound: starts muted only if the player (or the URL) said so; the choice persists
const MUTE_KEY = 'specimen.muted';
const storedMute = (() => {
  try {
    return window.localStorage.getItem(MUTE_KEY) === '1';
  } catch {
    return false;
  }
})();
const audio = new AudioEngine({ muted: !params.sound || storedMute });

// iOS: let WebAudio play even with the ringer switch on silent (Safari 17+; harmless elsewhere)
try {
  const session = (navigator as unknown as { audioSession?: { type: string } }).audioSession;
  if (session) session.type = 'playback';
} catch {
  /* not supported */
}

// Browsers only start audio after a user gesture. Touch counts on release, not on press, so listen for all of them.
for (const type of ['pointerdown', 'pointerup', 'touchend', 'click', 'keydown'] as const) {
  window.addEventListener(type, () => audio.unlock(), { passive: true });
}
document.addEventListener('visibilitychange', () => (document.hidden ? audio.suspend() : audio.resume()));

// ---- the roll: on this device for Phase 0 (a feel test, not tamper-proof). Phase 2 swaps in a server-backed source.
const source = new LocalRollSource(params.seed !== undefined ? mulberry32(params.seed) : cryptoRng(), {
  forceTier: params.force,
  forceSpecies: params.species,
});

const log = new PlaytestLog({
  session: () => ({
    build: BUILD,
    ua: navigator.userAgent.slice(0, 120),
    viewport: `${window.innerWidth}x${window.innerHeight}`,
    dpr: window.devicePixelRatio || 1,
    reducedMotion,
    sound: !audio.isMuted,
    debug,
  }),
});

const ui = new DomUi({
  doc: document,
  initiallyMuted: audio.isMuted,
  rollNote: debug
    ? 'Debug run: rarity or species is forced or seeded from the URL, and this run is excluded from playtest results.'
    : 'In this prototype each pot is rolled on your device the moment it drops, which is fine for a feel test but not tamper-proof. The full game rolls on a server.',
  onToggleSound(muted) {
    audio.setMuted(muted);
    try {
      window.localStorage.setItem(MUTE_KEY, muted ? '1' : '0');
    } catch {
      /* ignore */
    }
  },
});

const canvas = document.getElementById('stage') as HTMLCanvasElement;
const game = new Game({ canvas, source, audio, ui, log, reducedMotion, manual: params.manual });
const facilitator = new Facilitator(document, log, { visible: params.test });

function layout(): void {
  game.resize();
  ui.setLayout(game.scene.layoutInfo);
}

// ---- input. Pointer-down for instant response; the click handler only serves keyboard and assistive tech (detail === 0).
const hit = document.getElementById('pot-hit') as HTMLButtonElement;
hit.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  game.tap();
});
hit.addEventListener('click', (e) => {
  if (e.detail === 0) game.tap();
});
ui.oneMoreButton.addEventListener('click', () => game.oneMore());

document.addEventListener('keydown', (e) => {
  if (e.shiftKey && e.key.toLowerCase() === 't') {
    facilitator.toggle();
    return;
  }
  // when nothing is focused (Safari does not focus buttons on click), Space or Enter still plays
  if ((e.key === ' ' || e.key === 'Enter') && e.target === document.body) {
    e.preventDefault();
    if (game.reveal.phase === 'settled') game.oneMore();
    else game.tap();
  }
});

let resizeQueued = false;
const onResize = (): void => {
  if (resizeQueued) return;
  resizeQueued = true;
  requestAnimationFrame(() => {
    resizeQueued = false;
    layout();
  });
};
window.addEventListener('resize', onResize);
window.visualViewport?.addEventListener('resize', onResize);

// ---- test hooks: only with ?test=1 or ?manual=1
if (params.test || params.manual) {
  const w = window as unknown as { __specimen: unknown };
  w.__specimen = {
    game,
    audio,
    log,
    tap: () => game.tap(),
    oneMore: () => game.oneMore(),
    /** Advance time in 60 Hz frames, letting promises settle between them. */
    async advance(seconds: number, hz = 60) {
      const n = Math.max(1, Math.round(seconds * hz));
      for (let i = 0; i < n; i++) {
        game.step(1 / hz);
        await new Promise((r) => setTimeout(r, 0));
      }
    },
  };
}

game.start();
ui.setLayout(game.scene.layoutInfo);
