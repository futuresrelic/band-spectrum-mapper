/**
 * Headliner — routes (Phase Z.17.9, extended Z.17.10 Campaign, Z.17.11 Daily)
 *
 * A completely standalone player-owned game — no relation to Band RPG's own
 * concert/festival/tour routes. Every route here is PLAYER-tier
 * (requireAuth + requireOwner), per the Z.17.6 permission model.
 *
 * Quick Show: full catalog, no recovery requirement, per-run random seed.
 * Campaign: candidate pool restricted to BandRpgCollectedSong (Band RPG's
 * Collection) — see campaignService.ts. Daily Challenge: full catalog, one
 * shared seed per UTC date for every player — see dailyChallengeService.ts.
 * The server is the only authority on the final score in every mode: the
 * client only ever submits a songId choice, never a metric or a seed.
 */

import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireAuth, requireOwner } from '../middleware/permissions.js';
import { HttpError } from '../middleware/errorHandler.js';
import { buildShowBundle, buildCampaignShowBundle, checkBandEligibility } from '../services/concertDataService.js';
import { getCampaignEligibilitySummary, getBandsWithRecoveredSongs } from '../services/campaignEligibilityService.js';
import {
  getLadder, assertStageStartable, finalizeCampaignRun, markTutorialCompleted,
} from '../services/campaignService.js';
import {
  getOrCreateDailyChallenge, getTodayInfo, getDailyLeaderboard, finalizeDailyRun, utcDateString,
} from '../services/dailyChallengeService.js';
import {
  createInitialState, generateCandidates, applyPick, buildReport,
  isMainSetComplete, resolveEncoreEligibility, generateEncoreCandidates,
  applyEncorePick, skipEncore, ENGINE_VERSION,
  type EngineState, type ConcertReport, type ShowBundle,
} from '../services/concertEngine.js';
import { buildReactionLogForSong } from '../services/liveReactionLog.js';
import { computeConcertPulse } from '../services/concertPulse.js';
import { latestMetricsSnapshot } from '../services/concertShowHistory.js';
import type { ConcertRun } from '@prisma/client';
import type { StageKey } from '../services/campaignStages.js';
import type { CampaignFinishResult } from '../services/campaignService.js';
import type { DailyFinishResult } from '../services/dailyChallengeService.js';

export const headlinerRouter = Router();

const CONCERT_MODES = ['quick', 'daily', 'campaign', 'historical'] as const;
type ConcertMode = (typeof CONCERT_MODES)[number];

const startRunSchema = z.object({
  // bandId/venueId are ignored for mode="daily" — the server always determines
  // today's band/venue itself so every player gets the identical challenge.
  bandId: z.string().min(1).optional(),
  venueId: z.string().min(1).nullable().optional(),
  mode: z.enum(CONCERT_MODES).default('quick'),
  stageKey: z.string().min(1).optional(), // required when mode = "campaign"
});

const pickSchema = z.object({
  songId: z.string().min(1),
});

async function loadRun(runId: string) {
  const run = await prisma.concertRun.findUnique({ where: { id: runId } });
  if (!run) return null;
  return run;
}

function ownerGuard() {
  return requireOwner(async (req) => {
    const run = await loadRun(req.params['id']!);
    return run?.userId ?? null;
  });
}

/** Runs Campaign scoring/progress/unlocks on finish. No-op for Quick Show/Daily runs. */
async function maybeFinalizeCampaign(
  run: ConcertRun,
  report: ConcertReport,
  state: EngineState,
): Promise<CampaignFinishResult | null> {
  if (run.mode !== 'campaign' || !run.campaignStageKey) return null;
  return finalizeCampaignRun(run.userId, run.bandId, run.id, run.campaignStageKey as StageKey, report, state);
}

/** Verifies + records the Daily Challenge result server-side. No-op for Quick Show/Campaign runs. */
async function maybeFinalizeDaily(
  run: ConcertRun,
  report: ConcertReport,
  state: EngineState,
): Promise<DailyFinishResult | null> {
  return finalizeDailyRun(run, report, state);
}

// GET /api/headliner/bands — bands eligible for Quick Show, with a plain-language reason when not
headlinerRouter.get('/bands', requireAuth, async (req, res, next) => {
  try {
    const bands = await prisma.band.findMany({ select: { id: true, name: true }, orderBy: { name: 'asc' } });
    const results = await Promise.all(bands.map((b) => checkBandEligibility(b.id)));
    res.json({ bands: results });
    return;
  } catch (e) { next(e); }
});

// GET /api/headliner/venues — the small admin-curated venue list (BandRpgVenue), reused as-is
headlinerRouter.get('/venues', requireAuth, async (_req, res, next) => {
  try {
    const venues = await prisma.bandRpgVenue.findMany({
      select: { id: true, name: true, description: true, capacity: true },
      orderBy: { capacity: 'asc' },
    });
    res.json({ venues });
    return;
  } catch (e) { next(e); }
});

