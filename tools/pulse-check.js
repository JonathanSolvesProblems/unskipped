// Camera pulse (SmartSpectra, laptop webcam) against a fingertip pulse oximeter, same 2.5 minutes.
//
//   node tools/pulse-check.js
//
// Inputs (committed):
//   results/pulse-check-camera.json  every pulse reading from tools/camtest.js, with the run's start
//                                    time and the moment the phone recording was started
//   results/pulse-check-sensor.csv   the oximeter's pulse read off the phone video every 5 s; frames
//                                    where the display was cut off by hand movement are left out
// The phone video started (t0Epoch - phoneRecordTapEpoch) ms before the camera run, so a sensor
// reading at video second v is compared with the camera reading nearest to camera second v - offset.
// Only readings the SDK marks confidence >= 40 are used, the same floor the app uses.
// Output: results/pulse-check.json, printed summary. Not a medical comparison; pulse rate only.
import fs from 'node:fs';

const cam = JSON.parse(fs.readFileSync('results/pulse-check-camera.json', 'utf8'));
const sensor = fs.readFileSync('results/pulse-check-sensor.csv', 'utf8').trim().split(/\r?\n/).slice(1)
  .map((l) => l.split(',').map(Number)).map(([v, bpm]) => ({ v, bpm }));
const confident = cam.readings.filter((r) => r.confidence >= 40);
const baseOffset = (cam.t0Epoch - cam.phoneRecordTapEpoch) / 1000;

function compare(offset) {
  const pairs = [];
  for (const s of sensor) {
    const t = s.v - offset;
    if (t < confident[0].t - 1) continue; // before the camera's first confident reading
    let best = null;
    for (const r of confident) if (!best || Math.abs(r.t - t) < Math.abs(best.t - t)) best = r;
    if (Math.abs(best.t - t) > 5) continue;
    pairs.push({ videoS: s.v, sensor: s.bpm, camera: best.bpm, diff: Math.round((best.bpm - s.bpm) * 10) / 10 });
  }
  const abs = pairs.map((p) => Math.abs(p.diff));
  const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
  return {
    offsetS: Math.round(offset * 100) / 100, pairs: pairs.length,
    meanAbsDiff: Math.round(mean(abs) * 10) / 10,
    meanDiff: Math.round(mean(pairs.map((p) => p.diff)) * 10) / 10,
    maxAbsDiff: Math.max(...abs),
    within5: pairs.filter((p) => Math.abs(p.diff) <= 5).length,
    sensorMean: Math.round(mean(pairs.map((p) => p.sensor)) * 10) / 10,
    cameraMean: Math.round(mean(pairs.map((p) => p.camera)) * 10) / 10,
    rows: pairs,
  };
}

const main = compare(baseOffset);
// the phone may start recording up to a couple of seconds after the tap; show the result is not
// sensitive to that
const sensitivity = [-2, 2].map((d) => { const r = compare(baseOffset + d); return { shiftS: d, meanAbsDiff: r.meanAbsDiff, meanDiff: r.meanDiff }; });
const out = { generatedBy: 'tools/pulse-check.js', confidentCameraReadings: confident.length, ...main, sensitivity };
fs.writeFileSync('results/pulse-check.json', JSON.stringify(out, null, 1));
console.log(`${main.pairs} paired readings. Sensor mean ${main.sensorMean} bpm, camera mean ${main.cameraMean} bpm.`);
console.log(`Camera minus sensor: mean ${main.meanDiff} bpm, mean absolute ${main.meanAbsDiff} bpm, largest ${main.maxAbsDiff} bpm; ${main.within5} of ${main.pairs} within 5 bpm.`);
console.log(`Shifting the alignment 2 s either way: ${sensitivity.map((s) => `${s.shiftS > 0 ? '+' : ''}${s.shiftS} s -> mean abs ${s.meanAbsDiff}`).join(', ')}`);
console.log('-> results/pulse-check.json');
