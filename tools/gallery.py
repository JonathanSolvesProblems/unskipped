"""Images for the DEV post: composed slides in demo order, each a headline, a badge naming
where the picture came from, a capture of the real screen, and a caption.

    py tools/gallery.py            build from what exists now
    py tools/gallery.py --final    refuse to finish if any slide is still a preview

Numbers come from results/summary.json (written by tools/results.js), never typed here, so a
re-scored session re-renders the slides. Screens are captured from the app's own pages served
from this repo; a hand-taken still in out/stills/<name>.png replaces the capture for that slide
(use it for the live reading screen and the Google Docs shot, which a browser cannot fake).

Until results/sessions/graded.json exists, the review slides use the simulated layout fixture
and every such slide is stamped "Preview". Previews go to out/gallery/; finished slides go to
post/img/ for the post. Story text is never printed here.
"""
import json
import subprocess
import sys
from pathlib import Path

from PIL import Image
from playwright.sync_api import sync_playwright

sys.path.insert(0, str(Path(__file__).resolve().parent))
from e2e import serve  # noqa: E402  same static server as the end-to-end suite

ROOT = Path(__file__).resolve().parent.parent
STILLS = ROOT / "out" / "stills"
WORK = ROOT / "tmp" / "gallery"
GRADED = ROOT / "results" / "sessions" / "graded.json"
STORY = "stories/the-open-window.md"
W, H = 1500, 1000
CAP = {"width": 1280, "height": 800}


def summary():
    f = ROOT / "results" / "summary.json"
    if not GRADED.exists() or not f.exists():
        return None
    return json.loads(f.read_text(encoding="utf-8"))["sessions"].get("graded")


def capture(page, base, name, real):
    """Screenshot one screen into WORK/cap-<name>.png. Returns (path, is_preview)."""
    still = STILLS / f"{name}.png"
    if still.exists():
        return still, False
    ms = f"&ms=../../{STORY}" if real else ""
    session = "../../results/sessions/graded.json" if real else "../../tmp/ui-fixture-session.json"
    out = WORK / f"cap-{name}.png"
    if name == "home":
        page.goto(base + "app/ui/index.html?mock=1")
        page.wait_for_selector(".sample-page .flag")
        preview = False
    elif name == "consent":
        page.goto(base + "app/ui/index.html?mock=1&screen=consent" + ms)
        page.wait_for_selector("#ok")
        preview = False
    elif name == "read":
        page.goto(base + "app/ui/index.html?mock=1&screen=read" + ms)
        page.wait_for_selector("#page p[data-i]", timeout=15000)
        page.mouse.wheel(0, 700)
        page.wait_for_timeout(2500)
        preview = True  # signals are simulated in a browser; the real one is a still
    elif name == "marks":
        page.goto(base + "app/ui/index.html?mock=1&screen=marks" + ms)
        page.wait_for_selector(".markable p[data-i]", timeout=15000)
        for i, clicks in ((1, 1), (3, 1), (6, 2)):
            for _ in range(clicks):
                page.click(f".markable p[data-i='{i}']")
        page.evaluate("window.scrollTo(0, 0)")
        preview = not real
    elif name in ("result", "refusal"):
        if name == "refusal":
            # a real refusal needs a session with planted no-reading paragraphs (the controls re-run)
            if not (ROOT / "results" / "sessions" / "controls2.json").exists():
                return None, True
            session = "../../results/sessions/controls2.json"
        page.goto(base + "app/ui/index.html?session=" + session)
        page.wait_for_selector(".verdict h1")
        page.wait_for_timeout(1200)  # flags finish sliding out
        if name == "refusal":
            flag = page.locator(".annot .flag.none").first
            if flag.count():
                flag.scroll_into_view_if_needed()
                flag.click()
                page.evaluate("document.querySelector('.annot .flag.cur').scrollIntoView({block:'center'})")
                page.wait_for_timeout(500)
        preview = not real
    elif name in ("word", "pulse"):
        return None, True  # only a real still will do
    else:
        raise ValueError(name)
    page.screenshot(path=str(out))
    return out, preview


