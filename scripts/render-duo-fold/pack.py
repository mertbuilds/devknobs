"""
Packs the master PNGs renderAll saved into the frames devknobs ships: each
frame of the turning half, every `step` degrees, cropped to what it draws,
scaled from the master's 3 px per css px to `scale`, and saved as WebP, and
manifest.json beside this script with each frame's crop box and the corners
of its two turned screens, in master px, its pieces, in frame px, and the open
inner screen's rect.

The case is a thin outline round see-through screens, so the clear middle of
a frame is cut out: what is left is up to four pieces round it, cut shorter
and packed into the frame's file, each where it lies in the frame and where it
is in the file.

    uv run --python 3.12 --with pillow python pack.py <master folder> <out folder> [step] [quality] [scale]
"""
import io
import json
import math
import os
import sys
from fractions import Fraction

from PIL import Image

master, out = sys.argv[1], sys.argv[2]
step = int(sys.argv[3]) if len(sys.argv) > 3 else 6
quality = int(sys.argv[4]) if len(sys.argv) > 4 else 80
# Frame px per master px: a box on whole multiples of its denominator scales to whole px.
ratio = Fraction(sys.argv[5] if len(sys.argv) > 5 else "1.5") / 3
meta = json.load(open(os.path.join(master, "corners.json")))
os.makedirs(out, exist_ok=True)
# The cells the clear middle is found in, the px of the frame kept round each piece in the file, and the
# tallest a piece is, in frame px.
CELL = 4
MARGIN = 4
SEGMENT = 128


def shown(image):
    return image.getchannel("A").point(lambda alpha: 255 if alpha > 2 else 0)


def crop(name):
    """The master's frame cut to what it draws, its box widened onto whole frame px, and scaled."""
    image = Image.open(os.path.join(master, name)).convert("RGBA")
    q = ratio.denominator
    left, top, right, bottom = shown(image).getbbox()
    left, top = left // q * q, top // q * q
    right, bottom = min(-(-right // q) * q, image.width), min(-(-bottom // q) * q, image.height)
    box = [left, top, right, bottom]
    size = ((right - left) * ratio.numerator // q, (bottom - top) * ratio.numerator // q)
    return image.crop(box).resize(size, Image.LANCZOS), box


def hole(image):
    """The biggest clear rect in the frame, on whole cells, as left, top, right, bottom in frame px."""
    cells = shown(image).reduce(CELL)
    width, height = cells.size
    clear = [value == 0 for value in cells.get_flattened_data()]
    heights = [0] * width
    best = (0, 0, 0, 0, 0)
    for row in range(height):
        heights = [heights[col] + 1 if clear[row * width + col] else 0 for col in range(width)]
        stack = []
        for col in range(width + 1):
            tall = heights[col] if col < width else 0
            start = col
            while stack and stack[-1][1] >= tall:
                begin, high = stack.pop()
                if high * (col - begin) > best[0]:
                    best = (high * (col - begin), begin, row - high + 1, col, row + 1)
                start = begin
            stack.append((start, tall))
    _, left, top, right, bottom = best
    # A part cell at the right or bottom edge is cut short.
    return left * CELL, top * CELL, min(right * CELL, image.width), min(bottom * CELL, image.height)


def pieces(image):
    """Up to four rects round the clear middle, each cut to what it draws, or the whole frame where the middle is small."""
    width, height = image.size
    left, top, right, bottom = hole(image)
    if (right - left) * (bottom - top) < width * height / 4:
        return [(0, 0, width, height)]
    around = [(0, 0, width, top), (0, bottom, width, height), (0, top, left, bottom), (right, top, width, bottom)]
    cut = []
    for x0, y0, x1, y1 in around:
        if x1 <= x0 or y1 <= y0:
            continue
        drawn = shown(image.crop((x0, y0, x1, y1))).getbbox()
        if drawn:
            cut.append((x0 + drawn[0], y0 + drawn[1], x0 + drawn[2], y0 + drawn[3]))
    return cut


def pack(image, rects):
    """
    The pieces in one image, and where each lies in the frame and is in it.
    A tall piece is cut into short ones, and they all go in rows, tallest
    first, as wide as the widest piece or the square they would fill.
    """
    cut = []
    for left, top, right, bottom in rects:
        cut += [(left, y, right, min(y + SEGMENT, bottom)) for y in range(top, bottom, SEGMENT)]
    cut.sort(key=lambda rect: rect[1] - rect[3])
    sizes = [(right - left + 2 * MARGIN, bottom - top + 2 * MARGIN) for left, top, right, bottom in cut]
    width = max(max(w for w, _ in sizes), math.ceil(math.sqrt(sum(w * h for w, h in sizes))))
    places = []
    x = y = row = 0
    for w, h in sizes:
        if x + w > width:
            x, y, row = 0, y + row, 0
        places.append((x + MARGIN, y + MARGIN))
        x, row = x + w, max(row, h)
    sheet = Image.new("RGBA", (width, y + row))
    for (left, top, right, bottom), (x, y) in zip(cut, places):
        # The px round each piece go with it, so the WebP's blocks at its edge do not take in another piece.
        sheet.paste(image.crop((left - MARGIN, top - MARGIN, right + MARGIN, bottom + MARGIN)), (x - MARGIN, y - MARGIN))
    return sheet, [[left, top, right - left, bottom - top, x, y] for (left, top, right, bottom), (x, y) in zip(cut, places)]


angles = list(range(0, 181, step))
if angles[-1] != 180:
    angles.append(180)
frames = []
total = 0
decoded = 0
for deg in angles:
    image, box = crop(f"moving-{deg:03d}.png")
    sheet, cut = pack(image, pieces(image))
    data = io.BytesIO()
    sheet.save(data, "WEBP", quality=quality, method=6, alpha_quality=90)
    file = f"fold-{deg:03d}.webp"
    open(os.path.join(out, file), "wb").write(data.getvalue())
    total += data.tell()
    decoded += sheet.width * sheet.height * 4
    seen = meta["angles"][str(deg)]
    frames.append({"deg": deg, "file": file, "box": box, "pieces": cut, "inner": seen["innerMoving"], "cover": seen["cover"]})
opened = meta["angles"]["0"]
(left, top), (right, bottom) = opened["innerMoving"][0], opened["innerFixed"][2]
manifest = {
    "open": [left, top, round(right - left, 2), round(bottom - top, 2)],
    "scale": float(ratio),
    "frames": frames,
}
here = os.path.dirname(os.path.abspath(__file__))
json.dump(manifest, open(os.path.join(here, "manifest.json"), "w"), separators=(",", ":"))
print(f"{len(frames)} frames, {total / 1024:.0f} KiB, {decoded / 1e6:.1f} MB decoded")
