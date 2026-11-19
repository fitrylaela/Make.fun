"""Draw one front page summing up Thursday 19 November 2026.

Twelve illustrated panels carry the day's stories across regions and fields.
Labels are set large so the page still reads when it is shown small, roughly
300 pixels across. Output is deterministic: the same code writes the same bytes.
"""

import math

from PIL import Image, ImageDraw, ImageFont

SIZE = 1024
MARGIN = 14
GAP = 10
MASTHEAD_H = 104
FOOTER_H = 40
COLS = 3
ROWS = 4

INK = (24, 24, 26)
PAPER = (246, 241, 230)
RULE = (150, 140, 122)
RED = (170, 38, 30)
BLUE = (30, 72, 128)
GREEN = (22, 98, 68)
PURPLE = (92, 48, 120)
GOLD = (150, 106, 18)

FONT_DIR = "/usr/share/fonts/truetype/dejavu/"


def font(px, bold=True):
    name = "DejaVuSans-Bold.ttf" if bold else "DejaVuSans.ttf"
    return ImageFont.truetype(FONT_DIR + name, px)


# ---------------------------------------------------------------- icons


def _icon_summit(d, box, color):
    """Three heads over a table."""
    x0, y0, x1, y1 = box
    w, h = x1 - x0, y1 - y0
    cy = y0 + h * 0.44
    r = w * 0.075
    for cx in (x0 + w * 0.22, x0 + w * 0.5, x0 + w * 0.78):
        d.ellipse([cx - r, cy - r * 1.9, cx + r, cy], fill=color)
        d.polygon([(cx - r * 1.75, cy + h * 0.16), (cx + r * 1.75, cy + h * 0.16),
                   (cx + r * 1.2, cy + r * 0.25), (cx - r * 1.2, cy + r * 0.25)], fill=color)
    d.rectangle([x0 + w * 0.05, cy + h * 0.20, x1 - w * 0.05, cy + h * 0.28], fill=color)


def _icon_gavel(d, box, color):
    x0, y0, x1, y1 = box
    w, h = x1 - x0, y1 - y0
    d.polygon([(x0 + w * 0.28, y0 + h * 0.24), (x0 + w * 0.60, y0 + h * 0.08),
               (x0 + w * 0.78, y0 + h * 0.30), (x0 + w * 0.46, y0 + h * 0.46)], fill=color)
    d.polygon([(x0 + w * 0.47, y0 + h * 0.42), (x0 + w * 0.60, y0 + h * 0.53),
               (x0 + w * 0.28, y0 + h * 0.82), (x0 + w * 0.15, y0 + h * 0.71)], fill=color)
    d.rectangle([x0 + w * 0.04, y0 + h * 0.86, x0 + w * 0.62, y0 + h * 0.95], fill=color)


def _icon_chart(d, box, color):
    x0, y0, x1, y1 = box
    w, h = x1 - x0, y1 - y0
    base = y0 + h * 0.88
    bw = w * 0.115
    for bx, bh in zip((0.24, 0.42, 0.60, 0.78), (0.18, 0.34, 0.50, 0.68)):
        d.rectangle([x0 + w * bx - bw / 2, base - h * bh,
                     x0 + w * bx + bw / 2, base], fill=color)
    d.line([(x0 + w * 0.14, base - h * 0.12), (x0 + w * 0.86, base - h * 0.86)],
           fill=color, width=max(5, int(w * 0.036)))
    tx, ty, s = x0 + w * 0.86, base - h * 0.86, w * 0.08
    d.polygon([(tx, ty - s), (tx - s * 0.9, ty + s * 0.45), (tx + s * 0.45, ty + s * 0.6)], fill=color)


def _icon_gamepad(d, box, color):
    x0, y0, x1, y1 = box
    w, h = x1 - x0, y1 - y0
    d.rounded_rectangle([x0 + w * 0.03, y0 + h * 0.28, x1 - w * 0.03, y0 + h * 0.74],
                        radius=int(h * 0.20), fill=color)
    dx, dy = x0 + w * 0.28, y0 + h * 0.51
    arm = h * 0.10
    d.rectangle([dx - arm, dy - arm * 0.34, dx + arm, dy + arm * 0.34], fill=PAPER)
    d.rectangle([dx - arm * 0.34, dy - arm, dx + arm * 0.34, dy + arm], fill=PAPER)
    for bx, by in ((0.65, 0.44), (0.76, 0.58)):
        r = w * 0.030
        d.ellipse([x0 + w * bx - r, y0 + h * by - r, x0 + w * bx + r, y0 + h * by + r], fill=PAPER)


