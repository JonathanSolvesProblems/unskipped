// SmartSpectra capture in Electron's main process (camera opened natively by the SDK,
// which holds 30 fps on Windows where renderer capture over IPC did not).
import fs from 'node:fs';
import path from 'node:path';
import {
  SmartSpectraSDK, CameraSelection, breathingMetrics, cardioMetrics, faceMetrics, decodeMetrics,
} from '@smartspectra/node-sdk';
import { compactSample } from '../src/signals.js';

let sdk = null;
let t0 = 0;
let frames = 0;
let rawKept = 0;
let lastPreview = 0;

export function listCameras() {
  try { return SmartSpectraSDK.availableCameras().map((c) => ({ id: c.id, name: c.name })); } catch (e) { return []; }
}

export function sdkVersion() { return SmartSpectraSDK.version; }

/**
 * @param {{apiKey:string, cameraId:string, send:(channel:string, payload:any)=>void, debugDir:string}} o
 */
export function startCapture(o) {
  if (sdk) throw new Error('capture already running');
  t0 = Date.now(); frames = 0; rawKept = 0;
  sdk = new SmartSpectraSDK({
    apiKey: o.apiKey,
    // full face bundle; cardio requested by metric rather than bundle (issue #18 workaround is
    // to drop to PULSE_RATE alone if usage checks fail; see README)
    requestedMetrics: [...breathingMetrics, ...cardioMetrics, ...faceMetrics],
    enableTelemetry: false,
  });
  const now = () => Date.now() - t0;
  sdk.on('processingStatus', (s) => o.send('sdk:status', { t: now(), status: s }));
  sdk.on('validationStatus', (code, ts, hint) => o.send('sdk:validation', { t: now(), code, hint }));
  sdk.on('error', (code, message, retryable) => o.send('sdk:error', { t: now(), code, message, retryable }));
  sdk.on('frameSentThrough', () => { frames++; });
  sdk.on('metrics', (buf) => {
    const m = decodeMetrics(buf);
    if (Buffer.isBuffer(m)) return;
    const t = now();
    if (rawKept < 3 && o.debugDir) {
      // keep three raw packets locally to check the payload shape (tmp/ is gitignored)
      rawKept++;
      const safe = JSON.parse(JSON.stringify(m, (k, v) => (typeof v === 'bigint' ? Number(v) : v)));
      if (safe?.face?.landmarks) safe.face.landmarks = safe.face.landmarks.map((l) => ({ ...l, value: `[${l.value?.length} points]` }));
      fs.mkdirSync(o.debugDir, { recursive: true });
      fs.writeFileSync(path.join(o.debugDir, `raw-packet-${rawKept}.json`), JSON.stringify(safe, null, 1));
    }
    o.send('sdk:sample', compactSample(m, t));
  });
  sdk.on('videoOutput', (buf, width, height, stride) => {
    const t = Date.now();
    if (t - lastPreview < 150) return; // ~6 fps preview is plenty
    lastPreview = t;
    o.send('sdk:frame', downscale(buf, width, height, stride, 192));
  });
  const fpsTimer = setInterval(() => {
    if (!sdk) return clearInterval(fpsTimer);
    o.send('sdk:fps', { t: now(), fps: frames });
    frames = 0;
  }, 1000);
  sdk.useCamera(CameraSelection.byId(o.cameraId), { width: 1280, height: 720 });
  sdk.start();
  return { t0 };
}

export async function stopCapture() {
  if (!sdk) return;
  const s = sdk; sdk = null;
  try { await s.stopAsync(); } finally { await s.destroy(); }
}

// nearest-neighbour downscale of a 4-byte-per-pixel frame to `w` wide, for the preview only
function downscale(buf, width, height, stride, w) {
  const h = Math.round((height / width) * w);
  const out = new Uint8ClampedArray(w * h * 4);
  const bpp = Math.max(3, Math.round(stride / width));
  for (let y = 0; y < h; y++) {
    const sy = Math.floor((y * height) / h);
    for (let x = 0; x < w; x++) {
      const sx = Math.floor((x * width) / w);
      const si = sy * stride + sx * bpp;
      const di = (y * w + x) * 4;
      out[di] = buf[si]; out[di + 1] = buf[si + 1]; out[di + 2] = buf[si + 2]; out[di + 3] = 255;
    }
  }
  return { w, h, data: out, bpp };
}
