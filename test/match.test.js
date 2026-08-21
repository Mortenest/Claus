import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findMatches, decideSpecials } from '../src/core/match.js';
import { boardFrom, posSet, sortedPositions } from './helpers.js';

test('board without runs has no matches', () => {
  const board = boardFrom(['rgb', 'gbr', 'brg']);
  assert.deepEqual(findMatches(board), []);
});

test('horizontal 3-run is one group of three cells', () => {
  const board = boardFrom(['rrrg', 'obyp', 'gbyo']);
  const groups = findMatches(board);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].color, 0);
  assert.deepEqual(sortedPositions(groups[0].cells), [
    { r: 0, c: 0 },
    { r: 0, c: 1 },
    { r: 0, c: 2 },
  ]);
  assert.equal(decideSpecials(groups)[0].creates, null);
});

test('vertical 3-run detected including board edges', () => {
  const board = boardFrom(['rgb', 'rbg', 'ryy']);
  const groups = findMatches(board);
  assert.equal(groups.length, 1);
  assert.deepEqual(sortedPositions(groups[0].cells), [
    { r: 0, c: 0 },
    { r: 1, c: 0 },
    { r: 2, c: 0 },
  ]);
});

test('horizontal 4-run creates striped_v at the middle', () => {
  const board = boardFrom(['rrrr', 'obyp']);
  const [group] = decideSpecials(findMatches(board));
  assert.deepEqual(group.creates, { kind: 'striped_v', pos: { r: 0, c: 1 } });
});

test('vertical 4-run creates striped_h', () => {
  const board = boardFrom(['rg', 'rb', 'ro', 'rp']);
  const [group] = decideSpecials(findMatches(board));
  assert.deepEqual(group.creates, { kind: 'striped_h', pos: { r: 1, c: 0 } });
});

test('swapped cell inside the group wins over the middle', () => {
  const board = boardFrom(['rrrr', 'obyp']);
  const [group] = decideSpecials(findMatches(board), [{ r: 0, c: 3 }]);
  assert.deepEqual(group.creates, { kind: 'striped_v', pos: { r: 0, c: 3 } });
});

test('preferred position outside the group falls back to the middle', () => {
  const board = boardFrom(['rrrr', 'obyp']);
  const [group] = decideSpecials(findMatches(board), [{ r: 1, c: 0 }]);
  assert.deepEqual(group.creates, { kind: 'striped_v', pos: { r: 0, c: 1 } });
});

test('straight 5-run creates a colorbomb', () => {
  const board = boardFrom(['rrrrr']);
  const [group] = decideSpecials(findMatches(board));
  assert.deepEqual(group.creates, { kind: 'colorbomb', pos: { r: 0, c: 2 } });
});

test('6-run still creates a single colorbomb', () => {
  const board = boardFrom(['rrrrrr']);
  const groups = decideSpecials(findMatches(board));
  assert.equal(groups.length, 1);
  assert.deepEqual(groups[0].creates, { kind: 'colorbomb', pos: { r: 0, c: 2 } });
});

test('L-shape merges into one group and creates wrapped at the corner', () => {
  const board = boardFrom(['rgb', 'rby', 'rrr']);
  const groups = decideSpecials(findMatches(board));
  assert.equal(groups.length, 1);
  assert.equal(groups[0].cells.length, 5);
  assert.equal(groups[0].runs.length, 2);
  assert.deepEqual(groups[0].creates, { kind: 'wrapped', pos: { r: 2, c: 0 } });
});

test('T-shape creates wrapped at the intersection', () => {
  const board = boardFrom(['rrr', 'gry', 'brg']);
  const [group] = decideSpecials(findMatches(board));
  assert.deepEqual(group.creates, { kind: 'wrapped', pos: { r: 0, c: 1 } });
});

test('plus-shape creates wrapped at the center', () => {
  const board = boardFrom(['.r.', 'rrr', '.r.']);
  const [group] = decideSpecials(findMatches(board));
  assert.equal(group.cells.length, 5);
  assert.deepEqual(group.creates, { kind: 'wrapped', pos: { r: 1, c: 1 } });
});

test('a 5-run inside a crossing shape outranks wrapped', () => {
  const board = boardFrom(['rrrrr', 'gbryo', 'obrgy']);
  const groups = decideSpecials(findMatches(board));
  assert.equal(groups.length, 1);
  assert.deepEqual(groups[0].creates, { kind: 'colorbomb', pos: { r: 0, c: 2 } });
});

test('4-run merged with a crossing 3-run is wrapped, not striped', () => {
  const board = boardFrom(['rgb', 'rby', 'rgb', 'rrr']);
  const groups = decideSpecials(findMatches(board));
  assert.equal(groups.length, 1);
  assert.equal(groups[0].cells.length, 6);
  assert.deepEqual(groups[0].creates, { kind: 'wrapped', pos: { r: 3, c: 0 } });
});

test('two disjoint groups stay separate', () => {
  const board = boardFrom(['rrrgb', 'ooogb']);
  const groups = findMatches(board);
  assert.equal(groups.length, 2);
  const colors = groups.map((g) => g.color).sort();
  assert.deepEqual(colors, [0, 1]);
});

test('colorbombs and holes never join color runs', () => {
  const board = boardFrom(['r * r r', 'o b y p']);
  assert.deepEqual(findMatches(board), []);
  const holes = boardFrom(['r.rr', 'obyp']);
  assert.deepEqual(findMatches(holes), []);
});

test('group cells contain no duplicates', () => {
  const board = boardFrom(['.r.', 'rrr', '.r.']);
  const [group] = findMatches(board);
  assert.equal(posSet(group.cells).size, group.cells.length);
});
