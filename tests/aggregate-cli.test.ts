import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { PlaytestEvent } from '../src/stats/types';

const CLI = join(import.meta.dirname, '..', 'tools', 'aggregate.ts');

/** `n` participants on one device; `yes` of them press One more after the first reveal. */
function deviceLog(device: string, n: number, yes: number): string {
  const lines: string[] = [];
  let t = 1_000_000;
  for (let i = 0; i < n; i++) {
    const participant = `P${String(i + 1).padStart(3, '0')}`;
    const base = { participant, device };
    const ev: PlaytestEvent[] = [
      { type: 'session_start', build: 't', ua: 'x', viewport: '1x1', dpr: 1, reducedMotion: false, sound: true, debug: false, t: (t += 10), ...base },
      { type: 'pot_drop', index: 1, t: (t += 10), ...base },
      { type: 'reveal', index: 1, species: 'pilea', tier: 'rare', form: 'halfmoon', msToOpen: 1400, t: (t += 10), ...base },
      { type: 'settled', index: 1, t: (t += 10), ...base },
    ];
    if (i < yes) ev.push({ type: 'one_more', index: 1, msSinceSettled: 1800, t: (t += 10), ...base });
    lines.push(...ev.map((e) => JSON.stringify(e)));
  }
  return lines.join('\n') + '\n';
}

function tmp(name: string, content: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'specimen-'));
  const file = join(dir, name);
  writeFileSync(file, content);
  return file;
}

const run = (...args: string[]) => execFileSync(process.execPath, [CLI, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

describe('tools/aggregate.ts (runs natively on Node, no build step)', () => {
  it('merges exports from two phones and reports a verdict', () => {
    const a = tmp('a.jsonl', deviceLog('dAAAAAAAA', 25, 18));
    const b = tmp('b.jsonl', deviceLog('dBBBBBBBB', 25, 17));
    const out = run(a, b);
    expect(out).toContain('Participants (eligible): 50');
    expect(out).toContain('35 of 50');
    expect(out).toContain('VERDICT: PASS');
  });

  it('prints machine-readable JSON with --json', () => {
    const a = tmp('a.jsonl', deviceLog('dAAAAAAAA', 40, 10));
    const s = JSON.parse(run('--json', a)) as { participants: number; wantedMore: number; verdict: string };
    expect(s).toMatchObject({ participants: 40, wantedMore: 10, verdict: 'FAIL' });
  });

  it('reads standard input when no file is given', () => {
    const out = execFileSync(process.execPath, [CLI], { input: deviceLog('dCCCCCCCC', 3, 3), encoding: 'utf8' });
    expect(out).toContain('INSUFFICIENT DATA');
  });

  it('exits with an error and a clear message on an empty or unreadable input', () => {
    const empty = spawnSync(process.execPath, [CLI, tmp('empty.jsonl', '')], { encoding: 'utf8' });
    expect(empty.status).toBe(1);
    expect(empty.stderr).toContain('No playtest events found');
    const missing = spawnSync(process.execPath, [CLI, '/nonexistent/file.jsonl'], { encoding: 'utf8' });
    expect(missing.status).toBe(2);
    expect(missing.stderr).toContain('Could not read input');
  });
});
