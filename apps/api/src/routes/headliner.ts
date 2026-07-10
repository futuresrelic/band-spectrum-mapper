/**
 * Headliner — routes (Phase Z.17.9)
 *
 * A completely standalone player-owned game — no relation to Band RPG's own
 * concert/festival/tour routes. Every route here is PLAYER-tier
 * (requireAuth + requireOwner), per the Z.17.6 permission model.
 *
 * Phase 1 scope: Quick Show only (full catalog, no recovery requirement).
 * Campaign and Daily Challenge are architecture-only — see
 * docs/proposals/CONCERT_ARCHITECT.md.
 */

import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireAuth, requireOwner } from '../middleware/permissions.js';
import { HttpError } from '../middleware/errorHandler.js';
import { buildShowBundle, checkBandEligibility } from '../services/concertDataService.js';
import { getCampaignEligibilitySummary } from '../services/campaignEligibilityService.js';
import {
  createInitialState, generateCandidates, applyPick, buildReport,
  isMainSetComplete, resolveEncoreEligibility, generateEncoreCandidates,
  applyEncorePick, skipEncore,
  type EngineState,
} from '../services/concertEngine.js';

export const headlinerRouter = Router();

const CONCERT_MODES = ['quick', 'daily', 'campaign', 'historical'] as const;
type ConcertMode = (typeof CONCERT_MODES)[number];

const startRunSchema = z.object({
  bandId: z.string().min(1),
  venueId: z.string().min(1).nullable().optional(),
  mode: z.enum(CONCERT_MODES).default('quick'),
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

// GET /api/headliner/campaign/:bandId — recovered-song count for the Campaign "coming soon" card
headlinerRouter.get('/campaign/:bandId', requireAuth, async (req, res, next) => {
  try {
    const userId = req.user!.userId;
    const bandId = req.params['bandId']!;
    const summary = await getCampaignEligibilitySummary(userId, bandId);
    res.json(summary);
    return;
  } catch (e) { next(e); }
});

// POST /api/headliner/runs — start a Quick Show run
headlinerRouter.post('/runs', requireAuth, async (req, res, next) => {
  try {
    const userId = req.user!.userId;
    const body = startRunSchema.parse(req.body);

    if (body.mode !== 'quick') {
      throw new HttpError(422, `Headliner mode "${body.mode}" is not playable yet — only Quick Show is available in this phase.`);
    }

    const bundle = await buildShowBundle(body.bandId, body.venueId ?? null);
    const seed = `${userId}:${body.bandId}:${Date.now()}:${Math.random().toString(36).slice(2)}`;
    // Date.now()/Math.random() are used ONLY to mint a fresh, unpredictable seed
    // string once at run creation — never inside the deterministic engine itself.
    const state = createInitialState(bundle, seed);

    const run = await prisma.concertRun.create({
      data: {
        userId,
        mode: body.mode,
        bandId: body.bandId,
        venueId: body.venueId ?? null,
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
      res.json({ result, report, finished: true });
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
      res.json({ result, report, finished: true });
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
