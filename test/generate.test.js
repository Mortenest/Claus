import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateBoard } from '../src/core/generate.js';
import { createRng } from '../src/core/rng.js';
import { createTileFactory } from '../src/core/tiles.js';
import { assertSettled, boardIds } from './helpers.js';

test('generated boards start matchless with a valid move, across many seeds', () => {
  for (let seed = 0; seed < 500; seed++) {
    const colorCount = 4 + (seed % 3);
    const board = generateBoard(
      { rows: 8, cols: 8, colorCount },
      createRng(seed),
      createTileFactory(),
    );
    assertSettled(board);
    assert.equal(boardIds(board).size, 64);
    for (const p of board.positions()) {
      const tile = board.get(p.r, p.c);
      assert.equal(tile.kind, 'normal');
      assert.ok(tile.color >= 0 && tile.color < colorCount);
    }
  }
});

test('generation is deterministic for a seed', () => {
  const make = () =>
    generateBoard({ rows: 7, cols: 9, colorCount: 5 }, createRng(1234), createTileFactory());
  assert.equal(make().toString(), make().toString());
});

test('different seeds give different boards', () => {
  const make = (seed) =>
    generateBoard({ rows: 8, cols: 8, colorCount: 5 }, createRng(seed), createTileFactory());
  assert.notEqual(make(1).toString(), make(2).toString());
});

test('rejects out-of-range color counts', () => {
  assert.throws(() => generateBoard({ rows: 8, cols: 8, colorCount: 2 }, createRng(1), createTileFactory()));
  assert.throws(() => generateBoard({ rows: 8, cols: 8, colorCount: 7 }, createRng(1), createTileFactory()));
});
