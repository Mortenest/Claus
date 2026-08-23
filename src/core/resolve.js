/**
 * The resolution engine. Given a valid move, mutates the board through the
 * full swap → cascade → settle sequence and returns the ordered playback
 * script the presentation layer animates. This step protocol is the porting
 * contract:
 *
 *   1. { type:'swap', a, b }            a/b: { id, from, to } (a = the moved tile)
 *   2. per cascade round n = 0, 1, …:
 *      { type:'clear', cascade:n, cleared, created, groups, scoreDelta,
 *        scoreTotal, collected }
 *        cleared: ClearedTile[] in propagation order (see specials.js)
 *        created: [{ tile, pos, fromCells, replacedId }] specials born this
 *                 round; the tile previously at pos is replaced, not cleared
 *        groups:  [{ color, cells, points }] per match group (empty for a
 *                 swap that directly activated specials)
 *        collected: { [colorId]: count } cleared per color this step
 *      { type:'fall', moves:[{ id, from, to }] }   omitted when nothing falls
 *      { type:'spawn', spawns:[{ tile, at, fromRowOffset }] }
 *      Rounds repeat until a round produces no matches. A swap of specials
 *      (see moves.isActivationSwap) makes round 0 a direct activation with
 *      no match groups.
 *   3. { type:'shuffle', moves }        only if the settled board had no
 *                                       valid move (ids preserved)
 *
 * Invariants on return: board is full, matchless, and has ≥1 valid move;
 * replaying the steps over a copy of the pre-move board reproduces the
 * post-move board exactly.
 *
 * The session layer (game.js) wraps this with moveSpent/reject/end steps and
 * goal bookkeeping.
 *
 * RNG consumption order (ports must match): spawn colors are drawn column
 * by column left→right, top→bottom within a column; reshuffle draws only
 * when it runs.
 */

import { findMatches, decideSpecials } from './match.js';
import { findValidMoves, reshuffle, swapCells, isActivationSwap } from './moves.js';
import { expandClears, activationSeeds } from './specials.js';
import { SCORING, posKey } from './tiles.js';

/**
 * @param {{
 *   board: import('./board.js').Board,
 *   rng: ReturnType<import('./rng.js').createRng>,
 *   factory: ReturnType<import('./tiles.js').createTileFactory>,
 *   colorCount: number,
 *   scoreStart?: number,
 * }} ctx
 * @param {import('./moves.js').Move} move must already be valid
 * @returns {{ steps: object[], scoreDelta: number, collected: Record<number, number> }}
 */
export function resolveMove(ctx, move) {
  const { board } = ctx;
  const steps = [];
  const totals = { scoreDelta: 0, collected: {} };
  const scoreStart = ctx.scoreStart ?? 0;

  const moverId = board.get(move.from.r, move.from.c).id;
  const partnerId = board.get(move.to.r, move.to.c).id;
  const activation = isActivationSwap(board, move);
  swapCells(board, move.from, move.to);
  steps.push({
    type: 'swap',
    a: { id: moverId, from: pos(move.from), to: pos(move.to) },
    b: { id: partnerId, from: pos(move.to), to: pos(move.from) },
  });

  let cascade = 0;
  if (activation) {
    const cleared = expandClears(board, activationSeeds(board, move.from, move.to));
    pushClearRound(ctx, steps, totals, scoreStart, { cascade, cleared, groups: [], created: [] });
    cascade = 1;
  }

  for (;;) {
    const groups = decideSpecials(
      findMatches(board),
      cascade === 0 ? [move.to, move.from] : [],
    );
    if (groups.length === 0) break;

    const protectedKeys = new Set(
      groups.filter((g) => g.creates !== null).map((g) => posKey(g.creates.pos)),
    );
    const seeds = [];
    for (const group of groups) {
      for (const cell of group.cells) {
        if (!protectedKeys.has(posKey(cell))) {
          seeds.push({ pos: cell, cause: 'match', wave: 0 });
        }
      }
    }
    const cleared = expandClears(board, seeds, protectedKeys);
    const created = groups
      .filter((g) => g.creates !== null)
      .map((g) => ({
        tile: ctx.factory.make(g.creates.kind === 'colorbomb' ? -1 : g.color, g.creates.kind),
        pos: pos(g.creates.pos),
        fromCells: g.cells
          .filter((cell) => !(cell.r === g.creates.pos.r && cell.c === g.creates.pos.c))
          .map(pos),
        replacedId: board.get(g.creates.pos.r, g.creates.pos.c).id,
      }));
    pushClearRound(ctx, steps, totals, scoreStart, { cascade, cleared, groups, created });
    cascade++;
  }

  if (findValidMoves(board).length === 0) {
    steps.push({ type: 'shuffle', moves: reshuffle(board, ctx.rng) });
  }
  return { steps, scoreDelta: totals.scoreDelta, collected: totals.collected };
}

