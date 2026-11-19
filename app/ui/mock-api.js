// Dev-only stand-in for the desktop bridge, loaded with ?mock=1 to render screens in a browser
// for layout review. Placeholder text and simulated signals; never used for any result.
const filler = 'This placeholder paragraph stands in for a page of a manuscript so the layout can be checked without showing the story before it is read.';
const ms = {
  title: 'Layout check', byline: 'Placeholder text, simulated signals',
  paragraphs: Array.from({ length: 12 }, (_, i) => {
    const text = Array.from({ length: 1 + (i * 7) % 4 }, () => filler).join(' ');
    return { text, words: text.split(' ').length };
  }),
};
const handlers = {};
let timer = null;
let t0 = 0;
export const api = {
  async invoke(ch) {
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
      default: return null;
    }
  },
  on(ch, cb) { handlers[ch] = cb; return () => { delete handlers[ch]; }; },
};
