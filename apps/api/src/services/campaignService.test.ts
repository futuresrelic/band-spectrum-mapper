/**
 * Headliner Campaign — tests for the pure logic in campaignService.ts
 * (stage readiness, objective feasibility, star computation) via node:test.
 *
 * These deliberately exercise only the functions that touch no database —
 * `checkStageReadiness`, `isObjectiveFeasible`, and `computeStars` are all
 * pure. The Prisma-backed functions (getLadder, finalizeCampaignRun, etc.)
 * are not covered here since this sandbox has no live database connection;
 * their correctness rests on the same TypeScript/query-shape verification
 * already applied via `npm run typecheck`. See the Phase Z.17.10 report's
 * "known limitations" for the honest scope of what could be exercised.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkStageReadiness, isObjectiveFeasible, computeStars } from './campaignService.js';
import { CAMPAIGN_STAGES } from './campaignStages.js';
import type { RecoveredCatalogEntry } from './campaignEligibilityService.js';
import type { ConcertReport, EngineState, ScoreMetric, ShowBundle, EngineSong, Axis } from './concertEngine.js';
import { DEFAULT_SHOW_RULES } from './concertEngine.js';

function catalogEntry(overrides: Partial<RecoveredCatalogEntry> = {}): RecoveredCatalogEntry {
  return {
    songId: 's1', title: 'Song', durationSeconds: 240, albumId: 'a1', liveTier: 'Frequent',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// checkStageReadiness — the "explain exactly what's missing" rule
// ---------------------------------------------------------------------------

test('checkStageReadiness: 0 recovered songs is never eligible and names the exact shortfall', () => {
  const stage = CAMPAIGN_STAGES.local_bar; // requires 5 songs / 15 min
  const r = checkStageReadiness(stage, 'TOOL', []);
  assert.equal(r.eligible, false);
  assert.equal(r.missingSongs, 5);
  assert.ok(r.message?.includes('recovered 0 TOOL song'));
  assert.ok(r.message?.includes('Local Bar requires at least 5 songs'));
});

test('checkStageReadiness: a few recovered songs below the requirement stays ineligible with an exact count', () => {
  const stage = CAMPAIGN_STAGES.local_bar;
  const catalog = [
    catalogEntry({ songId: 's1', durationSeconds: 200 }),
    catalogEntry({ songId: 's2', durationSeconds: 200 }),
    catalogEntry({ songId: 's3', durationSeconds: 200 }),
    catalogEntry({ songId: 's4', durationSeconds: 200 }),
  ]; // 4 songs, under the 5-song requirement
  const r = checkStageReadiness(stage, 'TOOL', catalog);
  assert.equal(r.eligible, false);
  assert.equal(r.missingSongs, 1);
  assert.ok(r.message?.includes('recovered 4 TOOL songs'));
});

test('checkStageReadiness: enough songs and duration is eligible', () => {
  const stage = CAMPAIGN_STAGES.rehearsal_room; // requires 3 songs, 0 min
  const catalog = [catalogEntry({ songId: 's1' }), catalogEntry({ songId: 's2' }), catalogEntry({ songId: 's3' })];
  const r = checkStageReadiness(stage, 'TOOL', catalog);
  assert.equal(r.eligible, true);
  assert.equal(r.message, null);
});

test('checkStageReadiness: song count can be enough while duration still falls short', () => {
  const stage = CAMPAIGN_STAGES.local_bar; // requires 5 songs AND 15 min
  const catalog = Array.from({ length: 6 }, (_, i) => catalogEntry({ songId: `s${i}`, durationSeconds: 60 })); // 6 songs but only 6 min total
  const r = checkStageReadiness(stage, 'TOOL', catalog);
  assert.equal(r.missingSongs, 0);
  assert.equal(r.eligible, false);
  assert.ok(r.missingDurationSeconds > 0);
});

// ---------------------------------------------------------------------------
// isObjectiveFeasible — never require an objective the player's catalog can't reach
// ---------------------------------------------------------------------------

test('isObjectiveFeasible: minAlbumsRepresented is infeasible with too few distinct recovered albums', () => {
  const objective = { key: 'albums-3', type: 'minAlbumsRepresented' as const, count: 3, label: '' };
  const catalog = [catalogEntry({ albumId: 'a1' }), catalogEntry({ songId: 's2', albumId: 'a1' })]; // only 1 album
  assert.equal(isObjectiveFeasible(objective, catalog), false);
});

test('isObjectiveFeasible: minAlbumsRepresented is feasible once enough distinct albums are recovered', () => {
  const objective = { key: 'albums-2', type: 'minAlbumsRepresented' as const, count: 2, label: '' };
  const catalog = [catalogEntry({ albumId: 'a1' }), catalogEntry({ songId: 's2', albumId: 'a2' })];
  assert.equal(isObjectiveFeasible(objective, catalog), true);
});

test('isObjectiveFeasible: playRareOrBelow is infeasible with no Rare-or-rarer recovered song', () => {
  const objective = { key: 'rarity', type: 'playRareOrBelow' as const, label: '' };
  const catalog = [catalogEntry({ liveTier: 'Frequent' }), catalogEntry({ songId: 's2', liveTier: 'Essential' })];
  assert.equal(isObjectiveFeasible(objective, catalog), false);
});

test('isObjectiveFeasible: playRareOrBelow is feasible once a Rare+ song is recovered', () => {
  const objective = { key: 'rarity', type: 'playRareOrBelow' as const, label: '' };
  const catalog = [catalogEntry({ liveTier: 'Legendary' })];
  assert.equal(isObjectiveFeasible(objective, catalog), true);
});

// ---------------------------------------------------------------------------
// computeStars
// ---------------------------------------------------------------------------

function makeReport(opts: { overallScore: number; metrics?: Partial<Record<ScoreMetric, number>> }): ConcertReport {
  const metrics: Record<ScoreMetric, number> = {
    spectrumMatch: 50, energyCurveFit: 50, emotionalJourney: 50, audienceRetention: 50,
    rarityExcitement: 50, diversity: 50, authenticity: 50, encoreQuality: 0,
    paceDiscipline: 50, crowdPeak: 50,
    ...(opts.metrics ?? {}),
  };
  return {
    metrics, overallScore: opts.overallScore, highlights: [], reviewText: '',
    usedFallbackData: false, fallbackSongCount: 0,
  };
}

function makeSong(id: string, albumId: string | null, liveTier: EngineSong['liveTier'] = 'Frequent'): EngineSong {
  const axis: Record<Axis, number> = { aggression: 5, complexity: 5, atmosphere: 5, emotion: 5, psychedelic: 5, concept: 5 };
  return {
    id, title: id, albumId, albumTitle: albumId, durationSeconds: 200, axis, tempoEnergy: 5,
    audience: {
      progressive: 50, heavy: 50, technical: 50, atmospheric: 50, experimental: 50,
      accessible: 50, psychedelic: 50, emotional: 50, aggressive: 50, improvisational: 50,
    },
    audienceIsFallback: false, liveTier, liveSource: 'live', liveValue: 30,
  };
}

function makeState(playedSongIds: string[], songs: EngineSong[], encorePlayed = false): EngineState {
  const bundle: ShowBundle = {
    bandId: 'b1', bandName: 'Test Band', songs,
    targetSpectrum: { aggression: 5, complexity: 5, atmosphere: 5, emotion: 5, psychedelic: 5, concept: 5 },
    venue: null, showLengthBudgetSeconds: 1200, rules: DEFAULT_SHOW_RULES,
  };
  return {
    bundle, seed: 'x', stepIndex: 0, playedSongIds, elapsedSeconds: 0,
    runningSpectrumSum: { aggression: 0, complexity: 0, atmosphere: 0, emotion: 0, psychedelic: 0, concept: 0 },
    runningSpectrumCount: 0, factionMomentum: { casual: 0, hardcore: 0, deepCut: 0, progHeads: 0, firstTimers: 0 },
    crowdPeak: 0, recentAxisWindow: [], recentAlbumWindow: [], pacingPenaltyTotal: 0, fallbackSongCount: 0,
    encoreEligible: encorePlayed, encorePlayed, encoreMomentumSwing: encorePlayed ? 70 : null, phase: 'finished',
  };
}

test('computeStars: rehearsal_room (no objectives) awards 1 star once the score clears the low bar', () => {
  const stage = CAMPAIGN_STAGES.rehearsal_room;
  const report = makeReport({ overallScore: 150, metrics: { audienceRetention: 60 } });
  const songs = [makeSong('s1', 'a1'), makeSong('s2', 'a1'), makeSong('s3', 'a1')];
  const state = makeState(['s1', 's2', 's3'], songs);
  const { stars } = computeStars(stage, report, state, new Set());
  assert.equal(stars, 1);
});

test('computeStars: a low score earns 0 stars', () => {
  const stage = CAMPAIGN_STAGES.rehearsal_room;
  const report = makeReport({ overallScore: 10 });
  const songs = [makeSong('s1', 'a1')];
  const state = makeState(['s1'], songs);
  const { stars } = computeStars(stage, report, state, new Set());
  assert.equal(stars, 0);
});

test('computeStars: 3 stars requires all FEASIBLE objectives met, but infeasible ones never block it', () => {
  const stage = CAMPAIGN_STAGES.small_theatre; // spectrum-60, albums-3, rarity objectives
  const songs = [
    makeSong('s1', 'a1', 'Legendary'), makeSong('s2', 'a2'), makeSong('s3', 'a1'),
    makeSong('s4', 'a2'), makeSong('s5', 'a1'), makeSong('s6', 'a2'),
  ];
  const state = makeState(['s1', 's2', 's3', 's4', 's5', 's6'], songs, true);
  const report = makeReport({
    overallScore: 800,
    metrics: { spectrumMatch: 90, authenticity: 90, audienceRetention: 90, encoreQuality: 90 },
  });
  // Only 'rarity' and 'spectrum-60' were feasible given the recovered catalog — 'albums-3'
  // was infeasible (catalog only spans 2 albums in this fixture) and must NOT block 3 stars.
  const feasible = new Set(['rarity', 'spectrum-60']);
  const { stars, objectiveResults } = computeStars(stage, report, state, feasible);
  assert.equal(stars, 3);
  const albumsResult = objectiveResults.find((o) => o.key === 'albums-3')!;
  assert.equal(albumsResult.wasRequired, false);
});

test('computeStars: 3 stars is denied when a FEASIBLE objective was not met', () => {
  const stage = CAMPAIGN_STAGES.small_theatre;
  const songs = [makeSong('s1', 'a1', 'Frequent'), makeSong('s2', 'a1'), makeSong('s3', 'a1')]; // no rarity, one album
  const state = makeState(['s1', 's2', 's3'], songs, true);
  const report = makeReport({
    overallScore: 800,
    metrics: { spectrumMatch: 90, authenticity: 90, audienceRetention: 90, encoreQuality: 90 },
  });
  const feasible = new Set(['rarity', 'spectrum-60', 'albums-3']); // all marked feasible, but rarity/albums weren't actually achieved
  const { stars } = computeStars(stage, report, state, feasible);
  assert.ok(stars < 3);
});

test('computeStars: never awards more than 3 stars', () => {
  const stage = CAMPAIGN_STAGES.major_theatre;
  const songs = Array.from({ length: 12 }, (_, i) => makeSong(`s${i}`, `a${i}`, 'Mythic'));
  const state = makeState(songs.map((s) => s.id), songs, true);
  const report = makeReport({
    overallScore: 999,
    metrics: { spectrumMatch: 100, authenticity: 100, audienceRetention: 100, encoreQuality: 100 },
  });
  const feasible = new Set(stage.objectives.map((o) => o.key));
  const { stars } = computeStars(stage, report, state, feasible);
  assert.ok(stars <= 3);
});
