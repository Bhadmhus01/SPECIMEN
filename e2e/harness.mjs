// Shared plumbing for the browser checks: start the app, find a Chrome, collect console problems.
import { existsSync } from 'node:fs';
import puppeteer from 'puppeteer-core';

const CANDIDATES = [
  process.env.CHROME_PATH,
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
].filter(Boolean);

/**
 * Launch headless Chrome. Order: $CHROME_PATH, a system Chrome/Chromium, then the optional
 * `@sparticuz/chromium` package (what sandboxes without a browser use: `npm i --no-save @sparticuz/chromium`).
 */
export async function launchBrowser() {
  const common = ['--disable-dev-shm-usage', '--autoplay-policy=no-user-gesture-required'];
  if (process.env.E2E_NO_SANDBOX || process.env.CI) common.push('--no-sandbox');
  const found = CANDIDATES.find((p) => existsSync(p));
  if (found) return puppeteer.launch({ executablePath: found, headless: true, args: common });

  try {
    const { default: chromium, inflate, setupLambdaEnvironment } = await import('@sparticuz/chromium');
    const path = await import('node:path');
    const libDir = '/tmp/al2023/lib';
    if (!existsSync(libDir)) await inflate(path.join(process.cwd(), 'node_modules', '@sparticuz', 'chromium', 'bin', 'al2023.tar.br'));
    setupLambdaEnvironment(libDir);
    const exe = await chromium.executablePath();
    const args = chromium.args.filter((a) => !['--single-process', '--no-zygote'].includes(a));
    return puppeteer.launch({ executablePath: exe, headless: 'shell', args: [...args, '--no-sandbox', ...common] });
  } catch {
    throw new Error(
      'No Chrome found. Install Google Chrome or Chromium, or set CHROME_PATH to its executable.\n' +
        '(Sandboxes without a browser can use: npm i --no-save @sparticuz/chromium)',
    );
  }
}

/**
 * Start Vite on a free port. Returns { url, close }.
 * Set E2E_URL to test an already-running server instead (for example `vite preview` of a production build).
 */
export async function startServer() {
  if (process.env.E2E_URL) return { url: process.env.E2E_URL.replace(/\/$/, ''), close: async () => {} };
  const { createServer } = await import('vite');
  const server = await createServer({ server: { port: 0, host: '127.0.0.1', strictPort: false }, logLevel: 'error', clearScreen: false });
  await server.listen();
  const addr = server.httpServer.address();
  const port = typeof addr === 'object' && addr ? addr.port : 5173;
  return { url: `http://127.0.0.1:${port}`, close: () => server.close() };
}

/** Record anything a user would never want to see: errors, warnings, uncaught exceptions, failed requests. */
export function watchProblems(page) {
  const problems = [];
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') problems.push(`[console.${m.type()}] ${m.text()}`);
  });
  page.on('pageerror', (e) => problems.push(`[pageerror] ${e.message}`));
  page.on('requestfailed', (r) => problems.push(`[requestfailed] ${r.url()}`));
  return problems;
}

export async function openPhone(browser, url, query = '') {
  const page = await browser.newPage();
  const problems = watchProblems(page);
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  await page.goto(`${url}/${query}`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__specimen, { timeout: 30000 });
  return { page, problems };
}

export const waitPhase = (page, phase, timeout = 90000) =>
  page.waitForFunction((p) => window.__specimen.game.reveal.phase === p, { timeout }, phase);

export async function tapPot(page) {
  const b = await (await page.$('#pot-hit')).boundingBox();
  await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height * 0.55);
}

/** page.click with a useful error: says which selector failed and what the page looked like. */
export async function clickSel(page, selector) {
  try {
    await page.click(selector);
  } catch (err) {
    const state = await page.evaluate((sel) => {
      const el = document.querySelector(sel);
      const panel = document.getElementById('facilitator');
      const r = el ? el.getBoundingClientRect() : null;
      return { exists: !!el, box: r && [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)], panelHidden: panel && panel.hidden, url: location.href };
    }, selector);
    throw new Error(`could not click ${selector}: ${err.message} :: ${JSON.stringify(state)}`);
  }
}

/** A tiny assertion collector so one run reports every failure, not just the first. */
let lastChecker = null;
/** Failures recorded by the most recent checker, so a crash does not throw away what was already found. */
export const lastFailures = () => (lastChecker ? lastChecker.failures : []);

export function checker(name) {
  const failures = [];
  lastChecker = { failures };
  return {
    ok(cond, msg) {
      if (!cond) failures.push(`${name}: ${msg}`);
    },
    eq(actual, expected, msg) {
      if (JSON.stringify(actual) !== JSON.stringify(expected)) failures.push(`${name}: ${msg} (expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)})`);
    },
    failures,
  };
}
