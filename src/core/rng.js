/**
 * Seeded PRNG (mulberry32). The entire core draws randomness exclusively from
 * this so that a (levelDef, seed, moves) triple always produces the identical
 * game — the property that makes replays, golden tests, and future ports to
 * other engines possible. State is a single uint32, exposed via
 * getState/setState so a session can be snapshotted and resumed.
 *
 * A port to C#/Swift must reimplement exactly this algorithm.
 */

/**
 * @param {number} seed uint32
 * @returns {{
 *   next: () => number,
 *   int: (maxExclusive: number) => number,
 *   pick: <T>(arr: T[]) => T,
 *   shuffle: <T>(arr: T[]) => T[],
 *   getState: () => number,
 *   setState: (state: number) => void,
 * }}
 */
export function createRng(seed) {
  let state = seed >>> 0;

  /** Uniform float in [0, 1). */
  function next() {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Uniform integer in [0, maxExclusive). */
  function int(maxExclusive) {
    return Math.floor(next() * maxExclusive);
  }

  function pick(arr) {
    return arr[int(arr.length)];
  }

  /** Fisher–Yates on a copy; the input array is not mutated. */
  function shuffle(arr) {
    const out = arr.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = int(i + 1);
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  }

  return {
    next,
    int,
    pick,
    shuffle,
    getState: () => state,
    setState: (s) => {
      state = s >>> 0;
    },
  };
}

/**
 * Derive a per-attempt seed from a level's base seed, so every retry of a
 * level plays a fresh but reproducible board. Splitmix-style avalanche.
 * @param {number} seedBase uint32
 * @param {number} attempt 0-based attempt counter
 * @returns {number} uint32
 */
export function deriveSeed(seedBase, attempt) {
  let h = (seedBase ^ Math.imul(attempt + 1, 0x9e3779b9)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}
