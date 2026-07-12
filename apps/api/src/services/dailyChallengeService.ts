/**
 * Headliner — Daily Challenge Service (Phase Z.17.11)
 *
 * One shared concert puzzle per UTC calendar date. Every player who opens
 * the same challenge date gets the exact same band, venue, crowd context,
 * and seed — frozen once at first-request time into `HeadlinerDailyChallenge`
 * so later canonical data changes (a re-scored song, a regenerated audience
 * profile) can never reshuffle a challenge that's already live or already
 * has results attached to it. This is the same "snapshot boundary" pattern
 * Quick Show and Campaign already use, applied at the challenge level
 * instead of the per-run level.
 *
 * Nothing here is part of the deterministic engine — selecting WHICH band
 * plays today is a data-service concern, not a simulation concern — but the
 * selection itself must still be a pure function of the challenge date, so
 * it's implemented as one here, deliberately separate from Math.random()/
 * Date.now(), matching the same "no uncontrolled randomness" rule the
 * engine itself follows.
 */

import { prisma } from '../lib/prisma.js';
import { HttpError } from '../middleware/errorHandler.js';
import { checkBandEligibility, buildShowBundle } from './concertDataService.js';
import {
  ENGINE_VERSION, DEFAULT_SHOW_RULES,
  type ShowBundle, type FactionId, type ConcertReport, type EngineState, type ScoreMetric,
} from './concertEngine.js';
import type { ConcertRun } from '@prisma/client';

/** Bump when the SELECTION algorithm/shape changes (band/venue/context format) — distinct from ENGINE_VERSION. */
export const DAILY_CHALLENGE_VERSION = 1;

/** Bump when the seed FORMULA itself changes — embedded in every seed string so old seeds are self-describing. */
export const DAILY_SEED_VERSION = 'HEADLINER_DAILY_V1';

export type DailyContextKey = 'standard' | 'hardcore_crowd' | 'newcomer_friendly';

export const DAILY_CONTEXTS: readonly DailyContextKey[] = ['standard', 'hardcore_crowd', 'newcomer_friendly'];

interface DailyContextConfig {
  label: string;
  description: string;
  factionShare: Record<FactionId, number>;
}

const DAILY_CONTEXT_CONFIG: Record<DailyContextKey, DailyContextConfig> = {
  standard: {
    label: 'Standard Night',
    description: 'A typical mixed crowd — no particular lean.',
    factionShare: DEFAULT_SHOW_RULES.factionShare,
  },
  hardcore_crowd: {
    label: 'Hardcore Crowd',
    description: 'The diehards showed up tonight. They know every deep cut, and they\'ll notice if you don\'t play one.',
    factionShare: { casual: 0.20, hardcore: 0.30, deepCut: 0.25, progHeads: 0.15, firstTimers: 0.10 },
  },
  newcomer_friendly: {
    label: 'Newcomer Night',
    description: 'Lots of first-timers in the crowd — this show is someone\'s introduction to the band.',
    factionShare: { casual: 0.35, hardcore: 0.10, deepCut: 0.05, progHeads: 0.10, firstTimers: 0.40 },
  },
};

