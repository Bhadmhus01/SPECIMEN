import { describe, expect, it } from 'vitest';
import { DESIGN, PLINTH_DEPTH, computeLayout } from '../src/scene/layout';

// phones (portrait and landscape), small and large tablets, laptops, a desktop, and some awkward shapes
const SCREENS: [number, number][] = [
  [320, 568], [360, 640], [375, 667], [390, 844], [412, 915], [430, 932],
  [568, 320], [667, 375], [844, 390], [915, 412],
  [768, 1024], [1024, 768], [820, 1180],
  [1280, 720], [1366, 768], [1440, 900], [1920, 1080], [2560, 1440],
  [500, 500], [300, 900], [900, 300],
];

describe('computeLayout', () => {
  it.each(SCREENS)('%i x %i: everything fits and nothing collides with the reserved strips', (w, h) => {
    const l = computeLayout(w, h, 2);
    expect(l.s).toBeGreaterThan(0);
    expect(l.cx).toBe(w / 2);
    // the plant (and the pot) sit inside the free area: below the HUD...
    expect(l.floorY - DESIGN.h * l.s).toBeGreaterThanOrEqual(l.top - 0.5);
    // ...the plinth ends above the strip kept for the tag and button...
    expect(l.floorY + PLINTH_DEPTH * l.s).toBeLessThanOrEqual(h - l.reserveBottom + 0.5);
    // ...and the plant fits across the screen
    expect(DESIGN.w * l.s).toBeLessThanOrEqual(w + 0.5);
  });

  it('puts the tag under the plant on tall screens and beside it on wide ones', () => {
    expect(computeLayout(390, 844, 2).landscape).toBe(false);
    expect(computeLayout(768, 1024, 2).landscape).toBe(false);
    expect(computeLayout(1280, 720, 2).landscape).toBe(true);
    expect(computeLayout(844, 390, 2).landscape).toBe(true);
  });

  it('leaves a tall strip for the tag and button in portrait but only the button in landscape', () => {
    expect(computeLayout(390, 844, 2).reserveBottom).toBeGreaterThanOrEqual(224);
    expect(computeLayout(1280, 720, 2).reserveBottom).toBeLessThan(130);
  });

  it('keeps the side tag on screen in landscape: it starts right of the plant and has room to its right', () => {
    for (const [w, h] of SCREENS.filter(([a, b]) => a >= b * 1.2)) {
      const l = computeLayout(w, h, 2);
      const tagLeft = w / 2 + l.plantHalf + 28;
      const tagWidth = Math.min(320, w / 2 - l.plantHalf - 44); // mirrors the CSS
      expect(tagWidth, `${w}x${h}`).toBeGreaterThan(120);
      expect(tagLeft + tagWidth, `${w}x${h}`).toBeLessThanOrEqual(w);
    }
  });

  it('scales the whole scene smoothly with the screen: a bigger screen never gets a smaller plant', () => {
    let prev = 0;
    for (const h of [600, 700, 800, 900, 1000, 1200]) {
      const s = computeLayout(Math.round(h * 0.6), h, 2).s;
      expect(s).toBeGreaterThanOrEqual(prev);
      prev = s;
    }
  });
});
