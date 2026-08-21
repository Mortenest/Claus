/**
 * Programmatic candy art. Every (color, kind) pair is pre-rendered once per
 * cell size into an offscreen canvas, so the per-frame cost of a tile is one
 * drawImage. Each color has a distinct silhouette (colorblind-friendly):
 *
 *   red circle · orange drop · yellow star · green triangle · blue diamond ·
 *   purple heart
 *
 * Specials: striped = stripe overlay in the clear direction, wrapped =
 * candy in a translucent wrapper square, colorbomb = dark speckled sphere.
 * Sizes are in device pixels (callers multiply by dpr); rebuild after a
 * resize via clear().
 */

export const PALETTE = [
  { base: '#ff4d6b', dark: '#c2233f', light: '#ff9fb2' }, // red
  { base: '#ff9838', dark: '#cf6a10', light: '#ffc98a' }, // orange
  { base: '#ffd23e', dark: '#d1a10a', light: '#ffe98f' }, // yellow
  { base: '#4cd964', dark: '#1f9e38', light: '#9df2ad' }, // green
  { base: '#38b6ff', dark: '#0d7fc4', light: '#9bdcff' }, // blue
  { base: '#b96bff', dark: '#7f35c9', light: '#dcb3ff' }, // purple
];

export function createSpriteCache() {
  const cache = new Map();

  function make(size, draw) {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    draw(ctx, size);
    return canvas;
  }

  return {
    tile(color, kind, size) {
      const key = `${color}|${kind}|${size}`;
      if (!cache.has(key)) cache.set(key, make(size, (ctx, s) => drawTile(ctx, s, color, kind)));
      return cache.get(key);
    },
    well(size) {
      const key = `well|${size}`;
      if (!cache.has(key)) cache.set(key, make(size, drawWell));
      return cache.get(key);
    },
    clear() {
      cache.clear();
    },
  };
}

function drawWell(ctx, s) {
  const pad = s * 0.03;
  ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
  roundRect(ctx, pad, pad, s - 2 * pad, s - 2 * pad, s * 0.22);
  ctx.fill();
  ctx.fillStyle = 'rgba(10, 5, 24, 0.25)';
  roundRect(ctx, pad, pad + s * 0.02, s - 2 * pad, s * 0.1, s * 0.1);
  ctx.fill();
}

function drawTile(ctx, s, color, kind) {
  const cx = s / 2;
  const cy = s / 2;
  if (kind === 'colorbomb') {
    drawColorbomb(ctx, s, cx, cy);
    return;
  }
  const wrapped = kind === 'wrapped';
  const radius = s * (wrapped ? 0.315 : 0.4);
  const pal = PALETTE[color];

  if (wrapped) drawWrapper(ctx, s, cx, cy, pal);

  // soft drop shadow
  ctx.save();
  ctx.translate(0, s * 0.035);
  shapePath(ctx, color, cx, cy, radius);
  ctx.fillStyle = 'rgba(10, 5, 24, 0.35)';
  ctx.fill();
  ctx.restore();

  // body
  const grad = ctx.createLinearGradient(0, cy - radius, 0, cy + radius);
  grad.addColorStop(0, pal.light);
  grad.addColorStop(0.45, pal.base);
  grad.addColorStop(1, pal.dark);
  shapePath(ctx, color, cx, cy, radius);
  ctx.fillStyle = grad;
  ctx.fill();

  // rim
  shapePath(ctx, color, cx, cy, radius);
  ctx.lineWidth = Math.max(1, s * 0.028);
  ctx.lineJoin = 'round';
  ctx.strokeStyle = pal.dark;
  ctx.stroke();

  if (kind === 'striped_h' || kind === 'striped_v') {
    drawStripes(ctx, color, cx, cy, radius, kind === 'striped_h');
  }

  drawGloss(ctx, cx, cy, radius);
}

function drawWrapper(ctx, s, cx, cy, pal) {
  const half = s * 0.44;
  ctx.save();
  ctx.globalAlpha = 0.4;
  ctx.fillStyle = pal.base;
  roundRect(ctx, cx - half, cy - half, half * 2, half * 2, s * 0.2);
  ctx.fill();
  ctx.restore();
  ctx.lineWidth = Math.max(1, s * 0.03);
  ctx.strokeStyle = pal.dark;
  ctx.setLineDash([s * 0.09, s * 0.055]);
  roundRect(ctx, cx - half, cy - half, half * 2, half * 2, s * 0.2);
  ctx.stroke();
  ctx.setLineDash([]);
}