/** Pure FNV-1a style hash — deterministic, no Math.random(). Distinct from the engine's own hashSeed: this picks WHICH show happens, not how it plays out. */
export function stableHash(input: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Deterministic index into an array of the given length, salted per
 * selection axis (band/venue/context) so they don't all move in lockstep,
 * with an `attempt` offset for the fallback-sequence walk. Same
 * (challengeDate, salt, length, attempt) always returns the same index —
 * this is the piece "same UTC date ⇒ same challenge" ultimately rests on.
 */
export function pickIndex(challengeDate: string, salt: string, length: number, attempt = 0): number {
  if (length === 0) return -1;
  const hash = stableHash(`${DAILY_SEED_VERSION}:${challengeDate}:${salt}`);
  return (hash + attempt) % length;
}

/** The exact, versioned seed formula every Daily run's engine seed is built from. */
export function buildDailySeed(challengeDate: string, bandId: string, venueId: string | null, contextKey: string): string {
  return `${DAILY_SEED_VERSION}:${challengeDate}:${bandId}:${venueId ?? 'none'}:${contextKey}`;
}

/** The UTC calendar date string ("YYYY-MM-DD") for a given instant. Server date is authoritative — never client-supplied. */
export function utcDateString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

interface DailyCombo {
  bandId: string;
  bandName: string;
  venueId: string | null;
  contextKey: DailyContextKey;
}

/**
 * Deterministically picks today's band/venue/context from the challenge
 * date alone. If the hash-selected band is ineligible (not enough scored
 * songs), steps forward through a fixed, deterministic fallback sequence —
 * same date always produces the same fallback path, so every player still
 * sees the same result even if this runs independently per-request.
 */
async function selectDailyCombo(challengeDate: string): Promise<DailyCombo> {
  const bands = await prisma.band.findMany({ select: { id: true, name: true }, orderBy: { id: 'asc' } });
  if (bands.length === 0) throw new HttpError(503, 'No bands exist yet — Daily Challenge cannot be generated.');

  const venues = await prisma.bandRpgVenue.findMany({ select: { id: true }, orderBy: { id: 'asc' } });

  const venueIdx = pickIndex(challengeDate, 'venue', venues.length);
  const contextIdx = pickIndex(challengeDate, 'context', DAILY_CONTEXTS.length);
  const venueId = venueIdx >= 0 ? venues[venueIdx]!.id : null;
  const contextKey = DAILY_CONTEXTS[contextIdx]!;

  for (let attempt = 0; attempt < bands.length; attempt++) {
    const bandIdx = pickIndex(challengeDate, 'band', bands.length, attempt);
    const band = bands[bandIdx]!;
    const eligibility = await checkBandEligibility(band.id);
    if (eligibility.eligible) {
      return { bandId: band.id, bandName: band.name, venueId, contextKey };
    }
  }

  throw new HttpError(503, 'No band currently has enough spectrum data for a fair Daily Challenge.');
}

export interface DailyChallengeRecord {
  id: string;
  challengeDate: string;
  version: number;
  seed: string;
  bandId: string;
  bandName: string;
  venueId: string | null;
  contextKey: string;
  difficulty: string;
  engineVersion: string;
  bundleSnapshotJson: unknown;
  createdAt: Date;
}

/**
 * Returns today's (or any date's) frozen challenge, creating it on first
 * request. Safe under concurrent first-requests: a unique constraint on
 * (challengeDate, version) means a losing concurrent create() just refetches
 * the winner's row instead of erroring.
 */
export async function getOrCreateDailyChallenge(challengeDate: string): Promise<DailyChallengeRecord> {
  const existing = await prisma.headlinerDailyChallenge.findUnique({
    where: { challengeDate_version: { challengeDate, version: DAILY_CHALLENGE_VERSION } },
  });
  if (existing) return existing;

  const combo = await selectDailyCombo(challengeDate);
  const seed = buildDailySeed(challengeDate, combo.bandId, combo.venueId, combo.contextKey);

  const baseBundle = await buildShowBundle(combo.bandId, combo.venueId);
  const context = DAILY_CONTEXT_CONFIG[combo.contextKey];
  const bundle: ShowBundle = {
    ...baseBundle,
    rules: { ...baseBundle.rules, factionShare: context.factionShare },
  };

  try {
    return await prisma.headlinerDailyChallenge.create({
      data: {
        challengeDate,
        version: DAILY_CHALLENGE_VERSION,
        seed,
        bandId: combo.bandId,
        bandName: combo.bandName,
        venueId: combo.venueId,
        contextKey: combo.contextKey,
        difficulty: 'normal',
        engineVersion: ENGINE_VERSION,
        bundleSnapshotJson: bundle as object,
      },
    });
  } catch {
    // Lost a create() race against a concurrent first request for the same date — the row now exists.
    const race = await prisma.headlinerDailyChallenge.findUnique({
      where: { challengeDate_version: { challengeDate, version: DAILY_CHALLENGE_VERSION } },
    });
    if (race) return race;
    throw new HttpError(500, 'Could not create or load today\'s Daily Challenge.');
  }
}

export function contextLabel(contextKey: string): string {
  return DAILY_CONTEXT_CONFIG[contextKey as DailyContextKey]?.label ?? contextKey;
}

export function contextDescription(contextKey: string): string {
  return DAILY_CONTEXT_CONFIG[contextKey as DailyContextKey]?.description ?? '';
}

// ---------------------------------------------------------------------------
// Result finalization — server is the only authority on the final score.
// The client never submits metrics; it only ever submits song-id choices,
// which the pick route replays through the exact same deterministic engine
// used to build the challenge. This function is called once a run's report
// has already been computed server-side (see routes/headliner.ts).
// ---------------------------------------------------------------------------

export interface DailyFinishResult {
  isOfficial: boolean;
  score: number;
  finalAttendance: number;
  satisfaction: number;
  officialScore: number | null; // the standing official score for this user+challenge, if different from this run's
  rank: number | null;
  participantCount: number;
  shareText: string;
}

function meanMetrics(metrics: Record<ScoreMetric, number>): number {
  const values = Object.values(metrics);
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/** No-op for Quick Show/Campaign runs. Only mode="daily" runs with a dailyChallengeId reach here. */
export async function finalizeDailyRun(
  run: ConcertRun,
  report: ConcertReport,
  _state: EngineState,
): Promise<DailyFinishResult | null> {
  if (run.mode !== 'daily' || !run.dailyChallengeId) return null;

  const challengeId = run.dailyChallengeId;
  const metricsFor = {
    finalAttendance: report.metrics.audienceRetention,
    satisfaction: meanMetrics(report.metrics),
    authenticity: report.metrics.authenticity,
    spectrumMatch: report.metrics.spectrumMatch,
    pacing: report.metrics.paceDiscipline,
    encoreQuality: report.metrics.encoreQuality,
  };

  let isOfficial = false;
  const existingForUser = await prisma.headlinerDailyResult.findUnique({
    where: { challengeId_userId: { challengeId, userId: run.userId } },
  });

  if (!existingForUser) {
    try {
      await prisma.headlinerDailyResult.create({
        data: {
          challengeId,
          userId: run.userId,
          concertRunId: run.id,
          score: report.overallScore,
          ...metricsFor,
        },
      });
      isOfficial = true;
    } catch {
      // Lost a create() race against a concurrent official submission from the same user —
      // treat this run as Practice rather than error; the other request's result stands.
      isOfficial = false;
    }
  }

  const standing = await prisma.headlinerDailyResult.findUnique({
    where: { challengeId_userId: { challengeId, userId: run.userId } },
  });

  const allResults = await prisma.headlinerDailyResult.findMany({ where: { challengeId } });
  const ranked = rankDailyResults(allResults);
  const myRank = ranked.find((r) => r.userId === run.userId)?.rank ?? null;

  const challenge = await prisma.headlinerDailyChallenge.findUnique({ where: { id: challengeId } });
  const shareText = challenge
    ? buildDailySummaryText(challenge.bandName, report.overallScore, metricsFor.finalAttendance, metricsFor.authenticity, myRank)
    : '';

  return {
    isOfficial,
    score: report.overallScore,
    finalAttendance: metricsFor.finalAttendance,
    satisfaction: metricsFor.satisfaction,
    officialScore: standing?.score ?? null,
    rank: myRank,
    participantCount: allResults.length,
    shareText,
  };
}

export function buildDailySummaryText(
  bandName: string,
  score: number,
  finalAttendance: number,
  authenticity: number,
  rank: number | null,
): string {
  const lines = [
    'HEADLINER DAILY',
    bandName,
    `Score: ${score.toLocaleString()}`,
    `Attendance retained: ${Math.round(finalAttendance)}%`,
    `Authenticity: ${Math.round(authenticity)}%`,
  ];
  if (rank !== null) lines.push(`Rank: #${rank}`);
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Leaderboard — ranking is a pure function of the stored results so it's
// independently testable without a database (see dailyChallengeService.test.ts).
// ---------------------------------------------------------------------------

export interface RankableDailyResult {
  score: number;
  finalAttendance: number;
  authenticity: number;
  completedAt: Date | string;
}

/**
 * Tie-break order: score desc, then attendance/retention desc, then
 * authenticity desc, then earlier completion time — never fastest gameplay
 * duration, since Headliner isn't a timed game.
 */
export function rankDailyResults<T extends RankableDailyResult>(results: T[]): (T & { rank: number })[] {
  const sorted = [...results].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (b.finalAttendance !== a.finalAttendance) return b.finalAttendance - a.finalAttendance;
    if (b.authenticity !== a.authenticity) return b.authenticity - a.authenticity;
    return new Date(a.completedAt).getTime() - new Date(b.completedAt).getTime();
  });
  return sorted.map((r, i) => ({ ...r, rank: i + 1 }));
}

export interface DailyLeaderboardEntry {
  rank: number;
  playerName: string;
  avatarUrl: string | null;
  score: number;
  finalAttendance: number;
  satisfaction: number;
  authenticity: number;
  spectrumMatch: number;
  encoreQuality: number;
  completedAt: Date;
}

export interface DailyLeaderboard {
  challengeDate: string;
  bandName: string;
  venueId: string | null;
  contextKey: string;
  entries: DailyLeaderboardEntry[];
}

export async function getDailyLeaderboard(challengeDate: string): Promise<DailyLeaderboard | null> {
  const challenge = await prisma.headlinerDailyChallenge.findUnique({
    where: { challengeDate_version: { challengeDate, version: DAILY_CHALLENGE_VERSION } },
  });
  if (!challenge) return null;

  const results = await prisma.headlinerDailyResult.findMany({
    where: { challengeId: challenge.id },
    include: { user: { select: { name: true, username: true, avatarUrl: true } } },
  });

  const ranked = rankDailyResults(results);

  return {
    challengeDate,
    bandName: challenge.bandName,
    venueId: challenge.venueId,
    contextKey: challenge.contextKey,
    entries: ranked.map((r) => ({
      rank: r.rank,
      playerName: r.user.username ?? r.user.name ?? 'Player',
      avatarUrl: r.user.avatarUrl,
      score: r.score,
      finalAttendance: r.finalAttendance,
      satisfaction: r.satisfaction,
      authenticity: r.authenticity,
      spectrumMatch: r.spectrumMatch,
      encoreQuality: r.encoreQuality,
      completedAt: r.completedAt,
    })),
  };
}

// ---------------------------------------------------------------------------
// Today card — mode-select + Daily Briefing screen data
// ---------------------------------------------------------------------------

export interface DailyTodayInfo {
  challengeDate: string;
  bandId: string;
  bandName: string;
  venueId: string | null;
  contextKey: string;
  contextLabel: string;
  contextDescription: string;
  difficulty: string;
  participantCount: number;
  myResult: {
    score: number; finalAttendance: number; authenticity: number;
    spectrumMatch: number; encoreQuality: number; rank: number | null;
  } | null;
}

export async function getTodayInfo(userId: string, challengeDate: string): Promise<DailyTodayInfo> {
  const challenge = await getOrCreateDailyChallenge(challengeDate);

  const [participantCount, myResult, allResults] = await Promise.all([
    prisma.headlinerDailyResult.count({ where: { challengeId: challenge.id } }),
    prisma.headlinerDailyResult.findUnique({ where: { challengeId_userId: { challengeId: challenge.id, userId } } }),
    prisma.headlinerDailyResult.findMany({ where: { challengeId: challenge.id } }),
  ]);

  const myRank = myResult ? rankDailyResults(allResults).find((r) => r.userId === userId)?.rank ?? null : null;

  return {
    challengeDate,
    bandId: challenge.bandId,
    bandName: challenge.bandName,
    venueId: challenge.venueId,
    contextKey: challenge.contextKey,
    contextLabel: contextLabel(challenge.contextKey),
    contextDescription: contextDescription(challenge.contextKey),
    difficulty: challenge.difficulty,
    participantCount,
    myResult: myResult
      ? {
          score: myResult.score, finalAttendance: myResult.finalAttendance, authenticity: myResult.authenticity,
          spectrumMatch: myResult.spectrumMatch, encoreQuality: myResult.encoreQuality, rank: myRank,
        }
      : null,
  };
}