// GET /api/headliner/campaign/:bandId/summary — recovered-song count for the Campaign entry card
headlinerRouter.get('/campaign/:bandId/summary', requireAuth, async (req, res, next) => {
  try {
    const userId = req.user!.userId;
    const bandId = req.params['bandId']!;
    const summary = await getCampaignEligibilitySummary(userId, bandId);
    res.json(summary);
    return;
  } catch (e) { next(e); }
});

// GET /api/headliner/campaign/:bandId/ladder — full stage ladder + progress for the stage-select screen
headlinerRouter.get('/campaign/:bandId/ladder', requireAuth, async (req, res, next) => {
  try {
    const userId = req.user!.userId;
    const bandId = req.params['bandId']!;
    const ladder = await getLadder(userId, bandId);
    res.json(ladder);
    return;
  } catch (e) { next(e); }
});

// GET /api/headliner/campaign/bands — every band this user has recovered songs for (Campaign band-select)
headlinerRouter.get('/campaign/bands', requireAuth, async (req, res, next) => {
  try {
    const userId = req.user!.userId;
    const bands = await getBandsWithRecoveredSongs(userId);
    res.json({ bands });
    return;
  } catch (e) { next(e); }
});

// POST /api/headliner/campaign/:bandId/tutorial-complete — dismiss Rehearsal Room tutorial hints
headlinerRouter.post('/campaign/:bandId/tutorial-complete', requireAuth, async (req, res, next) => {
  try {
    const userId = req.user!.userId;
    const bandId = req.params['bandId']!;
    await markTutorialCompleted(userId, bandId);
    res.json({ ok: true });
    return;
  } catch (e) { next(e); }
});

// GET /api/headliner/daily/today — today's (UTC) challenge card + this player's official result, if any
headlinerRouter.get('/daily/today', requireAuth, async (req, res, next) => {
  try {
    const userId = req.user!.userId;
    const challengeDate = utcDateString(new Date());
    const info = await getTodayInfo(userId, challengeDate);
    res.json(info);
    return;
  } catch (e) { next(e); }
});

// GET /api/headliner/daily/leaderboard?date=YYYY-MM-DD — defaults to today (UTC). Public: canView data, no per-user fields.
headlinerRouter.get('/daily/leaderboard', async (req, res, next) => {
  try {
    const dateParam = typeof req.query['date'] === 'string' ? req.query['date'] : undefined;
    const challengeDate = dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? dateParam : utcDateString(new Date());
    const leaderboard = await getDailyLeaderboard(challengeDate);
    res.json(leaderboard ?? { challengeDate, bandName: null, venueId: null, contextKey: null, entries: [] });
    return;
  } catch (e) { next(e); }
});

// POST /api/headliner/runs — start a Quick Show, Campaign, or Daily Challenge run
headlinerRouter.post('/runs', requireAuth, async (req, res, next) => {
  try {
    const userId = req.user!.userId;
    const body = startRunSchema.parse(req.body);

    if (body.mode !== 'quick' && body.mode !== 'campaign' && body.mode !== 'daily') {
      throw new HttpError(422, `Headliner mode "${body.mode}" is not playable yet.`);
    }

    let bundle: ShowBundle;
    let bandId: string;
    let venueId: string | null = null;
    let campaignStageKey: string | null = null;
    let dailyChallengeId: string | null = null;
    let seed: string;
    let engineVersion = ENGINE_VERSION;
    let isPractice = false;

    if (body.mode === 'campaign') {
      if (!body.bandId) throw new HttpError(400, 'bandId is required to start a Campaign run');
      if (!body.stageKey) throw new HttpError(400, 'stageKey is required to start a Campaign run');
      const { stage, recoveredSongIds } = await assertStageStartable(userId, body.bandId, body.stageKey);
      bundle = await buildCampaignShowBundle(body.bandId, recoveredSongIds, stage);
      bandId = body.bandId;
      campaignStageKey = stage.key;
      seed = `${userId}:${body.bandId}:${Date.now()}:${Math.random().toString(36).slice(2)}`;
      // Date.now()/Math.random() mint a fresh, unpredictable per-run seed for Quick Show
      // and Campaign only — never inside the deterministic engine, and never for Daily,
      // where every player must share the exact same challenge seed instead.
    } else if (body.mode === 'daily') {
      const challengeDate = utcDateString(new Date());
      const challenge = await getOrCreateDailyChallenge(challengeDate);
      bundle = challenge.bundleSnapshotJson as unknown as ShowBundle;
      bandId = challenge.bandId;
      venueId = challenge.venueId;
      dailyChallengeId = challenge.id;
      seed = challenge.seed;
      engineVersion = challenge.engineVersion;
      isPractice = await prisma.headlinerDailyResult.findUnique({
        where: { challengeId_userId: { challengeId: challenge.id, userId } },
      }) !== null;
    } else {
      if (!body.bandId) throw new HttpError(400, 'bandId is required to start a Quick Show run');
      bundle = await buildShowBundle(body.bandId, body.venueId ?? null);
      bandId = body.bandId;
      venueId = body.venueId ?? null;
      seed = `${userId}:${body.bandId}:${Date.now()}:${Math.random().toString(36).slice(2)}`;
    }

    const state = createInitialState(bundle, seed);

    const run = await prisma.concertRun.create({
      data: {
        userId,
        mode: body.mode,
        bandId,
        venueId,
        campaignStageKey,
        dailyChallengeId,
        engineVersion,
        seed,
        status: 'in_progress',
        picksJson: [],
        stateJson: state as object,
      },
    });

    const hand = generateCandidates(state);
    await prisma.concertRun.update({
      where: { id: run.id },
      data: { stateJson: hand.state as object },
    });

    res.json({ runId: run.id, state: hand.state, candidates: hand.candidates, isPractice });
    return;
  } catch (e) { next(e); }
});