function drawStripes(ctx, color, cx, cy, radius, horizontal) {
  ctx.save();
  shapePath(ctx, color, cx, cy, radius);
  ctx.clip();
  ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
  const t = radius * 0.24;
  for (const offset of [-radius * 0.55, 0, radius * 0.55]) {
    if (horizontal) ctx.fillRect(cx - radius * 1.2, cy + offset - t / 2, radius * 2.4, t);
    else ctx.fillRect(cx + offset - t / 2, cy - radius * 1.2, t, radius * 2.4);
  }
  ctx.restore();
}

function drawGloss(ctx, cx, cy, radius) {
  ctx.save();
  ctx.translate(cx - radius * 0.32, cy - radius * 0.42);
  ctx.rotate(-0.5);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
  ctx.beginPath();
  ctx.ellipse(0, 0, radius * 0.34, radius * 0.2, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawColorbomb(ctx, s, cx, cy) {
  const radius = s * 0.4;
  const grad = ctx.createRadialGradient(
    cx - radius * 0.35, cy - radius * 0.4, radius * 0.15,
    cx, cy, radius,
  );
  grad.addColorStop(0, '#54407e');
  grad.addColorStop(0.6, '#2c2050');
  grad.addColorStop(1, '#150d2b');
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.lineWidth = Math.max(1, s * 0.028);
  ctx.strokeStyle = '#0c0719';
  ctx.stroke();
  for (let i = 0; i < 6; i++) {
    const angle = (i / 6) * Math.PI * 2 - Math.PI / 2 + 0.35;
    const dist = radius * (i % 2 === 0 ? 0.55 : 0.34);
    ctx.beginPath();
    ctx.arc(cx + Math.cos(angle) * dist, cy + Math.sin(angle) * dist, s * 0.055, 0, Math.PI * 2);
    ctx.fillStyle = PALETTE[i].base;
    ctx.fill();
  }
  drawGloss(ctx, cx, cy, radius);
}

/** Distinct silhouette per color id. */
function shapePath(ctx, color, cx, cy, r) {
  ctx.beginPath();
  switch (color) {
    case 0: // circle
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      break;
    case 1: // drop
      ctx.moveTo(cx, cy - r * 1.05);
      ctx.bezierCurveTo(cx + r * 0.72, cy - r * 0.36, cx + r * 0.92, cy + r * 0.28, cx + r * 0.62, cy + r * 0.68);
      ctx.bezierCurveTo(cx + r * 0.34, cy + r * 1.02, cx - r * 0.34, cy + r * 1.02, cx - r * 0.62, cy + r * 0.68);
      ctx.bezierCurveTo(cx - r * 0.92, cy + r * 0.28, cx - r * 0.72, cy - r * 0.36, cx, cy - r * 1.05);
      break;
    case 2: { // star
      const spikes = 5;
      for (let i = 0; i < spikes * 2; i++) {
        const rad = i % 2 === 0 ? r * 1.05 : r * 0.5;
        const angle = (i * Math.PI) / spikes - Math.PI / 2;
        const x = cx + Math.cos(angle) * rad;
        const y = cy + Math.sin(angle) * rad;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      break;
    }
    case 3: { // rounded triangle
      const points = [0, 1, 2].map((i) => {
        const angle = (i * 2 * Math.PI) / 3 - Math.PI / 2;
        return { x: cx + Math.cos(angle) * r * 1.08, y: cy + Math.sin(angle) * r * 1.08 };
      });
      const corner = r * 0.28;
      ctx.moveTo((points[0].x + points[1].x) / 2, (points[0].y + points[1].y) / 2);
      for (let i = 1; i <= 3; i++) {
        const p = points[i % 3];
        const next = points[(i + 1) % 3];
        ctx.arcTo(p.x, p.y, (p.x + next.x) / 2, (p.y + next.y) / 2, corner);
      }
      ctx.closePath();
      break;
    }
    case 4: // diamond
      ctx.moveTo(cx, cy - r * 1.05);
      ctx.lineTo(cx + r * 0.82, cy);
      ctx.lineTo(cx, cy + r * 1.05);
      ctx.lineTo(cx - r * 0.82, cy);
      ctx.closePath();
      break;
    default: // heart
      ctx.moveTo(cx, cy + r * 0.95);
      ctx.bezierCurveTo(cx - r * 1.1, cy + r * 0.25, cx - r * 1.02, cy - r * 0.68, cx - r * 0.5, cy - r * 0.68);
      ctx.bezierCurveTo(cx - r * 0.16, cy - r * 0.68, cx, cy - r * 0.4, cx, cy - r * 0.22);
      ctx.bezierCurveTo(cx, cy - r * 0.4, cx + r * 0.16, cy - r * 0.68, cx + r * 0.5, cy - r * 0.68);
      ctx.bezierCurveTo(cx + r * 1.02, cy - r * 0.68, cx + r * 1.1, cy + r * 0.25, cx, cy + r * 0.95);
      break;
  }
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
