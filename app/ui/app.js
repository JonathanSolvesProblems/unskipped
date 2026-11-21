import { scoreSession, commentFor } from '../../src/score.js';
import { grade } from '../../src/grade.js';

// In the desktop app the preload exposes window.unskipped. On the static replay page it is
// absent, and the page replays a recorded reading instead (no camera, no key).
const params = new URLSearchParams(location.search);
let api = window.unskipped || null;
if (!api && params.get('mock')) api = (await import('./mock-api.js')).api; // dev-only layout review
const REPLAY = !api;

const $ = (sel, el = document) => el.querySelector(sel);
const view = $('#view');
const readline = $('#readline');
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const ART = 'art/';

const STEPS = ['Consent', 'Settle', 'Read', 'Your marks', 'Review'];
function crumbs(on) {
  const k = STEPS.indexOf(on);
  $('#crumbs').innerHTML = on ? STEPS.map((s, i) => `<span class="${i === k ? 'on' : i < k ? 'done' : ''}" data-step="Step ${i + 1} of ${STEPS.length}" ${i === k ? 'aria-current="step"' : ''}><i>${i + 1}</i>${s}</span>`).join('') : '';
}
function toast(msg, ms = 2800) {
  const t = document.createElement('div'); t.className = 'toast'; t.setAttribute('role', 'status'); t.textContent = msg;
  document.body.append(t); setTimeout(() => t.remove(), ms);
}
function hashText(paragraphs) {
  let h = 2166136261;
  for (const ch of paragraphs.map((p) => p.text).join('\n')) { h ^= ch.codePointAt(0); h = Math.imul(h, 16777619) >>> 0; }
  return h.toString(16);
}
const FLAG = { gripped: 'grip', amused: 'smile', drifting: 'drift', 'no-reading': 'none', unseen: 'none' };
const MEANING = { grip: 'Gripped: pulse up, or blinking slowed', smile: 'Smiled', drift: 'May have drifted: blinking sped up', none: 'No reading: the camera could not tell' };

// ---------------------------------------------------------------- state
const S = { env: null, manuscript: null, session: null, t0: 0, live: null, unsub: [], readings: [] };

// ---------------------------------------------------------------- the sample page (home hero)
// A real typeset page (Austen, 1813, public domain) with flags on its fore-edge: the product's
// own output as the hero object, composed in HTML. Labelled as a sample.
function samplePage() {
  const paras = [
    ['It is a truth universally acknowledged, that a single man in possession of a good fortune, must be in want of a wife.', 'smile', ''],
    ['However little known the feelings or views of such a man may be on his first entering a neighbourhood, this truth is so well fixed in the minds of the surrounding families, that he is considered as the rightful property of some one or other of their daughters.', null, ''],
    ['“My dear Mr. Bennet,” said his lady to him one day, “have you heard that Netherfield Park is let at last?”', 'grip', ''],
    ['Mr. Bennet replied that he had not.', null, ''],
    ['“But it is,” returned she; “for Mrs. Long has just been here, and she told me all about it.”', null, ''],
    ['Mr. Bennet made no answer.', 'drift', ''],
    ['“Do not you want to know who has taken it?” cried his wife impatiently.', 'none', ''],
  ];
  return `<figure class="sample" aria-label="A sample page with reader flags">
    <div class="sheet sample-page">
      ${paras.map(([t, f, m]) => `<p class="${m}">${t}${f ? `<span class="flag ${f}" aria-hidden="true"></span>` : ''}</p>`).join('')}
    </div>
    <figcaption><span>A sample page, flagged:</span><span><i class="swatch grip"></i>gripped</span><span><i class="swatch smile"></i>smiled</span><span><i class="swatch drift"></i>drifted</span><span><i class="swatch none"></i>no reading</span></figcaption>
  </figure>`;
}

// ---------------------------------------------------------------- home
async function home() {
  crumbs(null); readline.hidden = true;
  S.env = await api.invoke('env:info');
  view.innerHTML = `
  <section class="home">
    <div class="home-copy">
      <h1>See where your reader stopped caring</h1>
      <p class="lede">Your beta reader reads the chapter with their camera on. Their pulse, blinks and smiles leave a flag on every paragraph that moved them or lost them, and the flags come back to you as comments in your own manuscript.</p>
      <p class="quote">“Try to leave out the part that readers tend to skip.” Elmore&nbsp;Leonard</p>
      <div class="row">
        <button class="btn paper" id="read">Open a chapter to read</button>
        <button class="link" id="write">I’m the writer: add readings to my manuscript</button>
      </div>
      ${S.env.hasKey ? '' : '<p class="notice">Live reading needs a Presage key in <code>.env</code>. The README says how.</p>'}
    </div>
    ${samplePage()}
    <footer class="foot">
      <span>Measured on the reader’s laptop by Presage SmartSpectra. No video leaves it.</span>
      <span>Made by Jonathan Andrei for writers who keep hearing “loved it.” More of what I build at <a href="https://jonathansolvesproblems.com" id="site">jonathansolvesproblems.com</a></span>
    </footer>
  </section>`;
  $('#read').onclick = async () => { const r = await api.invoke('manuscript:open'); if (r) { S.manuscript = r; consent(); } };
  $('#write').onclick = writer;
  $('#site').onclick = (e) => { e.preventDefault(); api.invoke('shell:open', 'https://jonathansolvesproblems.com'); };
}

