// Re-scores committed reading sessions with the committed code and writes the results files.
//
//   node tools/results.js                  score every results/sessions/*.json
//   node tools/results.js add <reading.json> <name>   copy a reading (with raw samples) in as results/sessions/<name>.json
//
// Output: results/summary.json (machine) and results/README.md (the same numbers in words).
import fs from 'node:fs';
import path from 'node:path';
import { scoreSession, THRESHOLDS } from '../src/score.js';
import { grade } from '../src/grade.js';

const dir = 'results/sessions';

// Pre-registration: the reader's marks must be saved strictly before the review screen opened.
// Missing or unparseable dates fail too, so a file cannot pass by leaving the field out.
function checkMarksFirst(s, label) {
  // review.openedAt is the check. Readings sent before the app stored it (the two sessions taken from
  // the backup on 21 November) are checked against review.sentAt instead, which is later than the
  // opening and so a weaker check; results/controls.md says so.
  const saved = Date.parse(s.marks?.savedAt), opened = Date.parse(s.review?.openedAt ?? s.review?.sentAt);
  if (!Number.isFinite(saved) || !Number.isFinite(opened) || !(saved <= opened)) {
    throw new Error(`${label}: marks must be saved no later than the review opened (savedAt ${s.marks?.savedAt}, compared with ${s.review?.openedAt ?? s.review?.sentAt})`);
  }
}

// results/controls.md, planted cases for the "controls" session (0-based paragraph indexes)
const PLANTED = [
  { i: 2, action: 'looked at the phone', expect: 'no-reading', reason: 'you looked away' },
  { i: 5, action: 'read aloud', expect: 'no-reading', reason: 'you were talking' },
  { i: 8, action: 'turned away', expect: 'no-reading', reason: 'you looked away' },
  { i: 10, action: 'read normally', expect: 'reading' },
  { i: 11, action: 'read normally', expect: 'reading' },
];

if (process.argv[2] === 'add') {
  const [, , , src, name] = process.argv;
  const r = JSON.parse(fs.readFileSync(src, 'utf8'));
  if (!r.raw) throw new Error(`${src} has no raw samples (tick "include the raw signal samples" before sending)`);
  const s = { ...r.raw, reader: r.reader, marks: r.marks || r.raw.marks, title: r.title, consent: r.consent };
  if (!s.marks?.savedAt) throw new Error('reading has no marks');
  checkMarksFirst(s, src);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${name}.json`), JSON.stringify(s));
  console.log(`added ${dir}/${name}.json`);
}

// add-backup <session backup> <reading.json> <name>: for a reading sent without raw samples, take the
// signals from the app's running session backup (tmp/live-session.json), but only when the backup
// is the same session as the reading: same text, same read start and end, same marks.
if (process.argv[2] === 'add-backup') {
  const [, , , bak, src, name] = process.argv;
  const b = JSON.parse(fs.readFileSync(bak, 'utf8'));
  const r = JSON.parse(fs.readFileSync(src, 'utf8'));
  const same = (x, y) => JSON.stringify(x) === JSON.stringify(y);
  if (b.textHash !== r.textHash || b.readStart !== r.readStart || b.readEnd !== r.readEnd || !same(b.marks, r.marks)) {
    throw new Error('the backup is not the same session as the reading; nothing added');
  }
  const s = { ...b, reader: r.reader, consent: r.consent, review: { ...(b.review || {}), ...(r.review || {}), sentAt: r.sentAt, source: 'session backup, matched to the sent reading' } };
  checkMarksFirst(s, bak);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${name}.json`), JSON.stringify(s));
  console.log(`added ${dir}/${name}.json`);
}

