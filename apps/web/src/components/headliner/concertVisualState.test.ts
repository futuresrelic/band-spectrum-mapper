/**
 * ConcertVisualState adapter (Phase Z.17.17) — tests via node:test/tsx.
 *
 * First pure-logic test in apps/web: no new dependency (tsx is already a
 * monorepo devDependency, used the same way apps/api's node:test suite
 * already runs). This only covers the adapter's pure derivation logic,
 * not React rendering — there is still no browser/component test runner
 * in this project.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildConcertVisualState, NEUTRAL_VISUAL_STATE, type BuildConcertVisualStateInput } from './concertVisualState.js';
import type { ConcertPulseState, PickResult } from '../../api/headliner';

function baseInput(overrides: Partial<BuildConcertVisualStateInput> = {}): BuildConcertVisualStateInput {
  return {
    pulse: null,
    metricsSnapshot: null,
    lastResult: null,
    reactionLogHistory: [],
    isChoosingEncore: false,
    hasEncorePlayed: false,
    isFinishedWithoutEncore: false,
    ...overrides,
  };
}

function makePulse(overrides: Partial<ConcertPulseState> = {}): ConcertPulseState {
  return {
    hasPlayedASong: true,
    momentumDirection: 'steady',
    momentumIntensity: 'low',
    isNewShowHigh: false,
    isNewShowLow: false,
    isRecovery: false,
    isSplitRoom: false,
    walkoutRisk: false,
    phase: 'middle',
    topLine: null,
    factions: [],
    ...overrides,
  };
}

test('before any song is played, every metric is null and attendanceRatio uses the documented neutral default', () => {
  const state = buildConcertVisualState(baseInput());
  assert.equal(state.hasStarted, false);
  assert.deepEqual(state.metrics, { satisfaction: null, authenticity: null, pacing: null, energy: null, emotionalMomentum: null });
  assert.equal(state.attendanceRatio, NEUTRAL_VISUAL_STATE.attendanceRatio);
});

test('metrics are read directly from the metrics snapshot, never recomputed', () => {
  const snapshot = {
    audienceRetention: 72, authenticity: 88, paceDiscipline: 61, energyCurveFit: 55, emotionalJourney: 40,
    spectrumMatch: 50, rarityExcitement: 50, diversity: 50, encoreQuality: 0, crowdPeak: 50,
  };
  const state = buildConcertVisualState(baseInput({ pulse: makePulse(), metricsSnapshot: snapshot }));
  assert.equal(state.metrics.satisfaction, 72);
  assert.equal(state.metrics.authenticity, 88);
  assert.equal(state.metrics.pacing, 61);
  assert.equal(state.metrics.energy, 55);
  assert.equal(state.metrics.emotionalMomentum, 40);
  assert.equal(state.attendanceRatio, 0.72);
});

test('attendanceRatio is clamped between 0.1 and 1 even for extreme satisfaction values', () => {
  const low = buildConcertVisualState(baseInput({
    pulse: makePulse(), metricsSnapshot: { audienceRetention: 0, authenticity: 0, paceDiscipline: 0, energyCurveFit: 0, emotionalJourney: 0, spectrumMatch: 0, rarityExcitement: 0, diversity: 0, encoreQuality: 0, crowdPeak: 0 },
  }));
  assert.equal(low.attendanceRatio, 0.1);
  const high = buildConcertVisualState(baseInput({
    pulse: makePulse(), metricsSnapshot: { audienceRetention: 100, authenticity: 100, paceDiscipline: 100, energyCurveFit: 100, emotionalJourney: 100, spectrumMatch: 100, rarityExcitement: 100, diversity: 100, encoreQuality: 100, crowdPeak: 100 },
  }));
  assert.equal(high.attendanceRatio, 1);
});

test('pulse fields pass through verbatim — the adapter never invents its own momentum/walkout/recovery reading', () => {
  const pulse = makePulse({ momentumDirection: 'falling', momentumIntensity: 'high', isRecovery: true, walkoutRisk: true, isSplitRoom: true, phase: 'encore' });
  const state = buildConcertVisualState(baseInput({ pulse }));
  assert.equal(state.momentumDirection, 'falling');
  assert.equal(state.momentumIntensity, 'high');
  assert.equal(state.isRecovery, true);
  assert.equal(state.walkoutRisk, true);
  assert.equal(state.isSplitRoom, true);
  assert.equal(state.phase, 'encore');
});

test('recentReactionLines takes only the last 3 songs\' worth of lines, in order', () => {
  const history = [
    { entries: [{ category: 'strongOpener' as const, text: 'line1' }] },
    { entries: [{ category: 'energySurge' as const, text: 'line2' }, { category: 'emotionalPeak' as const, text: 'line3' }] },
    { entries: [{ category: 'crowdRecovery' as const, text: 'line4' }] },
    { entries: [{ category: 'poorTransition' as const, text: 'line5' }] },
  ];
  const state = buildConcertVisualState(baseInput({ reactionLogHistory: history }));
  assert.deepEqual(state.recentReactionLines, ['line2', 'line3', 'line4', 'line5']);
});

test('encoreState reflects the exact screen-state flags passed in, never guesses', () => {
  assert.equal(buildConcertVisualState(baseInput()).encoreState, 'not_yet');
  assert.equal(buildConcertVisualState(baseInput({ pulse: makePulse({ phase: 'closing' }) })).encoreState, 'building');
  assert.equal(buildConcertVisualState(baseInput({ isChoosingEncore: true })).encoreState, 'choosing');
  assert.equal(buildConcertVisualState(baseInput({ hasEncorePlayed: true })).encoreState, 'playing');
  assert.equal(buildConcertVisualState(baseInput({ isFinishedWithoutEncore: true })).encoreState, 'declined');
});

test('currentSongTitle/TrackType/Axis come from lastResult.song verbatim, null when there is no last result', () => {
  const song: PickResult['song'] = {
    id: 's1', title: 'Test Song', albumTitle: null, durationSeconds: 200,
    liveTier: 'Frequent', liveSource: 'live', audienceIsFallback: false,
    trackType: 'Interlude', axis: { aggression: 3, complexity: 4, atmosphere: 8, emotion: 5, psychedelic: 2, concept: 1 },
  };
  const lastResult: PickResult = { song, factionReactions: {} as PickResult['factionReactions'], crowdEnergyDelta: 1, pacingPenalty: 0, rarityMoment: false };
  const state = buildConcertVisualState(baseInput({ lastResult }));
  assert.equal(state.currentSongTitle, 'Test Song');
  assert.equal(state.currentSongTrackType, 'Interlude');
  assert.deepEqual(state.currentSongAxis, song.axis);

  const withoutResult = buildConcertVisualState(baseInput());
  assert.equal(withoutResult.currentSongTitle, null);
  assert.equal(withoutResult.currentSongTrackType, null);
  assert.equal(withoutResult.currentSongAxis, null);
});
