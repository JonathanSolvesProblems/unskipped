// Turns one decoded SmartSpectra metrics packet into a small sample we keep.
// The raw packet carries 478 landmarks per frame; we keep only what the scorer uses,
// so a 5-minute session file stays small and holds no face geometry.

const HAPPY = 5; // ExpressionType.HAPPY in the SmartSpectra schema

function last(arr) { return Array.isArray(arr) && arr.length ? arr[arr.length - 1] : undefined; }
function num(x) { return typeof x === 'number' && Number.isFinite(x) ? x : undefined; }

function measurement(m) {
  if (!m) return undefined;
  const v = num(m.value);
  if (v === undefined) return undefined;
  return { v, c: num(m.confidence) ?? null, s: !!m.stable };
}

// Detection lists carry the SDK's own µs timestamps. The newest entry in a packet is
// taken to arrive at t (session ms); older entries are placed by their gap to it, so
// only differences within one clock are used.
function detections(list, t) {
  if (!Array.isArray(list) || !list.length) return [];
  const ts = list.map((d) => Number(d.timestamp) || 0);
  const newest = Math.max(...ts);
  return list.map((d, k) => ({ ts: ts[k], on: !!d.detected, t: Math.round(t - (newest - ts[k]) / 1000) }));
}

/** @param {object} m decoded metrics payload, @param {number} t ms since session start */
export function compactSample(m, t) {
  const out = { t };
  const pulseRaw = last(m?.cardio?.pulseRate);
  const pulse = measurement(pulseRaw);
  if (pulse) {
    // The pulse value carries its own µs timestamp, which trails the face frames in the same
    // packet (by about 1.3 s in the camera tests). Place it at its own time, measured from the
    // newest face timestamp in the packet, so the scorer's lag is counted from the right moment.
    const faceTs = ['blinking', 'talking', 'expression', 'landmarks']
      .flatMap((k) => (Array.isArray(m?.face?.[k]) ? m.face[k] : []))
      .map((d) => Number(d.timestamp)).filter((x) => Number.isFinite(x) && x > 0);
    const pts = Number(pulseRaw.timestamp);
    if (faceTs.length && Number.isFinite(pts) && pts > 0) {
      const gapMs = (Math.max(...faceTs) - pts) / 1000;
      if (gapMs >= 0 && gapMs < 30000) pulse.t = Math.round(t - gapMs);
    }
    out.pulse = pulse;
  }
  const breath = measurement(last(m?.breathing?.rate));
  if (breath) out.breath = breath;
  const hrv = last(m?.cardio?.hrv);
  if (hrv && num(hrv.rmssd) !== undefined) out.hrv = { rmssd: hrv.rmssd, c: num(hrv.confidence) ?? null, s: !!hrv.stable };

  const blinks = detections(m?.face?.blinking, t);
  if (blinks.length) out.blink = blinks;
  const talk = detections(m?.face?.talking, t);
  if (talk.length) out.talk = talk;

  const expr = last(m?.face?.expression);
  if (expr && Array.isArray(expr.scores)) {
    const happy = expr.scores.find((s) => s.type === HAPPY || s.type === 'HAPPY');
    let top = null;
    for (const s of expr.scores) if (!top || s.confidence > top.confidence) top = s;
    out.expr = { happy: num(happy?.confidence) ?? 0, top: top ? String(top.type) : null };
  }

  const lm = last(m?.face?.landmarks);
  if (lm) out.face = Array.isArray(lm.value) && lm.value.length > 0;
  // head position from the face mesh (MediaPipe indexes: 1 nose tip, 33 and 263 outer eye corners,
  // 152 chin), as two ratios that do not depend on distance: turn (nose across the eyes) and tilt
  // (nose down from the eyes toward the chin). Only these two numbers are kept, no face geometry.
  const P = lm?.value;
  if (Array.isArray(P) && P.length > 263) {
    const n = P[1], l = P[33], r = P[263], c = P[152];
    const ey = (l.y + r.y) / 2;
    if (r.x !== l.x && c.y !== ey) out.head = { yaw: Math.round(((n.x - l.x) / (r.x - l.x)) * 1000) / 1000, pitch: Math.round(((n.y - ey) / (c.y - ey)) * 1000) / 1000 };
  }
  return out;
}
