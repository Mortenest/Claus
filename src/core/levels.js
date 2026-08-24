/**
 * Level schema and helpers. Level definitions are pure data (levels-data.js)
 * so ports can consume them verbatim.
 *
 * @typedef {{
 *   id: number,            // 1-based, contiguous
 *   name: string,
 *   rows: number, cols: number,
 *   colorCount: number,    // 3..6 — the main difficulty knob
 *   moves: number,
 *   goal: { type:'score', target:number }
 *       | { type:'collect', color:number, count:number },
 *   stars: [number, number, number],  // cumulative score thresholds (1★..3★)
 *   seedBase: number,      // per-attempt seed = deriveSeed(seedBase, attempt)
 *   layout?: string[],     // shaped board: rows of '.' (playable) / '#' (hole)
 * }} LevelDef
 */

import { LEVELS } from './levels-data.js';
import { deriveSeed } from './rng.js';
import { COLORS } from './tiles.js';
import { Board } from './board.js';

export { LEVELS };

/** Worlds batch the levels: distinct art theme and board style per world. */
export const WORLDS = [
  { id: 1, name: 'Candy Meadow', theme: 'meadow', firstLevel: 1 },
  { id: 2, name: 'Frost Night', theme: 'frost', firstLevel: 10 },
];

/** @returns {(typeof WORLDS)[number]} */
export function worldOf(levelId) {
  const index = Math.min(WORLDS.length - 1, Math.floor((levelId - 1) / 9));
  return WORLDS[index];
}

/** @returns {LevelDef} */
export function getLevel(id) {
  const def = LEVELS.find((l) => l.id === id);
  if (!def) throw new Error(`no level ${id}`);
  return def;
}

/** Seed for one attempt at a level (attempt is 0-based). */
export function attemptSeed(levelDef, attempt) {
  return deriveSeed(levelDef.seedBase, attempt);
}

/** Throws with a specific message when a definition is malformed. */
export function validateLevelDef(def) {
  const fail = (msg) => {
    throw new Error(`level ${def?.id ?? '?'}: ${msg}`);
  };
  if (!Number.isInteger(def.id) || def.id < 1) fail('bad id');
  if (typeof def.name !== 'string' || def.name.length === 0) fail('bad name');
  if (!Number.isInteger(def.rows) || def.rows < 5 || def.rows > 10) fail('bad rows');
  if (!Number.isInteger(def.cols) || def.cols < 5 || def.cols > 10) fail('bad cols');
  if (!Number.isInteger(def.colorCount) || def.colorCount < 3 || def.colorCount > COLORS.length) {
    fail('bad colorCount');
  }
  if (!Number.isInteger(def.moves) || def.moves < 5 || def.moves > 40) fail('bad moves');
  const goal = def.goal;
  if (goal?.type === 'score') {
    if (!Number.isInteger(goal.target) || goal.target <= 0) fail('bad score target');
  } else if (goal?.type === 'collect') {
    if (!Number.isInteger(goal.color) || goal.color < 0 || goal.color >= def.colorCount) {
      fail('collect color outside the level palette');
    }
    if (!Number.isInteger(goal.count) || goal.count <= 0) fail('bad collect count');
  } else {
    fail('unknown goal type');
  }
  if (!Array.isArray(def.stars) || def.stars.length !== 3) fail('stars must be 3 thresholds');
  if (!def.stars.every((s) => Number.isInteger(s) && s > 0)) fail('bad star threshold');
  if (!(def.stars[0] < def.stars[1] && def.stars[1] < def.stars[2])) {
    fail('star thresholds must ascend');
  }
  if (goal.type === 'score' && def.stars[0] !== goal.target) {
    fail('for score goals the 1★ threshold must equal the target');
  }
  if (!Number.isInteger(def.seedBase) || def.seedBase < 0) fail('bad seedBase');
  if (def.layout !== undefined) {
    try {
      Board.maskFromLayout(def.layout, def.rows, def.cols);
    } catch (err) {
      fail(`bad layout: ${err.message}`);
    }
    if (!hasPlayableRun(def.layout)) {
      fail('layout needs at least one straight playable 3-run');
    }
  }
}

/** Some horizontal or vertical run of ≥3 '.' cells exists in the layout. */
function hasPlayableRun(layout) {
  const rows = layout.length;
  const cols = layout[0].length;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (c + 2 < cols && layout[r][c] === '.' && layout[r][c + 1] === '.' && layout[r][c + 2] === '.') {
        return true;
      }
      if (r + 2 < rows && layout[r][c] === '.' && layout[r + 1][c] === '.' && layout[r + 2][c] === '.') {
        return true;
      }
    }
  }
  return false;
}
