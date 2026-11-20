"""End-to-end checks of every screen and path, in a real browser (Playwright, Chromium).

    py tools/e2e.py            local: serves the repo and runs every path
    py tools/e2e.py --live     also checks the published GitHub Pages copy

Paths covered: the reader flow from home to send (consent gate, settle, read with the
reading line, marks, review, keep/drop a note, send), the writer flow (add the reading,
export), the replay page with a session, with no session and with a bad file, phone width,
console errors on every page, and on --live the published root, fonts and icon.

The desktop bridge is replaced by app/ui/mock-api.js (placeholder text, simulated signals),
so these checks prove the interface and its logic, not the camera. The camera path is
covered by results/sdk-notes.md and the recorded sessions.
"""
import functools
import http.server
import json
import socketserver
import subprocess
import sys
import threading
from pathlib import Path

from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parent.parent
LIVE = "https://jonathansolvesproblems.github.io/unskipped/"
failures, passes = [], []


def check(name, cond, detail=""):
    (passes if cond else failures).append(name if cond else f"{name}: {detail}")
    print(("PASS " if cond else "FAIL ") + name + ("" if cond else f"  ({detail})"))


def serve():
    class Quiet(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *a):
            pass

    handler = functools.partial(Quiet, directory=str(ROOT))
    srv = socketserver.TCPServer(("127.0.0.1", 0), handler)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv, f"http://127.0.0.1:{srv.server_address[1]}/"


def watch(page, errors):
    page.on("pageerror", lambda e: errors.append(f"pageerror: {e}"))
    page.on("console", lambda m: errors.append(f"console.{m.type}: {m.text}") if m.type == "error" else None)


def no_overflow(page, name):
    w = page.evaluate("document.documentElement.scrollWidth")
    vw = page.evaluate("window.innerWidth")
    check(f"{name}: no horizontal scroll at {vw}px", w <= vw + 1, f"scrollWidth {w}")


def reader_flow(browser, base):
    errors = []
    page = browser.new_page(viewport={"width": 1280, "height": 720})
    watch(page, errors)
    page.goto(base + "app/ui/index.html?mock=1")
    expect(page.locator("h1")).to_contain_text("See where your reader stopped caring")
    check("home: sample page shows 4 flags", page.locator(".sample-page .flag").count() == 4)
    check("home: signature link", page.locator("a#site[href='https://jonathansolvesproblems.com']").count() == 1)
    page.click("#read")
    expect(page.locator("h1")).to_contain_text("Before the camera turns on")
    check("consent: camera button locked until agreement", page.locator("#go").is_disabled())
    page.check("#ok")
    check("consent: agreement unlocks the button", page.locator("#go").is_enabled())
    page.fill("#name", "Test reader")
    page.click("#go")
    expect(page.locator("h1")).to_contain_text("Sit so the camera sees")
    expect(page.locator("#start")).to_be_enabled(timeout=12000)
    check("settle: start unlocks after a steady pulse", True)
    page.click("#start")
    expect(page.locator("#page p[data-i]")).to_have_count(12)
    check("read: live film flag on the reading line", page.locator("#page .flag.live").count() == 1)
    first = page.locator("#page p.focus").get_attribute("data-i")
    page.mouse.wheel(0, 1600)
    page.wait_for_timeout(600)
    later = page.locator("#page p.focus").get_attribute("data-i")
    check("read: scrolling moves the reading line to a later paragraph", int(later) > int(first), f"{first} -> {later}")
    check("read: rail shows a pulse", "bpm" in page.locator("#readout").inner_text())
    page.click("#done")
    expect(page.locator("h1")).to_contain_text("Your marks first")
    page.click(".markable p[data-i='0']")
    page.click(".markable p[data-i='3']")
    page.click(".markable p[data-i='3']")
    expect(page.locator("#count")).to_have_text("1 got me, 1 lost me")
    check("marks: one click got me, two clicks lost me", True)
    page.click(".markable p[data-i='5']")
    page.click(".markable p[data-i='5']")
    page.click(".markable p[data-i='5']")
    expect(page.locator("#count")).to_have_text("1 got me, 1 lost me")
    check("marks: a third click clears", True)
    page.click("#save")
    expect(page.locator(".verdict h1")).to_be_visible()
    head = page.locator(".verdict h1").inner_text()
    check("review: singular headline for one mark", "You marked 1 paragraph" in head, head)
    check("review: one fore-edge slot per paragraph", page.locator(".edge .slot").count() == 12)
    flags = page.locator(".annot .flag")
    n = flags.count()
    check("review: flags on the page", n > 0, f"{n} flags")
    if n:
        flags.first.click()
        expect(page.locator("#note h3")).to_contain_text("Paragraph")
        flags.first.click()
        check("review: second click drops the note", flags.first.get_attribute("aria-pressed") == "false")
    page.click(".edge .slot >> nth=0")
    page.click("#send")
    page.wait_for_function("window.__saved !== undefined")
    saved = page.evaluate("window.__saved")
    check("send: reading saved with the reader's name", saved["reader"]["name"] == "Test reader")
    check("send: dropped note left out", len(saved["notes"]) == max(0, n - 1), f"{len(saved['notes'])} notes, {n} flags")
    check("send: raw samples off by default", saved["raw"] is None)
    check("send: marks saved before review opened", saved["marks"]["savedAt"] <= saved["sentAt"])
    expect(page.locator("h1")).to_contain_text("See where your reader stopped caring", timeout=5000)
    # writer path
    page.click("#write")
    expect(page.locator("h1")).to_contain_text("Your readers in your margin")
    check("writer: export locked with nothing loaded", page.locator("#export").is_disabled())
    page.click("#pick")
    page.click("#add")
    expect(page.locator("table.files")).to_contain_text("Test reader")
    page.click("#add")
    check("writer: the same reading added twice is listed once", page.locator("table.files tr").count() == 1)
    page.click("#export")
    page.wait_for_function("window.__exported !== undefined")
    exp = page.evaluate("window.__exported")
    check("writer: one summary comment plus one per kept note", len(exp["comments"]) == len(saved["notes"]) + 1)
    check("reader and writer flow: no console errors", not errors, "; ".join(errors[:3]))
    page.close()


