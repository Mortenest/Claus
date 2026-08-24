/**
 * The gumdrop mascots — one per world, drawn as inline SVG so they stay
 * crisp at any size with zero assets. Moods swap face/pose groups; the
 * matching keyframe animations (bob, blink, hop, quiver, sigh, shake) live
 * in style.css under .mascot. mountMascot returns a tiny controller that
 * re-renders the SVG on mood changes and auto-returns to idle.
 *
 * Design source: tools/character-lab.html (candidate A, v2).
 */

const INK = '#2a1e33';

export const MASCOT_PALETTES = {
  meadow: {
    base: '#ff7fa3', light: '#ffc9d9', dark: '#d8446f',
    blush: '#ff5d8f', accent: '#ffd23e', belly: '#ffe3ec',
  },
  frost: {
    base: '#54c7e8', light: '#b5ecff', dark: '#1c85b0',
    blush: '#8fd8ff', accent: '#dff6ff', belly: '#e6f9ff',
  },
};

export const MOODS = ['idle', 'cheer', 'wow', 'starstruck', 'sad'];

let gid = 0;

/* ---------- face pieces ---------- */

function happyEyes(lx, rx, cy) {
  const arc = (cx) =>
    `<path d="M ${cx - 7} ${cy + 2} Q ${cx} ${cy - 7} ${cx + 7} ${cy + 2}"
       fill="none" stroke="${INK}" stroke-width="3.4" stroke-linecap="round"/>`;
  return arc(lx) + arc(rx);
}

function sadEyes(lx, rx, cy) {
  const eye = (cx, flip) => `
    <ellipse cx="${cx}" cy="${cy + 1}" rx="5.6" ry="6" fill="${INK}"/>
    <circle cx="${cx + 2}" cy="${cy - 1}" r="2" fill="#fff"/>
    <path d="M ${cx - 7 * flip} ${cy - 6.5} L ${cx + 5 * flip} ${cy - 10.5}"
      stroke="${INK}" stroke-width="2.6" stroke-linecap="round"/>`;
  return eye(lx, 1) + eye(rx, -1);
}

function starEyes(lx, rx, cy) {
  const star = (cx) => {
    let d = '';
    for (let i = 0; i < 10; i++) {
      const r = i % 2 === 0 ? 8.6 : 3.9;
      const a = (i * Math.PI) / 5 - Math.PI / 2;
      d += `${i === 0 ? 'M' : 'L'} ${(cx + Math.cos(a) * r).toFixed(1)} ${(cy + Math.sin(a) * r).toFixed(1)} `;
    }
    return `<path d="${d}Z" fill="#ffd23e" stroke="#d1a10a" stroke-width="1.6" stroke-linejoin="round"/>
      <circle cx="${cx + 2}" cy="${cy - 2.5}" r="1.6" fill="#fff" opacity="0.9"/>`;
  };
  return star(lx) + star(rx);
}

function gumdropEyes(lx, rx, cy, scale = 1) {
  const eye = (cx, flip) => `
    <g>
      <ellipse cx="${cx}" cy="${cy}" rx="${8 * scale}" ry="${9 * scale}" fill="#241633"/>
      <ellipse cx="${cx}" cy="${cy + 0.8 * scale}" rx="${6.4 * scale}" ry="${7.4 * scale}" fill="#3a2447"/>
      <circle cx="${cx + 2.8 * scale}" cy="${cy - 3.2 * scale}" r="${3.1 * scale}" fill="#fff"/>
      <circle cx="${cx - 2.4 * scale}" cy="${cy + 2.6 * scale}" r="${1.4 * scale}" fill="#fff" opacity="0.85"/>
      <path d="M ${cx - 4.6 * scale} ${cy + 6.4 * scale} Q ${cx} ${cy + 8.2 * scale} ${cx + 4.6 * scale} ${cy + 6.4 * scale}"
        fill="none" stroke="#fff" stroke-width="${1.1 * scale}" opacity="0.35" stroke-linecap="round"/>
      <path d="M ${cx + 7.6 * scale * flip} ${cy - 4 * scale} q ${3 * flip} -1 ${4.4 * flip} -3.2"
        fill="none" stroke="${INK}" stroke-width="2" stroke-linecap="round"/>
      <path d="M ${cx + 6.6 * scale * flip} ${cy - 6.6 * scale} q ${2.4 * flip} -1.4 ${3.4 * flip} -3.6"
        fill="none" stroke="${INK}" stroke-width="1.7" stroke-linecap="round" opacity="0.85"/>
    </g>`;
  return `<g class="eyes">${eye(lx, -1)}${eye(rx, 1)}</g>`;
}

