// `npm run shots -- grail monstera`: deterministic screenshots of the key moments of a reveal, for art and feel review.
// Runs on a manual clock, so every frame is reproducible. Output goes to e2e-out/ (not committed).
import { mkdirSync } from 'node:fs';
import { launchBrowser, startServer } from './harness.mjs';

const [tier = 'grail', species = 'monstera', seed = '5', width = '390', height = '844'] = process.argv.slice(2);
const dir = 'e2e-out';
mkdirSync(dir, { recursive: true });

const server = await startServer();
const browser = await launchBrowser();
try {
  const page = await browser.newPage();
  await page.setViewport({ width: +width, height: +height, deviceScaleFactor: 2, hasTouch: +width < 700, isMobile: +width < 700 });
  await page.goto(`${server.url}/?manual=1&force=${tier}&species=${species}&seed=${seed}`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__specimen, { timeout: 30000 });
  const adv = (s) => page.evaluate((s) => window.__specimen.advance(s), s);
  const tap = () => page.evaluate(() => window.__specimen.tap());
  const shot = (n, label) => page.screenshot({ path: `${dir}/${tier}-${species}-${n}-${label}.png` });
  await adv(0.3); await shot('01', 'drop');
  await adv(0.5); await shot('02', 'sealed');
  await tap(); await adv(0.18); await shot('03', 'crack1');
  await adv(0.15); await tap(); await adv(0.18); await shot('04', 'crack2');
  await adv(0.15); await tap(); await adv(0.05); await shot('05', 'hitstop');
  await adv(0.12); await shot('06', 'burst');
  await adv(0.18); await shot('07', 'burst-late');
  await adv(0.5); await shot('08', 'growing');
  await adv(0.6); await shot('09', 'fanfare');
  await adv(1.6); await shot('10', 'settled');
  console.log(`wrote 10 frames to ${dir}/ for ${tier} ${species}`);
} finally {
  await browser.close();
  await server.close();
}