def _icon_bridge(d, box, color):
    x0, y0, x1, y1 = box
    w, h = x1 - x0, y1 - y0
    deck = y0 + h * 0.60
    thick = max(6, int(h * 0.075))
    d.rectangle([x0 + w * 0.02, deck, x0 + w * 0.38, deck + thick], fill=color)
    d.rectangle([x0 + w * 0.64, deck + thick * 1.9, x1 - w * 0.02, deck + thick * 2.9], fill=color)
    for tx in (0.12, 0.29):
        d.rectangle([x0 + w * tx, y0 + h * 0.24, x0 + w * tx + w * 0.05, deck], fill=color)
    d.line([(x0 + w * 0.06, y0 + h * 0.32), (x0 + w * 0.38, y0 + h * 0.32)],
           fill=color, width=max(4, int(h * 0.035)))
    d.polygon([(x0 + w * 0.48, y0 + h * 0.10), (x0 + w * 0.56, y0 + h * 0.34),
               (x0 + w * 0.68, y0 + h * 0.16), (x0 + w * 0.64, y0 + h * 0.46),
               (x0 + w * 0.41, y0 + h * 0.40)], fill=RED)


def _icon_parliament(d, box, color):
    x0, y0, x1, y1 = box
    w, h = x1 - x0, y1 - y0
    d.polygon([(x0 + w * 0.5, y0 + h * 0.06), (x1 - w * 0.07, y0 + h * 0.28),
               (x0 + w * 0.07, y0 + h * 0.28)], fill=color)
    d.rectangle([x0 + w * 0.07, y0 + h * 0.30, x1 - w * 0.07, y0 + h * 0.39], fill=color)
    for i in range(4):
        cx = x0 + w * (0.18 + i * 0.213)
        d.rectangle([cx - w * 0.036, y0 + h * 0.41, cx + w * 0.036, y0 + h * 0.80], fill=color)
    d.rectangle([x0 + w * 0.03, y0 + h * 0.82, x1 - w * 0.03, y0 + h * 0.93], fill=color)


def _icon_ballot(d, box, color):
    x0, y0, x1, y1 = box
    w, h = x1 - x0, y1 - y0
    d.polygon([(x0 + w * 0.30, y0 + h * 0.04), (x0 + w * 0.74, y0 + h * 0.04),
               (x0 + w * 0.74, y0 + h * 0.52), (x0 + w * 0.30, y0 + h * 0.52)], fill=color)
    for ly in (0.20, 0.36):
        d.line([(x0 + w * 0.40, y0 + h * ly), (x0 + w * 0.64, y0 + h * ly)],
               fill=PAPER, width=max(5, int(h * 0.05)))
    d.rectangle([x0 + w * 0.07, y0 + h * 0.56, x1 - w * 0.07, y0 + h * 0.93], fill=color)
    d.rectangle([x0 + w * 0.30, y0 + h * 0.56, x0 + w * 0.70, y0 + h * 0.63], fill=PAPER)


def _icon_flags(d, box, color):
    x0, y0, x1, y1 = box
    w, h = x1 - x0, y1 - y0
    for px_, ph in ((0.18, 0.24), (0.50, 0.08), (0.82, 0.24)):
        px = x0 + w * px_
        d.line([(px, y0 + h * ph), (px, y0 + h * 0.92)], fill=color, width=max(5, int(w * 0.022)))
        d.polygon([(px, y0 + h * ph), (px + w * 0.20, y0 + h * (ph + 0.11)),
                   (px, y0 + h * (ph + 0.22))], fill=color)