def slides(s):
    """Story order = post/demo-script.md. Headlines obey the charter: sentence case, no full stop, no colon."""
    real = s is not None
    pc = json.loads((ROOT / "results" / "pulse-check.json").read_text(encoding="utf-8"))
    pulse_cap = (f"{pc['within5']} of {pc['pairs']} readings within 5 bpm of the oximeter, mean gap {pc['meanAbsDiff']} bpm. "
                 "One person, one sitting, pulse rate only.")
    src = "Recorded session results/sessions/graded.json, scored by src/score.js" if real else "Layout preview, simulated session"
    if real:
        got, dwell, refused = s["camera"]["got"], s["dwell"]["got"], s["refused"]
        reasons = sorted({r["reason"] for r in refused})
        result_head = f"Of the {got['marked']} paragraphs the reader marked as got me, the camera flagged {got['found']}"
        result_cap = (f"Graded against the reader's own marks. Random flags would find {got['chance']}; "
                      f"time on the page alone found {dwell['found']} of {dwell['marked']}.")
        refusal_cap = "Planted controls: no reading when the reader reads aloud or turns away, with the reason, never a guess."
        summ = json.loads((ROOT / "results" / "summary.json").read_text(encoding="utf-8"))
        c2 = (summ.get("controls") or {}).get("controls2")
        if c2:
            refusal_cap = (f"Planted controls: {c2['plantedRefused']} of {c2['planted']} planted paragraphs refused with the right reason, "
                           f"{c2['harmlessRead']} of {c2['harmless']} normal ones read.")
    else:
        result_head = "Of the paragraphs the reader marked as got me, the camera flagged some"
        result_cap = "Preview. The real numbers come from results/summary.json once the graded reading is in."
        refusal_cap = "Preview. Paragraphs with no reading say why: looked away, talking, too dark or moving."
    plan = [
        ("1-home", "home", "See where your reader stopped caring", "Unskipped, home screen",
         "A beta reader's reactions land in the writer's margin as page flags, read by Presage SmartSpectra on the reader's laptop."),
        ("2-consent", "consent", "The reader agrees before the camera turns on", "Unskipped, consent screen",
         "What the camera reads, that video never leaves the laptop, telemetry off, and that the reader approves every note."),
        ("3-read", "read", "The camera reads the reader while they read", "Live capture, SmartSpectra Node SDK 3.5.0",
         "One paragraph at a time, so the app knows which one is read; live pulse and blinks from the laptop webcam beside it."),
        ("4-marks", "marks", "The reader marks their own moments first", "Unskipped, marks screen",
         "Before any result is shown, the reader marks what got them and what lost them. Those marks are the grader."),
        ("5-result", "result", result_head, src, result_cap),
        ("5b-pulse", "pulse", "The webcam pulse, checked against a fingertip sensor", "Measured, LOOKEE A310 oximeter", pulse_cap),
        ("6-refusal", "refusal", "When it cannot tell, it says so", "Recorded session results/sessions/controls2.json, scored by src/score.js", refusal_cap),
        ("7-word", "word", "The notes land in the writer's own manuscript", "Exported .docx, opened in Microsoft Word",
         "Every note the reader kept becomes a comment on its paragraph, signed with the reader's name."),
    ]
    has_controls = (ROOT / "results" / "sessions" / "controls2.json").exists()
    return [x for x in plan if x[1] != "refusal" or has_controls]


