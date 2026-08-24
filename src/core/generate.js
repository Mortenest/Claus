/**
 * Initial board generation: fill in scan order, never completing a 3-run
 * (so the board starts matchless by construction), retrying the whole fill
 * if it happens to have no valid move. Deterministic for a given rng state.
 */

import { Board } from './board.js';
import { findValidMoves } from './moves.js';

/**
 * @param {{ rows: number, cols: number, colorCount: number }} levelDef
 * @param {ReturnType<import('./rng.js').createRng>} rng
 * @param {ReturnType<import('./tiles.js').createTileFactory>} factory
 * @returns {import('./board.js').Board}
 */
export function generateBoard(levelDef, rng, factory) {
  const { rows, cols, colorCount } = levelDef;
  if (colorCount < 3 || colorCount > 6) {
    throw new Error(`colorCount must be 3..6, got ${colorCount}`);
  }
  const mask = levelDef.layout ? Board.maskFromLayout(levelDef.layout, rows, cols) : null;
  for (let attempt = 0; attempt < 50; attempt++) {
    const board = new Board(rows, cols, mask);
    for (const p of board.positions()) {
      if (board.isHole(p.r, p.c)) continue;
      const allowed = [];
      for (let color = 0; color < colorCount; color++) {
        if (!wouldCompleteRun(board, p, color)) allowed.push(color);
      }
      board.set(p.r, p.c, factory.make(allowed[rng.int(allowed.length)]));
    }
    if (findValidMoves(board).length > 0) return board;
  }
  throw new Error('generateBoard: no movable board found');
}

/** Placing `color` at p would finish a run with the two left or two up. */
function wouldCompleteRun(board, p, color) {
  return (
    (colorAt(board, p.r, p.c - 1) === color && colorAt(board, p.r, p.c - 2) === color) ||
    (colorAt(board, p.r - 1, p.c) === color && colorAt(board, p.r - 2, p.c) === color)
  );
}

function colorAt(board, r, c) {
  if (!board.inBounds(r, c)) return null;
  const tile = board.get(r, c);
  return tile === null ? null : tile.color;
}
