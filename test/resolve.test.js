import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveMove, applyGravity, spawnFill } from '../src/core/resolve.js';
import { createRng } from '../src/core/rng.js';
import {
  boardFrom,
  createTileFactory,
  scriptedRng,
  applyStepsToBoard,
  assertBoardsEqual,
  assertSettled,
  stepsOfType,
} from './helpers.js';

/**
 * Golden test: a hand-computed two-cascade resolution. Every step, id,
 * position, score, and rng draw is asserted literally — the executable
 * spec of the step protocol.
 */
test('golden: swap → match → fall/spawn → cascade → settle', () => {
  const factory = createTileFactory();
  const board = boardFrom(['bgyp', 'bryg', 'ryrg'], factory);
  const ctx = { board, rng: scriptedRng([4, 3, 3, 0, 5, 0]), factory, colorCount: 6 };
  const result = resolveMove(ctx, { from: { r: 1, c: 1 }, to: { r: 2, c: 1 } });

  assert.deepEqual(result.steps, [
    {
      type: 'swap',
      a: { id: 6, from: { r: 1, c: 1 }, to: { r: 2, c: 1 } },
      b: { id: 10, from: { r: 2, c: 1 }, to: { r: 1, c: 1 } },
    },
    {
      type: 'clear',
      cascade: 0,
      cleared: [
        { id: 9, pos: { r: 2, c: 0 }, color: 0, kind: 'normal', cause: 'match', wave: 0 },
        { id: 6, pos: { r: 2, c: 1 }, color: 0, kind: 'normal', cause: 'match', wave: 0 },
        { id: 11, pos: { r: 2, c: 2 }, color: 0, kind: 'normal', cause: 'match', wave: 0 },
      ],
      created: [],
      groups: [
        {
          color: 0,
          cells: [{ r: 2, c: 0 }, { r: 2, c: 1 }, { r: 2, c: 2 }],
          points: 90,
        },
      ],
      scoreDelta: 90,
      scoreTotal: 90,
      collected: { 0: 3 },
    },
    {
      type: 'fall',
      moves: [
        { id: 5, from: { r: 1, c: 0 }, to: { r: 2, c: 0 } },
        { id: 1, from: { r: 0, c: 0 }, to: { r: 1, c: 0 } },
        { id: 10, from: { r: 1, c: 1 }, to: { r: 2, c: 1 } },
        { id: 2, from: { r: 0, c: 1 }, to: { r: 1, c: 1 } },
        { id: 7, from: { r: 1, c: 2 }, to: { r: 2, c: 2 } },
        { id: 3, from: { r: 0, c: 2 }, to: { r: 1, c: 2 } },
      ],
    },
    {
      type: 'spawn',
      spawns: [
        { tile: { id: 13, color: 4, kind: 'normal' }, at: { r: 0, c: 0 }, fromRowOffset: 1 },
        { tile: { id: 14, color: 3, kind: 'normal' }, at: { r: 0, c: 1 }, fromRowOffset: 1 },
        { tile: { id: 15, color: 3, kind: 'normal' }, at: { r: 0, c: 2 }, fromRowOffset: 1 },
      ],
    },
    {
      type: 'clear',
      cascade: 1,
      cleared: [
        { id: 13, pos: { r: 0, c: 0 }, color: 4, kind: 'normal', cause: 'match', wave: 0 },
        { id: 1, pos: { r: 1, c: 0 }, color: 4, kind: 'normal', cause: 'match', wave: 0 },
        { id: 5, pos: { r: 2, c: 0 }, color: 4, kind: 'normal', cause: 'match', wave: 0 },
      ],
      created: [],
      groups: [
        {
          color: 4,
          cells: [{ r: 0, c: 0 }, { r: 1, c: 0 }, { r: 2, c: 0 }],
          points: 135,
        },
      ],
      scoreDelta: 135,
      scoreTotal: 225,
      collected: { 4: 3 },
    },
    {
      type: 'spawn',
      spawns: [
        { tile: { id: 16, color: 0, kind: 'normal' }, at: { r: 0, c: 0 }, fromRowOffset: 3 },
        { tile: { id: 17, color: 5, kind: 'normal' }, at: { r: 1, c: 0 }, fromRowOffset: 3 },
        { tile: { id: 18, color: 0, kind: 'normal' }, at: { r: 2, c: 0 }, fromRowOffset: 3 },
      ],
    },
  ]);
  assert.equal(result.scoreDelta, 225);
  assert.deepEqual(result.collected, { 0: 3, 4: 3 });
  assert.equal(board.toString(), 'rggp\npgyg\nryyg');
  assertSettled(board);
});

