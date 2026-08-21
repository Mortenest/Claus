/**
 * Bootstrap and screen state machine:
 * boot → menu → levels → game (→ pause/won/lost dialogs) → levels …
 * Owns the rAF loop and wires core Game sessions to renderer, input,
 * playback, and screens.
 */

import { LEVELS, getLevel, attemptSeed } from '../core/levels.js';
import { Game } from '../core/game.js';
import {
  loadProgress,
  levelProgress,
  unlockedUpTo,
  bumpAttempt,
  recordResult,
  updateSettings,
} from './storage.js';
import { createSpriteCache } from './sprites.js';
import { createRenderer } from './renderer.js';
import { createScreens, STRINGS } from './screens.js';
import { createClock } from './tween.js';
import { createPlayback } from './playback.js';
import { createInput } from './input.js';

const canvas = document.getElementById('board');
const sprites = createSpriteCache();
const renderer = createRenderer(canvas, sprites);
const clock = createClock();

let progress = loadProgress();
let game = null;
let currentLevelId = 0;
let paused = false;

const screens = createScreens({
  onPlay: showLevels,
  onMenu: () => screens.show('menu'),
  onPickLevel: startLevel,
  onPause: () => {
    if (!game || game.status !== 'playing' || paused) return;
    paused = true;
    clock.timeScale = 0;
    screens.showDialog('pause');
  },
  onHint: showHint,
  onToggleSound: () => {
    progress.settings = updateSettings({ sound: !progress.settings.sound });
    screens.setToggles(progress.settings);
  },
  onToggleHaptics: () => {
    progress.settings = updateSettings({ haptics: !progress.settings.haptics });
    screens.setToggles(progress.settings);
  },
  onDialogAction: (action) => {
    paused = false;
    clock.timeScale = 1;
    screens.hideDialog();
    if (action === 'restart' || action === 'replay') startLevel(currentLevelId);
    else if (action === 'quit' || action === 'map') showLevels();
    else if (action === 'next') startLevel(currentLevelId + 1);
    // 'resume' needs nothing further
  },
});

/** HUD follows the animation, not the (already final) core state. */
const effects = {
  onMoveSpent(step) {
    screens.setHud({ ...hudState(), movesLeft: step.movesLeft });
    hud.movesLeft = step.movesLeft;
  },
  onClearStep(step) {
    hud.score = step.scoreTotal;
    hud.goal = step.goal;
    screens.setHud(hudState());
    if (step.cascade >= 1) {
      const banner = STRINGS.banners[Math.min(step.cascade - 1, STRINGS.banners.length - 1)];
      screens.showBanner(banner);
    }
  },
};

const playback = createPlayback({ renderer, clock, effects });

createInput(canvas, renderer, {
  isLocked: () =>
    paused || playback.isLocked() || !game || game.status !== 'playing',
  onMove: playMove,
});

/** Mirrors what the HUD currently shows (animated, trails the core). */
let hud = { score: 0, movesLeft: 0, goal: null };
function hudState() {
  return { ...hud, levelName: game ? `${game.level.id}. ${game.level.name}` : '' };
}

async function playMove(move) {
  if (!game || game.status !== 'playing') return;
  const result = game.applyMove(move);
  await playback.play(game, result.steps);
  syncHudToGame();
  const end = result.steps.find((s) => s.type === 'end');
  if (end) handleGameEnd(end);
}

function syncHudToGame() {
  if (!game) return;
  hud = { score: game.score, movesLeft: game.movesLeft, goal: game.goal };
  screens.setHud(hudState());
}

function showLevels() {
  playback.cancel();
  game = null;
  progress = loadProgress();
  screens.renderLevels(LEVELS, unlockedUpTo(progress, LEVELS.length), (id) =>
    levelProgress(progress, id),
  );
  screens.show('levels');
}

function startLevel(id) {
  const def = getLevel(id);
  playback.cancel();
  currentLevelId = id;
  paused = false;
  clock.timeScale = 1;
  const attempt = bumpAttempt(id);
  game = new Game(def, attemptSeed(def, attempt));
  renderer.setBoardSize(def.rows, def.cols);
  renderer.syncFromBoard(game.board);
  renderer.state.selection = null;
  screens.show('game');
  syncHudToGame();
  // layout after the screen becomes visible
  requestAnimationFrame(() => renderer.resize());
}

function showHint() {
  if (!game || game.status !== 'playing' || paused || playback.isLocked()) return;
  const hint = game.findHint();
  if (!hint) return;
  const now = performance.now();
  for (const pos of [hint.from, hint.to]) {
    const tile = game.board.get(pos.r, pos.c);
    const visual = renderer.visuals.get(tile.id);
    if (visual) visual.wobbleUntil = now + 1600;
  }
}

/** Level end → persist and show the result dialog. */
function handleGameEnd(endStep) {
  progress = recordResult(currentLevelId, endStep.stars, endStep.score);
  const def = getLevel(currentLevelId);
  setTimeout(() => {
    if (endStep.outcome === 'won') {
      screens.showDialog('won', {
        stars: endStep.stars,
        score: endStep.score,
        levelId: def.id,
        levelName: def.name,
        hasNext: def.id < LEVELS.length,
      });
    } else {
      screens.showDialog('lost', { score: endStep.score });
    }
  }, 420);
}

// ---- boot ----

screens.setToggles(progress.settings);
screens.show('menu');

let resizeTimer = 0;
function scheduleResize() {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => renderer.resize(), 120);
}
window.addEventListener('resize', scheduleResize);
window.addEventListener('orientationchange', scheduleResize);

function frame(now) {
  clock.tick(now);
  renderer.draw(now);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

/** Test hooks for tools/verify-mobile.cjs. */
window.__candy = {
  playHintMove() {
    if (!game || game.status !== 'playing' || playback.isLocked()) return false;
    const hint = game.findHint();
    if (!hint) return false;
    playMove(hint);
    return true;
  },
  /** Viewport pixel centers of the current hint's two cells. */
  hintScreenCells() {
    if (!game || playback.isLocked()) return null;
    const hint = game.findHint();
    if (!hint) return null;
    const rect = canvas.getBoundingClientRect();
    const point = (p) => {
      const { x, y } = renderer.cellCenter(p.r, p.c);
      return { x: rect.left + x, y: rect.top + y };
    };
    return { from: point(hint.from), to: point(hint.to) };
  },
  isLocked: () => playback.isLocked(),
};
