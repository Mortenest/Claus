/**
 * Touch/mouse move input on the board canvas, via Pointer Events.
 * Two gestures produce a move intent:
 *   swipe — press a tile and drag past the threshold in a cardinal direction
 *   tap-tap — tap to select, tap an orthogonal neighbor to swap
 * Input is ignored (not buffered) while the playback layer holds the lock.
 */

import { isAdjacent } from '../core/tiles.js';

export function createInput(canvas, renderer, handlers) {
  let selection = null; // {r, c} | null
  let press = null; // { x, y, cell, consumed }

  function setSelection(cell) {
    selection = cell;
    renderer.state.selection = cell;
  }

  function emitMove(from, to) {
    setSelection(null);
    handlers.onMove({ from: { ...from }, to: { ...to } });
  }

  function localPoint(e) {
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  canvas.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    if (handlers.isLocked()) return;
    const { x, y } = localPoint(e);
    const cell = renderer.cellAt(x, y);
    if (!cell || renderer.state.isHole(cell.r, cell.c)) return;
    canvas.setPointerCapture(e.pointerId);
    press = { x, y, cell, consumed: false };

    if (selection && isAdjacent(selection, cell)) {
      press.consumed = true;
      emitMove(selection, cell);
    }
  });

  canvas.addEventListener('pointermove', (e) => {
    if (!press || press.consumed || handlers.isLocked()) return;
    const { x, y } = localPoint(e);
    const dx = x - press.x;
    const dy = y - press.y;
    const threshold = Math.max(renderer.state.cell * 0.25, 12);
    if (Math.hypot(dx, dy) < threshold) return;

    const horizontal = Math.abs(dx) >= Math.abs(dy);
    const to = {
      r: press.cell.r + (horizontal ? 0 : Math.sign(dy)),
      c: press.cell.c + (horizontal ? Math.sign(dx) : 0),
    };
    press.consumed = true;
    const { rows, cols } = renderer.state;
    const onBoard =
      to.r >= 0 && to.r < rows && to.c >= 0 && to.c < cols && !renderer.state.isHole(to.r, to.c);
    if (onBoard) {
      emitMove(press.cell, to);
    } else {
      setSelection(null);
    }
  });

  const finish = (e) => {
    if (!press) return;
    const wasPress = press;
    press = null;
    if (e.type === 'pointercancel' || wasPress.consumed || handlers.isLocked()) return;
    // a plain tap: toggle/move the selection
    const same = selection && selection.r === wasPress.cell.r && selection.c === wasPress.cell.c;
    setSelection(same ? null : wasPress.cell);
  };
  canvas.addEventListener('pointerup', finish);
  canvas.addEventListener('pointercancel', finish);
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  return {
    clearSelection: () => setSelection(null),
  };
}
