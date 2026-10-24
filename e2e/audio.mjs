// Renders the real synthesis code offline and inspects the waveform: clean, loud enough, silent where it should be, and escalating with rarity.
import { checker } from './harness.mjs';

/** These import source modules (/src/...), which only the dev server serves. */
export const needsDevServer = true;

export const name = 'audio render (offline)';

export async function run({ browser, url }) {
  const t = checker('audio');
  const page = await browser.newPage();
  const problems = [];
  page.on('pageerror', (e) => problems.push(e.message));
  await page.goto(`${url}/gallery.html`, { waitUntil: 'load' }); // any page on the dev origin: we only need module imports
  const r = await page.evaluate(async () => {
    const { AudioEngine } = await import('/src/audio.ts');
    const { TIERS } = await import('/src/config.ts');
    const RATE = 44100;
    const render = async (seconds, schedule) => {
      const off = new OfflineAudioContext(2, Math.ceil(RATE * seconds), RATE);
      const eng = new AudioEngine({ makeContext: () => off });
      eng.build();
      schedule(eng);
      return off.startRendering();
    };
    const analyse = (buf, windowSec = 0.25) => {
      const ch = [buf.getChannelData(0), buf.getChannelData(1)];
      let peak = 0, bad = 0, sumSq = 0, n = 0;
      const w = Math.floor(buf.sampleRate * windowSec);
      const windows = [];
      for (let start = 0; start < buf.length; start += w) {
        let s = 0, c = 0;
        for (let i = start; i < Math.min(buf.length, start + w); i++)
          for (const d of ch) {
            const v = d[i];
            if (!Number.isFinite(v)) bad++;
            else { peak = Math.max(peak, Math.abs(v)); s += v * v; c++; }
          }
        windows.push(c ? Math.sqrt(s / c) : 0);
        sumSq += s; n += c;
      }
      return { peak, bad, rms: Math.sqrt(sumSq / n), windows };
    };
    const tier = (id) => TIERS.find((x) => x.id === id);
    const grail = tier('grail');
    const leaves = Array.from({ length: 8 }, (_, i) => 0.05 + i * 0.12);
    const out = { tiers: {}, fanfare: {} };
    out.full = analyse(await render(9, (e) => { e.drop(0); e.land(0.62); e.crack(1, 1.2); e.crack(2, 1.6); e.burst(grail, 2.1); e.sprout(grail, leaves, 2.45); e.fanfare(grail, 3.4); e.tag(4.6); e.leave(6.0); }));
    for (const x of TIERS) {
      const a = analyse(await render(5, (e) => { e.burst(x, 0); e.sprout(x, leaves, 0.34); e.fanfare(x, 1.2); }));
      out.tiers[x.id] = { peak: a.peak, bad: a.bad };
      const f = analyse(await render(4, (e) => e.fanfare(x, 0)));
      out.fanfare[x.id] = f.rms;
    }
    const idle = new AudioEngine({ makeContext: () => new OfflineAudioContext(2, RATE, RATE) });
    let threw = false;
    try { idle.crack(1); idle.burst(grail); idle.fanfare(grail); idle.drop(); } catch { threw = true; }
    out.neverUnlockedThrew = threw;
    out.muted = analyse(await render(3, (e) => { e.setMuted(true); e.burst(grail, 0.1); e.fanfare(grail, 0.5); })).peak;
    return out;
  });

  t.ok(r.full.bad === 0, 'non-finite samples in the full timeline');
  t.ok(r.full.peak < 0.99, `the full timeline clips (peak ${r.full.peak.toFixed(3)})`);
  t.ok(r.full.peak > 0.2, 'the full timeline is too quiet');
  const at = (sec) => r.full.windows[Math.floor(sec / 0.25)];
  t.ok(at(0.1) > 0.003, 'the drop whoosh is audible');
  t.ok(at(2.2) > 0.02, 'the burst is loud');
  t.ok(at(3.5) > 0.01, 'the fanfare is audible');
  t.ok(at(8.6) < 0.002, 'the tail is silent by 8.6 s');
  for (const [id, v] of Object.entries(r.tiers)) t.ok(v.bad === 0 && v.peak < 0.99, `${id}: clean and unclipped (peak ${v.peak.toFixed(3)})`);
  const order = ['common', 'uncommon', 'rare', 'grail'];
  for (let i = 1; i < order.length; i++) t.ok(r.fanfare[order[i]] > r.fanfare[order[i - 1]], `fanfare energy rises from ${order[i - 1]} to ${order[i]}`);
  t.ok(!r.neverUnlockedThrew, 'an engine that was never unlocked must stay silent without throwing');
  t.ok(r.muted < 1e-3, `mute is really silent (peak ${r.muted})`);
  t.ok(problems.length === 0, `page errors: ${problems.join(' | ')}`);
  await page.close();
  return t.failures;
}