// ---------------------------------------------------------------- consent
function consent() {
  crumbs('Consent'); readline.hidden = true;
  const ms = S.manuscript.ms;
  const cams = S.env.cameras;
  const minutes = Math.max(1, Math.round(ms.paragraphs.reduce((a, p) => a + p.words, 0) / 230));
  view.innerHTML = `
  <section class="sheet consent">
    <div>
      <h1>Before the camera turns on</h1>
      <p class="lede">You are about to read <em>${esc(ms.title)}</em>, ${ms.paragraphs.length} paragraphs, about ${minutes} minutes.</p>
      <dl>
        <dt>What is read</dt><dd>Your pulse, blinks and smiles, whether you are talking, and whether your face is turned to the page. Presage SmartSpectra works these out from the camera picture.</dd>
        <dt>Where</dt><dd>On this computer. No video or picture is recorded or sent. Presage’s software only checks its licence key, with its usage reporting switched off.</dd>
        <dt>What the writer gets</dt><dd>Only the notes you keep at the end, with your name. You can keep none.</dd>
        <dt>Your own marks</dt><dd>You mark what got you and lost you before you see any flag.</dd>
        <dt>Not about health</dt><dd>The readings describe how you read one piece, nothing about your health. Stop at any time; closing the window turns the camera off.</dd>
      </dl>
    </div>
    <div class="consent-act">
      <label class="agree"><input type="checkbox" id="ok"> I agree to be measured while I read this piece</label>
      <label class="field">Your name, as the writer will see it <input type="text" id="name" placeholder="Your name"></label>
      <label class="field">Camera <select id="cam">${cams.map((c, i) => `<option value="${i}">${esc(c.name)}</option>`).join('')}</select></label>
      <div class="row"><button class="btn" id="go" disabled>Turn on the camera</button><button class="link-ink" id="back">Not now</button></div>
      <p class="small" id="why">Tick the box above to turn the camera on.</p>
    </div>
  </section>`;
  $('#ok').onchange = (e) => {
    $('#go').disabled = !e.target.checked || !S.env.hasKey || !cams.length;
    $('#why').textContent = !S.env.hasKey ? 'A Presage key is needed first. The README says how.' : !cams.length ? 'No camera found on this computer.' : e.target.checked ? 'Nothing is measured until you press Start reading, and nothing leaves this laptop until you press Send.' : 'Tick the box above to turn the camera on.';
  };
  $('#back').onclick = home;
  $('#go').onclick = async () => {
    const cam = cams[Number($('#cam').value)];
    const m = S.manuscript.ms;
    S.session = {
      app: 'unskipped', kind: 'session', version: 1,
      title: m.title, byline: m.byline, textHash: hashText(m.paragraphs),
      paragraphs: m.paragraphs.map((p) => ({ text: p.text, words: p.words })),
      reader: { name: $('#name').value.trim() || 'Reader' },
      consent: { agreedAt: new Date().toISOString(), telemetry: false, camera: cam.name, sdk: S.env.sdk },
      timeline: [], events: [], fps: [], readStart: null, readEnd: null, marks: null,
    };
    try {
      const { t0 } = await api.invoke('capture:start', { cameraId: cam.id });
      S.t0 = t0; wireLive(); settle();
    } catch (e) { toast(`The camera did not start: ${e.message}`, 6000); }
  };
}

