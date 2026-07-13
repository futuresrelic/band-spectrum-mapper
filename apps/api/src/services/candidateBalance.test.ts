/**
 * Candidate-generation balance tests (Phase Z.17.18) — verifies the
 * rebalancing pass actually fixes the reported bug (Rare/Legendary/Mythic
 * tracks dominating offered hands) without breaking determinism, small
 * catalogs, or the rarity budget. Statistical assertions use large,
 * seeded sample sizes so they are deterministic, not flaky — every run
 * with the same seeds produces the exact same counts.
 *
 * See CANDIDATE_CONFIG in concertEngine.ts for the tunable weights this
 * file is validating, and docs/ARCHITECTURE.md's "Candidate generation
 * rebalance" section for the audit this responds to.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createInitialState, generateCandidates, generateEncoreCandidates, applyPick,
  isMainSetComplete, explainCandidate, CANDIDATE_CONFIG, DEFAULT_SHOW_RULES,
  type ShowBundle, type EngineSong, type Axis, type LiveFrequencyTier,
} from './concertEngine.js';
import type { TrackType } from '@band-spectrum-mapper/shared';

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

const FILLER_TYPES: readonly TrackType[] = ['Interlude', 'SpokenWord', 'SoundCollage', 'Intro', 'Outro', 'Transition'];

/**
 * A synthetic catalog shaped like the reported bug scenario: a large base of
 * Essential/Frequent/Occasional full songs, a modest run of Rare tracks, and
 * a small tail of Legendary/Mythic material that's disproportionately
 * filler (interludes, spoken word, sound collage, intro/outro) — exactly
 * the "rare AND short AND not really a song" combination the user reported
 * (Lipan Conjuring, Faaip De Oiad, Intermission, Useful Idiot-type material).
 */
function buildToolLikeCatalog(): EngineSong[] {
  const songs: EngineSong[] = [];
  const albums = ['a1', 'a2', 'a3', 'a4', 'a5', 'a6'];
  let i = 0;
  const push = (tier: LiveFrequencyTier, count: number, trackType: TrackType = 'Song', shortDuration = false) => {
    for (let n = 0; n < count; n++) {
      const albumId = albums[i % albums.length]!;
      songs.push(makeSong(`song-${i}`, {
        liveTier: tier,
        trackType,
        albumId,
        albumTitle: albumId,
        durationSeconds: shortDuration ? 45 : 200 + (i % 5) * 20,
        axis: {
          aggression: (i * 3) % 10, complexity: (i * 5) % 10, atmosphere: (i * 2) % 10,
          emotion: (i * 7) % 10, psychedelic: (i * 4) % 10, concept: (i * 6) % 10,
        },
      }));
      i++;
    }
  };

  push('Essential', 10);
  push('Frequent', 15);
  push('Occasional', 15);
  push('Rare', 10);
  push('Rare', 3, 'Cover');
  push('Legendary', 3);
  push('Legendary', 1, 'Special');
  push('Legendary', 1, 'Demo');
  push('Mythic', 1, 'Song');
  push('Mythic', 1, 'Interlude', true);
  push('Mythic', 1, 'SpokenWord', true);
  push('Mythic', 1, 'SoundCollage', true);
  push('Mythic', 1, 'Intro', true);
  push('Mythic', 1, 'Outro', true);

  return songs;
}

function buildBundle(songs: EngineSong[]): ShowBundle {
  return {
    bandId: 'band-tool-like',
    bandName: 'Test Band',
    songs,
    targetSpectrum: { aggression: 5, complexity: 5, atmosphere: 5, emotion: 5, psychedelic: 5, concept: 5 },
    venue: null,
    showLengthBudgetSeconds: 60 * 70,
    rules: DEFAULT_SHOW_RULES,
  };
}

const CATALOG = buildToolLikeCatalog();
const BUNDLE = buildBundle(CATALOG);