function brows(lx, rx, cy, mood) {
  const brow = (cx, flip) => {
    if (mood === 'sad') {
      return `<path d="M ${cx - 6 * flip} ${cy - 13} Q ${cx} ${cy - 17} ${cx + 6 * flip} ${cy - 16.5}"
        fill="none" stroke="${INK}" stroke-width="2.4" stroke-linecap="round"/>`;
    }
    const lift = mood === 'idle' ? 0 : 4;
    return `<path d="M ${cx - 6 * flip} ${cy - 14 - lift} Q ${cx} ${cy - 17.5 - lift} ${cx + 6 * flip} ${cy - 15 - lift}"
      fill="none" stroke="${INK}" stroke-width="2.2" stroke-linecap="round" opacity="0.75"/>`;
  };
  return brow(lx, 1) + brow(rx, -1);
}

function mouth(kind, cx, cy) {
  if (kind === 'smile') {
    return `<path d="M ${cx - 6.5} ${cy} Q ${cx} ${cy + 5.5} ${cx + 6.5} ${cy}"
      fill="none" stroke="${INK}" stroke-width="2.6" stroke-linecap="round"/>`;
  }
  if (kind === 'grin') {
    return `<path d="M ${cx - 9} ${cy - 1} Q ${cx} ${cy + 11} ${cx + 9} ${cy - 1} Z" fill="${INK}"/>
      <path d="M ${cx - 5} ${cy + 4.5} Q ${cx} ${cy + 7.5} ${cx + 5} ${cy + 4.5} L ${cx + 3.4} ${cy + 6.8} Q ${cx} ${cy + 8.6} ${cx - 3.4} ${cy + 6.8} Z"
      fill="#ff8fae"/>`;
  }
  if (kind === 'o') {
    return `<ellipse cx="${cx}" cy="${cy + 2}" rx="4.6" ry="5.6" fill="${INK}"/>`;
  }
  return `<path d="M ${cx - 6} ${cy + 4} Q ${cx} ${cy - 2} ${cx + 6} ${cy + 4}"
    fill="none" stroke="${INK}" stroke-width="2.6" stroke-linecap="round"/>`;
}

function blushCheeks(p, lx, rx, cy) {
  const cheek = (cx) => `
    <ellipse cx="${cx}" cy="${cy}" rx="6.2" ry="3.8" fill="${p.blush}" opacity="0.55"/>
    <path d="M ${cx - 3} ${cy - 1} l 2 -1.4 M ${cx + 1} ${cy - 1.6} l 2 -1.4"
      stroke="#fff" stroke-width="1.2" stroke-linecap="round" opacity="0.75"/>`;
  return cheek(lx) + cheek(rx);
}

function sparkles(color) {
  const s = (x, y, r) =>
    `<path d="M ${x} ${y - r} L ${x + r * 0.35} ${y - r * 0.35} L ${x + r} ${y} L ${x + r * 0.35} ${y + r * 0.35}
       L ${x} ${y + r} L ${x - r * 0.35} ${y + r * 0.35} L ${x - r} ${y} L ${x - r * 0.35} ${y - r * 0.35} Z"
       fill="${color}" opacity="0.9"/>`;
  return s(22, 30, 6) + s(99, 24, 4.5) + s(103, 46, 3);
}

