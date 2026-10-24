// The whole game with the keyboard alone (and what a screen reader user would hear).
import { checker, openPhone, waitPhase } from './harness.mjs';

export const name = 'keyboard-only play';

export async function run({ browser, url }) {
  const t = checker('keyboard');
  const { page, problems } = await openPhone(browser, url, '?test=1&force=common&species=snake');
  await page.click('#fac-hide');
  await page.evaluate(() => document.activeElement && document.activeElement.blur());
  await waitPhase(page, 'idle');

  await page.keyboard.press('Tab');
  t.eq(await page.evaluate(() => document.activeElement.id), 'pot-hit', 'first Tab stop is the sealed pot');
  t.ok(
    /Sealed pot number 1/.test(await page.evaluate(() => document.activeElement.getAttribute('aria-label'))),
    'the pot button explains itself to a screen reader',
  );
  for (let i = 0; i < 3; i++) {
    await page.keyboard.press('Enter');
    await new Promise((r) => setTimeout(r, 300));
  }
  await waitPhase(page, 'settled');
  await page.waitForSelector('#one-more:not([hidden])', { timeout: 5000 });
  t.eq(await page.evaluate(() => document.activeElement.id), 'one-more', 'focus moves to One more when the plant settles (keyboard users only)');
  t.ok((await page.evaluate(() => document.querySelector('#sr-live').textContent)).includes('Dracaena trifasciata'), 'the reveal is announced');

  await page.keyboard.press('Enter');
  await waitPhase(page, 'idle');
  t.eq(await page.evaluate(() => document.querySelector('#counter').textContent), 'Pot 2', 'One more starts pot 2');
  t.eq(await page.evaluate(() => document.activeElement.id), 'pot-hit', 'focus returns to the pot for the next round');
  t.ok(problems.length === 0, `console problems: ${problems.join(' | ')}`);
  await page.close();
  return t.failures;
}
