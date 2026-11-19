import { scoreSession, commentFor, paragraphAt } from '../../src/score.js';
import { grade } from '../../src/grade.js';

const api = window.unskipped;
const $ = (sel, el = document) => el.querySelector(sel);
const view = $('#view');
const readline = $('#readline');
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const STEPS = ['Consent', 'Settle', 'Read', 'Your marks', 'Review'];
function crumbs(on) {
  $('#crumbs').innerHTML = on ? STEPS.map((s) => `<span class="${s === on ? 'on' : ''}">${s}</span>`).join('<span>·</span>') : '';
}
function toast(msg, ms = 2600) {
  const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg;
  document.body.append(t); setTimeout(() => t.remove(), ms);
}

function hashText(paragraphs) {
  let h = 2166136261;
  for (const ch of paragraphs.map((p) => p.text).join('\n')) { h ^= ch.codePointAt(0); h = Math.imul(h, 16777619) >>> 0; }
  return h.toString(16);
}

// ---------------------------------------------------------------- state
const S = {
  env: null,
  manuscript: null,      // { path, ms }
  session: null,         // recorded reading
  t0: 0,
  live: { pulse: null, breath: null, blinks: [], smile: 0, code: 0, hint: '', fps: 0, status: null, pulseHist: [] },
  unsub: [],
  readings: [],          // writer side: loaded reading files
};

// ---------------------------------------------------------------- home
async function home() {
  crumbs(null); readline.hidden = true;
  S.env = await api.invoke('env:info');
  view.innerHTML = `
  <div class="center">
    <h1>Where did your reader stop caring?</h1>
    <p class="lead">Beta readers say "loved it." Unskipped lets a reader who agrees to it read your chapter in front of their laptop camera.
    Presage SmartSpectra reads their pulse, blinks and smiles on the device, paragraph by paragraph, and you get the result as
    comments in the margin of your own manuscript.</p>
    <p class="muted">"Try to leave out the part that readers tend to skip." Elmore Leonard, The New York Times, July 16, 2001.</p>
    <div class="cards">
      <div class="card">
        <h2>I'm reading</h2>
        <p class="muted">Open the chapter the writer sent you. You will see exactly what is measured before the camera turns on, mark your own moments, and approve every note before anything is sent.</p>
        <button class="btn pencil" id="read">Open a chapter to read</button>
        ${S.env.hasKey ? '' : '<p class="error muted">No Presage API key found. Add PRESAGE_API_KEY to .env to read live.</p>'}
      </div>
      <div class="card">
        <h2>I'm the writer</h2>
        <p class="muted">Add your readers' files to your manuscript. Each note lands as a Word comment on its paragraph, with the reader's name, in your own .docx.</p>
        <button class="btn ghost" id="write">Add readings to my manuscript</button>
      </div>
    </div>
    <p class="muted" style="margin-top:26px">SmartSpectra SDK ${esc(S.env.sdk)} · cameras: ${S.env.cameras.map((c) => esc(c.name)).join(', ') || 'none found'}</p>
  </div>`;
  $('#read').onclick = async () => {
    const r = await api.invoke('manuscript:open');
    if (!r) return;
    S.manuscript = r;
    consent();
  };
  $('#write').onclick = writer;
}

