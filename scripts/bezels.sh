#!/bin/sh
# Makes assets/bezels from Apple's product bezel PNGs, which are not in the
# repo: download them from https://developer.apple.com/design/resources/ and
# name each after its file in src/engine/bezels.ts. Runs sharp-cli through
# bunx, so nothing is installed globally or added to the package.
#
#   scripts/bezels.sh path/to/png
#
# Lossy color at quality 90 with lossless alpha, at the PNG's own size of 3
# image px per css px: the screen opening and the body's edge stay exact, and
# the body stays sharp at a zoom.
set -eu
src="${1:?usage: scripts/bezels.sh path/to/png}"
out="$(dirname "$0")/../assets/bezels"
mkdir -p "$out"
for png in "$src"/*.png; do
  bunx sharp-cli@5.3.0 -i "$png" -o "$out" -f webp \
    --quality 90 --alphaQuality 100 --effort 6 --smartSubsample >/dev/null
done
