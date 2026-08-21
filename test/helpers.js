/** Shared test utilities. Tests import src/core only (plus node builtins). */
import { Board } from '../src/core/board.js';
import { createTileFactory, posKey } from '../src/core/tiles.js';

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
