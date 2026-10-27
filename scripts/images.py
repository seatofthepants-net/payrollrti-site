#!/usr/bin/env python3
"""Make the site's images from the app repo's marketing screenshots.

Pulls the PNGs from seatofthepants-net/payrollrti (docs/marketing), covers the
HMRC crown and "HM Revenue & Customs" mark in the hero, and writes web-sized
WebP/AVIF files, the link-preview image and the icons into src/images/.

    pip install pillow   # 11.2 or later for AVIF
    python3 scripts/images.py

Commit the outputs. The site build only copies them.
"""
import io
import pathlib
import urllib.request

from PIL import Image, ImageDraw, ImageFont, features

RAW = "https://raw.githubusercontent.com/seatofthepants-net/payrollrti/main/docs/marketing/"
OUT = pathlib.Path(__file__).resolve().parent.parent / "src" / "images"
OUT.mkdir(parents=True, exist_ok=True)

GREEN = (13, 53, 44)
GREEN_LIGHT = (35, 102, 79)
GOLD = (227, 166, 59)
BPT_HEADER = (0, 91, 91)

# Where the HMRC crown + wordmark sits on hero-light.png (3072x1992).
# If the screenshot is regenerated at a different size, find it again and
# check the output by eye: no crown may appear anywhere on the site.
HERO_SIZE = (3072, 1992)
HERO_LOGO_BOX = (110, 130, 425, 238)


def fetch(name):
    with urllib.request.urlopen(RAW + name) as r:
        return Image.open(io.BytesIO(r.read())).convert("RGBA")


def save_web(im, stem, widths):
    for w in widths:
        h = round(im.height * w / im.width)
        r = im.resize((w, h), Image.LANCZOS)
        r.save(OUT / f"{stem}-{w}.webp", quality=86, method=6)
        if features.check("avif"):
            r.save(OUT / f"{stem}-{w}.avif", quality=60)
        print(f"{stem}-{w}: {w}x{h}")


def pound_font(size):
    for path in (
        "/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf",
        "/System/Library/Fonts/Supplemental/Georgia Bold.ttf",
        "/Library/Fonts/Georgia Bold.ttf",
    ):
        if pathlib.Path(path).exists():
            return ImageFont.truetype(path, size)
    return ImageFont.load_default(size)


def icon(size):
    """Gold pound sign on the green rounded square."""
    scale = 4
    s = size * scale
    im = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    grad = Image.new("RGBA", (s, s))
    d = ImageDraw.Draw(grad)
    for y in range(s):
        t = y / s
        c = tuple(round(GREEN_LIGHT[i] * (1 - t) + GREEN[i] * t) for i in range(3))
        d.line([(0, y), (s, y)], fill=c + (255,))
    mask = Image.new("L", (s, s), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, s - 1, s - 1), radius=round(s * 0.225), fill=255)
    im.paste(grad, (0, 0), mask)
    d = ImageDraw.Draw(im)
    d.text((s / 2, s / 2 + s * 0.02), "£", font=pound_font(round(s * 0.62)), fill=GOLD + (255,), anchor="mm")
    return im.resize((size, size), Image.LANCZOS)


def main():
    hero = fetch("hero-light.png")
    if hero.size != HERO_SIZE:
        raise SystemExit(f"hero-light.png is {hero.size}, expected {HERO_SIZE}: re-find HERO_LOGO_BOX first")
    ImageDraw.Draw(hero).rectangle(HERO_LOGO_BOX, fill=BPT_HEADER + (255,))
    save_web(hero, "basic-paye-tools-on-mac", [1000, 2000])

    # These screens are mostly empty window; crop to the message so it can be read when small.
    for name, stem, box in (
        ("starting-light.png", "starting", (0.32, 0.41, 0.68, 0.60)),
        ("bpt-not-installed-light.png", "bpt-not-installed", (0.22, 0.32, 0.78, 0.70)),
    ):
        im = fetch(name).convert("RGB")
        W, H = im.size
        im = im.crop((round(box[0] * W), round(box[1] * H), round(box[2] * W), round(box[3] * H)))
        save_web(im, stem, [600, 1200])

    # Link preview: hero window on the site green.
    og = Image.new("RGB", (1200, 630), GREEN)
    w = 1080
    h = round(hero.height * w / hero.width)
    og.paste(hero.resize((w, h), Image.LANCZOS), ((1200 - w) // 2, 40), hero.resize((w, h), Image.LANCZOS))
    og.save(OUT / "og.png", optimize=True)

    icon(180).save(OUT / "apple-touch-icon.png", optimize=True)
    icon(512).save(OUT / "icon-512.png", optimize=True)
    icon(32).save(OUT / "favicon-32.png", optimize=True)
    print("done")


if __name__ == "__main__":
    main()