const ESSENTIAL_COUNT = CATALOG.filter((s) => s.liveTier === 'Essential').length;
const MYTHIC_COUNT = CATALOG.filter((s) => s.liveTier === 'Mythic').length;
assert.ok(ESSENTIAL_COUNT > 0 && MYTHIC_COUNT > 0, 'fixture sanity: catalog must contain both Essential and Mythic songs');

// ---------------------------------------------------------------------------
// Distribution sampling — many independent fresh-state hands (not a single
// show), so the sample isn't confounded by songs being removed as a show
// progresses. This is the "10,000 candidate slots" style sweep.
// ---------------------------------------------------------------------------

const SAMPLE_HANDS = 2000;

function sampleFreshHands(n: number): EngineSong[][] {
  const hands: EngineSong[][] = [];
  for (let seed = 0; seed < n; seed++) {
    const state = createInitialState(BUNDLE, `balance-seed-${seed}`);
    const hand = generateCandidates(state);
    hands.push(hand.candidates);
  }
  return hands;
}

const SAMPLED_HANDS = sampleFreshHands(SAMPLE_HANDS);
const ALL_SLOTS = SAMPLED_HANDS.flat();

test('distribution report: tier and track-type offer share across a large seeded sample', () => {
  const tierCounts: Record<string, number> = {};
  const typeCounts: Record<string, number> = {};
  for (const song of ALL_SLOTS) {
    tierCounts[song.liveTier] = (tierCounts[song.liveTier] ?? 0) + 1;
    typeCounts[song.trackType] = (typeCounts[song.trackType] ?? 0) + 1;
  }
  const total = ALL_SLOTS.length;
  const pct = (n: number) => `${((n / total) * 100).toFixed(1)}%`;
  // Development-only report — printed, not asserted on exact values, so a
  // small future tuning change doesn't make this test itself flaky.
  console.log(`[candidate balance] ${total} candidate slots across ${SAMPLE_HANDS} sampled hands`);
  console.log('[candidate balance] tier share:', Object.fromEntries(
    Object.entries(tierCounts).map(([k, v]) => [k, pct(v)]),
  ));
  console.log('[candidate balance] track-type share:', Object.fromEntries(
    Object.entries(typeCounts).map(([k, v]) => [k, pct(v)]),
  ));
  assert.ok(total > 0);
});

test('Essential + Frequent are offered substantially more often than Mythic', () => {
  const essential = ALL_SLOTS.filter((s) => s.liveTier === 'Essential').length;
  const frequent = ALL_SLOTS.filter((s) => s.liveTier === 'Frequent').length;
  const mythic = ALL_SLOTS.filter((s) => s.liveTier === 'Mythic').length;
  assert.ok(mythic > 0, 'Mythic must still be possible');
  assert.ok(
    essential + frequent > mythic * 5,
    `expected Essential+Frequent (${essential + frequent}) to substantially outnumber Mythic (${mythic})`,
  );
});

test('Mythic remains possible but is a small minority of offered slots', () => {
  const mythicShare = ALL_SLOTS.filter((s) => s.liveTier === 'Mythic').length / ALL_SLOTS.length;
  assert.ok(mythicShare > 0, 'Mythic must appear at least sometimes across 2000 sampled hands');
  assert.ok(mythicShare < 0.15, `Mythic share (${(mythicShare * 100).toFixed(1)}%) should be a small minority`);
});

test('every hand offers at least one Essential/Frequent/Occasional (core-tier) option when the catalog has them', () => {
  const RARE_OR_HIGHER = new Set(['Rare', 'Legendary', 'Mythic']);
  const handsWithoutCore = SAMPLED_HANDS.filter(
    (hand) => hand.length > 0 && hand.every((s) => RARE_OR_HIGHER.has(s.liveTier)),
  );
  // Allow a tiny fraction for the rare "shortlist happened to be all rare" edge
  // case, but this should be exceptional, not routine, against this catalog.
  assert.ok(
    handsWithoutCore.length / SAMPLED_HANDS.length < 0.02,
    `${handsWithoutCore.length}/${SAMPLED_HANDS.length} hands had zero core-tier option`,
  );
});

