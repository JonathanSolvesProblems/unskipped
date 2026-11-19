import { scoreSession, commentFor } from '../../src/score.js';
import { grade } from '../../src/grade.js';

// In the desktop app the preload exposes window.unskipped. On the static replay page it is
// absent, and the page replays a recorded reading instead (no camera, no key).
const api = window.unskipped || null;
const REPLAY = !api;

const $ = (sel, el = document) => el.querySelector(sel);
const view = $('#view');
const readline = $('#readline');
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const ART = 'art/';

const STEPS = ['Consent', 'Settle', 'Read', 'Your marks', 'Review'];
function crumbs(on) {
  const k = STEPS.indexOf(on);
  $('#crumbs').innerHTML = on ? STEPS.map((s, i) => `<span class="${i === k ? 'on' : i < k ? 'done' : ''}" ${i === k ? 'aria-current="step"' : ''}>${s}</span>`).join('') : '';
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

// ---------------------------------------------------------------- home
async function home() {
  crumbs(null); readline.hidden = true;
  S.env = await api.invoke('env:info');
  view.innerHTML = `
  <section class="home">
    <div>
      <h1>Find out where your reader stopped caring</h1>
      <p class="lede">A reader who agrees to it reads your chapter in front of their laptop camera. Presage SmartSpectra reads their pulse, blinks and smiles on that laptop, paragraph by paragraph, and every paragraph that moved them, or lost them, comes back to you flagged in the margin of your own manuscript.</p>
      <p class="quote">"Try to leave out the part that readers tend to skip." Elmore Leonard, The New York Times, 2001</p>
      <div class="paths">
        <div class="slip path">
          <h2>I'm reading</h2>
          <p>Open the chapter the writer sent you. You see what is measured before the camera turns on, and you approve every note before anything is sent.</p>
          <button class="btn" id="read">Open a chapter</button>
          ${S.env.hasKey ? '' : '<p class="small error" style="margin:12px 0 0">No Presage API key found. Add PRESAGE_API_KEY to .env to read live.</p>'}
        </div>
        <div class="slip path">
          <h2>I'm the writer</h2>
          <p>Add your readers' files to your manuscript. Each note lands as a Word comment on its paragraph, signed with the reader's name.</p>
          <button class="btn quiet" id="write">Add readings</button>
        </div>
      </div>
    </div>
    <div class="art"><img src="${ART}hero.png" alt="A closed hardback book on green cloth with pink, yellow and blue page flags fanned out of its edge"></div>
    <footer class="foot">
      <span>SmartSpectra SDK ${esc(S.env.sdk)} · camera: ${S.env.cameras.map((c) => esc(c.name)).join(', ') || 'none found'}</span>
      <span>Made by Jonathan Andrei for writers who keep hearing "loved it." More of what I build at <a href="https://jonathansolvesproblems.com" id="site">jonathansolvesproblems.com</a></span>
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
  <section class="consent-wrap">
    <div class="sheet consent">
      <h1>Before the camera turns on</h1>
      <p class="lede">You are about to read <em>${esc(ms.title)}</em>, ${ms.paragraphs.length} paragraphs, about ${minutes} minutes.</p>
      <dl>
        <dt>What is read</dt><dd>Your pulse rate, your blinks, your smiles, whether you are talking, and whether your face is turned to the page. Presage SmartSpectra works these out from the camera image.</dd>
        <dt>Where</dt><dd>On this computer. No video or picture is recorded or sent anywhere. The SDK contacts Presage only to check the API key and count usage.</dd>
        <dt>SDK telemetry</dt><dd>Off. Unskipped starts the SDK with telemetry disabled.</dd>
        <dt>What the writer gets</dt><dd>Only the notes you keep on the last screen, one per paragraph, with your name. You can keep none.</dd>
        <dt>Your own marks</dt><dd>When you finish, you mark the paragraphs that got you and lost you yourself, before you see anything the camera noticed.</dd>
        <dt>Stopping</dt><dd>Press Stop at any time. Closing the window turns the camera off.</dd>
        <dt>Not about health</dt><dd>These readings describe how you read one piece. They say nothing about your health.</dd>
      </dl>
      <label class="agree"><input type="checkbox" id="ok"> I agree to be measured while I read this piece</label>
      <div class="fields">
        <label>Your name, as the writer will see it <input type="text" id="name" value="Reader"></label>
        <label>Camera <select id="cam">${cams.map((c, i) => `<option value="${i}">${esc(c.name)}</option>`).join('')}</select></label>
      </div>
      <div class="row"><button class="btn" id="go" disabled>Turn on the camera</button><button class="btn quiet" id="back">Not now</button></div>
    </div>
    <aside class="side-art"><img src="${ART}settle.png" alt="Reading glasses resting on an open paperback">
      <p>Nothing is measured until you press Start reading on the next screen, and nothing leaves this laptop until you press Send.</p></aside>
  </section>`;
  $('#ok').onchange = (e) => { $('#go').disabled = !e.target.checked || !S.env.hasKey || !cams.length; };
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

function railHtml() {
  return `<aside class="rail">
    <div class="slip"><canvas id="preview" width="192" height="108" aria-label="Live camera preview"></canvas>
      <p class="small" style="margin:8px 0 0">Live camera, on this laptop only. Not recorded.</p></div>
    <div class="slip"><div class="readout" id="readout"></div><svg class="spark" id="spark" viewBox="0 0 100 38" preserveAspectRatio="none" aria-hidden="true"></svg></div>
    <div class="slip state" id="status" role="status"></div>
  </aside>`;
}
function paintRail() {
  const L = S.live, t = now();
  const span = Math.min(60000, Math.max(1, t));
  const blinksMin = L.blinks.filter((b) => b > t - 60000).length * (60000 / span);
  const confident = L.pulse && (L.pulse.c ?? 0) >= 40;
  const ro = $('#readout');
  if (ro) ro.innerHTML = `
    <span class="dot grip"></span><span class="k">Pulse</span><b>${confident ? L.pulse.v.toFixed(0) : '<span class="small">settling</span>'}</b>
    <span class="dot"></span><span class="k">Blinks a minute</span><b>${t > 10000 ? blinksMin.toFixed(0) : '<span class="small">…</span>'}</b>
    <span class="dot smile"></span><span class="k">Smiling</span><b>${L.smile >= 50 ? 'yes' : 'no'}</b>`;
  const sp = $('#spark');
  if (sp && L.pulseHist.length > 1) {
    const h = L.pulseHist.filter(([tt]) => tt > t - 90000);
    const vs = h.map((x) => x[1]); const lo = Math.min(...vs) - 2, hi = Math.max(...vs) + 2;
    const pts = h.map(([tt, v]) => `${(100 * (tt - (t - 90000)) / 90000).toFixed(1)},${(38 - 38 * (v - lo) / (hi - lo)).toFixed(1)}`).join(' ');
    sp.innerHTML = `<polyline points="${pts}" fill="none" stroke="#1a1f1c" stroke-width="1.3" vector-effect="non-scaling-stroke"/>`;
  }
  const st = $('#status');
  if (st) st.innerHTML = `<span class="${L.code === 0 ? 'ok' : 'warn'}">${esc(HINTS[L.code] ?? L.hint ?? L.code)}</span><span class="small">${L.fps} fps</span>`;
}

// ---------------------------------------------------------------- settle
function settle() {
  crumbs('Settle'); readline.hidden = true;
  view.innerHTML = `<section class="reading">
    <div class="sheet page" style="padding-bottom:64px">
      <h1>Sit so the camera sees your face and the top of your chest</h1>
      <p>Sit back a little, so the preview shows you down to the collarbones. Light in front of you, not behind. Your first pulse reading comes after about fifteen seconds of a steady picture.</p>
      <p class="small" id="settleMsg" role="status">Waiting for a steady pulse</p>
      <div class="row"><button class="btn" id="start" disabled>Start reading</button><button class="btn quiet" id="stop">Stop</button></div>
    </div>${railHtml()}</section>`;
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
      <div class="row" style="margin-top:44px"><button class="btn" id="done">I've finished</button></div>
    </article>${railHtml()}</section>`;
  window.scrollTo(0, 0);
  s.readStart = now();
  const paras = [...view.querySelectorAll('#page p[data-i]')];
  let current = -1;
  const track = () => {
    const y = window.innerHeight * 0.38;
    let pick = -1;
    for (const el of paras) {
      const r = el.getBoundingClientRect();
      if (r.top <= y && r.bottom >= y) { pick = Number(el.dataset.i); break; }
      if (r.top > y) { pick = Number(el.dataset.i); break; }
    }
    if (pick !== current && pick >= 0) {
      if (current >= 0) paras[current].classList.remove('focus');
      paras[pick].classList.add('focus'); current = pick;
      s.timeline.push({ t: now(), p: pick });
    }
  };
  track();
  window.onscroll = track;
  S.focusTimer = setInterval(track, 250);
  S.railTimer = setInterval(paintRail, 500);
  $('#done').onclick = async () => { s.readEnd = now(); window.onscroll = null; await stopLive(); marks(); };
}

// ---------------------------------------------------------------- marks (before any note is shown)
function marks() {
  crumbs('Your marks'); readline.hidden = true;
  const s = S.session;
  const state = new Map();
  view.innerHTML = `<section class="marks-wrap">
    <div class="marks-head"><h1>Your marks first</h1>
    <p class="lede">Before you see anything the camera noticed, click the paragraphs that got you. Click twice for the ones that lost you, or that you skimmed. Click again to clear.</p></div>
    <article class="sheet markable">${s.paragraphs.map((p, i) => `<p data-i="${i}" tabindex="0" role="button" aria-pressed="false">${esc(p.text)}</p>`).join('')}</article>
    <div class="dock on-cloth"><button class="btn" id="save">Save my marks and show the flags</button><span class="small" id="count"></span></div>
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
    ? `Of the <span class="n">${gm.marked}</span> paragraphs you marked as got me, the camera flagged <span class="n">${gm.found}</span>`
    : 'You marked nothing as got me. Here is what the camera noticed';
  view.innerHTML = `<section class="review">
    <div class="verdict">
      <h1>${headline}</h1>
      <p class="base">Time on the page alone found ${gd.found}${gm.marked ? ` of ${gd.marked}` : ''}. ${g.refused.length ? `${g.refused.length} paragraph${g.refused.length > 1 ? 's' : ''} had no reading, and say so.` : 'Every paragraph had a reading.'} Read in ${minutes} minutes, face readable ${pct(scored.reader.readableShare)} of the time.</p>
    </div>
    <article class="sheet annot" id="annot">
      ${scored.paragraphs.map((n, i) => {
        const f = FLAG[n.camera];
        const mark = s.marks.got.includes(i) ? 'got' : s.marks.lost.includes(i) ? 'lost' : '';
        return `<div class="para ${mark}" data-i="${i}">${esc(s.paragraphs[i].text)}${f ? `<button class="flag ${f}" style="--k:${i}" data-i="${i}" aria-pressed="true" aria-label="${esc(MEANING[f])}. ${replay ? 'Show note' : 'Show note; press again to drop it'}"></button>` : ''}</div>`;
      }).join('')}
    </article>
    <aside class="notes">
      <div class="legend">
        ${['grip', 'smile', 'drift', 'none'].map((f) => `<div><span class="flag mini ${f}"></span>${MEANING[f]}</div>`).join('')}
        <div><span style="display:inline-block;width:30px;margin-right:8px;border-left:3px solid var(--cloth-mute);height:12px;vertical-align:-1px"></span>Your own marks</div>
      </div>
      <div class="slip note-slip" id="note"><h3>Select a flag</h3><p class="small">Each flag says what the camera saw on that paragraph and how sure it was.</p></div>
      ${replay ? `<div class="slip"><p style="margin:0;font-size:14px;line-height:1.5">This is a recorded reading, replayed from its session file: the same scoring code, no camera and no key. The live app runs on the desktop with a SmartSpectra key.</p></div>` : `
      <div class="send on-cloth">
        <button class="btn" id="send">Send the kept notes to the writer</button>
        <label><input type="checkbox" id="raw"> Also include the raw signal samples, for research. Off by default.</label>
      </div>`}
    </aside>
  </section>`;
  requestAnimationFrame(() => $('#annot').classList.add('reveal'));
  const showNote = (i) => {
    const n = scored.paragraphs[i];
    view.querySelectorAll('.annot .para.sel').forEach((el) => el.classList.remove('sel'));
    view.querySelector(`.annot .para[data-i="${i}"]`)?.classList.add('sel');
    const e = n.evidence || {};
    const ev = [
      e.pulseDelta === null || e.pulseDelta === undefined ? null
        : Math.abs(e.pulseDelta) < 1 ? 'pulse at your median' : `pulse ${e.pulseDelta > 0 ? '+' : ''}${e.pulseDelta} bpm against your median`,
      Number.isFinite(e.blinkRatio) ? `blinking at ${Math.round(e.blinkRatio * 100)}% of your usual rate` : null,
      e.smileMs ? `smiling ${(e.smileMs / 1000).toFixed(1)} s` : null,
      e.dwellRatio ? `time on the page ${e.dwellRatio}x your usual` : null,
    ].filter(Boolean);
    const own = s.marks.got.includes(i) ? 'You marked it got me.' : s.marks.lost.includes(i) ? 'You marked it lost me.' : '';
    $('#note').innerHTML = `<h3>Paragraph ${i + 1}${kept.has(i) ? '' : ', dropped'}</h3><p>${esc(commentFor(n, name) || 'Nothing to say about this one.')}</p>
      <p class="ev">${esc(ev.join(' · '))}${own ? `<br>${own}` : ''}</p>`;
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
    view.innerHTML = `<section class="writer">
      <h1 style="color:var(--cloth-ink)">Your readers in your margin</h1>
      <p class="lede">Choose your manuscript, add the reading files your readers sent, and each kept note becomes a Word comment on its paragraph.</p>
      <div class="sheet">
        <div class="row"><button class="btn quiet" id="pick">${ms ? 'Change manuscript' : 'Choose manuscript'}</button>
          <span>${ms ? `<b>${esc(ms.title)}</b><br><span class="small">${esc(S.manuscript.path)}</span>` : '<span class="small">.docx, .md or .txt</span>'}</span></div>
        <h2 style="margin-top:28px">Readings</h2>
        <table class="files">${S.readings.map((r) => `<tr><td>${esc(r.data.reader.name)}</td><td>${r.data.notes.length} notes</td><td class="small">${esc(new Date(r.data.sentAt).toLocaleString())}</td><td>${ms && r.data.textHash !== hashText(ms.paragraphs) ? '<span class="error">read a different text than this manuscript</span>' : ''}</td></tr>`).join('') || '<tr><td class="small">None yet</td></tr>'}</table>
        <div class="row"><button class="btn quiet" id="add">Add reading files</button>
          <button class="btn" id="export" ${ms && S.readings.length ? '' : 'disabled'}>Write the notes into my manuscript</button>
          <button class="btn quiet" id="home">Back</button></div>
      </div></section>`;
    $('#pick').onclick = async () => { const r = await api.invoke('manuscript:open'); if (r) { S.manuscript = r; render(); } };
    $('#add').onclick = async () => {
      const files = await api.invoke('file:open-json', { title: 'Add reading files', dir: 'readings' });
      for (const f of files) if (f.data?.kind === 'reading') S.readings.push(f);
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
  const src = new URLSearchParams(location.search).get('session') || 'replay/session.json';
  try {
    const data = await (await fetch(src)).json();
    const s = data.raw ? { ...data.raw, reader: data.reader, marks: data.marks || data.raw.marks } : data;
    review(s, { replay: true });
  } catch (e) {
    view.innerHTML = `<section class="writer"><h1 style="color:var(--cloth-ink)">No recorded reading here yet</h1><p class="lede">${esc(e.message)}</p></section>`;
  }
}

if (REPLAY) replayBoot(); else home();