SLIDE = """<!doctype html><html><head><meta charset="utf-8"><style>
@font-face{{font-family:Literata;src:url(../../app/ui/fonts/literata-latin-opsz-normal.woff2) format('woff2');font-weight:200 900}}
@font-face{{font-family:Figtree;src:url(../../app/ui/fonts/figtree-latin-400-normal.woff2) format('woff2');font-weight:400}}
@font-face{{font-family:Figtree;src:url(../../app/ui/fonts/figtree-latin-500-normal.woff2) format('woff2');font-weight:500}}
html,body{{margin:0;width:{W}px;height:{H}px;background:#22352b;overflow:hidden}}
body{{box-sizing:border-box;padding:52px 64px 44px;display:grid;grid-template-rows:auto 1fr auto;gap:26px;color:#eef2ee}}
header{{display:flex;justify-content:space-between;align-items:flex-start;gap:40px}}
h1{{margin:0;font:500 50px/1.12 Literata,serif;font-variation-settings:'opsz' 60;letter-spacing:-.01em;max-width:1000px;text-wrap:balance}}
.badge{{flex:none;margin-top:8px;background:#f7f8f5;color:#1a1f1c;font:500 15px/1.3 Figtree,sans-serif;padding:9px 14px;border-radius:3px;max-width:300px;
  box-shadow:0 1px 1px rgba(0,0,0,.2),0 8px 18px -8px rgba(0,0,0,.4)}}
figure{{margin:0;min-height:0;display:flex;justify-content:center;align-items:center}}
img{{max-width:100%;max-height:100%;border-radius:4px;box-shadow:0 1px 1px rgba(0,0,0,.22),0 2px 3px rgba(0,0,0,.18),0 18px 36px -12px rgba(0,0,0,.45)}}
p{{margin:0;font:400 22px/1.4 Figtree,sans-serif;color:#c4d1c8;max-width:1180px}}
.stamp{{position:absolute;right:64px;bottom:40px;border:2px solid #c4d1c8;color:#c4d1c8;font:500 18px Figtree,sans-serif;padding:6px 12px;border-radius:3px;transform:rotate(-3deg)}}
</style></head><body>
<header><h1>{head}</h1><div class="badge">{badge}</div></header>
<figure><img src="{img}"></figure>
<p>{cap}</p>{stamp}
</body></html>"""


COVER = """<!doctype html><html><head><meta charset="utf-8"><style>
@font-face{{font-family:Literata;src:url(../../app/ui/fonts/literata-latin-opsz-normal.woff2) format('woff2');font-weight:200 900}}
@font-face{{font-family:Figtree;src:url(../../app/ui/fonts/figtree-latin-400-normal.woff2) format('woff2');font-weight:400}}
html,body{{margin:0;width:1000px;height:420px;background:#22352b;overflow:hidden;color:#eef2ee}}
.copy{{position:absolute;left:56px;top:0;bottom:0;width:470px;display:flex;flex-direction:column;justify-content:center;gap:18px}}
.mark{{font:500 30px Literata,serif;display:flex;align-items:flex-start;gap:3px}}
.mark i{{display:block;width:16px;height:9px;background:#ff4f93;margin-top:9px}}
h1{{margin:0;font:500 52px/1.06 Literata,serif;font-variation-settings:'opsz' 72;letter-spacing:-.015em}}
p{{margin:0;font:400 17px/1.4 Figtree,sans-serif;color:#c4d1c8}}
img{{position:absolute;right:24px;top:50%;transform:translateY(-50%);height:418px;
  -webkit-mask-image:linear-gradient(to right,transparent,#000 9%,#000 94%,transparent),linear-gradient(transparent,#000 5%,#000 95%,transparent);
  -webkit-mask-composite:source-in;mask-composite:intersect}}
</style></head><body>
<div class="copy"><div class="mark">Unskipped<i></i></div><h1>See where your reader stopped caring</h1>
<p>A beta reader's face and pulse leave page flags in the writer's margin. Built on Presage SmartSpectra.</p></div>
<img src="{img}">
</body></html>"""


