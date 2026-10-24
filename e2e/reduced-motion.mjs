// prefers-reduced-motion must really calm the reveal: smaller flash, almost no shake, and it must still complete.
import { checker } from './harness.mjs';

export const name = 'reduced motion';

async function measure(browser, url, motion) {
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1, hasTouch: true, isMobile: true });
  await page.goto(`${url}/?manual=1&force=grail&species=monstera&seed=1&motion=${motion}`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__specimen, { timeout: 30000 });
  const result = await page.evaluate(async () => {
    const s = window.__specimen;
    const g = s.game;
    let maxFlash = 0;
    let maxShake = 0;
    const advance = async (sec) => {
      for (let i = 0; i < Math.round(sec * 60); i++) {
        g.step(1 / 60);
        maxFlash = Math.max(maxFlash, g.scene.flash);
        const o = g.scene.shakeOffset();
        maxShake = Math.max(maxShake, Math.abs(o.x), Math.abs(o.y));
        await new Promise((r) => setTimeout(r, 0));
      }
    };
    await advance(0.9);
    for (let i = 0; i < 3; i++) {
      s.tap();
      await advance(0.3);
    }
    await advance(3.5);
    return { maxFlash, maxShake, phase: g.reveal.phase };
  });
  await page.close();
  return result;
}

export async function run({ browser, url }) {
  const t = checker('reduced-motion');
  const calm = await measure(browser, url, 'reduce');
  const full = await measure(browser, url, 'full');
  t.eq(calm.phase, 'settled', 'the calm reveal still completes');
  t.ok(calm.maxFlash < 0.4, `flash is gentle (peak ${calm.maxFlash.toFixed(2)})`);
  t.ok(calm.maxShake < 3, `screen shake is nearly gone (peak ${calm.maxShake.toFixed(1)} px)`);
  t.ok(full.maxFlash > 0.8, `the full reveal has a real flash (peak ${full.maxFlash.toFixed(2)}), so the comparison is meaningful`);
  t.ok(full.maxShake > 4, `the full reveal shakes (peak ${full.maxShake.toFixed(1)} px)`);
  return t.failures;
}