function face(p, mood) {
  const cy = 60;
  const lx = 45;
  const rx = 75;
  if (mood === 'cheer') {
    return brows(lx, rx, cy, mood) + happyEyes(lx, rx, cy) +
      blushCheeks(p, lx - 11, rx + 11, cy + 9) + mouth('grin', 60, cy + 9);
  }
  if (mood === 'wow') {
    return brows(lx, rx, cy, mood) + gumdropEyes(lx, rx, cy, 1.22) +
      blushCheeks(p, lx - 11, rx + 11, cy + 9) + mouth('o', 60, cy + 12);
  }
  if (mood === 'starstruck') {
    return brows(lx, rx, cy, mood) + starEyes(lx, rx, cy) +
      blushCheeks(p, lx - 11, rx + 11, cy + 9) + mouth('grin', 60, cy + 10);
  }
  if (mood === 'sad') {
    return brows(lx, rx, cy, mood) + sadEyes(lx, rx, cy + 1) + mouth('frown', 60, cy + 12) +
      `<path d="M ${rx + 10} ${cy + 3} q 3.6 5.4 0 8.4 q -3.6 -3 0 -8.4" fill="#9adcff" opacity="0.95"/>`;
  }
  return brows(lx, rx, cy, mood) + gumdropEyes(lx, rx, cy) +
    blushCheeks(p, lx - 11, rx + 11, cy + 9) + mouth('smile', 60, cy + 11);
}

/* ---------- the character ---------- */

/**
 * @param {'meadow'|'frost'} theme
 * @param {'idle'|'cheer'|'wow'|'starstruck'|'sad'} mood
 * @returns {string} SVG markup (sized by its container)
 */
