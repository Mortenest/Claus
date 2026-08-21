/**
 * The grid. Row 0 is the top; gravity pulls toward increasing r. Cells hold a
 * frozen Tile or null. Board is the only mutable core structure, and only the
 * engine mutates it.
 *
 * toString/fromString exist for tests: boards read/write as ASCII so a failing
 * case reproduces in one literal. Two formats:
 *  - compact (normal tiles only): one char per cell, e.g. "rgb.yp"
 *  - token (any tiles): whitespace-separated tokens per line, e.g. "r gV *"
 * Token grammar: '.'=empty, color letter (roygbp)=normal, +H/V/W suffix =
 * striped_h/striped_v/wrapped, '*'=colorbomb.
 */

import { COLOR_LETTERS, createTileFactory } from './tiles.js';

const KIND_SUFFIX = { striped_h: 'H', striped_v: 'V', wrapped: 'W' };
const SUFFIX_KIND = { H: 'striped_h', V: 'striped_v', W: 'wrapped' };

export class Board {
  constructor(rows, cols) {
    this.rows = rows;
    this.cols = cols;
    /** @type {(import('./tiles.js').Tile | null)[]} row-major */
    this.cells = new Array(rows * cols).fill(null);
  }

  index(r, c) {
    return r * this.cols + c;
  }

  inBounds(r, c) {
    return r >= 0 && r < this.rows && c >= 0 && c < this.cols;
  }

  get(r, c) {
    if (!this.inBounds(r, c)) throw new Error(`get out of bounds: ${r},${c}`);
    return this.cells[this.index(r, c)];
  }

  set(r, c, tile) {
    if (!this.inBounds(r, c)) throw new Error(`set out of bounds: ${r},${c}`);
    this.cells[this.index(r, c)] = tile;
  }

  /** Tiles are frozen, so copying the cell array is a full snapshot. */
  clone() {
    const b = new Board(this.rows, this.cols);
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

  /** Find the position of a tile id, or null. */
  find(id) {
    for (let i = 0; i < this.cells.length; i++) {
      if (this.cells[i] !== null && this.cells[i].id === id) {
        return { r: Math.floor(i / this.cols), c: i % this.cols };
      }
    }
    return null;
  }

  toString() {
    const anySpecial = this.cells.some((t) => t !== null && t.kind !== 'normal');
    const lines = [];
    for (let r = 0; r < this.rows; r++) {
      const tokens = [];
      for (let c = 0; c < this.cols; c++) {
        const t = this.get(r, c);
        if (t === null) tokens.push('.');
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
    const board = new Board(tokenRows.length, cols);
    for (let r = 0; r < tokenRows.length; r++) {
      for (let c = 0; c < cols; c++) {
        board.set(r, c, parseToken(tokenRows[r][c], factory));
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