test('replaying the golden steps reproduces the engine board', () => {
  const factory = createTileFactory();
  const board = boardFrom(['bgyp', 'bryg', 'ryrg'], factory);
  const shadow = board.clone();
  const ctx = { board, rng: scriptedRng([4, 3, 3, 0, 5, 0]), factory, colorCount: 6 };
  const { steps } = resolveMove(ctx, { from: { r: 1, c: 1 }, to: { r: 2, c: 1 } });
  applyStepsToBoard(shadow, steps);
  assertBoardsEqual(shadow, board);
});

test('determinism: identical seed and move give byte-identical steps', () => {
  const run = () => {
    const factory = createTileFactory();
    const board = boardFrom(['bgyp', 'bryg', 'ryrg'], factory);
    const ctx = { board, rng: createRng(77), factory, colorCount: 6 };
    return resolveMove(ctx, { from: { r: 1, c: 1 }, to: { r: 2, c: 1 } });
  };
  assert.deepEqual(JSON.parse(JSON.stringify(run())), JSON.parse(JSON.stringify(run())));
});

test('a 4-run creates a striped candy at the swapped-in cell', () => {
  const factory = createTileFactory();
  const board = boardFrom(['rrbr', 'gyry', 'bogb', 'ggyg'], factory);
  const ctx = { board, rng: scriptedRng([3, 4, 1]), factory, colorCount: 6 };
  const { steps, scoreDelta } = resolveMove(ctx, { from: { r: 1, c: 2 }, to: { r: 0, c: 2 } });

  const clear = steps[1];
  assert.equal(clear.type, 'clear');
  assert.deepEqual(clear.created, [
    {
      tile: { id: 17, color: 0, kind: 'striped_v' },
      pos: { r: 0, c: 2 },
      fromCells: [{ r: 0, c: 0 }, { r: 0, c: 1 }, { r: 0, c: 3 }],
      replacedId: 7,
    },
  ]);
  assert.deepEqual(clear.cleared.map((e) => e.id), [1, 2, 4]);
  assert.equal(clear.scoreDelta, 150); // 3 × 30 + 60 creation bonus
  assert.equal(clear.groups[0].points, 150);
  assert.equal(scoreDelta, 150);

  const special = board.get(0, 2);
  assert.deepEqual({ id: special.id, kind: special.kind, color: special.color }, {
    id: 17,
    kind: 'striped_v',
    color: 0,
  });
  assert.equal(stepsOfType(steps, 'fall').length, 0); // holes were already on top
  assertSettled(board);
});

test('scoreStart threads through to scoreTotal', () => {
  const factory = createTileFactory();
  const board = boardFrom(['bgyp', 'bryg', 'ryrg'], factory);
  const ctx = { board, rng: scriptedRng([4, 3, 3, 0, 5, 0]), factory, colorCount: 6, scoreStart: 1000 };
  const { steps } = resolveMove(ctx, { from: { r: 1, c: 1 }, to: { r: 2, c: 1 } });
  const clears = stepsOfType(steps, 'clear');
  assert.equal(clears[0].scoreTotal, 1090);
  assert.equal(clears[1].scoreTotal, 1225);
});

test('applyGravity slides tiles down per column, bottom-up', () => {
  const board = boardFrom(['rg', '..', 'b.']);
  const moves = applyGravity(board);
  assert.deepEqual(moves, [
    { id: 1, from: { r: 0, c: 0 }, to: { r: 1, c: 0 } },
    { id: 2, from: { r: 0, c: 1 }, to: { r: 2, c: 1 } },
  ]);
  assert.equal(board.toString(), '..\nr.\nbg');
});

test('spawnFill fills top holes column-major with rng colors', () => {
  const factory = createTileFactory(50);
  const board = boardFrom(['..', '.g', 'br']);
  const spawns = spawnFill(board, scriptedRng([2, 5, 1]), factory, 6);
  assert.deepEqual(spawns, [
    { tile: { id: 50, color: 2, kind: 'normal' }, at: { r: 0, c: 0 }, fromRowOffset: 2 },
    { tile: { id: 51, color: 5, kind: 'normal' }, at: { r: 1, c: 0 }, fromRowOffset: 2 },
    { tile: { id: 52, color: 1, kind: 'normal' }, at: { r: 0, c: 1 }, fromRowOffset: 1 },
  ]);
  for (const p of board.positions()) assert.ok(board.get(p.r, p.c) !== null);
});
