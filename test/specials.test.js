import { test } from 'node:test';
import assert from 'node:assert/strict';
import { expandClears } from '../src/core/specials.js';
import { resolveMove } from '../src/core/resolve.js';
import { createRng } from '../src/core/rng.js';
import { isValidMove } from '../src/core/moves.js';
import {
  boardFrom,
  createTileFactory,
  applyStepsToBoard,
  assertBoardsEqual,
  assertSettled,
} from './helpers.js';

const seed = (r, c) => ({ pos: { r, c }, cause: 'match', wave: 0 });

test('striped_h clears its whole row when cleared', () => {
  const board = boardFrom(['y b g o', 'rH o p y', 'b g o r']);
  const cleared = expandClears(board, [seed(1, 0)]);
  assert.deepEqual(
    cleared.map((e) => ({ id: e.id, cause: e.cause, wave: e.wave })),
    [
      { id: 5, cause: 'match', wave: 0 },
      { id: 6, cause: 'striped_h', wave: 1 },
      { id: 7, cause: 'striped_h', wave: 1 },
      { id: 8, cause: 'striped_h', wave: 1 },
    ],
  );
  assert.deepEqual(cleared[1].sourcePos, { r: 1, c: 0 });
});

test('striped_v clears its whole column', () => {
  const board = boardFrom(['y b g', 'r gV p', 'b g o']);
  const cleared = expandClears(board, [seed(1, 1)]);
  assert.deepEqual(cleared.map((e) => e.pos), [
    { r: 1, c: 1 },
    { r: 0, c: 1 },
    { r: 2, c: 1 },
  ]);
  assert.deepEqual(cleared.map((e) => e.wave), [0, 1, 1]);
});

test('wrapped clears a 3×3, clipped at board edges', () => {
  const center = boardFrom(['y b g', 'r gW p', 'b g o']);
  assert.equal(expandClears(center, [seed(1, 1)]).length, 9);

  const corner = boardFrom(['gW b g', 'r y p', 'b g o']);
  const cleared = expandClears(corner, [seed(0, 0)]);
  assert.deepEqual(cleared.map((e) => e.pos), [
    { r: 0, c: 0 },
    { r: 0, c: 1 },
    { r: 1, c: 0 },
    { r: 1, c: 1 },
  ]);
});

test('chain: striped triggers striped triggers more, wave-tagged', () => {
  const board = boardFrom(['y b g o', 'rH o gV y', 'b g o r']);
  const cleared = expandClears(board, [seed(1, 0)]);
  const byId = new Map(cleared.map((e) => [e.id, e]));
  assert.equal(byId.get(5).wave, 0); // the seeded striped_h
  assert.equal(byId.get(7).wave, 1); // striped_v hit by the row blast
  assert.equal(byId.get(7).cause, 'striped_h');
  assert.equal(byId.get(3).wave, 2); // (0,2) hit by the column blast
  assert.equal(byId.get(3).cause, 'striped_v');
  assert.equal(cleared.length, 6); // row of 4 + remaining 2 of column 2
});

test('chained colorbomb clears the most common color, ties to lowest id', () => {
  const board = boardFrom(['b y r', 'g * r', 'b y b']);
  const cleared = expandClears(board, [seed(1, 1)]);
  const bombVictims = cleared.filter((e) => e.cause === 'colorbomb');
  assert.deepEqual(bombVictims.map((e) => e.color), [4, 4, 4]); // 3×b beats 2×r,2×y
  assert.equal(cleared[0].kind, 'colorbomb');

  const tied = boardFrom(['b y r', 'g * r', 'b y o']);
  const tieVictims = expandClears(tied, [seed(1, 1)]).filter((e) => e.cause === 'colorbomb');
  assert.deepEqual(tieVictims.map((e) => e.color), [0, 0]); // r ties b, lowest color id wins
});

test('protected creation cells are never cleared', () => {
  const board = boardFrom(['y b g o', 'rH o p y', 'b g o r']);
  const protectedKeys = new Set(['1,2']);
  const cleared = expandClears(board, [seed(1, 0)], protectedKeys);
  assert.ok(!cleared.some((e) => e.pos.r === 1 && e.pos.c === 2));
  assert.equal(cleared.length, 3);
});

test('each cell clears at most once (overlapping blasts)', () => {
  const board = boardFrom(['rH b g', 'y o p', 'rH g o']);
  const cleared = expandClears(board, [seed(0, 0), seed(2, 0)]);
  const keys = cleared.map((e) => `${e.pos.r},${e.pos.c}`);
  assert.equal(new Set(keys).size, keys.length);
  assert.equal(cleared.length, 6); // rows 0 and 2; (1,0) is untouched
});

