import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/core/game.js';
import { createRng } from '../src/core/rng.js';
import {
  boardFrom,
  createTileFactory,
  stepsOfType,
  scriptedRng,
  applyStepsToBoard,
  assertBoardsEqual,
  assertSettled,
} from './helpers.js';

/**
 * Fixture game: injects a known 3×4 board (no matches, valid moves exist)
 * so tests can script exact moves.
 *
 *   b g y p      swap (1,1)r↓(2,1) clears row 2 for 90 points and
 *   b r y g      cascades once more (see resolve golden test).
 *   r y r g
 */
function fixtureGame(levelOverrides = {}, rng = createRng(500)) {
  const level = {
    id: 1,
    name: 'Test',
    rows: 3,
    cols: 4,
    colorCount: 6,
    moves: 5,
    goal: { type: 'score', target: 10000 },
    stars: [10000, 20000, 30000],
    seedBase: 1,
    ...levelOverrides,
  };
  const factory = createTileFactory();
  const board = boardFrom(['bgyp', 'bryg', 'ryrg'], factory);
  return new Game(level, 0, { board, factory, rng });
}

const GOOD_MOVE = { from: { r: 1, c: 1 }, to: { r: 2, c: 1 } };

test('a rejected swap spends nothing and emits only a reject step', () => {
  const game = fixtureGame();
  const result = game.applyMove({ from: { r: 0, c: 0 }, to: { r: 0, c: 1 } });
  assert.equal(result.valid, false);
  assert.equal(result.steps.length, 1);
  assert.deepEqual(result.steps[0], {
    type: 'reject',
    a: { id: 1, from: { r: 0, c: 0 }, to: { r: 0, c: 1 } },
    b: { id: 2, from: { r: 0, c: 1 }, to: { r: 0, c: 0 } },
    reason: 'no-match',
  });
  assert.equal(game.movesLeft, 5);
  assert.equal(game.score, 0);
  assert.equal(game.status, 'playing');
});

test('a valid move starts with moveSpent and stamps goal onto clears', () => {
  const game = fixtureGame();
  const { valid, steps } = game.applyMove(GOOD_MOVE);
  assert.ok(valid);
  assert.deepEqual(steps[0], { type: 'moveSpent', movesLeft: 4 });
  assert.equal(steps[1].type, 'swap');
  const clears = stepsOfType(steps, 'clear');
  assert.ok(clears.length >= 1);
  for (const clear of clears) {
    assert.equal(clear.goal.type, 'score');
    assert.equal(clear.goal.target, 10000);
    assert.equal(clear.goal.current, clear.scoreTotal);
  }
  assert.equal(game.movesLeft, 4);
  assert.ok(game.score >= 90);
  assert.equal(game.goal.current, game.score);
});

test('malformed moves throw (caller bug, not a reject)', () => {
  const game = fixtureGame();
  assert.throws(() => game.applyMove({ from: { r: 0, c: 0 }, to: { r: 0, c: 2 } }));
  assert.throws(() => game.applyMove({ from: { r: 0, c: 0 }, to: { r: 1, c: 1 } }));
  assert.throws(() => game.applyMove({ from: { r: 0, c: 3 }, to: { r: 0, c: 4 } }));
});