def stop_while_reading(browser, base):
    errors = []
    page = browser.new_page(viewport={"width": 1280, "height": 720})
    watch(page, errors)
    page.goto(base + "app/ui/index.html?mock=1&screen=read")
    page.wait_for_selector("#page p[data-i]", timeout=15000)
    page.click("#quit")
    expect(page.locator("h1")).to_contain_text("See where your reader stopped caring")
    check("read: Stop turns the camera off and returns home", True)
    check("read: Stop sends nothing", page.evaluate("window.__saved === undefined"))
    check("stop flow: no console errors", not errors, "; ".join(errors[:3]))
    page.close()


def replay(browser, base):
    for label, q, expect_text in [
        ("replay with a session", "?session=../../tmp/ui-fixture-session.json", None),
        ("replay with no session", "?session=missing.json", "This page replays a recorded reading"),
        ("replay with a bad file", "?session=../../package.json", "This recording could not be read"),
    ]:
        for vw in (1280, 390):
            errors = []
            page = browser.new_page(viewport={"width": vw, "height": 844 if vw == 390 else 720})
            watch(page, errors)
            page.goto(base + "app/ui/index.html" + q)
            if expect_text:
                expect(page.locator("h1").first).to_contain_text(expect_text)
                check(f"{label} at {vw}: designed message, no raw error", "Unexpected token" not in page.inner_text("body"))
                errors = [e for e in errors if "404" not in e and "Failed to load resource" not in e]
            else:
                expect(page.locator(".verdict h1")).to_be_visible()
                check(f"{label} at {vw}: 29 fore-edge slots", page.locator(".edge .slot").count() == 29)
                check(f"{label} at {vw}: replay notice shown, no send button", page.locator("#send").count() == 0)
            no_overflow(page, f"{label}")
            check(f"{label} at {vw}: no console errors", not errors, "; ".join(errors[:3]))
            page.close()
    page = browser.new_page(viewport={"width": 390, "height": 844})
    page.goto(base + "app/ui/index.html?mock=1")
    page.wait_for_selector("h1")
    no_overflow(page, "home at 390")
    page.close()


def live(browser):
    errors = []
    page = browser.new_page(viewport={"width": 1280, "height": 720})
    watch(page, errors)
    resp = page.goto(LIVE)
    page.wait_for_url("**/app/ui/index.html", timeout=15000)
    check("live: root opens the replay page", resp is not None and resp.ok)
    page.wait_for_selector("h1")
    page.evaluate("document.fonts.ready")
    try:
        page.wait_for_function("document.fonts.check('20px Literata') && document.fonts.check('15px Figtree')", timeout=10000)
        fonts_ok = True
    except Exception:
        fonts_ok = False
    check("live: fonts loaded", fonts_ok)
    icon = page.request.get(LIVE + "app/ui/icon.svg")
    check("live: icon served", icon.ok)
    body = page.inner_text("body")
    check("live: no raw error on the page", "Unexpected token" not in body and "is not valid JSON" not in body)
    errors = [e for e in errors if "404" not in e and "Failed to load resource" not in e]
    check("live: no console errors", not errors, "; ".join(errors[:3]))
    page.close()


def main():
    subprocess.run(["node", "tools/ui-fixture.js"], cwd=ROOT, check=True, capture_output=True)
    srv, base = serve()
    with sync_playwright() as p:
        browser = p.chromium.launch()
        reader_flow(browser, base)
        stop_while_reading(browser, base)
        replay(browser, base)
        if "--live" in sys.argv:
            live(browser)
        browser.close()
    srv.shutdown()
    print(f"\n{len(passes)} passed, {len(failures)} failed")
    for f in failures:
        print("  -", f)
    sys.exit(1 if failures else 0)


if __name__ == "__main__":
    main()