test('a match that includes a striped detonates it in the same round', () => {
  const factory = createTileFactory();
  const board = boardFrom(['g r y o', 'r b g y', 'rH g y b', 'b o b g'], factory);
  const shadow = board.clone();
  const ctx = { board, rng: createRng(9), factory, colorCount: 6 };
  const { steps } = resolveMove(ctx, { from: { r: 0, c: 0 }, to: { r: 0, c: 1 } });

  const clear = steps[1];
  assert.deepEqual(
    clear.cleared.map((e) => ({ id: e.id, cause: e.cause, wave: e.wave })),
    [
      { id: 2, cause: 'match', wave: 0 },
      { id: 5, cause: 'match', wave: 0 },
      { id: 9, cause: 'match', wave: 0 },
      { id: 10, cause: 'striped_h', wave: 1 },
      { id: 11, cause: 'striped_h', wave: 1 },
      { id: 12, cause: 'striped_h', wave: 1 },
    ],
  );
  assert.equal(clear.scoreDelta, 3 * 30 + 3 * 40);
  assert.deepEqual(clear.collected, { 0: 3, 2: 1, 3: 1, 4: 1 });

  applyStepsToBoard(shadow, steps);
  assertBoardsEqual(shadow, board);
  assertSettled(board);
});

test('colorbomb swapped with a color clears every tile of that color', () => {
  const factory = createTileFactory();
  const board = boardFrom(['r g b y', 'o * r g', 'b r g o', 'y o b r'], factory);
  const shadow = board.clone();
  const move = { from: { r: 1, c: 1 }, to: { r: 1, c: 2 } };
  assert.ok(isValidMove(board, move)); // no color match needed
  const ctx = { board, rng: createRng(4), factory, colorCount: 6 };
  const { steps, scoreDelta } = resolveMove(ctx, move);

  const clear = steps[1];
  assert.equal(clear.cascade, 0);
  assert.deepEqual(clear.groups, []);
  assert.deepEqual(
    clear.cleared.map((e) => ({ id: e.id, cause: e.cause, wave: e.wave })),
    [
      { id: 6, cause: 'colorbomb', wave: 0 },
      { id: 1, cause: 'colorbomb', wave: 1 },
      { id: 7, cause: 'colorbomb', wave: 1 },
      { id: 10, cause: 'colorbomb', wave: 1 },
      { id: 16, cause: 'colorbomb', wave: 1 },
    ],
  );
  assert.deepEqual(clear.collected, { 0: 4 });
  assert.ok(scoreDelta >= 5 * 40);

  applyStepsToBoard(shadow, steps);
  assertBoardsEqual(shadow, board);
  assertSettled(board);
});

test('striped + striped swap fires a cross at the destination', () => {
  const factory = createTileFactory();
  const board = boardFrom(['r g b y', 'o gH yV g', 'b r g o', 'y o b r'], factory);
  const shadow = board.clone();
  const move = { from: { r: 1, c: 1 }, to: { r: 1, c: 2 } };
  assert.ok(isValidMove(board, move));
  const ctx = { board, rng: createRng(11), factory, colorCount: 6 };
  const { steps } = resolveMove(ctx, move);

  const clear = steps[1];
  assert.deepEqual(
    clear.cleared.map((e) => ({ id: e.id, cause: e.cause, wave: e.wave })),
    [
      { id: 6, cause: 'combo', wave: 0 },
      { id: 7, cause: 'combo', wave: 0 },
      { id: 5, cause: 'striped_h', wave: 1 },
      { id: 8, cause: 'striped_h', wave: 1 },
      { id: 3, cause: 'striped_v', wave: 1 },
      { id: 11, cause: 'striped_v', wave: 1 },
      { id: 15, cause: 'striped_v', wave: 1 },
    ],
  );

  applyStepsToBoard(shadow, steps);
  assertBoardsEqual(shadow, board);
  assertSettled(board);
});

test('colorbomb + colorbomb clears the entire board', () => {
  const factory = createTileFactory();
  const board = boardFrom(['r g b y', 'o * * g', 'b r g o', 'y o b r'], factory);
  const shadow = board.clone();
  const ctx = { board, rng: createRng(21), factory, colorCount: 6 };
  const { steps } = resolveMove(ctx, { from: { r: 1, c: 1 }, to: { r: 1, c: 2 } });

  const clear = steps[1];
  assert.equal(clear.cleared.length, 16);
  assert.ok(clear.cleared.every((e) => e.cause === 'combo'));

  for (const p of board.positions()) {
    assert.ok(board.get(p.r, p.c).id > 16, 'every original tile was replaced');
  }
  applyStepsToBoard(shadow, steps);
  assertBoardsEqual(shadow, board);
  assertSettled(board);
});

test('wrapped + striped both detonate individually', () => {
  const factory = createTileFactory();
  const board = boardFrom(['r g b y', 'o gW yV g', 'b r g o', 'y o b r'], factory);
  const shadow = board.clone();
  const move = { from: { r: 1, c: 1 }, to: { r: 1, c: 2 } };
  assert.ok(isValidMove(board, move));
  const ctx = { board, rng: createRng(31), factory, colorCount: 6 };
  const { steps } = resolveMove(ctx, move);

  const clear = steps[1];
  const causes = new Set(clear.cleared.map((e) => e.cause));
  assert.ok(causes.has('combo') && causes.has('wrapped') && causes.has('striped_v'));
  // the two specials + wrapped 3×3 around (1,2) + column 1 → 2 + 7 + 1 unique cells
  assert.equal(clear.cleared.length, 10);

  applyStepsToBoard(shadow, steps);
  assertBoardsEqual(shadow, board);
  assertSettled(board);
});
