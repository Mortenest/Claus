/**
 * Special-candy effects: blast areas, swap-activation seeding, and the BFS
 * chain reaction. All clearing in a round is expressed as "seeds" — cells to
 * clear with a cause and a wave (chain depth) — and expandClears grows that
 * set: any special tile that gets cleared detonates, enqueueing its blast
 * cells at wave+1. A cell is claimed at most once (first cause wins), and
 * seeds are processed FIFO, so direct match cells always claim before blasts.
 *
 * Blasts: striped_h clears its row, striped_v its column, wrapped a 3×3
 * area, and a chained colorbomb clears the most common color still on the
 * board (ties → lowest color id).
 *
 * @typedef {{
 *   pos: import('./tiles.js').Pos,
 *   cause: 'match'|'striped_h'|'striped_v'|'wrapped'|'colorbomb'|'combo',
 *   wave: number,
 *   sourcePos?: import('./tiles.js').Pos,
 *   suppress?: boolean,
 * }} ClearSeed
 * @typedef {{
 *   id: number, pos: import('./tiles.js').Pos, color: number,
 *   kind: import('./tiles.js').TileKind, cause: ClearSeed['cause'],
 *   wave: number, sourcePos?: import('./tiles.js').Pos,
 * }} ClearedTile
 */

import { posKey } from './tiles.js';

/**
 * Expand seeds through special chain reactions.
 * @param {import('./board.js').Board} board
 * @param {ClearSeed[]} seeds
 * @param {Set<string>} protectedKeys posKeys that must survive this round
 *   (cells where a new special is being created)
 * @returns {ClearedTile[]} in claim (propagation) order
 */
export function expandClears(board, seeds, protectedKeys = new Set()) {
  const claimed = new Set();
  const queue = seeds.slice();
  const cleared = [];
  while (queue.length > 0) {
    const seed = queue.shift();
    const key = posKey(seed.pos);
    if (claimed.has(key) || protectedKeys.has(key)) continue;
    const tile = board.get(seed.pos.r, seed.pos.c);
    if (tile === null) continue;
    claimed.add(key);
    const entry = {
      id: tile.id,
      pos: { r: seed.pos.r, c: seed.pos.c },
      color: tile.color,
      kind: tile.kind,
      cause: seed.cause,
      wave: seed.wave,
    };
    if (seed.sourcePos) entry.sourcePos = { r: seed.sourcePos.r, c: seed.sourcePos.c };
    cleared.push(entry);
    if (tile.kind !== 'normal' && !seed.suppress) {
      queue.push(...detonationSeeds(board, seed.pos, tile, seed.wave + 1, claimed, protectedKeys));
    }
  }
  return cleared;
}

/** Blast seeds for one special detonating at pos. */
function detonationSeeds(board, pos, tile, wave, claimed, protectedKeys) {
  const seeds = [];
  const add = (r, c, cause) => {
    if (!board.inBounds(r, c)) return;
    if (r === pos.r && c === pos.c) return;
    seeds.push({ pos: { r, c }, cause, wave, sourcePos: { r: pos.r, c: pos.c } });
  };
  if (tile.kind === 'striped_h') {
    for (let c = 0; c < board.cols; c++) add(pos.r, c, 'striped_h');
  } else if (tile.kind === 'striped_v') {
    for (let r = 0; r < board.rows; r++) add(r, pos.c, 'striped_v');
  } else if (tile.kind === 'wrapped') {
    for (let r = pos.r - 1; r <= pos.r + 1; r++) {
      for (let c = pos.c - 1; c <= pos.c + 1; c++) add(r, c, 'wrapped');
    }
  } else if (tile.kind === 'colorbomb') {
    const color = mostCommonColor(board, claimed, protectedKeys);
    if (color !== null) {
      for (const p of board.positions()) {
        const t = board.get(p.r, p.c);
        if (t !== null && t.color === color && !claimed.has(posKey(p))) {
          add(p.r, p.c, 'colorbomb');
        }
      }
    }
  }
  return seeds;
}

/** Most common color among unclaimed, unprotected tiles; ties → lowest id. */
function mostCommonColor(board, claimed, protectedKeys) {
  const counts = new Map();
  for (const p of board.positions()) {
    const tile = board.get(p.r, p.c);
    if (tile === null || tile.color < 0) continue;
    const key = posKey(p);
    if (claimed.has(key) || protectedKeys.has(key)) continue;
    counts.set(tile.color, (counts.get(tile.color) ?? 0) + 1);
  }
  let best = null;
  for (const [color, count] of counts) {
    if (best === null || count > best.count || (count === best.count && color < best.color)) {
      best = { color, count };
    }
  }
  return best === null ? null : best.color;
}

/**
 * Seeds for a swap that activates specials directly (already physically
 * swapped on the board; `to` is the cell the player moved toward, which is
 * where combined effects center).
 *
 *   colorbomb + colorbomb → clear the whole board
 *   colorbomb + tile      → clear every tile of that color (specials chain)
 *   striped + striped     → cross: full row + column through `to`
 *   other special pairs   → both detonate individually in place
 *
 * @returns {ClearSeed[]}
 */
export function activationSeeds(board, from, to) {
  const mover = board.get(to.r, to.c);
  const partner = board.get(from.r, from.c);
  const seedAt = (pos, extra) => ({ pos: { r: pos.r, c: pos.c }, cause: 'combo', wave: 0, ...extra });

  if (mover.kind === 'colorbomb' && partner.kind === 'colorbomb') {
    const seeds = [seedAt(to, { suppress: true }), seedAt(from, { suppress: true })];
    for (const p of board.positions()) {
      if ((p.r === to.r && p.c === to.c) || (p.r === from.r && p.c === from.c)) continue;
      seeds.push({ pos: { r: p.r, c: p.c }, cause: 'combo', wave: 1, sourcePos: { r: to.r, c: to.c } });
    }
    return seeds;
  }

  if (mover.kind === 'colorbomb' || partner.kind === 'colorbomb') {
    const bombPos = mover.kind === 'colorbomb' ? to : from;
    const other = mover.kind === 'colorbomb' ? partner : mover;
    const seeds = [seedAt(bombPos, { cause: 'colorbomb', suppress: true })];
    for (const p of board.positions()) {
      const tile = board.get(p.r, p.c);
      if (tile !== null && tile.color === other.color) {
        seeds.push({
          pos: { r: p.r, c: p.c },
          cause: 'colorbomb',
          wave: 1,
          sourcePos: { r: bombPos.r, c: bombPos.c },
        });
      }
    }
    return seeds;
  }

  const striped = (t) => t.kind === 'striped_h' || t.kind === 'striped_v';
  if (striped(mover) && striped(partner)) {
    const seeds = [seedAt(to, { suppress: true }), seedAt(from, { suppress: true })];
    const source = { r: to.r, c: to.c };
    for (let c = 0; c < board.cols; c++) {
      if (c !== to.c) seeds.push({ pos: { r: to.r, c }, cause: 'striped_h', wave: 1, sourcePos: source });
    }
    for (let r = 0; r < board.rows; r++) {
      if (r !== to.r) seeds.push({ pos: { r, c: to.c }, cause: 'striped_v', wave: 1, sourcePos: source });
    }
    return seeds;
  }

  return [seedAt(to, {}), seedAt(from, {})];
}
