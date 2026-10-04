#!/bin/sh
# Makes assets/bezels from the bezel PNGs, which are not in the repo, each
# named after its file in src/engine/bezels.ts:
#
# - Apple's product bezels, from https://developer.apple.com/design/resources/,
#   and the iPhone SE's from Apple's App Store marketing artwork (iPhone-SE.zip),
#   its screen layer cut out of the hardware layer.
# - Google's Pixel frames, from the Android Studio emulator skins in AOSP
#   (platform/tools/adt/idea, artwork/resources/device-art-resources), each
#   back.webp with its mask.webp laid over it at the display's x and y from
#   the skin's layout file, flattened to one PNG.
#
# Runs sharp-cli through bunx, so nothing is installed globally or added to the
# package.
#
#   scripts/bezels.sh path/to/png [path/to/more/png ...]
#
# Lossy color at quality 90 with lossless alpha, at the PNG's own size, which
# is the image's own density, 3 image px per css px for Apple's iPhones and
# 2.62 to 3.52 for the others: the screen opening and the body's edge stay
# exact, and the body stays sharp at a zoom.
set -eu
: "${1:?usage: scripts/bezels.sh path/to/png [path/to/more/png ...]}"
out="$(dirname "$0")/../assets/bezels"
mkdir -p "$out"
for src in "$@"; do
  for png in "$src"/*.png; do
    bunx sharp-cli@5.3.0 -i "$png" -o "$out" -f webp \
      --quality 90 --alphaQuality 100 --effort 6 --smartSubsample >/dev/null
  done
done