// ---------------------------------------------------------------- live signal wiring
const now = () => Date.now() - S.t0;
function wireLive() {
  S.unsub.forEach((u) => u()); S.unsub = [];
  const L = S.live = { pulse: null, blinks: [], smile: 0, code: 0, hint: '', fps: 0, pulseHist: [], lastBlink: false, validSince: null };
  S.unsub.push(api.on('sdk:sample', (s) => {
    S.session.events.push({ t: s.t, kind: 'sample', s });
    if (s.pulse) { L.pulse = s.pulse; if ((s.pulse.c ?? 0) >= 40) L.pulseHist.push([s.t, s.pulse.v]); }
    if (s.expr) L.smile = s.expr.happy;
    for (const b of s.blink || []) { if (b.on && !L.lastBlink) L.blinks.push(b.t); L.lastBlink = b.on; }
  }));
  S.unsub.push(api.on('sdk:validation', (v) => {
    S.session.events.push({ t: v.t, kind: 'validation', code: v.code, hint: v.hint });
    if (v.code === 0 && L.code !== 0) L.validSince = v.t;
    if (v.code !== 0) L.validSince = null;
    L.code = v.code; L.hint = v.hint;
  }));
  S.unsub.push(api.on('sdk:status', (v) => S.session.events.push({ t: v.t, kind: 'status', status: v.status })));
  S.unsub.push(api.on('sdk:error', (v) => { S.session.events.push({ t: v.t, kind: 'error', ...v }); toast(`SmartSpectra: ${v.message} (code ${v.code})`, 6000); }));
  S.unsub.push(api.on('sdk:fps', (v) => { L.fps = v.fps; S.session.fps.push([v.t, v.fps]); }));
  S.unsub.push(api.on('sdk:frame', (f) => {
    const c = document.getElementById('preview');
    if (!c) return;
    c.width = f.w; c.height = f.h;
    const img = new ImageData(f.w, f.h); img.data.set(f.data);
    c.getContext('2d').putImageData(img, 0, 0);
  }));
  clearInterval(S.backupTimer);
  S.backupTimer = setInterval(() => api.invoke('session:backup', JSON.stringify(S.session)), 10000);
}
async function stopLive() {
  clearInterval(S.backupTimer); clearInterval(S.railTimer); clearInterval(S.focusTimer);
  await api.invoke('capture:stop');
  S.unsub.forEach((u) => u()); S.unsub = [];
  await api.invoke('session:backup', JSON.stringify(S.session));
}

const HINTS = { 0: 'Good picture', 1: 'No face found', 2: 'More than one face', 3: 'Centre your face', 4: 'Adjust your distance', 5: 'Too dark', 6: 'Too bright', 7: 'Sit back: show the top of your chest', 10: 'Camera adjusting', 11: 'Frame rate too low', 12: 'Hold still', 13: 'Too close', 14: 'Too far', 15: 'Move down a little', 16: 'Move up a little', 17: 'Face the screen' };

function railHtml({ stop = false } = {}) {
  return `<section class="rail" aria-label="Live camera">
    <canvas id="preview" width="192" height="108" aria-label="Live camera preview, not recorded"></canvas>
    <div class="state" id="status" role="status"></div>
    <div class="readout" id="readout"></div>
    <p class="rail-note">Live camera, on this laptop only. Not recorded.</p>
    ${stop ? '<div class="on-cloth row"><button class="btn" id="done">I’ve finished</button><button class="link" id="quit">Stop</button></div>' : ''}
  </section>`;
}
function paintRail() {
  const L = S.live, t = now();
  const span = Math.min(60000, Math.max(1, t));
  const blinksMin = L.blinks.filter((b) => b > t - 60000).length * (60000 / span);
  const confident = L.pulse && (L.pulse.c ?? 0) >= 40;
  const ro = $('#readout');
  if (ro) ro.innerHTML = `
    <span class="k">Pulse</span><b>${confident ? `${L.pulse.v.toFixed(0)}<small> bpm</small>` : '<small>Settling</small>'}</b>
    <span class="k">Blinks</span><b>${t > 10000 ? `${blinksMin.toFixed(0)}<small> a min</small>` : '<small>Counting</small>'}</b>
    <span class="k">Smiling</span><b><small>${L.smile >= 50 ? 'Yes' : 'No'}</small></b>`;
  const st = $('#status');
  if (st) st.innerHTML = `<span class="${L.code === 0 ? 'ok' : 'warn'}">${esc(HINTS[L.code] ?? L.hint ?? L.code)}</span><span>${L.fps} fps</span>`;
}

