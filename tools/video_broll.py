"""Browser b-roll for the demo video, recorded as video (Playwright, 1920x1080) into broll/.

    py tools/video_broll.py [shot ...]

  b01-source-beta   the Indies Unlimited open letter, scrolled to the vague-praise line it quotes
  b02-source-leonard  Quote Investigator's trace of Elmore Leonard's rule 10 (NYT, July 16, 2001)
  b04-source-telemetry  SmartSpectra's telemetry doc: with telemetry off the SDK "transmits nothing"
  b07-source-blink  ScienceDaily on the Waterloo study: readers blinked more when their minds wandered
  b05-flags        the live replay page: the graded read's flags opening their notes
  b06-noreading     the live replay page with the second controls session: a "no reading" note
"""
import shutil
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "broll"
TMP = ROOT / "tmp" / "pw-video"
LIVE = "https://jonathansolvesproblems.github.io/unskipped/app/ui/"
SIZE = {"width": 1920, "height": 1080}


def record(browser, name, run, view=None):
    # a smaller viewport recorded at 1920x1080 makes the text larger on screen
    TMP.mkdir(parents=True, exist_ok=True)
    ctx = browser.new_context(viewport=view or SIZE, record_video_dir=str(TMP), record_video_size=view or SIZE)
    page = ctx.new_page()
    run(page)
    video = page.video
    ctx.close()
    dest = OUT / f"{name}.webm"
    shutil.move(video.path(), dest)
    print("ok", dest.name)


def smooth_to(page, selector_js, offset=0.35, ms=1600):
    page.evaluate(f"""() => {{
      const el = {selector_js}; if (!el) return;
      const y = el.getBoundingClientRect().top + scrollY - innerHeight * {offset};
      const y0 = scrollY, t0 = performance.now();
      const step = (t) => {{ const k = Math.min(1, (t - t0) / {ms}); const e = k < .5 ? 2*k*k : 1 - Math.pow(-2*k + 2, 2) / 2;
        scrollTo(0, y0 + (y - y0) * e); if (k < 1) requestAnimationFrame(step); }};
      requestAnimationFrame(step);
    }}""")
    page.wait_for_timeout(ms + 200)


def source_page(url, pattern, zoom=1.55, hold=4200):
    """Open a cited source, highlight the passage the narration relies on, and glide to it."""
    def run(page):
        # keep cookie dialogs, newsletter pop-ups and shop pills off the page for the whole clip,
        # including ones that appear late; the article text itself is never touched
        page.add_init_script("""setInterval(() => {
            for (const el of document.querySelectorAll('html *')) {
              if (el === document.body || el === document.head || el.closest('head')) continue;
              const cs = getComputedStyle(el);
              const overlay = (['fixed', 'sticky'].includes(cs.position) || (el.shadowRoot && !el.closest('article, main')) || el.id === 'cmpwrapper')
                && el.tagName !== 'HEADER' && !el.querySelector('#mark-quote');
              const shop = el.children.length < 4 && /Bestsellers|Thrillers/.test(el.textContent) && el.textContent.length < 60;
              if (overlay || shop) el.remove();
            }
            document.documentElement.style.overflow = 'auto'; document.body.style.overflow = 'auto';
          }, 250);""")
        page.goto(url, wait_until="domcontentloaded", timeout=60000)
        page.wait_for_timeout(3000)
        # mark the passage, the way a reader would underline it
        found = page.evaluate("""(src) => { const re = new RegExp(src, 'i');
            const p = [...document.querySelectorAll('p, li, blockquote, dd')].find((x) => re.test(x.textContent) && x.offsetParent && !x.closest('.modal'));
            if (!p) return false;
            p.style.background = 'rgba(255,224,58,.45)'; p.style.outline = '6px solid rgba(255,224,58,.45)'; p.id = 'mark-quote'; p.style.fontSize = '1.15em';
            return true; }""", pattern)
        if not found:
            raise SystemExit(f"passage not found on {url}: {pattern}")
        page.evaluate(f"document.body.style.zoom = '{zoom}'")
        page.wait_for_timeout(600)
        smooth_to(page, "document.getElementById('mark-quote')", 0.35, 2200)
        page.wait_for_timeout(hold)
    return run


source_beta = source_page("https://indiesunlimited.com/2014/05/27/open-letter-to-beta-readers/", "I liked it")
source_leonard = source_page("https://quoteinvestigator.com/2017/11/14/skip/", "leave out the part that readers tend to skip")
source_blink = source_page("https://www.sciencedaily.com/releases/2010/04/100429153959.htm", "blinked more")
source_telemetry = source_page("https://smartspectra.presagetech.com/docs/telemetry-and-privacy", "transmits nothing", 1.4)


def flags(page):
    page.goto(LIVE, wait_until="load", timeout=60000)
    page.wait_for_selector(".verdict h1", timeout=30000)
    page.wait_for_timeout(1500)
    smooth_to(page, "document.querySelector('#annot')", 0.08, 1400)
    for sel in [".annot .flag.smile", ".annot .flag.grip >> nth=1", ".annot .flag.grip >> nth=3"]:
        loc = page.locator(sel)
        if loc.count():
            idx = loc.first.get_attribute("data-i")
            smooth_to(page, f"document.querySelector('.annot .para[data-i=\"{idx}\"]')", 0.32, 1100)
            loc.first.click()
            page.wait_for_timeout(2300)
    smooth_to(page, "document.querySelector('.legend-row')", 0.4, 1400)
    page.wait_for_timeout(2500)


def noreading(page):
    page.goto(LIVE + "?session=../../results/sessions/controls2.json", wait_until="load", timeout=60000)
    page.wait_for_selector(".verdict h1", timeout=30000)
    page.wait_for_timeout(1200)
    smooth_to(page, "document.querySelector('.annot .para[data-i=\"8\"]')", 0.42, 1400)
    page.wait_for_timeout(700)
    flag = page.locator(".annot .para[data-i='8'] .flag")
    if flag.count():
        flag.first.click(force=True)
    page.wait_for_timeout(4500)


SHOTS = {
    "b01-source-beta": (source_beta, None),
    "b02-source-leonard": (source_leonard, None),
    "b04-source-telemetry": (source_telemetry, None),
    "b05-flags": (flags, {"width": 1280, "height": 720}),
    "b06-noreading": (noreading, {"width": 1280, "height": 720}),
    "b07-source-blink": (source_blink, None),
}

if __name__ == "__main__":
    import sys
    names = sys.argv[1:] or list(SHOTS)
    with sync_playwright() as p:
        b = p.chromium.launch()
        for name in names:
            run, view = SHOTS[name]
            record(b, name, run, view)
        b.close()