// GET /api/headliner/runs/:id — fetch current run state
headlinerRouter.get('/runs/:id', requireAuth, ownerGuard(), async (req, res, next) => {
  try {
    const run = await loadRun(req.params['id']!);
    if (!run) throw new HttpError(404, 'Run not found');
    res.json(run);
    return;
  } catch (e) { next(e); }
});

// POST /api/headliner/runs/:id/pick — apply a pick, return crowd reaction + next hand (or encore/finish)
headlinerRouter.post('/runs/:id/pick', requireAuth, ownerGuard(), async (req, res, next) => {
  try {
    const run = await loadRun(req.params['id']!);
    if (!run) throw new HttpError(404, 'Run not found');
    if (run.status !== 'in_progress') throw new HttpError(409, 'This run is no longer in progress');

    const { songId } = pickSchema.parse(req.body);
    const state = run.stateJson as unknown as EngineState;

    if (state.phase === 'encore') {
      const result = applyEncorePick(state, songId);
      if (!result) throw new HttpError(400, 'That song is not a valid encore pick');
      const report = buildReport(result.state);
      const reactionLog = buildReactionLogForSong(result.state);
      const pulse = computeConcertPulse(result.state, reactionLog);
      const metricsSnapshot = latestMetricsSnapshot(result.state);
      await prisma.concertRun.update({
        where: { id: run.id },
        data: {
          status: 'completed',
          picksJson: [...(run.picksJson as string[]), songId],
          stateJson: result.state as object,
          reportJson: report as object,
          overallScore: report.overallScore,
        },
      });
      const campaignResult = await maybeFinalizeCampaign(run, report, result.state);
      const dailyResult = await maybeFinalizeDaily(run, report, result.state);
      res.json({ result, report, campaignResult, dailyResult, reactionLog, pulse, metricsSnapshot, finished: true });
      return;
    }

    const result = applyPick(state, songId);
    if (!result) throw new HttpError(400, 'That song is not a valid pick right now');

    let nextState = result.state;
    const picks = [...(run.picksJson as string[]), songId];

    if (isMainSetComplete(nextState)) {
      nextState = resolveEncoreEligibility(nextState);
      const reactionLog = buildReactionLogForSong(nextState, true);
      const pulse = computeConcertPulse(nextState, reactionLog);
      const metricsSnapshot = latestMetricsSnapshot(nextState);
      if (nextState.encoreEligible) {
        const encoreHand = generateEncoreCandidates(nextState);
        nextState = encoreHand.state;
        await prisma.concertRun.update({
          where: { id: run.id },
          data: { picksJson: picks, stateJson: nextState as object },
        });
        res.json({ result, encoreCandidates: encoreHand.candidates, encoreEligible: true, reactionLog, pulse, metricsSnapshot, finished: false });
        return;
      }
      nextState = skipEncore(nextState);
      const report = buildReport(nextState);
      await prisma.concertRun.update({
        where: { id: run.id },
        data: {
          status: 'completed',
          picksJson: picks,
          stateJson: nextState as object,
          reportJson: report as object,
          overallScore: report.overallScore,
        },
      });
      const campaignResult = await maybeFinalizeCampaign(run, report, nextState);
      const dailyResult = await maybeFinalizeDaily(run, report, nextState);
      res.json({ result, report, campaignResult, dailyResult, reactionLog, pulse, metricsSnapshot, finished: true });
      return;
    }

    const reactionLog = buildReactionLogForSong(nextState);
    const pulse = computeConcertPulse(nextState, reactionLog);
    const metricsSnapshot = latestMetricsSnapshot(nextState);
    const hand = generateCandidates(nextState);
    await prisma.concertRun.update({
      where: { id: run.id },
      data: { picksJson: picks, stateJson: hand.state as object },
    });
    res.json({ result, candidates: hand.candidates, reactionLog, pulse, metricsSnapshot, finished: false });
    return;
  } catch (e) { next(e); }
});
