/**
 * Headliner — routes (Phase Z.17.9, extended Z.17.10 for Campaign)
 *
 * A completely standalone player-owned game — no relation to Band RPG's own
 * concert/festival/tour routes. Every route here is PLAYER-tier
 * (requireAuth + requireOwner), per the Z.17.6 permission model.
 *
 * Quick Show: full catalog, no recovery requirement. Campaign: candidate
 * pool restricted to BandRpgCollectedSong (Band RPG's Collection) — see
 * campaignService.ts. Daily Challenge is still architecture-only — see
 * docs/proposals/CONCERT_ARCHITECT.md.
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
  createInitialState, generateCandidates, applyPick, buildReport,
  isMainSetComplete, resolveEncoreEligibility, generateEncoreCandidates,
  applyEncorePick, skipEncore,
  type EngineState, type ConcertReport,
} from '../services/concertEngine.js';
import type { ConcertRun } from '@prisma/client';
import type { StageKey } from '../services/campaignStages.js';
import type { CampaignFinishResult } from '../services/campaignService.js';

export const headlinerRouter = Router();

const CONCERT_MODES = ['quick', 'daily', 'campaign', 'historical'] as const;
type ConcertMode = (typeof CONCERT_MODES)[number];

const startRunSchema = z.object({
  bandId: z.string().min(1),
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

/** Runs Campaign scoring/progress/unlocks on finish. No-op for Quick Show runs. */
async function maybeFinalizeCampaign(
  run: ConcertRun,
  report: ConcertReport,
  state: EngineState,
): Promise<CampaignFinishResult | null> {
  if (run.mode !== 'campaign' || !run.campaignStageKey) return null;
  return finalizeCampaignRun(run.userId, run.bandId, run.id, run.campaignStageKey as StageKey, report, state);
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

// POST /api/headliner/runs — start a Quick Show or Campaign run
headlinerRouter.post('/runs', requireAuth, async (req, res, next) => {
  try {
    const userId = req.user!.userId;
    const body = startRunSchema.parse(req.body);

    if (body.mode !== 'quick' && body.mode !== 'campaign') {
      throw new HttpError(422, `Headliner mode "${body.mode}" is not playable yet.`);
    }

    let bundle;
    let campaignStageKey: string | null = null;

    if (body.mode === 'campaign') {
      if (!body.stageKey) throw new HttpError(400, 'stageKey is required to start a Campaign run');
      const { stage, recoveredSongIds } = await assertStageStartable(userId, body.bandId, body.stageKey);
      bundle = await buildCampaignShowBundle(body.bandId, recoveredSongIds, stage);
      campaignStageKey = stage.key;
    } else {
      bundle = await buildShowBundle(body.bandId, body.venueId ?? null);
    }

    const seed = `${userId}:${body.bandId}:${Date.now()}:${Math.random().toString(36).slice(2)}`;
    // Date.now()/Math.random() are used ONLY to mint a fresh, unpredictable seed
    // string once at run creation — never inside the deterministic engine itself.
    const state = createInitialState(bundle, seed);

    const run = await prisma.concertRun.create({
      data: {
        userId,
        mode: body.mode,
        bandId: body.bandId,
        venueId: body.mode === 'campaign' ? null : (body.venueId ?? null),
        campaignStageKey,
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

    res.json({ runId: run.id, state: hand.state, candidates: hand.candidates });
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
      res.json({ result, report, campaignResult, finished: true });
      return;
    }

    const result = applyPick(state, songId);
    if (!result) throw new HttpError(400, 'That song is not a valid pick right now');

    let nextState = result.state;
    const picks = [...(run.picksJson as string[]), songId];

    if (isMainSetComplete(nextState)) {
      nextState = resolveEncoreEligibility(nextState);
      if (nextState.encoreEligible) {
        const encoreHand = generateEncoreCandidates(nextState);
        nextState = encoreHand.state;
        await prisma.concertRun.update({
          where: { id: run.id },
          data: { picksJson: picks, stateJson: nextState as object },
        });
        res.json({ result, encoreCandidates: encoreHand.candidates, encoreEligible: true, finished: false });
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
      res.json({ result, report, campaignResult, finished: true });
      return;
    }

    const hand = generateCandidates(nextState);
    await prisma.concertRun.update({
      where: { id: run.id },
      data: { picksJson: picks, stateJson: hand.state as object },
    });
    res.json({ result, candidates: hand.candidates, finished: false });
    return;
  } catch (e) { next(e); }
});
