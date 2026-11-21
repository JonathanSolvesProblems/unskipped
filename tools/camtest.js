// Camera check. With no key: lists cameras. With PRESAGE_API_KEY set: runs a
// short live session (about 2 credits), reports frames per second and saves the
// raw decoded metric stream to tmp/ so the scorer can be built against real data.
//
//   node tools/camtest.js            list cameras
//   node tools/camtest.js 1 40       camera index 1, 40 seconds
import fs from 'node:fs';
import path from 'node:path';
import {
  SmartSpectraSDK, CameraSelection, breathingMetrics, cardioMetrics, faceMetrics, decodeMetrics,
  MetricType, SmartSpectraLogLevel,
} from '@smartspectra/node-sdk';

const cams = SmartSpectraSDK.availableCameras();
console.log('SDK', SmartSpectraSDK.version);
cams.forEach((c, i) => console.log(`[${i}]`, JSON.stringify(c)));

const key = process.env.PRESAGE_API_KEY;
if (!key) { console.log('\nSet PRESAGE_API_KEY to run a live check.'); process.exit(0); }

const idx = Number(process.argv[2] ?? 0);
const seconds = Number(process.argv[3] ?? 40);
const cam = cams[idx];
if (!cam) { console.error('No camera at index', idx); process.exit(1); }

const sdk = new SmartSpectraSDK({
  apiKey: key,
  // breathing needs the chest in view (validation code 7), which a reading posture at a laptop
  // crops; METRICS=all brings it back
  // the full cardio bundle delivered no cardio packets on 3.5.0 (SDK issue #18); PULSE_RATE
  // alone is the reported workaround
  requestedMetrics: process.env.METRICS === 'all'
    ? [...breathingMetrics, ...cardioMetrics, ...faceMetrics]
    : process.env.METRICS === 'cardio'
      ? [...cardioMetrics, ...faceMetrics]
      : [MetricType.PULSE_RATE, ...faceMetrics],
  enableTelemetry: false,
  logLevel: SmartSpectraLogLevel.kInfo,
});

const t0 = Date.now();
let frames = 0, sent = 0;
const stream = [];
const replacer = (k, v) => (typeof v === 'bigint' ? Number(v) : v);

sdk.on('processingStatus', (s) => console.log(`${((Date.now() - t0) / 1000).toFixed(1)}s status`, s));
sdk.on('validationStatus', (code, ts, hint) => {
  console.log(`${((Date.now() - t0) / 1000).toFixed(1)}s validation`, code, hint);
  stream.push({ t: Date.now() - t0, kind: 'validation', code, hint });
});
sdk.on('error', (code, msg, retryable) => console.error('error', code, msg, 'retryable', retryable));
sdk.on('frameSentThrough', (ok) => { frames++; if (ok) sent++; });
sdk.on('metrics', (buf) => {
  const m = decodeMetrics(buf);
  if (Buffer.isBuffer(m)) return;
  stream.push({ t: Date.now() - t0, kind: 'metrics', m: JSON.parse(JSON.stringify(m, replacer)) });
});

let lastFrames = 0;
const tick = setInterval(() => {
  const fps = frames - lastFrames; lastFrames = frames;
  const last = [...stream].reverse().find((e) => e.kind === 'metrics')?.m;
  const pr = last?.cardio?.pulseRate?.at(-1);
  const br = last?.breathing?.rate?.at(-1);
  console.log(`${((Date.now() - t0) / 1000).toFixed(0)}s fps=${fps} pulse=${pr ? `${pr.value.toFixed(1)} c${pr.confidence?.toFixed(0)}${pr.stable ? ' stable' : ''}` : '-'} breath=${br ? `${br.value.toFixed(1)} c${br.confidence?.toFixed(0)}` : '-'}`);
}, 1000);

sdk.useCamera(CameraSelection.byId(cam.id), { width: 1280, height: 720 });
sdk.start();

setTimeout(async () => {
  clearInterval(tick);
  await sdk.stopAsync();
  await sdk.destroy();
  fs.mkdirSync('tmp', { recursive: true });
  const out = path.join('tmp', `camtest-${Date.now()}.json`);
  // t0Epoch: wall-clock ms at t = 0, so the stream can be lined up with another recording
  fs.writeFileSync(out, JSON.stringify({ camera: cam, seconds, t0Epoch: t0, frames, sent, stream }));
  console.log(`\nframes ${frames} (${(frames / seconds).toFixed(1)} fps), sent ${sent}. Saved ${out}`);
  process.exit(0);
}, seconds * 1000);