// ---------------------------------------------------------------- settle
function settle() {
  crumbs('Settle'); readline.hidden = true;
  // the camera is the object on this screen: a large mirror with a head-and-shoulders guide
  view.innerHTML = `<section class="settle">
    <div class="settle-cam">
      <div class="cam-frame">
        <span class="cam-wait">Starting the camera…</span>
        <canvas id="preview" width="640" height="360" aria-label="Live camera preview, not recorded"></canvas>
        <svg class="cam-guide" viewBox="0 0 160 90" preserveAspectRatio="xMidYMid meet" aria-hidden="true"><ellipse cx="80" cy="34" rx="15" ry="19"/><path d="M42 90 C44 66 58 58 80 58 C102 58 116 66 118 90"/></svg>
      </div>
      <div class="state" id="status" role="status"></div>
      <div class="readout" id="readout"></div>
      <p class="rail-note">Live camera, on this laptop only. Not recorded.</p>
    </div>
    <div class="sheet settle-card">
      <h1>Sit so the camera sees your face and the top of your chest</h1>
      <p>Sit back until you fill the outline, down to the collarbones. Light in front of you, not behind. Your first pulse reading comes after about fifteen seconds of a steady picture.</p>
      <p class="settle-state" id="settleMsg" role="status">Waiting for a steady pulse</p>
      <div class="row"><button class="btn" id="start" disabled>Start reading</button><button class="link-ink" id="stop">Turn the camera off</button></div>
    </div></section>`;
  S.session.settleStart = now();
  S.railTimer = setInterval(() => {
    paintRail();
    const steady = S.live.pulse && (S.live.pulse.c ?? 0) >= 40;
    const ready = steady || now() - S.session.settleStart > 30000;
    $('#start').disabled = !ready;
    $('#settleMsg').textContent = steady ? 'Steady. Start whenever you like.' : ready ? 'Still settling. You can start; the first paragraphs may have less to say.' : 'Waiting for a steady pulse';
  }, 500);
  $('#start').onclick = read;
  $('#stop').onclick = async () => { await stopLive(); home(); };
}

// ---------------------------------------------------------------- read
function read() {
  clearInterval(S.railTimer);
  crumbs('Read'); readline.hidden = false;
  const s = S.session;
  view.innerHTML = `<section class="reading">
    <article class="sheet page" id="page">
      <h1>${esc(s.title)}</h1>${s.byline ? `<div class="byline">${esc(s.byline)}</div>` : ''}
      ${s.paragraphs.map((p, i) => `<p data-i="${i}">${esc(p.text)}</p>`).join('')}
    </article>${railHtml({ stop: true })}</section>`;
  window.scrollTo(0, 0);
  s.readStart = now();
  const paras = [...view.querySelectorAll('#page p[data-i]')];
  let current = -1;
  const track = () => {
    const y = window.innerHeight * 0.38;
    // -1 while the title is on the line or the reader is past the last paragraph, so that time
    // is not credited to the first or last paragraph (the scorer skips -1)
    let pick = -1;
    for (const el of paras) {
      const r = el.getBoundingClientRect();
      if (r.top <= y && r.bottom >= y) { pick = Number(el.dataset.i); break; }
      if (r.top > y) { pick = el === paras[0] ? -1 : Number(el.dataset.i); break; }
    }
    if (pick !== current) {
      if (current >= 0) paras[current].classList.remove('focus');
      current = pick;
      if (pick >= 0) paras[pick].classList.add('focus');
      s.timeline.push({ t: now(), p: pick });
    }
  };
  const page = $('#page');
  const placeLine = () => { const r = page.getBoundingClientRect(); readline.style.left = `${r.left}px`; readline.style.width = `${r.width}px`; };
  placeLine(); window.onresize = placeLine;
  track();
  window.onscroll = track;
  S.focusTimer = setInterval(track, 250);
  S.railTimer = setInterval(paintRail, 500);
  $('#done').onclick = async () => { s.readEnd = now(); window.onscroll = null; await stopLive(); marks(); };
  $('#quit').onclick = async () => {
    window.onscroll = null; await stopLive(); S.session = null;
    toast('Stopped. The camera is off and nothing was sent.'); home();
  };
}

