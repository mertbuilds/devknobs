"""
Samples the black glass border round each screen in Apple's pictures of the
Duo, open and shut, and writes border.json beside this script: for each px
out from the screen's edge, at 3 px per css px, the light the renderer gives
the border there, so that after its tone mapping it comes out as Apple's
picture has it. render.js reads it. Offline only: see README.md here.

    uv run --python 3.12 --with pillow --with numpy python border.py
"""
import json
import os

import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
BEZELS = os.path.join(HERE, "..", "..", "assets", "bezels")
# render.js's tone mapping.
EXPOSURE = 1.18
# How far out from the screen's edge the border is sampled, in px of the pictures.
REACH = {"open": 48, "cover": 26}

ACES_IN = np.array([[0.59719, 0.35458, 0.04823], [0.07600, 0.90834, 0.01566], [0.02840, 0.13383, 0.83777]])
ACES_OUT = np.array([[1.60475, -0.53108, -0.07367], [-0.10208, 1.10813, -0.00605], [-0.00327, -0.07276, 1.07602]])


def aces(color):
    """three.js's ACESFilmicToneMapping, in linear sRGB."""
    v = ACES_IN @ (color * EXPOSURE / 0.6)
    v = (v * (v + 0.0245786) - 0.000090537) / (v * (0.983729 * v + 0.4329510) + 0.238081)
    return np.clip(ACES_OUT @ v, 0, 1)


def linear(srgb):
    c = srgb / 255
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


def light(target):
    """The emitted light that tone maps to `target`, in linear sRGB."""
    e = np.maximum(target, 1e-6) * 0.6 / EXPOSURE
    for _ in range(200):
        e = e * np.maximum(target, 1e-7) / np.maximum(aces(e), 1e-7)
    return np.where(target <= 1e-6, 0, e)


def profile(file, opening, spans, reach):
    """The mean colour at each px out from the opening, over the straight runs of its sides."""
    image = np.asarray(Image.open(os.path.join(BEZELS, file)).convert("RGB")).astype(float)
    x, y, w, h = opening
    rows = []
    for d in range(reach):
        samples = []
        for side, (a, b) in spans.items():
            if side == "top":
                samples.append(image[y - 1 - d, a:b])
            elif side == "bottom":
                samples.append(image[y + h + d, a:b])
            elif side == "left":
                samples.append(image[a:b, x - 1 - d])
            else:
                samples.append(image[a:b, x + w + d])
        rows.append(np.concatenate(samples).mean(0))
    return [[round(float(v), 6) for v in light(linear(row))] for row in rows]


border = {
    "open": profile("iphone-duo-inner-open-landscape.webp", (120, 120, 2853, 2007),
                    {"top": (400, 1300), "bottom": (1800, 2700), "left": (400, 1800), "right": (400, 1800)}, REACH["open"]),
    "cover": profile("iphone-duo-outer-closed.webp", (88, 80, 1398, 2034),
                     {"top": (300, 1100), "bottom": (300, 1100), "left": (400, 1800), "right": (400, 1800)}, REACH["cover"]),
}
json.dump(border, open(os.path.join(HERE, "border.json"), "w"), separators=(",", ":"))
print({name: len(rows) for name, rows in border.items()})
