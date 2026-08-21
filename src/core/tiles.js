/**
 * Tile model: colors, kinds, the id-assigning tile factory, and the scoring
 * constant table. Tiles are frozen value objects — the engine never mutates a
 * tile, it replaces it — and ids are unique and never reused within a game,
 * which is what lets a renderer track one candy across swap/fall/clear steps.
 *
 * @typedef {0|1|2|3|4|5} ColorId
 * @typedef {'normal'|'striped_h'|'striped_v'|'wrapped'|'colorbomb'} TileKind
 * @typedef {{ id: number, color: ColorId | -1, kind: TileKind }} Tile
 * @typedef {{ r: number, c: number }} Pos
 */

/** Palette order is part of the porting contract (ColorId = index). */
export const COLORS = Object.freeze(['red', 'orange', 'yellow', 'green', 'blue', 'purple']);

/** Single-letter aliases used by Board.toString/fromString test fixtures. */
export const COLOR_LETTERS = 'roygbp';

/** The color field of a colorbomb (it belongs to no color). */
export const COLORBOMB_COLOR = -1;

export const TILE_KINDS = Object.freeze(['normal', 'striped_h', 'striped_v', 'wrapped', 'colorbomb']);

/** All score arithmetic is integer; tune freely, tests import these. */
export const SCORING = Object.freeze({
  /** Per tile cleared by a plain match. */
  BASE_TILE: 30,
  /** Extra per tile, multiplied by the cascade index (0 for the swap round). */
  CASCADE_BONUS_PER_TILE: 15,
  /** Per tile cleared by any special blast (instead of BASE_TILE). */
  BLAST_TILE: 40,
  /** Awarded once per special candy created. */
  SPECIAL_CREATE: 60,
  /** Early-win bonus per unspent move. */
  WIN_MOVE_BONUS: 150,
});

/**
 * @param {number} startId first id to hand out
 * @returns {{ make(color: number, kind?: TileKind): Tile, nextId(): number }}
 */
export function createTileFactory(startId = 1) {
  let next = startId;
  return {
    make(color, kind = 'normal') {
      if (kind === 'colorbomb') {
        color = COLORBOMB_COLOR;
      } else if (!Number.isInteger(color) || color < 0 || color >= COLORS.length) {
        throw new Error(`invalid color ${color} for kind ${kind}`);
      }
      return Object.freeze({ id: next++, color, kind });
    },
    nextId: () => next,
  };
}

/** @param {Tile | null} tile */
export function isSpecial(tile) {
  return tile != null && tile.kind !== 'normal';
}

/** @param {Pos} pos */
export function posKey(pos) {
  return pos.r + ',' + pos.c;
}

/** @param {Pos} a @param {Pos} b */
export function samePos(a, b) {
  return a.r === b.r && a.c === b.c;
}

/** @param {Pos} a @param {Pos} b */
export function isAdjacent(a, b) {
  return Math.abs(a.r - b.r) + Math.abs(a.c - b.c) === 1;
}
