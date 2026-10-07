"""
Samples the metal of the Duo in Apple's pictures, open and shut, by the way
each px of it faces the camera, and writes matcap.json beside this script: on
a grid of the ways the metal can face, its x and y seen from the camera, the
light the renderer gives it there, so that after its tone mapping it comes out
as Apple's pictures have it. It reads the renders render.js makes with
`normals` in the master folder, each laid on the picture as devknobs lays
the render, its screen on the picture's. render.js reads matcap.json.
Offline only: see README.md here.

    uv run --python 3.12 --with pillow --with numpy python matcap.py <master folder>
"""
import json
import os
import sys

import numpy as np
from PIL import Image

from border import BEZELS, HERE, light, linear

master = sys.argv[1]
# Cells across, from facing left to facing right, and from facing down to facing up.
SIZE = 64
corners = json.load(open(os.path.join(master, "normals-corners.json")))["angles"]


def bounds(quad):
    xs, ys = [x for x, _ in quad], [y for _, y in quad]
    return min(xs), min(ys), max(xs) - min(xs), max(ys) - min(ys)


def laid(deg, src, dst, size):
    """The halves at `deg`, the turning one over the one that stays, with the render's rect `src` on the picture's `dst`."""
    name = f"{deg:03d}.png"
    both = Image.alpha_composite(*(Image.open(os.path.join(master, f"normals-{half}-{name}")).convert("RGBA")
                                   for half in ("fixed", "moving")))
    sx, sy = dst[2] / src[2], dst[3] / src[3]
    affine = (1 / sx, 0, src[0] - dst[0] / sx, 0, 1 / sy, src[1] - dst[1] / sy)
    return np.asarray(both.transform(size, Image.AFFINE, affine, Image.NEAREST)).astype(float)


def inside(mask):
    """Where a px and the eight round it are all in `mask`, so no edge's blend is sampled."""
    kept = mask.copy()
    for dy in (-1, 0, 1):
        for dx in (-1, 0, 1):
            kept &= np.roll(np.roll(mask, dy, 0), dx, 1)
    return kept


total = np.zeros((SIZE, SIZE, 3))
count = np.zeros((SIZE, SIZE))
open_ = corners["0"]
(left, top), (right, bottom) = open_["innerMoving"][0], open_["innerFixed"][2]
for deg, file, src, dst in ((0, "iphone-duo-inner-open-landscape.webp", (left, top, right - left, bottom - top), (120, 120, 2853, 2007)),
                            (180, "iphone-duo-outer-closed.webp", bounds(corners["180"]["cover"]), (88, 80, 1398, 2034))):
    picture = Image.open(os.path.join(BEZELS, file)).convert("RGBA")
    seen = np.asarray(picture).astype(float)
    normals = laid(deg, src, dst, picture.size)
    # Metal is drawn as its normal, half a unit long round the middle grey, all else black.
    length = np.linalg.norm(normals[..., :3] - 127.5, axis=-1)
    metal = inside((normals[..., 3] == 255) & (np.abs(length - 127.5) < 16) & (seen[..., 3] == 255))
    facing = normals[metal][:, :3] / 127.5 - 1
    facing /= np.linalg.norm(facing, axis=-1, keepdims=True)
    cells = np.clip(((facing[:, :2] + 1) / 2 * SIZE).astype(int), 0, SIZE - 1)
    colours = linear(seen[metal][:, :3])
    np.add.at(total, (cells[:, 1], cells[:, 0]), colours)
    np.add.at(count, (cells[:, 1], cells[:, 0]), 1)
    print(f"{deg} degrees: {int(metal.sum())} px of metal")

# Ways seen too seldom take what is round them, out from those seen.
sampled = count >= 8
mean = np.where(sampled[..., None], total / np.maximum(count, 1)[..., None], 0)
while not sampled.all():
    grown = sampled.copy()
    filled = mean.copy()
    for row, col in zip(*np.nonzero(~sampled)):
        near = [(r, c) for r, c in ((row - 1, col), (row + 1, col), (row, col - 1), (row, col + 1))
                if 0 <= r < SIZE and 0 <= c < SIZE and sampled[r, c]]
        if near:
            filled[row, col] = np.mean([mean[r, c] for r, c in near], 0)
            grown[row, col] = True
    mean, sampled = filled, grown
cells = [[round(float(v), 6) for v in light(rgb)] for rgb in mean.reshape(-1, 3)]
json.dump({"size": SIZE, "light": cells}, open(os.path.join(HERE, "matcap.json"), "w"), separators=(",", ":"))
print(f"{int((count >= 8).sum())} of {SIZE * SIZE} cells sampled")
