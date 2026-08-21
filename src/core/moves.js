/**
 * Valid-move detection, hints, and the no-move reshuffle.
 *
 * A swap is valid when it is orthogonally adjacent, both cells hold tiles,
 * and it would produce a match — or (see isActivationSwap) it directly
 * activates specials: swapping a colorbomb with anything, or two specials
 * with each other. Scan order everywhere is (r, c) then right/down neighbor,
 * which makes findValidMoves/findHint deterministic.
 */

import { findMatches, decideSpecials } from './match.js';
import { isAdjacent, isSpecial } from './tiles.js';

/** @typedef {{ from: import('./tiles.js').Pos, to: import('./tiles.js').Pos }} Move */

/** Swap two cells in place (caller restores if simulating). */
export function swapCells(board, a, b) {
  const tmp = board.get(a.r, a.c);
  board.set(a.r, a.c, board.get(b.r, b.c));
  board.set(b.r, b.c, tmp);
}

/** Would this swap produce at least one color match? (Simulates and reverts.) */
export function wouldMatch(board, move) {
  swapCells(board, move.from, move.to);
  const matched = findMatches(board).length > 0;
  swapCells(board, move.from, move.to);
  return matched;
}

/**
 * A swap that fires specials without needing a color match:
 * colorbomb + anything, or special + special.
 */
export function isActivationSwap(board, move) {
  const a = board.get(move.from.r, move.from.c);
  const b = board.get(move.to.r, move.to.c);
  if (a === null || b === null) return false;
  if (a.kind === 'colorbomb' || b.kind === 'colorbomb') return true;
  return isSpecial(a) && isSpecial(b);
}

export function isValidMove(board, move) {
  if (!board.inBounds(move.from.r, move.from.c) || !board.inBounds(move.to.r, move.to.c)) {
    return false;
  }
  if (!isAdjacent(move.from, move.to)) return false;
  if (board.get(move.from.r, move.from.c) === null || board.get(move.to.r, move.to.c) === null) {
    return false;
  }
  return isActivationSwap(board, move) || wouldMatch(board, move);
}

/** All valid moves in deterministic scan order (each pair listed once). */
export function findValidMoves(board) {
  const moves = [];
  for (const from of board.positions()) {
    for (const to of [{ r: from.r, c: from.c + 1 }, { r: from.r + 1, c: from.c }]) {
      if (board.inBounds(to.r, to.c) && isValidMove(board, { from, to })) {
        moves.push({ from: { ...from }, to });
      }
    }
  }
  return moves;
}

/**
 * Pick the move to show as a hint: prefer a special-creating match, then the
 * largest match, then the first valid move (activation swaps rank as large).
 * @returns {Move | null}
 */
export function findHint(board) {
  let best = null;
  let bestRank = -1;
  for (const move of findValidMoves(board)) {
    let rank;
    if (isActivationSwap(board, move)) {
      rank = 100;
    } else {
      swapCells(board, move.from, move.to);
      const groups = decideSpecials(findMatches(board), [move.to, move.from]);
      swapCells(board, move.from, move.to);
      const creates = groups.some((g) => g.creates !== null);
      const biggest = Math.max(...groups.map((g) => g.cells.length));
      rank = (creates ? 100 : 0) + biggest;
    }
    if (rank > bestRank) {
      best = move;
      bestRank = rank;
    }
  }
  return best;
}

/**
 * Permute the existing tiles (ids preserved) into an arrangement with no
 * matches and at least one valid move. Random attempts first, then a greedy
 * constructive pass. Throws only if every attempt fails — unreachable for
 * real level boards (covered by seed-sweep tests).
 * @returns {{ id: number, from: Pos, to: Pos }[]} moves for tiles that moved
 */
export function reshuffle(board, rng) {
  const origin = new Map();
  const tiles = [];
  for (const pos of board.positions()) {
    const tile = board.get(pos.r, pos.c);
    if (tile !== null) {
      tiles.push(tile);
      origin.set(tile.id, { ...pos });
    }
  }

  for (let attempt = 0; attempt < 100; attempt++) {
    place(board, rng.shuffle(tiles));
    if (isSettled(board)) return movesFrom(board, origin);
  }
  for (let attempt = 0; attempt < 50; attempt++) {
    if (greedyPlace(board, rng.shuffle(tiles)) && isSettled(board)) {
      return movesFrom(board, origin);
    }
  }
  throw new Error('reshuffle failed to settle the board');
}

function place(board, tiles) {
  let i = 0;
  for (const pos of board.positions()) {
    if (board.get(pos.r, pos.c) !== null) board.set(pos.r, pos.c, tiles[i++]);
  }
}

function isSettled(board) {
  return findMatches(board).length === 0 && findValidMoves(board).length > 0;
}

/** Fill scan-order, skipping any tile that would complete a 3-run. */
function greedyPlace(board, tiles) {
  const remaining = tiles.slice();
  for (const pos of board.positions()) {
    if (board.get(pos.r, pos.c) === null) continue;
    const i = remaining.findIndex((tile) => !completesRun(board, pos, tile));
    if (i === -1) return false;
    board.set(pos.r, pos.c, remaining[i]);
    remaining.splice(i, 1);
  }
  return true;
}

function completesRun(board, pos, tile) {
  if (tile.color < 0) return false;
  return (
    colorAt(board, pos.r, pos.c - 1) === tile.color && colorAt(board, pos.r, pos.c - 2) === tile.color
  ) || (
    colorAt(board, pos.r - 1, pos.c) === tile.color && colorAt(board, pos.r - 2, pos.c) === tile.color
  );
}

function colorAt(board, r, c) {
  if (!board.inBounds(r, c)) return null;
  const tile = board.get(r, c);
  return tile === null ? null : tile.color;
}

function movesFrom(board, origin) {
  const moves = [];
  for (const pos of board.positions()) {
    const tile = board.get(pos.r, pos.c);
    if (tile === null) continue;
    const from = origin.get(tile.id);
    if (from.r !== pos.r || from.c !== pos.c) {
      moves.push({ id: tile.id, from, to: { ...pos } });
    }
  }
  return moves;
}
