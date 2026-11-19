"""Remove a generator's bright green backdrop from an illustration and crop to the subject.

Bright, saturated green in the hue band 95 to 150 degrees becomes transparent, with a soft
ramp at the edges; darker greens (the book's own cloth) and yellow-green or cyan film are kept.

    py tools/key_green.py in.raw.png out.png
"""
import colorsys
import sys

from PIL import Image, ImageFilter

src, dst = sys.argv[1], sys.argv[2]
im = Image.open(src).convert("RGBA")
if len(sys.argv) > 3:  # optional crop box "x0,y0,x1,y1" applied to the raw image first
    im = im.crop(tuple(int(v) for v in sys.argv[3].split(",")))
w, h = im.size
px = im.load()
alpha = Image.new("L", (w, h), 255)
ap = alpha.load()
for y in range(h):
    for x in range(w):
        r, g, b, _ = px[x, y]
        hh, s, v = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
        deg = hh * 360
        if 95 <= deg <= 150 and s > 0.2 and v > 0.7 and s <= 0.45:
            ap[x, y] = 0  # washed-out backdrop corner (the generator's light falloff)
        elif 95 <= deg <= 150 and s > 0.45 and v > 0.30:
            # fully key the clear backdrop; ramp near the thresholds to avoid a hard fringe.
            # The shadow on the backdrop is a darker saturated green: keyed to a soft partial
            # alpha so it reads as a shadow on whatever cloth sits behind.
            k = min(1.0, (s - 0.45) / 0.2) * min(1.0, (v - 0.30) / 0.12)
            ap[x, y] = int(255 * (1 - k))
            if k < 1.0 and v < 0.42:
                px[x, y] = (8, 14, 10, 255)  # shadow tone, not green (only in the dark shadow band)
alpha = alpha.filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(0.8))
im.putalpha(alpha)
# despill: pull green fringe toward neutral where partly transparent
px = im.load()
for y in range(h):
    for x in range(w):
        r, g, b, a = px[x, y]
        if 0 < a < 250 and g > max(r, b):
            g2 = max(r, b) + (g - max(r, b)) * 0.3
            px[x, y] = (r, int(g2), b, a)
bbox = im.getchannel("A").point(lambda a: 255 if a > 24 else 0).getbbox()
if bbox:
    pad = 12
    bbox = (max(0, bbox[0] - pad), max(0, bbox[1] - pad), min(w, bbox[2] + pad), min(h, bbox[3] + pad))
    im = im.crop(bbox)
im.save(dst, optimize=True)
print(dst, im.size)
