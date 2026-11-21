// Per-paragraph reading notes from a recorded session.
//
// A session holds: the paragraphs, a focus timeline (which paragraph sat on the
// reading line, and when), compact SmartSpectra samples and validation events.
// Everything here is a pure function of the session file, so `npm run check`
// re-scores committed sessions and gets the same notes.
//
// Thresholds are fixed in THRESHOLDS and were committed before the graded read.

export const THRESHOLDS = {
  minValidShare: 0.5,      // under half the paragraph's time readable -> "no reading"
  minValidMs: 3000,        // need at least 3 s of readable time to say anything
  pulseLagMs: 6000,        // pulse is a ~12 s average; its centre sits ~6 s back
  pulseMinConfidence: 40,  // Presage's own "stable" threshold for pulse
  pulseRiseBpm: 4,         // pulse this far over the reader's own median = up
  blinkLowRatio: 0.6,      // blink rate under 60% of the reader's own = absorbed
  blinkHighRatio: 1.6,     // over 160% = drifting (blinks rise when the mind wanders)
  happyConfidence: 50,     // HAPPY expression score, percent
  smileMinMs: 700,         // a smile has to last this long, unbroken, to count
  minExpectedBlinks: 3,    // judge blink rate only where the reader's own rate predicts 3+ blinks
  headTurn: 0.2,           // head turned this far from the reader's own median (face-width ratio) = looked away
  headTilt: 0.1,           // or tilted this far (face-height ratio); both about 4x the resting variation
  dwellSlowRatio: 1.5,     // baseline: time per word 1.5x the reader's median = lingered
  dwellFastRatio: 0.5,     // under half = skimmed
};

// SmartSpectra ValidationCode values that mean "this is not a reading face".
export const LOOKED_AWAY = new Set([1, 3, 17]); // kNoFaceFound, kFaceNotCentered, kFaceNotForward
export const TOO_DARK = new Set([5, 6]);        // kTooDark, kTooBright
export const MOVING = new Set([12, 13, 14, 15, 16, 4]); // motion, too close/far/high/low, size

export function median(xs) {
  const a = xs.filter((x) => Number.isFinite(x)).sort((p, q) => p - q);
  if (!a.length) return NaN;
  const mid = a.length >> 1;
  return a.length % 2 ? a[mid] : (a[mid - 1] + a[mid]) / 2;
}

/** Paragraph index in focus at time t (ms), or -1 before reading starts / after it ends. */
export function paragraphAt(timeline, t, endMs) {
  if (!timeline.length || t < timeline[0].t || t >= endMs) return -1;
  let lo = 0, hi = timeline.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (timeline[mid].t <= t) lo = mid; else hi = mid - 1;
  }
  return timeline[lo].p;
}

/** Validation state at time t: the latest validation event at or before t (default ok). */
function validationTimeline(events) {
  return events.filter((e) => e.kind === 'validation').map((e) => ({ t: e.t, code: e.code })).sort((a, b) => a.t - b.t);
}
function codeAt(vt, t) {
  let code = 0;
  for (const e of vt) { if (e.t <= t) code = e.code; else break; }
  return code;
}

/** Collapse blink/talk detection lists from overlapping packets into rising edges and on-intervals. */
function edges(samples, key) {
  // the same detection repeats across overlapping packets; keep its first placement
  const seen = new Map();
  for (const s of samples) for (const d of s[key] || []) {
    if (!seen.has(d.ts)) seen.set(d.ts, { ts: d.ts, on: d.on, t: d.t ?? s.t });
  }
  const list = [...seen.values()].sort((a, b) => a.ts - b.ts);
  const rises = [];
  let prev = false;
  for (const d of list) { if (d.on && !prev) rises.push(d.t); prev = d.on; }
  return { list, rises };
}

/**
 * @param {object} session { paragraphs:[{text, words}], timeline:[{t,p}], events:[...], readStart, readEnd }
 * @returns {{ paragraphs: object[], reader: object }}
 */
