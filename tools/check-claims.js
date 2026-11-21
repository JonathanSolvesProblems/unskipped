// Fails if a number in a document disagrees with the results files.
//
//   node tools/check-claims.js <file.md>
//
// Every claim in the document that comes from a measurement is written with a marker:
//   <!--claim:graded.camera.got.found-->4<!--/claim-->
// The path is looked up in results/summary.json (under "sessions"), and the text between the
// markers must equal it (percentages written as "75%" are compared to the 0..1 value).
import fs from 'node:fs';

const summary = JSON.parse(fs.readFileSync('results/summary.json', 'utf8'));
// besides sessions: controls.* (planted controls, in summary.json) and nullcheck.* (results/null-check.json)
const root = {
  ...summary.sessions,
  controls: summary.controls,
  nullcheck: fs.existsSync('results/null-check.json') ? JSON.parse(fs.readFileSync('results/null-check.json', 'utf8')) : undefined,
  pulsecheck: fs.existsSync('results/pulse-check.json') ? JSON.parse(fs.readFileSync('results/pulse-check.json', 'utf8')) : undefined,
};
// a local .md file, or the published DEV post through DEV's public API (its markdown source)
const file = process.argv[2] || 'https://dev.to/api/articles/jonathansolvesstuff/unskipped-see-where-your-beta-reader-stopped-caring-as-page-flags-in-your-own-manuscript-18b2';
let post;
if (/^https?:/.test(file)) {
  const res = await fetch(file);
  if (!res.ok) { console.error(`could not fetch ${file}: HTTP ${res.status}`); process.exit(1); }
  post = (await res.json()).body_markdown;
} else {
  post = fs.readFileSync(file, 'utf8');
}
// the claims: marked in the text, or (for the published post, where DEV would show markers as
// text) the words just before each number, from results/post-claims.json
const re = /<!--claim:([\w.]+)-->([\s\S]*?)<!--\/claim-->/g;
let m, n = 0, bad = 0;
const claims = [];
while ((m = re.exec(post))) claims.push([m[1], m[2]]);
if (!claims.length && fs.existsSync('results/post-claims.json')) {
  const text = post.replace(/\r/g, '');
  for (const { key, anchor } of JSON.parse(fs.readFileSync('results/post-claims.json', 'utf8'))) {
    const i = text.indexOf(anchor);
    const num = i < 0 ? null : text.slice(i + anchor.length).match(/^[\d.]+/);
    if (!num) { bad++; console.error(`MISSING ${key}: "${anchor}" not followed by a number in the post`); continue; }
    claims.push([key, num[0].replace(/\.$/, '')]);
  }
}
for (const [key, text] of claims) {
  n++;
  const val = key.split('.').reduce((o, k) => (o == null ? undefined : o[k]), root);
  let ok;
  if (/%$/.test(text.trim())) ok = typeof val === 'number' && Math.round(val * 100) === Number(text.trim().slice(0, -1));
  else ok = String(val) === text.trim();
  if (!ok) { bad++; console.error(`MISMATCH ${key}: post says "${text.trim()}", results say ${JSON.stringify(val)}`); }
}
console.log(`${n} claims checked, ${bad} mismatched`);
process.exitCode = bad || n === 0 ? 1 : 0;   // not process.exit(): it aborts the fetch socket mid-close on Windows
