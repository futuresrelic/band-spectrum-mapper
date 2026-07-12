/**
 * Determinism tests for the Headliner concert engine — run via Node's built-in
 * test runner (`node:test`), not a new dependency. See CLAUDE.md: "do not
 * introduce unnecessary dependencies." Node >=20 already required by this repo
 * (package.json engines), and node:test has been stable since Node 18.
 *
 * These are not exhaustive gameplay tests — they verify the one property the
 * whole design depends on: same seed + same sequence of choices always
 * produces the same simulation output.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createInitialState, generateCandidates, applyPick, buildReport,
  isMainSetComplete, resolveEncoreEligibility, generateEncoreCandidates,
  applyEncorePick, skipEncore, DEFAULT_SHOW_RULES,
  type ShowBundle, type EngineSong, type Axis, type ShowRules,
} from './concertEngine.js';

function makeSong(id: string, overrides: Partial<EngineSong> = {}): EngineSong {
  const axis: Record<Axis, number> = {
    aggression: 5, complexity: 5, atmosphere: 5, emotion: 5, psychedelic: 5, concept: 5,
    ...(overrides.axis ?? {}),
  };
  return {
    id,
    title: `Song ${id}`,
    albumId: `album-${id.charAt(0)}`,
    albumTitle: `Album ${id.charAt(0)}`,
    durationSeconds: 240,
    axis,
    tempoEnergy: 6,
    audience: {
      progressive: 50, heavy: 50, technical: 50, atmospheric: 50, experimental: 50,
      accessible: 50, psychedelic: 50, emotional: 50, aggressive: 50, improvisational: 50,
    },
    audienceIsFallback: false,
    liveTier: 'Frequent',
    liveSource: 'live',
    liveValue: 30,
    eligibleHeadliner: true,
    trackType: 'Song',
    ...overrides,
  };
}

function makeBundle(songCount: number, rules: ShowRules = DEFAULT_SHOW_RULES): ShowBundle {
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
    bandId: 'band-1',
    bandName: 'Test Band',
    songs,
    targetSpectrum: { aggression: 5, complexity: 5, atmosphere: 5, emotion: 5, psychedelic: 5, concept: 5 },
    venue: null,
    showLengthBudgetSeconds: 60 * 70,
    rules,
  };
}

/** Plays a full show deterministically, always picking the first offered candidate. */
function playFullShow(seed: string) {
  const bundle = makeBundle(30);
  let state = createInitialState(bundle, seed);
  const pickedIds: string[] = [];
  const reactionScores: number[] = [];

  while (!isMainSetComplete(state)) {
    const hand = generateCandidates(state);
    state = hand.state;
    if (hand.candidates.length === 0) break;
    const choice = hand.candidates[0]!;
    const result = applyPick(state, choice.id);
    if (!result) break;
    state = result.state;
    pickedIds.push(choice.id);
    reactionScores.push(result.factionReactions.casual.score);
  }

  state = resolveEncoreEligibility(state);
  if (state.encoreEligible) {
    const encoreHand = generateEncoreCandidates(state);
    state = encoreHand.state;
    if (encoreHand.candidates.length > 0) {
      const encoreResult = applyEncorePick(state, encoreHand.candidates[0]!.id);
      if (encoreResult) {
        state = encoreResult.state;
        pickedIds.push(encoreResult.song.id);
      }
    } else {
      state = skipEncore(state);
    }
  } else {
    state = skipEncore(state);
  }

  const report = buildReport(state);
  return { pickedIds, reactionScores, report };
}

test('same seed produces an identical full show', () => {
  const runA = playFullShow('determinism-seed-1');
  const runB = playFullShow('determinism-seed-1');
  assert.deepEqual(runA.pickedIds, runB.pickedIds);
  assert.deepEqual(runA.reactionScores, runB.reactionScores);
  assert.deepEqual(runA.report, runB.report);
});

test('different seeds are very likely to diverge', () => {
  const runA = playFullShow('seed-alpha');
  const runB = playFullShow('seed-beta');
  assert.notDeepEqual(runA.pickedIds, runB.pickedIds);
});