def _icon_missile(d, box, color):
    """A missile falling on a tower: the Houthi strike on Riyadh."""
    x0, y0, x1, y1 = box
    w, h = x1 - x0, y1 - y0
    d.polygon([(x0 + w * 0.42, y0 + h * 0.34), (x0 + w * 0.62, y0 + h * 0.28),
               (x0 + w * 0.68, y0 + h * 0.92), (x0 + w * 0.40, y0 + h * 0.92)], fill=color)
    for wy in (0.46, 0.62, 0.78):
        d.line([(x0 + w * 0.45, y0 + h * wy), (x0 + w * 0.64, y0 + h * (wy - 0.02))],
               fill=PAPER, width=max(4, int(h * 0.030)))
    d.line([(x0 + w * 0.04, y0 + h * 0.04), (x0 + w * 0.30, y0 + h * 0.26)],
           fill=color, width=max(4, int(w * 0.022)))
    mx, my = x0 + w * 0.34, y0 + h * 0.30
    s = w * 0.10
    d.polygon([(mx + s, my + s * 0.6), (mx - s * 0.5, my - s * 0.9),
               (mx - s * 0.9, my + s * 0.2)], fill=RED)
    bx, by, r = x0 + w * 0.56, y0 + h * 0.40, w * 0.13
    for ang in range(0, 360, 45):
        a = math.radians(ang)
        d.line([(bx + r * 0.45 * math.cos(a), by + r * 0.45 * math.sin(a)),
                (bx + r * math.cos(a), by + r * math.sin(a))],
               fill=RED, width=max(4, int(w * 0.020)))


def _icon_whale(d, box, color):
    """A stranded whale on a beach: New Zealand's Ninety Mile Beach."""
    x0, y0, x1, y1 = box
    w, h = x1 - x0, y1 - y0
    d.rectangle([x0 + w * 0.02, y0 + h * 0.72, x1 - w * 0.02, y0 + h * 0.80], fill=color)
    d.line([(x0 + w * 0.02, y0 + h * 0.82), (x1 - w * 0.02, y0 + h * 0.86)],
           fill=color, width=max(3, int(h * 0.020)))
    d.ellipse([x0 + w * 0.16, y0 + h * 0.30, x0 + w * 0.66, y0 + h * 0.74], fill=color)
    d.polygon([(x0 + w * 0.64, y0 + h * 0.46), (x0 + w * 0.84, y0 + h * 0.30),
               (x0 + w * 0.82, y0 + h * 0.60), (x0 + w * 0.64, y0 + h * 0.58)], fill=color)
    d.ellipse([x0 + w * 0.22, y0 + h * 0.46, x0 + w * 0.27, y0 + h * 0.51], fill=PAPER)


def _icon_earth(d, box, color):
    x0, y0, x1, y1 = box
    w, h = x1 - x0, y1 - y0
    r = min(w, h) * 0.30
    cx, cy = x0 + w * 0.40, y0 + h * 0.50
    lw = max(5, int(r * 0.16))
    d.ellipse([cx - r, cy - r, cx + r, cy + r], outline=color, width=lw)
    d.ellipse([cx - r * 0.58, cy - r, cx + r * 0.58, cy + r], outline=color,
              width=max(3, int(r * 0.09)))
    d.line([(cx - r, cy), (cx + r, cy)], fill=color, width=max(3, int(r * 0.09)))
    tx = x0 + w * 0.84
    d.rounded_rectangle([tx - w * 0.030, y0 + h * 0.08, tx + w * 0.030, y0 + h * 0.60],
                        radius=int(w * 0.030), fill=color)
    d.ellipse([tx - w * 0.072, y0 + h * 0.54, tx + w * 0.072, y0 + h * 0.86], fill=RED)


def _icon_fire(d, box, color):
    """A burning building — the attacks on party offices and homes."""
    x0, y0, x1, y1 = box
    w, h = x1 - x0, y1 - y0
    d.rectangle([x0 + w * 0.16, y0 + h * 0.46, x0 + w * 0.62, y0 + h * 0.92], fill=color)
    for wx in (0.24, 0.42):
        d.rectangle([x0 + w * wx, y0 + h * 0.56, x0 + w * (wx + 0.11), y0 + h * 0.68], fill=PAPER)
    d.polygon([(x0 + w * 0.16, y0 + h * 0.46), (x0 + w * 0.39, y0 + h * 0.30),
               (x0 + w * 0.62, y0 + h * 0.46)], fill=color)
    d.polygon([(x0 + w * 0.80, y0 + h * 0.10), (x0 + w * 0.92, y0 + h * 0.34),
               (x0 + w * 0.84, y0 + h * 0.46), (x0 + w * 0.96, y0 + h * 0.62),
               (x0 + w * 0.74, y0 + h * 0.56), (x0 + w * 0.66, y0 + h * 0.36),
               (x0 + w * 0.74, y0 + h * 0.26)], fill=RED)


