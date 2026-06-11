import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/requireAuth.js';

export const graphHuntRouter = Router();

// POST /api/graph-hunt/scores — auth required
graphHuntRouter.post('/scores', requireAuth, async (req, res, next): Promise<void> => {
  try {
    const userId = req.user?.userId;
    if (!userId) { res.status(401).json({ error: 'Unauthorized' }); return; }
    const { score, moves, timeSec, bandIds } = req.body as { score?: unknown; moves?: unknown; timeSec?: unknown; bandIds?: unknown };
    if (typeof score !== 'number' || score < 0) { res.status(400).json({ error: 'Invalid score' }); return; }
    const safeBandScope = Array.isArray(bandIds)
      ? bandIds.filter((x): x is string => typeof x === 'string').join(',') || null
      : null;
    const saved = await prisma.graphHuntScore.create({
      data: {
        userId,
        score: Math.floor(score),
        moves: typeof moves === 'number' ? Math.max(0, Math.floor(moves)) : 0,
        timeSec: typeof timeSec === 'number' ? Math.max(0, Math.floor(timeSec)) : 0,
        ...(safeBandScope ? { bandScope: safeBandScope } : {}),
      },
    });
    const rank = await prisma.graphHuntScore.count({ where: { score: { gt: saved.score } } });
    res.status(201).json({ ok: true, score: saved.score, rank: rank + 1 });
  } catch (e) { next(e); }
});

// GET /api/graph-hunt/scores — public leaderboard
graphHuntRouter.get('/scores', async (req, res, next): Promise<void> => {
  try {
    const limit = Math.min(50, parseInt(typeof req.query['limit'] === 'string' ? req.query['limit'] : '15', 10) || 15);
    const scores = await prisma.graphHuntScore.findMany({
      orderBy: { score: 'desc' },
      take: limit,
      select: { id: true, score: true, moves: true, timeSec: true, createdAt: true, user: { select: { name: true, avatarUrl: true } } },
    });
    res.json(scores.map((s, i) => ({ rank: i + 1, playerName: s.user.name ?? 'Anonymous', avatarUrl: s.user.avatarUrl, score: s.score, moves: s.moves, timeSec: s.timeSec, createdAt: s.createdAt })));
  } catch (e) { next(e); }
});
