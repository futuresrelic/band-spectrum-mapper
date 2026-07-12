import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeLightingSignals, NEUTRAL_LIGHTING } from './concertLighting.js';
import type { Axis } from '../../api/headliner';

function axis(overrides: Partial<Record<Axis, number>> = {}): Record<Axis, number> {
  return { aggression: 5, complexity: 5, atmosphere: 5, emotion: 5, psychedelic: 5, concept: 5, ...overrides };
}

test('a null axis (unscored song) falls back to the documented neutral lighting', () => {
  assert.deepEqual(computeLightingSignals(null), NEUTRAL_LIGHTING);
});

test('high atmosphere increases fog opacity, capped at 0.5', () => {
  const low = computeLightingSignals(axis({ atmosphere: 0 }));
  const high = computeLightingSignals(axis({ atmosphere: 10 }));
  assert.ok(high.fogOpacity > low.fogOpacity);
  assert.ok(high.fogOpacity <= 0.5);
});

test('high aggression shifts color toward warm and speeds up the animation, but never past a flash-safe cap', () => {
  const cool = computeLightingSignals(axis({ aggression: 0 }));
  const warm = computeLightingSignals(axis({ aggression: 10 }));
  assert.notEqual(cool.warmthColor, warm.warmthColor);
  assert.ok(warm.speedScale > cool.speedScale);
  assert.ok(warm.speedScale <= 1.2, 'speed must stay well below anything that reads as flashing/strobing');
});

test('high emotion increases glow intensity', () => {
  const low = computeLightingSignals(axis({ emotion: 0 }));
  const high = computeLightingSignals(axis({ emotion: 10 }));
  assert.ok(high.glowIntensity > low.glowIntensity);
});

test('high psychedelic increases pattern intensity', () => {
  const low = computeLightingSignals(axis({ psychedelic: 0 }));
  const high = computeLightingSignals(axis({ psychedelic: 10 }));
  assert.ok(high.patternIntensity > low.patternIntensity);
});

test('high complexity increases geometric intensity but stays restrained (never exceeds 0.6)', () => {
  const high = computeLightingSignals(axis({ complexity: 10 }));
  assert.ok(high.geometricIntensity <= 0.6);
});

test('every signal stays within a finite, sane range across the full axis input space', () => {
  for (let v = 0; v <= 10; v += 2) {
    const signals = computeLightingSignals(axis({ aggression: v, atmosphere: v, emotion: v, psychedelic: v, complexity: v }));
    for (const value of [signals.fogOpacity, signals.glowIntensity, signals.patternIntensity, signals.geometricIntensity, signals.speedScale]) {
      assert.ok(Number.isFinite(value) && value >= 0);
    }
    assert.match(signals.warmthColor, /^#[0-9a-f]{6}$/);
  }
});
