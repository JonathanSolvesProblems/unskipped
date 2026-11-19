// Builds a SIMULATED session for checking the review screen's layout only.
// It writes to tmp/ (gitignored). No number in the post or results comes from it.
import fs from 'node:fs';
import { compactSample } from '../src/signals.js';
import { paragraphAt } from '../src/score.js';

// placeholder text (not the graded story, which the reader must not see before reading it)
const filler = 'This placeholder paragraph stands in for a page of a manuscript so the layout can be checked without showing the story before it is read.';
const ms = { title: 'Layout check (simulated)', byline: 'Placeholder text, simulated signals', paragraphs: Array.from({ length: 29 }, (_, i) => {
  const reps = 1 + (i * 7) % 4;
  const text = Array.from({ length: reps }, () => filler).join(' ');
  return { text, words: text.split(' ').length };
}) };
const paragraphs = ms.paragraphs.map((p) => ({ text: p.text, words: p.words }));
let t = 2000;
const timeline = paragraphs.map((p, i) => { const e = { t, p: i }; t += p.words * 240 * (i % 7 === 3 ? 1.8 : i % 5 === 1 ? 0.4 : 1); return e; });
const readEnd = t;
const events = [];
let ts = 1e12;
for (let x = 0; x < readEnd; x += 120) {
  ts += 120000;
  const pi = paragraphAt(timeline, x, readEnd);
  const m = {
    cardio: { pulseRate: [{ value: 72 + (pi === 20 || pi === 21 ? 7 : 0), confidence: 92, stable: true }] },
    face: {
      blinking: [{ detected: x % (pi === 24 ? 900 : pi === 9 ? 20000 : 3200) < 150, timestamp: ts }],
      talking: [{ detected: pi === 14, timestamp: ts }],
      expression: [{ scores: [{ type: 'HAPPY', confidence: pi === 6 || pi === 27 ? 80 : 4 }] }],
      landmarks: [{ value: [{ x: 1, y: 1 }] }],
    },
  };
  events.push({ t: x, kind: 'sample', s: compactSample(m, x) });
}
events.push({ t: timeline[17].t, kind: 'validation', code: 17, hint: '' }, { t: timeline[18].t, kind: 'validation', code: 0, hint: '' });
events.sort((a, b) => a.t - b.t);
const session = {
  title: ms.title, byline: ms.byline, paragraphs, timeline, events, readStart: 2000, readEnd,
  reader: { name: 'UI test (simulated)' }, marks: { savedAt: 'simulated', got: [6, 9, 21, 27], lost: [24] },
};
fs.mkdirSync('tmp', { recursive: true });
fs.writeFileSync('tmp/ui-fixture-session.json', JSON.stringify(session));
console.log('tmp/ui-fixture-session.json (simulated, UI check only)');
