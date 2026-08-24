#!/usr/bin/env python3
"""Ingest external art (e.g. Midjourney renders) from the assets-src/
drop zone into the shipped assets.

For each recognized file (same names as the bake outputs — see
docs/ASSET-PROMPTS.md) it removes a plain background by flood-filling
inward from the four corners (candies, mascots, logo), copies the result
into assets/raw-bake/ over the baked version, and finally runs the shared
tools/postprocess.py step (trim, pad, resize, WebP, icons, manifest).
Backgrounds and the icon are copied through unchanged.

Run from the repo root:  python3 tools/process-assets.py
Requires Pillow (pip install pillow).
"""

import os
import shutil
import sys

from PIL import Image, ImageDraw, ImageFilter

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import postprocess  # noqa: E402  (shared trim/resize/webp/manifest step)

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'assets-src')
RAW = os.path.join(ROOT, 'assets', 'raw-bake')

CUTOUT = (
    [f'candy-{n}.png' for n in postprocess.CANDY_COLORS + ['colorbomb']]
    + [f'mascot-{t}-{m}.png' for t in postprocess.MASCOT_THEMES for m in postprocess.MASCOT_MOODS]
    + ['logo.png']
)
PASSTHROUGH = [f'bg-{t}.png' for t in postprocess.MASCOT_THEMES] + ['icon.png']

# Marker for flood-filled background pixels; any fully saturated magenta in
# real art would survive, but game candy renders never use it at (255,0,255).
MARKER = (255, 0, 255, 7)


def remove_background(im, tolerance=28):
    """Cut a plain background: flood fill from each corner, feathered edge.

    Works on clean renders with a single-color backdrop (the requirement in
    docs/ASSET-PROMPTS.md). Interior regions that merely share the backdrop
    color are safe — only areas connected to a corner are removed.
    """
    im = im.convert('RGBA')
    w, h = im.size
    work = im.copy()
    for corner in ((0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1)):
        if work.getpixel(corner)[:3] == MARKER[:3]:
            continue  # already filled from an earlier corner
        ImageDraw.floodfill(work, corner, MARKER, thresh=tolerance)

    # alpha mask: opaque everywhere the marker did not reach
    mask = Image.new('L', (w, h), 255)
    marker_px = work.load()
    mask_px = mask.load()
    for y in range(h):
        for x in range(w):
            if marker_px[x, y][:3] == MARKER[:3]:
                mask_px[x, y] = 0
    # feather one step so the cutout edge is not aliased
    mask = mask.filter(ImageFilter.GaussianBlur(1.2))
    im.putalpha(mask)
    return im


def main():
    if not os.path.isdir(SRC):
        print(f'nothing to do — create {SRC}/ and add files named as in docs/ASSET-PROMPTS.md')
        return
    os.makedirs(RAW, exist_ok=True)

    found = 0
    for name in sorted(os.listdir(SRC)):
        src_path = os.path.join(SRC, name)
        if name in CUTOUT:
            print(f'cutout   {name}')
            im = Image.open(src_path)
            remove_background(im).save(os.path.join(RAW, name), 'PNG')
            found += 1
        elif name in PASSTHROUGH:
            print(f'copy     {name}')
            Image.open(src_path).convert('RGB').save(os.path.join(RAW, name), 'PNG')
            found += 1
        else:
            print(f'skip     {name} (unknown — see docs/ASSET-PROMPTS.md for filenames)')

    if found == 0:
        print('no recognized files in assets-src/ — nothing ingested')
        return
    print(f'\ningested {found} file(s); running postprocess…\n')
    postprocess.main()


if __name__ == '__main__':
    main()
