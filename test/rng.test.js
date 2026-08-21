import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRng, deriveSeed } from '../src/core/rng.js';

test('same seed produces the identical sequence', () => {
  const a = createRng(12345);
  const b = createRng(12345);
  for (let i = 0; i < 100; i++) assert.equal(a.next(), b.next());
});

test('different seeds diverge', () => {
  const a = createRng(1);
  const b = createRng(2);
  const seqA = Array.from({ length: 10 }, () => a.next());
  const seqB = Array.from({ length: 10 }, () => b.next());
  assert.notDeepEqual(seqA, seqB);
});

test('next() stays in [0, 1)', () => {
  const rng = createRng(999);
  for (let i = 0; i < 10000; i++) {
    const v = rng.next();
    assert.ok(v >= 0 && v < 1, `out of range: ${v}`);
  }
});

test('int(n) covers [0, n) and every value occurs', () => {
  const rng = createRng(7);
  const counts = new Array(6).fill(0);
  for (let i = 0; i < 6000; i++) {
    const v = rng.int(6);
    assert.ok(Number.isInteger(v) && v >= 0 && v < 6);
    counts[v]++;
  }
  for (const c of counts) assert.ok(c > 0, 'all values reachable');
});

test('state save/restore resumes the identical stream', () => {
  const rng = createRng(42);
  rng.next();
  rng.next();
  const state = rng.getState();
  const ahead = [rng.next(), rng.next(), rng.int(100)];
  rng.setState(state);
  assert.deepEqual([rng.next(), rng.next(), rng.int(100)], ahead);
});

test('shuffle is a deterministic permutation and does not mutate input', () => {
  const input = [1, 2, 3, 4, 5, 6, 7, 8];
  const a = createRng(5).shuffle(input);
  const b = createRng(5).shuffle(input);
  assert.deepEqual(a, b);
  assert.deepEqual(input, [1, 2, 3, 4, 5, 6, 7, 8]);
  assert.deepEqual([...a].sort((x, y) => x - y), input);
});

test('pick selects a member', () => {
  const rng = createRng(3);
  const arr = ['a', 'b', 'c'];
  for (let i = 0; i < 50; i++) assert.ok(arr.includes(rng.pick(arr)));
});

test('deriveSeed is deterministic and attempt-sensitive', () => {
  assert.equal(deriveSeed(0xc1a05001, 0), deriveSeed(0xc1a05001, 0));
  assert.notEqual(deriveSeed(0xc1a05001, 0), deriveSeed(0xc1a05001, 1));
  const s = deriveSeed(0xffffffff, 12345);
  assert.ok(Number.isInteger(s) && s >= 0 && s <= 0xffffffff);
});
