// Scorer tests on hand-built sessions. These fixtures exist only to test the code;
// no number in the post comes from them.
import test from 'node:test';
import assert from 'node:assert/strict';
import { scoreSession, paragraphAt, commentFor } from '../src/score.js';
import { grade } from '../src/grade.js';
import { compactSample } from '../src/signals.js';

// 6 paragraphs of 40 words, 10 s each, 60 s of reading
function baseSession() {
  const paragraphs = Array.from({ length: 6 }, () => ({ text: 'x', words: 40 }));
  const timeline = paragraphs.map((_, p) => ({ t: 10000 * p, p }));
  return { paragraphs, timeline, events: [], readStart: 0, readEnd: 60000 };
}

// one sample every 100 ms with a face, steady pulse 70, a blink every 3 s
function steadySamples(session, opts = {}) {
  const ev = [];
  let ts = 1_000_000_000;
  for (let t = 0; t < session.readEnd; t += 100) {
    ts += 100_000;
    const pi = paragraphAt(session.timeline, t, session.readEnd);
    const blinkEvery = opts.blinkEvery?.[pi] ?? 3000;
    const blinking = t % blinkEvery < 200;
    const happy = opts.smile?.includes(pi) ? 80 : 5;
    const talking = opts.talk?.includes(pi) ?? false;
    const pulse = 70 + (opts.pulseUp?.includes(paragraphAt(session.timeline, t - 6000, session.readEnd)) ? 8 : 0);
    const m = {
      cardio: { pulseRate: [{ value: pulse, confidence: 90, stable: true }] },
      face: {
        blinking: [{ detected: blinking, timestamp: ts }],
        talking: [{ detected: talking, timestamp: ts }],
        expression: [{ scores: [{ type: 5, confidence: happy }, { type: 6, confidence: 100 - happy }] }],
        landmarks: [{ value: [{ x: 1, y: 1 }] }],
      },
    };
    ev.push({ t, kind: 'sample', s: compactSample(m, t) });
  }
  return ev;
}

test('paragraphAt follows the focus timeline', () => {
  const s = baseSession();
  assert.equal(paragraphAt(s.timeline, -1, 60000), -1);
  assert.equal(paragraphAt(s.timeline, 0, 60000), 0);
  assert.equal(paragraphAt(s.timeline, 25000, 60000), 2);
  assert.equal(paragraphAt(s.timeline, 60000, 60000), -1);
});

test('a smile marks the paragraph amused', () => {
  const s = baseSession();
  s.events = steadySamples(s, { smile: [2] });
  const { paragraphs } = scoreSession(s);
  assert.equal(paragraphs[2].camera, 'amused');
  assert.equal(paragraphs[0].camera, 'steady');
});

test('slowed blinking marks gripped, fast blinking marks drifting', () => {
  const s = baseSession();
  s.events = steadySamples(s, { blinkEvery: { 1: 100000, 4: 1000 } });
  const { paragraphs } = scoreSession(s);
  assert.equal(paragraphs[1].camera, 'gripped');
  assert.equal(paragraphs[4].camera, 'drifting');
});

test('a pulse rise is credited to the paragraph read 6 s earlier', () => {
  const s = baseSession();
  s.events = steadySamples(s, { pulseUp: [3] });
  const { paragraphs } = scoreSession(s);
  assert.equal(paragraphs[3].camera, 'gripped');
  assert.ok(paragraphs[3].evidence.pulseDelta >= 4);
});

test('looking away (SDK kFaceNotForward) gives no reading, never a guess', () => {
  const s = baseSession();
  s.events = [
    ...steadySamples(s, { smile: [2] }),
    { t: 20000, kind: 'validation', code: 17, hint: 'face not forward' },
    { t: 30000, kind: 'validation', code: 0, hint: '' },
  ].sort((a, b) => a.t - b.t);
  const { paragraphs } = scoreSession(s);
  assert.equal(paragraphs[2].camera, 'no-reading');
  assert.equal(paragraphs[2].reason, 'you looked away');
  assert.match(commentFor(paragraphs[2]), /does not guess/);
});

test('talking gives no reading', () => {
  const s = baseSession();
  s.events = steadySamples(s, { talk: [5] });
  const { paragraphs } = scoreSession(s);
  assert.equal(paragraphs[5].camera, 'no-reading');
  assert.equal(paragraphs[5].reason, 'you were talking');
});

test('dwell baseline flags lingered and skimmed paragraphs', () => {
  const s = baseSession();
  s.timeline = [{ t: 0, p: 0 }, { t: 10000, p: 1 }, { t: 30000, p: 2 }, { t: 33000, p: 3 }, { t: 43000, p: 4 }, { t: 53000, p: 5 }];
  s.events = steadySamples(s);
  const { paragraphs } = scoreSession(s);
  assert.equal(paragraphs[1].dwell, 'lingered');
  assert.equal(paragraphs[2].dwell, 'skimmed');
});

