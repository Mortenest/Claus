/**
 * Bootstrap and screen state machine:
 * boot → menu → levels → game (→ pause/won/lost dialogs) → levels …
 * Owns the rAF loop and the wiring between core Game sessions and the
 * renderer/screens; move input and playback arrive via input.js/playback.js.
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
import { createScreens } from './screens.js';

const canvas = document.getElementById('board');
const sprites = createSpriteCache();
const renderer = createRenderer(canvas, sprites);

let progress = loadProgress();
let game = null;
let currentLevelId = 0;
let paused = false;

const screens = createScreens({
  onPlay: showLevels,
  onMenu: () => screens.show('menu'),
  onPickLevel: startLevel,
  onPause: () => {
    if (!game || game.status !== 'playing') return;
    paused = true;
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
    screens.hideDialog();
    if (action === 'restart' || action === 'replay') startLevel(currentLevelId);
    else if (action === 'quit' || action === 'map') showLevels();
    else if (action === 'next') startLevel(currentLevelId + 1);
    // 'resume' needs nothing further
  },
});

function showLevels() {
  progress = loadProgress();
  screens.renderLevels(LEVELS, unlockedUpTo(progress, LEVELS.length), (id) =>
    levelProgress(progress, id),
  );
  screens.show('levels');
}

function startLevel(id) {
  const def = getLevel(id);
  currentLevelId = id;
  paused = false;
  const attempt = bumpAttempt(id);
  game = new Game(def, attemptSeed(def, attempt));
  renderer.setBoardSize(def.rows, def.cols);
  renderer.syncFromBoard(game.board);
  renderer.state.selection = null;
  screens.show('game');
  updateHud();
  // layout after the screen becomes visible
  requestAnimationFrame(() => renderer.resize());
}

function updateHud() {
  if (!game) return;
  screens.setHud({
    score: game.score,
    movesLeft: game.movesLeft,
    goal: game.goal,
    levelName: `${game.level.id}. ${game.level.name}`,
  });
}

function showHint() {
  if (!game || game.status !== 'playing' || paused) return;
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
  }, 350);
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
  renderer.draw(now);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
