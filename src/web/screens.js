/**
 * All DOM: screen switching, level select, HUD, dialogs, banner. Every
 * user-facing string lives in STRINGS. The game canvas is not touched here.
 */

import { PALETTE } from './sprites.js';
import { worldOf } from '../core/levels.js';

export const STRINGS = {
  tagline: 'Match three. Crunch the goal.',
  play: 'Play',
  levels: 'Levels',
  score: 'Score',
  goal: 'Goal',
  moves: 'Moves',
  sound: 'Sound',
  haptics: 'Haptics',
  paused: 'Paused',
  pausedSub: 'Take a breather.',
  resume: 'Resume',
  restart: 'Restart',
  quit: 'Quit',
  won: 'Level Complete!',
  sweetFinish: 'Sweet Finish!',
  sweetFinishBonus: (points) => `Sweet Finish +${points.toLocaleString('en-US')}`,
  lost: 'Out of Moves!',
  lostSub: 'So close — one more go?',
  tryAgain: 'Try Again',
  next: 'Next Level',
  map: 'Level Map',
  level: (n) => `Level ${n}`,
  banners: ['Sweet!', 'Tasty!', 'Delicious!', 'Divine!'],
};

const fmt = (n) => n.toLocaleString('en-US');

export function createScreens(handlers) {
  const el = (id) => document.getElementById(id);
  const refs = {
    screens: {
      menu: el('screen-menu'),
      levels: el('screen-levels'),
      game: el('screen-game'),
    },
    levelList: el('level-list'),
    score: el('hud-score'),
    goal: el('hud-goal'),
    goalFill: el('hud-progress-fill'),
    moves: el('hud-moves'),
    movesBlock: document.querySelector('.hud-moves'),
    levelName: el('hud-level-name'),
    banner: el('banner'),
    dialogRoot: el('dialog-root'),
    dialogCard: el('dialog-card'),
    sound: el('btn-sound'),
    haptics: el('btn-haptics'),
  };

  for (const node of document.querySelectorAll('[data-str]')) {
    node.textContent = STRINGS[node.dataset.str];
  }

  el('btn-play').addEventListener('click', () => handlers.onPlay());
  el('btn-levels-back').addEventListener('click', () => handlers.onMenu());
  el('btn-pause').addEventListener('click', () => handlers.onPause());
  el('btn-hint').addEventListener('click', () => handlers.onHint());
  refs.sound.addEventListener('click', () => handlers.onToggleSound());
  refs.haptics.addEventListener('click', () => handlers.onToggleHaptics());

  function show(name) {
    for (const [key, node] of Object.entries(refs.screens)) {
      node.classList.toggle('active', key === name);
    }
  }

  function setToggles(settings) {
    refs.sound.textContent = `${settings.sound ? '🔊' : '🔇'} ${STRINGS.sound}`;
    refs.sound.setAttribute('aria-pressed', String(settings.sound));
    refs.haptics.textContent = `${settings.haptics ? '📳' : '🚫'} ${STRINGS.haptics}`;
    refs.haptics.setAttribute('aria-pressed', String(settings.haptics));
  }

  function starRow(stars) {
    return [1, 2, 3]
      .map((i) => `<span class="${i <= stars ? '' : 'off'}">★</span>`)
      .join('');
  }

  function renderLevels(levels, unlockedTo, progressOf) {
    refs.levelList.replaceChildren();
    let currentWorld = null;
    let grid = null;
    for (const def of levels) {
      const world = worldOf(def.id);
      if (world !== currentWorld) {
        currentWorld = world;
        const header = document.createElement('h3');
        header.className = 'world-header';
        header.dataset.theme = world.theme;
        header.innerHTML = `<span class="world-dot"></span>World ${world.id} — ${world.name}`;
        grid = document.createElement('div');
        grid.className = 'level-grid';
        refs.levelList.append(header, grid);
      }
      const cell = document.createElement('button');
      cell.className = 'level-cell';
      const locked = def.id > unlockedTo;
      if (locked) {
        cell.classList.add('locked');
        cell.innerHTML = `<span>🔒</span>`;
        cell.disabled = true;
      } else {
        const { stars } = progressOf(def.id);
        cell.innerHTML = `<span>${def.id}</span><span class="stars">${starRow(stars)}</span>`;
        cell.addEventListener('click', () => handlers.onPickLevel(def.id));
      }
      grid.append(cell);
    }
  }

  function goalText(goal) {
    if (goal.type === 'score') return fmt(goal.target);
    const dot = `<span style="display:inline-block;width:0.7em;height:0.7em;border-radius:50%;
      background:${PALETTE[goal.color].base};margin-right:4px;vertical-align:baseline"></span>`;
    return `${dot}${Math.min(goal.current, goal.count)}/${goal.count}`;
  }

  function setHud({ score, movesLeft, goal, levelName }) {
    refs.score.textContent = fmt(score);
    refs.moves.textContent = String(movesLeft);
    refs.movesBlock.classList.toggle('low', movesLeft <= 5);
    refs.goal.innerHTML = goalText(goal);
    const progress = goal.type === 'score' ? goal.current / goal.target : goal.current / goal.count;
    refs.goalFill.style.width = `${Math.min(100, Math.round(progress * 100))}%`;
    if (levelName !== undefined) refs.levelName.textContent = levelName;
  }

  let bannerTimer = 0;
  function showBanner(text) {
    refs.banner.hidden = false;
    refs.banner.textContent = text;
    refs.banner.classList.remove('show');
    void refs.banner.offsetWidth; // restart the CSS animation
    refs.banner.classList.add('show');
    clearTimeout(bannerTimer);
    bannerTimer = setTimeout(() => {
      refs.banner.hidden = true;
    }, 1100);
  }

  function button(label, action, primary = false) {
    return `<button class="btn ${primary ? 'btn-primary' : ''}" data-action="${action}">${label}</button>`;
  }

  function showDialog(kind, data = {}) {
    let html = '';
    if (kind === 'pause') {
      html = `
        <h3 class="dialog-title">${STRINGS.paused}</h3>
        <p class="dialog-sub">${STRINGS.pausedSub}</p>
        <div class="dialog-actions">
          ${button(STRINGS.resume, 'resume', true)}
          ${button(STRINGS.restart, 'restart')}
          ${button(STRINGS.quit, 'quit')}
        </div>`;
    } else if (kind === 'won') {
      const stars = [1, 2, 3]
        .map(
          (i) =>
            `<span class="star ${i <= data.stars ? 'lit' : ''}"
              style="animation-delay:${0.15 + i * 0.3}s">★</span>`,
        )
        .join('');
      html = `
        <h3 class="dialog-title">${STRINGS.won}</h3>
        <p class="dialog-sub">${STRINGS.level(data.levelId)} · ${data.levelName}</p>
        <div class="dialog-stars animate">${stars}</div>
        <div class="dialog-score">${fmt(data.score)}</div>
        ${data.bonusTotal ? `<p class="dialog-sub">${STRINGS.sweetFinishBonus(data.bonusTotal)}</p>` : ''}
        <div class="dialog-actions">
          ${data.hasNext ? button(STRINGS.next, 'next', true) : ''}
          ${button(STRINGS.tryAgain, 'replay', !data.hasNext)}
          ${button(STRINGS.map, 'map')}
        </div>`;
    } else if (kind === 'lost') {
      html = `
        <h3 class="dialog-title">${STRINGS.lost}</h3>
        <p class="dialog-sub">${STRINGS.lostSub}</p>
        <div class="dialog-score">${fmt(data.score)}</div>
        <div class="dialog-actions">
          ${button(STRINGS.tryAgain, 'replay', true)}
          ${button(STRINGS.map, 'map')}
        </div>`;
    }
    refs.dialogCard.innerHTML = html;
    for (const btn of refs.dialogCard.querySelectorAll('[data-action]')) {
      btn.addEventListener('click', () => handlers.onDialogAction(btn.dataset.action));
    }
    refs.dialogRoot.hidden = false;
    requestAnimationFrame(() => refs.dialogRoot.classList.add('open'));
  }

  function hideDialog() {
    refs.dialogRoot.classList.remove('open');
    setTimeout(() => {
      refs.dialogRoot.hidden = true;
    }, 260);
  }

  return { show, setToggles, renderLevels, setHud, showBanner, showDialog, hideDialog, STRINGS };
}
