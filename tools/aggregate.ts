/**
 * Turn exported playtest logs into the Phase 0 verdict.
 *
 *   npm run playtest:report -- phone1.jsonl phone2.jsonl
 *   npm run playtest:report -- --json results.jsonl
 *   cat results.jsonl | npm run playtest:report
 *
 * Accepts JSON Lines or a JSON array. Exports from several devices can be passed together:
 * each event carries its device id, so participants stay distinct, and overlapping exports are de-duplicated.
 * Runs natively on Node 22+ (type stripping); there is nothing to build.
 */
import { readFileSync } from 'node:fs';
import { formatReport, parseEvents, summarize } from '../src/stats/summary.ts';

const args = process.argv.slice(2);
const asJson = args.includes('--json');
const files = args.filter((a) => !a.startsWith('--'));

if (args.includes('--help') || args.includes('-h')) {
  console.log('Usage: npm run playtest:report -- [--json] [file.jsonl ...]\n       (reads standard input when no file is given)');
  process.exit(0);
}
if (files.length === 0 && process.stdin.isTTY) {
  console.error('No input. Pass one or more exported .jsonl files, or pipe a log in.\nRun with --help for usage.');
  process.exit(2);
}

let text: string;
try {
  text = files.length > 0 ? files.map((f) => readFileSync(f, 'utf8')).join('\n') : readFileSync(0, 'utf8');
} catch (err) {
  console.error(`Could not read input: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(2);
}

const events = parseEvents(text);
if (events.length === 0) {
  console.error('No playtest events found in the input. Is it an export from the facilitator panel?');
  process.exit(1);
}

const summary = summarize(events);
console.log(asJson ? JSON.stringify(summary, null, 2) : formatReport(summary));
