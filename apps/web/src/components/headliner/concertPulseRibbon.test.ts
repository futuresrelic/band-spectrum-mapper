import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computePulseRibbonParams } from './concertPulseRibbon.js';
import { NEUTRAL_VISUAL_STATE, type ConcertVisualState } from './concertVisualState.js';

function state(overrides: Partial<ConcertVisualState> = {}): ConcertVisualState {
  return { ...NEUTRAL_VISUAL_STATE, ...overrides };
}

test('a healthy show (good pacing, no split room, no walkout risk) reads as highly coherent — one segment', () => {
  const params = computePulseRibbonParams(state({
    metrics: { satisfaction: 80, authenticity: 80, pacing: 100, energy: 75, emotionalMomentum: 70 },
  }));
  assert.equal(params.coherence, 1);
  assert.equal(params.segmentCount, 1);
});

test('awkward pacing lowers coherence and increases fragmentation', () => {
  const smooth = computePulseRibbonParams(state({ metrics: { satisfaction: 60, authenticity: 60, pacing: 90, energy: 60, emotionalMomentum: 60 } }));
  const awkward = computePulseRibbonParams(state({ metrics: { satisfaction: 60, authenticity: 60, pacing: 20, energy: 60, emotionalMomentum: 60 } }));
  assert.ok(awkward.coherence < smooth.coherence);
  assert.ok(awkward.segmentCount >= smooth.segmentCount);
});

test('a split room or walkout risk fragments the ribbon even with decent pacing', () => {
  const base = computePulseRibbonParams(state({ metrics: { satisfaction: 60, authenticity: 60, pacing: 80, energy: 60, emotionalMomentum: 60 } }));
  const split = computePulseRibbonParams(state({ metrics: { satisfaction: 60, authenticity: 60, pacing: 80, energy: 60, emotionalMomentum: 60 }, isSplitRoom: true }));
  const walkout = computePulseRibbonParams(state({ metrics: { satisfaction: 60, authenticity: 60, pacing: 80, energy: 60, emotionalMomentum: 60 }, walkoutRisk: true }));
  assert.ok(split.coherence < base.coherence);
  assert.ok(walkout.coherence < base.coherence);
});

test('recovery nudges coherence back up even before the underlying pacing metric fully recovers', () => {
  const metrics = { satisfaction: 50, authenticity: 50, pacing: 40, energy: 50, emotionalMomentum: 50 };
  const notRecovering = computePulseRibbonParams(state({ metrics }));
  const recovering = computePulseRibbonParams(state({ metrics, isRecovery: true }));
  assert.ok(recovering.coherence > notRecovering.coherence);
});

test('coherence and brightness always stay within [0,1] regardless of extreme inputs', () => {
  const extreme = computePulseRibbonParams(state({
    metrics: { satisfaction: 0, authenticity: 0, pacing: 0, energy: 0, emotionalMomentum: 0 },
    isSplitRoom: true, walkoutRisk: true,
  }));
  assert.ok(extreme.coherence >= 0 && extreme.coherence <= 1);
  assert.ok(extreme.brightness >= 0 && extreme.brightness <= 1);
  assert.ok(extreme.amplitude >= 0 && extreme.amplitude <= 1);
});

test('higher momentum intensity increases amplitude', () => {
  const low = computePulseRibbonParams(state({ momentumIntensity: 'low' }));
  const high = computePulseRibbonParams(state({ momentumIntensity: 'high' }));
  assert.ok(high.amplitude > low.amplitude);
});

test('missing metrics (before any song played) still produce valid, finite params', () => {
  const params = computePulseRibbonParams(NEUTRAL_VISUAL_STATE);
  for (const value of Object.values(params)) assert.ok(Number.isFinite(value));
});
