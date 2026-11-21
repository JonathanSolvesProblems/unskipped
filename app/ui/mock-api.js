// Dev-only stand-in for the desktop bridge, loaded with ?mock=1 to render screens in a browser
// for layout review. Placeholder text and simulated signals; never used for any result.
const filler = 'This placeholder paragraph stands in for a page of a manuscript so the layout can be checked without showing the story before it is read.';
const ms = {
  title: 'Sample chapter', byline: 'Placeholder text and simulated signals, to show the screens',
  paragraphs: Array.from({ length: 12 }, (_, i) => {
    const text = Array.from({ length: 1 + (i * 7) % 4 }, () => filler).join(' ');
    return { text, words: text.split(' ').length };
  }),
};
// ?ms=<path to .md> swaps the placeholder for a real manuscript (same parse as src/manuscript.js),
// used by tools/gallery.py for the marks screen once the graded reading is done.
const msPath = new URLSearchParams(location.search).get('ms');
if (msPath) {
  const text = (await (await fetch(msPath, { cache: 'no-store' })).text()).replace(/\r/g, '');
  const wc = (s) => (s.trim() ? s.trim().split(/\s+/).length : 0);
  ms.paragraphs = [];
  ms.byline = null;
  for (const b of text.split(/\n\s*\n/).map((x) => x.replace(/\n/g, ' ').trim())) {
    if (!b) continue;
    if (/^#\s+/.test(b) && !ms.paragraphs.length) { ms.title = b.replace(/^#\s+/, ''); continue; }
    if (/^_.*_$/.test(b) && !ms.paragraphs.length) { ms.byline = b.slice(1, -1); continue; }
    ms.paragraphs.push({ text: b, words: wc(b) });
  }
}
const handlers = {};
let timer = null;
let t0 = 0;
export const api = {
  async invoke(ch, p) {
    switch (ch) {
      case 'env:info': return { hasKey: true, cameras: [{ id: 'mock', name: 'Laptop camera' }], sdk: '3.5.0' };
      case 'manuscript:open': return { path: 'layout-check.md', ms };
      case 'capture:start': {
        t0 = Date.now();
        let k = 0;
        timer = setInterval(() => {
          const t = Date.now() - t0; k++;
          handlers['sdk:sample']?.({ t, pulse: t > 3000 ? { v: 71 + Math.sin(k / 9) * 2, c: 92, s: true } : null, expr: { happy: k % 90 < 8 ? 80 : 3 }, blink: [{ ts: k, on: k % 40 < 3, t }], face: true });
          if (k % 10 === 0) { handlers['sdk:fps']?.({ t, fps: 30 }); handlers['sdk:validation']?.({ t, code: 0, hint: '' }); }
        }, 100);
        return { t0 };
      }
      case 'capture:stop': clearInterval(timer); return null;
      // file paths, recorded on window for the end-to-end tests
      case 'file:save-json': window.__saved = JSON.parse(p.json); return `readings/${p.suggested}`;
      case 'file:open-json': return window.__saved ? [{ path: 'readings/mock.reading.json', data: window.__saved }] : [];
      case 'docx:export': window.__exported = p; return 'layout-check (reader notes).docx';
      case 'session:backup': window.__backups = (window.__backups || 0) + 1; return null;
      case 'session:clear': window.__cleared = (window.__cleared || 0) + 1; return null;
      default: return null;
    }
  },
  on(ch, cb) { handlers[ch] = cb; return () => { delete handlers[ch]; }; },
};
