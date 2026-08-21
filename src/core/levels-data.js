/**
 * The level list — pure data. Star thresholds are calibrated against greedy
 * bot free-plays (tools/balance.js, 100 games/level): the 1★ target sits at
 * ~20% of the bot's median final score on early levels rising to ~58% on
 * late ones, 3★ near the bot median. Bot medians noted per level.
 */

/** @type {import('./levels.js').LevelDef[]} */
export const LEVELS = [
  {
    // bot median 39,555
    id: 1,
    name: 'First Crunch',
    rows: 8, cols: 8, colorCount: 4,
    moves: 20,
    goal: { type: 'score', target: 8000 },
    stars: [8000, 20000, 36000],
    seedBase: 0xc1a05001,
  },
  {
    // bot median 39,605
    id: 2,
    name: 'Warm Swirl',
    rows: 8, cols: 8, colorCount: 4,
    moves: 18,
    goal: { type: 'score', target: 10000 },
    stars: [10000, 24000, 40000],
    seedBase: 0xc1a05002,
  },
  {
    // bot median 15,490
    id: 3,
    name: 'Five Flavors',
    rows: 8, cols: 8, colorCount: 5,
    moves: 20,
    goal: { type: 'score', target: 5000 },
    stars: [5000, 9000, 14000],
    seedBase: 0xc1a05003,
  },
  {
    // bot median: 52 red collected, 13,285 score
    id: 4,
    name: 'Red Harvest',
    rows: 8, cols: 8, colorCount: 5,
    moves: 18,
    goal: { type: 'collect', color: 0, count: 28 },
    stars: [4500, 9000, 13500],
    seedBase: 0xc1a05004,
  },
  {
    // bot median 12,405
    id: 5,
    name: 'Tight Squeeze',
    rows: 8, cols: 8, colorCount: 5,
    moves: 16,
    goal: { type: 'score', target: 4500 },
    stars: [4500, 8000, 12500],
    seedBase: 0xc1a05005,
  },
  {
    // bot median: 46 blue collected, 11,275 score
    id: 6,
    name: 'Blue Monday',
    rows: 7, cols: 8, colorCount: 5,
    moves: 18,
    goal: { type: 'collect', color: 4, count: 30 },
    stars: [4500, 8000, 11500],
    seedBase: 0xc1a05006,
  },
  {
    // bot median 6,845
    id: 7,
    name: 'Full Spectrum',
    rows: 8, cols: 8, colorCount: 6,
    moves: 20,
    goal: { type: 'score', target: 2800 },
    stars: [2800, 4800, 7000],
    seedBase: 0xc1a05007,
  },
  {
    // bot median: 38 green collected, 9,545 score
    id: 8,
    name: 'Green Field',
    rows: 9, cols: 9, colorCount: 6,
    moves: 22,
    goal: { type: 'collect', color: 3, count: 26 },
    stars: [4000, 6800, 9800],
    seedBase: 0xc1a05008,
  },
  {
    // bot median 6,005
    id: 9,
    name: 'Short Fuse',
    rows: 8, cols: 8, colorCount: 6,
    moves: 16,
    goal: { type: 'score', target: 2800 },
    stars: [2800, 4500, 6200],
    seedBase: 0xc1a05009,
  },
  {
    // bot median: 27 purple collected, 6,230 score
    id: 10,
    name: 'Purple Rain',
    rows: 9, cols: 7, colorCount: 6,
    moves: 18,
    goal: { type: 'collect', color: 5, count: 20 },
    stars: [3000, 4800, 6500],
    seedBase: 0xc1a0500a,
  },
  {
    // bot median 5,055
    id: 11,
    name: 'No Slack',
    rows: 8, cols: 8, colorCount: 6,
    moves: 14,
    goal: { type: 'score', target: 2800 },
    stars: [2800, 4200, 5500],
    seedBase: 0xc1a0500b,
  },
  {
    // bot median 9,000 — the boss board
    id: 12,
    name: 'The Big Crunch',
    rows: 9, cols: 7, colorCount: 6,
    moves: 25,
    goal: { type: 'score', target: 5200 },
    stars: [5200, 7500, 9800],
    seedBase: 0xc1a0500c,
  },
];
