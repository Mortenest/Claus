# Midjourney / AI asset prompt pack

The game loads all art through `assets/manifest.json` (see
`src/web/assets.js`), so higher-quality renders are **drop-in**: generate
images with the prompts below, save them into `assets-src/` with the exact
filenames listed, run `python3 tools/process-assets.py`, and commit the
updated `assets/` output. Any asset you don't replace keeps the current
baked art; anything missing entirely falls back to programmatic drawing.

## Technical requirements (all assets)

- **Min. 1024×1024** (backgrounds 1080×1920 portrait or larger).
- Subject **centered** with a little breathing room — files are
  auto-trimmed and square-padded.
- Candies, mascots and the logo need a **plain, single-color background**
  (flat light gray `#f0f0f0` or chroma green work best) so
  `tools/process-assets.py` can cut them out automatically. No drop
  shadows onto the background, no gradients behind the subject.
- Backgrounds and the icon are used as-is (no cutout).
- PNG preferred.

## Style anchor

Use this as the base of every prompt so the set stays coherent (with
`--sref` on a favorite result once you have one):

> glossy 3D candy game art, stylized casual mobile game, subsurface
> scattering sugar material, soft studio lighting, vibrant saturated
> colors, clean silhouette, octane render, high detail --v 6

## Candies — `assets-src/candy-*.png`

**Keep each color's silhouette** — the shapes are the colorblind-friendly
language of the game. One candy per image, plain background.

| File | Prompt core |
| --- | --- |
| `candy-red.png` | round glossy cherry-red candy sphere, {style anchor} |
| `candy-orange.png` | teardrop-shaped glossy orange candy, point up, {style anchor} |
| `candy-yellow.png` | five-pointed star-shaped glossy lemon-yellow candy, rounded tips, {style anchor} |
| `candy-green.png` | rounded-triangle glossy apple-green candy jelly, point up, {style anchor} |
| `candy-blue.png` | diamond-shaped (rhombus) glossy sky-blue candy gem, {style anchor} |
| `candy-purple.png` | heart-shaped glossy violet-purple candy, {style anchor} |
| `candy-colorbomb.png` | dark chocolate truffle sphere studded with rainbow candy pearls, magical sparkle, {style anchor} |

## World backgrounds — `assets-src/bg-*.png`

Portrait 9:16 (`--ar 9:16`). Soft focus / painterly is good — a UI veil is
drawn on top, and the board sits over the middle, so composition should
keep detail toward top and bottom.

- `bg-meadow.png` — dreamy candy meadow at golden sunset, rolling
  frosting hills, lollipop trees, warm pink and apricot sky, soft
  bokeh, stylized casual game background, painterly, --ar 9:16
- `bg-frost.png` — arctic candy night, aurora borealis over snowy
  peppermint mountains, full moon, deep teal-navy sky with stars,
  stylized casual game background, painterly, --ar 9:16

## Mascots — `assets-src/mascot-<theme>-<mood>.png`

The two gumdrop characters (see `src/web/mascot.js` for the canonical
design: rounded gumdrop body, stubby arms and feet, big glossy eyes,
belly patch; **meadow** is pink with a leaf sprout, **frost** is ice-blue
with a snowflake topper).

Workflow for consistency: generate one great **idle** per character
first, then use it as a character reference (`--cref <url> --cw 100`) for
the other four moods. Plain background, full body, front view.

Moods (10 files: `mascot-meadow-idle.png` … `mascot-frost-sad.png`):

- `idle` — standing, sweet gentle smile, arms relaxed at sides
- `cheer` — both arms raised in joy, eyes closed happy smile
- `wow` — arms raised, wide surprised round eyes, small open mouth
- `starstruck` — arms raised, golden star-shaped eyes, huge grin
- `sad` — drooping posture, worried eyebrows, single tear

Prompt core: cute kawaii gumdrop candy creature mascot, {color/topper},
{mood description}, full body, front view, {style anchor}, plain gray
background

## Logo — `assets-src/logo.png`

> "Candy Claus" wordmark, glossy rainbow balloon candy lettering, playful
> arched baseline, thick rounded letters, white gloss highlights, subtle
> drop shadow, transparent-ready plain background, wide aspect --ar 3:1

## App icon — `assets-src/icon.png`

> app icon, cute pink gumdrop candy mascot cheering at sunset in a candy
> meadow, warm glow, centered composition, square, rounded-corner-safe
> margins, {style anchor} --ar 1:1

## After generating

```bash
# drop files into assets-src/ (gitignored), then:
python3 tools/process-assets.py
node --test          # core untouched, but always verify
git add assets icons && git commit
```

`process-assets.py` cuts out plain backgrounds (flood fill from the
corners), then runs the shared `tools/postprocess.py` step: trim, square
pad, resize, WebP encode, icon PNGs, and a regenerated
`assets/manifest.json`.