export function scoreSession(session, th = THRESHOLDS) {
  const { paragraphs, timeline, events } = session;
  const end = session.readEnd;
  const samples = events.filter((e) => e.kind === 'sample').map((e) => e.s);
  const vt = validationTimeline(events);

  const P = paragraphs.map((p, i) => ({
    i, words: p.words, dwellMs: 0, validMs: 0, awayMs: 0, talkMs: 0, darkMs: 0, movingMs: 0,
    blinks: 0, smileMs: 0, smileRun: 0, pulse: [], firstSeen: null,
  }));

  // dwell from the focus timeline
  for (let k = 0; k < timeline.length; k++) {
    const a = timeline[k].t, b = k + 1 < timeline.length ? timeline[k + 1].t : end;
    const p = P[timeline[k].p];
    if (!p || b <= a) continue;
    p.dwellMs += b - a;
    if (p.firstSeen === null) p.firstSeen = a;
  }

  // walk time in 100 ms steps for validity and smiles
  const talk = edges(samples, 'talk');
  const talkOn = (t) => {
    let on = false;
    for (const d of talk.list) { if (d.t <= t) on = d.on; else break; }
    return on;
  };
  const sampleAtFactory = () => {
    let j = 0;
    return (t) => { while (j + 1 < samples.length && samples[j + 1].t <= t) j++; return samples[j]; };
  };
  const sampleAt = sampleAtFactory();
  // why a moment is not readable, or null when it is (the same test for time and for blinks)
  // the reader's own head position, so a glance at a phone counts as looking away even while the
  // SDK still sees a face (sessions recorded before head data was kept are scored without it)
  const heads = samples.filter((x) => x.head);
  const headYaw = median(heads.map((x) => x.head.yaw)), headPitch = median(heads.map((x) => x.head.pitch));
  const turned = (s) => s?.head && Number.isFinite(headYaw)
    && (Math.abs(s.head.yaw - headYaw) > th.headTurn || Math.abs(s.head.pitch - headPitch) > th.headTilt);
  const unreadable = (t, s) => {
    const code = codeAt(vt, t);
    if (LOOKED_AWAY.has(code) || (s && s.face === false) || turned(s)) return 'awayMs';
    if (TOO_DARK.has(code)) return 'darkMs';
    if (MOVING.has(code)) return 'movingMs';
    if (talkOn(t)) return 'talkMs';
    return null;
  };
  const start = timeline.length ? timeline[0].t : end;
  let prevPi = -1;
  for (let t = start; t < end; t += 100) {
    const pi = paragraphAt(timeline, t, end);
    if (pi !== prevPi && prevPi >= 0) P[prevPi].smileRun = 0;
    prevPi = pi;
    if (pi < 0) continue;
    const p = P[pi];
    const s = sampleAt(t);
    const why = unreadable(t, s);
    if (why) { p[why] += 100; p.smileRun = 0; continue; }
    p.validMs += 100;
    // a smile is the longest unbroken run of happy steps, not scattered blips added up
    if (s?.expr && s.expr.happy >= th.happyConfidence) { p.smileRun += 100; p.smileMs = Math.max(p.smileMs, p.smileRun); }
    else p.smileRun = 0;
  }

  // blinks: rising edges, counted only at moments that count as readable time
  const blinkRises = edges(samples, 'blink').rises.sort((a, b) => a - b);
  const blinkSampleAt = sampleAtFactory();
  for (const t of blinkRises) {
    const pi = paragraphAt(timeline, t, end);
    if (pi < 0) continue;
    if (!unreadable(t, blinkSampleAt(t))) P[pi].blinks += 1;
  }

  // pulse: each confident reading is credited to the paragraph read ~6 s before the moment it
  // describes (its own timestamp when the packet gave one, else when the packet arrived)
  for (const s of samples) {
    if (!s.pulse || (s.pulse.c ?? 0) < th.pulseMinConfidence) continue;
    const pi = paragraphAt(timeline, (s.pulse.t ?? s.t) - th.pulseLagMs, end);
    if (pi >= 0) P[pi].pulse.push(s.pulse.v);
  }

  // the reader's own baselines, over readable time only
  const totalValidMs = P.reduce((a, p) => a + p.validMs, 0);
  const totalBlinks = P.reduce((a, p) => a + p.blinks, 0);
  const blinkPerMin = totalValidMs > 0 ? totalBlinks / (totalValidMs / 60000) : NaN;
  const pulseAll = samples.filter((s) => s.pulse && (s.pulse.c ?? 0) >= th.pulseMinConfidence).map((s) => s.pulse.v);
  const pulseMedian = median(pulseAll);
  const msPerWord = median(P.filter((p) => p.dwellMs > 0 && p.words > 0).map((p) => p.dwellMs / p.words));
  const breathAll = samples.filter((s) => s.breath && (s.breath.c ?? 0) >= 45).map((s) => s.breath.v);
  const hrvAll = samples.filter((s) => s.hrv && s.hrv.s).map((s) => s.hrv.rmssd);

  const notes = P.map((p) => {
    const out = {
      i: p.i, words: p.words, dwellMs: p.dwellMs, validMs: p.validMs,
      evidence: {}, camera: 'steady', dwell: 'normal', reason: null,
    };
    // baseline method: time per word only
    if (p.dwellMs > 0 && Number.isFinite(msPerWord)) {
      const r = (p.dwellMs / Math.max(1, p.words)) / msPerWord;
      out.evidence.dwellRatio = round(r, 2);
      if (r >= th.dwellSlowRatio) out.dwell = 'lingered';
      else if (r <= th.dwellFastRatio) out.dwell = 'skimmed';
    } else {
      out.dwell = 'unseen';
    }

    if (p.dwellMs === 0) { out.camera = 'unseen'; out.reason = 'never on the reading line'; return out; }
    const invalidMs = p.dwellMs - p.validMs;
    // A paragraph read cleanly but too briefly for a signal (a short line of dialogue) gets no
    // flag: nothing went wrong, there is just nothing to say. "No reading" is kept for paragraphs
    // where the camera could not see a reading face for most of the time.
    if (p.validMs / p.dwellMs < th.minValidShare) {
      out.camera = 'no-reading';
      const worst = [['awayMs', 'you looked away'], ['talkMs', 'you were talking'], ['darkMs', 'the light was too poor'], ['movingMs', 'you moved out of position']]
        .sort((a, b) => p[b[0]] - p[a[0]])[0];
      out.reason = worst[1];
      return out;
    }
    if (p.validMs < th.minValidMs) { out.camera = 'brief'; out.reason = 'too brief to read a signal'; return out; }

    const blinkRate = p.blinks / (p.validMs / 60000);
    // With a few seconds of reading, 0 or 1 blinks is normal, so a ratio there is noise. Judge
    // blinking only where the reader's own rate predicts at least minExpectedBlinks blinks.
    const expectedBlinks = Number.isFinite(blinkPerMin) ? blinkPerMin * (p.validMs / 60000) : 0;
    const blinkRatio = expectedBlinks >= th.minExpectedBlinks ? blinkRate / blinkPerMin : NaN;
    const pulseMean = p.pulse.length ? p.pulse.reduce((a, b) => a + b, 0) / p.pulse.length : NaN;
    const pulseDelta = pulseMean - pulseMedian;
    out.evidence.blinkPerMin = round(blinkRate, 1);
    out.evidence.blinkRatio = round(blinkRatio, 2);
    out.evidence.pulseDelta = Number.isFinite(pulseDelta) ? round(pulseDelta, 1) : null;
    out.evidence.smileMs = p.smileMs;

    const amused = p.smileMs >= th.smileMinMs;
    const absorbed = blinkRatio <= th.blinkLowRatio;
    const pulseUp = Number.isFinite(pulseDelta) && pulseDelta >= th.pulseRiseBpm;
    const drifting = blinkRatio >= th.blinkHighRatio;

    if (amused) out.camera = 'amused';
    else if (absorbed || pulseUp) out.camera = 'gripped';
    else if (drifting) out.camera = 'drifting';
    out.signals = { amused, absorbed, pulseUp, drifting };
    return out;
  });

  return {
    paragraphs: notes,
    reader: {
      blinkPerMin: round(blinkPerMin, 1),
      pulseMedian: round(pulseMedian, 1),
      breathMedian: round(median(breathAll), 1),
      hrvMedian: round(median(hrvAll), 1),
      msPerWord: round(msPerWord, 0),
      readableShare: round(totalValidMs / Math.max(1, P.reduce((a, p) => a + p.dwellMs, 0)), 2),
    },
  };
}