test('meeting the goal early triggers the Sweet Finish finale', () => {
  const game = fixtureGame({ goal: { type: 'score', target: 90 }, stars: [90, 200, 100000] });
  const shadow = game.board.clone();
  const { steps } = game.applyMove(GOOD_MOVE);

  const finale = steps.find((s) => s.type === 'finale');
  assert.ok(finale, 'an early win must produce a finale step');
  assert.equal(finale.conversions.length, 4); // 5 moves, 1 spent
  for (const conv of finale.conversions) {
    assert.ok(['striped_h', 'striped_v'].includes(conv.tile.kind));
    assert.ok(conv.tile.color >= 0);
    assert.notEqual(conv.tile.id, conv.replacedId);
  }
  const finaleIndex = steps.indexOf(finale);
  const detonation = steps[finaleIndex + 1];
  assert.equal(detonation.type, 'clear');
  assert.equal(detonation.cascade, 0);
  assert.ok(detonation.cleared.every((e) => e.cause !== 'match'));
  assert.ok(!steps.some((s, i) => s.type === 'shuffle' && i > finaleIndex));

  const end = steps.at(-1);
  assert.equal(end.type, 'end');
  assert.equal(end.outcome, 'won');
  assert.equal(game.status, 'won');
  assert.equal(end.bonus.movesConverted, 4);
  assert.ok(end.bonus.total >= 4 * 40, 'finale must out-earn a token bonus');
  assert.equal(end.score, game.score);
  assert.equal(game.movesLeft, 0);
  assert.ok(end.stars >= 2); // 90 + finale blasts clear ≥200 easily, 3★ out of reach
  assert.throws(() => game.applyMove(GOOD_MOVE));

  applyStepsToBoard(shadow, steps);
  assertBoardsEqual(shadow, game.board);
  assertSettled(game.board, { requireMove: false });
});

test('running out of moves without the goal loses with zero stars', () => {
  const game = fixtureGame({ moves: 1, goal: { type: 'score', target: 999999 } });
  const { steps } = game.applyMove(GOOD_MOVE);
  const end = steps.at(-1);
  assert.equal(end.type, 'end');
  assert.equal(end.outcome, 'lost');
  assert.equal(end.stars, 0);
  assert.equal(end.bonus, undefined);
  assert.equal(game.status, 'lost');
  assert.equal(game.movesLeft, 0);
});

test('collect goals count cleared tiles of the goal color', () => {
  const game = fixtureGame({ goal: { type: 'collect', color: 0, count: 3 }, stars: [50, 200, 100000] });
  const { steps } = game.applyMove(GOOD_MOVE); // clears three reds in cascade 0
  const clears = stepsOfType(steps, 'clear');
  assert.equal(clears[0].goal.type, 'collect');
  assert.equal(clears[0].goal.current, 3);
  const end = steps.at(-1);
  assert.equal(end.outcome, 'won');
  assert.ok(game.goal.current >= 3); // later cascades may collect more
});

test('collect progress ignores other colors', () => {
  // Scripted spawns (the resolve golden script) clear 3 red + 3 blue only.
  const game = fixtureGame(
    { goal: { type: 'collect', color: 5, count: 99 } },
    scriptedRng([4, 3, 3, 0, 5, 0]),
  );
  game.applyMove(GOOD_MOVE);
  assert.equal(game.goal.current, 0);
  assert.equal(game.status, 'playing');
});

test('starsForScore counts thresholds passed, boundaries inclusive', () => {
  const game = fixtureGame({ stars: [100, 200, 300] });
  assert.equal(game.starsForScore(99), 0);
  assert.equal(game.starsForScore(100), 1);
  assert.equal(game.starsForScore(199), 1);
  assert.equal(game.starsForScore(200), 2);
  assert.equal(game.starsForScore(299), 2);
  assert.equal(game.starsForScore(300), 3);
});

test('a real generated game plays a full level end to end', () => {
  const level = {
    id: 99,
    name: 'Smoke',
    rows: 8,
    cols: 8,
    colorCount: 5,
    moves: 10,
    goal: { type: 'score', target: 1500 },
    stars: [1500, 3000, 5000],
    seedBase: 7,
  };
  const game = new Game(level, 12345);
  let guard = 0;
  while (game.status === 'playing' && guard++ < 20) {
    const hint = game.findHint();
    assert.ok(hint, 'a settled board always has a hint');
    const result = game.applyMove(hint);
    assert.ok(result.valid);
  }
  assert.notEqual(game.status, 'playing');
  const total = game.score;
  assert.ok(total > 0);
  assert.ok(game.movesLeft >= 0);
});
