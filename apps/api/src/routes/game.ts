import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/requireAuth.js';

export const gameRouter = Router();

// ---------------------------------------------------------------------------
// GET /api/game/albums — album art pool for the quiz (requireAuth)
// ---------------------------------------------------------------------------

gameRouter.get('/albums', requireAuth, async (_req, res, next) => {
  try {
    const albums = await prisma.album.findMany({
      where: { artworkUrl: { not: null } },
      select: {
        id: true,
        title: true,
        year: true,
        artworkUrl: true,
        band: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    // Only albums with actual artwork URLs
    const withArt = albums.filter((a) => a.artworkUrl?.startsWith('http'));
    res.json(withArt);
  } catch (e) { next(e); }
});

// ---------------------------------------------------------------------------
// GET /api/game/leaderboard — top 20 scores (public)
// ---------------------------------------------------------------------------

gameRouter.get('/leaderboard', async (_req, res, next) => {
  try {
    const scores = await prisma.gameScore.findMany({
      take: 20,
      orderBy: { score: 'desc' },
      include: {
        user: { select: { id: true, name: true, avatarUrl: true } },
      },
    });
    res.json(scores);
  } catch (e) { next(e); }
});

// ---------------------------------------------------------------------------
// POST /api/game/scores — save a completed game score (requireAuth)
// ---------------------------------------------------------------------------

gameRouter.post('/scores', requireAuth, async (req, res, next) => {
  try {
    const userId = req.user?.userId;
    if (!userId) { res.status(401).json({ error: 'Unauthorized' }); return; }

    const { score, level, duration } = req.body as {
      score?: unknown; level?: unknown; duration?: unknown;
    };

    if (typeof score !== 'number' || score < 0 || score > 100000) {
      res.status(400).json({ error: 'score must be a number 0–100000' }); return;
    }
    if (typeof level !== 'number' || level < 1) {
      res.status(400).json({ error: 'level must be a positive number' }); return;
    }
    if (typeof duration !== 'number' || duration < 1) {
      res.status(400).json({ error: 'duration must be a positive number' }); return;
    }

    const saved = await prisma.gameScore.create({
      data: {
        userId,
        score: Math.floor(score),
        level: Math.floor(level),
        duration: Math.floor(duration),
      },
    });

    // Compute rank
    const rank = await prisma.gameScore.count({ where: { score: { gt: saved.score } } });

    res.status(201).json({ ok: true, id: saved.id, rank: rank + 1 });
  } catch (e) { next(e); }
});
