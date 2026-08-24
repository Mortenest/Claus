/**
 * The grid. Row 0 is the top; gravity pulls toward increasing r. Cells hold a
 * frozen Tile or null. Board is the only mutable core structure, and only the
 * engine mutates it.
 *
 * Shaped boards: an optional frozen hole mask marks cells that are not part
 * of the board at all. Hole cells are permanently null — set() throws on
 * them, matches break across them (null already breaks runs), tiles fall
 * straight past them, and spawns drop in through them. "Hole" always means
 * the mask; transiently empty playable cells are "empties".
 *
 * toString/fromString exist for tests: boards read/write as ASCII so a
 * failing case reproduces in one literal (holes included). Two formats:
 *  - compact (normal tiles only): one char per cell, e.g. "rg#.yp"
 *  - token (any tiles): whitespace-separated tokens per line, e.g. "r gV #"
 * Token grammar: '.'=empty, '#'=hole, color letter (roygbp)=normal,
 * +H/V/W suffix = striped_h/striped_v/wrapped, '*'=colorbomb.
 */

import { COLOR_LETTERS, createTileFactory } from './tiles.js';

const KIND_SUFFIX = { striped_h: 'H', striped_v: 'V', wrapped: 'W' };
const SUFFIX_KIND = { H: 'striped_h', V: 'striped_v', W: 'wrapped' };

export class Board {
  /**
   * @param {number} rows
   * @param {number} cols
   * @param {ReadonlyArray<boolean> | null} [holeMask] row-major, frozen;
   *   shared by reference across clones (never mutated)
   */
  constructor(rows, cols, holeMask = null) {
    this.rows = rows;
    this.cols = cols;
    /** @type {(import('./tiles.js').Tile | null)[]} row-major */
    this.cells = new Array(rows * cols).fill(null);
    if (holeMask !== null && holeMask.length !== rows * cols) {
      throw new Error('holeMask size mismatch');
    }
    this.holeMask = holeMask;
  }

  index(r, c) {
    return r * this.cols + c;
  }

  inBounds(r, c) {
    return r >= 0 && r < this.rows && c >= 0 && c < this.cols;
  }

  /** Is this cell cut out of the board? (false everywhere on maskless boards) */
  isHole(r, c) {
    if (!this.inBounds(r, c)) throw new Error(`isHole out of bounds: ${r},${c}`);
    return this.holeMask !== null && this.holeMask[this.index(r, c)];
  }

  get(r, c) {
    if (!this.inBounds(r, c)) throw new Error(`get out of bounds: ${r},${c}`);
    return this.cells[this.index(r, c)];
  }

  set(r, c, tile) {
    if (!this.inBounds(r, c)) throw new Error(`set out of bounds: ${r},${c}`);
    if (this.isHole(r, c)) throw new Error(`set into a hole: ${r},${c}`);
    this.cells[this.index(r, c)] = tile;
  }

  /** Tiles are frozen, so copying the cell array is a full snapshot. */
  clone() {
    const b = new Board(this.rows, this.cols, this.holeMask);
    b.cells = this.cells.slice();
    return b;
  }

  /** Iterate all positions in scan order (r, then c) — the canonical order. */
  *positions() {
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        yield { r, c };
      }
    }
  }

  /** Playable cells currently on the board, scan order. */
  countPlayable() {
    let count = 0;
    for (const p of this.positions()) {
      if (!this.isHole(p.r, p.c)) count++;
    }
    return count;
  }

  /** Find the position of a tile id, or null. */
  find(id) {
    for (let i = 0; i < this.cells.length; i++) {
      if (this.cells[i] !== null && this.cells[i].id === id) {
        return { r: Math.floor(i / this.cols), c: i % this.cols };
      }
    }
    return null;
  }

  /**
   * @param {string[]} layout rows of '.'/'#', dimensions must match
   * @returns {ReadonlyArray<boolean> | null} frozen mask, or null if no holes
   */
  static maskFromLayout(layout, rows, cols) {
    if (!Array.isArray(layout) || layout.length !== rows) {
      throw new Error('layout must have one row per board row');
    }
    const mask = new Array(rows * cols).fill(false);
    let any = false;
    for (let r = 0; r < rows; r++) {
      if (typeof layout[r] !== 'string' || layout[r].length !== cols) {
        throw new Error(`layout row ${r} must have ${cols} characters`);
      }
      for (let c = 0; c < cols; c++) {
        const ch = layout[r][c];
        if (ch === '#') {
          mask[r * cols + c] = true;
          any = true;
        } else if (ch !== '.') {
          throw new Error(`layout row ${r} has bad character "${ch}"`);
        }
      }
    }
    return any ? Object.freeze(mask) : null;
  }

  toString() {
    const anySpecial = this.cells.some((t) => t !== null && t.kind !== 'normal');
    const lines = [];
    for (let r = 0; r < this.rows; r++) {
      const tokens = [];
      for (let c = 0; c < this.cols; c++) {
        const t = this.get(r, c);
        if (this.isHole(r, c)) tokens.push('#');
        else if (t === null) tokens.push('.');
        else if (t.kind === 'colorbomb') tokens.push('*');
        else tokens.push(COLOR_LETTERS[t.color] + (KIND_SUFFIX[t.kind] ?? ''));
      }
      lines.push(anySpecial ? tokens.join(' ') : tokens.join(''));
    }
    return lines.join('\n');
  }

  /**
   * @param {string | string[]} source newline-joined string or array of lines
   * @param {{ make: Function }} [factory] tile factory (fresh one by default)
   */
  static fromString(source, factory = createTileFactory()) {
    const lines = (Array.isArray(source) ? source : source.split('\n'))
      .map((l) => l.trim())
      .filter((l) => l.length > 0);
    const tokenRows = lines.map((line) => (/\s/.test(line) ? line.split(/\s+/) : [...line]));
    const cols = tokenRows[0].length;
    if (tokenRows.some((row) => row.length !== cols)) {
      throw new Error('ragged board string');
    }
    const rows = tokenRows.length;
    const mask = new Array(rows * cols).fill(false);
    let anyHole = false;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (tokenRows[r][c] === '#') {
          mask[r * cols + c] = true;
          anyHole = true;
        }
      }
    }
    const board = new Board(rows, cols, anyHole ? Object.freeze(mask) : null);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const token = tokenRows[r][c];
        if (token === '#') continue;
        board.set(r, c, parseToken(token, factory));
      }
    }
    return board;
  }
}

function parseToken(token, factory) {
  if (token === '.') return null;
  if (token === '*') return factory.make(-1, 'colorbomb');
  const color = COLOR_LETTERS.indexOf(token[0]);
  if (color === -1) throw new Error(`bad tile token "${token}"`);
  if (token.length === 1) return factory.make(color);
  const kind = SUFFIX_KIND[token[1]];
  if (!kind || token.length > 2) throw new Error(`bad tile token "${token}"`);
  return factory.make(color, kind);
}