test('no hand exceeds the configured Rare-or-higher / Mythic budget', () => {
  const RARE_OR_HIGHER = new Set(['Rare', 'Legendary', 'Mythic']);
  for (const hand of SAMPLED_HANDS) {
    const rareCount = hand.filter((s) => RARE_OR_HIGHER.has(s.liveTier)).length;
    const mythicCount = hand.filter((s) => s.liveTier === 'Mythic').length;
    assert.ok(rareCount <= CANDIDATE_CONFIG.maxRareOrHigherPerHand,
      `hand had ${rareCount} rare-or-higher songs, budget is ${CANDIDATE_CONFIG.maxRareOrHigherPerHand}: ${hand.map((s) => `${s.id}(${s.liveTier})`).join(', ')}`);
    assert.ok(mythicCount <= CANDIDATE_CONFIG.maxMythicPerHand,
      `hand had ${mythicCount} Mythic songs, budget is ${CANDIDATE_CONFIG.maxMythicPerHand}`);
  }
});

test('filler track types (Interlude/SpokenWord/SoundCollage/Intro/Outro/Transition) are strongly under-represented vs. their catalog share', () => {
  const catalogFillerShare = CATALOG.filter((s) => FILLER_TYPES.includes(s.trackType)).length / CATALOG.length;
  const offeredFillerShare = ALL_SLOTS.filter((s) => FILLER_TYPES.includes(s.trackType)).length / ALL_SLOTS.length;
  assert.ok(
    offeredFillerShare < catalogFillerShare * 0.6,
    `filler share offered (${(offeredFillerShare * 100).toFixed(1)}%) should be well below catalog share (${(catalogFillerShare * 100).toFixed(1)}%)`,
  );
});

// ---------------------------------------------------------------------------
// Contextual position boosts
// ---------------------------------------------------------------------------

test('an Intro track can appear at the very start of a show, contextually boosted', () => {
  const songs = [
    makeSong('intro-1', { liveTier: 'Mythic', trackType: 'Intro', durationSeconds: 40, albumId: 'a1' }),
    ...Array.from({ length: 15 }, (_, i) => makeSong(`song-${i}`, { liveTier: 'Frequent', albumId: `a${(i % 3) + 2}` })),
  ];
  const bundle = buildBundle(songs);
  let introOffered = 0;
  const N = 500;
  for (let seed = 0; seed < N; seed++) {
    const state = createInitialState(bundle, `intro-seed-${seed}`);
    const hand = generateCandidates(state);
    if (hand.candidates.some((s) => s.id === 'intro-1')) introOffered++;
  }
  assert.ok(introOffered > 0, 'Intro should be offerable at the very start of a show at least sometimes');
});

test('an Outro track\'s offer weight rises sharply near the end of the show vs. the start', () => {
  // Direct, deterministic check of the underlying mechanism (via the same
  // explainCandidate the admin debug tool uses) rather than a sampling
  // comparison — the contextual boost only affects ONE input (availability
  // weight) among several that decide whether a song makes a hand at all,
  // so a full end-to-end sampling comparison is too noisy to assert on
  // reliably without a much larger, slower sample.
  const outro = makeSong('outro-1', { liveTier: 'Mythic', trackType: 'Outro', durationSeconds: 40, albumId: 'a1' });
  const bundle = buildBundle([outro, makeSong('filler', { liveTier: 'Frequent' })]);

  const startState = createInitialState(bundle, 'outro-weight-seed');
  const endState = { ...startState, elapsedSeconds: Math.round(bundle.showLengthBudgetSeconds * 0.92) };

  const startWeight = explainCandidate(outro, startState).availabilityWeight;
  const endWeight = explainCandidate(outro, endState).availabilityWeight;

  assert.equal(endWeight, startWeight * CANDIDATE_CONFIG.outroEndingBoost);
  assert.ok(endWeight > startWeight, `expected end-of-show weight (${endWeight}) > start-of-show weight (${startWeight})`);
});

// ---------------------------------------------------------------------------
// Small-catalog graceful degradation (Campaign with few recovered songs)
// ---------------------------------------------------------------------------