test('candidate hands never include a song already played', () => {
  const bundle = makeBundle(12);
  let state = createInitialState(bundle, 'no-repeats-seed');
  const seen = new Set<string>();
  for (let i = 0; i < 8 && !isMainSetComplete(state); i++) {
    const hand = generateCandidates(state);
    state = hand.state;
    for (const c of hand.candidates) {
      assert.equal(seen.has(c.id), false, `song ${c.id} was offered twice`);
    }
    const choice = hand.candidates[0];
    if (!choice) break;
    const result = applyPick(state, choice.id);
    if (!result) break;
    state = result.state;
    seen.add(choice.id);
  }
});

test('candidate hand size is always within [2,4] and excludes the single top-value song', () => {
  const bundle = makeBundle(20);
  const state = createInitialState(bundle, 'hand-size-seed');
  const hand = generateCandidates(state);
  assert.ok(hand.candidates.length >= 2 && hand.candidates.length <= 4);
});

test('applyPick rejects a songId that was not in the offered candidate hand (server-side integrity check)', () => {
  const bundle = makeBundle(20);
  const state = createInitialState(bundle, 'integrity-seed');
  const hand = generateCandidates(state);
  const offeredIds = new Set(hand.candidates.map((c) => c.id));
  const outsideSong = bundle.songs.find((s) => !offeredIds.has(s.id));
  assert.ok(outsideSong, 'fixture should contain a song outside the offered hand');
  const result = applyPick(hand.state, outsideSong!.id);
  assert.equal(result, null);
});

test('applyPick accepts any song that WAS in the offered candidate hand', () => {
  const bundle = makeBundle(20);
  const state = createInitialState(bundle, 'integrity-seed-2');
  const hand = generateCandidates(state);
  const choice = hand.candidates[0]!;
  const result = applyPick(hand.state, choice.id);
  assert.ok(result !== null);
  assert.equal(result!.song.id, choice.id);
});

test('a full show always produces a report with metrics in [0,100] and a finite overall score', () => {
  const { report } = playFullShow('report-shape-seed');
  for (const value of Object.values(report.metrics)) {
    assert.ok(value >= 0 && value <= 100, `metric out of range: ${value}`);
  }
  assert.ok(Number.isFinite(report.overallScore));
  assert.ok(report.overallScore >= 0 && report.overallScore <= 1000);
});

// ---------------------------------------------------------------------------
// Campaign-mode rules — same engine, different ShowRules (Phase Z.17.10)
// ---------------------------------------------------------------------------

const REHEARSAL_ROOM_RULES: ShowRules = {
  minSongs: 3,
  maxSongs: 3,
  factionShare: { casual: 0.30, hardcore: 0.10, deepCut: 0.05, progHeads: 0.05, firstTimers: 0.50 },
  encoreEnergyThreshold: 0,
};

test('Campaign rules: a small recovered-only pool with minSongs=maxSongs=3 always plays exactly 3 songs', () => {
  const bundle = makeBundle(5, REHEARSAL_ROOM_RULES); // fewer songs than Quick Show would ever see
  let state = createInitialState(bundle, 'campaign-seed-1');
  let picks = 0;
  while (!isMainSetComplete(state) && picks < 10) {
    const hand = generateCandidates(state);
    state = hand.state;
    const choice = hand.candidates[0];
    if (!choice) break;
    const result = applyPick(state, choice.id);
    if (!result) break;
    state = result.state;
    picks++;
  }
  assert.equal(picks, 3);
  assert.equal(isMainSetComplete(state), true);
});

