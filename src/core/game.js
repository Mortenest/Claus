/**
 * The session facade — the one class the presentation layer (and future
 * ports) drive. Owns level state: score, moves left, goal progress, and
 * status. applyMove wraps the resolution engine's script with the
 * session-level steps:
 *
 *   invalid swap → { valid:false, steps:[{ type:'reject', a, b,
 *                    reason:'no-match' }] }        (move NOT spent)
 *   valid swap   → { valid:true, steps:[
 *                    { type:'moveSpent', movesLeft },
 *                    …resolution steps, with a goal snapshot stamped onto
 *                     every clear step…,
 *                    { type:'end', outcome, stars, score, bonus? }  (only
 *                     when the level just ended) ] }
 *
 * The level ends the moment the goal is met after the board settles. An
 * early win triggers the Sweet Finish (see resolve.js: remaining moves
 * become striped candies that all detonate, scoring normally) before stars
 * are computed; end.bonus = { movesConverted, total } describes it. A level
 * that runs out of moves without meeting the goal is lost. Winning always
 * grants at least one star; a lost level grants none.
 */

import { createRng } from './rng.js';
import { createTileFactory, isAdjacent } from './tiles.js';
import { generateBoard } from './generate.js';
import { resolveMove, resolveFinale } from './resolve.js';
import { isValidMove, findHint, findValidMoves } from './moves.js';

/**
 * @typedef {{ type:'score', target:number, current:number }
 *         | { type:'collect', color:number, count:number, current:number }} GoalState
 */

export class Game {
  /**
   * @param {import('./levels.js').LevelDef} levelDef
   * @param {number} seed uint32 (see rng.deriveSeed for per-attempt seeds)
   * @param {{ board?: import('./board.js').Board, factory?: object, rng?: object }} [internals]
   *   test hook: inject a fixture board instead of generating one
   */
  constructor(levelDef, seed, internals = {}) {
    this._level = levelDef;
    this._rng = internals.rng ?? createRng(seed);
    this._factory = internals.factory ?? createTileFactory();
    this._board = internals.board ?? generateBoard(levelDef, this._rng, this._factory);
    this._score = 0;
    this._movesLeft = levelDef.moves;
    this._collected = 0;
    this._status = 'playing';
  }

  /** Live board — treat as read-only; clone() before experimenting on it. */
  get board() {
    return this._board;
  }

  get level() {
    return this._level;
  }

  get score() {
    return this._score;
  }

  get movesLeft() {
    return this._movesLeft;
  }

  /** @returns {'playing'|'won'|'lost'} */
  get status() {
    return this._status;
  }

  /** @returns {GoalState} */
  get goal() {
    const goal = this._level.goal;
    if (goal.type === 'score') {
      return { type: 'score', target: goal.target, current: this._score };
    }
    return { type: 'collect', color: goal.color, count: goal.count, current: this._collected };
  }

  /**
   * @param {import('./moves.js').Move} move
   * @returns {{ valid: boolean, steps: object[] }}
   */
  applyMove(move) {
    if (this._status !== 'playing') {
      throw new Error(`applyMove on a ${this._status} game`);
    }
    if (
      !this._board.inBounds(move.from.r, move.from.c) ||
      !this._board.inBounds(move.to.r, move.to.c) ||
      this._board.isHole(move.from.r, move.from.c) ||
      this._board.isHole(move.to.r, move.to.c) ||
      !isAdjacent(move.from, move.to)
    ) {
      throw new Error('applyMove: cells must be adjacent and on the board');
    }

    if (!isValidMove(this._board, move)) {
      const a = this._board.get(move.from.r, move.from.c);
      const b = this._board.get(move.to.r, move.to.c);
      return {
        valid: false,
        steps: [
          {
            type: 'reject',
            a: { id: a.id, from: pos(move.from), to: pos(move.to) },
            b: { id: b.id, from: pos(move.to), to: pos(move.from) },
            reason: 'no-match',
          },
        ],
      };
    }

    this._movesLeft--;
    const steps = [{ type: 'moveSpent', movesLeft: this._movesLeft }];

    const result = resolveMove(this._resolveCtx(), move);
    this._score += result.scoreDelta;
    this._stampGoals(result.steps);
    steps.push(...result.steps);

    const goalMet = this._goalMet();
    if (goalMet || this._movesLeft === 0) {
      this._status = goalMet ? 'won' : 'lost';
      let bonus;
      if (goalMet && this._movesLeft > 0) {
        const finale = resolveFinale(this._resolveCtx(), this._movesLeft);
        this._score += finale.scoreDelta;
        this._movesLeft = 0;
        this._stampGoals(finale.steps);
        steps.push(...finale.steps);
        if (finale.conversions > 0) {
          bonus = { movesConverted: finale.conversions, total: finale.scoreDelta };
        }
      }
      const stars = goalMet ? Math.max(1, this.starsForScore(this._score)) : 0;
      const end = { type: 'end', outcome: this._status, stars, score: this._score };
      if (bonus) end.bonus = bonus;
      steps.push(end);
    }
    return { valid: true, steps };
  }

  /** @returns {0|1|2|3} thresholds passed (win floor of 1 star not applied) */
  starsForScore(score) {
    let stars = 0;
    for (const threshold of this._level.stars) {
      if (score >= threshold) stars++;
    }
    return stars;
  }

  findHint() {
    return findHint(this._board);
  }

  validMoves() {
    return findValidMoves(this._board);
  }

  _resolveCtx() {
    return {
      board: this._board,
      rng: this._rng,
      factory: this._factory,
      colorCount: this._level.colorCount,
      scoreStart: this._score,
    };
  }

  /** Stamp a goal snapshot onto every clear step; collect progress is monotone. */
  _stampGoals(steps) {
    const goalColor = this._level.goal.type === 'collect' ? this._level.goal.color : null;
    let running = this._collected;
    for (const step of steps) {
      if (step.type !== 'clear') continue;
      if (goalColor !== null) running += step.collected[goalColor] ?? 0;
      step.goal = this._goalSnapshot(step.scoreTotal, running);
    }
    this._collected = running;
  }

  _goalMet() {
    const goal = this._level.goal;
    return goal.type === 'score' ? this._score >= goal.target : this._collected >= goal.count;
  }

  _goalSnapshot(scoreTotal, collected) {
    const goal = this._level.goal;
    if (goal.type === 'score') {
      return { type: 'score', target: goal.target, current: scoreTotal };
    }
    return { type: 'collect', color: goal.color, count: goal.count, current: collected };
  }
}

function pos(p) {
  return { r: p.r, c: p.c };
}
