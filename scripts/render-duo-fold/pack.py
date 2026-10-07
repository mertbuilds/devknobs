"""
Packs the master PNGs renderAll saved into the frames devknobs ships: each
frame of the turning half, every `step` degrees, cropped to what it draws and
saved as WebP, and manifest.json with each frame's crop box and the corners of
its two turned screens, in master px, and the open inner screen's rect.

    uv run --python 3.12 --with pillow python pack.py <master folder> <out folder> [step] [quality]
"""
import io
import json
import os
import sys

from PIL import Image

master, out = sys.argv[1], sys.argv[2]
step = int(sys.argv[3]) if len(sys.argv) > 3 else 6
quality = int(sys.argv[4]) if len(sys.argv) > 4 else 80
meta = json.load(open(os.path.join(master, "corners.json")))
os.makedirs(out, exist_ok=True)


def crop(name):
    image = Image.open(os.path.join(master, name)).convert("RGBA")
    box = image.getchannel("A").point(lambda alpha: 255 if alpha > 2 else 0).getbbox()
    return image.crop(box), list(box)


angles = list(range(0, 181, step))
if angles[-1] != 180:
    angles.append(180)
frames = []
total = 0
for deg in angles:
    image, box = crop(f"moving-{deg:03d}.png")
    data = io.BytesIO()
    image.save(data, "WEBP", quality=quality, method=6, alpha_quality=90)
    file = f"fold-{deg:03d}.webp"
    open(os.path.join(out, file), "wb").write(data.getvalue())
    total += data.tell()
    seen = meta["angles"][str(deg)]
    frames.append({"deg": deg, "file": file, "box": box, "inner": seen["innerMoving"], "cover": seen["cover"]})
opened = meta["angles"]["0"]
(left, top), (right, bottom) = opened["innerMoving"][0], opened["innerFixed"][2]
manifest = {"open": [left, top, round(right - left, 2), round(bottom - top, 2)], "frames": frames}
json.dump(manifest, open(os.path.join(out, "manifest.json"), "w"), separators=(",", ":"))
print(f"{len(frames)} frames, {total / 1024:.0f} KiB")
