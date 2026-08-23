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