const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort() : [];
const out = { generatedBy: 'tools/results.js', thresholds: THRESHOLDS, sessions: {} };
for (const f of files) {
  const s = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
  checkMarksFirst(s, f);
  const scored = scoreSession(s);
  const g = grade(scored.paragraphs, s.marks);
  const counts = scored.paragraphs.reduce((a, n) => ((a[n.camera] = (a[n.camera] || 0) + 1), a), {});
  const pulses = s.events.filter((e) => e.kind === 'sample' && e.s.pulse && (e.s.pulse.c ?? 0) >= THRESHOLDS.pulseMinConfidence).length;
  const fps = s.fps?.length ? s.fps.map((x) => x[1]).filter((x) => x > 0) : [];
  out.sessions[f.replace(/\.json$/, '')] = {
    title: s.title, readerName: s.reader?.name,
    paragraphs: s.paragraphs.length,
    readMinutes: Math.round(((s.readEnd - s.readStart) / 60000) * 10) / 10,
    marksSavedAt: s.marks.savedAt, reviewOpenedAt: s.review?.openedAt ?? null, reviewSentAt: s.review?.sentAt ?? null,
    marked: { got: s.marks.got, lost: s.marks.lost },
    camera: g.camera, dwell: g.dwell, refused: g.refused, refusedCount: g.refused.length,
    notes: counts,
    reader: scored.reader,
    confidentPulseSamples: pulses,
    // share of the SDK's talking detections that were 'talking' during the read (a check on the SDK, not scored)
    talkingPct: (() => { const seen = new Map(); for (const e of s.events) if (e.kind === 'sample') for (const d of e.s.talk || []) if (!seen.has(d.ts)) seen.set(d.ts, { on: d.on, t: d.t ?? e.t }); const l = [...seen.values()].filter((d) => d.t >= s.readStart && d.t <= s.readEnd); return l.length ? Math.round((100 * l.filter((d) => d.on).length) / l.length) : null; })(),
    medianFps: fps.length ? fps.sort((a, b) => a - b)[fps.length >> 1] : null,
    perParagraph: scored.paragraphs.map((n) => ({ i: n.i, camera: n.camera, dwell: n.dwell, reason: n.reason, evidence: n.evidence })),
  };
  if (/^controls\d*\.json$/.test(f)) {
    const cases = PLANTED.map((c) => {
      const n = scored.paragraphs[c.i];
      const pass = c.expect === 'no-reading'
        ? n.camera === 'no-reading' && n.reason === c.reason
        : n.camera !== 'no-reading' && n.camera !== 'unseen';
      return { ...c, paragraph: c.i + 1, got: n.camera, gotReason: n.reason, pass };
    });
    out.controls = out.controls || {};
    out.controls[f.replace(/\.json$/, '')] = {
      cases,
      plantedRefused: cases.filter((c) => c.expect === 'no-reading' && c.pass).length,
      planted: cases.filter((c) => c.expect === 'no-reading').length,
      harmlessRead: cases.filter((c) => c.expect === 'reading' && c.pass).length,
      harmless: cases.filter((c) => c.expect === 'reading').length,
    };
  }
}
fs.mkdirSync('results', { recursive: true });
fs.writeFileSync('results/summary.json', JSON.stringify(out, null, 1));

const pct = (x) => (x === null || x === undefined ? 'n/a' : `${Math.round(x * 100)}%`);
let md = '# Results\n\nGenerated by `node tools/results.js` from the session files in `results/sessions/`, scored with the committed code (`src/score.js`, `src/grade.js`). Do not edit by hand.\n\n';
for (const [k, r] of Object.entries(out.sessions)) {
  md += `## ${k}\n\n${r.title}, read by ${r.readerName} in ${r.readMinutes} min (${r.paragraphs} paragraphs). Marks saved ${r.marksSavedAt}; review opened ${r.reviewOpenedAt ?? `(not stored; reading sent ${r.reviewSentAt})`}.\n\n`;
  md += `| Against the reader's own "got me" marks (${r.camera.got.marked}) | Found | By chance | Flagged | Recall | Precision |\n|---|---|---|---|---|---|\n`;
  md += `| Camera (gripped or smiled) | ${r.camera.got.found} | ${r.camera.got.chance} | ${r.camera.got.flagged} of ${r.camera.got.judgeable} | ${pct(r.camera.got.recall)} | ${pct(r.camera.got.precision)} |\n`;
  md += `| Time on the page (lingered) | ${r.dwell.got.found} | ${r.dwell.got.chance} | ${r.dwell.got.flagged} of ${r.dwell.got.judgeable} | ${pct(r.dwell.got.recall)} | ${pct(r.dwell.got.precision)} |\n\n`;
  md += '"By chance" is how many marked paragraphs the same number of flags would find if placed at random among the paragraphs that method could judge.\n\n';
  md += `| Against "lost me" marks (${r.camera.lost.marked}) | Found | Flagged |\n|---|---|---|\n| Camera (drifting) | ${r.camera.lost.found} | ${r.camera.lost.flagged} |\n| Time on the page (skimmed) | ${r.dwell.lost.found} | ${r.dwell.lost.flagged} |\n\n`;
  md += `Notes: ${Object.entries(r.notes).map(([a, b]) => `${a} ${b}`).join(', ')}. No reading: ${r.refused.map((x) => `paragraph ${x.i + 1} (${x.reason})`).join('; ') || 'none'}.\n\n`;
  md += `Reader baselines: pulse median ${r.reader.pulseMedian} bpm, ${r.reader.blinkPerMin} blinks a minute, ${r.reader.msPerWord} ms a word, face readable ${pct(r.reader.readableShare)} of the time. ${r.confidentPulseSamples} confident pulse samples; median ${r.medianFps} fps.\n\n`;
}
for (const [name, c] of Object.entries(out.controls || {})) {
  md += `## Planted controls: ${name}\n\n${c.plantedRefused} of ${c.planted} planted paragraphs refused with the right reason; ${c.harmlessRead} of ${c.harmless} normally read paragraphs got a reading.\n\n| Paragraph | Planted | Expected | Got | Pass |\n|---|---|---|---|---|\n`;
  for (const x of c.cases) md += `| ${x.paragraph} | ${x.action} | ${x.expect === 'reading' ? 'a reading' : `no reading: ${x.reason}`} | ${x.got}${x.gotReason ? `: ${x.gotReason}` : ''} | ${x.pass ? 'yes' : 'no'} |\n`;
  md += '\n';
}
fs.writeFileSync('results/README.md', md);
console.log(`scored ${files.length} session(s) -> results/summary.json, results/README.md`);