def _icon_train(d, box, color):
    x0, y0, x1, y1 = box
    w, h = x1 - x0, y1 - y0
    d.rounded_rectangle([x0 + w * 0.14, y0 + h * 0.10, x0 + w * 0.86, y0 + h * 0.66],
                        radius=int(w * 0.10), fill=color)
    d.rectangle([x0 + w * 0.24, y0 + h * 0.22, x0 + w * 0.76, y0 + h * 0.44], fill=PAPER)
    d.rectangle([x0 + w * 0.30, y0 + h * 0.72, x0 + w * 0.70, y0 + h * 0.80], fill=color)
    for wx in (0.30, 0.62):
        d.ellipse([x0 + w * wx, y0 + h * 0.80, x0 + w * (wx + 0.14), y0 + h * 0.94], fill=color)


def _icon_trophy(d, box, color):
    """A cup for the playoffs, with a ball."""
    x0, y0, x1, y1 = box
    w, h = x1 - x0, y1 - y0
    d.polygon([(x0 + w * 0.26, y0 + h * 0.12), (x0 + w * 0.74, y0 + h * 0.12),
               (x0 + w * 0.62, y0 + h * 0.54), (x0 + w * 0.38, y0 + h * 0.54)], fill=color)
    d.arc([x0 + w * 0.06, y0 + h * 0.12, x0 + w * 0.34, y0 + h * 0.40],
          90, 270, fill=color, width=max(5, int(w * 0.035)))
    d.arc([x0 + w * 0.66, y0 + h * 0.12, x0 + w * 0.94, y0 + h * 0.40],
          270, 90, fill=color, width=max(5, int(w * 0.035)))
    d.rectangle([x0 + w * 0.46, y0 + h * 0.54, x0 + w * 0.54, y0 + h * 0.78], fill=color)
    d.rectangle([x0 + w * 0.32, y0 + h * 0.78, x0 + w * 0.68, y0 + h * 0.90], fill=color)


PANELS = [
    ("DIPLOMACY \u00b7 ASIA", "XI, PUTIN,\nTRUMP MEET", _icon_summit, RED),
    ("LAW \u00b7 ASIA", "ICJ FINDS\nGENOCIDE", _icon_gavel, INK),
    ("BUSINESS \u00b7 US", "ANTHROPIC'S\nRECORD IPO", _icon_chart, GREEN),
    ("CULTURE \u00b7 WORLD", "GTA VI\nARRIVES", _icon_gamepad, PURPLE),
    ("WAR \u00b7 EUROPE", "KERCH BRIDGE\nSTRUCK AGAIN", _icon_bridge, RED),
    ("POLITICS \u00b7 ASIA", "MONGOLIA'S\nPRESIDENT OUT", _icon_parliament, INK),
    ("POLITICS \u00b7 EUROPE", "SERBIA'S NEW\nACTING HEAD", _icon_ballot, BLUE),
    ("DIPLOMACY \u00b7 EUROPE", "37 NATIONS\nFOR UKRAINE", _icon_flags, BLUE),
    ("CONFLICT \u00b7 M. EAST", "HOUTHI MISSILE\nHITS RIYADH", _icon_missile, RED),
    ("CONFLICT \u00b7 ASIA", "BANGLADESH\nOFFICES BURN", _icon_fire, RED),
    ("NATURE \u00b7 OCEANIA", "WHALES DIE ON\nNZ BEACH", _icon_whale, BLUE),
    ("SPORT \u00b7 AMERICAS", "MLS CUP\nPLAYOFFS OPEN", _icon_trophy, GREEN),
]




# ---------------------------------------------------------------- text


