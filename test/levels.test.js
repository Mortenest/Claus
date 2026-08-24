import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LEVELS, WORLDS, getLevel, attemptSeed, validateLevelDef, worldOf } from '../src/core/levels.js';

test('every level definition validates', () => {
  assert.ok(LEVELS.length >= 10);
  for (const def of LEVELS) validateLevelDef(def);
});

test('level ids are contiguous from 1 and names unique', () => {
  LEVELS.forEach((def, i) => assert.equal(def.id, i + 1));
  assert.equal(new Set(LEVELS.map((l) => l.name)).size, LEVELS.length);
  assert.equal(new Set(LEVELS.map((l) => l.seedBase)).size, LEVELS.length);
});

test('getLevel finds by id and throws on unknown', () => {
  assert.equal(getLevel(1).id, 1);
  assert.throws(() => getLevel(999));
});

test('attemptSeed is deterministic per attempt and varies', () => {
  const def = getLevel(1);
  assert.equal(attemptSeed(def, 0), attemptSeed(def, 0));
  assert.notEqual(attemptSeed(def, 0), attemptSeed(def, 1));
  assert.notEqual(attemptSeed(getLevel(1), 0), attemptSeed(getLevel(2), 0));
});

test('validateLevelDef rejects malformed definitions', () => {
  const base = getLevel(1);
  const broken = (patch) => ({ ...base, ...patch });
  assert.throws(() => validateLevelDef(broken({ colorCount: 2 })));
  assert.throws(() => validateLevelDef(broken({ moves: 0 })));
  assert.throws(() => validateLevelDef(broken({ stars: [100, 100, 300] })));
  assert.throws(() => validateLevelDef(broken({ goal: { type: 'score', target: -5 } })));
  assert.throws(() => validateLevelDef(broken({ goal: { type: 'collect', color: 9, count: 5 } })));
  assert.throws(() => validateLevelDef(broken({ goal: { type: 'mystery' } })));
  // score-goal 1★ must equal the target
  assert.throws(() =>
    validateLevelDef(broken({ goal: { type: 'score', target: 100 }, stars: [200, 300, 400] })),
  );
});

test('difficulty knobs stay in the tuned envelope', () => {
  for (const def of LEVELS) {
    const playable = def.layout
      ? def.layout.join('').split('').filter((ch) => ch === '.').length
      : def.rows * def.cols;
    assert.ok(playable >= 42, `level ${def.id} board too small (${playable} playable)`);
    if (def.goal.type === 'collect') {
      assert.ok(def.goal.color < def.colorCount, `level ${def.id} collect color missing`);
    }
  }
});

test('worlds partition the level list', () => {
  assert.equal(worldOf(1).theme, 'meadow');
  assert.equal(worldOf(9).theme, 'meadow');
  assert.equal(worldOf(10).theme, 'frost');
  assert.equal(worldOf(18).theme, 'frost');
  for (const world of WORLDS) {
    assert.ok(LEVELS.some((l) => l.id === world.firstLevel));
  }
});