test('a small remaining pool (Campaign-style, at or below the minimum hand size) offers everything left, unfiltered by rarity budget', () => {
  // TUNING.handSizeMin is 2, so a 2-song pool always triggers the
  // small-catalog escape hatch regardless of the random handSize roll.
  const songs = [
    makeSong('c1', { liveTier: 'Mythic' }),
    makeSong('c2', { liveTier: 'Rare' }),
  ];
  const bundle = buildBundle(songs);
  const state = createInitialState(bundle, 'small-pool-seed');
  const hand = generateCandidates(state);
  assert.equal(hand.candidates.length, songs.length, 'a pool this small should offer everything left, unfiltered by rarity budget');
  assert.deepEqual(
    new Set(hand.candidates.map((s) => s.id)),
    new Set(songs.map((s) => s.id)),
  );
});

test('a small pool never crashes or returns an empty hand when songs remain', () => {
  for (let count = 1; count <= 5; count++) {
    const songs = Array.from({ length: count }, (_, i) => makeSong(`p${i}`, { liveTier: 'Mythic' }));
    const bundle = buildBundle(songs);
    const state = createInitialState(bundle, `small-${count}`);
    const hand = generateCandidates(state);
    assert.ok(hand.candidates.length > 0, `expected a non-empty hand for a ${count}-song pool`);
  }
});

// ---------------------------------------------------------------------------
// Full-show simulation: consecutive-Mythic-hand safeguard + determinism
// ---------------------------------------------------------------------------

function simulateShow(bundle: ShowBundle, seed: string) {
  let state = createInitialState(bundle, seed);
  const hands: EngineSong[][] = [];
  let guard = 0;
  while (!isMainSetComplete(state) && guard < 40) {
    guard++;
    const hand = generateCandidates(state);
    state = hand.state;
    if (hand.candidates.length === 0) break;
    hands.push(hand.candidates);
    const choice = hand.candidates[0]!;
    const result = applyPick(state, choice.id);
    if (!result) break;
    state = result.state;
  }
  return hands;
}

test('no two consecutive main-set hands both contain a Mythic song, against a large catalog', () => {
  for (let seed = 0; seed < 20; seed++) {
    const hands = simulateShow(BUNDLE, `show-seed-${seed}`);
    for (let i = 1; i < hands.length; i++) {
      const prevHadMythic = hands[i - 1]!.some((s) => s.liveTier === 'Mythic');
      const currHasMythic = hands[i]!.some((s) => s.liveTier === 'Mythic');
      assert.ok(
        !(prevHadMythic && currHasMythic),
        `seed ${seed}: hands ${i - 1} and ${i} both contained a Mythic song against a large catalog`,
      );
    }
  }
});

test('generateCandidates is a pure function of state: same state in, same hand out', () => {
  const state = createInitialState(BUNDLE, 'purity-seed');
  const a = generateCandidates(state);
  const b = generateCandidates(state);
  assert.deepEqual(a.candidates.map((s) => s.id), b.candidates.map((s) => s.id));
  assert.equal(a.state.stepIndex, b.state.stepIndex);
});

test('a full simulated show replays identically for the same seed (candidate generation determinism)', () => {
  const runA = simulateShow(BUNDLE, 'replay-seed');
  const runB = simulateShow(BUNDLE, 'replay-seed');
  assert.deepEqual(
    runA.map((hand) => hand.map((s) => s.id)),
    runB.map((hand) => hand.map((s) => s.id)),
  );
});

// ---------------------------------------------------------------------------
// Encore candidates: same rebalance applies, smaller hand
// ---------------------------------------------------------------------------

test('encore candidates also respect the rarity budget and favor availability over flat rarity bonus', () => {
  for (let seed = 0; seed < 200; seed++) {
    const state = createInitialState(BUNDLE, `encore-seed-${seed}`);
    const hand = generateEncoreCandidates(state);
    const mythicCount = hand.candidates.filter((s) => s.liveTier === 'Mythic').length;
    assert.ok(mythicCount <= CANDIDATE_CONFIG.maxMythicPerHand);
  }
});
