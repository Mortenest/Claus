/**
 * Fuzz: many seeded games of random valid moves, asserting the engine
 * invariants after every single move — the cascade-correctness insurance.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateBoard } from '../src/core/generate.js';
import { resolveMove } from '../src/core/resolve.js';
import { findValidMoves } from '../src/core/moves.js';
import { createRng } from '../src/core/rng.js';
import { createTileFactory } from '../src/core/tiles.js';
import { Game } from '../src/core/game.js';
import { applyStepsToBoard, assertBoardsEqual, assertSettled, boardIds } from './helpers.js';

const SEEDS = 100;
const MOVES_PER_GAME = 30;

test(`fuzz: ${SEEDS} seeded games × ${MOVES_PER_GAME} random moves hold all invariants`, () => {
  for (let seed = 0; seed < SEEDS; seed++) {
    const factory = createTileFactory();
    const rng = createRng(seed);
    const pickRng = createRng(seed ^ 0xabcdef);
    const board = generateBoard({ rows: 8, cols: 8, colorCount: 5 }, rng, factory);
    const shadow = board.clone();
    const seenIds = new Set(boardIds(board));
    let score = 0;

    for (let m = 0; m < MOVES_PER_GAME; m++) {
      const valid = findValidMoves(board);
      assert.ok(valid.length > 0, `seed ${seed} move ${m}: no valid moves`);
      const move = valid[pickRng.int(valid.length)];

      const ctx = { board, rng, factory, colorCount: 5, scoreStart: score };
      const { steps, scoreDelta, collected } = resolveMove(ctx, move);
      score += scoreDelta;

      // Fresh ids only, and never reused.
      for (const step of steps) {
        const born = step.type === 'spawn'
          ? step.spawns.map((s) => s.tile.id)
          : step.type === 'clear'
            ? step.created.map((c) => c.tile.id)
            : [];
        for (const id of born) {
          assert.ok(!seenIds.has(id), `seed ${seed} move ${m}: id ${id} reused`);
          seenIds.add(id);
        }
      }

      assert.ok(scoreDelta > 0, `seed ${seed} move ${m}: a valid move must score`);
      const clearedCount = Object.values(collected).reduce((a, b) => a + b, 0);
      assert.ok(clearedCount >= 2, `seed ${seed} move ${m}: too few tiles cleared`);

      applyStepsToBoard(shadow, steps);
      assertBoardsEqual(shadow, board, `seed ${seed} move ${m}: replay diverged`);
      assertSettled(board);
      boardIds(board); // asserts uniqueness on-board
    }
  }
});

const WON_GAME_SEEDS = 30;

test(`fuzz: ${WON_GAME_SEEDS} full games to the end, finale included`, () => {
  const DONUT = [
    '##....##',
    '#......#',
    '........',
    '...##...',
    '...##...',
    '........',
    '#......#',
    '##....##',
  ];
  for (let seed = 0; seed < WON_GAME_SEEDS; seed++) {
    const level = {
      id: 1,
      name: 'Fuzz',
      rows: 8,
      cols: 8,
      colorCount: 5,
      moves: 12,
      goal: { type: 'score', target: 800 },
      stars: [800, 2000, 4000],
      seedBase: 1,
      ...(seed % 2 === 1 ? { layout: DONUT } : {}),
    };
    const game = new Game(level, seed);
    const shadow = game.board.clone();
    const seenIds = new Set(boardIds(game.board));

    let guard = 0;
    while (game.status === 'playing' && guard++ < 20) {
      const hint = game.findHint();
      assert.ok(hint, `seed ${seed}: no hint on a live board`);
      const { valid, steps } = game.applyMove(hint);
      assert.ok(valid);

      for (const step of steps) {
        const born =
          step.type === 'spawn'
            ? step.spawns.map((s) => s.tile.id)
            : step.type === 'clear'
              ? step.created.map((c) => c.tile.id)
              : step.type === 'finale'
                ? step.conversions.map((c) => c.tile.id)
                : [];
        for (const id of born) {
          assert.ok(!seenIds.has(id), `seed ${seed}: id ${id} reused`);
          seenIds.add(id);
        }
      }

      const finaleIndex = steps.findIndex((s) => s.type === 'finale');
      if (finaleIndex !== -1) {
        assert.ok(
          !steps.some((s, i) => s.type === 'shuffle' && i > finaleIndex),
          `seed ${seed}: shuffle after finale`,
        );
      }

      applyStepsToBoard(shadow, steps);
      assertBoardsEqual(shadow, game.board, `seed ${seed}: replay diverged`);
    }
    assert.notEqual(game.status, 'playing', `seed ${seed}: game never ended`);
    assertSettled(game.board, { requireMove: false });
    if (game.status === 'won') {
      assert.equal(game.movesLeft, 0, `seed ${seed}: moves left after a win`);
    }
  }
});