test('no blink in a short paragraph is not read as gripped', () => {
  // 3.5 s of reading at 20 blinks a minute predicts about 1 blink: 0 is normal, not absorbed
  const s = baseSession();
  s.timeline = [{ t: 0, p: 0 }, { t: 10000, p: 1 }, { t: 13500, p: 2 }, { t: 30000, p: 3 }, { t: 40000, p: 4 }, { t: 50000, p: 5 }];
  s.events = steadySamples(s, { blinkEvery: { 1: 100000 } });
  const { paragraphs } = scoreSession(s);
  assert.equal(paragraphs[1].camera, 'steady');
  assert.equal(paragraphs[1].evidence.blinkRatio, null);
});

test('scattered smile blips do not add up to a smile', () => {
  const s = baseSession();
  s.events = steadySamples(s).map((e) => {
    // ten 200 ms blips across paragraph 2: 2 s in total, never 0.7 s unbroken
    const on = e.t >= 20000 && e.t < 30000 && e.t % 1000 < 200;
    return on ? { ...e, s: { ...e.s, expr: { happy: 80, top: '5' } } } : e;
  });
  const { paragraphs } = scoreSession(s);
  assert.notEqual(paragraphs[2].camera, 'amused');
  assert.ok(paragraphs[2].evidence.smileMs < 700);
});

test('a blink in time that is not readable (too dark) is not counted', () => {
  const s = baseSession();
  s.events = [
    ...steadySamples(s),
    { t: 20000, kind: 'validation', code: 5, hint: '' },
    { t: 30000, kind: 'validation', code: 0, hint: '' },
  ].sort((a, b) => a.t - b.t);
  const away = scoreSession(s);
  assert.equal(away.paragraphs[2].camera, 'no-reading');
  assert.equal(away.paragraphs[2].reason, 'the light was too poor');
  // baseline stays near the true 20 a minute; counting the dark paragraph's blinks against
  // readable time only (the old behaviour) gave about 24
  assert.ok(away.reader.blinkPerMin < 21, `blinkPerMin ${away.reader.blinkPerMin}`);
});

test('pulse is placed at its own timestamp, not the packet arrival', () => {
  const m = {
    cardio: { pulseRate: [{ value: 70, confidence: 90, stable: true, timestamp: '1000000000' }] },
    face: { blinking: [{ detected: false, timestamp: '1001300000' }] },
  };
  assert.equal(compactSample(m, 50000).pulse.t, 48700);
});

test('grade states what chance alone would find', () => {
  const notes = Array.from({ length: 10 }, (_, i) => ({ i, camera: i < 2 ? 'gripped' : 'steady', dwell: 'normal' }));
  const g = grade(notes, { got: [0, 5, 6, 7], lost: [] });
  // 2 of 10 judgeable paragraphs flagged, 4 marked: 0.8 expected by chance
  assert.equal(g.camera.got.chance, 0.8);
  assert.equal(g.camera.got.found, 1);
});

test('grade compares camera and dwell flags to the reader marks', () => {
  const notes = [
    { i: 0, camera: 'amused', dwell: 'normal' },
    { i: 1, camera: 'gripped', dwell: 'lingered' },
    { i: 2, camera: 'steady', dwell: 'lingered' },
    { i: 3, camera: 'drifting', dwell: 'skimmed' },
    { i: 4, camera: 'no-reading', reason: 'you looked away', dwell: 'normal' },
  ];
  const g = grade(notes, { got: [0, 1], lost: [3] });
  assert.equal(g.camera.got.found, 2);
  assert.equal(g.camera.got.recall, 1);
  assert.equal(g.dwell.got.found, 1);
  assert.equal(g.dwell.got.precision, 0.5);
  assert.equal(g.camera.lost.found, 1);
  assert.deepEqual(g.refused, [{ i: 4, reason: 'you looked away' }]);
});

test('a head turned away counts as looking away even while the SDK still sees a face', () => {
  const s = baseSession();
  s.events = steadySamples(s).map((e) => {
    const pi = paragraphAt(s.timeline, e.t, s.readEnd);
    return { ...e, s: { ...e.s, head: pi === 3 ? { yaw: 0.85, pitch: 0.35 } : { yaw: 0.55, pitch: 0.35 } } };
  });
  const { paragraphs } = scoreSession(s);
  assert.equal(paragraphs[3].camera, 'no-reading');
  assert.equal(paragraphs[3].reason, 'you looked away');
  assert.notEqual(paragraphs[2].camera, 'no-reading');
});

test('head position comes from the face mesh as two ratios, nothing else kept', () => {
  const P = Array.from({ length: 478 }, () => ({ x: 0, y: 0 }));
  P[33] = { x: 100, y: 100 }; P[263] = { x: 200, y: 100 }; P[1] = { x: 160, y: 140 }; P[152] = { x: 150, y: 200 };
  const out = compactSample({ face: { landmarks: [{ value: P }] } }, 0);
  assert.deepEqual(out.head, { yaw: 0.6, pitch: 0.4 });
});
