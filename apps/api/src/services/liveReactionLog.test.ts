/**
 * Headliner Live Reaction Log (Creative Bible §8) — tests via node:test.
 *
 * Rather than hand-tuning magic numbers for every one of the 18 triggers,
 * most tests here derive the expected outcome from the same real engine
 * values (factionReactions, crowdEnergyDelta, encoreEligible) the log reads
 * — so they check the log actually reflects what the engine computed, not
 * a coincidence of chosen fixture numbers. A few tests (deep-cut surprise,
 * casual-fan-loss, encore demand) use crafted songs/rules for a specific,
 * known trigger. All also verify the two structural invariants Bible §8
 * requires: at most two lines per song, and deterministic replay.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createInitialState, generateCandidates, applyPick, isMainSetComplete,
  resolveEncoreEligibility, DEFAULT_SHOW_RULES, FACTIONS,
  type ShowBundle, type EngineSong, type Axis, type ShowRules,
} from './concertEngine.js';
import { buildReactionLogForSong, type ReactionLogEntry } from './liveReactionLog.js';

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
    eligibleHeadliner: true,
    trackType: 'Song',
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

test('every log entry is capped at 2 per song across a full simulated show', () => {
  const songs = Array.from({ length: 20 }, (_, i) => makeSong(`s${i}`, {
    liveTier: i % 5 === 0 ? 'Mythic' : 'Frequent',
    tempoEnergy: (i * 3) % 10,
    audience: { ...NEUTRAL_AUDIENCE, technical: (i * 17) % 100, accessible: 100 - ((i * 17) % 100) },
  }));
  const bundle = makeBundle(songs, { minSongs: 10, maxSongs: 20 });
  let state = createInitialState(bundle, 'cap-seed');
  const logs: ReactionLogEntry[][] = [];
  while (!isMainSetComplete(state)) {
    const hand = generateCandidates(state);
    state = hand.state;
    const choice = hand.candidates[0];
    if (!choice) break;
    const result = applyPick(state, choice.id);
    if (!result) break;
    state = result.state;
    logs.push(buildReactionLogForSong(state));
  }
  for (const log of logs) assert.ok(log.length <= 2, `expected at most 2 entries, got ${log.length}`);
});

test('replaying the same seed and picks produces an identical reaction log at every step (determinism)', () => {
  function playAndCollect(seed: string): ReactionLogEntry[][] {
    const songs = Array.from({ length: 12 }, (_, i) => makeSong(`s${i}`, {
      liveTier: i % 4 === 0 ? 'Rare' : 'Frequent',
      tempoEnergy: (i * 3) % 10,
      audience: { ...NEUTRAL_AUDIENCE, emotional: (i * 13) % 100 },
    }));
    const bundle = makeBundle(songs, { minSongs: 10, maxSongs: 12 });
    let state = createInitialState(bundle, seed);
    const logs: ReactionLogEntry[][] = [];
    while (!isMainSetComplete(state)) {
      const hand = generateCandidates(state);
      state = hand.state;
      const choice = hand.candidates[0];
      if (!choice) break;
      const result = applyPick(state, choice.id);
      if (!result) break;
      state = result.state;
      logs.push(buildReactionLogForSong(state));
    }
    return logs;
  }
  assert.deepEqual(playAndCollect('replay-seed'), playAndCollect('replay-seed'));
});

test('strongOpener fires exactly when >=3 factions get a net-positive reaction on song 1, weakOpener exactly when the net read is negative', () => {
  const profiles = [
    { accessible: 95, heavy: 10, technical: 10, experimental: 10, progressive: 10, emotional: 90, aggressive: 10, improvisational: 10 },
    { accessible: 5, heavy: 95, technical: 95, experimental: 95, progressive: 95, emotional: 5, aggressive: 95, improvisational: 95 },
    { ...NEUTRAL_AUDIENCE },
  ];
  for (const audience of profiles) {
    const bundle = makeBundle([makeSong('s0', { audience: { ...NEUTRAL_AUDIENCE, ...audience } })]);
    const state0 = createInitialState(bundle, 'opener-seed');
    const hand = generateCandidates(state0);
    const result = applyPick(hand.state, 's0');
    assert.ok(result);
    const positiveCount = FACTIONS.filter((f) => result.factionReactions[f.id]!.score > 0).length;
    const log = buildReactionLogForSong(result.state);
    const hasStrongOpener = log.some((e) => e.category === 'strongOpener');
    const hasWeakOpener = log.some((e) => e.category === 'weakOpener');
    assert.equal(hasStrongOpener, positiveCount >= 3);
    assert.equal(hasWeakOpener, result.crowdEnergyDelta < 0);
  }
});

test('deepCutSurprise fires only for Rare/Legendary/Mythic songs, never for Frequent', () => {
  for (const liveTier of ['Frequent', 'Rare', 'Legendary', 'Mythic'] as const) {
    const bundle = makeBundle([makeSong('s0', { liveTier })]);
    const state0 = createInitialState(bundle, 'tier-seed');
    const hand = generateCandidates(state0);
    const result = applyPick(hand.state, 's0');
    assert.ok(result);
    const log = buildReactionLogForSong(result.state);
    const entry = log.find((e) => e.category === 'deepCutSurprise');
    if (liveTier === 'Frequent') assert.equal(entry, undefined);
    else assert.ok(entry, `expected deepCutSurprise for ${liveTier}`);
  }
});

test('deepCutSurprise\'s Mythic-only variant never appears for a non-Mythic rarity, and does appear for Mythic across enough seeds', () => {
  const legendaryVariants = new Set<string>();
  const mythicVariants = new Set<string>();
  for (let i = 0; i < 30; i++) {
    const seed = `mythic-seed-${i}`;
    const legendaryBundle = makeBundle([makeSong('s0', { liveTier: 'Legendary' })]);
    const legendaryResult = applyPick(generateCandidates(createInitialState(legendaryBundle, seed)).state, 's0');
    const legendaryEntry = buildReactionLogForSong(legendaryResult!.state).find((e) => e.category === 'deepCutSurprise');
    if (legendaryEntry) legendaryVariants.add(legendaryEntry.text);

    const mythicBundle = makeBundle([makeSong('s0', { liveTier: 'Mythic' })]);
    const mythicResult = applyPick(generateCandidates(createInitialState(mythicBundle, seed)).state, 's0');
    const mythicEntry = buildReactionLogForSong(mythicResult!.state).find((e) => e.category === 'deepCutSurprise');
    if (mythicEntry) mythicVariants.add(mythicEntry.text);
  }
  assert.ok(!legendaryVariants.has('Never played live — until fifteen seconds ago.'));
  assert.ok(mythicVariants.has('Never played live — until fifteen seconds ago.'));
});

test('deepCutSurprise (Phase Z.17.18) does not fire for a rare song the deep-cut audience itself dislikes — rarity alone is not enough', () => {
  // Audience profile deep-cut fans are built to dislike (opposite of
  // TUNING.factionWeights.deepCut's positive dimensions) — even at
  // Legendary tier, the rarity bonus should not be enough to outweigh a
  // strongly negative affinity score.
  const hostileToDeepCut = {
    ...NEUTRAL_AUDIENCE, experimental: 0, improvisational: 0, progressive: 0, accessible: 100,
  };
  const bundle = makeBundle([makeSong('s0', { liveTier: 'Legendary', audience: hostileToDeepCut })]);
  const result = applyPick(generateCandidates(createInitialState(bundle, 'hostile-deepcut-seed')).state, 's0');
  assert.ok(result);
  assert.ok(result.factionReactions.deepCut!.score < 0, 'fixture sanity: deep-cut reaction must actually be negative');
  const log = buildReactionLogForSong(result.state);
  assert.equal(log.find((e) => e.category === 'deepCutSurprise'), undefined);
});

test('casualFanLoss fires exactly once — at the moment casual momentum crosses into its walkout band, not on every subsequent hostile song', () => {
  const hostileAudience = { ...NEUTRAL_AUDIENCE, accessible: 0, technical: 100, experimental: 100, progressive: 100, emotional: 0 };
  const songs = Array.from({ length: 10 }, (_, i) => makeSong(`s${i}`, { audience: hostileAudience }));
  const bundle = makeBundle(songs, { minSongs: 10, maxSongs: 10 });
  let state = createInitialState(bundle, 'hostile-seed');
  let occurrences = 0;
  while (!isMainSetComplete(state)) {
    const hand = generateCandidates(state);
    state = hand.state;
    const choice = hand.candidates[0];
    if (!choice) break;
    const result = applyPick(state, choice.id);
    if (!result) break;
    state = result.state;
    if (buildReactionLogForSong(state).some((e) => e.category === 'casualFanLoss')) occurrences += 1;
  }
  assert.equal(occurrences, 1);
});

test('encoreDemand fires only on the pick that completes the main set, and only when the engine actually made the encore eligible', () => {
  const songs = [makeSong('s0'), makeSong('s1')];

  function runWith(threshold: number): { midShow: boolean; afterMainSet: boolean } {
    const bundle = makeBundle(songs, { encoreEnergyThreshold: threshold });
    let state = createInitialState(bundle, 'encore-demand-seed');
    let hand = generateCandidates(state);
    state = hand.state;
    const first = applyPick(state, hand.candidates[0]!.id);
    state = first!.state;
    const midShow = buildReactionLogForSong(state, false).some((e) => e.category === 'encoreDemand');

    hand = generateCandidates(state);
    state = hand.state;
    const second = applyPick(state, hand.candidates[0]!.id);
    state = second!.state;
    assert.ok(isMainSetComplete(state));
    state = resolveEncoreEligibility(state);
    const afterMainSet = buildReactionLogForSong(state, true).some((e) => e.category === 'encoreDemand');
    return { midShow, afterMainSet };
  }

  const eligible = runWith(-1000); // trivially satisfied — the engine will report encoreEligible: true
  assert.equal(eligible.midShow, false);
  assert.equal(eligible.afterMainSet, true);

  const ineligible = runWith(1000); // never satisfiable
  assert.equal(ineligible.afterMainSet, false);
});
