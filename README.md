# Candy Claus

A mobile-first, Candy Crush-style match-3 game. Stylized, smooth, and touch-first —
built with **zero dependencies**: plain HTML, CSS, and ES modules served as static files.

**Play online:** <https://mortenest.github.io/Claus/> (deployed from `main` by
the CI & Deploy workflow).

**Play:** swipe (or tap-tap) two neighboring candies to swap them. Match 3+ of a
color to clear them; match 4 for a striped candy, an L/T for a wrapped candy, 5 in
a row for a colorbomb. Meet each level's goal — a score target or collecting a
color — before the moves run out. Win with moves to spare and the **Sweet
Finish** turns every unspent move into a striped candy that detonates in one
grand chain. 18 levels across two worlds — Candy Meadow's classic boards, then
Frost Night's shaped boards with holes — with 1–3 star ratings; progress saves
locally.

## Run locally

ES modules do not load from `file://` (CORS/MIME), so serve the folder:

```sh
python3 -m http.server 8123
# open http://localhost:8123 — on a phone, use your machine's LAN IP
```

Add to home screen for the standalone app feel (PWA manifest included).

## Test

The logic core is covered by Node's built-in test runner (no packages needed):

```sh
npm test        # alias for: node --test (discovers test/*.test.js)
```

The suite includes a hand-computed golden playback script, replay-equals-state
checks, a special-effects matrix, 500-seed board generation sweeps, and a
100-game fuzz asserting engine invariants after every move.

## Architecture

The project is split along a hard boundary so the game logic can later be ported
to other engines (Unity/C#, Swift) unchanged in behavior:

| Layer | Path | Rules |
|---|---|---|
| **Core** | `src/core/` | Pure, deterministic, synchronous. No DOM, no timers, no `Math.random`, no `Date`. Seeded RNG only (enforced by `test/purity.test.js`). |
| **Web** | `src/web/` | Owns all rendering, animation timing, input, audio, storage. Consumes the core only through its public API. |

The contract between them: `Game.applyMove` resolves a move **synchronously**
into an ordered list of `ResolveStep`s — swap, clears with cascade/wave indices,
special creations, falls with from→to, spawns, score/goal deltas, level end —
and the web layer plays that script back with tweens at its own pace. Tiles
carry stable, never-reused integer ids so the renderer can track a candy across
steps, and a `verifySync` tripwire asserts visuals match the board after every
move. The step types are the porting contract — see the header of
`src/core/resolve.js` for the exact ordering rules.

All sound is synthesized with WebAudio, and every image the game ships was
rendered by this repo's own pipeline. Art loads through
`assets/manifest.json` (`src/web/assets.js`); any missing key falls back to
programmatic canvas/SVG drawing (a distinct silhouette per candy color, so
the game reads without color vision). That makes better art **drop-in**:
see `docs/ASSET-PROMPTS.md` for the Midjourney-ready prompt pack and the
`assets-src/` drop zone.

## Art pipeline

```sh
python3 -m http.server 8123                                # from the repo root
NODE_PATH=/opt/node22/lib/node_modules node tools/bake-assets.cjs
                                # renders tools/render-studio.html (layered
                                # lighting recipes) → assets/raw-bake/*.png
python3 tools/postprocess.py    # trim/pad/resize → assets/**.webp + icons/
                                # + assets/manifest.json  (needs Pillow)
python3 tools/process-assets.py # same, but ingesting external renders from
                                # assets-src/ with automatic background cutout
```

## Dev tools (`tools/`, never loaded by the game)

```sh
node tools/balance.js [games]   # greedy-bot playouts per level → percentiles
                                # used to calibrate star thresholds
NODE_PATH=/opt/node22/lib/node_modules \
  node tools/verify-mobile.cjs [url] [shotDir] [--full]
                                # phone-emulated Chromium: screenshots every
                                # screen, plays moves via touch; --full plays
                                # level 1 to the end dialog
```

`verify-mobile.cjs` uses a globally-installed Playwright; it is not a project
dependency.

## Dependency policy

**No runtime or dev dependencies — ever (v1).** `package.json` exists only to
set `"type": "module"` so the same `.js` files run in both the browser and
`node --test`.
