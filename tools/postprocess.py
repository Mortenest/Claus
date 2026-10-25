#!/usr/bin/env python3
"""Turn raw bakes (assets/raw-bake/, from tools/bake-assets.cjs) into the
shipped files: alpha-trimmed, square-padded, resized WebP under assets/ plus
PNG icons under icons/, and assets/manifest.json mapping asset keys to files.

Run from the repo root:  python3 tools/postprocess.py
Requires Pillow (pip install pillow).
"""

import json
import os
import sys

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = os.path.join(ROOT, 'assets', 'raw-bake')
OUT = os.path.join(ROOT, 'assets')
ICONS = os.path.join(ROOT, 'icons')

CANDY_COLORS = ['red', 'orange', 'yellow', 'green', 'blue', 'purple']
MASCOT_THEMES = ['meadow', 'frost']
MASCOT_MOODS = ['idle', 'cheer', 'wow', 'starstruck', 'sad']


def trim_square(im, margin=0.03):
    """Crop to the alpha bounding box, then pad back to a centered square."""
    bbox = im.getbbox()
    if bbox:
        im = im.crop(bbox)
    side = int(max(im.size) * (1 + margin * 2))
    sq = Image.new('RGBA', (side, side), (0, 0, 0, 0))
    sq.paste(im, ((side - im.width) // 2, (side - im.height) // 2))
    return sq


def save_webp(im, rel_path, quality):
    path = os.path.join(OUT, rel_path)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    im.save(path, 'WEBP', quality=quality, method=6)
    return os.path.getsize(path)


def main():
    manifest = {}
    total = 0

    def emit(key, rel_path, size):
        nonlocal total
        manifest[key] = rel_path
        total += size
        print(f'  {key:28s} {rel_path:26s} {size / 1024:6.1f} KB')

    print('candies (256px):')
    for name in CANDY_COLORS + ['colorbomb']:
        im = Image.open(os.path.join(RAW, f'candy-{name}.png')).convert('RGBA')
        im = trim_square(im).resize((256, 256), Image.LANCZOS)
        key = f'candy/{name}'
        rel = f'candy/{name}.webp'
        emit(key, rel, save_webp(im, rel, 90))

    print('backgrounds (1080x1920):')
    for theme in MASCOT_THEMES:
        im = Image.open(os.path.join(RAW, f'bg-{theme}.png')).convert('RGB')
        if im.size != (1080, 1920):
            im = im.resize((1080, 1920), Image.LANCZOS)
        key = f'bg/{theme}'
        rel = f'bg/{theme}.webp'
        emit(key, rel, save_webp(im, rel, 82))

    print('mascots (512px):')
    for theme in MASCOT_THEMES:
        for mood in MASCOT_MOODS:
            im = Image.open(os.path.join(RAW, f'mascot-{theme}-{mood}.png')).convert('RGBA')
            im = trim_square(im).resize((512, 512), Image.LANCZOS)
            key = f'mascot/{theme}/{mood}'
            rel = f'mascot/{theme}/{mood}.webp'
            emit(key, rel, save_webp(im, rel, 90))

    print('logo:')
    logo = Image.open(os.path.join(RAW, 'logo.png')).convert('RGBA')
    bbox = logo.getbbox()
    if bbox:
        logo = logo.crop(bbox)
    if logo.width > 1200:
        logo = logo.resize((1200, round(logo.height * 1200 / logo.width)), Image.LANCZOS)
    emit('logo', 'logo.webp', save_webp(logo, 'logo.webp', 90))

    print('icons (png):')
    icon = Image.open(os.path.join(RAW, 'icon.png')).convert('RGB')
    os.makedirs(ICONS, exist_ok=True)
    for name, side in (('icon-512.png', 512), ('icon-192.png', 192), ('apple-touch-icon.png', 180)):
        out = icon.resize((side, side), Image.LANCZOS)
        path = os.path.join(ICONS, name)
        out.save(path, 'PNG', optimize=True)
        print(f'  icons/{name:22s} {os.path.getsize(path) / 1024:6.1f} KB')

    with open(os.path.join(OUT, 'manifest.json'), 'w') as f:
        json.dump(manifest, f, indent=2, sort_keys=True)
        f.write('\n')

    print(f'\nmanifest.json: {len(manifest)} keys — game assets total {total / 1024:.0f} KB')
    if total > 1.5 * 1024 * 1024:
        print('WARNING: over the ~1.5 MB budget', file=sys.stderr)
        sys.exit(1)


if __name__ == '__main__':
    main()
