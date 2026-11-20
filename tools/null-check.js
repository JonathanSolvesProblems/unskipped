// How often does the scorer flag a paragraph when the reader has no reaction at all?
//
//   node tools/null-check.js
//
// Simulates 200 readers per blink rate who read the graded story's paragraph lengths at a steady
// pace, blink at random, hold a flat pulse and never smile, then scores them with the committed
// code. Every flag such a reader gets is a false one. Writes results/null-check.json.
// Only paragraph word counts are taken from the story; no text is printed.
import fs from 'node:fs';
import { scoreSession } from '../src/score.js';

const blocks = fs.readFileSync('stories/the-open-window.md', 'utf8').replace(/\r/g, '').split(/\n\s*\n/)
  .map((b) => b.trim()).filter((b) => b && !/^#\s/.test(b) && !/^_.*_$/.test(b));
const words = blocks.map((b) => b.split(/\s+/).length);

function simulate(blinksPerMin, seed) {
  let r = seed;
  const rnd = () => ((r = (r * 1664525 + 1013904223) % 4294967296) / 4294967296);
  let t = 2000;
  const timeline = words.map((w, i) => { const e = { t, p: i }; t += w * 240 * (0.85 + 0.3 * rnd()); return e; });
  const end = t, events = [];
  let k = 0;
  for (let x = 0; x < end; x += 100) {
    const on = rnd() < blinksPerMin / 600;
    events.push({ t: x, kind: 'sample', s: {
      t: x, pulse: { v: 72 + (rnd() - 0.5) * 3, c: 90, s: true },
      blink: [{ ts: ++k, on, t: x }, { ts: ++k, on: false, t: x + 50 }],
      expr: { happy: rnd() * 30 }, face: true,
    } });
  }
  const scored = scoreSession({ paragraphs: words.map((w) => ({ words: w })), timeline, events, readStart: 2000, readEnd: end });
  const share = (c) => scored.paragraphs.filter((n) => n.camera === c).length / words.length;
  return { gripped: share('gripped'), drifting: share('drifting'), amused: share('amused') };
}

const out = { generatedBy: 'tools/null-check.js', readersPerRate: 200, paragraphs: words.length, rates: [] };
for (const bpm of [6, 10, 15, 20]) {
  const runs = Array.from({ length: 200 }, (_, i) => simulate(bpm, i + 1));
  const avg = (key) => Math.round((runs.reduce((a, x) => a + x[key], 0) / runs.length) * 1000) / 10;
  const row = { blinksPerMin: bpm, grippedPct: avg('gripped'), driftingPct: avg('drifting'), smiledPct: avg('amused') };
  out.rates.push(row);
  console.log(`${bpm} blinks a minute: gripped ${row.grippedPct}%, drifting ${row.driftingPct}%, smiled ${row.smiledPct}% of paragraphs (all false)`);
}
out.maxFalseGrippedPct = Math.max(...out.rates.map((r) => r.grippedPct));
fs.mkdirSync('results', { recursive: true });
fs.writeFileSync('results/null-check.json', JSON.stringify(out, null, 1));
console.log('-> results/null-check.json');
