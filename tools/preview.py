"""Submission preview images: the slides from tools/gallery.py, in the demo video's order,
copied to broll/preview/ as 1-*.png ... 8-*.png with captions.md beside them.

    py tools/gallery.py   # renders the slides and their captions into post/img/
    py tools/preview.py

Captions are taken from post/img/captions.md (numbers come from the results files there), and
captions.md here holds only the caption text, one fenced block per image. Lengths are checked
and printed to this terminal only.
"""
import re
import shutil
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "post" / "img"
OUT = ROOT / "broll" / "preview"

# the demo's order: promise, consent, reading, refusal, marks, graded result, pulse check, Word
ORDER = ["1-home", "2-consent", "3-read", "6-refusal", "4-marks", "5-result", "5b-pulse", "7-word"]
NAMES = ["home", "consent", "read", "refusal", "marks", "result", "pulse", "word"]

caps = dict(re.findall(r"## (\S+)\.png\s+```\n(.+?)\n```", (SRC / "captions.md").read_text(encoding="utf-8")))
assert len(ORDER) <= 8

if OUT.exists():
    shutil.rmtree(OUT)
OUT.mkdir(parents=True)
blocks = ["# Preview images", "", "One caption per image, in upload order. Copy the block contents only.", ""]
for i, (src, name) in enumerate(zip(ORDER, NAMES), 1):
    img = SRC / f"{src}.png"
    w, h = Image.open(img).size
    size = img.stat().st_size
    cap = caps[src]
    ok = abs(w / h - 1.5) < 0.01 and size <= 5 * 1024 * 1024 and len(cap) <= 140 and "—" not in cap
    dest = OUT / f"{i}-{name}.png"
    shutil.copy(img, dest)
    print(f"  {'ok ' if ok else 'BAD'} {dest.name:16} {w}x{h} {size // 1024:5} KB  caption {len(cap)}/140")
    assert ok, dest.name
    blocks += [f"## {dest.name}", "", "```", cap, "```", ""]
(OUT / "captions.md").write_text("\n".join(blocks), encoding="utf-8")
print(f"{len(ORDER)} images and captions.md in {OUT.relative_to(ROOT)}")
