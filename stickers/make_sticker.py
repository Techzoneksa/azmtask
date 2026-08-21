# -*- coding: utf-8 -*-
"""WhatsApp animated sticker: hourglass + 'time is running out' in Arabic.
Square 512x512 looping GIF with transparency and white sticker outline."""
import math
from PIL import Image, ImageDraw, ImageFont

SIZE = 512
N_FRAMES = 24
TEXT = "الوقت ينفذ"

# Pillow has libraqm: pass raw text with direction="rtl" and it shapes Arabic correctly
shaped = TEXT

font_path = "Cairo.ttf"

def load_font(size, weight=800):
    f = ImageFont.truetype(font_path, size)
    try:
        f.set_variation_by_axes([0, weight])  # slnt, wght
    except Exception:
        pass
    return f

# ---------- drawing helpers ----------

def draw_hourglass(d, cx, cy, w, h, progress, frame_color, sand_color, glass_color):
    """progress: 0..1 sand fallen fraction."""
    half = h / 2.0
    neck = 7  # half width of neck opening
    top_y, bot_y = cy - half, cy + half
    lw = int(w * 0.62)  # inner glass half-width at widest

    # glass body (two trapezoid-ish triangles) - light translucent fill
    top_glass = [(cx - lw, top_y), (cx + lw, top_y), (cx + neck, cy - 4), (cx - neck, cy - 4)]
    bot_glass = [(cx - neck, cy + 4), (cx + neck, cy + 4), (cx + lw, bot_y), (cx - lw, bot_y)]
    d.polygon(top_glass, fill=glass_color)
    d.polygon(bot_glass, fill=glass_color)

    # --- sand in top bulb: an inverted triangle shrinking with progress ---
    remain = max(0.0, 1.0 - progress)
    if remain > 0.01:
        sh = (half - 8) * math.sqrt(remain)          # sand height in top bulb
        surf_y = cy - 4 - sh                          # sand surface line
        # width of bulb at surf_y (linear from neck at cy-4 to lw at top_y)
        t = (cy - 4 - surf_y) / (half - 4)
        sw = neck + (lw - neck) * t
        d.polygon([(cx - sw + 4, surf_y), (cx + sw - 4, surf_y), (cx + neck - 2, cy - 5), (cx - neck + 2, cy - 5)], fill=sand_color)

    # --- falling stream ---
    if 0.02 < progress < 0.99:
        d.rectangle([cx - 3, cy - 5, cx + 3, bot_y - 10], fill=sand_color)

    # --- sand pile in bottom bulb: triangle growing ---
    if progress > 0.02:
        ph = (half - 10) * math.sqrt(progress)        # pile height
        base_y = bot_y - 6
        peak_y = base_y - ph
        t = (base_y - bot_y + half) / (half)          # ~1 at bottom
        bw = lw - 8
        d.polygon([(cx - bw, base_y), (cx + bw, base_y), (cx, peak_y)], fill=sand_color)

    # glass outline
    d.line(top_glass + [top_glass[0]], fill=frame_color, width=6, joint="curve")
    d.line(bot_glass + [bot_glass[0]], fill=frame_color, width=6, joint="curve")

    # wooden bars top & bottom
    bar_h = 16
    bw2 = lw + 18
    for by in (top_y - bar_h, bot_y):
        d.rounded_rectangle([cx - bw2, by, cx + bw2, by + bar_h], radius=8, fill=frame_color)


def make_frame(i):
    im = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)

    t = i / N_FRAMES                       # 0..1 loop position
    progress = t                           # sand progress over one loop
    urgency = t                            # more urgent near loop end

    # --- badge: rounded square background ---
    pad = 26
    # subtle pulse of the badge near the end
    pulse = 1.0 + 0.012 * math.sin(2 * math.pi * t * 4) * urgency
    off = (1 - pulse) * (SIZE - 2 * pad) / 2

    # gradient-ish dark background: two layered rounded rects
    bg1 = (30, 27, 75, 255)    # deep indigo
    bg2 = (49, 46, 129, 255)
    d.rounded_rectangle([pad + off, pad + off, SIZE - pad - off, SIZE - pad - off],
                        radius=90, fill=bg1, outline=(255, 255, 255, 255), width=14)
    d.rounded_rectangle([pad + 26, pad + 26, SIZE - pad - 26, SIZE - pad - 100],
                        radius=70, fill=bg2)

    # --- ticking clock marks around top area (decorative sparks) ---
    # small shake of hourglass when time nearly out
    shake = 0
    if urgency > 0.7:
        shake = int(3 * math.sin(2 * math.pi * i * 1.7))

    # --- hourglass ---
    cx, cy = SIZE // 2 + shake, 218
    sand = (245, 158, 11, 255)     # amber
    frame_c = (217, 119, 6, 255)   # darker amber frame
    glass = (255, 255, 255, 46)
    draw_hourglass(d, cx, cy, 120, 230, progress, frame_c, sand, glass)

    # --- text: pulsing red/white ---
    base_size = 78
    scale = 1.0 + 0.06 * max(0.0, math.sin(2 * math.pi * t * 2))
    fsize = int(base_size * scale)
    font = load_font(fsize, 900)

    # color shifts white -> red as urgency rises
    r = 255
    g = int(255 - 195 * urgency)
    b = int(255 - 215 * urgency)
    tx_color = (r, g, b, 255)

    bbox = d.textbbox((0, 0), shaped, font=font, direction="rtl")
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    tx = (SIZE - tw) / 2 - bbox[0]
    ty = 402 - th / 2 - bbox[1]

    # text shadow/outline for sticker look
    d.text((tx + 3, ty + 4), shaped, font=font, fill=(0, 0, 0, 170),
           stroke_width=6, stroke_fill=(0, 0, 0, 170), direction="rtl")
    d.text((tx, ty), shaped, font=font, fill=tx_color,
           stroke_width=4, stroke_fill=(255, 255, 255, 255), direction="rtl")
    return im


def to_gif_frame(im):
    alpha = im.getchannel("A")
    im_p = im.convert("RGB").quantize(colors=255, method=Image.MEDIANCUT)
    mask = alpha.point(lambda a: 255 if a <= 128 else 0)
    im_p.paste(255, mask)
    im_p.info["transparency"] = 255
    return im_p


frames_rgba = [make_frame(i) for i in range(N_FRAMES)]
frames = [to_gif_frame(f) for f in frames_rgba]

out = "alwaqt-yanfad.gif"
frames[0].save(out, save_all=True, append_images=frames[1:], duration=110,
               loop=0, disposal=2, transparency=255, optimize=False)

# Also export animated WebP (WhatsApp's native animated-sticker format)
outw = out.replace(".gif", ".webp")
frames_rgba[0].save(outw, save_all=True, append_images=frames_rgba[1:],
                    duration=110, loop=0, quality=80, method=6)

import os
print("GIF :", os.path.getsize(out) / 1024, "KB")
print("WEBP:", os.path.getsize(outw) / 1024, "KB")
