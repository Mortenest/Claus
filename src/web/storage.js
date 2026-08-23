/**
 * Versioned localStorage persistence with an in-memory fallback (private
 * browsing can throw on any access). Schema v1:
 *   { version, levels: { [id]: { stars, bestScore, attempts } },
 *     settings: { sound, haptics } }
 */

const KEY = 'candy-claus/v1';

const defaults = () => ({
  version: 1,
  levels: {},
  settings: { sound: true, haptics: true },
});

let memory = null; // fallback store when localStorage is unavailable

function read() {
  try {
    const raw = globalThis.localStorage?.getItem(KEY);
    if (raw) {
      const data = JSON.parse(raw);
      if (data && data.version === 1) return { ...defaults(), ...data };
    }
  } catch {
    // fall through to memory
  }
  return memory ?? defaults();
}

function write(state) {
  memory = state;
  try {
    globalThis.localStorage?.setItem(KEY, JSON.stringify(state));
  } catch {
    // memory copy already holds it
  }
}

export function loadProgress() {
  return read();
}

export function levelProgress(state, id) {
  return state.levels[id] ?? { stars: 0, bestScore: 0, attempts: 0 };
}

/** Highest unlocked level id (level n+1 unlocks when n is won). */
export function unlockedUpTo(state, levelCount) {
  let unlocked = 1;
  while (unlocked < levelCount && levelProgress(state, unlocked).stars > 0) unlocked++;
  return unlocked;
}

export function bumpAttempt(id) {
  const state = read();
  const lp = levelProgress(state, id);
  state.levels[id] = { ...lp, attempts: lp.attempts + 1 };
  write(state);
  return state.levels[id].attempts - 1; // 0-based attempt just started
}

export function recordResult(id, stars, score) {
  const state = read();
  const lp = levelProgress(state, id);
  state.levels[id] = {
    ...lp,
    stars: Math.max(lp.stars, stars),
    bestScore: Math.max(lp.bestScore, score),
  };
  write(state);
  return state;
}

export function updateSettings(patch) {
  const state = read();
  state.settings = { ...state.settings, ...patch };
  write(state);
  return state.settings;
}
