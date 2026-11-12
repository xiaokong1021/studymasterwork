#!/usr/bin/env python3
"""Regenerate desktop assets on macOS with Python Pillow and system fonts."""

from pathlib import Path
import math

from PIL import Image, ImageDraw, ImageFilter, ImageFont


ROOT = Path(__file__).resolve().parent
CORAL = "#ef9b79"
INK = "#39251f"
CANVAS = "#1e1d20"
TEXT = "#f4f3f5"
MUTED = "#bcb9bf"


def icon():
    # The same two nodes and connecting elbow as the UI's Lucide Workflow mark.
    image = Image.new("RGBA", (1024, 1024))
    mask = Image.new("L", image.size)
    ImageDraw.Draw(mask).rounded_rectangle((100, 112, 924, 936), radius=184, fill=90)
    shadow = Image.new("RGBA", image.size, (0, 0, 0, 0))
    shadow.putalpha(mask.filter(ImageFilter.GaussianBlur(15)))
    image.alpha_composite(shadow)
    draw = ImageDraw.Draw(image)
    draw.rounded_rectangle((100, 100, 924, 924), radius=184, fill=CORAL)
    # Draw at 24x geometry, scaled to a 600 px mark centered on the tile.
    def rect(box):
        x1, y1, x2, y2 = (212 + value * 25 for value in box)
        draw.rounded_rectangle((x1 - 28, y1 - 28, x2 + 28, y2 + 28), radius=78, outline=INK, width=56)

    rect((3, 3, 11, 11))
    rect((13, 13, 21, 21))
    # M7 11v4a2 2 0 0 0 2 2h4, with round joins and caps.
    curve = [(437 + 50 * math.cos(math.pi - step * math.pi / 64),
              587 + 50 * math.sin(math.pi - step * math.pi / 64)) for step in range(33)]
    draw.line([(387, 487), *curve, (537, 637)], fill=INK, width=56, joint="curve")
    for x, y in curve:
        draw.ellipse((x - 28, y - 28, x + 28, y + 28), fill=INK)
    return image


def font(size, bold=False, chinese=False):
    if chinese:
        candidate = Path("/System/Library/Fonts/Hiragino Sans GB.ttc")
    else:
        candidate = Path("/System/Library/Fonts/Supplemental") / ("Arial Bold.ttf" if bold else "Arial.ttf")
    return ImageFont.truetype(str(candidate), size)


def background():
    scale = 2
    image = Image.new("RGB", (660 * scale, 440 * scale), CANVAS)
    draw = ImageDraw.Draw(image)

    def centered(y, text, size, color=TEXT, bold=False, chinese=False):
        draw.text((660, y * scale), text, font=font(size * scale, bold, chinese), fill=color, anchor="mt")

    # Finder supplies the actual application and Applications icons below.
    centered(44, "Study Work", 26, bold=True)
    centered(90, "拖入「应用程序」即可安装", 16, chinese=True)
    centered(119, "Drag Study Work to Applications", 13, MUTED)
    draw.line([(294 * scale, 220 * scale), (364 * scale, 220 * scale)], fill=CORAL, width=3 * scale)
    draw.line([(354 * scale, 210 * scale), (364 * scale, 220 * scale), (354 * scale, 230 * scale)], fill=CORAL, width=3 * scale, joint="curve")
    centered(355, "安装后，从「应用程序」打开 Study Work", 13, chinese=True)
    centered(382, "Then open Study Work from Applications", 12, MUTED)
    return image


ROOT.mkdir(parents=True, exist_ok=True)
ROOT.joinpath("icon.svg").write_text(f'''<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <title>Study Work</title>
  <rect x="100" y="100" width="824" height="824" rx="184" fill="{CORAL}"/>
  <g transform="translate(212 212) scale(25)" fill="none" stroke="{INK}" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round">
    <rect x="3" y="3" width="8" height="8" rx="2"/>
    <path d="M7 11v4a2 2 0 0 0 2 2h4"/>
    <rect x="13" y="13" width="8" height="8" rx="2"/>
  </g>
</svg>
''', encoding="utf8")
app_icon = icon()
app_icon.save(ROOT / "icon.png")
app_icon.save(ROOT / "icon.icns", format="ICNS")
dmg = background()
dmg.save(ROOT / "dmg-background@2x.png")
dmg.resize((660, 440), Image.Resampling.LANCZOS).save(ROOT / "dmg-background.png")
print("Generated Study Work icon and bilingual DMG background.")
