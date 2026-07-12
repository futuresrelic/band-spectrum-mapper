import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  initialCrowdMemory, stepCrowdMemory, warmthToGlowOpacity, FACTION_ORDER, DEFAULT_CROWD_MEMORY_TUNING,
} from './crowdMemory.js';
import type { FactionPulseSummary } from '../../api/headliner';

function faction(id: FactionPulseSummary['id'], overrides: Partial<FactionPulseSummary> = {}): FactionPulseSummary {
  return { id, direction: 'flat', intensity: 'low', atWalkoutRisk: false, relevanceRank: 0, crowdShare: 0.2, ...overrides };
}

test('initialCrowdMemory starts every faction at neutral (0) warmth', () => {
  const memory = initialCrowdMemory();
  for (const id of FACTION_ORDER) assert.equal(memory[id].warmth, 0);
});

test('a strong positive reaction nudges warmth up, never teleports to the target in one step', () => {
  const memory = initialCrowdMemory();
  const next = stepCrowdMemory(memory, [faction('casual', { direction: 'up', intensity: 'high' })], 0);
  assert.ok(next.casual.warmth > 0, 'warmth should move up');
  assert.ok(next.casual.warmth < 85, 'warmth should not jump straight to the target');
});

test('warmth decays back toward neutral over elapsed time with no new reaction', () => {
  const warm: ReturnType<typeof initialCrowdMemory> = { ...initialCrowdMemory(), casual: { warmth: 80 } };
  const decayed = stepCrowdMemory(warm, [faction('casual', { direction: 'flat' })], DEFAULT_CROWD_MEMORY_TUNING.decayHalfLifeMs);
  assert.ok(decayed.casual.warmth < 80, 'warmth should have decayed');
  assert.ok(decayed.casual.warmth > 0, 'should not have decayed all the way to zero in one half-life given some responsiveness pull');
});

test('repeated positive steps converge upward without ever exceeding 100', () => {
  let memory = initialCrowdMemory();
  for (let i = 0; i < 50; i++) {
    memory = stepCrowdMemory(memory, [faction('hardcore', { direction: 'up', intensity: 'high' })], 100);
  }
  assert.ok(memory.hardcore.warmth <= 100);
  assert.ok(memory.hardcore.warmth > 70, 'should have converged close to the high-intensity target');
});

test('a faction at walkout risk always targets strongly negative warmth regardless of direction/intensity', () => {
  let memory = initialCrowdMemory();
  for (let i = 0; i < 20; i++) {
    memory = stepCrowdMemory(memory, [faction('deepCut', { direction: 'up', intensity: 'high', atWalkoutRisk: true })], 500);
  }
  assert.ok(memory.deepCut.warmth < -50, 'walkout risk should drive warmth strongly negative even with an "up" direction reading');
});

test('a faction missing from the current pulse reading (e.g. not ranked) still decays toward neutral, never freezes', () => {
  const warm: ReturnType<typeof initialCrowdMemory> = { ...initialCrowdMemory(), progHeads: { warmth: 60 } };
  const next = stepCrowdMemory(warm, [], DEFAULT_CROWD_MEMORY_TUNING.decayHalfLifeMs);
  assert.ok(next.progHeads.warmth < 60);
});

test('stepCrowdMemory is a pure function — identical inputs always produce identical output', () => {
  const memory = initialCrowdMemory();
  const factions = [faction('casual', { direction: 'up', intensity: 'medium' }), faction('firstTimers', { direction: 'down', intensity: 'low' })];
  assert.deepEqual(stepCrowdMemory(memory, factions, 1200), stepCrowdMemory(memory, factions, 1200));
});

test('warmthToGlowOpacity maps -100..100 to 0..1 and clamps outside that range', () => {
  assert.equal(warmthToGlowOpacity(-100), 0);
  assert.equal(warmthToGlowOpacity(0), 0.5);
  assert.equal(warmthToGlowOpacity(100), 1);
  assert.equal(warmthToGlowOpacity(-500), 0);
  assert.equal(warmthToGlowOpacity(500), 1);
});
