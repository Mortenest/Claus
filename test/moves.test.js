import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  wouldMatch,
  isValidMove,
  isActivationSwap,
  findValidMoves,
  findHint,
  reshuffle,
} from '../src/core/moves.js';
import { findMatches } from '../src/core/match.js';
import { createRng } from '../src/core/rng.js';
import { boardFrom, boardIds, assertSettled } from './helpers.js';

/**
 * color(r,c) = (c + 2r) mod 3 puts no equal colors within distance 2 along
 * any row or column, so no single swap can ever complete a 3-run: a provably
 * move-free board.
 */
const MOVE_FREE = ['rgbr', 'brgb', 'gbrg'];

test('isValidMove rejects non-adjacent, out-of-bounds, and useless swaps', () => {
  const board = boardFrom(['rgrg', 'grgr', 'rgrr']);
  assert.ok(!isValidMove(board, { from: { r: 0, c: 0 }, to: { r: 0, c: 2 } })); // not adjacent
  assert.ok(!isValidMove(board, { from: { r: 0, c: 0 }, to: { r: 1, c: 1 } })); // diagonal
  assert.ok(!isValidMove(board, { from: { r: 0, c: 3 }, to: { r: 0, c: 4 } })); // off board
  assert.ok(!isValidMove(board, { from: { r: 0, c: 0 }, to: { r: 0, c: 1 } })); // no match
  assert.ok(isValidMove(board, { from: { r: 1, c: 2 }, to: { r: 2, c: 2 } }));
});

test('a move-free board yields no valid moves', () => {
  assert.deepEqual(findValidMoves(boardFrom(MOVE_FREE)), []);
  assert.equal(findHint(boardFrom(MOVE_FREE)), null);
});

test('findValidMoves finds exactly the one enabled move', () => {
  // Deviating one cell from the move-free pattern enables exactly one swap:
  // bringing b to (0,3) completes column 3 as b,b,b.
  const board = boardFrom(['rgbr', 'brgb', 'gbrb']);
  assert.deepEqual(findValidMoves(board), [
    { from: { r: 0, c: 2 }, to: { r: 0, c: 3 } },
  ]);
});

test('striped tiles still match by color', () => {
  // Swapping r into (2,0) completes column 0 as rH, r, r.
  const board = boardFrom(['rH g b', 'r y o', 'y r g']);
  assert.ok(wouldMatch(board, { from: { r: 2, c: 1 }, to: { r: 2, c: 0 } }));
});

test('activation swaps: bomb+any and special+special are valid without a match', () => {
  const bomb = boardFrom(['* g b', 'y o p', 'b g o']);
  assert.ok(isActivationSwap(bomb, { from: { r: 0, c: 0 }, to: { r: 0, c: 1 } }));
  assert.ok(isValidMove(bomb, { from: { r: 0, c: 0 }, to: { r: 0, c: 1 } }));

  const two = boardFrom(['rH gV b', 'y o p', 'b g o']);
  assert.ok(isValidMove(two, { from: { r: 0, c: 0 }, to: { r: 0, c: 1 } }));

  const lone = boardFrom(['rH g b', 'y o p', 'b g o']);
  assert.ok(!isActivationSwap(lone, { from: { r: 0, c: 0 }, to: { r: 0, c: 1 } }));
  assert.ok(!isValidMove(lone, { from: { r: 0, c: 0 }, to: { r: 0, c: 1 } }));
});

test('findHint prefers a special-creating move over a plain 3-match', () => {
  // (0,2)↔(1,2) makes a 5-run (colorbomb); (2,3)↔(2,4) makes a plain 3.
  const board = boardFrom(['rrbrr', 'ggrgg', 'byyby']);
  assert.deepEqual(findHint(board), { from: { r: 0, c: 2 }, to: { r: 1, c: 2 } });
});

test('reshuffle keeps the same tiles but settles the board', () => {
  const board = boardFrom(MOVE_FREE);
  const before = boardIds(board);
  const moves = reshuffle(board, createRng(1));
  assertSettled(board);
  assert.deepEqual(boardIds(board), before);
  assert.ok(moves.length > 0);
  for (const m of moves) {
    assert.equal(board.get(m.to.r, m.to.c).id, m.id);
  }
  assert.equal(findMatches(board).length, 0);
});