test('Campaign rules: same seed + same picks reproduces identical results under a Campaign-style rules override', () => {
  function playRehearsalRoom(seed: string) {
    const bundle = makeBundle(6, REHEARSAL_ROOM_RULES);
    let state = createInitialState(bundle, seed);
    const pickedIds: string[] = [];
    while (!isMainSetComplete(state)) {
      const hand = generateCandidates(state);
      state = hand.state;
      const choice = hand.candidates[0];
      if (!choice) break;
      const result = applyPick(state, choice.id);
      if (!result) break;
      state = result.state;
      pickedIds.push(choice.id);
    }
    state = resolveEncoreEligibility(state);
    state = state.encoreEligible ? state : skipEncore(state);
    return { pickedIds, report: buildReport(state) };
  }

  const a = playRehearsalRoom('campaign-determinism-seed');
  const b = playRehearsalRoom('campaign-determinism-seed');
  assert.deepEqual(a.pickedIds, b.pickedIds);
  assert.deepEqual(a.report, b.report);
});

// ---------------------------------------------------------------------------
// Track Classification (Phase Z.17.15): eligibleHeadliner is a strong ranking
// preference, never a hard exclusion — a healthy catalog should almost never
// surface an ineligible song, but a catalog with no other choice still can.
// ---------------------------------------------------------------------------

test('a headliner-ineligible song is preferred against, not excluded — a healthy catalog almost never offers it', () => {
  const songs: EngineSong[] = [makeSong('ineligible', { eligibleHeadliner: false })];
  for (let i = 0; i < 19; i++) songs.push(makeSong(`eligible-${i}`));
  const bundle: ShowBundle = {
    bandId: 'band-1', bandName: 'Test Band', songs,
    targetSpectrum: { aggression: 5, complexity: 5, atmosphere: 5, emotion: 5, psychedelic: 5, concept: 5 },
    venue: null, showLengthBudgetSeconds: 60 * 70, rules: DEFAULT_SHOW_RULES,
  };

  let offeredIneligible = false;
  for (let seedIdx = 0; seedIdx < 25; seedIdx++) {
    const state = createInitialState(bundle, `eligibility-preference-seed-${seedIdx}`);
    const hand = generateCandidates(state);
    if (hand.candidates.some((c) => c.id === 'ineligible')) offeredIneligible = true;
  }
  assert.equal(offeredIneligible, false, 'a 20-song catalog should never need to offer the one ineligible song in its very first hand');
});

test('a headliner-ineligible song remains selectable when it is genuinely the only song left', () => {
  const bundle = makeBundle(1, DEFAULT_SHOW_RULES);
  bundle.songs[0]!.eligibleHeadliner = false;
  bundle.rules = { ...DEFAULT_SHOW_RULES, minSongs: 1, maxSongs: 1 };
  const state = createInitialState(bundle, 'only-ineligible-seed');
  const hand = generateCandidates(state);
  assert.equal(hand.candidates.length, 1);
  assert.equal(hand.candidates[0]!.id, 's0');
  const result = applyPick(hand.state, 's0');
  assert.ok(result, 'the only song in the catalog must still be pickable even when ineligible for Headliner — never removed from the pool');
});

test('eligibleHeadliner never changes deterministic replay behavior — same seed still reproduces the same show', () => {
  const songs: EngineSong[] = [makeSong('maybe-ineligible', { eligibleHeadliner: false })];
  for (let i = 0; i < 9; i++) songs.push(makeSong(`s${i}`));
  const bundle: ShowBundle = {
    bandId: 'band-1', bandName: 'Test Band', songs,
    targetSpectrum: { aggression: 5, complexity: 5, atmosphere: 5, emotion: 5, psychedelic: 5, concept: 5 },
    venue: null, showLengthBudgetSeconds: 60 * 70, rules: DEFAULT_SHOW_RULES,
  };

  function play(seed: string): string[] {
    let state = createInitialState(bundle, seed);
    const pickedIds: string[] = [];
    while (!isMainSetComplete(state)) {
      const hand = generateCandidates(state);
      state = hand.state;
      const choice = hand.candidates[0];
      if (!choice) break;
      const result = applyPick(state, choice.id);
      if (!result) break;
      state = result.state;
      pickedIds.push(choice.id);
    }
    return pickedIds;
  }

  assert.deepEqual(play('eligibility-determinism-seed'), play('eligibility-determinism-seed'));
});
