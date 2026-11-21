import { app, BrowserWindow, ipcMain, dialog, session, shell } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { listCameras, startCapture, stopCapture, sdkVersion } from './capture.js';
import { readManuscript } from '../src/manuscript.js';
import { docxFromText, addComments } from '../src/docx.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tmpDir = path.join(root, 'tmp');

function apiKey() {
  if (process.env.PRESAGE_API_KEY) return process.env.PRESAGE_API_KEY.trim();
  const envPath = path.join(root, '.env');
  if (!fs.existsSync(envPath)) return null;
  const line = fs.readFileSync(envPath, 'utf8').replace(/^﻿/, '').split(/\r?\n/).find((l) => l.startsWith('PRESAGE_API_KEY='));
  return line ? line.slice('PRESAGE_API_KEY='.length).trim() : null;
}

let win;
function createWindow() {
  win = new BrowserWindow({
    width: 1360, height: 900, backgroundColor: '#f4efe6', title: 'Unskipped',
    webPreferences: { preload: path.join(root, 'app', 'preload.cjs'), contextIsolation: true, sandbox: true },
  });
  win.removeMenu();
  win.loadFile(path.join(root, 'app', 'ui', 'index.html'));
  if (process.env.UNSKIPPED_DEVTOOLS) win.webContents.openDevTools({ mode: 'detach' });
  win.webContents.on('console-message', (_e, level, message, line, src) => {
    if (level >= 2) console.error(`[renderer] ${message} (${path.basename(src || '')}:${line})`);
  });
  // UNSKIPPED_SHOT=out.png [UNSKIPPED_SCRIPT=js] : run optional JS in the page, screenshot, quit
  if (process.env.UNSKIPPED_SHOT) {
    win.webContents.once('did-finish-load', async () => {
      await new Promise((r) => setTimeout(r, 1200));
      if (process.env.UNSKIPPED_SCRIPT) {
        await win.webContents.executeJavaScript(process.env.UNSKIPPED_SCRIPT);
        await new Promise((r) => setTimeout(r, 1500));
      }
      const img = await win.webContents.capturePage();
      fs.writeFileSync(process.env.UNSKIPPED_SHOT, img.toPNG());
      app.quit();
    });
  }
}

// camera permission only for our own bundled page; nothing else
app.whenReady().then(() => {
  session.defaultSession.setPermissionRequestHandler((wc, permission, cb, details) => {
    const url = details?.requestingUrl || wc?.getURL() || '';
    cb(permission === 'media' && url.startsWith('file://'));
  });
  createWindow();
});
app.on('window-all-closed', async () => { await stopCapture(); app.quit(); });

const send = (channel, payload) => { if (win && !win.isDestroyed()) win.webContents.send(channel, payload); };

// UNSKIPPED_RESEARCH=1: a study run (my graded read and controls), where the raw samples are needed,
// so the review screen starts with the raw-samples box ticked and says why. Off for normal readers.
ipcMain.handle('env:info', () => ({ hasKey: !!apiKey(), cameras: listCameras(), sdk: sdkVersion(), research: !!process.env.UNSKIPPED_RESEARCH }));

ipcMain.handle('capture:start', (_e, { cameraId }) => {
  const key = apiKey();
  if (!key) throw new Error('No Presage API key. Put PRESAGE_API_KEY=... in .env');
  // raw SDK packets are written only when debugging (UNSKIPPED_DEBUG=1), never in normal use
  return startCapture({ apiKey: key, cameraId, send, debugDir: process.env.UNSKIPPED_DEBUG ? tmpDir : null });
});
ipcMain.handle('capture:stop', () => stopCapture());

// A rolling backup of the live session, so a crash does not lose a reading. It lives only while a
// reading is in progress: the app deletes it when the reading is sent or stopped (session:clear).
const backupFile = path.join(tmpDir, 'live-session.json');
ipcMain.handle('session:backup', (_e, json) => {
  fs.mkdirSync(tmpDir, { recursive: true });
  fs.writeFileSync(backupFile, json);
});
ipcMain.handle('session:clear', () => { fs.rmSync(backupFile, { force: true }); });

ipcMain.handle('manuscript:open', async () => {
  const r = await dialog.showOpenDialog(win, {
    title: 'Open a manuscript', properties: ['openFile'],
    filters: [{ name: 'Manuscripts', extensions: ['docx', 'md', 'txt'] }],
    defaultPath: path.join(root, 'stories'),
  });
  if (r.canceled || !r.filePaths[0]) return null;
  const p = r.filePaths[0];
  const ms = await readManuscript(path.basename(p), fs.readFileSync(p));
  return { path: p, ms };
});

ipcMain.handle('file:open-json', async (_e, { title, dir }) => {
  const r = await dialog.showOpenDialog(win, {
    title, properties: ['openFile', 'multiSelections'], filters: [{ name: 'Unskipped files', extensions: ['json'] }],
    defaultPath: path.join(root, dir || 'readings'),
  });
  if (r.canceled) return [];
  return r.filePaths.map((p) => ({ path: p, data: JSON.parse(fs.readFileSync(p, 'utf8')) }));
});

ipcMain.handle('file:save-json', async (_e, { suggested, dir, json }) => {
  const r = await dialog.showSaveDialog(win, { defaultPath: path.join(root, dir || 'readings', suggested), filters: [{ name: 'JSON', extensions: ['json'] }] });
  if (r.canceled || !r.filePath) return null;
  fs.mkdirSync(path.dirname(r.filePath), { recursive: true });
  fs.writeFileSync(r.filePath, json);
  return r.filePath;
});

// write the reader notes into the writer's manuscript as Word comments
ipcMain.handle('docx:export', async (_e, { manuscriptPath, comments }) => {
  const buf = fs.readFileSync(manuscriptPath);
  const ms = await readManuscript(path.basename(manuscriptPath), buf);
  const base = manuscriptPath.toLowerCase().endsWith('.docx') ? buf : await docxFromText(ms);
  const out = await addComments(base, ms, comments);
  const suggested = path.basename(manuscriptPath).replace(/\.(docx|md|txt)$/i, '') + ' (reader notes).docx';
  const r = await dialog.showSaveDialog(win, { defaultPath: path.join(path.dirname(manuscriptPath), suggested), filters: [{ name: 'Word', extensions: ['docx'] }] });
  if (r.canceled || !r.filePath) return null;
  fs.writeFileSync(r.filePath, out);
  return r.filePath;
});
ipcMain.handle('shell:open', (_e, p) => shell.openPath(p));
