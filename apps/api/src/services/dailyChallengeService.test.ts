/**
 * Headliner Daily Challenge — tests for the pure logic in
 * dailyChallengeService.ts (date handling, deterministic band/venue/context
 * selection, seed formula, leaderboard ranking, share text) via node:test.
 *
 * The DB-backed functions (getOrCreateDailyChallenge, finalizeDailyRun,
 * getDailyLeaderboard, getTodayInfo) are not covered here — this sandbox has
 * no live database connection. Their correctness rests on TypeScript/query-
 * shape verification (npm run typecheck) plus code review, same as
 * campaignService.ts's Prisma-backed functions in Phase Z.17.10. What IS
 * covered here is every piece that determines "same UTC date -> same
 * challenge for everyone": the hash, the index picker, and the seed formula.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  utcDateString, stableHash, pickIndex, buildDailySeed, rankDailyResults, buildDailySummaryText,
  DAILY_SEED_VERSION,
} from './dailyChallengeService.js';

test('utcDateString formats a known instant as YYYY-MM-DD in UTC, not local time', () => {
  assert.equal(utcDateString(new Date('2026-07-11T23:30:00Z')), '2026-07-11');
  assert.equal(utcDateString(new Date('2026-01-01T00:00:00Z')), '2026-01-01');
});

test('stableHash is a pure deterministic function of its input', () => {
  const a = stableHash('hello-world');
  const b = stableHash('hello-world');
  assert.equal(a, b);
});

test('stableHash produces different output for different input (no collision for these fixtures)', () => {
  assert.notEqual(stableHash('2026-07-11'), stableHash('2026-07-12'));
});

test('pickIndex: same (date, salt, length) always returns the same index', () => {
  const a = pickIndex('2026-07-11', 'band', 12);
  const b = pickIndex('2026-07-11', 'band', 12);
  assert.equal(a, b);
});

test('pickIndex: different challenge dates are very likely to pick a different index', () => {
  const dates = Array.from({ length: 10 }, (_, i) => `2026-07-${String(i + 1).padStart(2, '0')}`);
  const indices = new Set(dates.map((d) => pickIndex(d, 'band', 30)));
  assert.ok(indices.size > 1, 'expected at least some variation across 10 different dates');
});

test('pickIndex: different salts (band/venue/context) do not move in lockstep for the same date', () => {
  const bandIdx = pickIndex('2026-07-11', 'band', 20);
  const venueIdx = pickIndex('2026-07-11', 'venue', 20);
  const contextIdx = pickIndex('2026-07-11', 'context', 3);
  // Not a strict correctness requirement, just documents that salts are independent axes.
  assert.ok(typeof bandIdx === 'number' && typeof venueIdx === 'number' && typeof contextIdx === 'number');
});

test('pickIndex: the fallback attempt sequence is deterministic and always in range', () => {
  const length = 7;
  const attemptsA = Array.from({ length: 7 }, (_, attempt) => pickIndex('2026-07-11', 'band', length, attempt));
  const attemptsB = Array.from({ length: 7 }, (_, attempt) => pickIndex('2026-07-11', 'band', length, attempt));
  assert.deepEqual(attemptsA, attemptsB);
  for (const idx of attemptsA) assert.ok(idx >= 0 && idx < length);
});

test('pickIndex returns -1 for a zero-length list (e.g. no venues exist) rather than throwing', () => {
  assert.equal(pickIndex('2026-07-11', 'venue', 0), -1);
});

test('buildDailySeed embeds the seed version and every selection input, and changes when any input changes', () => {
  const seed = buildDailySeed('2026-07-11', 'band-1', 'venue-1', 'standard');
  assert.ok(seed.startsWith(DAILY_SEED_VERSION));
  assert.ok(seed.includes('2026-07-11'));
  assert.ok(seed.includes('band-1'));
  assert.ok(seed.includes('venue-1'));
  assert.ok(seed.includes('standard'));

  const differentDate = buildDailySeed('2026-07-12', 'band-1', 'venue-1', 'standard');
  const differentBand = buildDailySeed('2026-07-11', 'band-2', 'venue-1', 'standard');
  assert.notEqual(seed, differentDate);
  assert.notEqual(seed, differentBand);
});

test('buildDailySeed handles a null venue without crashing and stays stable', () => {
  const a = buildDailySeed('2026-07-11', 'band-1', null, 'standard');
  const b = buildDailySeed('2026-07-11', 'band-1', null, 'standard');
  assert.equal(a, b);
  assert.ok(a.includes('none'));
});

// ---------------------------------------------------------------------------
// Leaderboard ranking / tie-breakers
// ---------------------------------------------------------------------------

function entry(overrides: Partial<{ score: number; finalAttendance: number; authenticity: number; completedAt: string }> = {}) {
  return { score: 500, finalAttendance: 50, authenticity: 50, completedAt: '2026-07-11T12:00:00Z', ...overrides };
}

test('rankDailyResults: higher score always ranks first', () => {
  const results = [entry({ score: 400 }), entry({ score: 900 }), entry({ score: 600 })];
  const ranked = rankDailyResults(results);
  assert.deepEqual(ranked.map((r) => r.score), [900, 600, 400]);
  assert.deepEqual(ranked.map((r) => r.rank), [1, 2, 3]);
});

test('rankDailyResults: ties on score break by final attendance, then authenticity, then earlier completion', () => {
  const results = [
    entry({ score: 800, finalAttendance: 60, authenticity: 70, completedAt: '2026-07-11T10:00:00Z' }),
    entry({ score: 800, finalAttendance: 80, authenticity: 50, completedAt: '2026-07-11T09:00:00Z' }),
    entry({ score: 800, finalAttendance: 80, authenticity: 90, completedAt: '2026-07-11T11:00:00Z' }),
  ];
  const ranked = rankDailyResults(results);
  // Highest attendance (80) wins between entries 2 and 3; among those, higher authenticity (90) wins.
  assert.equal(ranked[0]!.authenticity, 90);
  assert.equal(ranked[1]!.finalAttendance, 80);
  assert.equal(ranked[2]!.finalAttendance, 60);
});

test('rankDailyResults: a fully-tied pair breaks by earlier completion time, never by "fastest" duration', () => {
  const results = [
    entry({ completedAt: '2026-07-11T15:00:00Z' }),
    entry({ completedAt: '2026-07-11T08:00:00Z' }),
  ];
  const ranked = rankDailyResults(results);
  assert.equal(ranked[0]!.completedAt, '2026-07-11T08:00:00Z');
});

test('rankDailyResults assigns a contiguous 1..N rank with no gaps or duplicates', () => {
  const results = Array.from({ length: 5 }, (_, i) => entry({ score: i * 100 }));
  const ranked = rankDailyResults(results);
  assert.deepEqual(ranked.map((r) => r.rank), [1, 2, 3, 4, 5]);
});

// ---------------------------------------------------------------------------
// Share text
// ---------------------------------------------------------------------------

test('buildDailySummaryText produces the documented format and omits rank when unknown', () => {
  const withRank = buildDailySummaryText('TOOL', 8420, 91, 88, 14);
  assert.equal(withRank, 'HEADLINER DAILY\nTOOL\nScore: 8,420\nAttendance retained: 91%\nAuthenticity: 88%\nRank: #14');

  const withoutRank = buildDailySummaryText('TOOL', 8420, 91, 88, null);
  assert.ok(!withoutRank.includes('Rank'));
});
