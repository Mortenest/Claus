/** Shared test utilities. Tests import src/core only (plus node builtins). */
import assert from 'node:assert/strict';
import { Board } from '../src/core/board.js';
import { createTileFactory, posKey } from '../src/core/tiles.js';
import { findMatches } from '../src/core/match.js';
import { findValidMoves } from '../src/core/moves.js';

export { createTileFactory };

/** Build a board from ASCII lines (see board.js grammar). */
export function boardFrom(source, factory = createTileFactory()) {
  return Board.fromString(source, factory);
}

export function stepsOfType(steps, type) {
  return steps.filter((s) => s.type === type);
}

export function posSet(cells) {
  return new Set(cells.map(posKey));
}

/** Sort positions into canonical scan order for stable comparisons. */
export function sortedPositions(cells) {
  return [...cells].sort((a, b) => a.r - b.r || a.c - b.c).map(({ r, c }) => ({ r, c }));
}

/**
 * An rng stub whose int() plays back a script — lets tests choose spawn
 * colors. Throws if the engine draws more or differently than scripted.
 */
export function scriptedRng(ints) {
  let i = 0;
  const fail = () => {
    throw new Error('scriptedRng: only int() is scripted');
  };
  return {
    int(maxExclusive) {
      if (i >= ints.length) throw new Error('scriptedRng: script exhausted');
      const v = ints[i++];
      assert.ok(v < maxExclusive, `scripted ${v} out of range ${maxExclusive}`);
      return v;
    },
    next: fail,
    pick: fail,
    shuffle: fail,
    getState: () => i,
    setState: fail,
  };
}

/**
 * Fold a step list over a board — the replay=state check. If the steps are
 * a faithful record, the result must equal the engine's board exactly.
 */
export function applyStepsToBoard(board, steps) {
  for (const step of steps) {
    switch (step.type) {
      case 'swap': {
        const a = board.get(step.a.from.r, step.a.from.c);
        const b = board.get(step.b.from.r, step.b.from.c);
        board.set(step.a.to.r, step.a.to.c, a);
        board.set(step.b.to.r, step.b.to.c, b);
        break;
      }
      case 'clear':
        for (const e of step.cleared) board.set(e.pos.r, e.pos.c, null);
        for (const c of step.created) board.set(c.pos.r, c.pos.c, c.tile);
        break;
      case 'fall':
      case 'shuffle': {
        const lifted = step.moves.map((m) => {
          const tile = board.get(m.from.r, m.from.c);
          assert.ok(tile !== null && tile.id === m.id, `move id mismatch at ${posKey(m.from)}`);
          board.set(m.from.r, m.from.c, null);
          return { m, tile };
        });
        for (const { m, tile } of lifted) {
          assert.equal(board.get(m.to.r, m.to.c), null, 'move target occupied');
          board.set(m.to.r, m.to.c, tile);
        }
        break;
      }
      case 'spawn':
        for (const s of step.spawns) {
          assert.equal(board.get(s.at.r, s.at.c), null, 'spawn target occupied');
          board.set(s.at.r, s.at.c, s.tile);
        }
        break;
      case 'reject':
      case 'moveSpent':
      case 'end':
        break;
      default:
        throw new Error(`unknown step type ${step.type}`);
    }
  }
  return board;
}

export function assertBoardsEqual(actual, expected, message = 'boards differ') {
  assert.equal(actual.rows, expected.rows, message);
  assert.equal(actual.cols, expected.cols, message);
  for (const p of actual.positions()) {
    assert.equal(actual.isHole(p.r, p.c), expected.isHole(p.r, p.c), `${message}: mask at ${posKey(p)}`);
  }
  for (const p of actual.positions()) {
    const a = actual.get(p.r, p.c);
    const e = expected.get(p.r, p.c);
    if (a === null || e === null) {
      assert.equal(a, e, `${message} at ${posKey(p)}`);
    } else {
      assert.deepEqual(
        { id: a.id, color: a.color, kind: a.kind },
        { id: e.id, color: e.color, kind: e.kind },
        `${message} at ${posKey(p)}`,
      );
    }
  }
}

/**
 * Post-move invariants: every playable cell filled, no matches, at least one
 * valid move (pass requireMove:false after a finale — the level is over).
 */
export function assertSettled(board, { requireMove = true } = {}) {
  for (const p of board.positions()) {
    if (board.isHole(p.r, p.c)) {
      assert.equal(board.get(p.r, p.c), null, `tile in a hole at ${posKey(p)}`);
    } else {
      assert.ok(board.get(p.r, p.c) !== null, `empty playable cell at ${posKey(p)}`);
    }
  }
  assert.equal(findMatches(board).length, 0, 'board has leftover matches');
  if (requireMove) {
    assert.ok(findValidMoves(board).length > 0, 'board has no valid move');
  }
}

/** All tile ids currently on the board (asserts uniqueness). */
export function boardIds(board) {
  const ids = new Set();
  for (const p of board.positions()) {
    const tile = board.get(p.r, p.c);
    if (tile !== null) {
      assert.ok(!ids.has(tile.id), `duplicate id ${tile.id}`);
      ids.add(tile.id);
    }
  }
  return ids;
}