// ---------------------------------------------------------------- consent
function consent() {
  crumbs('Consent'); readline.hidden = true;
  const ms = S.manuscript.ms;
  const cams = S.env.cameras;
  view.innerHTML = `
  <div class="center">
    <h1>Before the camera turns on</h1>
    <p class="lead">You are about to read <em>${esc(ms.title)}</em> (${ms.paragraphs.length} paragraphs, about ${Math.round(ms.paragraphs.reduce((a, p) => a + p.words, 0) / 230)} minutes).</p>
    <div class="consent">
      <dl>
        <dt>What is read</dt><dd>Your pulse rate, breathing rate, blinks, smiles, whether you are talking, and whether your face is turned to the page. Presage SmartSpectra works these out from the camera image.</dd>
        <dt>Where it happens</dt><dd>On this computer. No video or image is recorded or sent anywhere. The SDK contacts Presage only to check the API key and count usage.</dd>
        <dt>SDK telemetry</dt><dd>Off. Unskipped starts the SDK with <code>enableTelemetry: false</code>.</dd>
        <dt>What the writer gets</dt><dd>Only the notes you approve on the last screen, one per paragraph, with your name. You can delete any note, or send nothing at all.</dd>
        <dt>Your own marks</dt><dd>When you finish, you mark the paragraphs that got you and the ones that lost you, before you see anything the camera noticed.</dd>
        <dt>Stopping</dt><dd>Press Stop at any time. Closing the window stops the camera.</dd>
        <dt>Not a health tool</dt><dd>These readings describe how you read one piece. They say nothing about your health.</dd>
      </dl>
    </div>
    <label class="agree"><input type="checkbox" id="ok"> I agree to be measured while I read this piece.</label>
    <div class="row">
      <label>Your name for the writer <input type="text" id="name" value="Reader" size="16"></label>
      <label>Camera <select id="cam">${cams.map((c, i) => `<option value="${i}">${esc(c.name)}</option>`).join('')}</select></label>
    </div>
    <div class="row" style="margin-top:20px">
      <button class="btn pencil" id="go" disabled>Turn on the camera</button>
      <button class="btn ghost" id="back">Not now</button>
    </div>
  </div>`;
  $('#ok').onchange = (e) => { $('#go').disabled = !e.target.checked || !S.env.hasKey || !cams.length; };
  $('#back').onclick = home;
  $('#go').onclick = async () => {
    const cam = cams[Number($('#cam').value)];
    const ms2 = S.manuscript.ms;
    S.session = {
      app: 'unskipped', kind: 'session', version: 1,
      title: ms2.title, byline: ms2.byline, textHash: hashText(ms2.paragraphs),
      paragraphs: ms2.paragraphs.map((p) => ({ text: p.text, words: p.words })),
      reader: { name: $('#name').value.trim() || 'Reader' },
      consent: { agreedAt: new Date().toISOString(), telemetry: false, camera: cam.name, sdk: S.env.sdk },
      timeline: [], events: [], fps: [], readStart: null, readEnd: null, marks: null,
    };
    try {
      const { t0 } = await api.invoke('capture:start', { cameraId: cam.id });
      S.t0 = t0;
      wireLive();
      settle();
    } catch (e) {
      toast(`Camera did not start: ${e.message}`, 6000);
    }
  };
}

