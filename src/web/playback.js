/**
 * The sync layer between the core's step script and the screen. Consumes a
 * MoveResult's steps in order, driving renderer visuals through tweens.
 * Input stays locked from applyMove until the queue drains. A fall step
 * immediately followed by its spawn step plays concurrently (one gravity
 * phase), per the protocol.
 *
 * `effects` hooks (all optional) let the juice layer attach particles,
 * audio, haptics, and HUD updates without playback knowing about them:
 * onMoveSpent, onSwap, onReject, onClearStep, onTilePop, onSpecialCreated,
 * onFallLand, onSpawn, onShuffle, onEnd.
 *
 * verifySync is the desync tripwire: after every queue drain the visual map
 * must mirror game.board exactly (stable tile ids make this checkable); on
 * mismatch it logs and self-heals with a hard resync.
 */

import { ease } from './tween.js';

export function createPlayback({ renderer, clock, effects = {} }) {
  let runId = 0;
  let locked = false;
  const fx = (name, ...args) => effects[name]?.(...args);

  async function play(game, steps) {
    const run = ++runId;
    locked = true;
    try {
      for (let i = 0; i < steps.length; i++) {
        if (run !== runId) return;
        const step = steps[i];
        if (step.type === 'fall' && steps[i + 1]?.type === 'spawn') {
          await Promise.all([playStep(step), playStep(steps[i + 1])]);
          i++;
        } else {
          await playStep(step);
        }
      }
      if (run === runId) verifySync(game);
    } finally {
      if (run === runId) locked = false;
    }
  }

  const visualOf = (id) => renderer.visuals.get(id);

  function playStep(step) {
    switch (step.type) {
      case 'moveSpent':
        fx('onMoveSpent', step);
        return Promise.resolve();
      case 'swap':
        fx('onSwap', step);
        return Promise.all(
          [step.a, step.b].map((ref) =>
            clock.tween(
              visualOf(ref.id),
              { row: ref.to.r, col: ref.to.c },
              { duration: 150, ease: ease.quadInOut },
            ),
          ),
        );
      case 'reject':
        return playReject(step);
      case 'clear':
        return playClear(step);
      case 'fall':
        return playFall(step);
      case 'spawn':
        return playSpawn(step);
      case 'shuffle':
        fx('onShuffle', step);
        return Promise.all(
          step.moves.map((m) =>
            clock.tween(
              visualOf(m.id),
              { row: m.to.r, col: m.to.c },
              { duration: 550, ease: ease.cubicInOut },
            ),
          ),
        );
      case 'finale':
        return playFinale(step);
      case 'end':
        // the juice layer may animate — await it
        return Promise.resolve(fx('onEnd', step));
      default:
        return Promise.resolve();
    }
  }

  async function playReject(step) {
    fx('onReject', step);
    const halfway = [step.a, step.b].map((ref) =>
      clock.tween(
        visualOf(ref.id),
        {
          row: ref.from.r + (ref.to.r - ref.from.r) * 0.55,
          col: ref.from.c + (ref.to.c - ref.from.c) * 0.55,
        },
        { duration: 110, ease: ease.quadOut },
      ),
    );
    await Promise.all(halfway);
    await Promise.all(
      [step.a, step.b].map((ref) =>
        clock.tween(
          visualOf(ref.id),
          { row: ref.from.r, col: ref.from.c },
          { duration: 220, ease: ease.elasticOut },
        ),
      ),
    );
  }

  async function playClear(step) {
    fx('onClearStep', step);
    const jobs = [];
    for (const entry of step.cleared) {
      const v = visualOf(entry.id);
      if (!v) continue;
      const dist = entry.sourcePos
        ? Math.hypot(entry.pos.r - entry.sourcePos.r, entry.pos.c - entry.sourcePos.c)
        : 0;
      const delay = entry.wave * 60 + dist * 12;
      jobs.push(
        (async () => {
          await clock.tween(v, { scaleX: 1.16, scaleY: 1.16 }, { duration: 70, delay, ease: ease.quadOut });
          fx('onTilePop', entry, v);
          await clock.tween(v, { scaleX: 0, scaleY: 0, alpha: 0 }, { duration: 150, ease: ease.quadIn });
          renderer.visuals.delete(entry.id);
        })(),
      );
    }
    for (const created of step.created) {
      jobs.push(
        (async () => {
          await clock.wait(200);
          renderer.visuals.delete(created.replacedId);
          const v = renderer.makeVisual(created.tile, created.pos.r, created.pos.c);
          v.scaleX = 0;
          v.scaleY = 0;
          renderer.visuals.set(created.tile.id, v);
          fx('onSpecialCreated', created, v);
          await clock.tween(v, { scaleX: 1, scaleY: 1 }, { duration: 240, ease: ease.backOut });
        })(),
      );
    }
    await Promise.all(jobs);
  }

  /** Sweet Finish: each unspent move morphs a candy into a striped, staggered. */
  async function playFinale(step) {
    fx('onFinaleStart', step);
    await Promise.all(
      step.conversions.map(async (conv, i) => {
        await clock.wait(1 + i * 130);
        renderer.visuals.delete(conv.replacedId);
        const v = renderer.makeVisual(conv.tile, conv.pos.r, conv.pos.c);
        v.scaleX = 0;
        v.scaleY = 0;
        renderer.visuals.set(conv.tile.id, v);
        fx('onFinaleConvert', conv, v, i);
        await clock.tween(v, { scaleX: 1, scaleY: 1 }, { duration: 220, ease: ease.backOut });
      }),
    );
    await clock.wait(140); // beat before the detonation round
  }

  const fallDuration = (rows) => 90 * Math.sqrt(Math.max(1, rows)) + 60;

  async function landAndSquash(v, target) {
    fx('onFallLand', target, v);
    await clock.tween(v, { scaleX: 1.1, scaleY: 0.86 }, { duration: 60, ease: ease.quadOut });
    await clock.tween(v, { scaleX: 1, scaleY: 1 }, { duration: 110, ease: ease.backOut });
  }

  function playFall(step) {
    return Promise.all(
      step.moves.map(async (m) => {
        const v = visualOf(m.id);
        if (!v) return;
        await clock.tween(
          v,
          { row: m.to.r, col: m.to.c },
          { duration: fallDuration(m.to.r - m.from.r), ease: ease.cubicIn },
        );
        await landAndSquash(v, m);
      }),
    );
  }

  function playSpawn(step) {
    return Promise.all(
      step.spawns.map(async (s) => {
        const v = renderer.makeVisual(s.tile, s.at.r - s.fromRowOffset, s.at.c);
        renderer.visuals.set(s.tile.id, v);
        fx('onSpawn', s, v);
        await clock.tween(
          v,
          { row: s.at.r },
          { duration: fallDuration(s.fromRowOffset), delay: s.at.c * 14, ease: ease.cubicIn },
        );
        await landAndSquash(v, s);
      }),
    );
  }

  function verifySync(game) {
    const board = game.board;
    let count = 0;
    for (const p of board.positions()) {
      const tile = board.get(p.r, p.c);
      if (tile === null) continue;
      count++;
      const v = renderer.visuals.get(tile.id);
      if (!v || Math.round(v.row) !== p.r || Math.round(v.col) !== p.c) {
        console.error('[candy] visual desync at', p, 'tile', tile.id, v);
        renderer.syncFromBoard(board);
        return;
      }
    }
    if (count !== renderer.visuals.size) {
      console.error('[candy] visual count mismatch:', count, 'on board,', renderer.visuals.size, 'drawn');
      renderer.syncFromBoard(board);
    }
  }

  return {
    play,
    isLocked: () => locked,
    cancel() {
      runId++;
      locked = false;
      clock.cancelAll();
    },
  };
}
