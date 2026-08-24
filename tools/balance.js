/**
 * Dev-only balance calibration: a greedy bot plays every level's REAL goal
 * (so early wins fire the Sweet Finish finale and its points count),
 * printing win rate and final-score percentiles across the winning runs.
 * Star thresholds in levels-data.js are set from these distributions; run
 * with `node tools/balance.js [gamesPerLevel]`.
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

const gamesPerLevel = Number(process.argv[2] ?? 100);

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

function playReal(def, attempt) {
  const goalColor = def.goal.type === 'collect' ? def.goal.color : null;
  const game = new Game(def, attemptSeed(def, attempt));
  while (game.status === 'playing') {
    game.applyMove(pickMove(game, def, goalColor));
  }
  return { won: game.status === 'won', score: game.score };
}

function pct(sorted, p) {
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
}

for (const def of LEVELS) {
  const wonScores = [];
  let wins = 0;
  for (let attempt = 0; attempt < gamesPerLevel; attempt++) {
    const { won, score } = playReal(def, attempt);
    if (won) {
      wins++;
      wonScores.push(score);
    }
  }
  wonScores.sort((a, b) => a - b);
  const winPct = Math.round((wins / gamesPerLevel) * 100);
  const line =
    wonScores.length === 0
      ? 'no wins'
      : [10, 25, 50, 75, 90].map((p) => `p${p}=${pct(wonScores, p)}`).join(' ');
  console.log(
    `L${String(def.id).padStart(2)} ${def.name.padEnd(16)} win=${String(winPct).padStart(3)}%  won-score: ${line}`,
  );
}