// ---------------------------------------------------------------- live signal wiring
const now = () => Date.now() - S.t0;
function wireLive() {
  S.unsub.forEach((u) => u()); S.unsub = [];
  const L = S.live = { pulse: null, breath: null, blinks: [], smile: 0, code: 0, hint: '', fps: 0, status: null, pulseHist: [], lastBlink: false };
  S.unsub.push(api.on('sdk:sample', (s) => {
    S.session.events.push({ t: s.t, kind: 'sample', s });
    if (s.pulse) { L.pulse = s.pulse; if ((s.pulse.c ?? 0) >= 40) L.pulseHist.push([s.t, s.pulse.v]); }
    if (s.breath) L.breath = s.breath;
    if (s.expr) L.smile = s.expr.happy;
    for (const b of s.blink || []) { if (b.on && !L.lastBlink) L.blinks.push(b.t); L.lastBlink = b.on; }
  }));
  S.unsub.push(api.on('sdk:validation', (v) => { S.session.events.push({ t: v.t, kind: 'validation', code: v.code, hint: v.hint }); L.code = v.code; L.hint = v.hint; }));
  S.unsub.push(api.on('sdk:status', (v) => { L.status = v.status; S.session.events.push({ t: v.t, kind: 'status', status: v.status }); }));
  S.unsub.push(api.on('sdk:error', (v) => { S.session.events.push({ t: v.t, kind: 'error', ...v }); toast(`SmartSpectra: ${v.message} (code ${v.code})`, 6000); }));
  S.unsub.push(api.on('sdk:fps', (v) => { L.fps = v.fps; S.session.fps.push([v.t, v.fps]); }));
  S.unsub.push(api.on('sdk:frame', (f) => {
    const c = document.getElementById('preview');
    if (!c) return;
    c.width = f.w; c.height = f.h;
    const img = new ImageData(f.w, f.h);
    img.data.set(f.data);
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

const HINTS = { 0: 'Good', 1: 'No face found', 2: 'More than one face', 3: 'Centre your face', 4: 'Adjust distance', 5: 'Too dark', 6: 'Too bright', 10: 'Camera adjusting', 11: 'Frame rate too low', 12: 'Hold still', 13: 'Too close', 14: 'Too far', 15: 'Move down a little', 16: 'Move up a little', 17: 'Face the screen' };

function railHtml() {
  return `<div class="rail">
    <div class="box"><canvas id="preview" width="192" height="108"></canvas><div class="muted" style="margin-top:6px">Live camera, on this computer only. Not recorded.</div></div>
    <div class="box"><div class="readout" id="readout"></div><svg class="spark" id="spark" viewBox="0 0 100 40" preserveAspectRatio="none"></svg></div>
    <div class="box" id="status"></div>
  </div>`;
}
function paintRail() {
  const L = S.live, t = now();
  const blinksMin = L.blinks.filter((b) => b > t - 60000).length * (60000 / Math.min(60000, Math.max(1, t)));
  const ro = $('#readout');
  if (ro) ro.innerHTML = `
    <span class="k">Pulse</span><b>${L.pulse && (L.pulse.c ?? 0) >= 40 ? `${L.pulse.v.toFixed(0)} bpm` : '<span class="muted">settling</span>'}</b>
    <span class="k">Breathing</span><b>${L.breath && (L.breath.c ?? 0) >= 45 ? `${L.breath.v.toFixed(0)} /min` : '<span class="muted">needs 30 s</span>'}</b>
    <span class="k">Blinks</span><b>${t > 10000 ? blinksMin.toFixed(0) + ' /min' : '<span class="muted">…</span>'}</b>
    <span class="k">Smile</span><b>${L.smile >= 50 ? '◡ yes' : '–'}</b>`;
  const sp = $('#spark');
  if (sp && L.pulseHist.length > 1) {
    const h = L.pulseHist.filter(([tt]) => tt > t - 90000);
    const vs = h.map((x) => x[1]); const lo = Math.min(...vs) - 2, hi = Math.max(...vs) + 2;
    const pts = h.map(([tt, v]) => `${(100 * (tt - (t - 90000)) / 90000).toFixed(1)},${(40 - 40 * (v - lo) / (hi - lo)).toFixed(1)}`).join(' ');
    sp.innerHTML = `<polyline points="${pts}" fill="none" stroke="#b23a26" stroke-width="1.2" vector-effect="non-scaling-stroke"/>`;
  }
  const st = $('#status');
  if (st) st.innerHTML = `<span class="pill ${L.code === 0 ? 'ok' : 'warn'}">${HINTS[L.code] ?? L.hint ?? L.code}</span> <span class="muted">${L.fps} fps</span>`;
}

// ---------------------------------------------------------------- settle
function settle() {
  crumbs('Settle'); readline.hidden = true;
  view.innerHTML = `<div class="reading">
    <div class="page" style="padding-bottom:56px">
      <h1>Sit where the camera sees your face and the top of your chest</h1>
      <p>Sit back a little, so the preview shows you down to the collarbones. Face the screen, light in front of you,
      not behind. Your first pulse reading comes after about fifteen seconds of a steady picture.
      Reading starts when you press the button; nothing before that counts.</p>
      <p class="muted" id="settleMsg">Waiting for a steady pulse…</p>
      <div class="row"><button class="btn pencil" id="start" disabled>Start reading</button><button class="btn ghost" id="stop">Stop</button></div>
    </div>${railHtml()}</div>`;
  S.session.settleStart = now();
  S.railTimer = setInterval(() => {
    paintRail();
    const ready = (S.live.pulse && (S.live.pulse.c ?? 0) >= 40) || now() - S.session.settleStart > 25000;
    $('#start').disabled = !ready;
    if (ready) $('#settleMsg').textContent = S.live.pulse && (S.live.pulse.c ?? 0) >= 40 ? 'Steady. Start whenever you like.' : 'Still settling, but you can start; the first paragraphs may have less to say.';
  }, 500);
  $('#start').onclick = read;
  $('#stop').onclick = async () => { await stopLive(); home(); };
}

// ---------------------------------------------------------------- read
function read() {
  clearInterval(S.railTimer);
  crumbs('Read'); readline.hidden = false;
  const s = S.session;
  view.innerHTML = `<div class="reading">
    <div class="page" id="page">
      <h1>${esc(s.title)}</h1>${s.byline ? `<div class="byline">${esc(s.byline)}</div>` : ''}
      ${s.paragraphs.map((p, i) => `<p data-i="${i}">${esc(p.text)}</p>`).join('')}
      <div class="row" style="margin-top:40px"><button class="btn pencil" id="done">I've finished</button></div>
    </div>${railHtml()}</div>`;
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
      if (r.top > y) { pick = Number(el.dataset.i); break; } // in a gap: the next paragraph down
    }
    if (pick !== current && pick >= 0) {
      if (current >= 0) paras[current].classList.remove('focus');
      paras[pick].classList.add('focus');
      current = pick;
      s.timeline.push({ t: now(), p: pick });
    }
  };
  track();
  window.onscroll = track;
  S.focusTimer = setInterval(track, 250);
  S.railTimer = setInterval(paintRail, 500);
  $('#done').onclick = async () => {
    s.readEnd = now();
    window.onscroll = null;
    await stopLive();
    marks();
  };
}

// ---------------------------------------------------------------- marks (before any note is shown)
function marks() {
  crumbs('Your marks'); readline.hidden = true;
  const s = S.session;
  const state = new Map();
  view.innerHTML = `<div class="center" style="max-width:820px">
    <h1>Your marks first</h1>
    <p class="lead">Before you see anything the camera noticed: click the paragraphs that <b style="color:var(--got)">got you</b> (once) and the ones that <b style="color:var(--lost)">lost you</b> (twice). Click again to clear.</p>
    <div class="legend"><span><i style="background:var(--got)"></i>got me</span><span><i style="background:var(--lost)"></i>lost me / skimmed</span></div>
    <div class="page markable" style="padding:36px 44px;margin-top:14px;font-size:17px">
      ${s.paragraphs.map((p, i) => `<p data-i="${i}">${esc(p.text)}</p>`).join('')}
    </div>
    <div class="row" style="margin:18px 0 60px"><button class="btn pencil" id="save">Save my marks and show the notes</button><span class="muted" id="count"></span></div>
  </div>`;
  const count = () => {
    const g = [...state.values()].filter((v) => v === 'got').length, l = [...state.values()].filter((v) => v === 'lost').length;
    $('#count').textContent = `${g} got me · ${l} lost me`;
  };
  view.querySelectorAll('.markable p').forEach((el) => {
    el.onclick = () => {
      const i = Number(el.dataset.i);
      const next = { undefined: 'got', got: 'lost', lost: undefined }[state.get(i)];
      el.classList.remove('got', 'lost');
      if (next) { state.set(i, next); el.classList.add(next); } else state.delete(i);
      count();
    };
  });
  count();
  $('#save').onclick = async () => {
    s.marks = {
      savedAt: new Date().toISOString(),
      got: [...state].filter(([, v]) => v === 'got').map(([i]) => i).sort((a, b) => a - b),
      lost: [...state].filter(([, v]) => v === 'lost').map(([i]) => i).sort((a, b) => a - b),
    };
    await api.invoke('session:backup', JSON.stringify(s));
    review();
  };
}

// ---------------------------------------------------------------- review
function review() {
  crumbs('Review'); readline.hidden = true;
  const s = S.session;
  s.review = { openedAt: new Date().toISOString() };
  const scored = scoreSession(s);
  const g = grade(scored.paragraphs, s.marks);
  const deleted = new Set();
  const name = s.reader.name;
  const fmt = (x) => (x === null || x === undefined ? '–' : `${Math.round(x * 100)}%`);
  const minutes = ((s.readEnd - s.readStart) / 60000).toFixed(1);
  view.innerHTML = `<div class="review">
    <h1>What the camera noticed</h1>
    <p class="lead">You read for ${minutes} minutes. Your face was readable ${fmt(scored.reader.readableShare)} of that time. Your own pace was ${scored.reader.msPerWord ?? '–'} ms a word, your pulse median ${scored.reader.pulseMedian ?? '–'} bpm, your blink rate ${scored.reader.blinkPerMin ?? '–'} a minute.</p>
    <div class="score">
      <div class="card"><div class="big">${g.camera.got.found}<span class="muted" style="font-size:20px"> of ${g.camera.got.marked}</span></div><div class="lbl">paragraphs you marked "got me" that the camera also flagged (it flagged ${g.camera.got.flagged})</div></div>
      <div class="card"><div class="big">${g.dwell.got.found}<span class="muted" style="font-size:20px"> of ${g.dwell.got.marked}</span></div><div class="lbl">found by time-per-word alone, the way reading apps measure (it flagged ${g.dwell.got.flagged})</div></div>
      <div class="card"><div class="big">${g.refused.length}</div><div class="lbl">paragraphs with no reading: the camera could not tell, so Unskipped says so instead of guessing</div></div>
    </div>
    <p class="muted">Delete any note you do not want the writer to see. Only what is left is sent.</p>
    <div class="annot">
      ${scored.paragraphs.map((n, i) => {
        const c = commentFor(n, name);
        const mark = s.marks.got.includes(i) ? 'got' : s.marks.lost.includes(i) ? 'lost' : '';
        return `<div class="para ${mark}">${esc(s.paragraphs[i].text)}</div>
          <div class="note ${c ? n.camera : 'none'}" data-i="${i}">${c ? `${esc(c)}<button class="x" title="Delete this note">×</button>` : '.'}
          ${mark ? `<span class="yours">You marked: ${mark === 'got' ? 'got me' : 'lost me'}</span>` : ''}</div>`;
      }).join('')}
    </div>
    <div class="row" style="margin:20px 0 60px">
      <button class="btn pencil" id="send">Send the remaining notes to the writer</button>
      <label class="muted"><input type="checkbox" id="raw"> Also include the raw signal samples (for research; off by default)</label>
    </div>
  </div>`;
  view.querySelectorAll('.note .x').forEach((b) => {
    b.onclick = () => {
      const el = b.parentElement, i = Number(el.dataset.i);
      if (deleted.has(i)) { deleted.delete(i); el.classList.remove('deleted'); } else { deleted.add(i); el.classList.add('deleted'); }
    };
  });
  $('#send').onclick = async () => {
    const notes = scored.paragraphs
      .map((n) => ({ i: n.i, camera: n.camera, dwell: n.dwell, evidence: n.evidence, reason: n.reason, text: commentFor(n, name) }))
      .filter((n) => n.text && !deleted.has(n.i));
    const reading = {
      app: 'unskipped', kind: 'reading', version: 1,
      title: s.title, textHash: s.textHash, reader: s.reader, consent: s.consent,
      readStart: s.readStart, readEnd: s.readEnd, sentAt: new Date().toISOString(),
      readerStats: scored.reader, marks: s.marks, grade: g, deletedByReader: [...deleted],
      notes,
      raw: $('#raw').checked ? { timeline: s.timeline, events: s.events, fps: s.fps, paragraphs: s.paragraphs, readStart: s.readStart, readEnd: s.readEnd, settleStart: s.settleStart, reviewOpenedAt: s.review.openedAt } : null,
    };
    const slug = `${s.title}.${name}`.toLowerCase().replace(/[^a-z0-9.]+/g, '-');
    const p = await api.invoke('file:save-json', { suggested: `${slug}.reading.json`, dir: 'readings', json: JSON.stringify(reading, null, 1) });
    if (p) { toast(`Saved ${p}. Send this file to the writer.`, 5000); setTimeout(home, 1500); }
  };
}

// ---------------------------------------------------------------- writer
async function writer() {
  crumbs(null); readline.hidden = true;
  const render = () => {
    const ms = S.manuscript?.ms;
    view.innerHTML = `<div class="center">
      <h1>Your readers, in your margin</h1>
      <p class="lead">Pick your manuscript, add the reading files your readers sent, and Unskipped writes each note as a Word comment on its paragraph.</p>
      <div class="card">
        <div class="row"><button class="btn ghost" id="pick">${ms ? 'Change manuscript' : 'Choose manuscript'}</button>
        <span>${ms ? `<b>${esc(ms.title)}</b> <span class="muted">${esc(S.manuscript.path)}</span>` : '<span class="muted">.docx, .md or .txt</span>'}</span></div>
        <h2>Readings</h2>
        <table class="files">${S.readings.map((r) => `<tr><td>${esc(r.data.reader.name)}</td><td>${r.data.notes.length} notes</td><td class="muted">${esc(r.data.sentAt)}</td><td>${ms && r.data.textHash !== hashText(ms.paragraphs) ? '<span class="error">different text than this manuscript</span>' : ''}</td></tr>`).join('') || '<tr><td class="muted">None yet</td></tr>'}</table>
        <div class="row" style="margin-top:14px"><button class="btn ghost" id="add">Add reading files</button>
        <button class="btn pencil" id="export" ${ms && S.readings.length ? '' : 'disabled'}>Write the notes into my manuscript</button>
        <button class="btn ghost" id="home">Back</button></div>
      </div></div>`;
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
        const d = r.data;
        const st = d.readerStats;
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

home();
