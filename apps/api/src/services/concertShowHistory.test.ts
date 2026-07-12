/**
 * Show history exposure (Creative Bible §16.B) — tests via node:test.
 *
 * Verifies the engine's new per-song history is internally consistent
 * (chained momentum, in-range metrics snapshots), that peak/position
 * detection never fabricates an answer it can't support, and that the
 * whole thing stays deterministic.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createInitialState, generateCandidates, applyPick, isMainSetComplete,
  resolveEncoreEligibility, generateEncoreCandidates, applyEncorePick, skipEncore,
  DEFAULT_SHOW_RULES,
  type ShowBundle, type EngineSong, type Axis, type EngineState,
} from './concertEngine.js';
import { computeShowPositions, findPeakSongId, peakHappenedDuringEncore } from './concertShowHistory.js';

function makeSong(id: string, overrides: Partial<EngineSong> = {}): EngineSong {
  const axis: Record<Axis, number> = {
    aggression: 5, complexity: 5, atmosphere: 5, emotion: 5, psychedelic: 5, concept: 5,
    ...(overrides.axis ?? {}),
  };
  return {
    id, title: `Song ${id}`, albumId: `album-${id.charAt(0)}`, albumTitle: `Album ${id.charAt(0)}`,
    durationSeconds: 240, axis, tempoEnergy: 6,
    audience: {
      progressive: 50, heavy: 50, technical: 50, atmospheric: 50, experimental: 50,
      accessible: 50, psychedelic: 50, emotional: 50, aggressive: 50, improvisational: 50,
    },
    audienceIsFallback: false, liveTier: 'Frequent', liveSource: 'live', liveValue: 30,
    ...overrides,
  };
}

function makeBundle(songCount: number): ShowBundle {
  const songs: EngineSong[] = [];
  for (let i = 0; i < songCount; i++) {
    songs.push(makeSong(`s${i}`, {
      liveTier: i % 7 === 0 ? 'Legendary' : 'Frequent',
      axis: {
        aggression: (i * 3) % 10, complexity: (i * 5) % 10, atmosphere: (i * 2) % 10,
        emotion: (i * 7) % 10, psychedelic: (i * 4) % 10, concept: (i * 6) % 10,
      },
    }));
  }
  return {
    bandId: 'band-1', bandName: 'Test Band', songs,
    targetSpectrum: { aggression: 5, complexity: 5, atmosphere: 5, emotion: 5, psychedelic: 5, concept: 5 },
    venue: null, showLengthBudgetSeconds: 60 * 70, rules: DEFAULT_SHOW_RULES,
  };
}

function playFullShow(seed: string): EngineState {
  const bundle = makeBundle(30);
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
  state = resolveEncoreEligibility(state);
  if (state.encoreEligible) {
    const encoreHand = generateEncoreCandidates(state);
    state = encoreHand.state;
    const choice = encoreHand.candidates[0];
    if (choice) {
      const result = applyEncorePick(state, choice.id);
      if (result) state = result.state;
    } else {
      state = skipEncore(state);
    }
  } else {
    state = skipEncore(state);
  }
  return state;
}

test('history length always matches playedSongIds length', () => {
  const state = playFullShow('history-seed-1');
  assert.equal(state.history.length, state.playedSongIds.length);
});

test('faction momentum chains correctly: entry[i].after === entry[i+1].before, and the last entry matches final state', () => {
  const state = playFullShow('history-seed-2');
  for (let i = 0; i < state.history.length - 1; i++) {
    assert.deepEqual(state.history[i]!.factionMomentumAfter, state.history[i + 1]!.factionMomentumBefore);
  }
  const last = state.history[state.history.length - 1]!;
  assert.deepEqual(last.factionMomentumAfter, state.factionMomentum);
});

test('every metricsSnapshot value stays within [0,100]', () => {
  const state = playFullShow('history-seed-3');
  for (const entry of state.history) {
    for (const value of Object.values(entry.metricsSnapshot)) {
      assert.ok(value >= 0 && value <= 100, `metric out of range: ${value}`);
    }
  }
});

test('findPeakSongId never fabricates a peak when crowdPeak is 0 or negative', () => {
  const bundle = makeBundle(3);
  const state = createInitialState(bundle, 'no-peak-seed');
  // No picks made — crowdPeak is still 0, history is empty.
  assert.equal(findPeakSongId(state), null);
});

test('findPeakSongId returns a song that actually achieved the final crowdPeak value', () => {
  const state = playFullShow('history-seed-4');
  const peakSongId = findPeakSongId(state);
  if (state.crowdPeak > 0) {
    assert.ok(peakSongId !== null);
    const entry = state.history.find((h) => h.songId === peakSongId);
    assert.equal(entry?.bestFactionReaction, state.crowdPeak);
  } else {
    assert.equal(peakSongId, null);
  }
});

test('computeShowPositions covers every history entry exactly once, in order', () => {
  const state = playFullShow('history-seed-5');
  const positions = computeShowPositions(state);
  assert.equal(positions.length, state.history.length);
  positions.forEach((p, i) => assert.equal(p.index, i));
});

test('computeShowPositions marks the encore entry (if any) as phase "encore"', () => {
  const state = playFullShow('history-seed-6');
  const positions = computeShowPositions(state);
  const encoreEntries = state.history.filter((h) => h.isEncore);
  const encorePositions = positions.filter((p) => encoreEntries.some((e) => e.songId === p.songId));
  for (const p of encorePositions) assert.equal(p.phase, 'encore');
});

test('the first main-set song is always classified "opening"', () => {
  const state = playFullShow('history-seed-7');
  const positions = computeShowPositions(state);
  const firstMainSet = positions.find((p) => p.phase !== 'encore');
  assert.equal(firstMainSet?.phase, 'opening');
});

test('peakHappenedDuringEncore is false whenever there is no encore', () => {
  const bundle = makeBundle(3);
  let state = createInitialState(bundle, 'peak-no-encore-seed');
  const hand = generateCandidates(state);
  state = hand.state;
  const result = applyPick(state, hand.candidates[0]!.id);
  state = result!.state;
  assert.equal(peakHappenedDuringEncore(state), false);
});

test('same seed produces identical history on replay (determinism)', () => {
  const a = playFullShow('history-determinism-seed');
  const b = playFullShow('history-determinism-seed');
  assert.deepEqual(a.history, b.history);
});
