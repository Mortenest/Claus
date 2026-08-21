/**
 * Minimal promise-based tween engine on a rAF clock. main.js calls
 * clock.tick(now) once per frame; every active tween interpolates numeric
 * properties directly on its target object (renderer visuals, mostly).
 * Start values are captured when the tween begins (after its delay), so
 * chained tweens on the same property compose naturally. timeScale 0
 * freezes everything (pause) without losing state.
 */

export const ease = {
  linear: (t) => t,
  quadIn: (t) => t * t,
  quadOut: (t) => t * (2 - t),
  quadInOut: (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2),
  cubicIn: (t) => t * t * t,
  cubicOut: (t) => 1 - (1 - t) ** 3,
  cubicInOut: (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2),
  backOut: (t) => {
    const c1 = 1.70158;
    return 1 + (c1 + 1) * (t - 1) ** 3 + c1 * (t - 1) ** 2;
  },
  elasticOut: (t) => {
    if (t === 0 || t === 1) return t;
    return 2 ** (-10 * t) * Math.sin((t * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1;
  },
};

export function createClock() {
  /** @type {Set<{target, goals, from, start, duration, ease, resolve}>} */
  const active = new Set();
  let lastNow = 0;

  const clock = {
    timeScale: 1,
    now: 0, // scaled clock time in ms

    tick(now) {
      const dt = lastNow === 0 ? 0 : now - lastNow;
      lastNow = now;
      clock.now += dt * clock.timeScale;
      for (const tw of active) {
        if (clock.now < tw.start) continue;
        if (tw.from === null) {
          tw.from = {};
          for (const key of Object.keys(tw.goals)) tw.from[key] = tw.target[key] ?? 0;
        }
        const t = Math.min(1, (clock.now - tw.start) / tw.duration);
        const eased = tw.ease(t);
        for (const [key, to] of Object.entries(tw.goals)) {
          tw.target[key] = tw.from[key] + (to - tw.from[key]) * eased;
        }
        if (t >= 1) {
          active.delete(tw);
          tw.resolve();
        }
      }
    },

    /**
     * Animate target's numeric props to new values.
     * @returns {Promise<void>} resolves when the tween completes
     */
    tween(target, goals, { duration = 200, delay = 0, ease: easeFn = ease.quadOut } = {}) {
      return new Promise((resolve) => {
        active.add({
          target,
          goals,
          from: null,
          start: clock.now + delay,
          duration: Math.max(1, duration),
          ease: easeFn,
          resolve,
        });
      });
    },

    wait(ms) {
      return clock.tween({}, {}, { duration: Math.max(1, ms) });
    },

    /** Resolve and drop every active tween (level restart / skip). */
    cancelAll() {
      const pending = [...active];
      active.clear();
      for (const tw of pending) tw.resolve();
    },
  };

  return clock;
}
