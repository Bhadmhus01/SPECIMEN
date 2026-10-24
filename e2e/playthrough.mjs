// A real-touch playthrough of two pots on a phone-sized screen.
import { checker, openPhone, tapPot, waitPhase } from './harness.mjs';

export const name = 'touch playthrough (2 pots)';

export async function run({ browser, url }) {
  const t = checker('playthrough');
  const { page, problems } = await openPhone(browser, url, '?test=1&force=rare&species=pilea');
  await page.click('#fac-hide'); // the participant's view: no facilitator panel

  for (const pot of [1, 2]) {
    await waitPhase(page, 'idle');
    for (let i = 0; i < 3; i++) {
      await tapPot(page);
      await new Promise((r) => setTimeout(r, 260));
    }
    await waitPhase(page, 'settled');
    await page.waitForSelector('#one-more:not([hidden])', { timeout: 5000 });
    await new Promise((r) => setTimeout(r, 1000)); // let the tag and button finish sliding in before measuring their boxes

    const ui = await page.evaluate(() => {
      const r = (sel) => document.querySelector(sel).getBoundingClientRect();
      const tag = r('#tag');
      const btn = r('#one-more');
      return {
        counter: document.querySelector('#counter').textContent,
        no: document.querySelector('#tag-no').textContent,
        tier: document.querySelector('#tag-tier').textContent,
        latin: document.querySelector('#tag-latin').textContent,
        form: document.querySelector('#tag-form').textContent,
        pips: document.querySelectorAll('#tag-pips .pip.on').length,
        live: document.querySelector('#sr-live').textContent,
        focusIsBody: document.activeElement === document.body,
        tagAboveButton: tag.bottom <= btn.top + 2,
        buttonOnScreen: btn.bottom <= innerHeight && btn.left >= 0 && btn.right <= innerWidth,
        tagOnScreen: tag.left >= 0 && tag.right <= innerWidth && tag.top >= 0,
      };
    });
    t.eq(ui.counter, `Pot ${pot}`, `pot ${pot}: HUD counter`);
    t.eq(ui.no, `No. ${pot}`, `pot ${pot}: specimen number`);
    t.eq(ui.tier, 'Rare', `pot ${pot}: tier on the tag`);
    t.eq(ui.latin, 'Pilea peperomioides', `pot ${pot}: species on the tag`);
    t.eq(ui.form, 'Half-moon variegation', `pot ${pot}: form on the tag`);
    t.eq(ui.pips, 3, `pot ${pot}: rarity pips`);
    t.ok(ui.live.includes('Rare, 3 of 4') && ui.live.includes(`Specimen number ${pot}`), `pot ${pot}: screen-reader announcement (${ui.live})`);
    t.ok(ui.focusIsBody, `pot ${pot}: touch players must not get a focus ring (focus moved to something)`);
    t.ok(ui.tagAboveButton, `pot ${pot}: the tag overlaps the One more button`);
    t.ok(ui.buttonOnScreen && ui.tagOnScreen, `pot ${pot}: tag and button fit on a 390x844 screen`);

    if (pot === 1) {
      const b = await (await page.$('#one-more')).boundingBox();
      await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2);
    }
  }

  const counts = await page.evaluate(() => {
    const c = {};
    for (const e of window.__specimen.log.events()) c[e.type] = (c[e.type] || 0) + 1;
    return { c, debug: window.__specimen.log.events().find((e) => e.type === 'session_start').debug };
  });
  t.eq(counts.c.pot_drop, 2, 'pot_drop events');
  t.eq(counts.c.tap, 6, 'tap events');
  t.eq(counts.c.reveal, 2, 'reveal events');
  t.eq(counts.c.settled, 2, 'settled events');
  t.eq(counts.c.one_more, 1, 'one_more events');
  t.ok(counts.debug === true, 'a forced run must be flagged as a debug session so it is excluded from results');
  t.ok(problems.length === 0, `console problems: ${problems.join(' | ')}`);
  await page.close();
  return t.failures;
}
