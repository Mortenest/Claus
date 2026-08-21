/**
 * Dev-only balance calibration: a greedy bot free-plays every level's full
 * move budget (goal disabled) many times, printing score and goal-color
 * collection percentiles. Star thresholds in levels-data.js are set from
 * these distributions; run with `node tools/balance.js [gamesPerLevel]`.
 *
 * The bot ranks each candidate move by simulating it on a cloned board with
 * a throwaway rng — an approximation of the real outcome, which is exactly
 * the sort of imperfect lookahead a good human player has.
 */

import { LEVELS, attemptSeed } from '../src/core/levels.js';
import { Game } from '../src/core/game.js';
import { createRng } from '../src/core/rng.js';
import { createTileFactory } from '../src/core/tiles.js';
import { resolveMove } from '../src/core/resolve.js';

const gamesPerLevel = Number(process.argv[2] ?? 120);

function pickMove(game, def, goalColor) {
  let best = null;
  let bestRank = -Infinity;
  for (const move of game.validMoves()) {
    const evalCtx = {
      board: game.board.clone(),
      rng: createRng(0xeeee),
      factory: createTileFactory(1_000_000),
      colorCount: def.colorCount,
    };
    const res = resolveMove(evalCtx, move);
    const rank =
      goalColor !== null
        ? (res.collected[goalColor] ?? 0) * 1000 + res.scoreDelta
        : res.scoreDelta;
    if (rank > bestRank) {
      bestRank = rank;
      best = move;
    }
  }
  return best;
}

function freePlay(def, attempt) {
  const goalColor = def.goal.type === 'collect' ? def.goal.color : null;
  const uncapped = { ...def, goal: { type: 'score', target: 2 ** 30 } };
  const game = new Game(uncapped, attemptSeed(def, attempt));
  let collected = 0;
  while (game.status === 'playing') {
    const { steps } = game.applyMove(pickMove(game, def, goalColor));
    if (goalColor !== null) {
      for (const s of steps) {
        if (s.type === 'clear') collected += s.collected[goalColor] ?? 0;
      }
    }
  }
  return { score: game.score, collected };
}

function pct(sorted, p) {
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
}

for (const def of LEVELS) {
  const scores = [];
  const collects = [];
  for (let attempt = 0; attempt < gamesPerLevel; attempt++) {
    const { score, collected } = freePlay(def, attempt);
    scores.push(score);
    collects.push(collected);
  }
  scores.sort((a, b) => a - b);
  collects.sort((a, b) => a - b);
  const line = [10, 25, 40, 50, 75, 90].map((p) => `p${p}=${pct(scores, p)}`).join(' ');
  console.log(`L${String(def.id).padStart(2)} ${def.name.padEnd(16)} ${def.goal.type.padEnd(7)} score: ${line}`);
  if (def.goal.type === 'collect') {
    const cline = [10, 25, 40, 50, 75, 90].map((p) => `p${p}=${pct(collects, p)}`).join(' ');
    console.log(`    collect(color ${def.goal.color}): ${cline}`);
  }
}