function round(x, d) { return Number.isFinite(x) ? Math.round(x * 10 ** d) / 10 ** d : null; }

/** One margin comment for a paragraph, in plain words. Returns null for "nothing to say". */
export function commentFor(note, readerName = 'Reader') {
  const e = note.evidence;
  const bits = [];
  if (e.pulseDelta !== null && e.pulseDelta !== undefined && Math.abs(e.pulseDelta) >= 2) {
    bits.push(`pulse ${e.pulseDelta > 0 ? '+' : ''}${e.pulseDelta} bpm vs their own median`);
  }
  if (Number.isFinite(e.blinkRatio)) bits.push(`blinking at ${Math.round(e.blinkRatio * 100)}% of their usual rate`);
  if (e.smileMs >= 700) bits.push(`smiled for ${(e.smileMs / 1000).toFixed(1)} s`);
  const why = bits.length ? ` (${bits.join(', ')})` : '';
  switch (note.camera) {
    case 'amused': return `${readerName} smiled here${why}.`;
    case 'gripped': return `${readerName} was gripped here${why}.`;
    case 'drifting': return `${readerName} may have drifted here${why}.`;
    case 'no-reading': return `No reading for this paragraph: ${note.reason}. Unskipped does not guess.`;
    case 'unseen': return `${readerName} never had this paragraph on the reading line.`;
    default: return null;
  }
}