export function mascotSvg(theme, mood = 'idle') {
  const p = MASCOT_PALETTES[theme] ?? MASCOT_PALETTES.meadow;
  const frost = theme === 'frost';
  const bodyId = `mgb${gid++}`;
  const glowId = `mgl${gid++}`;
  const droop = mood === 'sad' ? 'transform="translate(0 4) rotate(-3 60 90)"' : '';
  const armUp = mood === 'cheer' || mood === 'wow' || mood === 'starstruck';

  const arm = (side) => {
    const flip = side === 'l' ? 1 : -1;
    if (armUp) {
      const x = side === 'l' ? 17 : 91;
      return `<rect x="${x}" y="26" width="12" height="26" rx="6" fill="${p.base}"
        stroke="${p.dark}" stroke-width="2.5" transform="rotate(${-32 * flip} ${x + 6} 50)"/>`;
    }
    const rot = mood === 'sad' ? 30 * flip : 18 * flip;
    const x = side === 'l' ? 12 : 96;
    return `<rect x="${x}" y="62" width="12" height="24" rx="6" fill="${p.base}"
      stroke="${p.dark}" stroke-width="2.5" transform="rotate(${rot} ${x + 6} 66)"/>`;
  };

  const foot = (cx) => `
    <ellipse cx="${cx}" cy="103" rx="9.5" ry="5.5" fill="${p.base}" stroke="${p.dark}" stroke-width="2.4"/>
    <path d="M ${cx - 3} 99.5 q 0 3 0 5 M ${cx + 3} 99.5 q 0 3 0 5"
      stroke="${p.dark}" stroke-width="1.6" stroke-linecap="round" opacity="0.65"/>`;

  const speckles = [
    [34, 62], [30, 76], [41, 90], [83, 55], [90, 70], [80, 92], [66, 97], [51, 30], [73, 33],
  ].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="1.15" fill="#fff" opacity="0.3"/>`).join('');

  const topper = frost
    ? `<g stroke="${p.accent}" stroke-width="2.4" stroke-linecap="round" transform="translate(60 12)">
        <line x1="0" y1="-7" x2="0" y2="7"/><line x1="-6" y1="-3.6" x2="6" y2="3.6"/>
        <line x1="-6" y1="3.6" x2="6" y2="-3.6"/><circle cx="0" cy="0" r="2.2" fill="${p.accent}" stroke="none"/>
        <circle cx="0" cy="-8.4" r="1.3" fill="${p.accent}" stroke="none"/>
        <circle cx="7.3" cy="4.2" r="1.3" fill="${p.accent}" stroke="none"/>
        <circle cx="-7.3" cy="4.2" r="1.3" fill="${p.accent}" stroke="none"/>
      </g>`
    : `<path d="M 60 17 Q 57 10 60 5" stroke="#7a9c3e" stroke-width="2.8" fill="none" stroke-linecap="round"/>
       <path d="M 60 8 C 66 2 76 3 79 9 C 72 13 63 13 60 8 Z"
         fill="#8fd964" stroke="#5d8f2e" stroke-width="2.2" stroke-linejoin="round"/>
       <path d="M 62 9 Q 69 8 75 8.6" stroke="#5d8f2e" stroke-width="1.4" fill="none" opacity="0.7"/>`;

  const bellyDeco = frost
    ? `<circle cx="53" cy="86" r="1.6" fill="${p.dark}" opacity="0.25"/>
       <circle cx="67" cy="90" r="1.6" fill="${p.dark}" opacity="0.25"/>
       <circle cx="60" cy="82" r="1.6" fill="${p.dark}" opacity="0.25"/>`
    : `<path d="M 60 84 c -2.4 -2.6 -6.4 -0.4 -4.6 2.6 c 1.2 2 3.4 3 4.6 4.4 c 1.2 -1.4 3.4 -2.4 4.6 -4.4 c 1.8 -3 -2.2 -5.2 -4.6 -2.6 Z"
         fill="${p.blush}" opacity="0.4"/>`;

  return `<svg viewBox="0 0 120 120" class="${mood}" aria-hidden="true">
    <defs>
      <linearGradient id="${bodyId}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="${p.light}"/>
        <stop offset="0.55" stop-color="${p.base}"/>
        <stop offset="1" stop-color="${p.dark}"/>
      </linearGradient>
      <radialGradient id="${glowId}" cx="0.42" cy="0.3" r="0.75">
        <stop offset="0" stop-color="#ffffff" stop-opacity="0.5"/>
        <stop offset="0.45" stop-color="#ffffff" stop-opacity="0.12"/>
        <stop offset="1" stop-color="#ffffff" stop-opacity="0"/>
      </radialGradient>
    </defs>
    <ellipse cx="60" cy="108" rx="31" ry="5" fill="#0a0518" opacity="0.3"/>
    <g class="bob"><g ${droop}>
      ${arm('l')}${arm('r')}
      ${foot(46)}${foot(74)}
      <path d="M 60 15 C 31 19 20 52 20 77 C 20 98 39 105 60 105 C 81 105 100 98 100 77 C 100 52 89 19 60 15 Z"
        fill="url(#${bodyId})" stroke="${p.dark}" stroke-width="3"/>
      <path d="M 60 15 C 31 19 20 52 20 77 C 20 98 39 105 60 105 C 81 105 100 98 100 77 C 100 52 89 19 60 15 Z"
        fill="url(#${glowId})"/>
      <ellipse cx="60" cy="88" rx="24" ry="12" fill="${p.belly}" opacity="0.6"/>
      ${bellyDeco}
      ${speckles}
      <ellipse cx="41" cy="33" rx="9" ry="15" fill="#fff" opacity="0.45" transform="rotate(-24 41 33)"/>
      <path d="M 84 30 Q 92 40 94 52" fill="none" stroke="${p.light}" stroke-width="3" opacity="0.5" stroke-linecap="round"/>
      ${topper}
      ${face(p, mood)}
    </g></g>
    ${mood === 'wow' || mood === 'starstruck' ? sparkles(p.accent) : ''}
  </svg>`;
}

/**
 * Mount a live mascot into a container element.
 * @returns {{ el: Element, setTheme(theme): void,
 *             setMood(mood, holdMs?): void, react(event): void }}
 */
export function mountMascot(container, theme = 'meadow') {
  let currentTheme = theme;
  let currentMood = 'idle';
  let holdTimer = 0;
  container.classList.add('mascot');

  function render() {
    container.innerHTML = mascotSvg(currentTheme, currentMood);
  }

  function setMood(mood, holdMs = 0) {
    clearTimeout(holdTimer);
    currentMood = mood;
    render();
    if (holdMs > 0) {
      holdTimer = setTimeout(() => {
        currentMood = 'idle';
        render();
      }, holdMs);
    }
  }

  /** One-shot head shake without changing the face. */
  function shake() {
    container.classList.remove('shake');
    void container.offsetWidth; // restart the CSS animation
    container.classList.add('shake');
  }

  const REACTIONS = {
    cascade: () => setMood('cheer', 1500),
    special: () => setMood('starstruck', 1800),
    blast: () => setMood('wow', 1400),
    finale: () => setMood('starstruck', 2600),
    reject: () => shake(),
    won: () => setMood('cheer'),
    lost: () => setMood('sad'),
  };

  render();
  return {
    el: container,
    setTheme(next) {
      currentTheme = next;
      setMood('idle');
    },
    setMood,
    react(event) {
      REACTIONS[event]?.();
    },
  };
}
