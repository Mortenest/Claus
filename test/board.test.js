import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Board } from '../src/core/board.js';
import { createTileFactory } from '../src/core/tiles.js';
import { boardFrom } from './helpers.js';

test('get/set/inBounds/index basics', () => {
  const board = new Board(3, 4);
  const factory = createTileFactory();
  assert.equal(board.rows, 3);
  assert.equal(board.cols, 4);
  assert.ok(board.inBounds(0, 0) && board.inBounds(2, 3));
  assert.ok(!board.inBounds(-1, 0) && !board.inBounds(3, 0) && !board.inBounds(0, 4));
  assert.equal(board.index(1, 2), 6);

  const tile = factory.make(2);
  board.set(1, 2, tile);
  assert.equal(board.get(1, 2), tile);
  assert.equal(board.get(0, 0), null);
  assert.throws(() => board.get(3, 0));
  assert.throws(() => board.set(0, 4, tile));
});

test('clone is independent of the original', () => {
  const factory = createTileFactory();
  const board = new Board(2, 2);
  board.set(0, 0, factory.make(0));
  const copy = board.clone();
  copy.set(0, 0, factory.make(1));
  copy.set(1, 1, factory.make(2));
  assert.equal(board.get(0, 0).color, 0);
  assert.equal(board.get(1, 1), null);
});

test('compact string round-trip', () => {
  const text = 'rgb.\nyprg\n..bo';
  const board = boardFrom(text);
  assert.equal(board.toString(), text);
  assert.equal(board.get(0, 0).color, 0);
  assert.equal(board.get(0, 3), null);
  assert.equal(board.get(2, 3).color, 1);
});

test('token string round-trip with specials', () => {
  const text = 'r gV *\nyW b .';
  const board = boardFrom(text);
  assert.equal(board.get(0, 1).kind, 'striped_v');
  assert.equal(board.get(0, 1).color, 3);
  assert.equal(board.get(0, 2).kind, 'colorbomb');
  assert.equal(board.get(0, 2).color, -1);
  assert.equal(board.get(1, 0).kind, 'wrapped');
  assert.equal(board.get(1, 1).kind, 'normal');
  assert.equal(board.get(1, 2), null);
  assert.equal(board.toString(), text);
});

test('fromString assigns unique ids via the shared factory', () => {
  const factory = createTileFactory(100);
  const board = boardFrom('rr\ngg', factory);
  const ids = [...board.positions()].map((p) => board.get(p.r, p.c).id);
  assert.deepEqual(ids, [100, 101, 102, 103]);
  assert.equal(factory.nextId(), 104);
});

test('fromString rejects ragged and bad input', () => {
  assert.throws(() => boardFrom('rg\nr'));
  assert.throws(() => boardFrom('rx'));
  assert.throws(() => boardFrom('rQ gg gg'));
});

test('find locates a tile by id', () => {
  const factory = createTileFactory();
  const board = boardFrom('rg\nby', factory);
  const tile = board.get(1, 0);
  assert.deepEqual(board.find(tile.id), { r: 1, c: 0 });
  assert.equal(board.find(9999), null);
});
