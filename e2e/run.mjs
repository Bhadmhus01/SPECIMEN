// `npm run e2e`: start the app, open a real browser, run every check, print one summary.
// Needs Chrome/Chromium (set CHROME_PATH if it is not in a standard place). See the README, "Testing".
import { lastFailures, launchBrowser, startServer } from './harness.mjs';

const only = process.argv[2];
const names = ['playthrough', 'keyboard', 'dialogs', 'reduced-motion', 'audio'].filter((n) => !only || n.includes(only));

const server = await startServer();
let browser;
let failed = 0;
try {
  browser = await launchBrowser();
  console.log(`app: ${server.url}\n`);
  for (const file of names) {
    const mod = await import(`./${file}.mjs`);
    if (process.env.E2E_URL && mod.needsDevServer) {
      console.log(`  skip  ${mod.name}  (imports source modules: needs the dev server, not E2E_URL)`);
      continue;
    }
    const started = Date.now();
    let failures;
    try {
      failures = await mod.run({ browser, url: server.url });
    } catch (err) {
      failures = [...lastFailures(), `crashed: ${err instanceof Error ? err.message : String(err)}`];
    }
    const secs = ((Date.now() - started) / 1000).toFixed(1);
    if (failures.length === 0) console.log(`  PASS  ${mod.name}  (${secs}s)`);
    else {
      failed += 1;
      console.log(`  FAIL  ${mod.name}  (${secs}s)`);
      for (const f of failures) console.log(`          - ${f}`);
    }
  }
} catch (err) {
  failed += 1;
  console.error(err instanceof Error ? err.message : err);
} finally {
  await browser?.close();
  await server.close();
}
console.log(failed === 0 ? '\nAll browser checks passed.' : `\n${failed} check(s) failed.`);
process.exit(failed === 0 ? 0 : 1);
