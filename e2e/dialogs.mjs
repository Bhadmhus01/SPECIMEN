// The odds dialog, the AI/data disclosures, and the facilitator panel.
import { checker, clickSel, openPhone } from './harness.mjs';

/** These import source modules (/src/...), which only the dev server serves. */
export const needsDevServer = true;

export const name = 'odds dialog, disclosures, facilitator panel';

export async function run({ browser, url }) {
  const t = checker('dialogs');
  const { page, problems } = await openPhone(browser, url, '?test=1&force=common');
  page.on('dialog', (d) => d.accept()); // the "erase log" confirm

  // ---- odds dialog
  await clickSel(page, '#fac-hide');
  await clickSel(page, '#odds-btn');
  const odds = await page.evaluate(async () => {
    const { TIERS } = await import('/src/config.ts');
    const dlg = document.getElementById('odds-dialog');
    const rows = [...document.querySelectorAll('#odds-table tr')].slice(1).map((tr) => [...tr.children].map((c) => c.textContent.trim()));
    return {
      open: dlg.open,
      shown: rows.map(([name, pct]) => ({ name: name.replace(/[●○\s]+$/u, '').trim(), pct: parseFloat(pct) })),
      expected: TIERS.map((x) => ({ name: x.label, pct: x.odds })),
      text: dlg.textContent,
    };
  });
  t.ok(odds.open, 'the dialog opens');
  t.eq(odds.shown, odds.expected, 'the odds table shows exactly the configured odds');
  t.eq(odds.shown.reduce((a, r) => a + r.pct, 0), 100, 'published odds sum to 100%');
  t.ok(/no generative-AI/i.test(odds.text) && /AI assistance/i.test(odds.text), 'the AI-use disclosure is present (a standing product decision)');
  t.ok(/cash(ed)? out/i.test(odds.text), 'the no-cash-out statement is present');
  t.ok(/never leaves this device/i.test(odds.text), 'the data-collection statement is present');
  await page.keyboard.press('Escape');
  t.ok(!(await page.evaluate(() => document.getElementById('odds-dialog').open)), 'Escape closes the dialog');

  // ---- facilitator panel (Shift+T toggles it)
  t.ok(await page.evaluate(() => document.getElementById('facilitator').hidden), 'panel is hidden after "Hide"');
  await page.keyboard.down('Shift');
  await page.keyboard.press('KeyT');
  await page.keyboard.up('Shift');
  t.ok(!(await page.evaluate(() => document.getElementById('facilitator').hidden)), 'Shift+T shows the panel');
  t.eq(await page.evaluate(() => document.getElementById('fac-pid').textContent), 'P001', 'first participant is P001');

  await clickSel(page, '#fac-yes');
  const verbal = await page.evaluate(() => window.__specimen.log.events().filter((e) => e.type === 'verbal').map((e) => e.answer));
  t.eq(verbal, ['yes'], 'the verbal answer is logged');

  await Promise.all([page.waitForNavigation({ waitUntil: 'load' }), clickSel(page, '#fac-new')]);
  await page.waitForFunction(() => window.__specimen, { timeout: 30000 });
  const after = await page.evaluate(() => ({
    pid: window.__specimen.log.participant,
    people: [...new Set(window.__specimen.log.events().map((e) => e.participant))],
    panelVisible: !document.getElementById('facilitator').hidden,
  }));
  t.eq(after.pid, 'P002', '"Next participant" moves on to P002 after the reload');
  t.eq(after.people, ['P001', 'P002'], 'P001 history survives the reload');
  t.ok(!after.panelVisible, 'after "Next participant" the panel is hidden, so the next person is handed a clean game');

  // the facilitator brings it back by pressing and holding the wordmark (phones have no Shift key)
  const brand = await (await page.$('.brand')).boundingBox();
  await page.mouse.move(brand.x + brand.width / 2, brand.y + brand.height / 2);
  await page.mouse.down();
  await new Promise((r) => setTimeout(r, 1200));
  await page.mouse.up();
  t.ok(!(await page.evaluate(() => document.getElementById('facilitator').hidden)), 'pressing and holding the wordmark opens the panel');
  await page.mouse.move(brand.x + brand.width / 2, brand.y + brand.height / 2);
  await page.mouse.down();
  await new Promise((r) => setTimeout(r, 300));
  await page.mouse.up();
  t.ok(!(await page.evaluate(() => document.getElementById('facilitator').hidden)), 'a quick tap on the wordmark does nothing (no accidental toggling)');

  await clickSel(page, '#fac-reset');
  const erased = await page.evaluate(() => ({ pid: window.__specimen.log.participant, n: window.__specimen.log.events().length }));
  t.eq(erased, { pid: 'P001', n: 1 }, '"Erase log" starts over at P001');

  // a normal (non-debug) visit must not show the panel and must not expose the test hooks
  const plain = await browser.newPage();
  await plain.goto(url + '/', { waitUntil: 'load' });
  await plain.waitForSelector('#pot-hit');
  const exposed = await plain.evaluate(() => ({ hooks: '__specimen' in window, panel: !document.getElementById('facilitator').hidden }));
  t.eq(exposed, { hooks: false, panel: false }, 'participants see no panel and no test hooks');
  await plain.close();

  t.ok(problems.length === 0, `console problems: ${problems.join(' | ')}`);
  await page.close();
  return t.failures;
}