// ---------------------------------------------------------------- marks (before any note is shown)
function marks() {
  crumbs('Your marks'); readline.hidden = true;
  const s = S.session;
  const state = new Map();
  view.innerHTML = `<section class="marks-wrap">
    <div class="marks-head"><h1>Your marks first</h1>
    <p class="lede">Before you see any flag: click the paragraphs that got you, and click twice for any that lost you.</p></div>
    <article class="sheet markable">${s.paragraphs.map((p, i) => `<p data-i="${i}" tabindex="0" role="button" aria-pressed="false">${esc(p.text)}<span class="vh mark-state"></span></p>`).join('')}</article>
    <section class="marks-side on-cloth" aria-label="Your marks">
      <p class="count" id="count"></p>
      <div class="mark-key"><span class="mk got">got me</span><span>one click</span><span class="mk lost">lost me</span><span>two clicks</span></div>
      <button class="btn" id="save">Save my marks and show the flags</button>
      <p class="small">The camera’s flags appear only after you save.</p>
    </section>
  </section>`;
  const count = () => {
    const g = [...state.values()].filter((v) => v === 'got').length, l = [...state.values()].filter((v) => v === 'lost').length;
    $('#count').textContent = `${g} got me, ${l} lost me`;
  };
  view.querySelectorAll('.markable p').forEach((el) => {
    const cycle = () => {
      const i = Number(el.dataset.i);
      const next = { undefined: 'got', got: 'lost', lost: undefined }[state.get(i)];
      el.classList.remove('got', 'lost');
      if (next) { state.set(i, next); el.classList.add(next); } else state.delete(i);
      el.setAttribute('aria-pressed', String(!!next));
      el.querySelector('.mark-state').textContent = next === 'got' ? ' Marked: got me.' : next === 'lost' ? ' Marked: lost me.' : '';
      count();
    };
    el.onclick = cycle;
    el.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); cycle(); } };
  });
  count();
  $('#save').onclick = async () => {
    s.marks = {
      savedAt: new Date().toISOString(),
      got: [...state].filter(([, v]) => v === 'got').map(([i]) => i).sort((a, b) => a - b),
      lost: [...state].filter(([, v]) => v === 'lost').map(([i]) => i).sort((a, b) => a - b),
    };
    await api.invoke('session:backup', JSON.stringify(s));
    review(s);
  };
}