def esc(t):
    return t.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def main():
    final = "--final" in sys.argv
    subprocess.run(["node", "tools/ui-fixture.js"], cwd=ROOT, check=True, capture_output=True)
    if GRADED.exists():
        subprocess.run(["node", "tools/results.js"], cwd=ROOT, check=True, capture_output=True)
    s = summary()
    WORK.mkdir(parents=True, exist_ok=True)
    plan = slides(s)
    built, previews, missing = [], [], []
    srv, base = serve()
    with sync_playwright() as p:
        b = p.chromium.launch()
        cap_page = b.new_page(viewport=CAP, device_scale_factor=2)
        slide_page = b.new_page(viewport={"width": W, "height": H}, device_scale_factor=1)
        for name, screen, head, badge, cap in plan:
            assert len(cap) <= 140, f"{name}: caption over 140 characters"
            assert not head.endswith(".") and ":" not in head, f"{name}: headline breaks charter law 9"
            img, preview = capture(cap_page, base, screen, s is not None)
            if img is None:
                missing.append(f"{name} (needs out/stills/{screen}.png)")
                continue
            if preview:
                previews.append(name)
            rel = Path("../..") / img.relative_to(ROOT)
            html = SLIDE.format(W=W, H=H, head=esc(head), badge=esc(badge), img=rel.as_posix(), cap=esc(cap),
                                stamp='<div class="stamp">Preview, not for the post</div>' if preview else "")
            (WORK / f"{name}.html").write_text(html, encoding="utf-8")
            slide_page.goto(base + f"tmp/gallery/{name}.html")
            slide_page.evaluate("document.fonts.ready")
            slide_page.wait_for_function("[...document.images].every(i => i.complete && i.naturalWidth)")
            built.append((name, cap, preview, slide_page.screenshot(type="png")))
        # DEV cover (1000x420): the wordmark and promise beside the flagged sample page from home
        cap_page.goto(base + "app/ui/index.html?mock=1")
        cap_page.wait_for_selector(".sample-page .flag")
        cap_page.wait_for_timeout(800)
        box = cap_page.locator(".sample-page").bounding_box()
        pad = 48
        cap_page.screenshot(path=str(WORK / "cap-cover.png"), clip={
            "x": box["x"] - pad, "y": box["y"] - pad, "width": box["width"] + 2 * pad, "height": box["height"] + 2 * pad})
        cover = COVER.format(img="cap-cover.png")
        (WORK / "cover.html").write_text(cover, encoding="utf-8")
        cover_page = b.new_page(viewport={"width": 1000, "height": 420}, device_scale_factor=2)
        cover_page.goto(base + "tmp/gallery/cover.html")
        cover_page.evaluate("document.fonts.ready")
        cover_page.wait_for_function("[...document.images].every(i => i.complete && i.naturalWidth)")
        cover_png = cover_page.screenshot(type="png")
        b.close()
    srv.shutdown()
    (ROOT / "post" / "img").mkdir(parents=True, exist_ok=True)
    (ROOT / "post" / "img" / "cover.png").write_bytes(cover_png)  # no story text, no numbers: always final
    print("  ok      cover.png (post/img, 1000x420 at 2x)")

    done = not previews and not missing
    out = ROOT / ("post/img" if done else "out/gallery")
    out.mkdir(parents=True, exist_ok=True)
    for name, cap, preview, png in built:
        (out / f"{name}.png").write_bytes(png)
    lines = ["# Post images, in demo order", "", "One caption per image. Copy the block contents only.", ""]
    for name, cap, _, _ in built:
        lines += [f"## {name}.png", "", "```", cap, "```", ""]
    (out / "captions.md").write_text("\n".join(lines), encoding="utf-8")

    # contact sheet for one look at the whole set
    ims = [Image.open(out / f"{n}.png").convert("RGB").resize((750, 500)) for n, *_ in built]
    if ims:
        rows = (len(ims) + 1) // 2
        sheet = Image.new("RGB", (1500, 500 * rows), (34, 53, 43))
        for k, im in enumerate(ims):
            sheet.paste(im, ((k % 2) * 750, (k // 2) * 500))
        sheet.save(ROOT / "out" / "gallery-contact.png")

    for name, cap, preview, _ in built:
        f = out / f"{name}.png"
        print(f"  {'preview' if preview else 'ok     '} {f.name:<16} {f.stat().st_size // 1024:>4} KB   caption {len(cap):>3}/140")
    for m in missing:
        print(f"  missing {m}")
    print(f"\n{len(built)} slides in {out.relative_to(ROOT)}; contact sheet out/gallery-contact.png")
    if final and not done:
        print("--final: not finished, see preview and missing lines above")
        sys.exit(1)


if __name__ == "__main__":
    main()
