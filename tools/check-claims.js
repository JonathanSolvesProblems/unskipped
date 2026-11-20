// Fails if a number in the DEV post disagrees with the results files.
//
// Every claim in post/devto.md that comes from a measurement is written with a marker:
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
};
const post = fs.readFileSync(process.argv[2] || 'post/devto.md', 'utf8');
const re = /<!--claim:([\w.]+)-->([\s\S]*?)<!--\/claim-->/g;
let m, n = 0, bad = 0;
while ((m = re.exec(post))) {
  n++;
  const [, key, text] = m;
  const val = key.split('.').reduce((o, k) => (o == null ? undefined : o[k]), root);
  let ok;
  if (/%$/.test(text.trim())) ok = typeof val === 'number' && Math.round(val * 100) === Number(text.trim().slice(0, -1));
  else ok = String(val) === text.trim();
  if (!ok) { bad++; console.error(`MISMATCH ${key}: post says "${text.trim()}", results say ${JSON.stringify(val)}`); }
}
console.log(`${n} claims checked, ${bad} mismatched`);
process.exit(bad || n === 0 ? 1 : 0);
