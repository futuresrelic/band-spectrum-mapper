import { Router } from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireAdmin } from '../middleware/requireAdmin.js';
import {
  getOrRefreshTokens,
  useTokens,
  submitContribution,
  listContributions,
  approveContribution,
  rejectContribution,
  type ContributionData,
} from '../services/contributionService.js';

export const contributionsRouter = Router();

// GET /api/contributions/tokens — current user's token balance
contributionsRouter.get('/tokens', requireAuth, async (req, res, next) => {
  try {
    res.json(await getOrRefreshTokens(req.user!.userId));
  } catch (e) { next(e); }
});

// POST /api/contributions — submit a contribution (costs 1 token)
contributionsRouter.post('/', requireAuth, async (req, res, next) => {
  try {
    const userId = req.user!.userId;
    const { artistName, artistMbId, data } = req.body as {
      artistName?: string;
      artistMbId?: string;
      data?: ContributionData;
    };

    if (!artistName?.trim() || !artistMbId?.trim()) {
      res.status(400).json({ error: 'artistName and artistMbId are required' });
      return;
    }
    if (!data?.albums?.length) {
      res.status(400).json({ error: 'data must include at least one album' });
      return;
    }

    // Count total songs across all albums — 1 token per song, 3/day max
    const songCount = data.albums.reduce((sum, a) => sum + (a.tracks?.length ?? 0), 0);

    // Admins bypass token check — unlimited submissions
    if (!req.user!.isAdmin) await useTokens(userId, songCount);

    const contribution = await submitContribution(userId, artistName.trim(), artistMbId.trim(), data);
    res.status(201).json(contribution);
  } catch (e) { next(e); }
});

// GET /api/contributions/mine — current user's own submissions
contributionsRouter.get('/mine', requireAuth, async (req, res, next) => {
  try {
    res.json(await listContributions({ userId: req.user!.userId }));
  } catch (e) { next(e); }
});

// GET /api/contributions — all contributions (admin)
contributionsRouter.get('/', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const status = typeof req.query['status'] === 'string' ? req.query['status'] : undefined;
    res.json(await listContributions(status !== undefined ? { status } : {}));
  } catch (e) { next(e); }
});

// POST /api/contributions/:id/approve — admin approves + auto-imports
contributionsRouter.post('/:id/approve', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const result = await approveContribution(req.params['id']!, req.user!.userId);
    res.json(result);
  } catch (e) { next(e); }
});

// POST /api/contributions/:id/reject — admin rejects with optional note
contributionsRouter.post('/:id/reject', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const { note } = req.body as { note?: string };
    await rejectContribution(req.params['id']!, req.user!.userId, note);
    res.json({ ok: true });
  } catch (e) { next(e); }
});
