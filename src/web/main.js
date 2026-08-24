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
import { createParticles } from './particles.js';
import { createAudio } from './audio.js';
import { createHaptics } from './haptics.js';

const canvas = document.getElementById('board');
const sprites = createSpriteCache();
const renderer = createRenderer(canvas, sprites);
const clock = createClock();
const particles = createParticles(renderer);

let progress = loadProgress();
let game = null;
let currentLevelId = 0;
let paused = false;

const audio = createAudio(() => progress.settings.sound);
const haptics = createHaptics(() => progress.settings.haptics);

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

/**
 * The juice layer. HUD follows the animation (not the already-final core
 * state); every step type gets its sound, buzz, and canvas garnish.
 */
const effects = {
  onMoveSpent(step) {
    hud.movesLeft = step.movesLeft;
    screens.setHud(hudState());
  },
  onSwap() {
    audio.sfx('swap');
  },
  onReject() {
    audio.sfx('reject');
    haptics.buzz('reject');
  },
  onClearStep(step) {
    hud.score = step.scoreTotal;
    hud.goal = step.goal;
    screens.setHud(hudState());

    const specials = step.cleared.filter((e) => e.kind !== 'normal').length + step.created.length;
    renderer.state.shake = {
      amp: Math.min(2 + step.cascade * 2 + specials * 3, 10),
      until: performance.now() + 280,
    };

    audio.sfx('pop', { pitch: 1.06 ** step.cascade });
    if (step.cleared.some((e) => e.cause !== 'match')) {
      audio.sfx('blast');
      haptics.buzz('blast');
    } else {
      haptics.buzz('pop');
    }

    if (step.cascade >= 1) {
      screens.showBanner(
        STRINGS.banners[Math.min(step.cascade - 1, STRINGS.banners.length - 1)],
      );
    }

    for (const group of step.groups) {
      const centroid = {
        r: group.cells.reduce((a, p) => a + p.r, 0) / group.cells.length,
        c: group.cells.reduce((a, p) => a + p.c, 0) / group.cells.length,
      };
      particles.scoreFloat(centroid, String(group.points), group.color);
    }
    const grouped = step.groups.reduce((a, g) => a + g.points, 0);
    const ungrouped = step.scoreDelta - grouped;
    if (ungrouped > 0 && step.cleared.length > 0) {
      particles.scoreFloat(step.cleared[0].pos, String(ungrouped));
    }

    const flashed = new Set();
    for (const e of step.cleared) {
      if (!e.sourcePos) continue;
      const key = `${e.cause}|${e.sourcePos.r},${e.sourcePos.c}`;
      if (flashed.has(key)) continue;
      flashed.add(key);
      if (e.cause === 'striped_h') particles.flash('row', { index: e.sourcePos.r });
      else if (e.cause === 'striped_v') particles.flash('col', { index: e.sourcePos.c });
      else particles.flash('ring', { pos: e.sourcePos });
    }
  },
  onTilePop(entry) {
    const special = entry.kind !== 'normal';
    particles.burst(entry.pos, entry.color, special ? 14 : 8, special ? 1.5 : 1);
  },
  onSpecialCreated(created) {
    audio.sfx('special');
    haptics.buzz('special');
    particles.flash('ring', { pos: created.pos });
  },
  onFallLand() {
    audio.sfx('land');
  },
  onShuffle() {
    audio.sfx('shuffle');
    haptics.buzz('shuffle');
  },
  async onEnd(step) {
    if (step.bonus) {
      for (let i = 0; i < step.bonus.movesConverted; i++) {
        await clock.wait(85);
        hud.score += step.bonus.perMove;
        hud.movesLeft = Math.max(0, hud.movesLeft - 1);
        if (hud.goal?.type === 'score') hud.goal = { ...hud.goal, current: hud.score };
        screens.setHud(hudState());
        audio.sfx('bonus', { pitch: 1 + i * 0.06 });
      }
      await clock.wait(160);
    }
    if (step.outcome === 'won') {
      audio.sfx('win');
      haptics.buzz('win');
    } else {
      audio.sfx('lose');
      haptics.buzz('lose');
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
  const session = game;
  const result = session.applyMove(move);
  await playback.play(session, result.steps);
  if (game !== session) return; // quit/restart happened mid-animation
  syncHudToGame();
  lastActivity = performance.now();
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
  const board = game.board;
  renderer.setBoardSize(def.rows, def.cols, (r, c) => board.isHole(r, c));
  renderer.syncFromBoard(game.board);
  renderer.state.selection = null;
  particles.clear();
  lastActivity = performance.now();
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
  const session = game;
  setTimeout(() => {
    if (game !== session) return; // player already left the game screen
    if (endStep.outcome === 'won') {
      screens.showDialog('won', {
        stars: endStep.stars,
        score: endStep.score,
        levelId: def.id,
        levelName: def.name,
        hasNext: def.id < LEVELS.length,
      });
      for (let i = 0; i < endStep.stars; i++) {
        setTimeout(() => audio.sfx('star', { pitch: 1 + i * 0.26 }), 400 + i * 300);
      }
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

// Audio unlock must ride a user gesture; track activity for the idle hint.
let lastActivity = performance.now();
document.addEventListener(
  'pointerdown',
  () => {
    lastActivity = performance.now();
    audio.unlock();
  },
  { capture: true, passive: true },
);

setInterval(() => {
  if (!game || game.status !== 'playing' || paused || playback.isLocked()) return;
  if (performance.now() - lastActivity > 5000) {
    showHint();
    lastActivity = performance.now();
  }
}, 1000);

function frame(now) {
  clock.tick(now);
  renderer.draw(now);
  particles.draw(renderer.ctx, now);
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
