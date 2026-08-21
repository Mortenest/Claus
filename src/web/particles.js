/**
 * Canvas juice: color spark bursts (pooled, capped), floating score texts,
 * and blast flashes (row/column beams, expanding rings). All positions are
 * in canvas css px; main.js calls draw() right after the board renders.
 */

import { PALETTE } from './sprites.js';

const MAX_SPARKS = 160;

export function createParticles(renderer) {
  const sparks = [];
  const floaters = [];
  const flashes = [];
  let lastNow = 0;

  function burst(cellPos, color, count = 9, speed = 1) {
    const { x, y } = renderer.cellCenter(cellPos.r, cellPos.c);
    const cell = renderer.state.cell;
    for (let i = 0; i < count; i++) {
      if (sparks.length >= MAX_SPARKS) sparks.shift();
      const angle = Math.random() * Math.PI * 2;
      const velocity = (0.12 + Math.random() * 0.3) * cell * speed;
      sparks.push({
        x,
        y,
        vx: Math.cos(angle) * velocity,
        vy: Math.sin(angle) * velocity - cell * 0.12,
        size: cell * (0.07 + Math.random() * 0.08),
        color: PALETTE[color]?.base ?? '#cbb7ff',
        life: 0,
        maxLife: 420 + Math.random() * 260,
      });
    }
  }

  function scoreFloat(cellPos, text, color = null) {
    const { x, y } = renderer.cellCenter(cellPos.r, cellPos.c);
    floaters.push({
      x,
      y,
      text,
      color: color === null ? '#fff6fb' : PALETTE[color]?.light ?? '#fff6fb',
      life: 0,
      maxLife: 820,
    });
  }

  /** kind: 'row' | 'col' | 'ring'; index is the row/col, pos the center. */
  function flash(kind, { index = 0, pos = null } = {}) {
    flashes.push({ kind, index, pos, life: 0, maxLife: kind === 'ring' ? 380 : 260 });
  }

  function clear() {
    sparks.length = 0;
    floaters.length = 0;
    flashes.length = 0;
  }

  function draw(ctx, now) {
    const dt = lastNow === 0 ? 16 : Math.min(48, now - lastNow);
    lastNow = now;
    const cell = renderer.state.cell;
    if (cell === 0) return;
    const boardW = renderer.state.cols * cell;
    const boardH = renderer.state.rows * cell;

    for (let i = flashes.length - 1; i >= 0; i--) {
      const f = flashes[i];
      f.life += dt;
      const t = f.life / f.maxLife;
      if (t >= 1) {
        flashes.splice(i, 1);
        continue;
      }
      const alpha = 0.55 * (1 - t);
      ctx.save();
      if (f.kind === 'ring') {
        const { x, y } = renderer.cellCenter(f.pos.r, f.pos.c);
        ctx.strokeStyle = `rgba(255, 246, 251, ${alpha})`;
        ctx.lineWidth = cell * 0.12 * (1 - t * 0.6);
        ctx.beginPath();
        ctx.arc(x, y, cell * (0.4 + t * 1.6), 0, Math.PI * 2);
        ctx.stroke();
      } else {
        ctx.fillStyle = `rgba(255, 246, 251, ${alpha})`;
        const thickness = cell * (0.72 - t * 0.4);
        if (f.kind === 'row') {
          const y = (f.index + 0.5) * cell - thickness / 2;
          ctx.fillRect(-cell * 0.2, y, boardW + cell * 0.4, thickness);
        } else {
          const x = (f.index + 0.5) * cell - thickness / 2;
          ctx.fillRect(x, -cell * 0.2, thickness, boardH + cell * 0.4);
        }
      }
      ctx.restore();
    }

    for (let i = sparks.length - 1; i >= 0; i--) {
      const p = sparks[i];
      p.life += dt;
      const t = p.life / p.maxLife;
      if (t >= 1) {
        sparks.splice(i, 1);
        continue;
      }
      p.vy += cell * 0.0022 * dt; // gravity
      p.x += (p.vx * dt) / 100;
      p.y += (p.vy * dt) / 100;
      ctx.globalAlpha = 1 - t;
      ctx.fillStyle = p.color;
      const size = p.size * (1 - t * 0.5);
      ctx.beginPath();
      ctx.arc(p.x, p.y, size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    for (let i = floaters.length - 1; i >= 0; i--) {
      const f = floaters[i];
      f.life += dt;
      const t = f.life / f.maxLife;
      if (t >= 1) {
        floaters.splice(i, 1);
        continue;
      }
      const rise = cell * 0.9 * (1 - (1 - t) ** 2);
      const alpha = t < 0.15 ? t / 0.15 : 1 - Math.max(0, (t - 0.55) / 0.45);
      const scale = t < 0.18 ? 0.6 + (t / 0.18) * 0.4 : 1;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(f.x, f.y - rise);
      ctx.scale(scale, scale);
      ctx.font = `800 ${Math.round(cell * 0.42)}px ui-rounded, 'SF Pro Rounded', 'Segoe UI', system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineWidth = cell * 0.09;
      ctx.strokeStyle = 'rgba(20, 10, 40, 0.85)';
      ctx.strokeText(f.text, 0, 0);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, 0, 0);
      ctx.restore();
    }
  }

  return { burst, scoreFloat, flash, clear, draw };
}
