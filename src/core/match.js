/**
 * Match detection. findMatches scans horizontal and vertical runs of ≥3
 * same-colored tiles and merges runs that share a cell into groups (an L or T
 * is one group with two runs). decideSpecials then applies the creation rules:
 *
 *   run ≥5 in a line            → colorbomb
 *   group with both H and V run → wrapped   (at an intersection cell)
 *   single run of exactly 4     → striped   (h-run → striped_v clears its
 *                                            column; v-run → striped_h clears
 *                                            its row)
 *   plain 3                     → nothing
 *
 * The special is created at the player's swapped cell when that cell is part
 * of the group; otherwise at the intersection (wrapped) or the middle of the
 * run. Colorbombs (color -1) never participate in color runs.
 *
 * @typedef {{ dir: 'h'|'v', color: number, cells: import('./tiles.js').Pos[] }} Run
 * @typedef {{
 *   color: number,
 *   cells: import('./tiles.js').Pos[],
 *   runs: Run[],
 *   creates: null | { kind: import('./tiles.js').TileKind, pos: import('./tiles.js').Pos },
 * }} MatchGroup
 */

import { posKey } from './tiles.js';

/**
 * @param {import('./board.js').Board} board
 * @returns {MatchGroup[]} groups in deterministic scan order, creates = null
 */
export function findMatches(board) {
  const runs = findRuns(board);
  return mergeRuns(runs);
}

/** @returns {Run[]} */
function findRuns(board) {
  const runs = [];
  for (let r = 0; r < board.rows; r++) {
    scanLine(board, runs, 'h', r);
  }
  for (let c = 0; c < board.cols; c++) {
    scanLine(board, runs, 'v', c);
  }
  return runs;
}

function scanLine(board, runs, dir, fixed) {
  const length = dir === 'h' ? board.cols : board.rows;
  const at = (i) => (dir === 'h' ? { r: fixed, c: i } : { r: i, c: fixed });
  let i = 0;
  while (i < length) {
    const start = at(i);
    const tile = board.get(start.r, start.c);
    if (tile === null || tile.color < 0) {
      i++;
      continue;
    }
    let end = i + 1;
    while (end < length) {
      const p = at(end);
      const next = board.get(p.r, p.c);
      if (next === null || next.color !== tile.color) break;
      end++;
    }
    if (end - i >= 3) {
      const cells = [];
      for (let j = i; j < end; j++) cells.push(at(j));
      runs.push({ dir, color: tile.color, cells });
    }
    i = end;
  }
}

/** Union runs that share a cell (they necessarily share color). */
function mergeRuns(runs) {
  const parent = runs.map((_, i) => i);
  const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const union = (a, b) => {
    parent[find(a)] = find(b);
  };

  const cellToRun = new Map();
  runs.forEach((run, i) => {
    for (const cell of run.cells) {
      const key = posKey(cell);
      if (cellToRun.has(key)) union(i, cellToRun.get(key));
      else cellToRun.set(key, i);
    }
  });

  /** @type {Map<number, MatchGroup>} */
  const groups = new Map();
  runs.forEach((run, i) => {
    const root = find(i);
    if (!groups.has(root)) {
      groups.set(root, { color: run.color, cells: [], runs: [], creates: null });
    }
    const group = groups.get(root);
    group.runs.push(run);
    for (const cell of run.cells) {
      if (!group.cells.some((p) => p.r === cell.r && p.c === cell.c)) {
        group.cells.push(cell);
      }
    }
  });
  return [...groups.values()];
}

/**
 * Fill in each group's `creates` decision.
 * @param {MatchGroup[]} groups
 * @param {import('./tiles.js').Pos[]} preferred positions to place the special
 *   at if inside the group, in preference order (swap destination, then
 *   source). Empty for cascade rounds.
 * @returns {MatchGroup[]} new array; input groups are not mutated
 */
export function decideSpecials(groups, preferred = []) {
  return groups.map((g) => ({ ...g, creates: decideOne(g, preferred) }));
}

function decideOne(group, preferred) {
  const five = group.runs.find((run) => run.cells.length >= 5);
  const hasH = group.runs.some((run) => run.dir === 'h');
  const hasV = group.runs.some((run) => run.dir === 'v');

  let kind;
  let fallback;
  if (five) {
    kind = 'colorbomb';
    fallback = middleOf(five.cells);
  } else if (hasH && hasV) {
    kind = 'wrapped';
    fallback = intersectionOf(group);
  } else if (group.runs[0].cells.length >= 4) {
    kind = group.runs[0].dir === 'h' ? 'striped_v' : 'striped_h';
    fallback = middleOf(group.runs[0].cells);
  } else {
    return null;
  }

  for (const pos of preferred) {
    if (group.cells.some((p) => p.r === pos.r && p.c === pos.c)) {
      return { kind, pos: { r: pos.r, c: pos.c } };
    }
  }
  return { kind, pos: fallback };
}

function middleOf(cells) {
  const mid = cells[Math.floor((cells.length - 1) / 2)];
  return { r: mid.r, c: mid.c };
}

/** First cell (scan order) present in more than one of the group's runs. */
function intersectionOf(group) {
  const seen = new Map();
  for (const run of group.runs) {
    for (const cell of run.cells) {
      const key = posKey(cell);
      seen.set(key, (seen.get(key) ?? 0) + 1);
    }
  }
  const shared = group.cells
    .filter((p) => seen.get(posKey(p)) > 1)
    .sort((a, b) => a.r - b.r || a.c - b.c);
  return { r: shared[0].r, c: shared[0].c };
}
