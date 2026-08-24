/**
 * Canvas board renderer. Owns the pixel side of the world: DPR-aware canvas
 * sizing, grid↔pixel math, and drawing the visual tile map every frame.
 *
 * Visual tiles live in CELL units (grid coordinates, fractional during
 * animation), so tweens are resolution-independent and a resize never has to
 * touch them. Each visual: { id, color, kind, row, col, scaleX, scaleY,
 * alpha, wobbleUntil }. The playback layer mutates visuals; the renderer
 * only reads them.
 */

export function createRenderer(canvas, sprites) {
  const ctx = canvas.getContext('2d');
  /** @type {Map<number, object>} id → visual */
  const visuals = new Map();
  const state = {
    rows: 0,
    cols: 0,
    cell: 0, // css px per cell
    dpr: 1,
    selection: null, // {r, c} | null
    shake: { amp: 0, until: 0 },
    isHole: () => false, // shaped boards: cells cut out of the board
    glint: null, // { row, col, start } — idle shine sweep over one candy
    nextGlintAt: 0,
  };

  function setBoardSize(rows, cols, isHole = null) {
    state.rows = rows;
    state.cols = cols;
    state.isHole = isHole ?? (() => false);
  }

  /** Fit the canvas to its parent box; rebuild sprite cache at the new size. */
  function resize() {
    const box = canvas.parentElement.getBoundingClientRect();
    if (state.rows === 0 || box.width === 0 || box.height === 0) return;
    state.dpr = Math.min(globalThis.devicePixelRatio || 1, 3);
    state.cell = Math.max(
      10,
      Math.floor(Math.min((box.width - 4) / state.cols, (box.height - 4) / state.rows)),
    );
    const cssW = state.cell * state.cols;
    const cssH = state.cell * state.rows;
    canvas.style.width = `${cssW}px`;
    canvas.style.height = `${cssH}px`;
    canvas.width = Math.round(cssW * state.dpr);
    canvas.height = Math.round(cssH * state.dpr);
    ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
    sprites.clear();
  }

  /** Center of a cell in css px (fractional rows/cols fine). */
  function cellCenter(row, col) {
    return { x: (col + 0.5) * state.cell, y: (row + 0.5) * state.cell };
  }

  /** Cell under a css-px point relative to the canvas, or null. */
  function cellAt(x, y) {
    const c = Math.floor(x / state.cell);
    const r = Math.floor(y / state.cell);
    return r >= 0 && r < state.rows && c >= 0 && c < state.cols ? { r, c } : null;
  }

  function makeVisual(tile, row, col) {
    return {
      id: tile.id,
      color: tile.color,
      kind: tile.kind,
      row,
      col,
      scaleX: 1,
      scaleY: 1,
      alpha: 1,
      wobbleUntil: 0,
    };
  }

  /** Rebuild the visual map 1:1 from a board (initial paint, debug resync). */
  function syncFromBoard(board) {
    visuals.clear();
    for (const p of board.positions()) {
      const tile = board.get(p.r, p.c);
      if (tile !== null) visuals.set(tile.id, makeVisual(tile, p.r, p.c));
    }
  }

  function draw(now) {
    const { cell } = state;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (state.rows === 0 || cell === 0) return;

    ctx.save();
    if (state.shake.until > now && state.shake.amp > 0) {
      const t = now / 28;
      ctx.translate(Math.sin(t * 1.9) * state.shake.amp, Math.cos(t * 2.3) * state.shake.amp * 0.8);
    }

    const wellSprite = sprites.well(Math.round(cell * state.dpr));
    for (let r = 0; r < state.rows; r++) {
      for (let c = 0; c < state.cols; c++) {
        if (state.isHole(r, c)) continue;
        ctx.drawImage(wellSprite, c * cell, r * cell, cell, cell);
      }
    }

    if (state.selection) {
      const { x, y } = cellCenter(state.selection.r, state.selection.c);
      const pulse = 1 + Math.sin(now / 180) * 0.05;
      ctx.strokeStyle = 'rgba(255, 246, 251, 0.9)';
      ctx.lineWidth = cell * 0.06;
      const half = (cell * 0.92 * pulse) / 2;
      ctx.beginPath();
      ctx.roundRect(x - half, y - half, half * 2, half * 2, cell * 0.24);
      ctx.stroke();
    }

    // idle life: every few seconds a shine sweeps across one random candy
    if (now >= state.nextGlintAt && visuals.size > 0) {
      const all = [...visuals.values()];
      const pick = all[(Math.random() * all.length) | 0];
      state.glint = { row: pick.row, col: pick.col, start: now };
      state.nextGlintAt = now + 2800 + Math.random() * 2200;
    }

    const size = Math.round(cell * state.dpr);
    for (const v of visuals.values()) {
      const sprite = sprites.tile(v.color, v.kind, size);
      let { x, y } = cellCenter(v.row, v.col);
      if (v.wobbleUntil > now) {
        x += Math.sin(now / 70) * cell * 0.05;
        y -= Math.abs(Math.sin(now / 110)) * cell * 0.04;
      }
      const plain = v.scaleX === 1 && v.scaleY === 1 && v.alpha === 1;
      if (plain) {
        ctx.drawImage(sprite, x - cell / 2, y - cell / 2, cell, cell);
      } else {
        ctx.save();
        ctx.globalAlpha = v.alpha;
        ctx.translate(x, y);
        ctx.scale(v.scaleX, v.scaleY);
        ctx.drawImage(sprite, -cell / 2, -cell / 2, cell, cell);
        ctx.restore();
      }
    }

    if (state.glint) {
      const t = (now - state.glint.start) / 450;
      if (t >= 1) {
        state.glint = null;
      } else {
        const { x, y } = cellCenter(state.glint.row, state.glint.col);
        ctx.save();
        ctx.beginPath();
        ctx.roundRect(x - cell * 0.42, y - cell * 0.42, cell * 0.84, cell * 0.84, cell * 0.28);
        ctx.clip();
        ctx.globalAlpha = Math.sin(Math.PI * t) * 0.5;
        ctx.translate(x + (t * 2 - 1) * cell * 0.9, y);
        ctx.rotate(-0.7);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(-cell * 0.09, -cell, cell * 0.18, cell * 2);
        ctx.restore();
      }
    }
    ctx.restore();
  }

  return {
    ctx,
    state,
    visuals,
    setBoardSize,
    resize,
    cellCenter,
    cellAt,
    makeVisual,
    syncFromBoard,
    draw,
  };
}