// ---------------------------------------------------------------- review
const numWord = (n) => (n >= 0 && n <= 10 ? ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'][n] : String(n));
const cap = (t) => t.charAt(0).toUpperCase() + t.slice(1);

function review(s, { replay = false } = {}) {
  crumbs(replay ? null : 'Review'); readline.hidden = true;
  if (!s.review) s.review = { openedAt: new Date().toISOString() };
  const scored = scoreSession(s);
  const g = grade(scored.paragraphs, s.marks);
  const name = s.reader.name;
  const kept = new Set(scored.paragraphs.filter((n) => FLAG[n.camera]).map((n) => n.i));
  const pct = (x) => (x === null || x === undefined ? 'n/a' : `${Math.round(x * 100)}%`);
  const minutes = ((s.readEnd - s.readStart) / 60000).toFixed(1);
  const gm = g.camera.got, gd = g.dwell.got;
  const headline = gm.marked
    ? (gm.marked === 1
      ? `You marked <span class="n">1</span> paragraph as got me, and the camera ${gm.found ? 'flagged it too' : 'did not flag it'}`
      : `Of the <span class="n">${gm.marked}</span> paragraphs you marked as got me, the camera flagged <span class="n">${gm.found}</span>`)
    : 'You marked nothing as got me. Here is what the camera noticed';
  view.innerHTML = `<section class="review">
    <div class="verdict">
      ${replay ? '<p class="replay-note">A real recorded reading, played back through the app’s own scoring. No camera needed.</p>' : ''}
      <h1>${headline}</h1>
      <p class="base">${gm.marked && gm.chance !== null ? `Flags placed at random would find about ${gm.chance} of ${gm.marked}. ` : ''}Time on the page alone found ${gd.found}${gm.marked ? ` of ${gd.marked}` : ''}. ${g.refused.length ? `${cap(numWord(g.refused.length))} paragraph${g.refused.length > 1 ? 's' : ''} had no reading; their notes say why.` : 'Every paragraph had a reading.'} Read in ${minutes} minutes, face readable ${pct(scored.reader.readableShare)} of the time.</p>
      <p class="edge-key edge-cap">Your chapter, edge on: one block per paragraph, as wide as it is long.</p>
      <nav class="edge" aria-label="The chapter seen from its edge: each paragraph as wide as it is long">
        ${scored.paragraphs.map((n, i) => {
          const f = FLAG[n.camera];
          const mark = s.marks.got.includes(i) ? 'got' : s.marks.lost.includes(i) ? 'lost' : '';
          return `<a href="#p${i}" class="slot ${mark}" style="flex-grow:${Math.max(8, s.paragraphs[i].words)}" data-i="${i}" title="Paragraph ${i + 1}${f ? `: ${MEANING[f]}` : ''}">${f ? `<span class="tip ${f}"></span>` : ''}</a>`;
        }).join('')}
      </nav>
      <div class="legend legend-row">
        ${['grip', 'smile', 'drift', 'none'].map((f) => `<div><span class="swatch ${f}"></span>${MEANING[f]}</div>`).join('')}
        <div><span class="swatch pencil"></span>Your own marks</div>
      </div>
    </div>
    <article class="sheet annot" id="annot">
      ${scored.paragraphs.map((n, i) => {
        const f = FLAG[n.camera];
        const mark = s.marks.got.includes(i) ? 'got' : s.marks.lost.includes(i) ? 'lost' : '';
        return `<div class="para ${mark}" data-i="${i}" id="p${i}">${esc(s.paragraphs[i].text)}${f ? `<button class="flag ${f}" style="--k:${i}" data-i="${i}" aria-pressed="true" aria-label="${esc(MEANING[f])}. ${replay ? 'Show note' : 'Show note; press again to drop it'}"></button>` : ''}</div>`;
      }).join('')}
    </article>
    <section class="notes" aria-label="Notes on this reading">
      ${replay ? '' : `
      <div class="send on-cloth">
        <button class="btn" id="send">Send the kept notes to the writer</button>
        <label><input type="checkbox" id="raw"> Also include the raw signal samples, for research. Off by default.</label>
      </div>`}
      <div class="slip note-slip" id="note"><h2>Select a flag</h2><p class="small">Each flag says what the camera saw on that paragraph and how sure it was.</p></div>
    </section>
  </section>`;
  requestAnimationFrame(() => $('#annot').classList.add('reveal'));
  const showNote = (i) => {
    const n = scored.paragraphs[i];
    view.querySelectorAll('.annot .para.sel').forEach((el) => el.classList.remove('sel'));
    view.querySelector(`.annot .para[data-i="${i}"]`)?.classList.add('sel');
    const e = n.evidence || {};
    const ev = [];
    if (e.pulseDelta !== null && e.pulseDelta !== undefined) ev.push(Math.abs(e.pulseDelta) < 1 ? 'Pulse sat at your median.' : `Pulse ${e.pulseDelta > 0 ? 'rose' : 'fell'} ${Math.abs(e.pulseDelta)} bpm from your median.`);
    if (Number.isFinite(e.blinkRatio)) ev.push(`You blinked at ${Math.round(e.blinkRatio * 100)}% of your usual rate.`);
    if (e.smileMs) ev.push(`You smiled for ${(e.smileMs / 1000).toFixed(1)} seconds.`);
    if (e.dwellRatio) ev.push(Math.abs(e.dwellRatio - 1) < 0.15 ? 'You spent about your usual time per word here.'
      : e.dwellRatio < 1 ? `You spent ${Math.round(e.dwellRatio * 100)}% of your usual time per word here.`
      : `You spent ${e.dwellRatio.toFixed(1)} times your usual time per word here.`);
    const own = s.marks.got.includes(i) ? 'You marked it as got me.' : s.marks.lost.includes(i) ? 'You marked it as lost me.' : '';
    // the slip states the finding once; the evidence line carries the numbers (the Word comment keeps both)
    const lead = { amused: 'Smiled here.', gripped: 'Gripped here.', drifting: 'May have drifted here.',
      'no-reading': `No reading: ${n.reason}. Unskipped does not guess.`, brief: 'Too brief to read a signal.',
      unseen: 'Never on the reading line.' }[n.camera] || 'Nothing stood out here.';
    $('#note').innerHTML = `<h2>${FLAG[n.camera] ? `<span class="swatch ${FLAG[n.camera]}"></span>` : ''}Paragraph ${i + 1}${kept.has(i) ? '' : ', dropped from what you send'}</h2><p>${esc(lead)}</p>
      <p class="ev">${esc([...ev, own].filter(Boolean).join(' '))}</p>
      ${replay ? '' : '<p class="ev">Click the flag again to drop this note, or to keep it.</p>'}`;
    $('#note').style.setProperty('--fc', FLAG[n.camera] ? `var(--f-${FLAG[n.camera]})` : 'transparent');
    placeNote(i);
  };
  view.querySelectorAll('.annot .flag').forEach((b) => {
    b.onclick = () => {
      const i = Number(b.dataset.i);
      if (!replay && b.classList.contains('cur')) {
        if (kept.has(i)) kept.delete(i); else kept.add(i);
        b.setAttribute('aria-pressed', String(kept.has(i)));
      }
      view.querySelectorAll('.annot .flag.cur').forEach((x) => x.classList.remove('cur'));
      b.classList.add('cur');
      showNote(i);
    };
  });
  view.querySelectorAll('.annot .para').forEach((p) => { p.onclick = (e) => { if (!e.target.closest('.flag')) showNote(Number(p.dataset.i)); }; });
  view.querySelectorAll('.edge .slot').forEach((a) => {
    a.onclick = (e) => { e.preventDefault(); const i = Number(a.dataset.i); document.getElementById(`p${i}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }); showNote(i); };
  });
  // on wide screens the note sits level with its paragraph, like a margin note
  function placeNote(i) {
    const note = $('#note'), para = view.querySelector(`.annot .para[data-i="${i}"]`);
    if (!note || !para) return;
    if (!matchMedia('(min-width: 981px)').matches) { note.style.marginTop = ''; return; }
    const send = view.querySelector('.notes .send');
    const floor = send ? send.offsetHeight + 14 : 0;
    note.style.marginTop = `${Math.max(0, para.offsetTop - floor)}px`;
  }
  const first = scored.paragraphs.find((n) => FLAG[n.camera] && n.camera !== 'no-reading');
  if (first) showNote(first.i);
  if (replay) return;
  $('#send').onclick = async () => {
    const notes = scored.paragraphs
      .map((n) => ({ i: n.i, camera: n.camera, dwell: n.dwell, evidence: n.evidence, reason: n.reason, text: commentFor(n, name) }))
      .filter((n) => n.text && kept.has(n.i));
    const dropped = scored.paragraphs.filter((n) => commentFor(n, name) && !kept.has(n.i)).map((n) => n.i);
    const reading = {
      app: 'unskipped', kind: 'reading', version: 1,
      title: s.title, textHash: s.textHash, reader: s.reader, consent: s.consent,
      readStart: s.readStart, readEnd: s.readEnd, sentAt: new Date().toISOString(),
      readerStats: scored.reader, marks: s.marks, grade: g, deletedByReader: dropped, notes,
      raw: $('#raw').checked ? { title: s.title, byline: s.byline, reader: s.reader, timeline: s.timeline, events: s.events, fps: s.fps, paragraphs: s.paragraphs, readStart: s.readStart, readEnd: s.readEnd, settleStart: s.settleStart, marks: s.marks, review: s.review } : null,
    };
    const slug = `${s.title}.${name}`.toLowerCase().replace(/[^a-z0-9.]+/g, '-');
    const p = await api.invoke('file:save-json', { suggested: `${slug}.reading.json`, dir: 'readings', json: JSON.stringify(reading, null, 1) });
    if (p) { toast(`Saved. Send this file to the writer: ${p}`, 6000); setTimeout(home, 1800); }
  };
}

// ---------------------------------------------------------------- writer
function writer() {
  crumbs(null); readline.hidden = true;
  const render = () => {
    const ms = S.manuscript?.ms;
    // Notes point at paragraphs by position, so a reading of a different text would land them on
    // the wrong paragraphs. Export only when every reading matches this manuscript.
    const mismatch = ms && S.readings.some((r) => r.data.textHash !== hashText(ms.paragraphs));
    view.innerHTML = `<section class="writer">
      <button class="link back" id="home">← Back</button>
      <h1 style="color:var(--cloth-ink)">Your readers in your margin</h1>
      <p class="lede">Choose your manuscript, add the reading files your readers sent, and each kept note becomes a Word comment on its paragraph.</p>
      <div class="sheet">
        <h2>Manuscript</h2>
        <div class="row" style="margin-top:10px">${ms ? `<span><b>${esc(ms.title)}</b><br><span class="small">${esc(S.manuscript.path)}</span></span><button class="link-ink" id="pick">Change</button>` : '<button class="btn" id="pick">Choose manuscript</button><span class="small">.docx, .md or .txt</span>'}</div>
        <h2 style="margin-top:28px">Readings</h2>
        <table class="files">${S.readings.map((r) => `<tr><td>${esc(r.data.reader.name)}</td><td>${r.data.notes.length} notes</td><td class="small">${esc(new Date(r.data.sentAt).toLocaleString())}</td><td>${ms && r.data.textHash !== hashText(ms.paragraphs) ? '<span class="error">read a different text than this manuscript</span>' : ''}</td></tr>`).join('') || '<tr><td class="small">None yet</td></tr>'}</table>
        <div class="row"><button class="btn${ms && !S.readings.length ? '' : ' quiet'}" id="add">Add reading files</button>
          <button class="btn" id="export" ${ms && S.readings.length && !mismatch ? '' : 'disabled'}>Write the notes into my manuscript</button></div>
        ${!mismatch && !(ms && S.readings.length) ? `<p class="small">${!ms ? 'Choose the manuscript first, then add the reading files your readers sent.' : 'Add at least one reading file to write the notes in.'}</p>` : ''}
        ${mismatch ? '<p class="error">A reading was made on a different text than this manuscript, so its notes would land on the wrong paragraphs. Choose the same file the reader read.</p>' : ''}
      </div>
      <figure class="word-preview" aria-label="Example of what the writer gets">
        <div class="sheet wp-page">
          <p>It is a truth universally acknowledged, that a single man in possession of a good fortune, must be in want of a wife.</p>
          <p><mark>“My dear Mr. Bennet,” said his lady to him one day, “have you heard that Netherfield Park is let at last?”</mark></p>
          <p>Mr. Bennet replied that he had not.</p>
        </div>
        <div class="wp-comment"><b>Reader</b><span>Gripped here (pulse +6 bpm vs their own median).</span></div>
        <figcaption>Example: each kept note lands as a Word comment on its paragraph, in your own file.</figcaption>
      </figure></section>`;
    $('#pick').onclick = async () => { const r = await api.invoke('manuscript:open'); if (r) { S.manuscript = r; render(); } };
    $('#add').onclick = async () => {
      const files = await api.invoke('file:open-json', { title: 'Add reading files', dir: 'readings' });
      for (const f of files) {
        if (f.data?.kind !== 'reading') continue;
        if (S.readings.some((r) => r.path === f.path || (r.data.sentAt === f.data.sentAt && r.data.reader?.name === f.data.reader?.name))) continue;
        S.readings.push(f);
      }
      render();
    };
    $('#home').onclick = home;
    $('#export').onclick = async () => {
      const comments = [];
      for (const r of S.readings) {
        const d = r.data, st = d.readerStats;
        const counts = d.notes.reduce((a, n) => ((a[n.camera] = (a[n.camera] || 0) + 1), a), {});
        comments.push({
          para: 0, author: d.reader.name,
          text: `Unskipped summary from ${d.reader.name}: read in ${((d.readEnd - d.readStart) / 60000).toFixed(1)} min, face readable ${Math.round((st.readableShare ?? 0) * 100)}% of the time. ` +
            `Smiled at ${counts.amused || 0} paragraphs, gripped by ${counts.gripped || 0}, may have drifted at ${counts.drifting || 0}, no reading for ${counts['no-reading'] || 0}. ` +
            `They marked ${d.marks.got.length} paragraphs as "got me" and ${d.marks.lost.length} as "lost me" themselves.`,
        });
        for (const n of d.notes) {
          const own = d.marks.got.includes(n.i) ? ' They marked this one "got me" themselves.' : d.marks.lost.includes(n.i) ? ' They marked this one "lost me" themselves.' : '';
          comments.push({ para: n.i, author: d.reader.name, text: n.text + own });
        }
      }
      const out = await api.invoke('docx:export', { manuscriptPath: S.manuscript.path, comments });
      if (out) { toast(`Wrote ${out}`); api.invoke('shell:open', out); }
    };
  };
  render();
}

// ---------------------------------------------------------------- replay (static page, no camera, no key)
async function replayBoot() {
  const src = new URLSearchParams(location.search).get('session') || '../../results/sessions/graded.json';
  const empty = (title, line) => {
    view.innerHTML = `<section class="home empty">
      <div class="home-copy">
        <h1>${esc(title)}</h1>
        <p class="lede">${line}</p>
        <div class="row"><a class="btn paper" href="https://github.com/JonathanSolvesProblems/unskipped">See the code and how to run it</a><a class="link" href="?mock=1">Walk through the screens with simulated signals</a></div>
      </div>
      ${samplePage()}
    </section>`;
  };
  let res;
  try { res = await fetch(src, { cache: 'no-store' }); } catch { res = null; }
  if (!res || !res.ok) {
    empty('No recorded reading here yet', 'Once one is published, this page plays it back through the app’s own scoring, with no camera needed.');
    return;
  }
  let s;
  try {
    const data = await res.json();
    s = data.raw ? { ...data.raw, reader: data.reader, marks: data.marks || data.raw.marks } : data;
    if (!Array.isArray(s.paragraphs) || !Array.isArray(s.timeline) || !Array.isArray(s.events) || !s.marks) throw new Error('not a session file');
  } catch {
    empty('This recording could not be read', 'The session file at this address is not one Unskipped wrote. Nothing else is shown rather than a guess.');
    return;
  }
  review(s, { replay: true });
}

if (REPLAY) replayBoot();
else if (params.get('screen')) {
  // dev-only: jump to a screen for layout review (?mock=1&screen=consent|settle|read|marks)
  await home();
  const go = params.get('screen');
  S.manuscript = await api.invoke('manuscript:open');
  consent();
  if (go !== 'consent') {
    $('#ok').checked = true; $('#ok').onchange({ target: $('#ok') }); await $('#go').onclick();
    if (go === 'read' || go === 'marks') { await new Promise((r) => setTimeout(r, 3500)); read(); }
    if (go === 'marks') { await new Promise((r) => setTimeout(r, 1500)); $('#done').onclick(); }
  }
} else home();