def _split_wide(draw, word, fnt, max_w):
    """Break a single over-long word at its hyphens, else by character."""
    parts, cur = [], ""
    for chunk in word.replace("-", "-\x00").split("\x00"):
        trial = cur + chunk
        if cur and draw.textlength(trial, font=fnt) > max_w:
            parts.append(cur)
            cur = chunk
        else:
            cur = trial
    if cur:
        parts.append(cur)
    return parts


def wrap(draw, text, fnt, max_w):
    words, lines, cur = text.split(), [], ""
    for word in words:
        if draw.textlength(word, font=fnt) > max_w:
            if cur:
                lines.append(cur)
                cur = ""
            chunks = _split_wide(draw, word, fnt, max_w)
            lines.extend(chunks[:-1])
            cur = chunks[-1]
            continue
        trial = f"{cur} {word}".strip()
        if draw.textlength(trial, font=fnt) <= max_w or not cur:
            cur = trial
        else:
            lines.append(cur)
            cur = word
    if cur:
        lines.append(cur)
    return lines


def fit(draw, text, max_w, max_h, start=34, floor=20, line_ratio=1.14):
    """Largest font size at which `text` fits the box, honouring manual breaks."""
    for px in range(start, floor - 1, -2):
        fnt = font(px)
        lines = []
        for part in text.split("\n"):
            lines.extend(wrap(draw, part, fnt, max_w))
        widest = max((draw.textlength(l, font=fnt) for l in lines), default=0)
        if len(lines) * px * line_ratio <= max_h and widest <= max_w:
            return px, lines
    fnt = font(floor)
    lines = []
    for part in text.split("\n"):
        lines.extend(wrap(draw, part, fnt, max_w))
    return floor, lines


def draw_masthead(draw):
    draw.text((MARGIN + 3, 10), "THE WORLD ON ONE PAGE", font=font(24), fill=RED)
    draw.text((MARGIN + 1, 36), "THURSDAY 19 NOVEMBER 2026", font=font(47), fill=INK)
    draw.line([(MARGIN, MASTHEAD_H - 12), (SIZE - MARGIN, MASTHEAD_H - 12)], fill=INK, width=3)


def draw_panel(draw, box, panel):
    tag, label, icon, accent = panel
    x0, y0, x1, y1 = box
    draw.rectangle(box, fill=PAPER, outline=RULE, width=2)
    draw.rectangle([x0, y0, x1, y0 + 5], fill=accent)

    pad = 11
    inner_w = (x1 - x0) - pad * 2
    draw.text((x0 + pad, y0 + 12), tag, font=font(16), fill=accent)

    label_h_max = 86
    px, lines = fit(draw, label, inner_w, label_h_max, start=36, floor=21)
    fnt = font(px)
    line_h = int(px * 1.14)
    label_h = len(lines) * line_h

    icon_top = y0 + 34
    icon_bottom = y1 - pad - label_h - 8
    if icon_bottom > icon_top + 24:
        icon(draw, (x0 + pad, icon_top, x1 - pad, icon_bottom), accent)

    ty = y1 - pad - label_h + 2
    for line in lines:
        draw.text((x0 + pad, ty), line, font=fnt, fill=INK)
        ty += line_h


def draw_footer(draw):
    top = SIZE - FOOTER_H
    draw.line([(MARGIN, top), (SIZE - MARGIN, top)], fill=RULE, width=2)
    draw.text((MARGIN + 1, top + 11),
              "ONE DAY, ONE PAGE  \u00b7  THURSDAY 19 NOVEMBER 2026",
              font=font(19), fill=INK)


def main():
    img = Image.new("RGB", (SIZE, SIZE), PAPER)
    draw = ImageDraw.Draw(img)

    draw_masthead(draw)

    top = MASTHEAD_H + 2
    bottom = SIZE - FOOTER_H - 10
    panel_w = (SIZE - 2 * MARGIN - (COLS - 1) * GAP) / COLS
    panel_h = (bottom - top - (ROWS - 1) * GAP) / ROWS

    for i, panel in enumerate(PANELS):
        col, row = i % COLS, i // COLS
        x0 = MARGIN + col * (panel_w + GAP)
        y0 = top + row * (panel_h + GAP)
        draw_panel(draw, (x0, y0, x0 + panel_w, y0 + panel_h), panel)

    draw_footer(draw)
    img.save("entry.png", optimize=True)


if __name__ == "__main__":
    main()
