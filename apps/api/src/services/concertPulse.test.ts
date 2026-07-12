/**
 * Headliner Concert Pulse (Creative Bible §14) — tests via node:test.
 *
 * Verifies the pulse never invents anything the engine hasn't already
 * computed (it's a pure re-read of EngineState/SongHistoryEntry), that
 * faction relevance ranking is deterministic and never hides a walkout
 * warning, and that the whole snapshot replays identically for the same
 * seed and picks.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createInitialState, generateCandidates, applyPick, isMainSetComplete,
  DEFAULT_SHOW_RULES, FACTIONS,
  type ShowBundle, type EngineSong, type Axis, type EngineState, type ShowRules,
} from './concertEngine.js';
import { computeConcertPulse, rankFactionsByRelevance } from './concertPulse.js';

const NEUTRAL_AUDIENCE = {
  progressive: 50, heavy: 50, technical: 50, atmospheric: 50, experimental: 50,
  accessible: 50, psychedelic: 50, emotional: 50, aggressive: 50, improvisational: 50,
};

function makeSong(id: string, overrides: Partial<EngineSong> = {}): EngineSong {
  const axis: Record<Axis, number> = {
    aggression: 5, complexity: 5, atmosphere: 5, emotion: 5, psychedelic: 5, concept: 5,
    ...(overrides.axis ?? {}),
  };
  return {
    id, title: `Song ${id}`, albumId: `album-${id}`, albumTitle: `Album ${id}`,
    durationSeconds: 240, axis, tempoEnergy: 6,
    audience: { ...NEUTRAL_AUDIENCE, ...(overrides.audience ?? {}) },
    audienceIsFallback: false, liveTier: 'Frequent', liveSource: 'live', liveValue: 30,
    ...overrides,
  };
}

function makeBundle(songs: EngineSong[], rulesOverride: Partial<ShowRules> = {}): ShowBundle {
  return {
    bandId: 'band-1', bandName: 'Test Band', songs,
    targetSpectrum: { aggression: 5, complexity: 5, atmosphere: 5, emotion: 5, psychedelic: 5, concept: 5 },
    venue: null, showLengthBudgetSeconds: 60 * 70,
    rules: { ...DEFAULT_SHOW_RULES, minSongs: songs.length, maxSongs: songs.length, ...rulesOverride },
  };
}

function playFullShow(seed: string, songs: EngineSong[]): EngineState {
  const bundle = makeBundle(songs);
  let state = createInitialState(bundle, seed);
  while (!isMainSetComplete(state)) {
    const hand = generateCandidates(state);
    state = hand.state;
    const choice = hand.candidates[0];
    if (!choice) break;
    const result = applyPick(state, choice.id);
    if (!result) break;
    state = result.state;
  }
  return state;
}

test('computeConcertPulse before any pick reports no song played and steady momentum', () => {
  const bundle = makeBundle([makeSong('s0')]);
  const state = createInitialState(bundle, 'pulse-empty-seed');
  const pulse = computeConcertPulse(state);
  assert.equal(pulse.hasPlayedASong, false);
  assert.equal(pulse.momentumDirection, 'steady');
  assert.equal(pulse.isNewShowHigh, false);
  assert.equal(pulse.isNewShowLow, false);
});

test('rankFactionsByRelevance always returns exactly 5 factions with a unique rank 0..4', () => {
  const songs = Array.from({ length: 8 }, (_, i) => makeSong(`s${i}`, {
    audience: { ...NEUTRAL_AUDIENCE, technical: (i * 23) % 100 },
  }));
  const state = playFullShow('rank-seed', songs);
  const ranked = rankFactionsByRelevance(state);
  assert.equal(ranked.length, FACTIONS.length);
  const ranks = ranked.map((r) => r.relevanceRank).sort((a, b) => a - b);
  assert.deepEqual(ranks, [0, 1, 2, 3, 4]);
  const ids = new Set(ranked.map((r) => r.id));
  assert.equal(ids.size, FACTIONS.length);
});

test('a faction at walkout risk always ranks first, regardless of the other relevance factors', () => {
  // Extremely casual-hostile songs, repeated until casual's momentum crosses the walkout band.
  const hostile = { ...NEUTRAL_AUDIENCE, accessible: 0, technical: 100, experimental: 100, progressive: 100, emotional: 0 };
  const songs = Array.from({ length: 10 }, (_, i) => makeSong(`s${i}`, { audience: hostile }));
  const bundle = makeBundle(songs, { minSongs: 10, maxSongs: 10 });
  let state = createInitialState(bundle, 'walkout-rank-seed');
  while (!isMainSetComplete(state)) {
    const hand = generateCandidates(state);
    state = hand.state;
    const choice = hand.candidates[0];
    if (!choice) break;
    const result = applyPick(state, choice.id);
    if (!result) break;
    state = result.state;
    if (state.factionMomentum.casual <= -45) break;
  }
  assert.ok(state.factionMomentum.casual <= -45, 'test setup should have driven casual into walkout territory');
  const ranked = rankFactionsByRelevance(state);
  const casual = ranked.find((r) => r.id === 'casual')!;
  assert.equal(casual.relevanceRank, 0);
  assert.equal(casual.atWalkoutRisk, true);
});

test('each faction summary carries its real ShowRules.factionShare, not a fabricated crowd size', () => {
  const songs = Array.from({ length: 4 }, (_, i) => makeSong(`s${i}`));
  const customShare = { casual: 0.5, hardcore: 0.2, deepCut: 0.1, progHeads: 0.1, firstTimers: 0.1 };
  const bundle = makeBundle(songs, { factionShare: customShare });
  const state = createInitialState(bundle, 'share-seed');
  const ranked = rankFactionsByRelevance(state);
  for (const f of ranked) assert.equal(f.crowdShare, customShare[f.id]);
});

test('rankFactionsByRelevance is deterministic for the same state', () => {
  const songs = Array.from({ length: 6 }, (_, i) => makeSong(`s${i}`));
  const state = playFullShow('determinism-rank-seed', songs);
  assert.deepEqual(rankFactionsByRelevance(state), rankFactionsByRelevance(state));
});

test('momentumDirection and isNewShowHigh/Low mirror the real per-song history values, never invent their own', () => {
  const songs = Array.from({ length: 10 }, (_, i) => makeSong(`s${i}`, {
    tempoEnergy: (i * 4) % 10,
    audience: { ...NEUTRAL_AUDIENCE, emotional: (i * 19) % 100, aggressive: (i * 11) % 100 },
  }));
  const bundle = makeBundle(songs, { minSongs: 10, maxSongs: 10 });
  let state = createInitialState(bundle, 'mirror-seed');
  while (!isMainSetComplete(state)) {
    const hand = generateCandidates(state);
    state = hand.state;
    const choice = hand.candidates[0];
    if (!choice) break;
    const result = applyPick(state, choice.id);
    if (!result) break;
    state = result.state;
    const entry = state.history[state.history.length - 1]!;
    const pulse = computeConcertPulse(state);
    assert.equal(pulse.isNewShowHigh, entry.isNewHighEnergy);
    assert.equal(pulse.isNewShowLow, entry.isNewLowEnergy);
    const expectedDirection = entry.crowdEnergyDelta > 0.5 ? 'rising' : entry.crowdEnergyDelta < -0.5 ? 'falling' : 'steady';
    assert.equal(pulse.momentumDirection, expectedDirection);
  }
});

test('topLine passes through the Live Reaction Log\'s first entry verbatim, or null when none fired', () => {
  const bundle = makeBundle([makeSong('s0')]);
  const state = createInitialState(bundle, 'topline-seed');
  const hand = generateCandidates(state);
  const result = applyPick(hand.state, 's0');
  assert.ok(result);
  const withLog = computeConcertPulse(result.state, [{ category: 'strongOpener', text: 'Strong open — the room decided to like tonight.' }]);
  assert.equal(withLog.topLine, 'Strong open — the room decided to like tonight.');
  const withoutLog = computeConcertPulse(result.state, []);
  assert.equal(withoutLog.topLine, null);
});

test('the full pulse snapshot replays identically for the same seed and picks (determinism)', () => {
  const songs = Array.from({ length: 8 }, (_, i) => makeSong(`s${i}`, {
    audience: { ...NEUTRAL_AUDIENCE, technical: (i * 29) % 100 },
  }));
  function play(seed: string) {
    const bundle = makeBundle(songs);
    let state = createInitialState(bundle, seed);
    const pulses = [];
    while (!isMainSetComplete(state)) {
      const hand = generateCandidates(state);
      state = hand.state;
      const choice = hand.candidates[0];
      if (!choice) break;
      const result = applyPick(state, choice.id);
      if (!result) break;
      state = result.state;
      pulses.push(computeConcertPulse(state));
    }
    return pulses;
  }
  assert.deepEqual(play('pulse-replay-seed'), play('pulse-replay-seed'));
});