function pos(p) {
  return { r: p.r, c: p.c };
}

/** Score + apply one clear round to the board, then gravity and spawns. */
function pushClearRound(ctx, steps, totals, scoreStart, round) {
  const { cascade, cleared, groups, created } = round;
  const perTileBonus = SCORING.CASCADE_BONUS_PER_TILE * cascade;
  const tileValue = (entry) =>
    (entry.cause === 'match' ? SCORING.BASE_TILE : SCORING.BLAST_TILE) + perTileBonus;

  let scoreDelta = created.length * SCORING.SPECIAL_CREATE;
  const collected = {};
  for (const entry of cleared) {
    scoreDelta += tileValue(entry);
    if (entry.color >= 0) collected[entry.color] = (collected[entry.color] ?? 0) + 1;
  }

  const clearedKeys = new Set(cleared.map((e) => posKey(e.pos)));
  const groupInfos = groups.map((g) => {
    const clearedCells = g.cells.filter((cell) => clearedKeys.has(posKey(cell)));
    const points =
      clearedCells.length * (SCORING.BASE_TILE + perTileBonus) +
      (g.creates !== null ? SCORING.SPECIAL_CREATE : 0);
    return { color: g.color, cells: g.cells.map(pos), points };
  });

  for (const entry of cleared) ctx.board.set(entry.pos.r, entry.pos.c, null);
  for (const c of created) ctx.board.set(c.pos.r, c.pos.c, c.tile);

  totals.scoreDelta += scoreDelta;
  for (const [color, count] of Object.entries(collected)) {
    totals.collected[color] = (totals.collected[color] ?? 0) + count;
  }

  steps.push({
    type: 'clear',
    cascade,
    cleared,
    created,
    groups: groupInfos,
    scoreDelta,
    scoreTotal: scoreStart + totals.scoreDelta,
    collected,
  });

  const falls = applyGravity(ctx.board);
  if (falls.length > 0) steps.push({ type: 'fall', moves: falls });
  const spawns = spawnFill(ctx.board, ctx.rng, ctx.factory, ctx.colorCount);
  if (spawns.length > 0) steps.push({ type: 'spawn', spawns });
}

/**
 * Slide every tile straight down into the holes below it.
 * Emitted per column left→right, bottom-up within the column.
 */
export function applyGravity(board) {
  const moves = [];
  for (let c = 0; c < board.cols; c++) {
    let write = board.rows - 1;
    for (let r = board.rows - 1; r >= 0; r--) {
      const tile = board.get(r, c);
      if (tile === null) continue;
      if (write !== r) {
        board.set(write, c, tile);
        board.set(r, c, null);
        moves.push({ id: tile.id, from: { r, c }, to: { r: write, c } });
      }
      write--;
    }
  }
  return moves;
}

/**
 * Fill the holes left at the top of each column with fresh tiles.
 * fromRowOffset is the column's spawn count, so a renderer can start the
 * whole batch stacked that many rows above the board and drop it in
 * formation.
 */
export function spawnFill(board, rng, factory, colorCount) {
  const spawns = [];
  for (let c = 0; c < board.cols; c++) {
    let holes = 0;
    while (holes < board.rows && board.get(holes, c) === null) holes++;
    for (let r = 0; r < holes; r++) {
      const tile = factory.make(rng.int(colorCount));
      board.set(r, c, tile);
      spawns.push({ tile, at: { r, c }, fromRowOffset: holes });
    }
  }
  return spawns;
}
