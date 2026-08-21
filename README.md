# Candy Claus

A mobile-first, Candy Crush-style match-3 game. Stylized, smooth, and touch-first —
built with **zero dependencies**: plain HTML, CSS, and ES modules served as static files.

## Play / run locally

ES modules do not load from `file://` (CORS/MIME), so serve the folder:

```sh
python3 -m http.server 8123
# open http://localhost:8123 — on a phone, use your machine's LAN IP
```

## Test

The game logic core is fully covered by Node's built-in test runner (no packages needed):

```sh
npm test        # alias for: node --test (discovers test/*.test.js)
```

## Architecture

The project is split along a hard boundary so the game logic can later be ported to
other engines (Unity/C#, Swift) unchanged in behavior:

| Layer | Path | Rules |
|---|---|---|
| **Core** | `src/core/` | Pure, deterministic, synchronous. No DOM, no timers, no `Math.random`, no `Date`. Seeded RNG only. |
| **Web** | `src/web/` | Owns all rendering, animation timing, input, audio, storage. Consumes the core only through its public API. |

The contract between them: the core resolves a move **synchronously** into an ordered
list of `ResolveStep`s (swap, clears with cascade/wave indices, falls with from→to,
spawns, score/goal deltas, level end). The web layer plays that script back with
tweens at its own pace. Tiles carry stable, never-reused integer ids so the renderer
can track a candy across steps. The step types are the porting contract —
see the header of `src/core/resolve.js` for the exact ordering rules.

## Dependency policy

**No runtime or dev dependencies — ever (v1).** `package.json` exists only to set
`"type": "module"` so the same `.js` files run in both the browser and `node --test`.
Dev tools in `tools/` use the machine's globally-installed Playwright and are never
loaded by the game.
