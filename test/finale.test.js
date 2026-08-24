/**
 * Sweet Finish: remaining moves become striped candies that all detonate in
 * one cascade-0 chain, scored like any blast round.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveFinale } from '../src/core/resolve.js';
import { createRng } from '../src/core/rng.js';
import { Game } from '../src/core/game.js';
import {
  boardFrom,
  createTileFactory,
  scriptedRng,
  applyStepsToBoard,
  assertBoardsEqual,
  assertSettled,
  stepsOfType,
} from './helpers.js';

test('golden: two conversions detonate and settle, fully scripted', () => {
  const factory = createTileFactory();
  const board = boardFrom(['rgb', 'gbr', 'brg'], factory);
  const shadow = board.clone();
  const ctx = { board, rng: scriptedRng([0, 0, 0, 1, 2, 0, 4, 2, 5]), factory, colorCount: 6 };
  const result = resolveFinale(ctx, 2);

  assert.deepEqual(result.steps[0], {
    type: 'finale',
    conversions: [
      { pos: { r: 0, c: 0 }, tile: { id: 10, color: 0, kind: 'striped_h' }, replacedId: 1 },
      { pos: { r: 0, c: 1 }, tile: { id: 11, color: 3, kind: 'striped_v' }, replacedId: 2 },
    ],
  });
  assert.equal(result.conversions, 2);

  const clear = result.steps[1];
  assert.equal(clear.type, 'clear');
  assert.equal(clear.cascade, 0);
  assert.deepEqual(
    clear.cleared.map((e) => ({ id: e.id, cause: e.cause, wave: e.wave })),
    [
      { id: 10, cause: 'combo', wave: 0 },
      { id: 11, cause: 'combo', wave: 0 },
      { id: 3, cause: 'striped_h', wave: 1 },
      { id: 5, cause: 'striped_v', wave: 1 },
      { id: 8, cause: 'striped_v', wave: 1 },
    ],
  );
  assert.deepEqual(clear.groups, []);
  assert.equal(clear.scoreDelta, 5 * 40);
  assert.equal(result.scoreDelta, 200);
  assert.deepEqual(result.collected, { 0: 2, 3: 1, 4: 2 });

  assert.equal(stepsOfType(result.steps, 'fall').length, 0);
  const [spawnStep] = stepsOfType(result.steps, 'spawn');
  assert.equal(spawnStep.spawns.length, 5);
  assert.ok(!result.steps.some((s) => s.type === 'shuffle'));

  applyStepsToBoard(shadow, result.steps);
  assertBoardsEqual(shadow, board);
  assertSettled(board, { requireMove: false });
});

test('finale is deterministic for a seed', () => {
  const run = () => {
    const factory = createTileFactory();
    const board = boardFrom(['rgbyp', 'gbryp', 'brgpy', 'ypbgr'], factory);
    const result = resolveFinale({ board, rng: createRng(404), factory, colorCount: 6 }, 3);
    return { steps: JSON.parse(JSON.stringify(result.steps)), board: board.toString() };
  };
  assert.deepEqual(run(), run());
});

test('converts at most the surviving normal tiles', () => {
  const factory = createTileFactory();
  const board = boardFrom(['rH gV', '* b'], factory); // one normal tile
  const result = resolveFinale({ board, rng: createRng(1), factory, colorCount: 4 }, 3);
  assert.equal(result.conversions, 1);
  assert.equal(result.steps[0].conversions.length, 1);
  assert.equal(result.steps[0].conversions[0].replacedId, 4); // the b
});

test('no normals at all → no finale step', () => {
  const factory = createTileFactory();
  const board = boardFrom(['rH gV', '* yW'], factory);
  const result = resolveFinale({ board, rng: createRng(1), factory, colorCount: 4 }, 5);
  assert.equal(result.conversions, 0);
  assert.deepEqual(result.steps, []);
  assert.equal(result.scoreDelta, 0);
});

test('winning on the very last move produces no finale and no bonus', () => {
  const factory = createTileFactory();
  const board = boardFrom(['bgyp', 'bryg', 'ryrg'], factory);
  const level = {
    id: 1, name: 'T', rows: 3, cols: 4, colorCount: 6, moves: 1,
    goal: { type: 'score', target: 90 }, stars: [90, 200, 300], seedBase: 1,
  };
  const game = new Game(level, 0, { board, factory, rng: createRng(500) });
  const { steps } = game.applyMove({ from: { r: 1, c: 1 }, to: { r: 2, c: 1 } });
  assert.ok(!steps.some((s) => s.type === 'finale'));
  const end = steps.at(-1);
  assert.equal(end.outcome, 'won');
  assert.equal(end.bonus, undefined);
});

test('collect snapshots stay monotone through the finale', () => {
  const factory = createTileFactory();
  const board = boardFrom(['bgyp', 'bryg', 'ryrg'], factory);
  const level = {
    id: 1, name: 'T', rows: 3, cols: 4, colorCount: 6, moves: 6,
    goal: { type: 'collect', color: 0, count: 3 }, stars: [50, 200, 100000], seedBase: 1,
  };
  const game = new Game(level, 0, { board, factory, rng: createRng(500) });
  const { steps } = game.applyMove({ from: { r: 1, c: 1 }, to: { r: 2, c: 1 } });
  assert.equal(steps.at(-1).outcome, 'won');
  let last = 0;
  for (const clear of stepsOfType(steps, 'clear')) {
    assert.ok(clear.goal.current >= last, 'collect progress regressed');
    last = clear.goal.current;
  }
  assert.ok(game.goal.current >= 3);
});
