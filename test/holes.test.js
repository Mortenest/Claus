/**
 * Shaped boards: the hole mask, gravity past holes, spawn fill with the
 * generalized fromRowOffset, resolution across shaped fixtures, generation,
 * reshuffle, game threading — and a shaped fuzz.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Board } from '../src/core/board.js';
import { resolveMove, applyGravity, spawnFill } from '../src/core/resolve.js';
import { expandClears } from '../src/core/specials.js';
import { generateBoard } from '../src/core/generate.js';
import { findValidMoves, reshuffle } from '../src/core/moves.js';
import { Game } from '../src/core/game.js';
import { createRng } from '../src/core/rng.js';
import {
  boardFrom,
  createTileFactory,
  scriptedRng,
  applyStepsToBoard,
  assertBoardsEqual,
  assertSettled,
  boardIds,
} from './helpers.js';

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

test('holes round-trip through both string formats', () => {
  const compact = 'r#g\nb.y';
  const board = boardFrom(compact);
  assert.ok(board.isHole(0, 1));
  assert.ok(!board.isHole(1, 1));
  assert.equal(board.get(0, 1), null);
  assert.equal(board.toString(), compact);

  const tokens = 'r # gV\n* b .';
  const shaped = boardFrom(tokens);
  assert.ok(shaped.isHole(0, 1));
  assert.equal(shaped.toString(), tokens);
});

test('set into a hole throws, for tiles and for null', () => {
  const factory = createTileFactory();
  const board = boardFrom('r#\nbg', factory);
  assert.throws(() => board.set(0, 1, factory.make(0)));
  assert.throws(() => board.set(0, 1, null));
  board.set(0, 0, null); // playable cells still settable
});

test('clone preserves the mask', () => {
  const board = boardFrom('r#g\nb.y');
  const copy = board.clone();
  assert.ok(copy.isHole(0, 1));
  assertBoardsEqual(copy, board);
  assert.equal(copy.countPlayable(), 5);
});

test('maskFromLayout validates dimensions and characters', () => {
  assert.equal(Board.maskFromLayout(['..', '..'], 2, 2), null); // no holes → null
  const mask = Board.maskFromLayout(['#.', '.#'], 2, 2);
  assert.deepEqual([...mask], [true, false, false, true]);
  assert.ok(Object.isFrozen(mask));
  assert.throws(() => Board.maskFromLayout(['..'], 2, 2)); // wrong row count
  assert.throws(() => Board.maskFromLayout(['...', '...'], 2, 2)); // wrong width
  assert.throws(() => Board.maskFromLayout(['.x', '..'], 2, 2)); // bad char
});

test('gravity slides tiles past holes, counting raw rows', () => {
  const board = boardFrom('gr\n#.\n..\n..');
  const moves = applyGravity(board);
  assert.deepEqual(moves, [
    { id: 1, from: { r: 0, c: 0 }, to: { r: 3, c: 0 } },
    { id: 2, from: { r: 0, c: 1 }, to: { r: 3, c: 1 } },
  ]);
  assert.equal(board.toString(), '..\n#.\n..\ngr');
});

test('spawnFill fills empties around holes with generalized offsets', () => {
  // column rows: empty, hole, empty, tile — targets 0 and 2
  const factory = createTileFactory(50);
  const board = boardFrom('.\n#\n.\nr');
  const spawns = spawnFill(board, scriptedRng([2, 4]), factory, 6);
  assert.deepEqual(spawns, [
    { tile: { id: 50, color: 2, kind: 'normal' }, at: { r: 0, c: 0 }, fromRowOffset: 2 },
    { tile: { id: 51, color: 4, kind: 'normal' }, at: { r: 2, c: 0 }, fromRowOffset: 3 },
  ]);
  assertSettled(board, { requireMove: false });
});

test('golden: full resolution on a shaped board (fall through the hole)', () => {
  const factory = createTileFactory();
  const board = boardFrom(['gbyg', 'ryby', '#yrb', 'rrgy'], factory);
  const shadow = board.clone();
  const ctx = { board, rng: scriptedRng([4, 5, 0]), factory, colorCount: 6 };
  const result = resolveMove(ctx, { from: { r: 2, c: 2 }, to: { r: 3, c: 2 } });

  assert.deepEqual(result.steps, [
    {
      type: 'swap',
      a: { id: 10, from: { r: 2, c: 2 }, to: { r: 3, c: 2 } },
      b: { id: 14, from: { r: 3, c: 2 }, to: { r: 2, c: 2 } },
    },
    {
      type: 'clear',
      cascade: 0,
      cleared: [
        { id: 12, pos: { r: 3, c: 0 }, color: 0, kind: 'normal', cause: 'match', wave: 0 },
        { id: 13, pos: { r: 3, c: 1 }, color: 0, kind: 'normal', cause: 'match', wave: 0 },
        { id: 10, pos: { r: 3, c: 2 }, color: 0, kind: 'normal', cause: 'match', wave: 0 },
      ],
      created: [],
      groups: [
        { color: 0, cells: [{ r: 3, c: 0 }, { r: 3, c: 1 }, { r: 3, c: 2 }], points: 90 },
      ],
      scoreDelta: 90,
      scoreTotal: 90,
      collected: { 0: 3 },
    },
    {
      type: 'fall',
      moves: [
        { id: 5, from: { r: 1, c: 0 }, to: { r: 3, c: 0 } }, // through the hole at (2,0)
        { id: 1, from: { r: 0, c: 0 }, to: { r: 1, c: 0 } },
        { id: 9, from: { r: 2, c: 1 }, to: { r: 3, c: 1 } },
        { id: 6, from: { r: 1, c: 1 }, to: { r: 2, c: 1 } },
        { id: 2, from: { r: 0, c: 1 }, to: { r: 1, c: 1 } },
        { id: 14, from: { r: 2, c: 2 }, to: { r: 3, c: 2 } },
        { id: 7, from: { r: 1, c: 2 }, to: { r: 2, c: 2 } },
        { id: 3, from: { r: 0, c: 2 }, to: { r: 1, c: 2 } },
      ],
    },
    {
      type: 'spawn',
      spawns: [
        { tile: { id: 16, color: 4, kind: 'normal' }, at: { r: 0, c: 0 }, fromRowOffset: 1 },
        { tile: { id: 17, color: 5, kind: 'normal' }, at: { r: 0, c: 1 }, fromRowOffset: 1 },
        { tile: { id: 18, color: 0, kind: 'normal' }, at: { r: 0, c: 2 }, fromRowOffset: 1 },
      ],
    },
  ]);
  assert.equal(board.toString(), 'bprg\ngbyy\n#ybb\nrygy');
  applyStepsToBoard(shadow, result.steps);
  assertBoardsEqual(shadow, board);
  assertSettled(board);
});

test('striped and wrapped blasts pass over holes', () => {
  const striped = boardFrom(['y b g', '# o p', 'rV g o']);
  const cleared = expandClears(striped, [{ pos: { r: 2, c: 0 }, cause: 'match', wave: 0 }]);
  assert.deepEqual(cleared.map((e) => e.pos), [{ r: 2, c: 0 }, { r: 0, c: 0 }]);

  const wrapped = boardFrom(['# b g', 'r gW p', 'b g o']);
  const boom = expandClears(wrapped, [{ pos: { r: 1, c: 1 }, cause: 'match', wave: 0 }]);
  assert.equal(boom.length, 8); // 3×3 minus the hole
});

test('shaped generation settles across many seeds', () => {
  for (let seed = 0; seed < 100; seed++) {
    const board = generateBoard(
      { rows: 8, cols: 8, colorCount: 5, layout: DONUT },
      createRng(seed),
      createTileFactory(),
    );
    assertSettled(board);
    assert.equal(board.countPlayable(), 48);
    assert.equal(boardIds(board).size, 48);
    for (const move of findValidMoves(board)) {
      assert.ok(!board.isHole(move.from.r, move.from.c));
      assert.ok(!board.isHole(move.to.r, move.to.c));
    }
  }
});

test('reshuffle on a shaped board keeps ids and leaves holes empty', () => {
  const board = generateBoard(
    { rows: 8, cols: 8, colorCount: 5, layout: DONUT },
    createRng(7),
    createTileFactory(),
  );
  const before = boardIds(board);
  reshuffle(board, createRng(99));
  assertSettled(board);
  assert.deepEqual(boardIds(board), before);
});

test('Game threads the layout and rejects hole-endpoint moves', () => {
  const level = {
    id: 90,
    name: 'Shaped',
    rows: 8,
    cols: 8,
    colorCount: 5,
    moves: 10,
    goal: { type: 'score', target: 100000 },
    stars: [100000, 200000, 300000],
    seedBase: 5,
    layout: DONUT,
  };
  const game = new Game(level, 42);
  assert.ok(game.board.isHole(0, 0));
  assert.throws(() => game.applyMove({ from: { r: 0, c: 0 }, to: { r: 0, c: 1 } }));
  assert.throws(() => game.applyMove({ from: { r: 3, c: 2 }, to: { r: 3, c: 3 } })); // into center hole
  const hint = game.findHint();
  assert.ok(hint);
  assert.ok(game.applyMove(hint).valid);
});

test(`shaped fuzz: donut games hold all invariants`, () => {
  for (let seed = 0; seed < 50; seed++) {
    const factory = createTileFactory();
    const rng = createRng(seed);
    const pickRng = createRng(seed ^ 0x5eed);
    const board = generateBoard({ rows: 8, cols: 8, colorCount: 5, layout: DONUT }, rng, factory);
    const shadow = board.clone();

    for (let m = 0; m < 30; m++) {
      const valid = findValidMoves(board);
      assert.ok(valid.length > 0, `seed ${seed} move ${m}: no valid moves`);
      const move = valid[pickRng.int(valid.length)];
      const { steps } = resolveMove({ board, rng, factory, colorCount: 5 }, move);

      for (const step of steps) {
        const touched = [];
        if (step.type === 'clear') touched.push(...step.cleared.map((e) => e.pos));
        if (step.type === 'fall' || step.type === 'shuffle') {
          touched.push(...step.moves.flatMap((mv) => [mv.from, mv.to]));
        }
        if (step.type === 'spawn') touched.push(...step.spawns.map((s) => s.at));
        for (const p of touched) {
          assert.ok(!board.isHole(p.r, p.c), `seed ${seed} move ${m}: step touches a hole`);
        }
      }

      applyStepsToBoard(shadow, steps);
      assertBoardsEqual(shadow, board, `seed ${seed} move ${m}: replay diverged`);
      assertSettled(board);
    }
  }
});
