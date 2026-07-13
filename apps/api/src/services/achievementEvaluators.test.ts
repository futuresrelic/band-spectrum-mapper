/**
 * Headliner achievement evaluation helpers (Creative Bible §12) — tests
 * via node:test. Fixtures build EngineState/ConcertReport directly
 * (same style as campaignService.test.ts's makeState/makeReport) since
 * these are threshold checks best verified with precise inputs rather
 * than reverse-engineering a full simulated show.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  achievesTheRealThing, achievesNobodyLeftEarly, achievesPackedHouse, achievesTideChart,
  achievesCleanHands, achievesSomewhereElseEntirely, achievesTheTurnaround, achievesDugDeep,
  achievesFirstTimeForEverything, achievesFullCatalog, achievesOneMore, achievesExitThroughTheRoof,
  achievesOffBook, achievesTopOfTheMarquee, achievesNoNotes, achievesShowedUp, achievesHouseFavorite,
  achievesFriendOfTheFloor, achievesSpeaksFluentHunter, achievesOpenDoorPolicy,
  evaluateSingleShowAchievements,
} from './achievementEvaluators.js';
import type {
  ConcertReport, EngineState, EngineSong, ScoreMetric, ShowBundle, Axis, SongHistoryEntry, FactionId,
} from './concertEngine.js';
import { DEFAULT_SHOW_RULES } from './concertEngine.js';

function makeReport(metricOverrides: Partial<Record<ScoreMetric, number>> = {}): ConcertReport {
  const metrics: Record<ScoreMetric, number> = {
    spectrumMatch: 50, energyCurveFit: 50, emotionalJourney: 50, audienceRetention: 50,
    rarityExcitement: 50, diversity: 50, authenticity: 50, encoreQuality: 0,
    paceDiscipline: 50, crowdPeak: 50,
    ...metricOverrides,
  };
  return { metrics, overallScore: 500, highlights: [], reviewText: '', usedFallbackData: false, fallbackSongCount: 0 };
}

function makeSong(id: string, overrides: Partial<EngineSong> = {}): EngineSong {
  const axis: Record<Axis, number> = { aggression: 5, complexity: 5, atmosphere: 5, emotion: 5, psychedelic: 5, concept: 5 };
  return {
    id, title: id, albumId: overrides.albumId ?? `album-${id}`, albumTitle: 'Album', durationSeconds: 200, axis, tempoEnergy: 5,
    audience: {
      progressive: 50, heavy: 50, technical: 50, atmospheric: 50, experimental: 50,
      accessible: 50, psychedelic: 50, emotional: 50, aggressive: 50, improvisational: 50,
    },
    audienceIsFallback: false, liveTier: 'Frequent', liveSource: 'live', liveValue: 30,
    eligibleHeadliner: true,
    trackType: 'Song',
    ...overrides,
  };
}

function makeHistoryEntry(songId: string, audienceRetention: number): SongHistoryEntry {
  return {
    songId, index: 0, isEncore: false,
    factionMomentumBefore: { casual: 0, hardcore: 0, deepCut: 0, progHeads: 0, firstTimers: 0 },
    factionMomentumAfter: { casual: 0, hardcore: 0, deepCut: 0, progHeads: 0, firstTimers: 0 },
    factionDeltas: {
      casual: { before: 0, after: 0, delta: 0 }, hardcore: { before: 0, after: 0, delta: 0 },
      deepCut: { before: 0, after: 0, delta: 0 }, progHeads: { before: 0, after: 0, delta: 0 },
      firstTimers: { before: 0, after: 0, delta: 0 },
    },
    bestFactionReaction: 0,
    factionReactionScores: { casual: 0, hardcore: 0, deepCut: 0, progHeads: 0, firstTimers: 0 },
    crowdEnergyBefore: 0, crowdEnergyAfter: 0, crowdEnergyDelta: 0, pacingPenalty: 0,
    metricsSnapshot: {
      spectrumMatch: 50, energyCurveFit: 50, emotionalJourney: 50, audienceRetention,
      rarityExcitement: 50, diversity: 50, authenticity: 50, encoreQuality: 0, paceDiscipline: 50, crowdPeak: 50,
    },
    isNewHighEnergy: false, isNewLowEnergy: false,
  };
}

function makeState(opts: {
  songs: EngineSong[];
  playedSongIds: string[];
  encorePlayed?: boolean;
  history?: SongHistoryEntry[];
  factionMomentum?: Partial<Record<FactionId, number>>;
}): EngineState {
  const bundle: ShowBundle = {
    bandId: 'b1', bandName: 'Test Band', songs: opts.songs,
    targetSpectrum: { aggression: 5, complexity: 5, atmosphere: 5, emotion: 5, psychedelic: 5, concept: 5 },
    venue: null, showLengthBudgetSeconds: 1200, rules: DEFAULT_SHOW_RULES,
  };
  return {
    bundle, seed: 'x', stepIndex: 0, playedSongIds: opts.playedSongIds, elapsedSeconds: 0,
    runningSpectrumSum: { aggression: 0, complexity: 0, atmosphere: 0, emotion: 0, psychedelic: 0, concept: 0 },
    runningSpectrumCount: 0,
    factionMomentum: { casual: 0, hardcore: 0, deepCut: 0, progHeads: 0, firstTimers: 0, ...opts.factionMomentum },
    crowdPeak: 0, recentAxisWindow: [], recentAlbumWindow: [], pacingPenaltyTotal: 0, fallbackSongCount: 0,
    encoreEligible: opts.encorePlayed ?? false, encorePlayed: opts.encorePlayed ?? false,
    encoreMomentumSwing: opts.encorePlayed ? 70 : null, phase: 'finished',
    currentCandidateIds: [], history: opts.history ?? [],
    recentOfferedSongIds: [], lastHandHadMythic: false,
  };
}

test('achievesTheRealThing requires authenticity=100 and at least 6 songs played', () => {
  const songs = Array.from({ length: 6 }, (_, i) => makeSong(`s${i}`));
  const state = makeState({ songs, playedSongIds: songs.map((s) => s.id) });
  assert.equal(achievesTheRealThing(state, makeReport({ authenticity: 100 })), true);
  assert.equal(achievesTheRealThing(state, makeReport({ authenticity: 99 })), false);
  const shortState = makeState({ songs: songs.slice(0, 5), playedSongIds: songs.slice(0, 5).map((s) => s.id) });
  assert.equal(achievesTheRealThing(shortState, makeReport({ authenticity: 100 })), false);
});

test('achievesNobodyLeftEarly requires audienceRetention>=90 and 6+ songs', () => {
  const songs = Array.from({ length: 6 }, (_, i) => makeSong(`s${i}`));
  const state = makeState({ songs, playedSongIds: songs.map((s) => s.id) });
  assert.equal(achievesNobodyLeftEarly(state, makeReport({ audienceRetention: 90 })), true);
  assert.equal(achievesNobodyLeftEarly(state, makeReport({ audienceRetention: 89 })), false);
});

test('achievesPackedHouse only counts Festival Side Stage or Major Theatre at audienceRetention>=80', () => {
  const report = makeReport({ audienceRetention: 85 });
  assert.equal(achievesPackedHouse(report, 'festival_side_stage'), true);
  assert.equal(achievesPackedHouse(report, 'major_theatre'), true);
  assert.equal(achievesPackedHouse(report, 'local_bar'), false);
  assert.equal(achievesPackedHouse(makeReport({ audienceRetention: 79 }), 'major_theatre'), false);
});

test('achievesTideChart requires energyCurveFit>=90', () => {
  assert.equal(achievesTideChart(makeReport({ energyCurveFit: 90 })), true);
  assert.equal(achievesTideChart(makeReport({ energyCurveFit: 89 })), false);
});

test('achievesCleanHands requires paceDiscipline=100 in a show of 8+ songs', () => {
  const songs8 = Array.from({ length: 8 }, (_, i) => makeSong(`s${i}`));
  const state8 = makeState({ songs: songs8, playedSongIds: songs8.map((s) => s.id) });
  assert.equal(achievesCleanHands(state8, makeReport({ paceDiscipline: 100 })), true);
  assert.equal(achievesCleanHands(state8, makeReport({ paceDiscipline: 99 })), false);
  const songs7 = songs8.slice(0, 7);
  const state7 = makeState({ songs: songs7, playedSongIds: songs7.map((s) => s.id) });
  assert.equal(achievesCleanHands(state7, makeReport({ paceDiscipline: 100 })), false);
});

test('achievesSomewhereElseEntirely requires emotionalJourney>=90', () => {
  assert.equal(achievesSomewhereElseEntirely(makeReport({ emotionalJourney: 90 })), true);
  assert.equal(achievesSomewhereElseEntirely(makeReport({ emotionalJourney: 89 })), false);
});

test('achievesTheTurnaround requires a genuine mid-show dip below 40 AND a finish >=70 — never approximated from the final score alone', () => {
  const songs = [makeSong('s0'), makeSong('s1'), makeSong('s2')];
  const dippedHistory = [makeHistoryEntry('s0', 60), makeHistoryEntry('s1', 25), makeHistoryEntry('s2', 75)];
  const stateWithDip = makeState({ songs, playedSongIds: ['s0', 's1', 's2'], history: dippedHistory });
  assert.equal(achievesTheTurnaround(stateWithDip, makeReport({ audienceRetention: 75 })), true);

  // Same final score, but the show never actually dipped below 40 — must not fire.
  const flatHistory = [makeHistoryEntry('s0', 60), makeHistoryEntry('s1', 65), makeHistoryEntry('s2', 75)];
  const stateWithoutDip = makeState({ songs, playedSongIds: ['s0', 's1', 's2'], history: flatHistory });
  assert.equal(achievesTheTurnaround(stateWithoutDip, makeReport({ audienceRetention: 75 })), false);

  // Dipped but never recovered enough — must not fire.
  assert.equal(achievesTheTurnaround(stateWithDip, makeReport({ audienceRetention: 65 })), false);
});

test('achievesDugDeep requires 3+ Rare-or-rarer songs actually played', () => {
  const songs = [
    makeSong('s0', { liveTier: 'Rare' }), makeSong('s1', { liveTier: 'Legendary' }), makeSong('s2', { liveTier: 'Mythic' }),
    makeSong('s3', { liveTier: 'Frequent' }),
  ];
  assert.equal(achievesDugDeep(makeState({ songs, playedSongIds: ['s0', 's1', 's2'] })), true);
  assert.equal(achievesDugDeep(makeState({ songs, playedSongIds: ['s0', 's1', 's3'] })), false);
});

test('achievesFirstTimeForEverything requires an actually-played Mythic song', () => {
  const songs = [makeSong('s0', { liveTier: 'Mythic' }), makeSong('s1', { liveTier: 'Legendary' })];
  assert.equal(achievesFirstTimeForEverything(makeState({ songs, playedSongIds: ['s0'] })), true);
  assert.equal(achievesFirstTimeForEverything(makeState({ songs, playedSongIds: ['s1'] })), false);
});

test('achievesFullCatalog requires diversity>=90, 8+ songs, and 5+ distinct albums played', () => {
  const songs = Array.from({ length: 8 }, (_, i) => makeSong(`s${i}`, { albumId: `album-${i % 5}` }));
  const state = makeState({ songs, playedSongIds: songs.map((s) => s.id) });
  assert.equal(achievesFullCatalog(state, makeReport({ diversity: 90 })), true);
  assert.equal(achievesFullCatalog(state, makeReport({ diversity: 89 })), false);
  const fewAlbumSongs = Array.from({ length: 8 }, (_, i) => makeSong(`s${i}`, { albumId: 'only-one-album' }));
  const fewAlbumState = makeState({ songs: fewAlbumSongs, playedSongIds: fewAlbumSongs.map((s) => s.id) });
  assert.equal(achievesFullCatalog(fewAlbumState, makeReport({ diversity: 90 })), false);
});

test('achievesOneMore mirrors state.encorePlayed exactly', () => {
  const songs = [makeSong('s0')];
  assert.equal(achievesOneMore(makeState({ songs, playedSongIds: ['s0'], encorePlayed: true })), true);
  assert.equal(achievesOneMore(makeState({ songs, playedSongIds: ['s0'], encorePlayed: false })), false);
});

test('achievesExitThroughTheRoof requires encoreQuality>=85', () => {
  assert.equal(achievesExitThroughTheRoof(makeReport({ encoreQuality: 85 })), true);
  assert.equal(achievesExitThroughTheRoof(makeReport({ encoreQuality: 84 })), false);
});

test('achievesOffBook/achievesTopOfTheMarquee require the matching stage AND at least 1 star', () => {
  assert.equal(achievesOffBook('rehearsal_room', 1), true);
  assert.equal(achievesOffBook('rehearsal_room', 0), false);
  assert.equal(achievesOffBook('local_bar', 1), false);
  assert.equal(achievesTopOfTheMarquee('major_theatre', 1), true);
  assert.equal(achievesTopOfTheMarquee('major_theatre', 0), false);
});

test('achievesNoNotes requires 3 stars exactly (or more, though the game never awards more than 3)', () => {
  assert.equal(achievesNoNotes(3), true);
  assert.equal(achievesNoNotes(2), false);
});

test('achievesShowedUp mirrors the official-attempt flag exactly', () => {
  assert.equal(achievesShowedUp(true), true);
  assert.equal(achievesShowedUp(false), false);
});

test('achievesHouseFavorite requires Festival Side Stage, 3 stars, AND rarityExcitement>=70', () => {
  const report = makeReport({ rarityExcitement: 70 });
  assert.equal(achievesHouseFavorite('festival_side_stage', 3, report), true);
  assert.equal(achievesHouseFavorite('festival_side_stage', 2, report), false);
  assert.equal(achievesHouseFavorite('major_theatre', 3, report), false);
  assert.equal(achievesHouseFavorite('festival_side_stage', 3, makeReport({ rarityExcitement: 69 })), false);
});

test('achievesFriendOfTheFloor requires every faction to end with strictly positive momentum', () => {
  const songs = [makeSong('s0')];
  const allPositive = makeState({ songs, playedSongIds: ['s0'], factionMomentum: { casual: 1, hardcore: 1, deepCut: 1, progHeads: 1, firstTimers: 1 } });
  assert.equal(achievesFriendOfTheFloor(allPositive), true);
  const oneZero = makeState({ songs, playedSongIds: ['s0'], factionMomentum: { casual: 0, hardcore: 1, deepCut: 1, progHeads: 1, firstTimers: 1 } });
  assert.equal(achievesFriendOfTheFloor(oneZero), false);
});

test('achievesSpeaksFluentHunter/achievesOpenDoorPolicy require the matching Daily context AND the relevant faction at the high momentum band', () => {
  const songs = [makeSong('s0')];
  const hunterState = makeState({ songs, playedSongIds: ['s0'], factionMomentum: { deepCut: 45, casual: 0, hardcore: 0, progHeads: 0, firstTimers: 0 } });
  assert.equal(achievesSpeaksFluentHunter(hunterState, 'hardcore_crowd'), true);
  assert.equal(achievesSpeaksFluentHunter(hunterState, 'standard'), false);
  assert.equal(achievesSpeaksFluentHunter(makeState({ songs, playedSongIds: ['s0'], factionMomentum: { deepCut: 44 } }), 'hardcore_crowd'), false);

  const newcomerState = makeState({ songs, playedSongIds: ['s0'], factionMomentum: { firstTimers: 45, casual: 0, hardcore: 0, deepCut: 0, progHeads: 0 } });
  assert.equal(achievesOpenDoorPolicy(newcomerState, 'newcomer_friendly'), true);
  assert.equal(achievesOpenDoorPolicy(newcomerState, 'standard'), false);
});

test('evaluateSingleShowAchievements returns a result for every documented achievement, with none met on a bland default show', () => {
  const songs = [makeSong('s0'), makeSong('s1')];
  const state = makeState({ songs, playedSongIds: ['s0', 's1'] });
  const results = evaluateSingleShowAchievements(state, makeReport());
  assert.equal(results.length, 20);
  assert.ok(results.every((r) => r.met === false), 'a bland default show should not accidentally satisfy any achievement');
  const ids = results.map((r) => r.id);
  assert.deepEqual(new Set(ids).size, ids.length, 'no duplicate achievement ids');
});

test('evaluateSingleShowAchievements picks up mode-specific context when provided', () => {
  const songs = [makeSong('s0')];
  const state = makeState({ songs, playedSongIds: ['s0'] });
  const results = evaluateSingleShowAchievements(state, makeReport(), { stageKey: 'rehearsal_room', stars: 1 });
  const offBook = results.find((r) => r.id === 18)!;
  assert.equal(offBook.met, true);
});
